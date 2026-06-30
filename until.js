import { isDiagnosticBinaryMessage } from './diagnosticBinaryCodec.js';
import { CONNECTION_CONFIG, PROTOCOL_CONFIG } from './config.js';

export const DEVICE_ID_BYTES = PROTOCOL_CONFIG.deviceIdBytes;
export const SEQUENCE_BYTES = PROTOCOL_CONFIG.sequenceBytes;
export const FRAME_HEADER_BYTES = DEVICE_ID_BYTES + SEQUENCE_BYTES;

const LORA_MAGIC_BYTES = 2;
const LORA_VERSION_BYTES = 1;
const LORA_TYPE_BYTES = 1;
const LORA_DEVICE_ID_BYTES = 2;

export const LORA_FRAME_MAGIC = 0x4c52;
export const LORA_FRAME_VERSION = 1;
export const LORA_FRAME_TYPES = Object.freeze({
    DIAGNOSTIC_REQUEST: 1,
    DIAGNOSTIC_RESPONSE: 2,
});
export const LORA_FRAME_HEADER_BYTES = LORA_MAGIC_BYTES
    + LORA_VERSION_BYTES
    + LORA_TYPE_BYTES
    + LORA_DEVICE_ID_BYTES
    + LORA_DEVICE_ID_BYTES
    + SEQUENCE_BYTES;

const WS_CLOSING = 2;
const WS_CLOSED = 3;

export function createDiagnosticFrame({ deviceId, seq, packet }) {
    validateUInt16(deviceId, 'deviceId');

    const payload = Buffer.from(packet);
    const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
    frame.writeUInt16BE(deviceId, 0);
    frame.writeUInt32BE(seq >>> 0, DEVICE_ID_BYTES);
    payload.copy(frame, FRAME_HEADER_BYTES);

    return frame;
}

export function createLoraDiagnosticRequestFrame({ sourceDeviceId, targetDeviceId, seq }) {
    return createLoraFrame({
        type: LORA_FRAME_TYPES.DIAGNOSTIC_REQUEST,
        sourceDeviceId,
        targetDeviceId,
        seq,
    });
}

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

function validateLoraFrameType(type) {
    if (
        type !== LORA_FRAME_TYPES.DIAGNOSTIC_REQUEST &&
        type !== LORA_FRAME_TYPES.DIAGNOSTIC_RESPONSE
    ) {
        throw new Error('unknown lora frame type: ' + type);
    }
}

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

export function resetReportWindow(stats, now = Date.now()) {
    stats.reportAt = now;
    stats.reportReceived = stats.received;
    stats.intervalCount = 0;
    stats.intervalSum = 0;
    stats.intervalMin = Infinity;
    stats.intervalMax = 0;
}

export function getReconnectDelay(attempt, config = CONNECTION_CONFIG) {
    const baseDelay = Math.min(
        config.reconnectInitialDelayMs * 2 ** attempt,
        config.reconnectMaxDelayMs
    );
    const jitter = Math.floor(Math.random() * config.reconnectJitterMs);

    return Math.min(baseDelay + jitter, config.reconnectMaxDelayMs);
}

export function nextSequence(seq) {
    return (seq + 1) >>> 0;
}

export function terminateSocket(socket) {
    if (
        socket.readyState === WS_CLOSED ||
        socket.readyState === WS_CLOSING
    ) {
        return;
    }

    socket.terminate();
}

export function getErrorMessage(err) {
    return err?.message || String(err);
}

export function toDiagnosticTableRows(items) {
    return items.map(item => ({
        level: item.level,
        name: item.name,
        message: item.message,
        hardware_id: item.hardware_id,
    }));
}

export function validateUInt16(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new Error(name + ' must be an integer from 0 to 65535: ' + value);
    }
}

export function validateUInt32(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(name + ' must be an integer from 0 to 4294967295: ' + value);
    }
}
