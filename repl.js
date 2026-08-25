// This is the generic REPL. It provides functionality common to all of
// Replete's REPLs, which have a common interface. This is the general shape
// of a REPL:

//                      +----------------+
//                      |                |
//                      |      You       |
//                      |                |
//                      +--+-------------+
//                         |          ^
//                         |          |
//                      message   evaluation
//                         |          |
//                         v          |
//   +--------------------------------+------------------+    +----------------+
//   |                                                   |    |                |
//   |                         REPL                      |<-->|  Capabilities  |
//   |                                                   |    |                |
//   +--------+-----------------------------------+------+    +----------------+
//            |        ^        ^        ^        |
//            |        |        |        |        |
//            |        |        |        |        |
//          eval     report    out      err    imports
//            |        |        |        |    (via HTTP)
//            |        |        |        |        |
//            |        |        |        |        |
//            v        |        |        |        v
//   +-----------------+--------+--------+-----------------+
//   |                                                     |
//   |                       Padawan                       |
//   |                                                     |
//   +-----------------------------------------------------+

// A REPL instance is an object with the following methods:

//      start()
//          Starts the REPL, returning a Promise that resolves once it is safe
//          to call 'send'.

//      send(message, on_result)
//          Evaluates the source code of the 'message' in every connected
//          padawan. A Promise is returned, which rejects if there was a problem
//          communicating with any of the padawans.

//          The 'on_result' function is called with each padawan's result. If
//          evaluation succeeded, the first parameter is a string representation
//          of the evaluated value. Otherwise the first parameter is undefined
//          and the second parameter is a string representation of the
//          exception.

//          Usually a REPL has exactly one padawan, but this interface permits a
//          REPL to evaluate source in multiple padawans concurrently.

//      stop()
//          Stops the REPL. It returns a Promise that resolves once the system
//          resources in use by the REPL have been released.

// Discussed below are several expectations that a programmer might reasonably
// have of a JavaScript REPL.

// +--------------+
// | Redefinition |
// +--------------+

// In a REPL, source code is evaluated over and over again in the same scope.
// The first time

//      let greeting = "Hello";

// is evaluated there is no problem. However, subsequent evaluations will throw
// an exception because the 'greeting' identifier is already declared, and an
// identifier may not be declared twice.

// To avoid such exceptions, Replete transforms declarations into assignments
// prior to evaluation:

//      greeting = "Hello";

// +------------+
// | Continuity |
// +------------+

// Another expectation we have of the REPL is that the value of each variable is
// preserved for future evaluations. If we now evaluated

//      greeting + ", World!";

// we would expect "Hello, World!", not "undefined, World!" or an exception. We
// should be able to modify the 'greeting' variable like

//      greeting = "Goodbye";

// and overwrite the old value. It should be possible to update a variable in a
// future turn, like

//      setTimeout(function () {
//          greeting = "Goodbye";
//      });

// Likewise, we should be able to redeclare top-level functions.

// The naive approach is to write to a global variable of the same name, but
// doing so can overwrite actual global variables, making them permanently
// unavailable to future evaluations. For example, a script declaring the
// variable

//      const console = 1;

// would overwrite the global 'console' variable, preventing any future calls
// to 'globalThis.console.log'.

// Replete takes a more sophisticated approach. A variable named '$scope' is
// defined, which is an object holding the value of every declared identifier.
// Declarations are replaced with assignments, and the whole script is
// evaluated in this artificial scope.

//      $scope.greeting;     // "Hello"
//      with ($scope) {
//          greeting = "Goodbye";
//      }
//      $scope.greeting;     // "Goodbye"

// Additionally, it should be possible to reference the values from previous
// evaluations, for example to drill down into a deeply nested value. Replete
// makes this possible by storing the result of the previous evaluation in a
// variable named '$value'.

// +------------+
// | Separation |
// +------------+

// It is usually desirable to maintain a separate scope per file. This means
// that identifiers declared in one module can not interfere with the
// evaluation of another:

//  module_a.js:
//      const console = false;

//  module_b.js:
//      console.log("Hello, World!");

// In Replete, many $scope objects can coexist within the one padawan. For each
// evaluation, a scope is chosen by name.

// Whilst declarations are kept separate, it should be noted that each scope
// shares the same global object. If total isolation is desired, multiple
// REPLs (each with a single scope) can be used instead.

// +---------+
// | Modules |
// +---------+

// Usually, an application is made up of modules. And usually, a module is
// composed of other modules. JavaScript has an 'import' statement, used to
// acquire the interface of another module. Replete supports the evaluation
// of 'import' statements, making it possible to evaluate modules (and even
// whole applications) in the REPL.

// At the heart of each padawan is the global 'eval' function. eval, being
// immediate in nature, does not support the import statement.

//      SyntaxError: Cannot use import statement outside a module

// When evaluating a fragment of source code, Replete removes from it any import
// or export statements, leaving a bare script that can be passed to eval. The
// requisite modules are instead imported via the import() function, and the
// importations placed within the scope of the script as it is eval'd.

// The source code of each imported module is provided to the padawan via HTTP.
// A URL is passed to the import() function, generating a request to an HTTP
// server controlled by Replete. This means Replete can modify the source code
// of modules as required.

// +-----------+
// | Freshness |
// +-----------+

// When an 'import' statement is evaluated, it is reasonable to expect that the
// freshest version of the module be used, rather than a stale version from the
// cache. Frustratingly, JavaScript runtimes cache each module for the lifetime
// of the application. If modules were always immutable and pure, such a
// draconian measure would not have been necessary. Alas, modules are permitted
// to hold state. Such modules are little better than mutable global
// variables.

// The only way to defeat the module cache is to vary the specifier passed to
// import(). But this means that a module's specifier must vary not only when
// its own source changes, but when the source of any of its descendants
// change! This is illustrated in the following scenario.

//      source -> a.js -> b.js // source imports a.js, which imports b.js

// After evaluating the source, a.js and b.js are cached. Changes to these files
// are not reflected in future evaluations.

// Replete's solution is to include a version in the specifier, varying the
// version whenever the module or its descendants are modified. In this way,
// the module cache is used to obtain a performance benefit without the
// staleness.

// +-------+
// | Speed |
// +-------+

// Evaluation should be instantaneous, or close to it. That is the best possible
// feedback loop, greatly improving the programmer's productivity and sense of
// wellbeing. Replete tries to satisfy the expectations of both speed and
// freshness, but it is not pretty because they conflict.

// Usually, the vast majority of evaluation time is spent importing modules.
// Consider the following module tree:

//      source -> a.js -> b.js -> c.js

// The padawan will perform between zero and three network roundtrips whilst
// evaluating the source, depending on the state of the module cache. The
// module tree is traversed from top to bottom.

// Within the Replete process, however, the module tree is traversed from bottom
// to top. This is because a module's specifier depends on its descendants, as
// explained in the Freshness section above. Worse, whole subtrees are
// traversed for each module requested. The amount of duplicated work grows
// exponentially as the module tree deepens.

//      a
//    /   \      If it took Replete 1 unit of work to read, parse and transform
//   b1   b2     a single module, then importing module 'a' would cost a
//  / \   / \    whopping 17 units of work, rather than the expected 7.
// c1 c2 c3 c4

// Replete mitigates this explosion by caching its most expensive operations. I
// am on the lookout for a better solution.

// +------------+
// | Strictness |
// +------------+

// ES5 introduced "strict mode", an opt-in feature that repaired some of
// JavaScript's flaws. Within an ES6 module, strict mode is no longer opt-in.
// It is the default mode of execution. Because Replete is an evaluator for
// modules, it evaluates all JavaScript in strict mode.

// +--------------+
// | Traceability |
// +--------------+

// When evaluation fails due to an exception, its stack trace may contain useful
// debugging information, such as line numbers and function names. Replete
// attempts to preserve the integrity of both of these.

// +-------------+
// | Eventuality |
// +-------------+

// JavaScript's 'await' keyword magically suspends execution whilst a Promise is
// fulfilled. REPL support for 'await' at the top level makes ad hoc scripting
// a bit more convenient, but is tricky to implement because 'eval' throws when
// it encounters a top-level 'await'.

// The only way to evaluate source containing 'await' is to wrap the source in
// an async function and call it, then wait for the returned Promise to
// resolve. The difficulty here is that we lose eval's intrinsic ability to
// return its trailing value. We emulate this behavior by assigning every
// value-producing statement to an '$await' variable and returning it.

// Thus, source like

//      let response;
//      if (do_fetch) {
//          response = await fetch("https://site.com");
//          await response.json();
//      } else {
//          console.log("Skipping.");
//      }

// becomes

//      (async function () {
//          let $await;
//          let response;
//          if (do_fetch) {
//              $await = response = await fetch("https://site.com");
//              $await = await response.json();
//          } else {
//              $await = console.log("Skipping.");
//          }
//          return $await;
//      }());

// +-----------+
// | Wholeness |
// +-----------+

// A module should be able to demonstrate its own correctness. To do so, parts
// of it can be written as an executable program. It is poor form, however,
// for module to exhibit side effects when imported by another module and so
// some mechanism must be used to conditionally enable some of the module's
// functionality.

// To this end, Replete replaces each occurrence of 'import.meta.main' with
// 'true' prior to evaluation.

// Thus

//      if (import.meta.main) {
//          console.log(check_thing());
//      }

// becomes

//      if (true) {
//          console.log(check_thing());
//      }

// The 'import.meta.main' property is informally standardized as part of
// WinterCG, and is supported by at least two runtimes.

/*jslint web, global */

import {parse} from "acorn";
import {simple, recursive} from "acorn-walk";

const rx_relative_path = /^\.\.?\//;

function fill(template, substitutions) {

// The 'fill' function prepares a script template for execution. As an example,
// all instances of <the_force> found in the 'template' will be replaced with
// 'substitutions.the_force'.

    return template.replace(/<([^<>]*)>/g, function (original, filling) {
        return substitutions[filling] ?? original;
    });
}

function alter_string(string, alterations) {

// The 'alter_string' function applies an array of substitutions to a string.
// The ranges of the alterations must be disjoint. The 'alterations' parameter
// is an array of arrays like [range, replacement] where the range is an object
// like {start, end}.

    alterations = alterations.slice().sort(
        function compare(a, b) {
            return a[0].start - b[0].start || a[0].end - b[0].end;
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

function test_alter_string() {
    const altered = alter_string("..234.6.8.", [
        [{start: 6, end: 7}, ""],
        [{start: 6, end: 6}, "six"],
        [{start: 8, end: 9}, "eight"],
        [{start: 2, end: 5}, "twothreefour"]
    ]);
    if (altered !== "..twothreefour.six.eight.") {
        throw new Error("FAIL");
    }
}

function parse_module(source) {
    return parse(source, {ecmaVersion: "latest", sourceType: "module"});
}

function analyze_module(tree) {

// The 'analyze_module' function statically analyzes a module to find any
// imports, exports, and dynamic specifiers. The 'tree' parameter is the
// module's parsed source code.

// An analysis object is returned, containing the following properties:

//      imports
//          An array of objects representing the parsed import statements. Each
//          object contains the following properties:

//              node
//                  The import statement node.

//                      import "./fridge.js";
//                      -> {
//                          node: {
//                              start: 0,
//                              end: 21,
//                              source: {
//                                  start: 7,
//                                  end: 20,
//                                  value: "./fridge.js",
//                              }
//                          },
//                          ...
//                      }

//              default
//                  The name of the default import, if any.

//                      import fruit from "./apple.js";
//                      -> {default: "fruit", ...}

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
//                          ...
//                      }

//                  If the statement imports every member as a single
//                  identifier, this property is instead a string.

//                      import * as creatures from "./animals.js";
//                      -> {names: "creatures", ...}

//                  If the statement does not import any named members, this
//                  property is omitted.

//      exports
//          An array of export statement nodes.

//              export default 1 + 2;
//              export {rake};
//              export * from "./dig.js";
//              -> [
//                  {
//                      type: "ExportDefaultDeclaration",
//                      start: 0,
//                      end: 21,
//                      declaration: {start: 15, end: 20}
//                  },
//                  {
//                      type: "ExportNamedDeclaration",
//                      start: 22,
//                      end: 36
//                  },
//                  {
//                      type: "ExportAllDeclaration,
//                      start: 37,
//                      end: 62
//                  }
//              ]

//      dynamics
//          An array whose elements represent occurrences of the following
//          forms:

//              import("<specifier>")
//              import.meta.resolve("<specifier>")
//              new URL("<specifier>", import.meta.url)

//          Each element is an object with a "value" property, containing the
//          <specifier>, and "module" and "script" properties, both of which
//          are ranges indicating an area of the source to be replaced by a
//          string literal containing the resolved specifier.

//          If the source is to be imported as a module, use the "module" range.
//          If the source is to be evaluated as a script, replace the "script"
//          property.

//          The caller can use this information to rewrite the above forms
//          into

//              import("/path/to/my_module.js")
//              "/path/to/my_module.js"
//              new URL("/path/to/my_module.js", import.meta.url)

//          once the specifiers have been resolved.

//      mains
//          An array of 'import.meta.main' nodes.

    let imports = [];
    let exports = [];
    let dynamics = [];
    let mains = [];

// Walk the whole tree, examining every statement and expression. This is
// necessary because 'import.meta' can appear basically anywhere.

    simple(tree, {
        ImportDeclaration(node) {
            let the_import = {node};
            node.specifiers.forEach(function (specifier_node) {
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
        },
        ExportDefaultDeclaration(node) {
            exports.push(node);
        },
        ExportNamedDeclaration(node) {
            exports.push(node);
        },
        ExportAllDeclaration(node) {
            exports.push(node);
        },
        ImportExpression(node) {
            if (typeof node.source.value === "string") {

// Found import("<specifier>").

                dynamics.push({
                    value: node.source.value,
                    module: node.source,
                    script: node.source
                });
            }
        },
        CallExpression(node) {
            if (
                node.callee.type === "MemberExpression"
                && node.callee.object.type === "MetaProperty"
                && node.callee.property.name === "resolve"
                && node.arguments.length === 1
                && typeof node.arguments[0].value === "string"
            ) {

// Found import.meta.resolve("<specifier>").

                dynamics.push({
                    value: node.arguments[0].value,
                    module: node,
                    script: node
                });
            }
        },
        MemberExpression(node) {
            if (
                node.object.type === "MetaProperty"
                && node.object.meta.name === "import"
                && node.object.property.name === "meta"
                && node.property.name === "main"
            ) {

// Found import.meta.main.

                mains.push(node);
            }
        },
        NewExpression(node) {
            if (
                node.callee.name === "URL"
                && node.arguments.length === 2
                && node.arguments[0].type === "Literal"
                && typeof node.arguments[0].value === "string"
                && rx_relative_path.test(node.arguments[0].value)
                && node.arguments[1].type === "MemberExpression"
                && node.arguments[1].object.type === "MetaProperty"
                && node.arguments[1].property.name === "url"
            ) {

// Found new URL("<specifier>", import.meta.url).

// This form should be removed once the import.meta.resolve form is widely
// supported, then we can dispense with the "module" and "script" properties
// below.

                dynamics.push({
                    value: node.arguments[0].value,

// The import.meta.url is permitted in a module, but not in a script. It is
// required as a second parameter to URL when the specifier resolves to an
// absolute path, rather than a fully qualified URL.

                    module: node.arguments[0],
                    script: {
                        start: node.arguments[0].start,
                        end: node.arguments[1].end
                    }
                });
            }
        }
    });
    return {imports, exports, dynamics, mains};
}

function run_analyzer(analyzer, source) {
    return [
        analyzer(parse_module(source)),
        function range({start, end}) {
            return source.slice(start, end);
        }
    ];
}

function test_analyze_module() {
    const [analysis, range] = run_analyzer(analyze_module, `
        import a, {b as B} from "./a.js";
        import c, * as d from "./d.js";
        const h = import("./h.js");
        const i = import.meta.resolve("./i.js");
        const j = new URL("./j.js", import.meta.url);
        const k = import.meta.main;
        export {h as H};
        export default i;
        export * from "./k.js";
        export {m} from "./m.js";
    `);
    const [import_a, import_c] = analysis.imports;
    const [dynamic_h, dynamic_i, dynamic_j] = analysis.dynamics;
    const [export_h, export_i] = analysis.exports;
    const [main_k] = analysis.mains;
    if (
        analysis.imports.length !== 2
        || import_a.default !== "a"
        || import_a.names.b !== "B"
        || !range(import_a.node).startsWith("import")
        || !range(import_a.node).endsWith(";")
        || import_c.default !== "c"
        || import_c.names !== "d"
        || analysis.dynamics.length !== 3
        || dynamic_h.value !== "./h.js"
        || range(dynamic_h.module) !== "\"./h.js\""
        || range(dynamic_h.script) !== "\"./h.js\""
        || analysis.mains.length !== 1
        || range(main_k) !== "import.meta.main"
        || dynamic_i.value !== "./i.js"
        || range(dynamic_i.module) !== "import.meta.resolve(\"./i.js\")"
        || range(dynamic_i.script) !== "import.meta.resolve(\"./i.js\")"
        || dynamic_j.value !== "./j.js"
        || range(dynamic_j.module) !== "\"./j.js\""
        || range(dynamic_j.script) !== "\"./j.js\", import.meta.url"
        || analysis.exports.length !== 4
        || !range(export_h).startsWith("export")
        || !range(export_h).endsWith(";")
        || range(export_i.declaration) !== "i"
    ) {
        throw new Error("FAIL");
    }
}

function analyze_top(tree) {

// The 'analyze_top' function statically analyzes the top-level scope of a
// module to find any await expressions or expression statements.

// An analysis object is returned, containing the following properties:

//      values
//          An array of top-level value-producing statement nodes. The evaluated
//          value is always the last of these to be executed.

//      wait
//          Whether the module contains any top-level await expressions. Just
//          one of these is sufficient to prevent immediate evaluation.


    let values = [];
    let wait = false;

// Walk the top level only, skipping the contents of function bodies.

    recursive(tree, undefined, {
        Function() {
            return;
        },
        ExpressionStatement(node, _, c) {
            values.push(node);
            c(node.expression);
        },
        VariableDeclaration(variable_node, _, c) {

// Variable declarations become expression statements once transformed into
// assignments.

            variable_node.declarations.forEach(function (declarator_node) {
                if (declarator_node.init) {
                    values.push(declarator_node.init);
                }
                c(declarator_node);
            });
        },
        AwaitExpression() {
            wait = true;
        },
        ForOfStatement(node, _, c) {
            if (node.await === true) {
                wait = true;
            }
            c(node.body);
        }
    });
    return {values, wait};
}

function test_analyze_top_immediate() {
    const [analysis, range] = run_analyzer(analyze_top, `
        if (a) {
            b(async c => await d);
        } else {
            e;
        }
        f;
        const [g] = [h];
    `);
    if (
        analysis.wait !== false
        || analysis.values.length !== 4
        || range(analysis.values[0]) !== "b(async c => await d);"
        || range(analysis.values[1]) !== "e;"
        || range(analysis.values[2]) !== "f;"
        || range(analysis.values[3]) !== "[h]"
    ) {
        throw new Error("FAIL");
    }
}

function test_analyze_top_eventual() {
    const [analysis, range] = run_analyzer(analyze_top, `
        if (a) {
            b(await c);
        } else {
            d;
        }
        function e() {
            f();
        }
        g;
        let h = i;
        let j = await k;
    `);
    if (
        analysis.wait !== true
        || analysis.values.length !== 5
        || range(analysis.values[0]) !== "b(await c);"
        || range(analysis.values[1]) !== "d;"
        || range(analysis.values[2]) !== "g;"
        || range(analysis.values[3]) !== "i"
        || range(analysis.values[4]) !== "await k"
    ) {
        throw new Error("FAIL");
    }
}

function test_analyze_top_eventual_default() {
    const [analysis, range] = run_analyzer(analyze_top, `
        let [a = await b] = c;
    `);
    if (
        analysis.wait !== true
        || analysis.values.length !== 1
        || range(analysis.values[0]) !== "c"
    ) {
        throw new Error("FAIL");
    }
}

function all_specifiers(module_analysis) {

// Return any import and dynamic specifier strings mentioned in the analysis.

    return [
        ...module_analysis.imports.map(function (the_import) {
            return the_import.node.source.value;
        }),
        ...module_analysis.dynamics.map(function (the_dynamic) {
            return the_dynamic.value;
        }),
        ...module_analysis.exports.filter(function (the_export) {
            return the_export.source;
        }).map(function (the_export) {
            return the_export.source.value;
        })
    ];
}

function blanks(source, range) {

// Return some blanks lines to append to a replacement, so that it matches the
// number of lines of the original text. This is sometimes necessary to
// maintain line numbering.

    return "\n".repeat(
        source.slice(range.start, range.end).split("\n").length - 1
    );
}

const script_template = `

// Ensure that the global $scopes variable is available. It contains scope
// objects that persist the state of identifiers across evaluations.

// The only reliable way to store values is to attach them to the global object.
// We get a reference to the global object via 'this' because it is a strategy
// that works in every runtime, so long as this script is evaluated in
// non-strict mode.

    if (this.$scopes === undefined) {
        this.$scopes = Object.create(null);
    }
    if ($scopes[<scope_name_string>] === undefined) {
        $scopes[<scope_name_string>] = Object.create(null);
        $scopes[<scope_name_string>].$default = undefined;
        $scopes[<scope_name_string>].$value = undefined;
    }

// Retrieve the named scope. We use a var because it can be redeclared without
// raising an exception, unlike a const.

    var $scope = $scopes[<scope_name_string>];

// Check that the imported modules exported the requested identifiers.

    <imports_array_literal>.forEach(function ([import_nr, specifier, name]) {
        if (!Object.hasOwn($imports[import_nr], name)) {
            throw new Error(
                "Module " + specifier + " does not export '" + name + "'."
            );
        }
    });

// Populate the scope with the script's declared identifiers. Every identifier,
// including those from previous evaluations, are simulated as local variables.
// This means that scripts are free to shadow global variables, without risk of
// interfering with the global object.

    Object.assign($scope, <identifiers_object_literal>);

// The 'with' statement has a bad reputation, and is not even allowed in strict
// mode. However, I can not think of a way to avoid using it here. It allows us
// to use the scope object as an actual scope. It has the other advantage that
// variable assignments taking place in future turns correctly update the
// corresponding properties on the scope object.

// If the scope object had a prototype, properties on the prototype chain of the
// scope object (such as toString) could be dredged up and misinterpreted as
// identifiers. To avoid this hazard, the scope object was made without a
// prototype.

    with ($scope) {
        $value = (function () {

// Evaluate the payload script in strict mode. We enforce strict mode because
// the payload script originates from a module, and modules are always run in
// strict mode.

            "use strict";
            return eval(<payload_script_string>);
        }());
    }
`;

function make_imports_array_literal(imports) {
    let elements = [];
    imports.forEach(function (the_import, import_nr) {
        if (the_import.default !== undefined) {
            elements.push([import_nr, the_import.node.source.value, "default"]);
        }
        if (typeof the_import.names === "object") {
            Object.keys(the_import.names).forEach(function (name) {
                elements.push([
                    import_nr,
                    the_import.node.source.value,
                    name
                ]);
            });
        }
    });
    return JSON.stringify(elements);
}

function make_identifiers_object_literal(variables, imports) {
    const members = [];

// Variables are initialized to undefined.

    variables.forEach(function (name) {
        members.push(name + ": undefined");
    });

// The values of the importations are extracted from the $imports array, which
// is assumed to have been declared in an outer scope.

    imports.forEach(function (the_import, import_nr) {
        if (the_import.default !== undefined) {
            members.push(
                the_import.default
                + ": $imports[" + import_nr + "].default"
            );
        }
        if (typeof the_import.names === "string") {
            members.push(the_import.names + ": $imports[" + import_nr + "]");
        }
        if (typeof the_import.names === "object") {
            Object.keys(the_import.names).forEach(function (name) {
                members.push(
                    the_import.names[name]
                    + ": $imports[" + import_nr + "]." + name
                );
            });
        }
    });
    return "{" + members.join(", ") + "}";
}

function pattern_name(node) {
    return (
        node.type === "AssignmentPattern"
        ? node.left.name    // let [a = 42] = ...
        : node.name         // let [a] = ...
    );
}

function replize(
    source,
    tree,
    module_analysis,
    top_analysis,
    dynamic_specifiers,
    scope = ""
) {

// The 'eval' function can not handle import or export statements. The 'replize'
// function transforms 'source' such that it is safe to eval, wrapping it in a
// harness to give it the REPL behavior described at the top of this file. It
// takes the following parameters:

//      source
//          A string containing the module's source code.

//      tree
//          The module's source as a parsed tree.

//      module_analysis
//          An object returned by the 'analyze_module' function.

//      top_analysis
//          An object returned by the 'analyze_top' function.

//      dynamic_specifiers
//          An array containing the dynamic specifiers to be injected.

//      scope
//          The name of the scope to use for evaluation. If the scope does not
//          exist, it is created.

// The resulting script contains a free variable, $imports, that is expected to
// be an array containing the imported module objects.

// Another free variable, $default, is assigned the default exportation, if
// there is one.

//      ORIGINAL                       | REWRITTEN
//                                     |
//      import frog from "./frog.js"   |
//      export default 1 + 1;          | $default = 1 + 1;
//      export {frog};                 |
//      export * from "./lizard.js";   |

// Notice how the import and export statements are stripped from the resulting
// script.

    let alterations = [];
    let variables = [];

// Transform imports:
//  - Import statements are removed.
//  - The argument passed to import() is replaced with a string literal.
//  - Each call to import.meta.resolve is replaced with a string literal.
//  - All references to import.meta.main are replaced with 'true'.

    module_analysis.imports.forEach(function ({node}) {
        return alterations.push([node, blanks(source, node)]);
    });
    module_analysis.dynamics.forEach(function (dynamic, dynamic_nr) {
        return alterations.push([
            dynamic.script,
            "\""
            + dynamic_specifiers[dynamic_nr]
            + "\""
            + blanks(source, dynamic.script)
        ]);
    });
    module_analysis.mains.forEach(function (main) {
        return alterations.push([main, "true"]);
    });
    const handlers = {
        VariableDeclaration(variable_node) {

// Variable declarations (var, let and const statements) are rewritten as
// assignments to local variables. This avoids exceptions when repeatedly
// evaluating similar declarations in the same context.

// Discard the var, let or const keyword. This turns the statement into a
// comma-separated list of assignments.

            alterations.push([
                {
                    start: variable_node.start,
                    end: variable_node.declarations[0].start
                },
                ""
            ]);
            variable_node.declarations.forEach(function (declarator_node) {
                const {id, init} = declarator_node;
                if (init) {

// A variable has been declared and initialized.

                    if (id.type === "ObjectPattern") {
                        variables.push(
                            ...id.properties.map(function (property_node) {
                                return pattern_name(property_node.key);
                            })
                        );

// Parenthesize the assignment if it is a destructured assignment, otherwise it
// will be misinterpreted as a naked block.

                        alterations.push([
                            {
                                start: id.start,
                                end: id.start
                            },
                            "("
                        ]);
                        alterations.push([
                            {
                                start: init.end,
                                end: init.end
                            },
                            ")"
                        ]);
                    } else if (id.type === "ArrayPattern") {
                        variables.push(...id.elements.map(pattern_name));
                    } else {
                        variables.push(id.name);
                    }
                } else {

// An uninitialized variable has been declared. Reinitialize it as undefined.

                    alterations.push([
                        {
                            start: id.end,
                            end: id.end
                        },
                        " = undefined"
                    ]);
                    variables.push(id.name);
                }
            });
        },
        FunctionDeclaration(node) {

// Function statements can be reevaluated without issue. However, a function
// statement causes a new variable to be declared in the current scope, rather
// than updating the variable in the parent scope. A naive approach would be to
// turn the function statement into an assignment statement, but that prevents
// the function from being hoisted.

            variables.push(node.id.name);

// Our strategy is to prefix a dollar symbol to the function name

            alterations.push([node.id, "$" + node.id.name]);

// and assign its hoisted value to the appropriate scope variable. The
// assignment statement is placed at the very start of the script. A newline
// would improve readability, but would also affect the line numbering and so
// is omitted.

            alterations.push([
                {start: 0, end: 0},
                node.id.name + " = $" + node.id.name + ";"
            ]);

// This strategy has the desirable effect that functions evaluated in the same
// scope are loosely referenced. Suppose we evaluate the following two
// functions:

//      function apple() {
//          return "red";
//      }
//      function fruit() {
//          return apple();
//      }

// We then modify apple to return "green". After reevaluating apple, we find
// that fruit now also returns "green". If fruit held a tight reference to the
// original apple function then it would continue returning "red" until it was
// reevaluated. But because apple is rewritten $apple, the function referenced
// by $fruit is actually $scope.apple, which returns "green".

        },

// Transform exports:
//  - The default export is turned into an assignment to $default.
//  - Exported declarations have their 'export' keyword stripped.
//  - All other exports are removed.

        ExportAllDeclaration(node) {
            alterations.push([node, blanks(source, node)]);
        },
        ExportDefaultDeclaration(node) {
            const declaration_handler = handlers[node.declaration.type];
            if (declaration_handler !== undefined && node.declaration.id) {

// The default export is a named class or function declaration. Function
// declarations are subject to hoisting.

                declaration_handler(node.declaration);
                alterations.push([
                    {
                        start: node.start,
                        end: node.declaration.start
                    },
                    "$default = " + node.declaration.id.name + ";"
                ]);
            } else {

// The default export is an expression or an anonymous function declaration.

                alterations.push([
                    {
                        start: node.start,
                        end: node.declaration.start
                    },
                    "$default = "
                ]);
            }
        },
        ExportNamedDeclaration(node) {
            if (node.declaration) {

// Variable, class, or function declarations may be prefixed by an 'export'
// keyword. Handle the declaration as per usual after removing the 'export'.

                alterations.push([
                    {start: node.start, end: node.declaration.start},
                    ""
                ]);
                const declaration_handler = handlers[node.declaration.type];
                if (declaration_handler !== undefined) {
                    declaration_handler(node.declaration);
                }
            } else {
                alterations.push([node, blanks(source, node)]);
            }
        },
        ClassDeclaration(node) {

// Class declarations are similar to function declarations, but they are not
// hoisted and can not be repeated. This requires a totally different strategy.

            variables.push(node.id.name);

// We turn the statement into an expression, and assign it to the local
// variable.

            alterations.push([
                {
                    start: node.start,
                    end: node.start
                },
                node.id.name + " = "
            ]);
            alterations.push([
                {
                    start: node.end,
                    end: node.end
                },
                ";"
            ]);
        }
    };

// Examine each top-level statement in the script, passing it to the relevant
// handler for transformation.

    tree.body.forEach(function (node) {
        const handler = handlers[node.type];
        if (handler !== undefined) {
            return handler(node);
        }
    });

// If a top-level await is present, the module must be evaluated within an async
// function. The function returns its trailing value.

    if (top_analysis.wait) {
        alterations.unshift([
            {start: 0, end: 0},
            "(async function () {let $await;"
        ]);
        alterations.push([
            {start: source.length, end: source.length},
            "\nreturn $await;}());"
        ]);
        top_analysis.values.forEach(function (node) {
            alterations.push([
                {start: node.start, end: node.start},
                "$await = "
            ]);
        });
    }
    return fill(
        script_template,
        {
            imports_array_literal: make_imports_array_literal(
                module_analysis.imports
            ),
            identifiers_object_literal: make_identifiers_object_literal(
                variables,
                module_analysis.imports
            ),
            scope_name_string: JSON.stringify(scope),
            payload_script_string: JSON.stringify(alter_string(
                source,
                alterations
            ))
        }
    );
}

function run_replize(
    source,
    scope = String(Math.random()),
    dynamic_specifiers = []
) {
    const tree = parse_module(source);
    return replize(
        source,
        tree,
        analyze_module(tree),
        analyze_top(tree),
        dynamic_specifiers,
        scope
    );
}

function test_replize_continuity() {
    const script = `
        const x = "x";
            let y = "y";
        z();
        function z() {
            return "z";
        }
        let uninitialized;
        const special_string_replacement_pattern = "$'";
          const {
            a,
            b
        } = {
            a: "a",
            b: "b"
        };
        let [c, d] = [a, b];
        (function () {
            const c = "not c";
        }());
        const e = import.meta.resolve("!e");
        export function f() {
            return "f";
        }
        export const g = "g";
        let {h = "h"} = {};
    `;
    const gather = `
        (function () {
            return [x, y, z(), a, b, c, d, e, f(), g, h];
        }());
    `;
    const scope = String(Math.random());
    const results = [script, script, ""].map(function (script) {
        return globalThis.eval(
            run_replize(script + "\n" + gather, scope, ["e"])
        );
    });
    if (results.some(function (array) {
        return array.join(" ") !== "x y z a b a b e f g h";
    })) {
        throw new Error("FAIL");
    }
}

function test_replize_delayed_assignment() {
    const scope = String(Math.random());
    globalThis.eval(run_replize(
        `
            let x = false;
            setTimeout(function () {
                x = true;
            });
        `,
        scope
    ));
    return setTimeout(function () {
        if (!globalThis.eval(run_replize("x;", scope))) {
            throw new Error("FAIL");
        }
    });
}

function test_replize_strict_mode() {
    let did_throw = false;
    try {
        globalThis.eval(run_replize(`
            (function () {
                x = true;
            }());
        `));
    } catch (_) {
        did_throw = true;
    }
    if (!did_throw) {
        throw new Error("FAIL");
    }
}

function test_replize_top_level_await() {
    const timer = setTimeout(function () {
        throw new Error("FAIL timeout");
    });
    globalThis.eval(run_replize(`
        if (true) {
            let a;
            a = await 42;
            a + 1;
        }
    `)).then(function (value) {
        clearTimeout(timer);
        if (value !== 43) {
            throw new Error("FAIL");
        }
    });
}

function test_replize_declare_await() {
    const timer = setTimeout(function () {
        throw new Error("FAIL timeout");
    });
    globalThis.eval(run_replize(`
        let a = await 1;
        let [b = await 2] = [];
        let {c = await 3} = {};
        a + b + c;
    `)).then(function (value) {
        clearTimeout(timer);
        if (value !== 6) {
            throw new Error("FAIL");
        }
    });
}

function test_replize_main() {
    const value = globalThis.eval(run_replize(`
        if (import.meta.main) {
            "OK"
        }
    `));
    if (value !== "OK") {
        throw new Error("FAIL");
    }
}

function test_replize_exports() {
    const value = globalThis.eval(run_replize(`
        const a = 1;
        export {a};
        export const b = a + e();
        export {c} from "./c.js";
        export * from "./d.js";
        export default function e() {
            return 2;
        }
        b + 3
    `));
    if (value !== 6) {
        throw new Error("FAIL");
    }
}

function test_replize_export_default_anonymous_function() {
    const value = globalThis.eval(run_replize(`
        export default function () {
            return 1;
        }
        $default()
    `));
    if (value !== 1) {
        throw new Error("FAIL");
    }
}

function test_replize_export_default_anonymous_class() {
    const value = globalThis.eval(run_replize(`
        export default class {
            a() {
                return 1;
            }
        }
        new $default().a()
    `));
    if (value !== 1) {
        throw new Error("FAIL");
    }
}

const utf8_encoder = new TextEncoder();

function digest(...args) {

// The 'digest' function produces a non-cryptographic hash of its arguments. The
// returned Promise resolves to the hex-encoded hash string.

    const text = args.join(",");
    return crypto.subtle.digest(
        "SHA-1",
        utf8_encoder.encode(text)
    ).then(function (array_buffer) {
        return Array.from(
            new Uint32Array(array_buffer),
            function hexify(uint32) {
                return uint32.toString(16).padStart(5, "0");
            }
        ).join(
            ""
        );
    });
}

const utf8_decoder = new TextDecoder("utf-8", {fatal: true});
const rx_versioned_locator = /^file:\/\/\/v([^\/]+)\/([^\/]+)(.*)$/;

// Capturing groups:
//  [1] The version
//  [2] The unguessable
//  [3] The locator

function make_repl(capabilities, on_start, on_eval, on_stop, specify) {

// The 'make_repl' function returns a new REPL instance. It takes the
// following parameters:

//      capabilities
//          An object containing the Replete capability functions.

//      on_start()
//          A function that does any necessary setup work, such as starting an
//          HTTP server.

//      on_eval(
//          on_result,
//          produce_script,
//          dynamic_specifiers,
//          import_specifiers,
//          wait
//      )
//          A function that evaluates the script in each connected padawan. It
//          takes the following parameters:

//              on_result
//                  The same as the 'on_result' function passed to the 'send'
//                  method, described above.

//              produce_script
//                  A function that takes an array of dynamic specifiers and
//                  returns the eval-friendly script string. This provides an
//                  opportunity to customize the dynamic specifiers.

//              dynamic_specifiers
//                  The array of dynamic specifier strings.

//              import_specifiers
//                  The array of import specifier strings.

//              wait
//                  Whether to wait for the evaluated value to resolve, if it is
//                  a Promise.

//          The returned Promise rejects if there was a problem communicating
//          with any of the padawans.

//      on_stop()
//          A function responsible for releasing any resources in use by the
//          REPL. It should return a Promise that resolves once it is done.

//      specify(locator)
//          A function that transforms each locator before it is provided as a
//          specifier to a padawan.

    function is_module(locator) {
        if (locator.startsWith("file:///")) {
            const headers = capabilities.headers(locator);
            if (headers !== undefined) {
                return Object.entries(headers).some(function ([name, value]) {
                    return (
                        name.toLowerCase() === "content-type"
                        && value.toLowerCase().startsWith("text/javascript")
                    );
                });
            }
        }
        return false;
    }

// These variables constitute the REPL's in-memory cache. Each variable holds an
// object, containing locators as keys and Promises as values. By caching the
// Promise and not the value, multiple callers can subscribe to the result of a
// single operation, even before it has finished.

    let locating = Object.create(null);
    let reading = Object.create(null);
    let source_hashing = Object.create(null);
    let analyzing = Object.create(null);
    let module_hashing = Object.create(null);

    function locate(specifier, parent_locator) {

// The 'locate' function locates a file. It is a memoized form of the 'locate'
// capability. I could not think of a situation where its output would change
// over time, so its cache is never invalidated.

        const key = JSON.stringify([specifier, parent_locator]);
        if (locating[key] !== undefined) {
            return locating[key];
        }
        locating[key] = Promise.resolve().then(function () {
            return capabilities.locate(specifier, parent_locator);
        }).catch(function on_fail(exception) {
            delete locating[key];
            return Promise.reject(exception);
        });
        return locating[key];
    }

    function read(locator) {

// The 'read' function reads the source of a module, as a string. It is a
// memoized form of the 'read' capability. The source is cached until the file
// changes.

        if (reading[locator] !== undefined) {
            return reading[locator];
        }

        function invalidate() {
            delete reading[locator];
            delete source_hashing[locator];
            delete analyzing[locator];

// Because module hashes are recursively calculated, and because we keep no
// picture of dependency trees previously traversed, a change to any file
// potentially invalidates any module hash.

            module_hashing = Object.create(null);
        }

        reading[locator] = Promise.resolve(
            locator
        ).then(
            capabilities.read
        ).then(function (content) {

// Invalidate the cache next time the file is modified. There is the potential
// for a race condition here, if the file is modified after it has been read
// but before the watch begins. I suspect this will not be a problem in
// practice.

            Promise.resolve(
                locator
            ).then(
                capabilities.watch
            ).then(
                invalidate
            ).catch(function (exception) {

// The watch capability is broken. We avoid caching this module, because there
// will be nothing to invalidate the cache when the file is modified.

                capabilities.err(exception.stack + "\n");
                return invalidate();
            });
            return (
                typeof content === "string"
                ? content
                : utf8_decoder.decode(content)
            );
        }).catch(function on_fail(exception) {

// Do not cache a rejected Promise. That would prevent 'read' from succeeding in
// subsequent attempts.

            invalidate();
            return Promise.reject(exception);
        });
        return reading[locator];
    }

    function analyze(locator) {

// The 'analyze' function analyzes the module at 'locator'. The analysis is
// cached because analysis necessitates a full parse, which can be expensive.

        if (analyzing[locator] !== undefined) {
            return analyzing[locator];
        }
        analyzing[locator] = read(locator).then(function (source) {
            return analyze_module(parse_module(source));
        }).catch(function (error) {
            return Promise.reject(new Error(
                "Unparseable " + locator + ": " + error.message
            ));
        });
        return analyzing[locator];
    }

    function source_hash(locator) {

// The 'source_hash' function hashes the source of a module as a string. The
// resulting hash is cached.

        if (source_hashing[locator] !== undefined) {
            return source_hashing[locator];
        }
        source_hashing[locator] = read(locator).then(digest);
        return source_hashing[locator];
    }

    function module_hash(locator, parent_locator) {

// The 'module_hash' function produces a hash string for a module, or undefined
// if the 'locator' is not hashable. The resulting hash is tentatively cached.

// The hash is dependent on:

//  a) the source of the module itself, and
//  b) the hashes of any modules it imports.

// Only modules stored on disk require versioning, because only they are subject
// to the runtime's module cache. If a module attempts to resolve itself via
// 'import.meta.resolve', however, a hash must be omitted to avoid datalock.

        if (!is_module(locator) || locator === parent_locator) {
            return Promise.resolve();
        }

// A depth-first traversal of the entire dependency tree is necessary to compute
// the result, but such a workload grows exponentially with the depth. Despite
// the in-memory cache employed by the preceeding functions, this workload can
// still get out of hand. Fortunately, it is safe to cache the module hash
// until a file in its dependency tree is changed.

        if (module_hashing[locator] !== undefined) {
            return module_hashing[locator];
        }
        module_hashing[locator] = Promise.all([

// Hashing a hash of the source is just as good as hashing the source itself,
// only cheaper.

            source_hash(locator),
            analyze(locator).then(function (module_analysis) {
                return Promise.all(
                    all_specifiers(module_analysis).map(function (specifier) {
                        return locate(
                            specifier,
                            locator
                        ).then(function (sublocator) {
                            return module_hash(sublocator, locator);
                        });
                    })
                );
            })
        ]).then(function ([the_source_hash, specifier_hashes]) {
            return digest(the_source_hash, ...specifier_hashes);
        });
        return module_hashing[locator];
    }

// The 'hashes' object contains the last known hash of each locator.
// The 'versions' object contains an integer version, incremented each time the
// hash of a module changes.

    let hashes = Object.create(null);
    let versions = Object.create(null);

// Versions are local to REPL instances, and so an unguessable value is used to
// qualify them. This has the added benefit of making it very unlikely that
// regular locators will be confused with versioned ones. A random string is
// generated as the instance is started.

    let unguessable;

    function versionize(locator, parent_locator) {

// The 'versionize' function produces a versioned form of the 'locator', where
// necessary.

        return module_hash(locator, parent_locator).then(function (the_hash) {
            if (the_hash === undefined) {
                return locator;
            }

// Versions begin at zero.

            if (versions[locator] === undefined) {
                versions[locator] = 0;
            } else {

// Compare this hash with the last one we computed. If the hash of the module
// has changed, increment its version beginning at zero. Otherwise, leave the
// version unchanged.

                if (hashes[locator] !== the_hash) {
                    versions[locator] += 1;
                }
            }
            hashes[locator] = the_hash;

// Incorporate the version into the locator. By versioning with a number, rather
// than a hash, it is easy for the programmer to discern the freshest version
// of a module from within their debugger.

// Rather than including the versioning information in a query string, we
// prepend it to the path. This is more respectful of the locator's opacity, and
// also easier to read.

            return locator.replace(/^file:\/\//, function (prefix) {
                return prefix + "/v" + versions[locator] + "/" + unguessable;
            });
        });
    }

    function module(locator) {

// The 'module' function prepares the source code of a local module for delivery
// to the padawan. This involves resolving and versioning all specifiers within
// the source.

        return Promise.all([
            read(locator),
            analyze(locator)
        ]).then(function ([source, module_analysis]) {

// Resolve and version the specifiers.

            return Promise.all(
                all_specifiers(module_analysis).map(function (specifier) {
                    return locate(
                        specifier,
                        locator
                    ).then(function (sublocator) {
                        return versionize(sublocator, locator);
                    }).then(
                        specify
                    );
                })
            ).then(function (specifiers) {

// Modify the source, inserting the resolved and versioned specifiers as string
// literals.

                const altered = alter_string(source, [
                    ...module_analysis.imports.map(function (the_import, nr) {
                        return [
                            the_import.node.source,
                            "\"" + specifiers[nr] + "\""
                        ];
                    }),
                    ...module_analysis.dynamics.map(function (the_dynamic, nr) {
                        return [
                            the_dynamic.module,
                            "\""
                            + specifiers[module_analysis.imports.length + nr]
                            + "\""
                            + blanks(source, the_dynamic.module)
                        ];
                    }),
                    ...module_analysis.exports.filter(function (the_export) {
                        return the_export.source;
                    }).map(function (the_export, nr) {
                        return [
                            the_export.source,
                            "\"" + specifiers[
                                module_analysis.imports.length
                                + module_analysis.dynamics.length
                                + nr
                            ] + "\""
                        ];
                    })
                ]);
                return altered;
            });
        });
    }

    function serve(url, headers) {

// The 'serve' function responds to HTTP requests made by the padawans. It takes
// the URL string and headers object of the request. The returned Promise
// resolves to an object like {body, headers} representing the response.

// The response body is often source code for a JavaScript module, but it can be
// any kind of file supported by the 'headers' capability.

        return Promise.resolve().then(function () {
            url = new URL(url);
            let locator = "file://" + url.pathname + url.search;

// Any versioning information in the URL has served its purpose by defeating the
// padawan's module cache. It is discarded before continuing.

            const matches = locator.match(rx_versioned_locator);
            if (matches && matches[2] === unguessable) {
                locator = "file://" + matches[3];
            }
            let response_headers = capabilities.headers(locator);
            if (response_headers === undefined) {
                return Promise.reject(new Error(
                    "No headers specified for "
                    + locator
                    + ". Use the \"headers\" option."
                ));
            }
            return Promise.resolve(

// If the file is a JavaScript module, prepare its source for delivery.
// Otherwise serve the file verbatim.

                is_module(locator)
                ? module(locator)
                : capabilities.read(locator)
            ).then(function (string_or_buffer) {

// It is possible that the file was requested from a Web Worker whose origin
// is "null". To satisfy CORS, allow such origins explicitly.

                if (typeof headers?.origin === "string") {
                    response_headers[
                        "Access-Control-Allow-Origin"
                    ] = headers.origin;
                }
                return {
                    body: string_or_buffer,
                    headers: response_headers
                };
            });
        });
    }

    function send(message, on_result) {

// Prepare the message's source code for evaluation.

        return Promise.resolve(
            message
        ).then(
            capabilities.command
        ).then(
            function (message) {
                const tree = parse_module(message.source);
                const top_analysis = analyze_top(tree);
                const module_analysis = analyze_module(tree);
                const dynamic_nr = module_analysis.imports.length;
                return Promise.all(
                    all_specifiers(module_analysis).map(function (specifier) {
                        return locate(
                            specifier,
                            message.locator
                        ).then(function (locator) {
                            return versionize(locator, message.locator);
                        }).then(
                            specify
                        );
                    })
                ).then(function (resolved_specifiers) {

// Evaluate the source code.

                    return on_eval(
                        on_result,
                        function produce_script(dynamic_specifiers) {
                            return replize(
                                message.source,
                                tree,
                                module_analysis,
                                top_analysis,
                                dynamic_specifiers,
                                message.scope
                            );
                        },
                        resolved_specifiers.slice(dynamic_nr),
                        resolved_specifiers.slice(0, dynamic_nr),
                        top_analysis.wait
                    );
                });
            }
        );
    }

    return Object.freeze({
        start() {
            return digest(Math.random()).then(function (hash) {
                unguessable = hash.slice(0, 4);
                return on_start();
            });
        },
        send,
        serve,
        stop: on_stop
    });
}

if (import.meta.main) {
    test_alter_string();
    test_analyze_module();
    test_analyze_top_immediate();
    test_analyze_top_eventual();
    test_analyze_top_eventual_default();
    test_replize_continuity();
    test_replize_delayed_assignment();
    test_replize_strict_mode();
    test_replize_top_level_await();
    test_replize_declare_await();
    test_replize_main();
    test_replize_exports();
    test_replize_export_default_anonymous_function();
    test_replize_export_default_anonymous_class();
}

export default Object.freeze(make_repl);
