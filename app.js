const Robot = require('./src/Robot');
const { serverIp, subscribeList, publishList } = require('./src/config');

// ROS 服务器连接
// const localRos = new Robot('localhost:9090');
// const serverRos = new Robot(`${serverIp}:9090`);
const localRos = new Robot('192.168.202.7:6432');
const serverRos = new Robot(`192.168.201.7:6432`);

// 订阅并发布主题
const subscribeAndPublish = async (sourceRos, targetRos, list) => {
    for (const { name, messageType } of list) {
        sourceRos.subscribeTopic(name, messageType, async (message) => {
            try {
                // console.log('--------', name, message);
                await targetRos.publish(name, messageType, message);
            } catch (error) {
                console.log(`Failed to forward message on ${name}:`, error);
            }
        });
    }
};

// 调用
subscribeAndPublish(localRos, serverRos, subscribeList);
subscribeAndPublish(serverRos, localRos, publishList);