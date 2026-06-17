import WebSocket from 'ws';
import {
    decodeDiagnosticMessage,
    isDiagnosticBinaryMessage,
} from './diagnosticBinaryCodec.js';

const url = 'ws://192.168.202.7:6432';

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log('WebSocket Client 202 connected');

    setInterval(() => {
        ws.send('Hello Server');
    }, 3000);
});

ws.on('message', (data, isBinary) => {
    if (!isBinary) {
        console.log('text message:', data.toString());
        return;
    }

    const packet = Buffer.from(data);
    if (!isDiagnosticBinaryMessage(packet)) {
        console.error('unknown binary packet:', packet.toString('hex'));
        return;
    }

    try {
        const message = decodeDiagnosticMessage(packet);
        console.log('raw packet:', packet);
        console.log('binary bytes:', packet.length);
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
    console.log('connection closed');
});

ws.on('error', err => {
    console.error('WebSocket error:', err);
});
