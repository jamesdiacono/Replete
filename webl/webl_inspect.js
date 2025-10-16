// Format any value as a nice readable string. Useful for debugging.

// Values nested within 'value' are inspected no deeper than 'maximum_depth'
// levels.

/*jslint browser, global, null */

function inspect(value, maximum_depth = 10) {

    function is_primitive(value) {
        return (
            typeof value === "string"
            || typeof value === "number"
            || typeof value === "boolean"
            || value === null
            || value === undefined
        );
    }

    let dent = "";

    function indent() {
        dent += "    ";
    }

    function outdent() {
        dent = dent.slice(4);
    }

// The string is built up as the value is traversed.

    let string = "";

    function write(fragment) {
        string += fragment;
    }

    (function print(value, depth = 0, weakmaps = []) {
        if (typeof value === "function") {
            return write("[Function: " + (value.name || "(anonymous)") + "]");
        }
        if (typeof value === "string") {

// Add quotes around strings, and encode any newlines.

            return write(JSON.stringify(value));
        }
        if (is_primitive(value) || value.constructor === RegExp) {
            return write(String(value));
        }
        if (value.constructor === Date) {
            return write("[Date: " + value.toJSON() + "]");
        }
        if (weakmaps.some(function (seen) {
            return seen.has(value);
        })) {
            return write("[Circular]");
        }
        try {

// We keep track of object-like values that have already been (or are being)
// printed, otherwise we would be at risk of entering an infinite loop.

            let seen = new WeakMap();
            seen.set(value, true);
            weakmaps = weakmaps.concat(seen);
        } catch (_) {

// The value must be some kind of freaky primitive, like Symbol or BigInt.

            return write(
                "[" + value.constructor.name + ": " + String(value) + "]"
            );
        }

        function print_member(key, value, compact, last) {

// The 'print_member' function prints out an element of an array, or property of
// an object.

            if (!compact) {
                write("\n" + dent);
            }
            if (key !== undefined) {
                write(key + ": ");
            }
            print(value, depth + 1, weakmaps);
            if (!last) {
                return write(
                    compact
                    ? ", "
                    : ","
                );
            }
            if (!compact) {
                return write("\n" + dent.slice(4));
            }
        }
        if (Array.isArray(value)) {
            if (depth >= maximum_depth) {
                return write("[Array]");
            }
            const compact = value.length < 3 && value.every(is_primitive);
            write("[");
            indent();
            value.forEach(function (element, element_nr) {
                print_member(
                    undefined,
                    element,
                    compact,
                    element_nr === value.length - 1
                );
            });
            outdent();
            return write("]");
        }

// The value is an object. Print out its properties.

        if (value.constructor === undefined) {

// The object has no prototype. A descriptive prefix might be helpful.

            write("[Object: null prototype]");
            if (depth >= maximum_depth) {
                return;
            }
            write(" ");
        } else {
            if (depth >= maximum_depth) {
                return write("[" + value.constructor.name + "]");
            }
            if (value.constructor !== Object) {

// The object has an unusual prototype. Give it a descriptive prefix.

                write("[" + value.constructor.name + "] ");
            }

// Some kinds of objects are better represented as an array, but only if the
// iterator is well behaved.

            if (value[Symbol.iterator] !== undefined) {
                try {
                    return print(Array.from(value), depth, weakmaps);
                } catch (_) {}
            }
        }
        write("{");
        indent();

// Non-enumerable properties, such as the innumerable DOM element methods, are
// omitted because they overwhelm the output.

        const keys = Object.keys(value);
        keys.forEach(function (key, key_nr) {

// It is possible that the property is a getter, and that it will fail when
// accessed. Omit any malfunctioning properties without affecting the others.

            try {
                print_member(
                    key,
                    value[key],
                    keys.length === 1 && is_primitive(value[key]),
                    key_nr === keys.length - 1
                );
            } catch (_) {}
        });
        outdent();
        return write("}");
    }(value));
    return string;
}

if (import.meta.main) {
    const not_circular = {};
    let circular = Object.create(null);
    circular.self = circular;
    let bad_iterator = {};
    bad_iterator[Symbol.iterator] = "BOOM";
    if (
        inspect() !== "undefined"
        || inspect(null) !== "null"
        || inspect(123) !== "123"
        || inspect(Infinity) !== "Infinity"
        || inspect(NaN) !== "NaN"
        || inspect([1, {"2": [3, 4]}]) !== `[
    1,
    {
        2: [3, 4]
    }
]`
        || inspect([1, {"2": [3, 4]}], 1) !== `[
    1,
    [Object]
]`
        || inspect(new Uint8Array([0, 255])) !== "[Uint8Array] [0, 255]"
        || inspect(Math.random) !== "[Function: random]"
        || inspect([not_circular, not_circular]) !== `[
    {},
    {}
]`
        || inspect(circular) !== `[Object: null prototype] {
    self: [Circular]
}`
        || inspect(bad_iterator) !== "{}"
    ) {
        throw new Error("FAIL");
    }
    if (typeof document === "object") {
        globalThis.console.log(inspect(document.body));
    }
}

export default Object.freeze(inspect);
