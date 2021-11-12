import scriptify_module from "./scriptify_module.js";

//debug import vm from "vm";
//debug import assert from "./assert.js";
//debug import valid from "./jsvalid.js";
//debug import jscheck from "./jscheck.js";
//debug const specify = jscheck();

function make_importations_object(parsed_imports, modules) {
    return parsed_imports.reduce(
        function (importations, {name}, nr) {
            if (Array.isArray(name)) {
                name.forEach(function (the_name) {
                    importations[the_name] = modules[nr][the_name];
                });
            } else {
                importations[name] = modules[nr].default;
            }
            return importations;
        },
        Object.create(null)
    );
}

function eval_module(importer, eval_script, source) {

// The 'eval_module' function provides a means of evaluating JavaScript source
// code which may contain import and export statements. It takes three
// parameters, which are detailed below:

//  importer(specifier)

//      You must provide a means of resolving modules imported by the source. To
//      do so, provide an 'importer' function. It will be called by
//      'eval_module' with a specifier for each import statement encountered in
//      the 'source'. The 'specifier' parameter will be a string as it appears
//      in the import statement, for example "./my_module.js".

//      The importer function returns a Promise which resolves to a module
//      object, containing the named exportations of the module as well as the
//      default exportation.

//  eval_script(script, importations)

//      You must provide a means of evaluating source code wunce it has been
//      stripped of import and export statements. Provide an 'eval_script'
//      function which evaluates 'script', returning the value of its trailing
//      expression. The 'importations' will be an object containing any
//      importations referenced by the script.

//  source

//      The source code of the module as a string. It must be parseable by
//      JSLint.

// The 'eval_module' function returns a Promise which resolves either an object
// or an array, depending on whether the trailing expression in 'source' is an
// 'export' statement:

//  1. {default}    The "default" property is set to the default export.
//  2. {...names}   The properties are the module's named exportations.
//  3. [value]      If the source contains no export statements, an array
//                  containing the value of the trailing expression.

// Firstly, the 'source' is parsed and its imports are resolved via the
// 'importer' function.

    const {script, exports, imports} = scriptify_module(source);
    return Promise.all(
        imports.map(function ({specifier}) {
            return importer(specifier);
        })
    ).then(function (modules) {

// Evaluate the modified source. We use sloppy mode for now, but strict mode
// would be better.

        const value = eval_script(
            script,
            make_importations_object(imports, modules)
        );

// Produce the module object corresponding to the export statement, if one was
// found, otherwise produce an array containing the trailing expression.

        return (
            exports === undefined
            ? [value]
            : (
                exports.default === undefined
                ? value
                : {default: value}
            )
        );
    });
}

//debug specify.claim(
//debug     "eval_module default export",
//debug     function (verdict) {
//debug         return eval_module(
//debug             function mock_importer(specifier) {
//debug                 return Promise.resolve({default: specifier});
//debug             },
//debug             function mock_eval_script(script, importations) {
//debug                 assert(importations, valid.object({
//debug                     foo: "./foo.js",
//debug                     bar: "./bar.js"
//debug                 }));
//debug                 return vm.runInNewContext(script, {
//debug                     foo: 0,
//debug                     bar: 1
//debug                 });
//debug             },
//debug             `
//debug import foo from "./foo.js";
//debug import bar from "./bar.js";
//debug export default Object.freeze({foo, bar});
//debug `
//debug         ).then(function (module) {
//debug             const report = valid.object({
//debug                 default: valid.object({
//debug                     foo: 0,
//debug                     bar: 1
//debug                 })
//debug             })(module);
//debug             return verdict(report.violations.length === 0);
//debug         });
//debug     }
//debug );
//debug specify.claim(
//debug     "eval_module named import and export",
//debug     function (verdict) {
//debug         return eval_module(
//debug             function mock_importer(specifier) {
//debug                 return Promise.resolve({
//debug                     bar: specifier,
//debug                     baz: specifier
//debug                 });
//debug             },
//debug             function mock_eval_script(script, importations) {
//debug                 assert(importations, valid.object({
//debug                     bar: "./foo.js",
//debug                     baz: "./foo.js"
//debug                 }));
//debug                 return vm.runInNewContext(script, {
//debug                     bar: 0,
//debug                     baz: 1
//debug                 });
//debug             },
//debug             `
//debug import {
//debug     bar,
//debug     baz
//debug } from "./foo.js";
//debug const x = 5;
//debug export {bar, baz};
//debug `
//debug         ).then(function (module) {
//debug             const report = valid.object({
//debug                 bar: 0,
//debug                 baz: 1
//debug             })(module);
//debug             return verdict(report.violations.length === 0);
//debug         });
//debug     }
//debug );
//debug specify.claim(
//debug     "eval_module expression",
//debug     function (verdict) {
//debug         return eval_module(
//debug             function mock_importer(specifier) {
//debug                 return Promise.resolve({default: specifier});
//debug             },
//debug             vm.runInNewContext,
//debug             `
//debug import foo from "./foo.js";
//debug (function () {
//debug     return {foo};
//debug }());
//debug `
//debug         ).then(function (module) {
//debug             const report = valid.array([
//debug                 valid.object({foo: "./foo.js"})
//debug             ])(module);
//debug             return verdict(report.violations.length === 0);
//debug         });
//debug     }
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(eval_module);
