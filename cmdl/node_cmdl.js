// A Node.js CMDL controls a single Node.js padawan. It provides an interface
// for evaluating JavaScript source code within a padawan. Note that source code
// is evaluated in sloppy mode.

/*jslint node */

import child_process from "child_process";
import make_cmdl from "./cmdl.js";

function node_cmdl_constructor(

// The 'path_to_padawan' parameter is the absolute path to the entrypoint of the
// client's program.

    path_to_padawan,

// The 'on_stdout' and 'on_stderr' parameters are functions, called with a
// Buffer whenever data is written to STDOUT or STDERR.

    on_stdout,
    on_stderr,

// The 'which_node' parameter is the command used to run Node.js.

    which_node,

// The 'node_args' parameter is an array containing arguments to be passed to
// node, before the script arg.

    node_args = [],

// The 'env' parameter is an object containing environment variables to make
// available to the process.

    env = {}
) {
    return make_cmdl(function spawn_node_process(tcp_port) {
        const subprocess = child_process.spawn(
            which_node,
            node_args.concat(path_to_padawan, String(tcp_port)),
            {env}
        );
        subprocess.on("error", function (exception) {
            return on_stderr(Buffer.from(exception.stack + "\n"));
        });
        subprocess.stdout.on("data", on_stdout);
        subprocess.stderr.on("data", on_stderr);
        return Promise.resolve(subprocess);
    });
}

export default Object.freeze(node_cmdl_constructor);
