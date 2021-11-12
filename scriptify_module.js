import jslint from "./jslint.js";

//debug import assert from "./assert.js";
//debug import valid from "./jsvalid.js";
//debug import jscheck from "./jscheck.js";
//debug const specify = jscheck();

function parse_import_statements(tokens) {

// Finds the import statements in a JSLint tokens array. Returns an array of
// parsed imports.

    return tokens.filter(function (token) {
        return (
            token.id === "import" &&
            token.arity === "statement"
        );
    }).map(function (import_token) {
        const name = (
            Array.isArray(import_token.name)
            ? import_token.name.map((token) => token.id)
            : import_token.name.id
        );
        const specifier_token = tokens.slice(
            tokens.indexOf(import_token)
        ).find(function (token) {
            return token.id === "(string)";
        });
        return {
            specifier: import_token.import.value,
            lines: [
                import_token.line,
                specifier_token.line + 1
            ],
            name
        };
    });
}

//debug specify.claim(
//debug     "parse_import_statements",
//debug     function (verdict, source) {
//debug         const parsed = parse_import_statements(jslint(source).tokens);
//debug         const report = valid.array([
//debug             valid.object({
//debug                 specifier: "./foo.js",
//debug                 lines: valid.array([0, 1]),
//debug                 name: "foo"
//debug             }),
//debug             valid.object({
//debug                 specifier: "./bar_baz.js",
//debug                 lines: valid.array([1, 5]),
//debug                 name: valid.array(["bar", "baz"])
//debug             })
//debug         ])(parsed);
//debug         return verdict(report.violations.length === 0);
//debug     },
//debug     `import foo from "./foo.js";
//debug import {
//debug     bar,
//debug     baz
//debug } from "./bar_baz.js"
//debug const x = 3;
//debug `
//debug );

function scriptify_module(source) {

// The 'scriptify_module' function parses the imports of a JavaScript module,
// and returns an object containing the following properties:

//      script
//          The source with its import statements redacted, and its export
//          statement neutered.

//      imports
//          An array of objects representing the parsed import statements. Each
//          object contains the following properties:

//              specifier
//                  The module specifier string.
//              name
//                  The name of the default import identifier, or an array of
//                  the names of named imports.
//              lines
//                  An array containing two integers: the line numbers where
//                  and import statement begins and ends.

//      exports
//          An exports object, or undefined if the source contains no exports.
//          Each key is the name of the exportation (or "default"), and the
//          value is the identifier in 'script' which contains the exportation.

//          In the future, we may also support a "*" key, to represent the
//          aggregation of modules due to this kind of syntax:

//              export * from "./my_module.js";

//          The value of the "*" property would be an array containing the names
//          of indentifiers containing the module objects to be re-exported.

//          For example,

//              {
//                  default: "$exports",
//                  foo: "foo",
//                  "*": ["$imports[1]"]
//              }

    const {tokens, stop, warnings} = jslint(source);
    if (stop) {
        throw new Error(
            "Failed to parse source: " +
            JSON.stringify(warnings, undefined, 4)
        );
    }

// Parse the import statements, and then remove them from the source.

    const imports = parse_import_statements(tokens);
    const lines = source.split("\n").map(
        function discard_import_statements(line, line_nr) {
            if (
                imports.some(function ({lines}) {
                    return line_nr >= lines[0] && line_nr < lines[1];
                })
            ) {
                return "";
            }
            return line;
        }
    );

// Parse the export statement, and replace it with an assignment expression,
// which will yield to the "module" object when interpreted by 'eval_script'.

    const export_token = tokens.find(function (token) {
        return token.id === "export" && token.statement === true;
    });
    let has_default_export = false;
    let exports;
    if (export_token !== undefined) {
        let line = lines[export_token.line];
        const matches = line.match(/export\s+(default\s+)?/);
        has_default_export = matches[1] !== undefined;
        line = line.replace(matches[0], "$exports = ");
        lines[export_token.line] = line;
        if (has_default_export) {
            exports = {default: "$exports"};
        } else {
            exports = {};

// JSLint does not report what identifiers the 'export' token contains. We
// inspect the following tokens and extract the identifiers manually.

            tokens.slice(
                tokens.indexOf(export_token) + 1
            ).some(function (token) {
                if (token.id === "}") {
                    return true;
                }
                if (token.identifier) {
                    exports[token.id] = token.id;
                }
            });
        }
    }
    return {
        script: lines.join("\n"),
        imports,
        exports
    };
}

//debug specify.claim(
//debug     "scriptify_module",
//debug     function (verdict, source, result) {
//debug         assert(
//debug             scriptify_module(source),
//debug             valid.object({
//debug                 script: result,
//debug                 imports: valid.array([valid.object()]),
//debug                 exports: valid.object({bar: "bar"})
//debug             })
//debug         );
//debug         return verdict(true);
//debug     },
//debug     [
//debug         "\nimport bar from \"./bar.js\";\nbar();\nexport {bar};\n",
//debug         "\n\nbar();\n$exports = {bar};\n"
//debug     ]
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(scriptify_module);
