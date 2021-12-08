/*jslint node */

// A Node.js CMDL controls a single Node.js padawan. It provides an interface
// for evaluating JavaScript source code within a padawan. Note that source code
// is evaluated in sloppy mode.

import child_process from "child_process";
import make_cmdl from "./cmdl.js";

//debug import node_padawan_path from "./node_padawan.js@path";

function node_cmdl_constructor(
    path_to_padawan,
    on_stdout,
    on_stderr,
    debugger_port,
    path_to_loader,
    node_command = process.argv[0]
) {

// The 'path_to_padawan' parameter is the absolute path to the entrypoint of the
// client's program. The 'on_stdout' and 'on_stderr' parameters are functions,
// called with a Buffer whenever data is written to STDOUT or STDERR.

// The 'debugger_port' parameter is the port number of the client's debugger. If
// not specified, no debugger is started. The 'path_to_loader' parameter is the
// absolute path to a module loader script for the client. If not specified, the
// client will not use a loader.

    return make_cmdl(function spawn_node_process(tcp_port) {
        const args = [];
        if (path_to_loader !== undefined) {

// Suppress the "experimental feature" warnings. We know we are experimenting!

            args.push("--no-warnings", "--experimental-loader", path_to_loader);
        }
        if (debugger_port !== undefined) {
            args.push("--inspect=" + debugger_port);
        }
        args.push(path_to_padawan, String(tcp_port));
        const subprocess = child_process.spawn(
            node_command,
            args,
            {env: process.env}
        );
        subprocess.stdout.on("data", on_stdout);
        subprocess.stderr.on("data", on_stderr);
        return Promise.resolve(subprocess);
    });
}

//debug const cmdl = node_cmdl_constructor(
//debug     node_padawan_path,
//debug     function on_stdout(chunk) {
//debug         return process.stdout.write(chunk);
//debug     },
//debug     function on_stderr(chunk) {
//debug         return process.stderr.write(chunk);
//debug     },
//debug     7333
//debug );
//debug cmdl.create().then(function () {
//debug     return cmdl.eval(
//debug         `
//debug             (function isStrictMode() {
//debug                 return this === undefined;
//debug             }());
//debug         `,
//debug         // "$imports[0].default.tmpdir();",
//debug         ["os"]
//debug     ).then(
//debug         console.log
//debug     );
//debug }).then(cmdl.destroy);

export default Object.freeze(node_cmdl_constructor);
