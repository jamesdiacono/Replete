// This REPL evaluates JavaScript source code in an isolated Deno process. See
// command_repl.js and deno_cmdl.js for more information.

import path from "path";
import make_command_repl from "./command_repl.js";
import make_deno_cmdl from "./cmdl/deno_cmdl.js";

function deno_repl_constructor(
    capabilities,
    path_to_replete,
    debugger_port,
    which_deno
) {
    return make_command_repl(
        capabilities,
        make_deno_cmdl(
            path.join(path_to_replete, "cmdl", "deno_padawan.js"),
            function on_stdout(buffer) {
                return capabilities.out(buffer.toString());
            },
            function on_stderr(buffer) {
                return capabilities.err(buffer.toString());
            },
            debugger_port,
            which_deno
        )
    );
}

export default Object.freeze(deno_repl_constructor);
