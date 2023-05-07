// This is the generic REPL. It provides functionality common to all of
// Replete's REPLs, which have identical interfaces. This is the general shape
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
//          resources in use by the REPL are released.

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
// to 'window.console.log'.

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

//      source -> a.js -> b.js // source imports a.js which imports b.js

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
// freshness, but it is not pretty. That is because the two expectations are
// not really compatible.

// Usually, the vast majority of evaluation time is spent importing modules.
// Consider the following module tree:

//      source -> a.js -> b.js -> c.js

// The padawan will perform between zero and three roundtrips whilst evaluating
// the source, depending on the state of the module cache. The module tree is
// traversed from top to bottom.

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

/*jslint node */

import {parse} from "acorn";
import {simple} from "acorn-walk";
import crypto from "crypto";

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

function analyze_module(tree) {

// The 'analyze_module' function statically analyzes a module to find any
// imports, exports and dynamic specifiers within it. The 'tree' parameter is
// the module's parsed source code.

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

    let imports = [];
    let exports = [];
    let dynamics = [];

// Walk the tree.

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
    return {imports, exports, dynamics};
}

function all_specifiers(analysis) {

// Return any import and dynamic specifier strings mentioned in the analysis.

    return analysis.imports.map(
        (the_import) => the_import.node.source.value
    ).concat(analysis.dynamics.map(
        (the_dynamic) => the_dynamic.value
    ));
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

function make_identifiers_object_literal(variables, imports) {
    const members = [];

// Variables are initialised to undefined.

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

function replize(source, tree, analysis, dynamic_specifiers, scope = "") {

// The 'eval' function can not handle import or export statements. The 'replize'
// function transforms 'source' such that it is safe to eval, wrapping it in a
// harness to give it the REPL behaviour described at the top of this file. It
// takes the following parameters:

//      source
//          A string containing the module's source code.

//      tree
//          The module's source as a parsed tree.

//      analysis
//          An object returned by the 'analyze_module' function.

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

// Transform the imports, exports and dynamic specifiers. Import statments are
// removed, as are non-default export statements. Default export statements
// are turned into assignments to $default. Dynamic specifiers are injected as
// string literals.

    analysis.imports.forEach(function ({node}) {
        return alterations.push([node, blanks(source, node)]);
    });
    analysis.exports.forEach(function (node) {
        return alterations.push(
            node.type === "ExportDefaultDeclaration"
            ? [
                {
                    start: node.start,
                    end: node.declaration.start
                },
                "$default = "
            ]
            : [node, blanks(source, node)]
        );
    });
    analysis.dynamics.forEach(function (dynamic, dynamic_nr) {
        return alterations.push([
            dynamic.script,
            "\""
            + dynamic_specifiers[dynamic_nr]
            + "\""
            + blanks(source, dynamic.script)
        ]);
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

// A variable has been declared and initialised.

                    if (id.type === "ObjectPattern") {
                        id.properties.forEach(function (property_node) {
                            variables.push(property_node.key.name);
                        });

// Parenthesise the assignment if it is a destructured assignment, otherwise it
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
                        id.elements.forEach(function (identifier_node) {
                            variables.push(identifier_node.name);
                        });
                    } else {
                        variables.push(id.name);
                    }
                } else {

// An uninitialised variable has been declared. Reinitialise it as undefined.

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

    tree.body.forEach(
        function (node) {
            const handler = handlers[node.type];
            if (handler !== undefined) {
                return handler(node);
            }
        }
    );
    return fill(
        script_template,
        {
            identifiers_object_literal: make_identifiers_object_literal(
                variables,
                analysis.imports
            ),
            scope_name_string: JSON.stringify(scope),
            payload_script_string: JSON.stringify(alter_string(
                source,
                alterations
            ))
        }
    );
}

function digest(...args) {

// The 'digest' function hashes its arguments, returning a string.

    return crypto.createHash("sha1").update(args.join()).digest("hex");
}

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

//      on_start(serve)
//          A function that does any necessary setup work. It is passed a
//          handler function, which can be called with the 'req' and 'res'
//          objects whenever an HTTP request is received. The returned Promise
//          resolves once it is safe to call 'on_eval'.

//      on_eval(
//          on_result,
//          produce_script,
//          dynamic_specifiers,
//          import_specifiers
//      )
//          A function that evaluates the script in each connected padawan. It
//          takes the following parameters:

//              on_result
//                  The same as the 'on_result' function passed to the 'send'
//                  method, described above.

//              produce_script
//                  A function that takes an array of dynamic specifiers and
//                  returns the eval-friendly script string. This provides an
//                  opportunity to customise the dynamic specifiers.

//              dynamic_specifiers
//                  The array of dynamic specifier strings.

//              import_specifiers
//                  The array of import specifier strings.

//          The returned Promise rejects if there was a problem communicating
//          with any of the padawans.

//      on_stop()
//          A function responsible for releasing any resources in use by the
//          REPL. It should return a Promise that resolves once it is done.

//      specify(locator)
//          A function that transforms each locator before it is provided as a
//          specifier to a padawan.

// These variables constitute the REPL's in-memory cache. Each variable holds an
// object, containing locators as keys and Promises as values. By caching the
// Promise and not the value, multiple callers can subscribe to the result of a
// single operation, even before it has finished.

    let locating = Object.create(null);
    let reading = Object.create(null);
    let hashing = Object.create(null);
    let analyzing = Object.create(null);

    function locate(specifier, parent_locator) {

// The 'locate' function locates a file. It is a memoized form of the 'locate'
// capability. I could not think of a situation where its output would change
// over time, so its cache is never invalidated.

        const key = JSON.stringify([specifier, parent_locator]);
        if (locating[key] !== undefined) {
            return locating[key];
        }
        locating[key] = capabilities.locate(
            specifier,
            parent_locator
        ).catch(function on_fail(exception) {
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
            delete hashing[locator];
            delete analyzing[locator];
        }

        reading[locator] = capabilities.read(locator).then(function (buffer) {

// Invalidate the cache next time the file is modified. There is the potential
// for a race condition here, if the file is modified after it has been read
// but before the watch begins. I suspect this will not be a problem in
// practice.

            capabilities.watch(
                locator
            ).then(
                invalidate
            ).catch(function (exception) {

// The watch capability is broken. We avoid caching this module, because there
// will be nothing to invalidate the cache when the file is modified.

                capabilities.err(exception.stack + "\n");
                return invalidate();
            });
            return buffer.toString("utf8");
        }).catch(function on_fail(exception) {

// Do not cache a rejected Promise. That would prevent 'read' from succeeding in
// subsequent attempts.

            invalidate();
            return Promise.reject(exception);
        });
        return reading[locator];
    }

    function analyze(locator) {

// The 'analyze' function analyzes the module at 'locator'. It is memoized
// because analysis necessitates a full parse, which can be expensive.

        if (analyzing[locator] !== undefined) {
            return analyzing[locator];
        }
        analyzing[locator] = read(locator).then(function (source) {
            return analyze_module(parse(source, {
                ecmaVersion: "latest",
                sourceType: "module"
            }));
        });
        return analyzing[locator];
    }

    function hash_source(locator) {

// The 'hash_source' function hashes the source of a module as a string. Its
// result is cached.

        if (hashing[locator] !== undefined) {
            return hashing[locator];
        }
        hashing[locator] = read(locator).then(digest);
        return hashing[locator];
    }

    function hash(locator) {

// The 'hash' function produces a hash string for a module. It produces
// undefined if the 'locator' does not refer to a module on disk.

// The hash is dependent on:

//  a) the source of the module itself, and
//  b) the hashes of any modules it imports.

// Note that this triggers a depth-first traversal of the entire dependency
// tree, which would be excruciatingly slow were it not for the in-memory cache
// employed by the above functions.

        if (
            !locator.startsWith("file:///")
            || capabilities.mime(locator) !== "text/javascript"
        ) {
            return Promise.resolve();
        }
        return Promise.all([

// Hashing a hash of the source is equivalent to hashing the source itself, but
// it is cheaper.

            hash_source(locator),
            analyze(locator).then(function (analysis) {
                return Promise.all(
                    all_specifiers(analysis).map(function (specifier) {
                        return locate(specifier, locator).then(hash);
                    })
                );
            })
        ]).then(function ([source_hash, specifier_hashes]) {
            return digest(source_hash, ...specifier_hashes);
        });
    }

// The 'hashes' object contains the last known hash of each locator.
// The 'versions' object contains an integer version, incremented each time the
// hash of a module changes.

    let hashes = Object.create(null);
    let versions = Object.create(null);

// Versions are local to REPL instances, and so an unguessable value is used to
// qualify them. This has the added benefit of making it very unlikely that
// regular locators will be confused with versioned ones.

    const unguessable = digest(Math.random()).slice(0, 4);

    function versionize(locator) {

// The 'versionize' function produces a versioned form of the 'locator', where
// necessary.

        if (
            !locator.startsWith("file:///")
            || capabilities.mime(locator) !== "text/javascript"
        ) {

// Only modules require versioning, because only they are subject to the
// runtime's module cache.

            return Promise.resolve(locator);
        }
        return hash(locator).then(function (the_hash) {
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
        ]).then(function ([source, analysis]) {

// Resolve and version the specifiers.

            return Promise.all(
                all_specifiers(analysis).map(function (specifier) {
                    return locate(specifier, locator).then(
                        versionize
                    ).then(
                        specify
                    );
                })
            ).then(function (specifiers) {

// Modify the source, inserting the resolved and versioned specifiers as string
// literals.

                return alter_string(
                    source,
                    analysis.imports.map(function (the_import, specifier_nr) {
                        return [
                            the_import.node.source,
                            "\"" + specifiers[specifier_nr] + "\""
                        ];
                    }).concat(analysis.dynamics.map(function (the_dynamic, nr) {
                        const specifier_nr = analysis.imports.length + nr;
                        return [
                            the_dynamic.module,
                            "\""
                            + specifiers[specifier_nr]
                            + "\""
                            + blanks(source, the_dynamic.module)
                        ];
                    }))
                );
            });
        });
    }

    function serve(req, res) {

// The 'serve' function responds to HTTP requests made by the padawans. The
// response is generally source code for a JavaScript module, but it can be any
// kind of file supported by the 'mime' capability.

        function fail(reason) {
            capabilities.err(reason.stack + "\n");
            res.statusCode = 500;
            return res.end();
        }

        let locator = "file://" + req.url;

// Any versioning information in the URL has served its purpose by defeating the
// padawan's module cache. It is discarded before continuing.

        const matches = locator.match(rx_versioned_locator);
        if (matches && matches[2] === unguessable) {
            locator = "file://" + matches[3];
        }
        const content_type = capabilities.mime(locator);
        if (content_type === undefined) {
            return fail(new Error("No MIME type for " + locator));
        }
        return (

// If the file is a JavaScript module, prepare its source for delivery.
// Otherwise serve the file verbatim.

            content_type === "text/javascript"
            ? module(locator)
            : capabilities.read(locator)
        ).then(function (string_or_buffer) {
            res.setHeader("content-type", content_type);
            return res.end(string_or_buffer);
        }).catch(
            fail
        );
    }

    function send(message, on_result) {

// Prepare the message's source code for evaluation.

        return Promise.resolve(
            message
        ).then(
            capabilities.source
        ).then(
            function (source) {
                const tree = parse(source, {
                    ecmaVersion: "latest",
                    sourceType: "module"
                });
                const analysis = analyze_module(tree);
                return Promise.all(
                    all_specifiers(analysis).map(function (specifier) {
                        return locate(
                            specifier,
                            message.locator
                        ).then(
                            versionize
                        ).then(
                            specify
                        );
                    })
                ).then(function (resolved_specifiers) {
                    return on_eval(
                        on_result,
                        function produce_script(dynamic_specifiers) {
                            return replize(
                                source,
                                tree,
                                analysis,
                                dynamic_specifiers,
                                message.scope
                            );
                        },
                        resolved_specifiers.slice(analysis.imports.length),
                        resolved_specifiers.slice(0, analysis.imports.length)
                    );
                });
            }
        );
    }

    return Object.freeze({
        start() {
            return on_start(serve);
        },
        send,
        stop: on_stop
    });
}

export default Object.freeze(make_repl);
