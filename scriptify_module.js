import jslint from "./jslint.js";

//debug import assert from "./assert.js";
//debug import valid from "./jsvalid.js";
//debug import valid_clone from "./valid_clone.js";
//debug import jscheck from "./jscheck.js";
//debug const specify = jscheck();

function redact(lines_array, ...ranges) {

// Replaces the matching lines with empty strings, returning a new array of
// lines.

    return lines_array.map(function (line, line_nr) {
        return (
            ranges.some(function ([begin, end]) {
                return line_nr >= begin && line_nr < end;
            })
            ? ""
            : line
        );
    });
}

function parse_import_statements(tokens) {

// Finds the import statements in a JSLint tokens array. Returns an array of
// parsed imports.

// The import objects each have an extra property, "lines", which is an array
// containing two integers. It represents the range of line numbers occupied by
// the import statement.

    return tokens.filter(function (token) {
        return (
            token.id === "import" &&
            token.arity === "statement"
        );
    }).map(function (import_token) {
        const specifier_token = tokens.slice(
            tokens.indexOf(import_token)
        ).find(function (token) {
            return token.id === "(string)";
        });
        const imports = {
            specifier: import_token.import.value,
            lines: [
                import_token.line,
                specifier_token.line + 1
            ]
        };
        if (Array.isArray(import_token.name)) {
            imports.names = import_token.name.reduce(
                function (object, name_token) {

// JSLint does not permit aliases.

                    object[name_token.id] = name_token.id;
                    return object;
                },
                {}
            );
        } else {
            imports.default = import_token.name.id;
        }
        return imports;
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
//debug                 default: "foo"
//debug             }),
//debug             valid.object({
//debug                 specifier: "./bar_baz.js",
//debug                 lines: valid.array([1, 5]),
//debug                 names: valid.object({bar: "bar", baz: "baz"})
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

// The 'eval' function can not handle import or export statements. The
// 'scriptify_module' function takes the source code of a module, parses its
// imports & exports, and produces a script which is safe to eval.

// It returns an object containing three properties:

//      script
//          The source with its import & export statements redacted.

//          Note that any identifier declared with an import statement becomes a
//          free variable. A local variable "$default" is declared to hold the
//          default exportation, if present.

//      imports
//          An array of objects representing the parsed import statements. Each
//          object contains the following properties:

//              specifier
//                  The module specifier string.

//                      import "./fridge.js";
//                      -> {specifier: "./fridge.js"}

//              default
//                  The name of the default import, if any.

//                      import fruit from "./apple.js";
//                      -> {default: "fruit", specifier: "./apple.js"}

//              names
//                  If the statement imports named members, this is an object
//                  containing a property for each member. The key is the name
//                  of the member, and the value is the alias.

//                      import {
//                          red,
//                          green as blue
//                      } from "./pink.js";
//                      -> {
//                          names: {
//                              red: "red",
//                              green: "blue"
//                          },
//                          specifier: "./pink.js"
//                      }

//                  If the statement imports every member as a single
//                  identifier, this property is instead a string.

//                      import * as creatures from "./animals.js";
//                      -> {names: "creatures", specifier: "./animals.js"}

//                  If the statement does not import any named members, this
//                  property is omitted.

//      exports
//          An exports object, or undefined if the source contains no exports.
//          Each key is the name of the exportation (or "default"). The value is
//          the identifier within 'script' which holds the value of the
//          exportation.

//              ORIGINAL                       | REWRITTEN

//              export default 1 + 1;          | const $default = 1 + 1;
//              -> {default: "$default"}

//              let black_cat = true;          | let black_cat = true;
//              let leopard = false;           | let leopard = false;
//              export {                       |
//                  black_cat as puma,         |
//                  leopard                    |
//              };                             |
//              -> {
//                  puma: "black_cat",
//                  leopard: "leopard"
//              }

//          Notice that in the preceeding examples the 'export' statements are
//          stripped from the resultant script.

//          There is also a "*" key, to represent the aggregation syntax. The
//          value of the "*" property is an array containing the indexes of
//          elements in the "imports" array.

//              export * from "./dig.js";     |
//              export * from "./cut.js";     |
//              -> {
//                  "*": [2, 3]
//              }

    const {tokens, stop, warnings} = jslint(source);
    if (stop) {
        throw new Error(
            "Failed to parse source: " +
            JSON.stringify(warnings, undefined, 4)
        );
    }
    let lines = source.split("\n");

// Parse the import statements, and then redact them from the source.

    const imports = parse_import_statements(tokens);
    lines = redact(lines, ...imports.map((the_import) => the_import.lines));

// Parse the export statement, and replace it with an assignment expression,
// which will yield to the "module" object when interpreted by 'eval_script'.

    const export_token = tokens.find(function (token) {
        return token.id === "export" && token.statement === true;
    });
    let exports;
    if (export_token !== undefined) {
        const begin = export_token.line;
        const line = lines[begin];
        const matches = line.match(/export\s+(default\s+)?/);
        if (matches[1] !== undefined) {

// The module exports a default member. Replace the statement with a variable
// declaration.

            lines[export_token.line] = line.replace(
                matches[0],
                "const $default = "
            );
            exports = {default: "$default"};
        } else {

// The module exports named members.

            exports = {};

// JSLint does not report what identifiers the 'export' token contains. We
// inspect the following tokens and extract the identifiers manually. At the
// same time, we detect which line the statement ends on.

            let end;
            tokens.slice(
                tokens.indexOf(export_token) + 1
            ).some(function (token) {
                if (token.id === "}") {
                    end = token.line + 1;
                    return true;
                }
                if (token.identifier) {
                    exports[token.id] = token.id;
                }
                return false;
            });

// Redact the entire export statement. It just references identifiers declared
// elsewhere.

            lines = redact(lines, [begin, end]);
        }
    }
    return {
        script: lines.join("\n"),
        imports: imports.map(function (the_import) {

// Remove the internal "lines" property from the imports, now that it has served
// its purpose.

            delete the_import.lines;
            return the_import;
        }),
        exports
    };
}

//debug specify.claim(
//debug     "scriptify_module default",
//debug     function (verdict, source, result) {
//debug         assert(
//debug             scriptify_module(source),
//debug             valid_clone({
//debug                 script: result,
//debug                 imports: [{
//debug                     specifier: "./x.js",
//debug                     default: "x"
//debug                 }],
//debug                 exports: {default: "$default"}
//debug             })
//debug         );
//debug         return verdict(true);
//debug     },
//debug     [
//debug         "\nimport x from \"./x.js\";\nx();\nexport default !x;\n",
//debug         "\n\nx();\nconst $default = !x;\n"
//debug     ]
//debug );
//debug specify.claim(
//debug     "scriptify_module named",
//debug     function (verdict, source, result) {
//debug         assert(
//debug             scriptify_module(source),
//debug             valid_clone({
//debug                 script: result,
//debug                 imports: [{
//debug                     specifier: "./y.js",
//debug                     names: {x: "x"}
//debug                 }],
//debug                 exports: {x: "x"}
//debug             })
//debug         );
//debug         return verdict(true);
//debug     },
//debug     [
//debug         "\nimport {x} from \"./y.js\";\nx();\nexport {x};\n",
//debug         "\n\nx();\n\n"
//debug     ]
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(scriptify_module);
