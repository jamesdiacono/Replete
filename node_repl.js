// This REPL evaluates JavaScript source code in an isolated Node.js process.
// See command_repl.js and node_cmdl.js for more information.

import path from "path";
import make_command_repl from "./command_repl.js";
import make_node_cmdl from "./cmdl/node_cmdl.js";

function node_repl_constructor(
    capabilities,
    path_to_replete,
    debugger_port,
    node_command
) {
    return make_command_repl(
        capabilities,
        make_node_cmdl(
            path.join(path_to_replete, "cmdl", "node_padawan.js"),
            function on_stdout(buffer) {
                return capabilities.out(buffer.toString());
            },
            function on_stderr(buffer) {
                return capabilities.err(buffer.toString());
            },
            debugger_port,
            path.join(path_to_replete, "cmdl", "node_loader.js"),
            node_command
        )
    );
}

export default Object.freeze(node_repl_constructor);
