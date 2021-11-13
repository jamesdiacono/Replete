/*jslint node */

import vm from "vm";
import scriptify_module from "./scriptify_module.js";

function provide(imports, modules) {

// The 'provide' function returns an object containing the importations. The
// keys are the names of the identifiers referenced by the script.

    return imports.reduce(
        function (object, the_import, module_nr) {
            const module = modules[module_nr];
            if (the_import.default !== undefined) {
                object[the_import.default] = module.default;
            }
            if (typeof the_import.names === "string") {
                object[the_import.names] = module;
            }
            if (typeof the_import.names === "object") {
                Object.keys(the_import.names).forEach(function (name) {
                    const identifier = the_import.names[name];
                    object[identifier] = module[name];
                });
            }
            return object;
        },
        Object.create(null)
    );
}

function gather(exports, imports) {

// The 'gather' function returns the source code for an expression which
// evaluates to the module object.

    const aggregates = exports["*"] ?? [];
    return (
        "Object.assign({}, "
        + [

// Merge in any aggregated module objects. This is only necessary when
// statements like

//      export * from "./aggregable.js";

// exist in the module source.

            ...aggregates.map(function (import_nr) {
                return imports[import_nr].names;
            }),

// Finally, merge in the members exported by name.

            (
                "{"
                + Object.keys(
                    exports
                ).filter(
                    function exclude_aggregations(key) {
                        return key !== "*";
                    }
                ).map(
                    function make_member(name) {
                        return name + ": " + exports[name];
                    }
                ).join(
                    ", "
                )
                + "}"
            )
        ]
        + ");"
    );
}

function import_module(capabilities, locator) {

// The 'import_module' function imports a module identified by its 'locator',
// returning a Promise which resolves to the module object. It is similar to the
// import() function, but it supports compilation on the fly.

    return capabilities.import(locator, function evaluate() {

// The 'evaluate' function reads, compiles and evaluates the module. It is
// provided as an optional strategy to the 'import' capability.

        let scriptified;
        return capabilities.read(
            locator
        ).then(
            function on_read(buffer) {
                return capabilities.transform_file(buffer, locator);
            }
        ).then(
            function on_compiled(buffer) {
                scriptified = scriptify_module(buffer.toString("utf8"));
                return Promise.all(
                    scriptified.imports.map(
                        function make_promise(the_import) {
                            return capabilities.locate(
                                the_import.specifier,
                                locator
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
        ).then(function (modules) {
            let {script, imports, exports} = scriptified;
            return vm.runInNewContext(

// The evaluated value will be the module object.

                script + "\n" + gather(exports, imports),
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
                    provide(imports, modules)
                )
            );
        });
    });
}

export default Object.freeze(import_module);
