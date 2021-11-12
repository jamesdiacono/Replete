/*jslint node */

import vm from "vm";
import eval_module from "./eval_module.js";

function import_module(capabilities, locator) {

// The 'import_module' function imports a module identified by its 'locator',
// returning a Promise which resolves to the exportation object. It is similar
// to the import() function, but it supports compilation on the fly.

    return capabilities.import(locator, function evaluate() {

// The 'evaluate' function reads, compiles and evaluates the module.

        return capabilities.read(locator).then(
            function on_read(buffer) {
                return capabilities.transform_file(buffer, locator);
            }
        ).then(
            function on_compiled(buffer) {
                return eval_module(
                    function importer(specifier) {
                        return capabilities.locate(
                            specifier,
                            locator
                        ).then(function (locator) {
                            return import_module(capabilities, locator);
                        });
                    },
                    function eval_script(script, importations) {
                        return vm.runInNewContext(
                            script,
                            Object.assign(

// Some capabilities must be made available to the script's context explicitly.
// We generously provide our own.

                                {
                                    setTimeout,
                                    setInterval,
                                    setImmediate,
                                    clearTimeout,
                                    clearInterval,
                                    clearImmediate,
                                    console,
                                    Buffer,
                                    process
                                },
                                importations
                            )
                        );
                    },
                    buffer.toString("utf8")
                );
            }
        );
    });
}

export default Object.freeze(import_module);
