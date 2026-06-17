import WebSocket from 'ws';
import {
    decodeDiagnosticMessage,
    isDiagnosticBinaryMessage,
} from './diagnosticBinaryCodec.js';

const url = 'ws://192.168.202.10:6432';
const SEQ_BYTES = 4;
const REPORT_INTERVAL_MS = 5000;

const ws = new WebSocket(url);
let reportTimer = null;

const rxStats = {
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

ws.on('open', () => {
    console.log('WebSocket Client 202 connected');
    reportTimer = setInterval(reportReceiveStats, REPORT_INTERVAL_MS);

    setInterval(() => {
        ws.send('Hello Server');
    }, 3000);
});

ws.on('message', (data, isBinary) => {
    if (!isBinary) {
        console.log('text message:', data.toString());
        return;
    }

    const frame = Buffer.from(data);
    const { seq, packet } = unwrapDiagnosticFrame(frame);
    if (!packet) {
        console.error('unknown binary packet:', frame.toString('hex'));
        return;
    }

    try {
        if (seq !== null) {
            updateReceiveStats(seq, Date.now());
        }

        const message = decodeDiagnosticMessage(packet);
        console.log(`rx seq=${seq ?? 'none'} frameBytes=${frame.length} payloadBytes=${packet.length}`);
        console.log('packet hex:', packet.toString('hex'));
        console.log('decoded JSON:', JSON.stringify({ message }, null, 2));
        console.table(message.map(item => ({
            level: item.level,
            name: item.name,
            message: item.message,
            hardware_id: item.hardware_id,
        })));
    } catch (err) {
        console.error('binary decode failed:', err.message);
        console.error('packet HEX:', packet.toString('hex'));
    }
});

ws.on('close', () => {
    if (reportTimer) {
        clearInterval(reportTimer);
        reportTimer = null;
    }
    console.log('connection closed');
});

ws.on('error', err => {
    console.error('WebSocket error:', err);
});

function unwrapDiagnosticFrame(frame) {
    if (frame.length > SEQ_BYTES) {
        const packet = frame.subarray(SEQ_BYTES);
        if (isDiagnosticBinaryMessage(packet)) {
            return {
                seq: frame.readUInt32BE(0),
                packet,
            };
        }
    }

    if (isDiagnosticBinaryMessage(frame)) {
        return {
            seq: null,
            packet: frame,
        };
    }

    return {
        seq: null,
        packet: null,
    };
}

function updateReceiveStats(seq, now) {
    rxStats.received++;

    if (rxStats.lastPacketAt) {
        const interval = now - rxStats.lastPacketAt;
        rxStats.intervalCount++;
        rxStats.intervalSum += interval;
        rxStats.intervalMin = Math.min(rxStats.intervalMin, interval);
        rxStats.intervalMax = Math.max(rxStats.intervalMax, interval);
    }
    rxStats.lastPacketAt = now;

    if (rxStats.lastSeq === null) {
        rxStats.lastSeq = seq;
        return;
    }

    if (seq === rxStats.lastSeq) {
        rxStats.duplicates++;
        return;
    }

    const expected = (rxStats.lastSeq + 1) >>> 0;
    if (seq === expected) {
        rxStats.lastSeq = seq;
        return;
    }

    const forwardGap = (seq - expected) >>> 0;
    if (forwardGap < 0x80000000) {
        rxStats.lost += forwardGap;
        rxStats.lastSeq = seq;
    } else {
        rxStats.outOfOrder++;
    }
}

function reportReceiveStats() {
    const now = Date.now();
    const elapsedSeconds = (now - rxStats.reportAt) / 1000;
    const packetsInWindow = rxStats.received - rxStats.reportReceived;
    const hz = elapsedSeconds > 0 ? packetsInWindow / elapsedSeconds : 0;
    const avgInterval = rxStats.intervalCount
        ? rxStats.intervalSum / rxStats.intervalCount
        : 0;
    const minInterval = rxStats.intervalCount ? rxStats.intervalMin : 0;
    const maxInterval = rxStats.intervalCount ? rxStats.intervalMax : 0;

    console.log(
        `[rx-stats] hz=${hz.toFixed(2)} received=${rxStats.received} lost=${rxStats.lost} ` +
        `duplicates=${rxStats.duplicates} outOfOrder=${rxStats.outOfOrder} lastSeq=${rxStats.lastSeq ?? 'none'} ` +
        `intervalMs(avg/min/max)=${avgInterval.toFixed(1)}/${minInterval}/${maxInterval}`
    );

    rxStats.reportAt = now;
    rxStats.reportReceived = rxStats.received;
    rxStats.intervalCount = 0;
    rxStats.intervalSum = 0;
    rxStats.intervalMin = Infinity;
    rxStats.intervalMax = 0;
}
