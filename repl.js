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
//          Starts the REPL, returning a Promise which resolves once it is safe
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
//          Stops the REPL. It returns a Promise which resolves once the system
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
// composed of other modules. JavaScript has an 'import' statement, which is
// used to acquire the interface of another module. Replete supports the
// evaluation of 'import' statements, making it possible to evaluate modules
// (and even whole applications) in the REPL.

// At the heart of each padawan is the global 'eval' function. eval, being
// immediate in nature, does not support the import statement.

//      SyntaxError: Cannot use import statement outside a module

// When evaluating a fragment of source code, Replete removes from it any import
// or export statements, leaving a bare script which can be passed to eval. The
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

// Replete's solution is to include a token in the specifier, which varies
// whenever the module or its descendants are modified. In this way, the module
// cache is used to obtain a performance benefit without the staleness.

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

// ES5 introduced "strict mode", an opt-in feature which repaired some of
// JavaScript's worst flaws. Within an ES6 module, strict mode is no longer
// opt-in. It is the default mode of execution. Because Replete is an evaluator
// for modules, it evaluates all JavaScript in strict mode.

// +--------------+
// | Traceability |
// +--------------+

// When evaluation fails due to an exception, its stack trace may contain useful
// debugging information, such as line numbers and function names. Replete
// attempts to preserve the integrity of both of these.

/*jslint node */

import {parse} from "acorn";
import crypto from "crypto";
import alter_string from "./alter_string.js";
import scriptify_module from "./scriptify_module.js";

function fill(template, substitutions) {

// The 'fill' function prepares a script template for execution. As an example,
// all instances of <the_force> found in the 'template' will be replaced with
// 'substitutions.the_force'.

    return template.replace(/<([^<>]*)>/g, function (original, filling) {
        return substitutions[filling] ?? original;
    });
}

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

const script_template = `

// Ensure that the global $scopes variable is available. It contains the scope
// objects, which persist the state of identifiers across evaluations.

// The only reliable way to store values is to attach them to the global object.
// We get a reference to the global object via 'this' because it is a strategy
// that works on every runtime, so long as this script is evaluated in
// non-strict mode.

    if (this.$scopes === undefined) {
        this.$scopes = Object.create(null);
    }
    if ($scopes[<scope_name_string>] === undefined) {
        $scopes[<scope_name_string>] = Object.create(null);
        $scopes[<scope_name_string>].$default = undefined;
        $scopes[<scope_name_string>].$evaluation = undefined;
    }

// Retrieve the named scope. We use a var because it can be redeclared, unlike a
// const.

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
// scope object (such as toString) could dredged up and misinterpreted as
// identifiers. To avoid this hazard, the scope object was made without a
// prototype.

    with ($scope) {
        (function () {

// Evaluate the payload script in strict mode. We enforce strict mode because
// the payload script originates from a module, and modules are always run in
// strict mode.

            "use strict";
            return eval(<payload_script_string>);
        }());
    }
`;

function replize_script(script, imports = [], scope = "") {

// The 'replize_script' function transforms a script, making it suitable for
// evaluation in a REPL. It takes the following parameters:

//      script
//          A string containing JavaScript source code, without any import or
//          export statements.

//      imports
//          An array containing information about the importations used by
//          the 'script'. Its structure is identical to that returned by
//          the 'scriptify_module' function.

//      scope
//          The name of the scope to use for evaluation. If the scope does not
//          exist, it is created.

// The resulting script expects a $imports variable to be available, which
// should be an array containing the imported module objects.

    let tree = parse(script, {ecmaVersion: "latest"});
    let alterations = [];
    let variables = [];
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
// the function from being hoisted. Rather, we leave the function statement as
// is, and inject an assignment statement immediately afterwards. The function
// is thus assigned directly to the scope object, with the nice side effect
// that function declarations appear to evaluate as functions, rather than
// undefined.

            variables.push(node.id.name);
            alterations.push([
                {
                    start: node.end,
                    end: node.end
                },
                " $scope." + node.id.name + " = " + node.id.name + ";"
            ]);

// There is a caveat that any additional changes to the function variable are
// not persisted:

//      function tea_and_bickies() {
//          return "Just the ticket.;
//      }
//      tea_and_bickies = "Yum";

// After evaluating the above, $scope.tea_and_bickies is a function and not
// "Yum". I expect this not to be a problem in practice.

        },
        ClassDeclaration(node) {

// Class declarations are similar to function declarations, but they are not
// hoisted and can not be repeated. This requires a totally different strategy.

            variables.push(node.id.name);

// We turn the statement into an expression, which is assigned to the local
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
                imports
            ),
            scope_name_string: JSON.stringify(scope),
            payload_script_string: JSON.stringify(
                alter_string(script, alterations)
            )
        }
    );
}

function find_specifiers(source) {

// The 'find_specifiers' function searches the 'source' string of a module for
// import specifiers, returning their value and position in the source.

// It returns an array of objects, each of which contains the following
// properties:

//      specifier
//          The value of the specifier, e.g. "./peach.js".

//      range
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
                specifier: node.source.value,
                range: {

// Exclude the surrounding quotation marks.

                    start: node.source.start + 1,
                    end: node.source.end - 1
                }
            };
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

function repl_constructor(capabilities, on_start, on_eval, on_stop, specify) {

// The 'repl_constructor' function returns a new REPL instance. It takes the
// following parameters:

//      capabilities
//          An object containing the Replete capability functions.

//      on_start(serve)
//          A function which does any necessary setup work. It is passed a
//          handler function, which can be called with the 'req' and 'res'
//          objects whenever an HTTP request is received. It returns a Promise
//          which should resolve once it is safe to call 'on_eval'.

//      on_eval(script, imports, on_result)
//          A function which evaluates the script in each connected padawan.

//          The 'script' parameter is a string containing JavaScript source
//          code, devoid of import or export statements. The 'imports'
//          parameter is an array of import specifier strings. The 'on_result'
//          parameter is the same as the 'on_result' function passed to
//          the 'send' method, which is documented above.

//          A Promise is returned, which rejects if there was a problem
//          communicating with any of the padawans.

//      on_stop()
//          A function responsible for releasing any resources in use by the
//          REPL. It should return a Promise which resolves once it is done.

//      specify(locator)
//          A function which is used to transform each locator before it is
//          provided as a specifier to a padawan.

// These variables constitute the REPL's in-memory cache. Each variable holds an
// object, which has locators as keys and Promises as values. By caching the
// Promise and not the value, multiple callers can subscribe to the result of a
// single operation, even before it has finished.

    let locating = Object.create(null);
    let reading = Object.create(null);
    let hashing = Object.create(null);
    let finding = Object.create(null);
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
            delete finding[locator];
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
    function find(locator) {

// The 'find' function finds any import specifiers in a module. It is memoized
// because finding the specifiers necessitates a full parse, which can be
// expensive.

        if (finding[locator] !== undefined) {
            return finding[locator];
        }
        finding[locator] = read(locator).then(find_specifiers);
        return finding[locator];
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

// The hash is dependant on:

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
            find(locator).then(function (found_array) {
                return Promise.all(found_array.map(function (found) {
                    return locate(found.specifier, locator).then(hash);
                }));
            })
        ]).then(function ([source_hash, import_versions]) {
            return digest(source_hash, ...import_versions);
        });
    }

// The 'hashes' object contains the last known hash of each locator.
// The 'versions' object contains an integer version, which is incremented each
// time the hash of a module changes.

    let hashes = Object.create(null);
    let versions = Object.create(null);

// Versions are local to REPL instances, and so an 'unguessable' value is used
// to qualify them. It has the added benefit of making it very unlikely that
// regular locators will be confused with versioned ones.

    const unguessable = digest(Math.random()).slice(0, 4);
    function versionize(locator) {

// The 'versionize' function produces a versioned form of the 'locator', where
// possible.

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
// to the padawan. This involves translating any import specifiers into
// locators.

        return Promise.all([
            read(locator),
            find(locator)
        ]).then(function ([source, found_array]) {

// Resolve and version the import specifiers.

            return Promise.all(
                found_array.map(function (found) {
                    return locate(found.specifier, locator).then(versionize);
                })
            ).then(function (versioned_locators) {

// Modify the source, replacing the import specifiers with versioned locators.

                return alter_string(
                    source,
                    found_array.map(function (found, nr) {
                        return [found.range, specify(versioned_locators[nr])];
                    })
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

// Any versioning information in the URL has served its purpose, which was to
// defeat the padawan's module cache. It is discarded before continuing.

        const matches = locator.match(rx_versioned_locator);
        if (matches && matches[2] === unguessable) {
            locator = "file://" + matches[3];
        }
        const content_type = capabilities.mime(locator);
        if (content_type === undefined) {
            return fail(new Error("Unknown content type: " + locator));
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
                const {script, imports} = scriptify_module(source);
                return Promise.all([
                    Promise.resolve(replize_script(
                        script,
                        imports,
                        message.scope
                    )),
                    Promise.all(

// Resolve the specifiers in parallel.

                        imports.map(
                            function (the_import) {
                                return the_import.specifier;
                            }
                        ).map(
                            function (specifier) {
                                return locate(
                                    specifier,
                                    message.locator
                                ).then(
                                    versionize
                                ).then(
                                    specify
                                );
                            }
                        )
                    )
                ]);
            }
        ).then(
            function ([script, imports]) {
                return on_eval(script, imports, on_result);
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

export default Object.freeze(repl_constructor);
