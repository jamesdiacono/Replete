function functor(value, leaf) {

// The 'functor' function traverses a JSON-encodable value, which may be a
// deeply nested object or array, and produces a deep copy with every leaf value
// transformed by the 'leaf' function.

    if (Array.isArray(value)) {
        return value.map(function (element) {
            return functor(element, leaf);
        });
    }
    if (typeof value === "object" && value !== null) {
        return Object.keys(value).reduce(
            function (object, key) {
                object[key] = functor(value[key], leaf);
                return object;
            },
            {}
        );
    }
    return leaf(value);
}

const rx_webl_encode = /^webl_encode\(([^]*)\)$/;
export default Object.freeze(function webl_decode(encoded) {

// The 'webl_decode' function decodes a value encoded by the 'webl_encode'
// function, so that it may be printed nicely to the console.

// The "reviver" function, passed to JSON.parse, would be the ideal mechanism
// here. However, when the reviver returns undefined it triggers the removal of
// the property, which results in the loss of useful information.

    const parsed = JSON.parse(encoded);

// Instead we go for a walk.

    return functor(parsed, function decode(value) {
        if (typeof value === "string") {
            let matches = value.match(rx_webl_encode);
            if (matches) {
                const encoded_value = matches[1];
                if (encoded_value === "undefined") {
                    return undefined;
                }
                if (encoded_value === "NaN") {
                    return NaN;
                }
                if (encoded_value === "Infinity") {
                    return Infinity;
                }
                if (encoded_value === "-Infinity") {
                    return -Infinity;
                }

// If the encoded value is not wun of the constants, then it is a function name.
// Here we create a function and assign its name dynamically.

                const noop = function () {
                    return;
                };
                Object.defineProperty(
                    noop,
                    "name",
                    {value: encoded_value}
                );
                return noop;
            }
        }
        return value;
    });
});
