import WebSocket from 'ws';
import {
    encodeDiagnosticMessage,
    normalizeDiagnosticMessage,
} from './diagnosticBinaryCodec.js';

const url = 'ws://192.168.201.10:6432';
const SEND_INTERVAL_MS = 500;
const SEQ_BYTES = 4;

const message = [
    {
        level: 2,
        name: 'temperature_motor_left',
        message: '0',
        hardware_id: '°C',
        values: []
    },
    {
        level: 2,
        name: 'temperature_motor_right',
        message: '0',
        hardware_id: '°C',
        values: []
    },
    {
        level: 2,
        name: 'temperature_drive_left',
        message: '0',
        hardware_id: '°C',
        values: []
    },
    {
        level: 2,
        name: 'temperature_drive_right',
        message: '0',
        hardware_id: '°C',
        values: []
    },
    {
        level: 2,
        name: 'battery_voltage',
        message: '53.5',
        hardware_id: 'V',
        values: []
    },
    {
        level: 2,
        name: 'battery_current',
        message: '-0.1',
        hardware_id: 'A',
        values: []
    },
    {
        level: 2,
        name: 'hydraulic_voltage',
        message: '0.4',
        hardware_id: 'V',
        values: []
    },
    {
        level: 2,
        name: 'chassis_voltage',
        message: '0.2',
        hardware_id: 'V',
        values: []
    },
    {
        level: 2,
        name: 'inverter_voltage',
        message: '0.1',
        hardware_id: 'V',
        values: []
    },
    {
        level: 1,
        name: 'hydraulic_status',
        message: '2',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'chassis_status',
        message: '2',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'inverter_status',
        message: '2',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'estop_status',
        message: '2',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'robot_status',
        message: '2',
        hardware_id: '',
        values: []
    },
    {
        level: 2,
        name: 'charger_status',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'battery_voltage_alarm',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'overcurrent_alarm',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'sensor_status',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'joy_estop',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'whisker_status',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 2,
        name: 'inverter_voltage_a',
        message: '32',
        hardware_id: 'V',
        values: []
    },
    {
        level: 2,
        name: 'inverter_voltage_b',
        message: '147.2',
        hardware_id: 'V',
        values: []
    },
    {
        level: 2,
        name: 'inverter_voltage_c',
        message: '140',
        hardware_id: 'V',
        values: []
    },
    {
        level: 2,
        name: 'inverter_current_a',
        message: '5.4',
        hardware_id: 'A',
        values: []
    },
    {
        level: 2,
        name: 'inverter_current_b',
        message: '5.3',
        hardware_id: 'A',
        values: []
    },
    {
        level: 2,
        name: 'inverter_current_c',
        message: '5.3',
        hardware_id: 'A',
        values: []
    },
    {
        level: 2,
        name: 'vacuum1_pressure',
        message: '-0.2',
        hardware_id: 'KPa',
        values: []
    },
    {
        level: 2,
        name: 'vacuum_pressure',
        message: '-4.9',
        hardware_id: 'KPa',
        values: []
    },
    {
        level: 2,
        name: 'temperature',
        message: '33.3',
        hardware_id: '°C',
        values: []
    },
    {
        level: 1,
        name: 'LASER',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'PLC',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'CAMERA',
        message: '0',
        hardware_id: '',
        values: []
    },
    {
        level: 1,
        name: 'IMU',
        message: '0',
        hardware_id: '',
        values: []
    },
    { level: 1, name: 'TF', message: '2', hardware_id: '', values: [] }
]

const ws = new WebSocket(url);
let sequence = 0;
let sendTimer = null;

ws.on('open', () => {
    console.log('WebSocket Client 201 connected');

    const normalized = normalizeDiagnosticMessage(message);
    console.log('diagnostic items:', normalized.length);

    sendDiagnosticFrame();
    sendTimer = setInterval(sendDiagnosticFrame, SEND_INTERVAL_MS);
});

ws.on('message', data => {
    console.log('server message:', data.toString());
});

ws.on('close', () => {
    if (sendTimer) {
        clearInterval(sendTimer);
        sendTimer = null;
    }
    console.log('connection closed');
});

ws.on('error', err => {
    console.error('WebSocket error:', err);
});

function sendDiagnosticFrame() {
    if (ws.readyState !== WebSocket.OPEN) {
        return;
    }

    const packet = encodeDiagnosticMessage(message);
    const frame = Buffer.allocUnsafe(SEQ_BYTES + packet.length);
    frame.writeUInt32BE(sequence, 0);
    packet.copy(frame, SEQ_BYTES);

    ws.send(frame, { binary: true });
    console.log(`sent seq=${sequence} frameBytes=${frame.length} payloadBytes=${packet.length}`);

    sequence = (sequence + 1) >>> 0;
}
