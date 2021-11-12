/*jslint node */

// The Node REPL evaluates JavaScript source code in a Node.js environment.

import vm from "vm";
import replize_script from "./replize_script.js";
import import_module from "./import_module.js";
import eval_module from "./eval_module.js";

//debug import assert from "./assert.js";
//debug import jscheck from "./jscheck.js";
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

        return capabilities.transform(message).then(
            function (compiled) {
                return eval_module(
                    function importer(specifier) {
                        return capabilities.locate(
                            specifier,
                            message.locator
                        ).then(function (locator) {
                            return import_module(capabilities, locator);
                        });
                    },
                    function eval_script(script, importations) {
                        Object.assign(context, importations);
                        return vm.runInContext(

// It is not safe to blindly re-evaluate source in an existing context. Variable
// declarations such as 'const' fail if they are evaluated twice. We transform
// the script to avoid such exceptions.

                            replize_script(script, false),
                            context
                        );
                    },
                    compiled
                );
            }
        );
    }
    return Object.freeze({send});
}

//debug specify.claim(
//debug     "node_repl",
//debug     function (verdict, source) {
//debug         const message = {
//debug             source: "",
//debug             platform: "node",
//debug             action: "eval"
//debug         };
//debug         const node_repl = node_repl_constructor(Object.freeze({
//debug             transform(the_message) {
//debug                 assert(the_message, message);
//debug                 return Promise.resolve(source);
//debug             }
//debug         }));
//debug         return node_repl.send(message).then(function (output) {
//debug             return verdict(output[0] === Math.PI);
//debug         });
//debug     },
//debug     [`
//debug (function () {
//debug     return Math.PI;
//debug }());
//debug `]
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(node_repl_constructor);
