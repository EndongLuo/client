import mqtt from 'mqtt';

const MQTT_HOST = 'mqtt://192.168.201.10:1883';
// const MQTT_HOST = 'mqtt://192.168.8.68:1883';


const TOPIC = '/test';

const client = mqtt.connect(MQTT_HOST, {
    clientId: 'test201',
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 5000,
    keepalive: 60

});

client.on('connect', () => {

    console.log('MQTT 已连接');

    client.subscribe(TOPIC, (err) => {
        if (err) {
            console.error('订阅失败:', err);
            return;
        }

        console.log('已订阅:', TOPIC);
    });

});

client.on('reconnect', () => {
    console.log('MQTT 重连中...');
});

client.on('close', () => {
    console.log('MQTT 连接关闭');
});

client.on('error', (err) => {
    console.error('MQTT 错误:', err);
});

client.on('message', (topic, payload) => {

    console.log('收到Topic:', topic);

    console.log('收到消息:', payload.toString());

});


// 发布JSON
export function publishJson(data) {

    const payload = JSON.stringify(data);

    client.publish(TOPIC, payload, { qos: 0 });

}


// 发布二进制
export function publishBuffer(buffer) {

    client.publish(TOPIC, buffer, { qos: 0 });

}


export default client;