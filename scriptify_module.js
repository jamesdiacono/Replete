import {parse} from "acorn";
import alter_string from "./alter_string.js";

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

    let tree = parse(source, {
        ecmaVersion: "latest",
        sourceType: "module"
    });
    let alterations = [];
    let imports = [];
    let exports = {};
    const handlers = {
        ImportDeclaration(import_node) {
            let the_import = {
                specifier: import_node.source.value
            };
            import_node.specifiers.forEach(function (specifier_node) {
                const {type, local, imported} = specifier_node;
                if (type === "ImportDefaultSpecifier") {
                    the_import.default = local.name;
                }
                if (type === "ImportSpecifier") {
                    if (the_import.names === undefined) {
                        the_import.names = {};
                    }
                    the_import.names[imported.name] = local.name;
                }
                if (type === "ImportNamespaceSpecifier") {
                    the_import.names = local.name;
                }
            });
            imports.push(the_import);
            alterations.push([import_node, ""]);
        },
        ExportDefaultDeclaration(export_node) {
            exports.default = "$default";
            alterations.push([
                {
                    start: export_node.start,
                    end: export_node.declaration.start
                },
                "const $default = "
            ]);
        },
        ExportNamedDeclaration(export_node) {
            export_node.specifiers.forEach(function (specifier_node) {
                const {local, exported} = specifier_node;
                exports[exported.name] = local.name;
            });
            alterations.push([export_node, ""]);
        },
        ExportAllDeclaration(export_node) {
            if (exports["*"] === undefined) {
                exports["*"] = [];
            }
            exports["*"].push(imports.length);
            imports.push({
                specifier: export_node.source.value,
                names: "$import_" + imports.length
            });
            alterations.push([export_node, ""]);
        }
    };
    tree.body.forEach(
        function (node) {
            const handler = handlers[node.type];
            if (handler !== undefined) {
                return handler(node);
            }
        }
    );
    return {
        script: alter_string(source, alterations),
        imports,
        exports
    };
}

export default Object.freeze(scriptify_module);
