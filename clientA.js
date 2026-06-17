import WebSocket from 'ws';
import {
    encodeDiagnosticMessage,
    normalizeDiagnosticMessage,
} from './diagnosticBinaryCodec.js';

const url = 'ws://192.168.201.7:6432';

const message = [
    { name: 'temperature_motor_left', message: '0' },
    { name: 'temperature_motor_right', message: '0' },
    { name: 'temperature_drive_left', message: '0' },
    { name: 'temperature_drive_right', message: '0' },
    { name: 'battery_voltage', message: '53.5' },
    { name: 'battery_current', message: '-0.1' },
    { name: 'hydraulic_voltage', message: '0.4' },
    { name: 'chassis_voltage', message: '0.2' },
    { name: 'inverter_voltage', message: '0.1' },
    { name: 'hydraulic_status', message: '2' },
    { name: 'chassis_status', message: '2' },
    { name: 'inverter_status', message: '2' },
    { name: 'estop_status', message: '2' },
    { name: 'robot_status', message: '2' },
    { name: 'charger_status', message: '0' },
    { name: 'battery_voltage_alarm', message: '0' },
    { name: 'overcurrent_alarm', message: '0' },
    { name: 'sensor_status', message: '0' },
    { name: 'joy_estop', message: '0' },
    { name: 'whisker_status', message: '0' },
    { name: 'inverter_voltage_a', message: '32' },
    { name: 'inverter_voltage_b', message: '147.2' },
    { name: 'inverter_voltage_c', message: '140' },
    { name: 'inverter_current_a', message: '5.4' },
    { name: 'inverter_current_b', message: '5.3' },
    { name: 'inverter_current_c', message: '5.3' },
    { name: 'vacuum1_pressure', message: '-0.2' },
    { name: 'vacuum_pressure', message: '-4.9' },
    { name: 'temperature', message: '33.3' },
    { name: 'LASER', message: '0' },
    { name: 'PLC', message: '0' },
    { name: 'CAMERA', message: '0' },
    { name: 'IMU', message: '0' },
    { name: 'TF', message: '2' },
];

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log('WebSocket Client 201 connected');

    const packet = encodeDiagnosticMessage(message);
    const normalized = normalizeDiagnosticMessage(message);

    console.log('diagnostic items:', normalized.length);
    console.log('binary bytes:', packet.length);
    console.log('packet hex:', packet.toString('hex'));

    ws.send(packet, { binary: true });
});

ws.on('message', data => {
    console.log('server message:', data.toString());
});

ws.on('close', () => {
    console.log('connection closed');
});

ws.on('error', err => {
    console.error('WebSocket error:', err);
});
