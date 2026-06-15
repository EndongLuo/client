import { createMqttClient } from './mqttClient.js';

const ip = '192.168.203.7';
// const ip = '169.254.33.104';

const mqttA = createMqttClient({ ip, topic: '/test', clientId: 'Client-201' });

// setInterval(() => {

//     // mqttA.publishJson({ ip, message, date: new Date().toISOString()});
//     mqttA.publishJson({ ip, message });

// }, 3000);


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