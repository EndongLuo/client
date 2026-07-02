import { isDiagnosticBinaryMessage } from './diagnosticBinaryCodec.js';
import {
    CLIENT_CONFIG,
    CONNECTION_CONFIG,
    DEFAULT_RUNTIME_CONFIG,
    DIAGNOSTIC_MESSAGE,
    DOWNLINK_FRAME_FUNCTIONS,
    DOWNLINK_FRAME_MAGIC,
    DOWNLINK_FRAME_VERSION,
    PROTOCOL_CONFIG,
} from './config.js';

export const DEVICE_ID_BYTES = PROTOCOL_CONFIG.deviceIdBytes;
export const SEQUENCE_BYTES = PROTOCOL_CONFIG.sequenceBytes;
export const FRAME_HEADER_BYTES = DEVICE_ID_BYTES + SEQUENCE_BYTES;

const LORA_MAGIC_BYTES = 2;
const LORA_VERSION_BYTES = 1;
const LORA_TYPE_BYTES = 1;
const LORA_DEVICE_ID_BYTES = 2;
const DOWNLINK_MAGIC_BYTES = 2;
const DOWNLINK_VERSION_BYTES = 1;
const DOWNLINK_FUNCTION_BYTES = 1;
const DOWNLINK_DEVICE_ID_BYTES = 2;
const DOWNLINK_VALUE_BYTES = 2;

export const LORA_FRAME_MAGIC = 0x4c52;
export const LORA_FRAME_VERSION = 1;
export const LORA_FRAME_TYPES = {
    DIAGNOSTIC_REQUEST: 1,
    DIAGNOSTIC_RESPONSE: 2,
};
export const LORA_FRAME_HEADER_BYTES = LORA_MAGIC_BYTES
    + LORA_VERSION_BYTES
    + LORA_TYPE_BYTES
    + LORA_DEVICE_ID_BYTES
    + LORA_DEVICE_ID_BYTES
    + SEQUENCE_BYTES;
export const DOWNLINK_FRAME_HEADER_BYTES = DOWNLINK_MAGIC_BYTES
    + DOWNLINK_VERSION_BYTES
    + DOWNLINK_FUNCTION_BYTES;
export const DOWNLINK_TARGET_FRAME_BYTES = DOWNLINK_FRAME_HEADER_BYTES
    + DOWNLINK_DEVICE_ID_BYTES
    + DOWNLINK_VALUE_BYTES;
export const DOWNLINK_SWITCH_HOST_FRAME_BYTES = DOWNLINK_FRAME_HEADER_BYTES
    + DOWNLINK_DEVICE_ID_BYTES;

const WS_CLOSING = 2;
const WS_CLOSED = 3;

// 合并配置文件和环境变量，生成运行时客户端配置。
export function getClientConfig() {
    const mergedConfig = {
        ...CONNECTION_CONFIG,
        ...DEFAULT_RUNTIME_CONFIG,
        ...CLIENT_CONFIG,
    };
    const deviceId = readUInt16Env('DEVICE_ID', mergedConfig.deviceId);
    const hostId = readUInt16Env('HOSTID', mergedConfig.HOSTID);
    const ids = readUInt16ListEnv('IDS', mergedConfig.IDs);

    return {
        ...mergedConfig,
        deviceId,
        HOSTID: hostId,
        IDs: ids,
        loraRole: process.env.LORA_ROLE || mergedConfig.loraRole,
        diagnosticMessage: mergedConfig.diagnosticMessage ?? DIAGNOSTIC_MESSAGE,
    };
}

// 创建任务控制下发帧。
export function createDownlinkTaskControlFrame({ deviceId, taskId }) {
    return createDownlinkTargetFrame(DOWNLINK_FRAME_FUNCTIONS.TASK_CONTROL, deviceId, taskId);
}

// 创建操作控制下发帧。
export function createDownlinkOperationControlFrame({ deviceId, controlId }) {
    return createDownlinkTargetFrame(
        DOWNLINK_FRAME_FUNCTIONS.OPERATION_CONTROL,
        deviceId,
        controlId
    );
}

// 创建切换主设备下发帧。
export function createDownlinkSwitchHostFrame({ hostDeviceId }) {
    validateUInt16(hostDeviceId, 'hostDeviceId');

    const frame = createDownlinkHeader(DOWNLINK_SWITCH_HOST_FRAME_BYTES);
    frame.writeUInt8(DOWNLINK_FRAME_FUNCTIONS.SWITCH_HOST, DOWNLINK_MAGIC_BYTES + DOWNLINK_VERSION_BYTES);
    frame.writeUInt16BE(hostDeviceId, DOWNLINK_FRAME_HEADER_BYTES);

    return frame;
}

// 解析下发二进制帧。
export function unwrapDownlinkFrame(frameLike) {
    const frame = Buffer.from(frameLike);
    if (frame.length < DOWNLINK_FRAME_HEADER_BYTES) {
        return null;
    }
    if (frame.readUInt16BE(0) !== DOWNLINK_FRAME_MAGIC) {
        return null;
    }

    const version = frame.readUInt8(DOWNLINK_MAGIC_BYTES);
    if (version !== DOWNLINK_FRAME_VERSION) {
        throw new Error('downlink frame version mismatch: ' + version);
    }

    const functionCode = frame.readUInt8(DOWNLINK_MAGIC_BYTES + DOWNLINK_VERSION_BYTES);
    validateDownlinkFunctionCode(functionCode);

    if (functionCode === DOWNLINK_FRAME_FUNCTIONS.TASK_CONTROL) {
        assertDownlinkFrameLength(frame, DOWNLINK_TARGET_FRAME_BYTES, 'task control');
        return {
            version,
            functionCode,
            deviceId: frame.readUInt16BE(DOWNLINK_FRAME_HEADER_BYTES),
            taskId: frame.readUInt16BE(DOWNLINK_FRAME_HEADER_BYTES + DOWNLINK_DEVICE_ID_BYTES),
            headerBytes: DOWNLINK_FRAME_HEADER_BYTES,
            isDownlinkFrame: true,
        };
    }

    if (functionCode === DOWNLINK_FRAME_FUNCTIONS.OPERATION_CONTROL) {
        assertDownlinkFrameLength(frame, DOWNLINK_TARGET_FRAME_BYTES, 'operation control');
        return {
            version,
            functionCode,
            deviceId: frame.readUInt16BE(DOWNLINK_FRAME_HEADER_BYTES),
            controlId: frame.readUInt16BE(DOWNLINK_FRAME_HEADER_BYTES + DOWNLINK_DEVICE_ID_BYTES),
            headerBytes: DOWNLINK_FRAME_HEADER_BYTES,
            isDownlinkFrame: true,
        };
    }

    assertDownlinkFrameLength(frame, DOWNLINK_SWITCH_HOST_FRAME_BYTES, 'switch host');
    return {
        version,
        functionCode,
        hostDeviceId: frame.readUInt16BE(DOWNLINK_FRAME_HEADER_BYTES),
        headerBytes: DOWNLINK_FRAME_HEADER_BYTES,
        isDownlinkFrame: true,
    };
}

// 创建普通诊断数据帧。
export function createDiagnosticFrame({ deviceId, seq, packet }) {
    validateUInt16(deviceId, 'deviceId');

    const payload = Buffer.from(packet);
    const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
    frame.writeUInt16BE(deviceId, 0);
    frame.writeUInt32BE(seq >>> 0, DEVICE_ID_BYTES);
    payload.copy(frame, FRAME_HEADER_BYTES);

    return frame;
}

// 创建 LoRa 诊断请求帧。
export function createLoraDiagnosticRequestFrame({ sourceDeviceId, targetDeviceId, seq }) {
    return createLoraFrame({
        type: LORA_FRAME_TYPES.DIAGNOSTIC_REQUEST,
        sourceDeviceId,
        targetDeviceId,
        seq,
    });
}

// 创建 LoRa 诊断响应帧。
export function createLoraDiagnosticResponseFrame({ sourceDeviceId, targetDeviceId, seq, packet }) {
    const payload = Buffer.from(packet);
    if (!isDiagnosticBinaryMessage(payload)) {
        throw new Error('lora diagnostic response packet is invalid');
    }

    return createLoraFrame({
        type: LORA_FRAME_TYPES.DIAGNOSTIC_RESPONSE,
        sourceDeviceId,
        targetDeviceId,
        seq,
        packet: payload,
    });
}

// 解析 LoRa 诊断帧。
export function unwrapLoraFrame(frameLike) {
    const frame = Buffer.from(frameLike);
    if (frame.length < LORA_FRAME_HEADER_BYTES) {
        return null;
    }
    if (frame.readUInt16BE(0) !== LORA_FRAME_MAGIC) {
        return null;
    }

    const version = frame.readUInt8(LORA_MAGIC_BYTES);
    if (version !== LORA_FRAME_VERSION) {
        throw new Error('lora frame version mismatch: ' + version);
    }

    const type = frame.readUInt8(LORA_MAGIC_BYTES + LORA_VERSION_BYTES);
    validateLoraFrameType(type);

    const sourceOffset = LORA_MAGIC_BYTES + LORA_VERSION_BYTES + LORA_TYPE_BYTES;
    const targetOffset = sourceOffset + LORA_DEVICE_ID_BYTES;
    const seqOffset = targetOffset + LORA_DEVICE_ID_BYTES;
    const packet = frame.subarray(LORA_FRAME_HEADER_BYTES);

    if (type === LORA_FRAME_TYPES.DIAGNOSTIC_REQUEST && packet.length !== 0) {
        throw new Error('lora diagnostic request must not include payload');
    }
    if (type === LORA_FRAME_TYPES.DIAGNOSTIC_RESPONSE && !isDiagnosticBinaryMessage(packet)) {
        throw new Error('lora diagnostic response payload is invalid');
    }

    return {
        type,
        sourceDeviceId: frame.readUInt16BE(sourceOffset),
        targetDeviceId: frame.readUInt16BE(targetOffset),
        seq: frame.readUInt32BE(seqOffset),
        packet,
        headerBytes: LORA_FRAME_HEADER_BYTES,
        isLoraFrame: true,
    };
}

// 创建 LoRa 底层帧。
function createLoraFrame({ type, sourceDeviceId, targetDeviceId, seq, packet = Buffer.alloc(0) }) {
    validateLoraFrameType(type);
    validateUInt16(sourceDeviceId, 'sourceDeviceId');
    validateUInt16(targetDeviceId, 'targetDeviceId');
    validateUInt32(seq, 'seq');

    const payload = Buffer.from(packet);
    const frame = Buffer.allocUnsafe(LORA_FRAME_HEADER_BYTES + payload.length);
    let offset = 0;

    frame.writeUInt16BE(LORA_FRAME_MAGIC, offset);
    offset += LORA_MAGIC_BYTES;
    frame.writeUInt8(LORA_FRAME_VERSION, offset);
    offset += LORA_VERSION_BYTES;
    frame.writeUInt8(type, offset);
    offset += LORA_TYPE_BYTES;
    frame.writeUInt16BE(sourceDeviceId, offset);
    offset += LORA_DEVICE_ID_BYTES;
    frame.writeUInt16BE(targetDeviceId, offset);
    offset += LORA_DEVICE_ID_BYTES;
    frame.writeUInt32BE(seq >>> 0, offset);
    offset += SEQUENCE_BYTES;
    payload.copy(frame, offset);

    return frame;
}

// 校验 LoRa 帧类型。
function validateLoraFrameType(type) {
    if (
        type !== LORA_FRAME_TYPES.DIAGNOSTIC_REQUEST &&
        type !== LORA_FRAME_TYPES.DIAGNOSTIC_RESPONSE
    ) {
        throw new Error('unknown lora frame type: ' + type);
    }
}

// 创建包含目标设备和值的下发帧。
function createDownlinkTargetFrame(functionCode, deviceId, value) {
    validateDownlinkFunctionCode(functionCode);
    validateUInt16(deviceId, 'deviceId');
    validateUInt16(value, 'downlinkValue');

    const frame = createDownlinkHeader(DOWNLINK_TARGET_FRAME_BYTES);
    frame.writeUInt8(functionCode, DOWNLINK_MAGIC_BYTES + DOWNLINK_VERSION_BYTES);
    frame.writeUInt16BE(deviceId, DOWNLINK_FRAME_HEADER_BYTES);
    frame.writeUInt16BE(value, DOWNLINK_FRAME_HEADER_BYTES + DOWNLINK_DEVICE_ID_BYTES);

    return frame;
}

// 创建下发帧头。
function createDownlinkHeader(frameBytes) {
    const frame = Buffer.allocUnsafe(frameBytes);
    frame.writeUInt16BE(DOWNLINK_FRAME_MAGIC, 0);
    frame.writeUInt8(DOWNLINK_FRAME_VERSION, DOWNLINK_MAGIC_BYTES);

    return frame;
}

// 校验下发功能码。
function validateDownlinkFunctionCode(functionCode) {
    if (
        functionCode !== DOWNLINK_FRAME_FUNCTIONS.TASK_CONTROL &&
        functionCode !== DOWNLINK_FRAME_FUNCTIONS.OPERATION_CONTROL &&
        functionCode !== DOWNLINK_FRAME_FUNCTIONS.SWITCH_HOST
    ) {
        throw new Error('unknown downlink function: ' + functionCode);
    }
}

// 校验下发帧长度。
function assertDownlinkFrameLength(frame, expectedBytes, name) {
    if (frame.length !== expectedBytes) {
        throw new Error(
            'downlink ' + name + ' frame length must be ' +
            expectedBytes + ' bytes: ' + frame.length
        );
    }
}

// 解析普通诊断数据帧。
export function unwrapDiagnosticFrame(frameLike) {
    const frame = Buffer.from(frameLike);

    if (frame.length > FRAME_HEADER_BYTES) {
        const packet = frame.subarray(FRAME_HEADER_BYTES);
        if (isDiagnosticBinaryMessage(packet)) {
            return {
                deviceId: frame.readUInt16BE(0),
                seq: frame.readUInt32BE(DEVICE_ID_BYTES),
                packet,
                headerBytes: FRAME_HEADER_BYTES,
                isLegacy: false,
            };
        }
    }

    if (frame.length > SEQUENCE_BYTES) {
        const packet = frame.subarray(SEQUENCE_BYTES);
        if (isDiagnosticBinaryMessage(packet)) {
            return {
                deviceId: null,
                seq: frame.readUInt32BE(0),
                packet,
                headerBytes: SEQUENCE_BYTES,
                isLegacy: true,
            };
        }
    }

    if (isDiagnosticBinaryMessage(frame)) {
        return {
            deviceId: null,
            seq: null,
            packet: frame,
            headerBytes: 0,
            isLegacy: true,
        };
    }

    return {
        deviceId: null,
        seq: null,
        packet: null,
        headerBytes: 0,
        isLegacy: false,
    };
}

// 创建接收统计对象。
export function createReceiveStats() {
    return {
        received: 0,
        lost: 0,
        duplicates: 0,
        outOfOrder: 0,
        lastSeq: null,
        lastPacketAt: 0,
        reportAt: Date.now(),
        reportReceived: 0,
        intervalCount: 0,
        intervalSum: 0,
        intervalMin: Infinity,
        intervalMax: 0,
    };
}

// 更新接收统计对象。
export function updateReceiveStats(stats, seq, now = Date.now()) {
    stats.received++;

    if (stats.lastPacketAt) {
        const interval = now - stats.lastPacketAt;
        stats.intervalCount++;
        stats.intervalSum += interval;
        stats.intervalMin = Math.min(stats.intervalMin, interval);
        stats.intervalMax = Math.max(stats.intervalMax, interval);
    }
    stats.lastPacketAt = now;

    if (stats.lastSeq === null) {
        stats.lastSeq = seq;
        return;
    }

    if (seq === stats.lastSeq) {
        stats.duplicates++;
        return;
    }

    const expected = (stats.lastSeq + 1) >>> 0;
    if (seq === expected) {
        stats.lastSeq = seq;
        return;
    }

    const forwardGap = (seq - expected) >>> 0;
    if (forwardGap < 0x80000000) {
        stats.lost += forwardGap;
        stats.lastSeq = seq;
    } else {
        stats.outOfOrder++;
    }
}

// 格式化接收统计信息。
export function formatReceiveStats(stats, now = Date.now()) {
    const elapsedSeconds = (now - stats.reportAt) / 1000;
    const packetsInWindow = stats.received - stats.reportReceived;
    const hz = elapsedSeconds > 0 ? packetsInWindow / elapsedSeconds : 0;
    const avgInterval = stats.intervalCount
        ? stats.intervalSum / stats.intervalCount
        : 0;
    const minInterval = stats.intervalCount ? stats.intervalMin : 0;
    const maxInterval = stats.intervalCount ? stats.intervalMax : 0;

    return (
        'hz=' + hz.toFixed(2) +
        ' received=' + stats.received +
        ' lost=' + stats.lost +
        ' duplicates=' + stats.duplicates +
        ' outOfOrder=' + stats.outOfOrder +
        ' lastSeq=' + (stats.lastSeq ?? 'none') +
        ' intervalMs(avg/min/max)=' + avgInterval.toFixed(1) + '/' + minInterval + '/' + maxInterval
    );
}

// 重置统计输出窗口。
export function resetReportWindow(stats, now = Date.now()) {
    stats.reportAt = now;
    stats.reportReceived = stats.received;
    stats.intervalCount = 0;
    stats.intervalSum = 0;
    stats.intervalMin = Infinity;
    stats.intervalMax = 0;
}

// 计算带抖动的重连等待时间。
export function getReconnectDelay(attempt, config = CONNECTION_CONFIG) {
    const baseDelay = Math.min(
        config.reconnectInitialDelayMs * 2 ** attempt,
        config.reconnectMaxDelayMs
    );
    const jitter = Math.floor(Math.random() * config.reconnectJitterMs);

    return Math.min(baseDelay + jitter, config.reconnectMaxDelayMs);
}

// 计算下一个 32 位消息序号。
export function nextSequence(seq) {
    return (seq + 1) >>> 0;
}

// 终止未关闭的 WebSocket。
export function terminateSocket(socket) {
    if (
        socket.readyState === WS_CLOSED ||
        socket.readyState === WS_CLOSING
    ) {
        return;
    }

    socket.terminate();
}

// 提取错误信息。
export function getErrorMessage(err) {
    return err?.message || String(err);
}

// 转成诊断表格行。
export function toDiagnosticTableRows(items) {
    return items.map(item => ({
        level: item.level,
        name: item.name,
        message: item.message,
        hardware_id: item.hardware_id,
    }));
}

// 校验 16 位无符号整数。
export function validateUInt16(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new Error(name + ' must be an integer from 0 to 65535: ' + value);
    }
}

// 校验 32 位无符号整数。
export function validateUInt32(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(name + ' must be an integer from 0 to 4294967295: ' + value);
    }
}

// 读取 16 位无符号整数环境变量。
function readUInt16Env(name, fallback) {
    const rawValue = process.env[name];
    if (rawValue === undefined || rawValue === '') {
        return fallback;
    }

    const value = Number(rawValue);
    validateUInt16(value, name);

    return value;
}

// 读取 16 位无符号整数列表环境变量。
function readUInt16ListEnv(name, fallback) {
    const rawValue = process.env[name];
    if (rawValue === undefined || rawValue === '') {
        return fallback;
    }

    const values = rawValue
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => readUInt16Literal(name, value));

    if (values.length === 0) {
        throw new Error(name + ' must contain at least one id');
    }

    return values;
}

// 解析 16 位无符号整数字面量。
function readUInt16Literal(name, rawValue) {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new Error(name + ' contains invalid id: ' + rawValue);
    }

    return value;
}
