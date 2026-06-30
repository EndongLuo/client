import { pathToFileURL } from 'url';
import WebSocket from 'ws';
import {
    decodeDiagnosticMessage,
    encodeDiagnosticMessage,
    normalizeDiagnosticMessage,
} from './diagnosticBinaryCodec.js';
import {
    DEFAULT_CLIENT_KEY,
    LORA_ROLES,
    getClientConfig,
} from './config.js';
import {
    LORA_FRAME_TYPES,
    createDiagnosticFrame,
    createLoraDiagnosticRequestFrame,
    createLoraDiagnosticResponseFrame,
    createReceiveStats,
    formatReceiveStats,
    getErrorMessage,
    getReconnectDelay,
    nextSequence,
    resetReportWindow,
    terminateSocket,
    toDiagnosticTableRows,
    unwrapDiagnosticFrame,
    unwrapLoraFrame,
    updateReceiveStats,
    validateUInt16,
} from './until.js';

export function startDiagnosticClient(clientKey = resolveClientKey()) {
    const client = new DiagnosticClient(getClientConfig(clientKey));
    client.connect();
    return client;
}

export function setLoraRole(client, role) {
    if (!client || typeof client.setLoraRole !== 'function') {
        throw new Error('setLoraRole requires a DiagnosticClient instance');
    }

    return client.setLoraRole(role);
}

export class DiagnosticClient {
    constructor(config) {
        validateUInt16(config.deviceId, 'deviceId');
        validateUInt16(config.HOSTID, 'HOSTID');

        this.config = {
            ...config,
            IDs: normalizeIds(config.IDs ?? config.ids ?? [config.deviceId]),
        };
        this.ws = null;
        this.sequence = 0;
        this.sendTimer = null;
        this.reportTimer = null;
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.pollTimer = null;
        this.pendingDiagnosticRequest = null;
        this.pollIndex = 0;
        this.reconnectAttempt = 0;
        this.rxStatsByDevice = new Map();
        this.normalizedMessage = normalizeDiagnosticMessage(config.diagnosticMessage);
        this.loraRole = this.resolveLoraRole(this.config.loraRole);
    }

    connect() {
        this.clearReconnectTimer();

        const socket = new WebSocket(this.config.url, {
            handshakeTimeout: this.config.connectTimeoutMs,
        });
        this.ws = socket;

        socket.on('open', () => {
            if (this.ws !== socket) {
                return;
            }

            this.handleOpen(socket);
        });

        socket.on('message', (data, isBinary) => {
            if (this.ws !== socket) {
                return;
            }

            this.handleMessage(data, isBinary);
        });

        socket.on('close', (code, reasonBuffer) => {
            if (this.ws !== socket) {
                return;
            }

            this.ws = null;
            this.clearConnectionTimers();
            const reason = reasonBuffer?.toString() || 'none';
            console.log('connection closed code=' + code + ' reason=' + reason);
            this.scheduleReconnect();
        });

        socket.on('error', err => {
            if (this.ws !== socket) {
                return;
            }

            console.error('WebSocket error:', getErrorMessage(err));
            terminateSocket(socket);
        });
    }

    handleOpen(socket) {
        this.reconnectAttempt = 0;
        this.clearConnectionTimers();

        this.loraRole = this.resolveLoraRole(this.config.loraRole);
        console.log(
            'WebSocket Client ' + this.config.label +
            ' connected deviceId=' + this.config.deviceId +
            ' HOSTID=' + this.config.HOSTID +
            ' role=' + this.loraRole
        );
        console.log('configured IDs:', this.config.IDs.join(', '));
        console.log('diagnostic items:', this.normalizedMessage.length);

        if (this.config.pollDiagnostics) {
            if (this.isHost()) {
                this.startDiagnosticPolling(socket);
            }
        } else if (this.config.sendDiagnostics) {
            this.sendDiagnosticFrame(socket);
            this.sendTimer = setInterval(
                () => this.sendDiagnosticFrame(socket),
                this.config.sendIntervalMs
            );
        }

        if (this.config.sendHeartbeat) {
            this.sendHeartbeat(socket);
            this.heartbeatTimer = setInterval(
                () => this.sendHeartbeat(socket),
                this.config.heartbeatIntervalMs
            );
        }

        if (this.config.reportIntervalMs > 0) {
            this.reportTimer = setInterval(
                () => this.reportReceiveStats(),
                this.config.reportIntervalMs
            );
        }
    }

    handleMessage(data, isBinary) {
        if (!isBinary) {
            console.log('text message:', data.toString());
            return;
        }

        const frame = Buffer.from(data);
        let loraFrame;
        try {
            loraFrame = unwrapLoraFrame(frame);
        } catch (err) {
            console.error('lora frame decode failed:', getErrorMessage(err));
            console.error('frame HEX:', frame.toString('hex'));
            return;
        }

        if (loraFrame) {
            this.handleLoraFrame(loraFrame, frame.length);
            return;
        }

        const {
            deviceId,
            seq,
            packet,
            headerBytes,
            isLegacy,
        } = unwrapDiagnosticFrame(frame);

        if (!packet) {
            console.error('unknown binary packet:', frame.toString('hex'));
            return;
        }

        this.handleDiagnosticPacket({
            deviceId,
            seq,
            packet,
            headerBytes,
            frameBytes: frame.length,
            isLegacy,
        });
    }

    handleLoraFrame(loraFrame, frameBytes) {
        if (loraFrame.sourceDeviceId === this.config.deviceId) {
            return;
        }
        if (loraFrame.targetDeviceId !== this.config.deviceId) {
            return;
        }

        if (loraFrame.type === LORA_FRAME_TYPES.DIAGNOSTIC_REQUEST) {
            console.log(
                'rx diagnostic request from=' + loraFrame.sourceDeviceId +
                ' to=' + loraFrame.targetDeviceId +
                ' seq=' + loraFrame.seq
            );
            this.sendDiagnosticResponseFrame(loraFrame.sourceDeviceId, loraFrame.seq);
            return;
        }

        if (loraFrame.type === LORA_FRAME_TYPES.DIAGNOSTIC_RESPONSE) {
            const matched = this.completePendingDiagnosticRequest(
                loraFrame.sourceDeviceId,
                loraFrame.seq
            );
            if (!matched) {
                console.log(
                    'rx diagnostic response without pending request device=' +
                    loraFrame.sourceDeviceId +
                    ' seq=' + loraFrame.seq
                );
            }

            this.handleDiagnosticPacket({
                deviceId: loraFrame.sourceDeviceId,
                seq: loraFrame.seq,
                packet: loraFrame.packet,
                headerBytes: loraFrame.headerBytes,
                frameBytes,
                isLegacy: false,
            });
        }
    }

    handleDiagnosticPacket({ deviceId, seq, packet, headerBytes, frameBytes, isLegacy }) {
        try {
            if (seq !== null) {
                updateReceiveStats(this.getReceiveStats(deviceId), seq, Date.now());
            }

            const message = decodeDiagnosticMessage(packet);
            const deviceText = deviceId ?? 'legacy';
            const legacyText = isLegacy ? ' legacy=true' : '';
            // console.log(
            //     'rx device=' + deviceText +
            //     ' seq=' + (seq ?? 'none') +
            //     ' frameBytes=' + frameBytes +
            //     ' headerBytes=' + headerBytes +
            //     ' payloadBytes=' + packet.length +
            //     legacyText
            // );

            if (this.config.logPacketHex) {
                console.log('------', deviceText, packet.length, 'packet hex:', packet.toString('hex'));
            }
            if (this.config.logDecodedJson) {
                // console.log('decoded JSON:', JSON.stringify({ message }, null, 2));
            }
            if (this.config.logDecodedTable) {
                // console.table(toDiagnosticTableRows(message));
            }
        } catch (err) {
            console.error('binary decode failed:', getErrorMessage(err));
            console.error('packet HEX:', packet.toString('hex'));
        }
    }

    startDiagnosticPolling(socket = this.ws) {
        if (!this.shouldPoll(socket) || this.pollTimer || this.pendingDiagnosticRequest) {
            return;
        }

        this.scheduleNextDiagnosticPoll(socket, 0);
    }

    stopDiagnosticPolling() {
        this.clearPollTimer();
        this.clearPendingDiagnosticRequest();
    }

    scheduleNextDiagnosticPoll(socket = this.ws, delayMs = 0) {
        if (!this.shouldPoll(socket)) {
            return;
        }

        this.clearPollTimer();
        const delay = Math.max(0, Number(delayMs) || 0);
        this.pollTimer = setTimeout(() => {
            this.pollTimer = null;
            this.pollNextDiagnostic(socket);
        }, delay);
    }

    pollNextDiagnostic(socket = this.ws) {
        if (!this.shouldPoll(socket) || this.pendingDiagnosticRequest) {
            return;
        }

        const targetIds = this.getPollingTargetIds();
        if (targetIds.length === 0) {
            console.log('[poll] no target IDs except current device');
            this.scheduleNextDiagnosticPoll(socket, this.config.sendIntervalMs);
            return;
        }

        const targetDeviceId = targetIds[this.pollIndex % targetIds.length];
        this.pollIndex = (this.pollIndex + 1) % targetIds.length;
        if (!this.sendDiagnosticRequest(targetDeviceId, socket)) {
            this.scheduleNextDiagnosticPoll(socket, this.config.diagnosticPollGapMs);
        }
    }

    sendDiagnosticRequest(targetDeviceId, socket = this.ws) {
        if (!socket || socket.readyState !== WebSocket.OPEN || this.pendingDiagnosticRequest) {
            return false;
        }

        const seq = this.sequence;
        this.sequence = nextSequence(this.sequence);
        const frame = createLoraDiagnosticRequestFrame({
            sourceDeviceId: this.config.deviceId,
            targetDeviceId,
            seq,
        });
        const timeoutMs = this.config.diagnosticResponseTimeoutMs;
        const timeout = setTimeout(() => {
            const pending = this.pendingDiagnosticRequest;
            if (!pending || pending.targetDeviceId !== targetDeviceId || pending.seq !== seq) {
                return;
            }

            console.warn(
                'diagnostic response timeout target=' + targetDeviceId +
                ' seq=' + seq +
                ' after=' + timeoutMs + 'ms'
            );
            this.pendingDiagnosticRequest = null;
            this.scheduleNextDiagnosticPoll(socket, this.config.diagnosticPollGapMs);
        }, timeoutMs);

        this.pendingDiagnosticRequest = {
            targetDeviceId,
            seq,
            timeout,
            socket,
            startedAt: Date.now(),
        };

        try {
            socket.send(frame, { binary: true }, err => {
                if (err) {
                    console.error('diagnostic request seq=' + seq + ' failed:', getErrorMessage(err));
                    this.clearPendingDiagnosticRequest();
                    terminateSocket(socket);
                }
            });
            console.log(
                'poll request from=' + this.config.deviceId +
                ' to=' + targetDeviceId +
                ' seq=' + seq
            );
            return true;
        } catch (err) {
            console.error('diagnostic request seq=' + seq + ' failed:', getErrorMessage(err));
            this.clearPendingDiagnosticRequest();
            terminateSocket(socket);
            return false;
        }
    }

    sendDiagnosticResponseFrame(targetDeviceId, seq, socket = this.ws) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        let packet;
        try {
            packet = encodeDiagnosticMessage(this.config.diagnosticMessage);
        } catch (err) {
            console.error('diagnostic response encode failed:', getErrorMessage(err));
            return;
        }

        const frame = createLoraDiagnosticResponseFrame({
            sourceDeviceId: this.config.deviceId,
            targetDeviceId,
            seq,
            packet,
        });

        try {
            socket.send(frame, { binary: true }, err => {
                if (err) {
                    console.error('diagnostic response seq=' + seq + ' failed:', getErrorMessage(err));
                    terminateSocket(socket);
                }
            });
            console.log(
                'sent diagnostic response from=' + this.config.deviceId +
                ' to=' + targetDeviceId +
                ' seq=' + seq +
                ' frameBytes=' + frame.length +
                ' payloadBytes=' + packet.length
            );
        } catch (err) {
            console.error('diagnostic response seq=' + seq + ' failed:', getErrorMessage(err));
            terminateSocket(socket);
        }
    }

    completePendingDiagnosticRequest(sourceDeviceId, seq) {
        const pending = this.pendingDiagnosticRequest;
        if (!pending || pending.targetDeviceId !== sourceDeviceId || pending.seq !== seq) {
            return false;
        }

        clearTimeout(pending.timeout);
        this.pendingDiagnosticRequest = null;
        console.log(
            'diagnostic response received device=' + sourceDeviceId +
            ' seq=' + seq +
            ' elapsedMs=' + (Date.now() - pending.startedAt)
        );
        this.scheduleNextDiagnosticPoll(pending.socket, this.config.diagnosticPollGapMs);
        return true;
    }

    shouldPoll(socket = this.ws) {
        return Boolean(
            this.config.pollDiagnostics &&
            this.isHost() &&
            socket &&
            socket === this.ws &&
            socket.readyState === WebSocket.OPEN
        );
    }

    getPollingTargetIds() {
        return this.config.IDs.filter(id => id !== this.config.deviceId);
    }

    setLoraRole(role = LORA_ROLES.AUTO) {
        this.config.loraRole = normalizeLoraRole(role);
        this.loraRole = this.resolveLoraRole(this.config.loraRole);
        this.stopDiagnosticPolling();

        if (this.ws?.readyState === WebSocket.OPEN && this.config.pollDiagnostics && this.isHost()) {
            this.startDiagnosticPolling(this.ws);
        }

        console.log(
            'lora role set to ' + this.loraRole +
            ' requested=' + this.config.loraRole
        );
        return this.loraRole;
    }

    resolveLoraRole(role = LORA_ROLES.AUTO) {
        const normalizedRole = normalizeLoraRole(role);
        if (normalizedRole === LORA_ROLES.AUTO) {
            return this.config.deviceId === this.config.HOSTID
                ? LORA_ROLES.HOST
                : LORA_ROLES.SLAVE;
        }

        return normalizedRole;
    }

    isHost() {
        return this.loraRole === LORA_ROLES.HOST;
    }

    sendDiagnosticFrame(socket = this.ws) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        let packet;
        try {
            packet = encodeDiagnosticMessage(this.config.diagnosticMessage);
        } catch (err) {
            console.error('diagnostic encode failed:', getErrorMessage(err));
            return;
        }

        const seq = this.sequence;
        this.sequence = nextSequence(this.sequence);
        const frame = createDiagnosticFrame({
            deviceId: this.config.deviceId,
            seq,
            packet,
        });

        try {
            socket.send(frame, { binary: true }, err => {
                if (err) {
                    console.error('send seq=' + seq + ' failed:', getErrorMessage(err));
                    terminateSocket(socket);
                }
            });
            console.log(
                'sent device=' + this.config.deviceId +
                ' seq=' + seq +
                ' frameBytes=' + frame.length +
                ' payloadBytes=' + packet.length
            );
        } catch (err) {
            console.error('send seq=' + seq + ' failed:', getErrorMessage(err));
            terminateSocket(socket);
        }
    }

    sendHeartbeat(socket = this.ws) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            socket.send(this.config.heartbeatMessage, err => {
                if (err) {
                    console.error('heartbeat send failed:', getErrorMessage(err));
                    terminateSocket(socket);
                }
            });
        } catch (err) {
            console.error('heartbeat send failed:', getErrorMessage(err));
            terminateSocket(socket);
        }
    }

    reportReceiveStats() {
        const now = Date.now();
        if (this.rxStatsByDevice.size === 0) {
            console.log('[rx-stats] no packets received');
            return;
        }

        for (const [deviceKey, stats] of this.rxStatsByDevice) {
            console.log('[rx-stats device=' + deviceKey + '] ' + formatReceiveStats(stats, now));
            resetReportWindow(stats, now);
        }
    }

    getReceiveStats(deviceId) {
        const deviceKey = deviceId ?? 'legacy';
        if (!this.rxStatsByDevice.has(deviceKey)) {
            this.rxStatsByDevice.set(deviceKey, createReceiveStats());
        }

        return this.rxStatsByDevice.get(deviceKey);
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }

        const delay = getReconnectDelay(this.reconnectAttempt, this.config);
        this.reconnectAttempt++;
        console.log('reconnecting in ' + delay + 'ms');
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    clearConnectionTimers() {
        this.clearSendTimer();
        this.clearReportTimer();
        this.clearHeartbeatTimer();
        this.clearPollTimer();
        this.clearPendingDiagnosticRequest();
    }

    clearSendTimer() {
        if (this.sendTimer) {
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }
    }

    clearReportTimer() {
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
            this.reportTimer = null;
        }
    }

    clearHeartbeatTimer() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    clearPollTimer() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    clearPendingDiagnosticRequest() {
        if (this.pendingDiagnosticRequest?.timeout) {
            clearTimeout(this.pendingDiagnosticRequest.timeout);
        }
        this.pendingDiagnosticRequest = null;
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}

function normalizeIds(ids) {
    if (!Array.isArray(ids)) {
        throw new Error('IDs must be an array');
    }

    const normalizedIds = [];
    for (const id of ids) {
        const deviceId = Number(id);
        validateUInt16(deviceId, 'IDs item');
        if (!normalizedIds.includes(deviceId)) {
            normalizedIds.push(deviceId);
        }
    }

    return Object.freeze(normalizedIds);
}

function normalizeLoraRole(role = LORA_ROLES.AUTO) {
    const normalizedRole = String(role || LORA_ROLES.AUTO).toLowerCase();
    if (normalizedRole === 'master') {
        return LORA_ROLES.HOST;
    }
    if (normalizedRole === LORA_ROLES.HOST || normalizedRole === LORA_ROLES.SLAVE) {
        return normalizedRole;
    }
    if (normalizedRole === LORA_ROLES.AUTO) {
        return LORA_ROLES.AUTO;
    }

    throw new Error('loraRole must be auto, host, slave, or master: ' + role);
}

function resolveClientKey() {
    return process.argv[2] || process.env.CLIENT_KEY || DEFAULT_CLIENT_KEY;
}

function isMainModule() {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
    startDiagnosticClient();
}
