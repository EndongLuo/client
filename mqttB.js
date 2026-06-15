import { createMqttClient } from './mqttClient.js';

// const ip = '192.168.202.12';
const ip = '169.254.86.104';
//192.168.202.7:6432

const mqttB = createMqttClient({ ip, topic: '/test', clientId: 'client-202' });

// setInterval(() => {

//     mqttB.publishJson({
//         ip,
//         list: ['a', 'b', 'c']
//     });

// }, 5000);