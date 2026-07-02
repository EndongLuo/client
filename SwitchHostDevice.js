import { pathToFileURL } from 'url';
import { SwitchHostDevice } from './clientMain.js';

export { SwitchHostDevice };

function isMainModule() {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
    const hostDeviceId = 203;
    // const hostDeviceId = Number(process.argv[2]);
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
