import {parse} from "acorn";
import alter_string from "./alter_string.js";

//debug import vm from "vm";
//debug import valid from "@pkg/js/jsvalid.js";
//debug import jscheck from "@pkg/js/jscheck.js";
//debug const specify = jscheck();

function make_identifiers_object_literal(top_names, imports) {
    const members = [];

// We insert the declared identifiers into the scope object, so we can know to
// gather them up after they have been initialised during evaluation of the
// payload script.

    top_names.forEach(function (name) {
        members.push(name + ": undefined");
    });

// The importations are extracted from the global $imports array.

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

const inner_template = `

// Opt in to strict mode from here on in. We enforce strict mode because the
// script originates from a module, and modules are always run in strict mode.

    "use strict";

// Every identifier, including those from previous evaluations, are declared as
// local variables. This means that scripts are free to shadow global variables,
// without risk of clobbering the state.

// The "triple quote" below is replaced with the CSV of identifiers. The reason
// we use such a weird token is that a triple quote can not possibly appear in
// the JSON encoded payload script injected previously.

    let {"""} = $scope;

// Evaluate the script, retaining the evaluated value.

    $evaluation = eval({payload_script_json});

// Gather the variables back into the scope, retaining their values for the
// benefit of future evaluations.

    Object.assign($scope, {"""});

// Produce the evaluation.

    $evaluation;
`;

const outer_template = `

// Ensure the global scope object is available. It persists the state of the
// identifiers across evaluations. We are assuming sloppy mode, where 'this' is
// bound to the global object.

    this.$scope = this.$scope || {
        $default: undefined,
        $evaluation: undefined
    };

// Populate the scope with the script's declared identifiers.

    Object.assign($scope, {identifiers_object_literal});

// A nested 'eval' is necessary because
//  a) variables can not be declared dynamically, and
//  b) we must inspect the $scope object to know which identifiers it contains.

    eval(
        {inner_template_json}.replace(/"""/g, function replacer() {
            return Object.keys($scope).join(", ");
        })
    );
`;

function replize_script(script, imports = []) {

// The 'replize_script' function transforms a script, making it suitable for
// evaluation in a REPL. The 'script' parameter is a string containing
// JavaScript source code, without any import or export statements. The
// 'imports' parameter is an array like that returned by the 'scriptify_module'
// function.

// The resulting script expects a $imports variable to be available, which
// should be an array containing the imported module objects.

    let tree = parse(script, {ecmaVersion: "latest"});
    let alterations = [];
    let top_names = [];

// Each of the importations should be retained in the scope.

    imports.forEach(function (the_import) {
        if (the_import.default !== undefined) {
            top_names.push(the_import.default);
        }
        if (typeof the_import.names === "string") {
            top_names.push(the_import.names);
        }
        if (typeof the_import.names === "object") {
            top_names.push(...Object.values(the_import.names));
        }
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
                            top_names.push(property_node.key.name);
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
                            top_names.push(identifier_node.name);
                        });
                    } else {
                        top_names.push(id.name);
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
                    top_names.push(id.name);
                }
            });
        },
        FunctionDeclaration(node) {
            top_names.push(node.id.name);

// Function statements can be reevaluated without issue, but the value in the
// $scope object will not be overwritten without an explicit assignment
// statement. This is tricky, because treating the function declaration as an
// expression and assigning it to the variable will prevent the function from
// being hoisted, which can cause an exception if a function is referenced
// before it is declared.

// Our strategy is to leave the function as a statement, so it is still hoisted
// to the start of the script. However, the hoisted function is subtly renamed.
// We then insert an assignment statement at the start of the script (following
// the hoisted declaration) to

//      a) give the function back its original name, and
//      b) persist the function in the $scope.

            const hoisted_name = "$" + node.id.name;
            alterations.push([node.id, hoisted_name]);
            alterations.push([
                {
                    start: 0,
                    end: 0
                },
                node.id.name + " = " + hoisted_name + ";"
            ]);
        },
        ClassDeclaration(node) {

// Class declarations are similar to function declarations, but they are not
// hoisted. This requires a totally different strategy.

            top_names.push(node.id.name);

// We turn the statement into an expression, which is assigned to the local
// variable.

            alterations.push([
                {
                    start: node.start,
                    end: node.start
                },
                node.id.name + " = "
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

// Now we nest our payload script in a harness script containing two nested
// evals. The things we do for strict mode!

    const inner_script = inner_template.replace(
        "{payload_script_json}",

// The 'replace' method has a nasty gotcha: it recognises several special
// patterns which, when present in strings passed as the second parameter, make
// it behave in surprising ways. We gain immunity from this feature by passing a
// replacer function as the second parameter.

        function replacer() {
            return JSON.stringify(alter_string(script, alterations));
        }
    );
    return outer_template.replace(
        "{identifiers_object_literal}",
        function replacer() {
            return make_identifiers_object_literal(top_names, imports);
        }
    ).replace(
        "{inner_template_json}",
        function replacer() {
            return JSON.stringify(inner_script);
        }
    );
}

//debug specify.claim(
//debug     "replize_script vm.runInContext",
//debug     function (verdict) {
//debug         const script = `
//debug             const x = "x";
//debug                 let y = "y";
//debug             z();
//debug             function z() {
//debug                 return "z";
//debug             }
//debug             let uninitialised;
//debug             const special_string_replacement_pattern = "$'";
//debug               const {
//debug                 a,
//debug                 b
//debug             } = {
//debug                 a: "a",
//debug                 b: "b"
//debug             };
//debug             let [c, d] = [a, b];
//debug             (function () {
//debug                 const c = "not c";
//debug             }());
//debug         `;
//debug         const gather = `
//debug             (function () {
//debug                 return [x, y, z(), a, b, c, d];
//debug             }());
//debug         `;
//debug         const context = vm.createContext({});
//debug         const results = [
//debug             script,
//debug             script,
//debug             ""
//debug         ].map(function (script) {
//debug             return vm.runInContext(
//debug                 replize_script(script + "\n" + gather),
//debug                 context
//debug             );
//debug         });
//debug         const report = valid.array(
//debug             valid.array(["x", "y", "z", "a", "b", "a", "b"])
//debug         )(results);
//debug         return verdict(report.violations.length === 0);
//debug     }
//debug );
//debug specify.claim(
//debug     "replize_script strict mode",
//debug     function (verdict) {
//debug         try {
//debug             vm.runInNewContext(replize_script(`
//debug                 (function () {
//debug                     x = true;
//debug                 }());
//debug             `));
//debug             return verdict(false);
//debug         } catch (ignore) {
//debug             return verdict(true);
//debug         }
//debug     }
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(replize_script);
