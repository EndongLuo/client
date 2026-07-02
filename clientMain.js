import { pathToFileURL } from 'url';
import WebSocket from 'ws';
import {
    decodeDiagnosticMessage,
    encodeDiagnosticMessage,
    normalizeDiagnosticMessage,
} from './diagnosticBinaryCodec.js';
import {
    DOWNLINK_FRAME_FUNCTIONS,
    LORA_ROLES,
} from './config.js';
import {
    LORA_FRAME_TYPES,
    createDiagnosticFrame,
    createDownlinkSwitchHostFrame,
    createLoraDiagnosticRequestFrame,
    createLoraDiagnosticResponseFrame,
    createReceiveStats,
    formatReceiveStats,
    getClientConfig,
    getErrorMessage,
    getReconnectDelay,
    nextSequence,
    resetReportWindow,
    terminateSocket,
    toDiagnosticTableRows,
    unwrapDownlinkFrame,
    unwrapDiagnosticFrame,
    unwrapLoraFrame,
    updateReceiveStats,
    validateUInt16,
} from './until.js';

let activeDiagnosticClient = null;

// 启动诊断客户端，并保存当前进程内的活动实例。
export function startDiagnosticClient() {
    const client = new DiagnosticClient(getClientConfig());
    activeDiagnosticClient = client;
    client.connect();
    return client;
}

// 切换主设备；当前进程有客户端实例时先本机切换，再发送切换帧。
export function SwitchHostDevice(hostDeviceId, client = activeDiagnosticClient) {
    validateUInt16(hostDeviceId, 'hostDeviceId');

    if (client) {
        client.switchHostDevice(hostDeviceId);
        return client.sendSwitchHostDeviceFrame(hostDeviceId);
    }

    return sendSwitchHostDeviceOnce(hostDeviceId);
}

// 手动设置 LoRa 角色。
export function setLoraRole(client, role) {
    if (!client || typeof client.setLoraRole !== 'function') {
        throw new Error('setLoraRole requires a DiagnosticClient instance');
    }

    return client.setLoraRole(role);
}

// WebSocket 诊断客户端，负责收发诊断帧、下发控制帧和主从切换。
export class DiagnosticClient {
    // 创建客户端运行状态。
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
        this.diagnosticsByDevice = new Map();
        this.diagnosticData = {};
        this.normalizedMessage = normalizeDiagnosticMessage(config.diagnosticMessage);
        this.loraRole = this.resolveLoraRole(this.config.loraRole);
    }

    // 建立 WebSocket 连接并绑定事件。
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

    // 处理连接建立后的初始化动作。
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
        this.logHostState();

        this.syncDiagnosticWork();

        if (this.config.sendHeartbeat) {
            this.sendHeartbeat(socket);
            this.heartbeatTimer = setInterval(
                () => this.sendHeartbeat(socket),
                this.config.heartbeatIntervalMs
            );
        }

        // if (this.config.reportIntervalMs > 0) {
        //     this.reportTimer = setInterval(
        //         () => this.reportReceiveStats(),
        //         this.config.reportIntervalMs
        //     );
        // }
    }

    // 处理 WebSocket 收到的文本或二进制消息。
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

        let downlinkFrame;
        try {
            downlinkFrame = unwrapDownlinkFrame(frame);
        } catch (err) {
            console.error('downlink frame decode failed:', getErrorMessage(err));
            console.error('frame HEX:', frame.toString('hex'));
            return;
        }

        if (downlinkFrame) {
            this.handleDownlinkFrame(downlinkFrame);
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

    // 处理 LoRa 帧；请求帧只由目标设备应答，响应帧会被所有设备缓存。
    handleLoraFrame(loraFrame, frameBytes) {
        if (loraFrame.type === LORA_FRAME_TYPES.DIAGNOSTIC_REQUEST) {
            if (loraFrame.targetDeviceId !== this.config.deviceId) {
                return;
            }

            if (loraFrame.sourceDeviceId === this.config.deviceId) {
                return;
            }

            console.log(
                'rx diagnostic request from=' + loraFrame.sourceDeviceId +
                ' to=' + loraFrame.targetDeviceId +
                ' seq=' + loraFrame.seq
            );
            this.sendDiagnosticResponseFrame(loraFrame.sourceDeviceId, loraFrame.seq);
            return;
        }

        if (loraFrame.type === LORA_FRAME_TYPES.DIAGNOSTIC_RESPONSE) {
            if (!this.shouldStoreDevice(loraFrame.sourceDeviceId)) {
                return;
            }

            if (
                loraFrame.targetDeviceId === this.config.deviceId &&
                loraFrame.sourceDeviceId !== this.config.deviceId
            ) {
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

    // 处理下发控制帧。
    handleDownlinkFrame(downlinkFrame) {
        if (downlinkFrame.functionCode === DOWNLINK_FRAME_FUNCTIONS.SWITCH_HOST) {
            this.switchHostDevice(downlinkFrame.hostDeviceId);
            return;
        }

        if (downlinkFrame.deviceId !== this.config.deviceId) {
            console.log(
                'downlink ignored target=' + downlinkFrame.deviceId +
                ' self=' + this.config.deviceId +
                ' function=' + downlinkFrame.functionCode
            );
            return;
        }

        if (downlinkFrame.functionCode === DOWNLINK_FRAME_FUNCTIONS.TASK_CONTROL) {
            this.handleTaskControl(downlinkFrame.taskId);
            return;
        }

        if (downlinkFrame.functionCode === DOWNLINK_FRAME_FUNCTIONS.OPERATION_CONTROL) {
            this.handleOperationControl(downlinkFrame.controlId);
        }
    }

    // 处理任务控制命令。
    handleTaskControl(taskId) {
        console.log(
            'downlink task control device=' + this.config.deviceId +
            ' taskId=' + taskId
        );
    }

    // 处理操作控制命令。
    handleOperationControl(controlId) {
        console.log(
            'downlink operation control device=' + this.config.deviceId +
            ' controlId=' + controlId
        );
    }

    // 切换运行时主设备，并按新角色同步轮询状态。
    switchHostDevice(hostDeviceId) {
        validateUInt16(hostDeviceId, 'hostDeviceId');

        const previousHostId = this.config.HOSTID;
        const previousRole = this.loraRole;
        this.config.HOSTID = hostDeviceId;
        this.config.loraRole = LORA_ROLES.AUTO;
        this.loraRole = this.resolveLoraRole();
        this.syncDiagnosticWork();

        console.log(
            'host switched from=' + previousHostId +
            ' to=' + this.config.HOSTID +
            ' previousRole=' + previousRole +
            ' currentRole=' + this.loraRole
        );
        this.logHostState();

        return this.loraRole;
    }

    // 发送切换主设备下发帧。
    sendSwitchHostDeviceFrame(hostDeviceId, socket = this.ws) {
        validateUInt16(hostDeviceId, 'hostDeviceId');

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            const reason = 'switch host frame requires an open websocket';
            console.warn(reason);
            return Promise.resolve({
                sent: false,
                hostDeviceId,
                deviceId: this.config.deviceId,
                roleText: this.getRoleText(),
                reason,
            });
        }

        const frame = createDownlinkSwitchHostFrame({ hostDeviceId });
        return new Promise(resolve => {
            socket.send(frame, { binary: true }, err => {
                if (err) {
                    console.error('switch host send failed:', getErrorMessage(err));
                    resolve({
                        sent: false,
                        hostDeviceId,
                        deviceId: this.config.deviceId,
                        roleText: this.getRoleText(),
                        reason: getErrorMessage(err),
                    });
                    return;
                }

                console.log(
                    '切换主机命令已发送，目前主机切换为：' + hostDeviceId +
                    '，本机为' + this.getRoleText()
                );
                resolve({
                    sent: true,
                    hostDeviceId,
                    deviceId: this.config.deviceId,
                    roleText: this.getRoleText(),
                    frameBytes: frame.length,
                });
            });
        });
    }

    // 解码、统计并缓存收到的诊断包。
    handleDiagnosticPacket({ deviceId, seq, packet, headerBytes, frameBytes, isLegacy }) {
        try {
            if (seq !== null) {
                updateReceiveStats(this.getReceiveStats(deviceId), seq, Date.now());
            }

            const message = decodeDiagnosticMessage(packet);
            const stored = this.updateDiagnosticSnapshot({
                deviceId,
                seq,
                packet,
                message,
                headerBytes,
                frameBytes,
                isLegacy,
                source: 'remote',
            });
            const deviceText = deviceId ?? 'legacy';
            const legacyText = isLegacy ? ' legacy=true' : '';

            if (stored) {
                console.log(
                    'diagnosticData updated device=' + deviceText +
                    ' seq=' + (seq ?? 'none') +
                    ' payloadBytes=' + packet.length +
                    legacyText
                );
            }
            if (this.config.logPacketHex) {
                console.log('------', deviceText, packet.length, 'packet hex:', packet.toString('hex'));
            }
            if (this.config.logDecodedJson) {
                // console.log('decoded JSON:', JSON.stringify({ message }, null, 2));
            }
            if (this.config.logDecodedTable) {
                // console.table(toDiagnosticTableRows(message));
                void toDiagnosticTableRows;
            }
        } catch (err) {
            console.error('binary decode failed:', getErrorMessage(err));
            console.error('packet HEX:', packet.toString('hex'));
        }
    }

    // 更新指定设备的最新诊断快照。
    updateDiagnosticSnapshot({
        deviceId,
        seq,
        packet,
        message,
        headerBytes,
        frameBytes,
        isLegacy,
        source,
    }) {
        if (!this.shouldStoreDevice(deviceId)) {
            return false;
        }

        const packetBuffer = Buffer.from(packet);
        const packetHex = packetBuffer.toString('hex');
        this.diagnosticData[deviceId] = packetHex;
        this.diagnosticsByDevice.set(deviceId, {
            deviceId,
            seq,
            message,
            packet: packetBuffer,
            packetHex,
            headerBytes,
            frameBytes,
            isLegacy,
            source,
            updatedAt: Date.now(),
        });

        return true;
    }

    // 获取指定设备最新诊断快照。
    getDiagnosticSnapshot(deviceId) {
        return this.diagnosticsByDevice.get(deviceId) ?? null;
    }

    // 获取全部已缓存诊断快照。
    getAllDiagnosticSnapshots() {
        return Array.from(this.diagnosticsByDevice.values());
    }

    // 获取按设备 ID 聚合的最新诊断十六进制数据。
    getDiagnosticData() {
        return { ...this.diagnosticData };
    }

    // 判断设备是否在配置的诊断设备列表中或就是本机。
    shouldStoreDevice(deviceId) {
        return deviceId !== null &&
            deviceId !== undefined &&
            (
                this.config.IDs.includes(deviceId) ||
                deviceId === this.config.deviceId
            );
    }

    // 启动主机诊断轮询。
    startDiagnosticPolling(socket = this.ws) {
        if (!this.shouldPoll(socket) || this.pollTimer || this.pendingDiagnosticRequest) {
            return;
        }

        this.scheduleNextDiagnosticPoll(socket, 0);
    }

    // 停止主机诊断轮询。
    stopDiagnosticPolling() {
        this.clearPollTimer();
        this.clearPendingDiagnosticRequest();
    }

    // 根据角色和配置同步诊断轮询状态。
    syncDiagnosticWork() {
        this.stopDiagnosticPolling();
        this.clearSendTimer();

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        if (this.config.pollDiagnostics && this.isHost()) {
            this.startDiagnosticPolling(this.ws);
        }
    }

    // 安排下一次诊断轮询。
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

    // 轮询下一个诊断设备，轮询目标包含主设备自己。
    pollNextDiagnostic(socket = this.ws) {
        if (!this.shouldPoll(socket) || this.pendingDiagnosticRequest) {
            return;
        }

        const targetIds = this.getPollingTargetIds();
        if (targetIds.length === 0) {
            console.log('[poll] no configured target IDs');
            this.scheduleNextDiagnosticPoll(socket, this.config.sendIntervalMs);
            return;
        }

        const targetDeviceId = targetIds[this.pollIndex % targetIds.length];
        this.pollIndex = (this.pollIndex + 1) % targetIds.length;
        if (targetDeviceId === this.config.deviceId) {
            this.pollOwnDiagnostic(socket);
            return;
        }

        if (!this.sendDiagnosticRequest(targetDeviceId, socket)) {
            this.scheduleNextDiagnosticPoll(socket, this.config.diagnosticPollGapMs);
        }
    }

    // 轮询本机诊断，并用标准 LoRa 响应帧发布本机数据。
    pollOwnDiagnostic(socket = this.ws) {
        if (!this.shouldPoll(socket)) {
            return false;
        }

        const seq = this.sequence;
        this.sequence = nextSequence(this.sequence);
        const sent = this.sendDiagnosticResponseFrame(this.config.deviceId, seq, socket);
        console.log(
            'poll self diagnostic device=' + this.config.deviceId +
            ' seq=' + seq
        );
        this.scheduleNextDiagnosticPoll(socket, this.config.diagnosticPollGapMs);
        return sent;
    }

    // 向指定设备发送诊断请求。
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

    // 向请求方发送本机诊断响应。
    sendDiagnosticResponseFrame(targetDeviceId, seq, socket = this.ws) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        let packet;
        try {
            packet = encodeDiagnosticMessage(this.config.diagnosticMessage);
        } catch (err) {
            console.error('diagnostic response encode failed:', getErrorMessage(err));
            return false;
        }

        const frame = createLoraDiagnosticResponseFrame({
            sourceDeviceId: this.config.deviceId,
            targetDeviceId,
            seq,
            packet,
        });
        this.updateDiagnosticSnapshot({
            deviceId: this.config.deviceId,
            seq,
            packet,
            message: this.normalizedMessage,
            headerBytes: frame.length - packet.length,
            frameBytes: frame.length,
            isLegacy: false,
            source: 'local',
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
            return true;
        } catch (err) {
            console.error('diagnostic response seq=' + seq + ' failed:', getErrorMessage(err));
            terminateSocket(socket);
            return false;
        }
    }

    // 完成等待中的诊断请求。
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

    // 判断当前是否满足主机轮询条件。
    shouldPoll(socket = this.ws) {
        return Boolean(
            this.config.pollDiagnostics &&
            this.isHost() &&
            socket &&
            socket === this.ws &&
            socket.readyState === WebSocket.OPEN
        );
    }

    // 获取轮询目标设备，包含本机 ID。
    getPollingTargetIds() {
        const targetIds = this.config.IDs.slice();
        if (!targetIds.includes(this.config.deviceId)) {
            targetIds.unshift(this.config.deviceId);
        }

        return targetIds;
    }

    // 设置 LoRa 角色，并同步轮询状态。
    setLoraRole(role = LORA_ROLES.AUTO) {
        this.config.loraRole = normalizeLoraRole(role);
        this.loraRole = this.resolveLoraRole(this.config.loraRole);
        this.syncDiagnosticWork();

        console.log(
            'lora role set to ' + this.loraRole +
            ' requested=' + this.config.loraRole
        );
        this.logHostState();
        return this.loraRole;
    }

    // 根据配置解析实际 LoRa 角色。
    resolveLoraRole(role = LORA_ROLES.AUTO) {
        const normalizedRole = normalizeLoraRole(role);
        if (normalizedRole === LORA_ROLES.AUTO) {
            return this.config.deviceId === this.config.HOSTID
                ? LORA_ROLES.HOST
                : LORA_ROLES.SLAVE;
        }

        return normalizedRole;
    }

    // 判断当前设备是否为主机。
    isHost() {
        return this.loraRole === LORA_ROLES.HOST;
    }

    // 获取当前 LoRa 角色的中文名称。
    getRoleText() {
        return this.isHost() ? '主机' : '从机';
    }

    // 打印当前主机和本机角色。
    logHostState() {
        console.log(
            '目前主机切换为：' + this.config.HOSTID +
            '，本机为' + this.getRoleText()
        );
    }

    // 手动发送本机诊断帧，并更新本机诊断缓存。
    sendDiagnosticFrame(socket = this.ws) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        let packet;
        try {
            packet = encodeDiagnosticMessage(this.config.diagnosticMessage);
        } catch (err) {
            console.error('diagnostic encode failed:', getErrorMessage(err));
            return false;
        }

        const seq = this.sequence;
        this.sequence = nextSequence(this.sequence);
        const frame = createDiagnosticFrame({
            deviceId: this.config.deviceId,
            seq,
            packet,
        });
        this.updateDiagnosticSnapshot({
            deviceId: this.config.deviceId,
            seq,
            packet,
            message: this.normalizedMessage,
            headerBytes: frame.length - packet.length,
            frameBytes: frame.length,
            isLegacy: false,
            source: 'local',
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
            return true;
        } catch (err) {
            console.error('send seq=' + seq + ' failed:', getErrorMessage(err));
            terminateSocket(socket);
            return false;
        }
    }

    // 发送文本心跳。
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

    // 输出接收统计信息。
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

    // 获取指定设备的接收统计对象。
    getReceiveStats(deviceId) {
        const deviceKey = deviceId ?? 'legacy';
        if (!this.rxStatsByDevice.has(deviceKey)) {
            this.rxStatsByDevice.set(deviceKey, createReceiveStats());
        }

        return this.rxStatsByDevice.get(deviceKey);
    }

    // 安排断线重连。
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

    // 清理连接相关定时器和等待中的请求。
    clearConnectionTimers() {
        this.clearSendTimer();
        this.clearReportTimer();
        this.clearHeartbeatTimer();
        this.clearPollTimer();
        this.clearPendingDiagnosticRequest();
    }

    // 清理本机诊断发送定时器。
    clearSendTimer() {
        if (this.sendTimer) {
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }
    }

    // 清理统计输出定时器。
    clearReportTimer() {
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
            this.reportTimer = null;
        }
    }

    // 清理心跳定时器。
    clearHeartbeatTimer() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    // 清理诊断轮询定时器。
    clearPollTimer() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    // 清理等待中的诊断请求。
    clearPendingDiagnosticRequest() {
        if (this.pendingDiagnosticRequest?.timeout) {
            clearTimeout(this.pendingDiagnosticRequest.timeout);
        }
        this.pendingDiagnosticRequest = null;
    }

    // 清理重连定时器。
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}

// 规范化设备 ID 列表并去重。
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

    return normalizedIds;
}

// 规范化 LoRa 角色名称。
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

// 判断当前文件是否为直接执行入口。
function isMainModule() {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
    startDiagnosticClient();
}

// 临时建立连接并发送一次切换主设备命令。
function sendSwitchHostDeviceOnce(hostDeviceId) {
    const config = getClientConfig();
    const frame = createDownlinkSwitchHostFrame({ hostDeviceId });
    const roleText = config.deviceId === hostDeviceId ? '主机' : '从机';
    const socket = new WebSocket(config.url, {
        handshakeTimeout: config.connectTimeoutMs,
    });

    return new Promise(resolve => {
        let settled = false;

        // 只完成一次临时发送流程。
        function finish(result) {
            if (settled) {
                return;
            }
            settled = true;
            if (
                socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING
            ) {
                socket.close();
            }
            resolve(result);
        }

        socket.on('open', () => {
            socket.send(frame, { binary: true }, err => {
                if (err) {
                    finish({
                        sent: false,
                        hostDeviceId,
                        deviceId: config.deviceId,
                        roleText,
                        reason: getErrorMessage(err),
                        url: config.url,
                    });
                    return;
                }

                console.log(
                    '切换主机命令已发送，目前主机切换为：' + hostDeviceId +
                    '，本机为' + roleText
                );
                finish({
                    sent: true,
                    hostDeviceId,
                    deviceId: config.deviceId,
                    roleText,
                    frameBytes: frame.length,
                    url: config.url,
                });
            });
        });

        socket.on('error', err => {
            finish({
                sent: false,
                hostDeviceId,
                deviceId: config.deviceId,
                roleText,
                reason: getErrorMessage(err),
                url: config.url,
            });
        });

        socket.on('close', () => {
            finish({
                sent: false,
                hostDeviceId,
                deviceId: config.deviceId,
                roleText,
                reason: 'socket closed before switch host frame was sent',
                url: config.url,
            });
        });
    });
}
