// const WebSocket = require('ws');
// const protobuf = require("protobufjs");
import WebSocket from 'ws';
import protobuf from 'protobufjs';
import { ID_NAME_MAP } from './diagnosticMap.js';

const root = await protobuf.load('./diagnostic.proto');

const DiagnosticMessage = root.lookupType('robot.diagnostics.DiagnosticMessage');
let recvBuffer = Buffer.alloc(0);
// WebSocket 服务地址
const url = 'ws://192.168.202.7:6432';

// 创建连接
const ws = new WebSocket(url);

// 连接成功
ws.on('open', () => {
    console.log('WebSocket Client 202 已连接');

    // 发送消息
    // ws.send('Hello Server');

    setInterval(() => {
        ws.send('Hello Server');
    }, 3000);
});

// 接收消息
ws.on('message', (data, isBinary) => {
    // const timestamp = Date.now();
    // const str = Buffer.from(data, "hex").toString("utf8");
    // console.log("字符长度:", str.length);

    // console.log(
    //     "UTF8字节长度:",
    //     Buffer.byteLength(str, 'utf8')
    // );
    // console.log('收到服务端消息:', str, timestamp);
    // console.log('收到服务端消息:', timestamp-str,' ms');

    // console.log('收到服务端消息:', data);

    const decoded = DiagnosticMessage.decode(data);

    // const obj = DiagnosticMessage.toObject(decoded, {
    //     longs: Number,
    //     defaults: true,
    //     arrays: true,
    //     objects: true,
    // });
    // console.log(obj);

    // obj.status = decodeStatusName(obj.status);

    // console.log('源数据:', data);
    // console.log('解析成功:', JSON.stringify(obj, null, 2));

    if (!isBinary) {
        console.log('收到文本:', data.toString());
        return;
    }

    recvBuffer = Buffer.concat([
        recvBuffer,
        Buffer.from(data)
    ]);

    while (recvBuffer.length >= 4) {
        const bodyLength = recvBuffer.readUInt32BE(0);

        if (recvBuffer.length < 4 + bodyLength) {
            return;
        }

        const body = recvBuffer.subarray(4, 4 + bodyLength);

        recvBuffer = recvBuffer.subarray(4 + bodyLength);

        try {
            const decoded = DiagnosticMessage.decode(body);

            const obj = DiagnosticMessage.toObject(decoded, {
                longs: Number,
                defaults: true,
                arrays: true,
                objects: true,
            });
            obj.message = decodeStatusName(obj.message.status);

            console.log('源数据:', data);
            console.log('解析成功:', JSON.stringify(obj, null, 2));
        } catch (err) {
            console.error('protobuf解析失败:', err.message);
            console.error('body HEX:', body.toString('hex'));
        }
    }

});

// 连接关闭
ws.on('close', () => {
    console.log('连接已关闭');
});

// 错误处理
ws.on('error', (err) => {
    console.error('WebSocket 错误:', err);
});

function decodeStatusName(statusList) {
    return statusList.map(item => ({
        ...item,
        name: ID_NAME_MAP[item.name] || `UNKNOWN_${item.name}`,
    }));
}