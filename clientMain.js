import { pathToFileURL } from 'url';
import WebSocket from 'ws';
import {
    decodeDiagnosticMessage,
    encodeDiagnosticMessage,
    normalizeDiagnosticMessage,
} from './diagnosticBinaryCodec.js';
import {
    DEFAULT_CLIENT_KEY,
    getClientConfig,
} from './config.js';
import {
    createDiagnosticFrame,
    createReceiveStats,
    formatReceiveStats,
    getErrorMessage,
    getReconnectDelay,
    nextSequence,
    resetReportWindow,
    terminateSocket,
    toDiagnosticTableRows,
    unwrapDiagnosticFrame,
    updateReceiveStats,
    validateUInt16,
} from './until.js';

export function startDiagnosticClient(clientKey = resolveClientKey()) {
    const client = new DiagnosticClient(getClientConfig(clientKey));
    client.connect();
    return client;
}

export class DiagnosticClient {
    constructor(config) {
        validateUInt16(config.deviceId, 'deviceId');

        this.config = config;
        this.ws = null;
        this.sequence = 0;
        this.sendTimer = null;
        this.reportTimer = null;
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
        this.rxStatsByDevice = new Map();
        this.normalizedMessage = normalizeDiagnosticMessage(config.diagnosticMessage);
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

        console.log(
            'WebSocket Client ' + this.config.label +
            ' connected deviceId=' + this.config.deviceId
        );
        console.log('diagnostic items:', this.normalizedMessage.length);

        if (this.config.sendDiagnostics) {
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
            //     ' frameBytes=' + frame.length +
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

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
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
