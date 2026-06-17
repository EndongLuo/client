import {
    DIAGNOSTIC_BINARY_MIN_SIZE,
    DIAGNOSTIC_SCHEMA,
    decodeDiagnosticMessage,
    encodeDiagnosticMessage,
    getDiagnosticBinarySize,
    isDiagnosticBinaryMessage,
    normalizeDiagnosticMessage,
} from './diagnosticBinaryCodec.js';

// const message = [

//     {
//         level: 1,
//         name: 'hydraulic_status',
//         message: '2',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'chassis_status',
//         message: '2',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'inverter_status',
//         message: '2',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'estop_status',
//         message: '2',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'robot_status',
//         message: '2',
//         hardware_id: '',
//         values: []
//     },

//     {
//         level: 1,
//         name: 'battery_voltage_alarm',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'overcurrent_alarm',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'sensor_status',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'joy_estop',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'whisker_status',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },

//     {
//         level: 1,
//         name: 'LASER',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'PLC',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'CAMERA',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     {
//         level: 1,
//         name: 'IMU',
//         message: '0',
//         hardware_id: '',
//         values: []
//     },
//     { level: 1, name: 'TF', message: '2', hardware_id: '', values: [] },
//     { level: 1, name: 'TF0', message: '2', hardware_id: '', values: [] }
// ]

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

const expected = normalizeDiagnosticMessage(message);
const jsonPayload = JSON.stringify(message);
const packet = encodeDiagnosticMessage(message);
const decoded = decodeDiagnosticMessage(packet);
const isRoundTripEqual = JSON.stringify(decoded) === JSON.stringify(expected);
const decodedHasValues = decoded.some(item => Object.hasOwn(item, 'values'));

console.log('=== diagnostic binary codec test ===');
console.log('schema item count:', DIAGNOSTIC_SCHEMA.length);
console.log('input item count:', message.length);
// console.log('decoded item count:', decoded.length);
// console.log('binary min size:', DIAGNOSTIC_BINARY_MIN_SIZE);
// console.log('computed packet size:', getDiagnosticBinarySize(message));
console.log('json input bytes:', Buffer.byteLength(jsonPayload, 'utf8'));
console.log('binary packet bytes:', packet.length);
// console.log('under 60 bytes:', packet.length < 60);
// console.log('is diagnostic binary:', isDiagnosticBinaryMessage(packet));
// console.log('decoded has values field:', decodedHasValues);
// console.log('schema level roundtrip equal:', isRoundTripEqual);
// console.log('unknown item error:', getUnknownItemError());
console.log('packet hex:', packet.toString('hex'));
// console.log('packet base64:', packet.toString('base64'));
console.log('');

console.log('--- input message table ---');
console.table(toTableRows(message));

// console.log('--- expected table from transmitted fields ---');
// console.table(toTableRows(expected));

console.log('--- decoded message table ---');
console.table(toTableRows(decoded));

if (!isRoundTripEqual) {
    console.log('--- first mismatch ---');
    console.log(findFirstMismatch(expected, decoded));
}

console.log('--- decoded JSON ---');
console.log(JSON.stringify({ message: decoded }));
console.log(decoded);

function toTableRows(items) {
    return items.map(item => ({
        level: item.level ?? 'not sent',
        name: item.name,
        message: item.message,
        hardware_id: item.hardware_id ?? 'not sent',
        // values_length: Array.isArray(item.values) ? item.values.length : 'not present',
    }));
}

function findFirstMismatch(left, right) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index++) {
        const a = left[index];
        const b = right[index];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
            return { index, expected: a, decoded: b };
        }
    }

    return null;
}

function getUnknownItemError() {
    try {
        encodeDiagnosticMessage([{ name: 'schema_extra_item', message: '0' }]);
        return 'not thrown';
    } catch (err) {
        return err.message;
    }
}
