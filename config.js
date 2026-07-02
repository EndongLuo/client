// 当前客户端设备 ID。
export const DEVICE_ID = 201;

// LoRa 主机设备 ID。
export const HOSTID = 201;

// 参与诊断轮询的设备 ID 列表。
export const IDs = [201, 202, 203];

// 客户端 WebSocket 地址。
export const CLIENT_URL = `ws://192.168.${DEVICE_ID}.10:6432`;

// LoRa 角色枚举。
export const LORA_ROLES = {
    AUTO: 'auto',       // 根据当前设备 ID 和主机 ID 自动判断角色。
    HOST: 'host',       // 主机端，负责主动轮询诊断数据。
    SLAVE: 'slave',     // 从机端，负责响应主机诊断请求。
};

// 二进制诊断协议字段长度。
export const PROTOCOL_CONFIG = {
    deviceIdBytes: 2,       // 设备 ID 占用字节数。
    sequenceBytes: 4,       // 消息序号占用字节数。
};

// 下发二进制协议标识，ASCII 为 DL。
export const DOWNLINK_FRAME_MAGIC = 0x444c;

// 下发二进制协议版本号。
export const DOWNLINK_FRAME_VERSION = 1;

// 下发二进制协议功能码。
export const DOWNLINK_FRAME_FUNCTIONS = {
    TASK_CONTROL: 1,        // 任务控制：设备 ID + 任务编号。
    OPERATION_CONTROL: 2,   // 操作控制：设备 ID + 控制编号。
    SWITCH_HOST: 3,         // 切换主从：新的主设备 ID。
};

// WebSocket 连接与重连配置。
export const CONNECTION_CONFIG = {
    connectTimeoutMs: 10000,            // 首次连接超时时间，单位毫秒。
    reconnectInitialDelayMs: 1000,      // 重连初始等待时间，单位毫秒。
    reconnectMaxDelayMs: 30000,         // 重连最大等待时间，单位毫秒。
    reconnectJitterMs: 300,             // 重连随机抖动时间，单位毫秒。
};

// 客户端运行默认配置。
export const DEFAULT_RUNTIME_CONFIG = {
    sendDiagnostics: false,             // 是否定时主动发送诊断数据。
    sendIntervalMs: 3000,               // 定时发送诊断数据的间隔，单位毫秒。
    sendHeartbeat: false,               // 是否发送心跳文本消息。
    heartbeatIntervalMs: 1000,          // 心跳消息发送间隔，单位毫秒。
    heartbeatMessage: 'heart beat',     // 心跳消息内容。
    reportIntervalMs: 5000,             // 接收统计日志输出间隔，单位毫秒。
    logPacketHex: true,                 // 是否打印二进制包十六进制内容。
    logDecodedJson: true,               // 是否打印解码后的 JSON。
    logDecodedTable: true,              // 是否打印解码后的表格。
    pollDiagnostics: true,              // 是否启用诊断轮询。
    loraRole: LORA_ROLES.AUTO,          // LoRa 角色，默认自动判断。
    diagnosticResponseTimeoutMs: 500,   // 诊断响应超时时间，单位毫秒。
    diagnosticPollGapMs: 500,           // 两次诊断轮询之间的等待时间，单位毫秒。
    HOSTID,                             // 默认主机设备 ID。
    IDs,                                // 默认参与诊断轮询的设备 ID 列表。
};

// 默认诊断消息内容。
export const DIAGNOSTIC_MESSAGE = [
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
];

// 单客户端配置。
export const CLIENT_CONFIG = {
    label: DEVICE_ID,                       // 日志中展示的客户端标识。
    deviceId: DEVICE_ID,                    // 当前客户端设备 ID。
    HOSTID,                                 // 当前客户端使用的主机设备 ID。
    IDs,                                    // 当前客户端参与轮询的设备 ID 列表。
    url: CLIENT_URL,                        // 当前客户端 WebSocket 地址。
    sendHeartbeat: false,                   // 当前客户端是否发送心跳。
    diagnosticMessage: DIAGNOSTIC_MESSAGE,  // 当前客户端发送的诊断消息模板。
};
