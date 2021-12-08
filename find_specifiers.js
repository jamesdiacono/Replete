import {parse} from "acorn";

function find_specifiers(source) {

// The 'find_specifiers' function searches the 'source' string of a module for
// import specifiers, returning their value and position.

// It returns an array of objects, each of which contains the following
// properties:

//      value:
//          The value of the specifier, e.g. "./peach.js".

//      range:
//          An object with a "start" and "end" property, corresponding to the
//          starting and ending position of the specifier within 'source'.

    return parse(
        source,
        {
            ecmaVersion: "latest",
            sourceType: "module"
        }
    ).body.filter(
        function (node) {
            return (
                node.type === "ImportDeclaration" ||
                node.type === "ExportAllDeclaration"
            );
        }
    ).map(
        function (node) {
            return {
                value: node.source.value,
                range: {

// Exclude the surrounding quotation marks.

                    start: node.source.start + 1,
                    end: node.source.end - 1
                }
            };
        }
    );
}

//debug const source = `
//debug import green, {red, yellow} from "./colours.js";
//debug export * from "./aggregate.js";
//debug `;
//debug console.log(find_specifiers(source).map(function ({range}) {
//debug     return source.slice(range.start, range.end);
//debug }));

export default Object.freeze(find_specifiers);
