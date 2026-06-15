export const NAME_MAP = Object.freeze({
    temperature_motor_left: 1,
    temperature_motor_right: 2,
    temperature_drive_left: 3,
    temperature_drive_right: 4,

    battery_voltage: 5,
    battery_current: 6,

    hydraulic_voltage: 7,
    chassis_voltage: 8,
    inverter_voltage: 9,

    hydraulic_status: 10,
    chassis_status: 11,
    inverter_status: 12,

    estop_status: 13,
    robot_status: 14,

    charger_status: 15,

    battery_voltage_alarm: 16,
    overcurrent_alarm: 17,
    sensor_status: 18,
    joy_estop: 19,
    whisker_status: 20,

    inverter_voltage_a: 21,
    inverter_voltage_b: 22,
    inverter_voltage_c: 23,

    inverter_current_a: 24,
    inverter_current_b: 25,
    inverter_current_c: 26,

    vacuum1_pressure: 27,
    vacuum_pressure: 28,

    temperature: 29,

    LASER: 30,
    PLC: 31,
    CAMERA: 32,
    IMU: 33,
    TF: 34,
});

export const ID_NAME_MAP =
    Object.freeze(
        Object.fromEntries(
            Object.entries(NAME_MAP)
                .map(([k, v]) => [v, k])
        )
    );