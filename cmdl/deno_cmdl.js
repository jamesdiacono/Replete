// A Deno CMDL controls a single Deno padawan. It provides an interface for
// evaluating JavaScript source code within a padawan. Note that source code is
// evaluated in sloppy mode.

/*jslint node */

import child_process from "child_process";
import make_cmdl from "./cmdl.js";

//debug import deno_padawan_path from "./deno_padawan.js@path";

function deno_cmdl_constructor(
    path_to_padawan,
    on_stdout,
    on_stderr,
    debugger_port,
    deno_command = "/usr/local/bin/deno"
) {

// The 'path_to_padawan' parameter is the absolute path to the entrypoint of the
// padawan's program. The 'on_stdout' and 'on_stderr' parameters are functions,
// called with a Buffer whenever data is written to STDOUT or STDERR.

// The 'debugger_port' parameter is the port number of the padawan's debugger.
// If not specified, no debugger is started.

    return make_cmdl(function spawn_deno_process(tcp_port) {
        const args = [
            "run",

// Suppress diagnostic output, such as the importing of modules.

            "--quiet",

// Deno is run with unlimited permissions, and with access to this process's
// environment variables. This is in line with the Node padawan, and seems
// justified for development.

            "--allow-all"
        ];
        if (debugger_port !== undefined) {
            args.push("--inspect=127.0.0.1:" + debugger_port);
        }
        args.push(path_to_padawan, String(tcp_port));
        const subprocess = child_process.spawn(
            deno_command,
            args,
            {
                env: Object.assign(
                    {NO_COLOR: "1"},
                    process.env
                )
            }
        );
        subprocess.stdout.on("data", on_stdout);
        subprocess.stderr.on("data", on_stderr);
        return Promise.resolve(subprocess);
    });
}

//debug const cmdl = deno_cmdl_constructor(
//debug     deno_padawan_path,
//debug     function on_stdout(chunk) {
//debug         return process.stdout.write(chunk);
//debug     },
//debug     function on_stderr(chunk) {
//debug         return process.stderr.write(chunk);
//debug     },
//debug     7334
//debug );
//debug cmdl.create().then(function () {
//debug     return cmdl.eval(
//debug         //`
//debug         //    (function isStrictMode() {
//debug         //        return this === undefined;
//debug         //    }());
//debug         //`,
//debug         `$imports[0].basename("/a/b/c.d")`,
//debug         ["https://deno.land/std@0.117.0/path/mod.ts"]
//debug     ).then(
//debug         console.log
//debug     );
//debug }).then(cmdl.destroy);

export default Object.freeze(deno_cmdl_constructor);
