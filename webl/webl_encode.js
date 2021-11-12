export default Object.freeze(function webl_encode(value) {

// The 'webl_encode' function encodes a value as JSON. It is capable of encoding
// values which JSON.stringify can not, such as NaN. It is used at the padawan
// level to encode evaluated values, as postMessage can not transmit uncloneable
// values, like functions.

// Warning! This function is strigified using toString() for use in the
// padawans. It must be entirely self-contained.

    function wrap(string) {
        return "webl_encode(" + string + ")";
    }
    return JSON.stringify(
        value,
        function replacer(ignore, value) {
            return (
                (
                    value === undefined || (
                        typeof value === "number" &&
                        !Number.isFinite(value)
                    )
                )
                ? wrap(String(value))
                : (
                    typeof value === "function"
                    ? wrap(value.name)
                    : value
                )
            );
        },
        4
    );
});
