/*jslint eval */

import jslint from "./jslint.js";

//debug import vm from "vm";
//debug import valid from "./jsvalid.js";
//debug import jscheck from "./jscheck.js";
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

// Opt-in to strict mode. This will also apply to the script passed to 'eval',
// below. We enforce strict mode because the script originates from a module,
// and modules are always run in strict mode.

    "use strict";

// Every identifier, including those for previous evaluations, are declared as
// local variables. This means that scripts are free to shadow global variables,
// without risk of clobbering the state.

// The "triple quote" below is replaced with the CSV of identifiers. The reason
// we use such a weird token is that a triple quote can not possibly appear in
// the JSON encoded payload script injected previously.

    let {"""} = $scope;

// Evaluate the script, retaining the evaluated value.

    $evaluation = eval({payload_script_json});

// Gather the variables back into the scope, retained for the benefit of future
// evaluations.

    Object.assign($scope, {"""});

// Produce the evaluation.

    $evaluation;
`;

const outer_template = `

// Ensure the global scope object is available. It persists the state of the
// identifiers across evaluations.

    var $scope = $scope || {
        $default: undefined,
        $evaluation: undefined
    };

// Populate the scope with the script's declared identifiers.

    Object.assign($scope, {identifiers_object_literal});

// A nested 'eval' is necessary because
//  a) variables can not be declared dynamically, and
//  b) we must inspect the $scope object to know which identifiers it contains.

    eval(
        {inner_template_json}.replace(
            /"""/g,
            Object.keys($scope).join(", ")
        )
    );
`;

function replize_script(script, imports) {

// The 'replize_script' function returns a script for evaluation in a REPL
// context. The 'script' parameter is a string containing JavaScript source
// code, without any import or export statements. The 'imports' parameter is an
// array like that returned by the 'scriptify_module' function.

// The resulting script expects a $imports variable to be available, which
// should be an array containing the imported module objects.

    const {tokens, tree, stop, warnings} = jslint(script);
    if (stop) {
        throw new Error(JSON.stringify(warnings, undefined, "    "));
    }
    const lines = script.split("\n");
    const top_names = [];

// Variable declarations (var, let, const and function statements) are rewritten
// as assignments to local variables. This avoids collisions when repeatedly
// evaluating similar declarations in the same context.

    tree.filter(function (token) {
        return (
            token.statement === true &&
            (
                token.id === "let" ||
                token.id === "const" ||
                token.id === "var"
            )
        );
    }).forEach(function (declaration) {

// Keep a record of the declared identifiers. This will come in useful later.

        top_names.push(...declaration.names.map((name_token) => name_token.id));
        if (
            declaration.expression === undefined &&
            declaration.names.length === 1 &&
            declaration.names[0].expression === undefined
        ) {

// An uninitialised variable has been declared. Reinitialise it with
// 'undefined'. We could remove the declaration entirely if we wanted to.

            let line = lines[declaration.line];
            line = (
                line.slice(0, declaration.from) +
                declaration.names[0].id +
                " = undefined" +
                line.slice(declaration.names[0].thru)
            );
            lines[declaration.line] = line;
        } else {

// A variable has been declared and initialised.

// Parenthesise the assignment if it is a destructured assignment, and discard
// the const/let/var.

            const next_statement = tree[tree.indexOf(declaration) + 1];

// Find the semicolon which terminates the rvalue, by backtracking from the
// following statement. We need to know its position to parenthesise the
// expression.

            let cursor = (
                next_statement === undefined
                ? tokens.length - 1
                : tokens.indexOf(next_statement)
            );
            let semicolon;
            while (cursor >= 0) {
                if (tokens[cursor].id === ";") {
                    semicolon = tokens[cursor];
                    break;
                }
                cursor -= 1;
            }
            if (semicolon === undefined) {
                throw "Missing semicolon.";
            }
            const post_declaration_token = tokens[
                tokens.indexOf(declaration) + 1
            ];
            const is_destructured_object = post_declaration_token.id === "{";
            if (is_destructured_object) {
                lines[semicolon.line] = (
                    lines[semicolon.line].slice(0, semicolon.from) +
                    ")" +
                    lines[semicolon.line].slice(semicolon.from)
                );
            }
            lines[declaration.line] = (
                lines[declaration.line].slice(0, declaration.from) +
                (
                    is_destructured_object
                    ? "("
                    : ""
                ) +
                lines[declaration.line].slice(post_declaration_token.from)
            );
        }
    });

// To properly persist functions declarations in the simulated lexical scope we
// create with 'eval', we must assign its value to the scope explicitly. Failure
// to do so leaves the identifier unchanged.

    tree.filter(function (token) {
        return token.id === "function" && token.statement === true;
    }).forEach(function (declaration) {
        top_names.push(declaration.name.id);

// Declaring the function is not enough! It must become an assignment,
// overwriting the local variable with the same name.

        lines[declaration.line] = (
            lines[declaration.line].slice(0, declaration.from)
            + declaration.name.id
            + " = "
            + lines[declaration.line].slice(declaration.from)
        );

// Because the function declaration has become an assignment, it now requires a
// terminating semicolon to protect it from being inadvertently invoked.
// Backtrack from the following statement and insert it after the function
// declaration's closing brace.

        const next_statement = tree[tree.indexOf(declaration) + 1];
        if (next_statement !== undefined) {
            let cursor = tokens.indexOf(next_statement) - 1;
            while (cursor >= 0) {
                if (tokens[cursor].id === "}") {
                    const brace = tokens[cursor];
                    lines[brace.line] = (
                        lines[brace.line].slice(0, brace.from)
                        + "};"
                        + lines[brace.line].slice(brace.thru)
                    );
                    break;
                }
                cursor -= 1;
            }
        }
    });

// Now we nest our payload script in a harness script containing two nested
// evals. The things we do for strict mode!

    return outer_template.replace(
        "{identifiers_object_literal}",
        make_identifiers_object_literal(top_names, imports)
    ).replace(
        "{inner_template_json}",
        JSON.stringify(
            inner_template.replace(
                "{payload_script_json}",
                JSON.stringify(lines.join("\n"))
            )
        )
    );
}

//debug specify.claim(
//debug     "replize_script vm.runInContext",
//debug     function (verdict) {
//debug         const script = `
//debug const x = "x";
//debug     let y = "y";
//debug function z() {
//debug     return "z";
//debug }
//debug   const {
//debug     a,
//debug     b
//debug } = {
//debug     a: "a",
//debug     b: "b"
//debug };
//debug let [c, d] = [a, b];
//debug (function () {
//debug     const c = "not c";
//debug }());
//debug `;
//debug         const gather = `
//debug (function () {
//debug     return [x, y, z(), a, b, c, d];
//debug }());
//debug `;
//debug         const context = vm.createContext({});
//debug         const results = [
//debug             script,
//debug             script,
//debug             ""
//debug         ].map(function (script) {
//debug             return vm.runInContext(
//debug                 replize_script(script + "\n" + gather, []),
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
//debug     "replize_script forces strict mode",
//debug     function (verdict) {
//debug         try {
//debug             vm.runInNewContext(
//debug                 replize_script("(function () { x = true; }());", [])
//debug             );
//debug             return verdict(false);
//debug         } catch (ignore) {
//debug             return verdict(true);
//debug         }
//debug     }
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(replize_script);
