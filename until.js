import { isDiagnosticBinaryMessage } from './diagnosticBinaryCodec.js';
import { CONNECTION_CONFIG, PROTOCOL_CONFIG } from './config.js';

export const DEVICE_ID_BYTES = PROTOCOL_CONFIG.deviceIdBytes;
export const SEQUENCE_BYTES = PROTOCOL_CONFIG.sequenceBytes;
export const FRAME_HEADER_BYTES = DEVICE_ID_BYTES + SEQUENCE_BYTES;
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
