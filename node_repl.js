/*jslint node */

// The Node REPL evaluates JavaScript source code in a Node.js environment.

/*property
    $imports, Buffer, all, clearImmediate, clearInterval, clearTimeout, console,
    createContext, error, exports, freeze, imports, locate, locator, log, map,
    on_exception, on_log, process, runInContext, script, send, setImmediate,
    setInterval, setTimeout, specifier, then, transform, claim, source,
    platform, action, resolve, PI, check, on_report, nr_trials
*/

import vm from "vm";
import replize_script from "./replize_script.js";
import import_module from "./import_module.js";
import scriptify_module from "./scriptify_module.js";

//debug import assert from "@pkg/js/assert.js";
//debug import jscheck from "@pkg/js/jscheck.js";
//debug const specify = jscheck();

function node_repl_constructor(capabilities) {

// The 'node_repl_constructor' function creates a REPL evaluation context for
// Node.js. It returns an object containing a 'send' function, which accepts a
// message object and returns a Promise which resolves to an array containing
// the evaluated value as its lone element.

// Create a persistent evaluation context. It is imbued with a minimal set of
// capabilities.

    const context = vm.createContext({
        setTimeout,
        setInterval,
        setImmediate,
        clearTimeout,
        clearInterval,
        clearImmediate,
        console: {
            log: capabilities.on_log,
            error: capabilities.on_exception
        },
        Buffer,
        process
    });
    function send(message) {

// Evaluate JavaScript source code in a Node.js context. The returned requestor
// takes a REPL message and produces the evaluation wrapped in an array or
// object.

        let scriptified;
        return capabilities.transform(message).then(
            function import_dependencies(source) {
                scriptified = scriptify_module(source);
                return Promise.all(
                    scriptified.imports.map(
                        function make_promise(the_import) {
                            return capabilities.locate(
                                the_import.specifier,
                                message.locator
                            ).then(
                                function (module_locator) {
                                    return import_module(
                                        capabilities,
                                        module_locator
                                    );
                                }
                            );
                        }
                    )
                );
            }
        ).then(
            function evaluate_script(modules) {
                let {script, imports} = scriptified;
                context.$imports = modules;
                return [
                    vm.runInContext(
                        replize_script(script, imports),
                        context
                    )
                ];
            }
        );
    }
    return Object.freeze({send});
}

//debug specify.claim(
//debug     "node_repl",
//debug     function (verdict) {
//debug         const message = {
//debug             source: "",
//debug             platform: "node",
//debug             action: "eval"
//debug         };
//debug         const node_repl = node_repl_constructor(Object.freeze({
//debug             transform(the_message) {
//debug                 assert(the_message, message);
//debug                 return Promise.resolve(`
//debug (function () {
//debug     return Math.PI;
//debug }());
//debug `);
//debug             }
//debug         }));
//debug         return node_repl.send(message).then(function (output) {
//debug             return verdict(output[0] === Math.PI);
//debug         });
//debug     }
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(node_repl_constructor);
