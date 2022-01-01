function alter_string(string, alterations) {

// The 'alter_string' function applies an array of substitutions to a string.
// The ranges of the alterations must be disjoint. The 'alterations' parameter
// is an array of arrays like [range, replacement] where the range is an object
// like {start, end}.

    alterations = alterations.slice().sort(
        function compare(a, b) {
            return a[0].start - b[0].start;
        }
    );
    let end = 0;
    return alterations.map(
        function ([range, replacement]) {
            const chunk = string.slice(end, range.start) + replacement;
            end = range.end;
            return chunk;
        }
    ).concat(
        string.slice(end)
    ).join(
        ""
    );
}

export default Object.freeze(alter_string);
