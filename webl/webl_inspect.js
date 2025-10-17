// Format any value as a nice readable string. Useful for debugging.

// Values nested within 'value' are inspected no deeper than 'maximum_depth'
// levels.

// The inspected depth is automatically constrained such that the returned
// string is no longer than 'maximum_length'.

/*jslint browser, global, null */

function inspect(value, maximum_depth = 10, maximum_length = 65536) {

    function is_primitive(value) {
        return (
            value === undefined
            || value === null
            || typeof value === "boolean"
            || typeof value === "number"
            || typeof value === "string"
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

    function too_long() {
        return string.length > maximum_length;
    }

    (function print(value, depth = 0, ancestors = []) {
        if (typeof value === "function") {
            return write("[Function: " + (value.name || "(anonymous)") + "]");
        }
        if (typeof value === "string") {

// Add quotes around strings, and encode any newlines.

            return write(JSON.stringify(value));
        }
        if (
            is_primitive(value)
            || value.constructor === RegExp
            || value.constructor === Symbol
        ) {
            return write(String(value));
        }
        if (typeof value !== "object") {

// BigInt, etc.

            return write(
                "[" + value.constructor.name + ": " + String(value) + "]"
            );
        }
        if (value.constructor === Date) {
            return write("[Date: " + value.toJSON() + "]");
        }

// We keep track of object-like values that have already been (or are being)
// printed, otherwise we would be at risk of entering an infinite loop.

        if (ancestors.includes(value)) {
            return write("[Circular]");
        }
        ancestors = [...ancestors, value];

        function print_member(key, value, compact, last) {

// The 'print_member' function prints out an element of an array, or property of
// an object.

            if (!compact) {
                write("\n" + dent);
            }
            if (key !== undefined) {
                write(key + ": ");
            }
            print(value, depth + 1, ancestors);
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

        const leaf = depth >= maximum_depth;
        if (Array.isArray(value)) {
            if (leaf) {
                return write("[Array]");
            }
            const compact = value.length < 3 && value.every(is_primitive);
            write("[");
            indent();
            value.every(function (element, element_nr) {

// Exiting early prevents memory exhaustion when inspecting enormous values.

                if (too_long()) {
                    return false;
                }
                print_member(
                    undefined,
                    element,
                    compact,
                    element_nr === value.length - 1
                );
                return true;
            });
            outdent();
            return write("]");
        }

// The value is an object. Print out its properties.

        if (value.constructor === undefined) {

// The object has no prototype. A descriptive prefix might be helpful.

            write("[Object: null prototype]");
            if (leaf) {
                return;
            }
            write(" ");
        } else {
            if (leaf) {
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
                    return print(Array.from(value), depth, ancestors);
                } catch (_) {}
            }
        }
        write("{");
        indent();

// Non-enumerable properties, such as the innumerable DOM element methods, are
// omitted because they overwhelm the output.

        const keys = Object.keys(value);
        keys.every(function (key, key_nr) {
            if (too_long()) {
                return false;
            }

// It is possible that the property is a getter, and that it will fail when
// accessed. Omit any malfunctioning properties without affecting the others.

            let property_value;
            try {
                property_value = value[key];
            } catch (_) {}
            print_member(
                key,
                property_value,
                keys.length === 1 && is_primitive(property_value),
                key_nr === keys.length - 1
            );
            return true;
        });
        outdent();
        return write("}");
    }(value));
    if (too_long() && maximum_depth > 0) {
        return inspect(value, maximum_depth - 1, maximum_length);
    }
    return string.slice(0, maximum_length);
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
        || inspect(["a", {"b": "c"}], 1) !== `[
    "a",
    [Object]
]`
        || inspect([1, 2], 0) !== "[Array]"
        || inspect([1, {"2": [3, 4]}], 2, 30) !== `[
    1,
    [Object]
]`
        || inspect([1, {"2": [3, 4]}], 2, 5) !== "[Arra"
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
    const huge = (function array_bomb(depth = 20, cache = []) {
        if (cache[depth] === undefined) {
            cache[depth] = new Array(depth).fill().map(function () {
                return array_bomb(depth - 1, cache);
            });
        }
        return cache[depth];
    }());
    inspect(huge); // requires correctly functioning early exit
}

export default Object.freeze(inspect);
