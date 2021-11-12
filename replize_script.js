/*jslint eval */

import jslint from "./jslint.js";

//debug import vm from "vm";
//debug import valid from "./jsvalid.js";
//debug import jscheck from "./jscheck.js";
//debug const specify = jscheck();

function replize_script(script, rewrite_function_declarations) {

// Variable definitions (var, let, const and optionally function statements) are
// rewritten as assignments to global variables. This avoids collisions when
// evaluating a script in an existing context.

// Function statements are optional because they are only required when using
// 'eval', but not for 'vm.runInContext'.

    const {tokens, tree, stop, warnings} = jslint(script);
    if (stop) {
        throw new Error(JSON.stringify(warnings, undefined, "    "));
    }
    const lines = script.split("\n");

// Neuter var, let and const.

    tree.filter(function (token) {
        const keywords = ["let", "const", "var"];
        return (
            token.statement === true &&
            keywords.includes(token.id)
        );
    }).forEach(function (declaration) {
        if (
            declaration.expression === undefined &&
            declaration.names.length === 1 &&
            declaration.names[0].expression === undefined
        ) {

// An uninitialised variable has been declared. Reinitialise it with
// 'undefined'.

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
    if (rewrite_function_declarations) {

// To properly persist functions declarations in the simulated lexical scope we
// create with 'eval', we must assign it to an identifier explicitly. Failing to
// do so leaves the identifier unchanged.

        tree.filter(function (token) {
            return token.id === "function" && token.statement === true;
        }).forEach(function (declaration) {
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
                const closing_brace = tokens[
                    tokens.indexOf(next_statement) - 1
                ];
                lines[closing_brace.line] += ";";
            }
        });
    }
    return lines.join("\n");
}

//debug specify.claim(
//debug     "replize_script vm.runInContext",
//debug     function (verdict, script) {
//debug         script = replize_script(script, false);
//debug         const context = vm.createContext({});
//debug         const results = [
//debug             vm.runInContext(script, context),
//debug             vm.runInContext(script, context)
//debug         ];
//debug         const report = valid.array(
//debug             valid.array(["x", "y", "z", "a", "b", "a", "b"])
//debug         )(results);
//debug         return verdict(report.violations.length === 0);
//debug     },
//debug     [`
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
//debug (function () {
//debug     return [x, y, z(), a, b, c, d];
//debug }());
//debug `]
//debug );
//debug specify.check({on_report: console.log, nr_trials: 1});

export default Object.freeze(replize_script);
