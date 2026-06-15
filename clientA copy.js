// const WebSocket = require('ws');
// const protobuf = require("protobufjs");
import WebSocket from 'ws';
import protobuf from 'protobufjs';

// WebSocket 服务地址
const url = 'ws://192.168.201.7:6432';

const root = await protobuf.load("./diagnostic.proto");
const DiagnosticMessage = root.lookupType("robot.diagnostics.DiagnosticMessage");
// 创建连接
const ws = new WebSocket(url);

// 连接成功
ws.on('open', () => {
    console.log('WebSocket Client 201 已连接');
    const message = {
        header: {
            seq: 2098,
            stamp: { secs: 1779254885, nsecs: 733256420 },
            frame_id: ''
        },
        status: [
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
    }
    // const timestamp = Date.now();
    // const data = JSON.stringify({ timestamp, message });
    // // 发送消息
    // ws.send(data);
    const payload = {
        timestamp: Date.now(),
        message,
    };

    const err = DiagnosticMessage.verify(payload);
    if (err) {
        throw new Error(err);
    }

    const body = DiagnosticMessage.encode(payload).finish();

    console.log("protobuf 字节长度:", body.length);

    const packet = Buffer.alloc(4 + body.length);
    packet.writeUInt32BE(body.length, 0);
    Buffer.from(body).copy(packet, 4);

    ws.send(packet, { binary: true });
});

// 接收消息
ws.on('message', (data) => {
    console.log('收到服务端消息:', data);
});

// 连接关闭
ws.on('close', () => {
    console.log('连接已关闭');
});

// 错误处理
ws.on('error', (err) => {
    console.error('WebSocket 错误:', err);
});