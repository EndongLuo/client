import { pathToFileURL } from 'url';
import { SwitchHostDevice } from './clientMain.js';

export { SwitchHostDevice };

// 判断当前文件是否为直接执行入口。
function isMainModule() {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
    // const hostDeviceId = Number(process.argv[2]);
    const hostDeviceId = 203;
    try {
        const result = await SwitchHostDevice(hostDeviceId);
        if (!result.sent) {
            console.error('switch host failed:', result.reason);
            process.exitCode = 1;
        } else {
            console.log(
                'switch host sent hostDeviceId=' + result.hostDeviceId +
                ' frameBytes=' + result.frameBytes
            );
        }
    } catch (err) {
        console.error('usage: node SwitchHostDevice.js <hostDeviceId>');
        console.error(err?.message || String(err));
        process.exitCode = 1;
    }
}
