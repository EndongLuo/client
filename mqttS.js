import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://192.168.203.10:1883', {
    clientId: `node-test-${Date.now()}`,
    clean: true,
    protocolVersion: 4,
});

client.on('connect', () => {
    console.log('MQTT 已连接');

    client.subscribe('/up', { qos: 0 }, (err) => {
        if (err) {
            console.error('订阅失败:', err.message);
            return;
        }

        console.log('已订阅 /lora/up');

        client.publish('/test', 'test', {
            qos: 0,
            retain: false,
        });

        console.log('已发布 test 到 /lora/down');
    });
});

client.on('message', (topic, payload) => {
    console.log('收到 topic:', topic);
    console.log('收到 LoRa 返回:', payload.toString());
    console.log('HEX:', payload.toString('hex'));
});

client.on('error', err => {
    console.error('MQTT 错误:', err.message);
});