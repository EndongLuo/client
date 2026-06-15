import mqtt from 'mqtt';

export function createMqttClient({
    ip = '127.0.0.1',
    port = 1883,
    topic = '/test',
    clientId = `mqtt_${Date.now()}`,
    username,
    password
} = {}) {

    const MQTT_HOST = `mqtt://${ip}:${port}`;
    console.log('MQTT连接:', MQTT_HOST);
    const client =
        mqtt.connect(MQTT_HOST, {
            clientId,
            clean: true,
            reconnectPeriod: 3000,
            connectTimeout: 5000,
            keepalive: 60,
            username,
            password

        }
        );

    client.on('connect', () => {

        console.log(`MQTT 已连接: ${clientId}`);

        client.subscribe('up', err => {

            if (err) {
                console.error('订阅失败:', err);
                return;
            }

            console.log(`已订阅: ${topic}`);

        }
        );

    });

    client.on('reconnect', () => {

        console.log('MQTT 重连中...');

    });

    client.on('close', () => {

        console.log('MQTT 连接关闭');

    });

    client.on('error', err => {

        console.error('MQTT 错误:', err.message);

    });

    client.on('message', (recvTopic, payload) => {

        console.log('收到Topic:', recvTopic);

        // console.log('收到消息:', payload.toString(), new Date().toISOString());
        console.log('收到消息:', payload, new Date().toISOString());

    }
    );

    // 发布JSON
    function publishJson(data) {

        // const payload = JSON.stringify(data);

        // client.publish(topic, payload, { qos: 0 });
        client.publish("/up", payload, { qos: 0 });

    }

    // 发布Buffer
    function publishBuffer(buffer) {

        client.publish(topic, buffer, { qos: 0 });

    }

    return { client, publishJson, publishBuffer };

}