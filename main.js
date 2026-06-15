import client, {
    publishJson
} from './mqttClient.js';


setInterval(() => {

    publishJson({

        temperature: 33.5,

        voltage: 53.2,

        timestamp: Date.now()

    });

}, 1000);