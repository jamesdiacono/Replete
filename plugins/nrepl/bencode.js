// An encoder and decoder for Bencode, a fairly minimal encoding for structured
// data. Byte strings are assumed to be UTF-8 encoded text.

// See https://en.wikipedia.org/wiki/Bencode.
// Also https://github.com/nrepl/bencode/blob/master/src/bencode/core.clj.

/*jslint web */

const to = new TextEncoder("utf-8");
const from = new TextDecoder("utf-8", {fatal: true});
const minus = 45;
const zero = 48;
const nine = 57;
const colon = 58;
const d = 100;
const e = 101;
const i = 105;
const l = 108;

function concat_bytes(a, b) {
    let array = new Uint8Array(a.byteLength + b.byteLength);
    array.set(a, 0);
    array.set(b, a.byteLength);
    return array;
}

function encode(value) {
    if (Number.isSafeInteger(value)) {
        return to.encode("i" + value + "e");
    }
    if (typeof value === "string") {
        const bytes = to.encode(value);
        return concat_bytes(
            to.encode(String(bytes.byteLength) + ":"),
            bytes
        );
    }
    if (Array.isArray(value)) {
        return [
            to.encode("l"),
            ...value.map(encode),
            to.encode("e")
        ].reduce(concat_bytes);
    }
    if (typeof value === "object" && value) {
        return [
            to.encode("d"),
            ...Object.keys(value).sort().flatMap(function (key) {
                return (
                    value[key] !== undefined
                    ? [encode(key), encode(value[key])]
                    : []
                );
            }),
            to.encode("e")
        ].reduce(concat_bytes);
    }
    throw new Error("Unsupported value '" + value + "'.");
}

function decode_positive_integer(bytes, start) {
    let end = start;
    while (bytes[end] >= zero && bytes[end] <= nine) {
        end += 1;
    }
    const digits = from.decode(bytes.slice(start, end));
    const value = parseInt(digits);
    if (!Number.isSafeInteger(value)) {
        throw new Error("Expected digits, got '" + digits + "'.");
    }
    return [value, end];
}

function decode_from(bytes, at) {
    if (bytes[at] === i) {

// Signed integer.

        at += 1;
        let sign = 1;
        if (bytes[at] === minus) {
            sign = -1;
            at += 1;
        }
        let [integer, end] = decode_positive_integer(bytes, at);
        if (end >= bytes.byteLength) {
            throw new Error("Unexpected EOF.");
        }
        if (bytes[end] !== e) {
            throw new Error("Expected 'e'.");
        }
        return [
            sign * integer,
            end + 1
        ];
    }
    if (bytes[at] === l) {

// List.

        at += 1;
        let element;
        let array = [];
        while (bytes[at] !== e && at < bytes.byteLength) {
            [element, at] = decode_from(bytes, at);
            array.push(element);
        }
        if (at >= bytes.byteLength) {
            throw new Error("Unexpected EOF.");
        }
        return [
            array,
            at + 1
        ];
    }
    if (bytes[at] === d) {

// Dictionary.

        at += 1;
        let key;
        let value;
        let object = {};
        while (bytes[at] !== e && at < bytes.byteLength) {
            [key, at] = decode_from(bytes, at);
            if (typeof key !== "string") {
                throw new Error("Expected string key.");
            }
            [value, at] = decode_from(bytes, at);
            object[key] = value;
        }
        if (at >= bytes.byteLength) {
            throw new Error("Unexpected EOF.");
        }
        return [
            object,
            at + 1
        ];
    }

// String.

    let length;
    [length, at] = decode_positive_integer(bytes, at);
    if (bytes[at] !== colon) {
        throw new Error("Expected ':'.");
    }
    at += 1;
    const begin = at;
    at += length;
    if (at > bytes.byteLength) {
        throw new Error("Unexpected EOF.");
    }
    return [
        from.decode(bytes.slice(begin, at)),
        at
    ];
}

function decode(bytes) {
    const [value, at] = decode_from(bytes, 0);
    if (at !== bytes.byteLength) {
        throw new Error("Unexpected EOF.");
    }
    return value;
}

function roundtrips(value) {
    return JSON.stringify(decode(encode(value))) === JSON.stringify(value);
}

function throws(callback) {
    try {
        callback();
        return false;
    } catch (_) {
        return true;
    }
}

if (import.meta.main) {
    if (
        !roundtrips(0)
        || !roundtrips(42)
        || !roundtrips(-42)
        || !roundtrips("")
        || !roundtrips("big 🍌")
        || !roundtrips([])
        || !roundtrips([1, 2, 3])
        || !roundtrips([1, [2], 3])
        || !roundtrips({a: 0, b: [1, 2], c: {d: "3"}})
        || roundtrips({b: 0, a: 2})  // key ordering is lost
        || encode({a: 0, b: undefined}).join() !== encode({a: 0}).join()
        || !throws(() => encode(undefined))
        || !throws(() => encode(NaN))
        || !throws(() => encode(Infinity))
        || !throws(() => encode(true))
        || !throws(() => encode({a: true}))
    ) {
        throw new Error("FAIL");
    }
}

export default Object.freeze({encode, decode, decode_from});
