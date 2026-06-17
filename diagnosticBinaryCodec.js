import { DIAGNOSTIC_SCHEMA } from './diagnosticSchema.js';

export { DIAGNOSTIC_SCHEMA } from './diagnosticSchema.js';

const MARKER = 0xd1;
const VERSION = 4;
const ANALOG_SCALE = 10;
const VALID_LEVELS = new Set([1, 2]);

const SCHEMA = validateSchema(DIAGNOSTIC_SCHEMA);
const SCHEMA_BY_NAME = new Map(SCHEMA.map((item, index) => [item.name, { ...item, index }]));
const PRESENCE_BYTES = Math.ceil(SCHEMA.length / 8);

export const DIAGNOSTIC_BINARY_MIN_SIZE = 2 + PRESENCE_BYTES;

export function getDiagnosticBinarySize(statusList = []) {
    const entries = getPresentEntries(statusList);
    return getPacketSize(countLevel(entries, 2), countLevel(entries, 1));
}

export function encodeDiagnosticMessage(statusList = []) {
    const entries = getPresentEntries(statusList);
    const buffer = Buffer.allocUnsafe(getPacketSize(
        countLevel(entries, 2),
        countLevel(entries, 1)
    ));
    let offset = 0;

    buffer.writeUInt8(MARKER, offset++);
    buffer.writeUInt8(VERSION, offset++);

    buffer.fill(0, offset, offset + PRESENCE_BYTES);
    for (const entry of entries) {
        buffer[offset + (entry.index >> 3)] |= 1 << (entry.index & 7);
    }
    offset += PRESENCE_BYTES;

    for (const entry of entries) {
        if (entry.level !== 2) {
            continue;
        }

        const scaled = encodeAnalogValue(entry.item.message, entry.name);
        buffer.writeInt16BE(scaled, offset);
        offset += 2;
    }

    const statusEntries = entries.filter(entry => entry.level === 1);
    const statusBytes = Math.ceil(statusEntries.length / 4);
    buffer.fill(0, offset, offset + statusBytes);
    for (let index = 0; index < statusEntries.length; index++) {
        const entry = statusEntries[index];
        const status = encodeStatusValue(entry.item.message, entry.name);
        buffer[offset + (index >> 2)] |= status << ((index & 3) * 2);
    }

    return buffer;
}

export function decodeDiagnosticMessage(bufferLike) {
    const buffer = Buffer.from(bufferLike);
    if (buffer.length < DIAGNOSTIC_BINARY_MIN_SIZE) {
        throw new Error(`diagnostic packet too short: ${buffer.length}, minimum ${DIAGNOSTIC_BINARY_MIN_SIZE}`);
    }

    let offset = 0;
    const marker = buffer.readUInt8(offset++);
    const version = buffer.readUInt8(offset++);
    if (marker !== MARKER || version !== VERSION) {
        throw new Error(`diagnostic packet header mismatch: marker=${marker}, version=${version}`);
    }

    const entries = [];
    for (let index = 0; index < SCHEMA.length; index++) {
        const byteOffset = offset + (index >> 3);
        if ((buffer[byteOffset] & (1 << (index & 7))) !== 0) {
            entries.push(SCHEMA[index]);
        }
    }
    offset += PRESENCE_BYTES;

    const expectedSize = getPacketSize(countLevel(entries, 2), countLevel(entries, 1));
    if (buffer.length !== expectedSize) {
        throw new Error(`diagnostic packet length mismatch: ${buffer.length}, expected ${expectedSize}`);
    }

    const values = new Map();
    for (const entry of entries) {
        if (entry.level !== 2) {
            continue;
        }

        values.set(entry.name, formatAnalogValue(buffer.readInt16BE(offset)));
        offset += 2;
    }

    const statusEntries = entries.filter(entry => entry.level === 1);
    for (let index = 0; index < statusEntries.length; index++) {
        const entry = statusEntries[index];
        values.set(entry.name, String((buffer[offset + (index >> 2)] >> ((index & 3) * 2)) & 0x03));
    }

    return entries.map(entry => ({
        level: entry.level,
        name: entry.name,
        message: values.get(entry.name),
        hardware_id: entry.hardware_id,
    }));
}

export function normalizeDiagnosticMessage(statusList = []) {
    return getPresentEntries(statusList).map(entry => ({
        level: entry.level,
        name: entry.name,
        message: readEncodedMessageValue(entry),
        hardware_id: entry.hardware_id,
    }));
}

export function isDiagnosticBinaryMessage(bufferLike) {
    try {
        const buffer = Buffer.from(bufferLike);
        if (buffer.length < DIAGNOSTIC_BINARY_MIN_SIZE) {
            return false;
        }
        if (buffer.readUInt8(0) !== MARKER || buffer.readUInt8(1) !== VERSION) {
            return false;
        }

        const entries = [];
        let offset = 2;
        for (let index = 0; index < SCHEMA.length; index++) {
            if ((buffer[offset + (index >> 3)] & (1 << (index & 7))) !== 0) {
                entries.push(SCHEMA[index]);
            }
        }

        return buffer.length === getPacketSize(countLevel(entries, 2), countLevel(entries, 1));
    } catch {
        return false;
    }
}

function validateSchema(schema) {
    if (!Array.isArray(schema)) {
        throw new Error('DIAGNOSTIC_SCHEMA must be an array');
    }

    const names = new Set();
    return Object.freeze(schema.map((item, index) => {
        if (!item || !VALID_LEVELS.has(item.level)) {
            throw new Error(`invalid schema level at index ${index}: ${item?.level}`);
        }
        if (!item.name || typeof item.name !== 'string') {
            throw new Error(`invalid schema name at index ${index}`);
        }
        if (names.has(item.name)) {
            throw new Error(`duplicate schema name: ${item.name}`);
        }
        names.add(item.name);

        return Object.freeze({
            level: item.level,
            name: item.name,
            hardware_id: item.hardware_id ?? '',
            index,
        });
    }));
}

function getPresentEntries(statusList) {
    if (!Array.isArray(statusList)) {
        throw new Error('diagnostic message must be an array');
    }

    const byName = new Map();
    for (const item of statusList) {
        if (!item || typeof item.name !== 'string') {
            continue;
        }
        if (!SCHEMA_BY_NAME.has(item.name)) {
            throw new Error(`unknown diagnostic item: ${item.name}`);
        }
        if (byName.has(item.name)) {
            throw new Error(`duplicate diagnostic item: ${item.name}`);
        }
        if (item.message === undefined) {
            throw new Error(`${item.name} missing message`);
        }
        byName.set(item.name, item);
    }

    return SCHEMA
        .filter(schema => byName.has(schema.name))
        .map(schema => ({ ...schema, item: byName.get(schema.name) }));
}

function getPacketSize(analogCount, statusCount) {
    return 2
        + PRESENCE_BYTES
        + analogCount * 2
        + Math.ceil(statusCount / 4);
}

function countLevel(entries, level) {
    let count = 0;
    for (const entry of entries) {
        if (entry.level === level) {
            count++;
        }
    }
    return count;
}

function readEncodedMessageValue(entry) {
    if (entry.level === 2) {
        return formatAnalogValue(encodeAnalogValue(entry.item.message, entry.name));
    }

    return String(encodeStatusValue(entry.item.message, entry.name));
}

function encodeAnalogValue(value, name) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`${name} is not a valid number: ${value}`);
    }

    const scaled = Math.round(numeric * ANALOG_SCALE);
    if (Math.abs(numeric * ANALOG_SCALE - scaled) > 1e-9) {
        throw new Error(`${name} compact encoding only supports 1 decimal place: ${value}`);
    }
    if (scaled < -32768 || scaled > 32767) {
        throw new Error(`${name} is out of int16 range: ${value}`);
    }

    return scaled;
}

function encodeStatusValue(value, name) {
    const status = Number(value);
    if (!Number.isInteger(status) || status < 0 || status > 3) {
        throw new Error(`${name} status value must be 0-3: ${value}`);
    }

    return status;
}

function formatAnalogValue(scaled) {
    const value = scaled / ANALOG_SCALE;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
