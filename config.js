export const DEFAULT_CLIENT_KEY = 'clientA';

export const PROTOCOL_CONFIG = Object.freeze({
    deviceIdBytes: 2,
    sequenceBytes: 4,
});

export const CONNECTION_CONFIG = Object.freeze({
    connectTimeoutMs: 10000,
    reconnectInitialDelayMs: 1000,
    reconnectMaxDelayMs: 30000,
    reconnectJitterMs: 300,
});

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
    sendDiagnostics: true,
    sendIntervalMs: 500,
    sendHeartbeat: false,
    heartbeatIntervalMs: 3000,
    heartbeatMessage: 'Hello Server',
    reportIntervalMs: 5000,
    logPacketHex: true,
    logDecodedJson: true,
    logDecodedTable: true,
});

export const DIAGNOSTIC_MESSAGE = Object.freeze([
    {
        level: 2,
        name: 'temperature_motor_left',
        message: '0',
        hardware_id: '\u00b0C',
        values: [],
    },
    {
        level: 2,
        name: 'temperature_motor_right',
        message: '0',
        hardware_id: '\u00b0C',
        values: [],
    },
    {
        level: 2,
        name: 'temperature_drive_left',
        message: '0',
        hardware_id: '\u00b0C',
        values: [],
    },
    {
        level: 2,
        name: 'temperature_drive_right',
        message: '0',
        hardware_id: '\u00b0C',
        values: [],
    },
    {
        level: 2,
        name: 'battery_voltage',
        message: '53.5',
        hardware_id: 'V',
        values: [],
    },
    {
        level: 2,
        name: 'battery_current',
        message: '-0.1',
        hardware_id: 'A',
        values: [],
    },
    {
        level: 2,
        name: 'hydraulic_voltage',
        message: '0.4',
        hardware_id: 'V',
        values: [],
    },
    {
        level: 2,
        name: 'chassis_voltage',
        message: '0.2',
        hardware_id: 'V',
        values: [],
    },
    {
        level: 2,
        name: 'inverter_voltage',
        message: '0.1',
        hardware_id: 'V',
        values: [],
    },
    {
        level: 1,
        name: 'hydraulic_status',
        message: '2',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'chassis_status',
        message: '2',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'inverter_status',
        message: '2',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'estop_status',
        message: '2',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'robot_status',
        message: '2',
        hardware_id: '',
        values: [],
    },
    {
        level: 2,
        name: 'charger_status',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'battery_voltage_alarm',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'overcurrent_alarm',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'sensor_status',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'joy_estop',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'whisker_status',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 2,
        name: 'inverter_voltage_a',
        message: '32',
        hardware_id: 'V',
        values: [],
    },
    {
        level: 2,
        name: 'inverter_voltage_b',
        message: '147.2',
        hardware_id: 'V',
        values: [],
    },
    {
        level: 2,
        name: 'inverter_voltage_c',
        message: '140',
        hardware_id: 'V',
        values: [],
    },
    {
        level: 2,
        name: 'inverter_current_a',
        message: '5.4',
        hardware_id: 'A',
        values: [],
    },
    {
        level: 2,
        name: 'inverter_current_b',
        message: '5.3',
        hardware_id: 'A',
        values: [],
    },
    {
        level: 2,
        name: 'inverter_current_c',
        message: '5.3',
        hardware_id: 'A',
        values: [],
    },
    {
        level: 2,
        name: 'vacuum1_pressure',
        message: '-0.2',
        hardware_id: 'KPa',
        values: [],
    },
    {
        level: 2,
        name: 'vacuum_pressure',
        message: '-4.9',
        hardware_id: 'KPa',
        values: [],
    },
    {
        level: 2,
        name: 'temperature',
        message: '33.3',
        hardware_id: '\u00b0C',
        values: [],
    },
    {
        level: 1,
        name: 'LASER',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'PLC',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'CAMERA',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'IMU',
        message: '0',
        hardware_id: '',
        values: [],
    },
    {
        level: 1,
        name: 'TF',
        message: '2',
        hardware_id: '',
        values: [],
    },
]);

export const CLIENTS = Object.freeze({
    client: Object.freeze({
        label: '201',
        deviceId: 201,
        url: 'ws://192.168.201.10:6432',
        sendHeartbeat: false,
        diagnosticMessage: DIAGNOSTIC_MESSAGE,
    }),
    // clientB: Object.freeze({
    //     label: '202',
    //     deviceId: 202,
    //     url: 'ws://192.168.202.10:6432',
    //     sendHeartbeat: true,
    //     diagnosticMessage: DIAGNOSTIC_MESSAGE,
    // }),
});

export function getClientConfig(clientKey = DEFAULT_CLIENT_KEY) {
    const clientConfig = CLIENTS[clientKey];
    if (!clientConfig) {
        throw new Error(
            'unknown client "' + clientKey + '", available: ' + Object.keys(CLIENTS).join(', ')
        );
    }

    return {
        ...CONNECTION_CONFIG,
        ...DEFAULT_RUNTIME_CONFIG,
        ...clientConfig,
        clientKey,
        diagnosticMessage: clientConfig.diagnosticMessage ?? DIAGNOSTIC_MESSAGE,
    };
}
