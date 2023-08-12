// A Node.js CMDL controls a single Node.js padawan, imbued with the ability to
// import modules over HTTP. It provides an interface for evaluating JavaScript
// source code within a padawan. Note that source code is evaluated in sloppy
// mode.

/*jslint node */

import child_process from "node:child_process";
import url from "node:url";
import fileify from "../fileify.js";
import make_cmdl from "./cmdl.js";
const loader_url = new URL("./node_loader.js", import.meta.url);
const padawan_url = new URL("./node_padawan.js", import.meta.url);

function make_node_cmdl(

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

// Make sure we have "file:" URLs for the loader and padawan scripts. By
// default, Node.js is not capable of importing modules over HTTP. We specify a
// file extension that forces Node.js to interpret the source as a module.

        return Promise.all([
            fileify(loader_url, ".mjs"),
            fileify(padawan_url, ".mjs")
        ]).then(function ([
            loader_file_url,
            padawan_file_url
        ]) {
            const subprocess = child_process.spawn(
                which_node,
                node_args.concat(

// Imbue the padawan process with the ability to import modules over HTTP. The
// loader specifier must be a fully qualified URL on Windows.

                    "--experimental-loader",
                    loader_file_url.href,

// Suppress the "experimental feature" warnings. We know we are experimenting!

                    "--no-warnings",

// The program entry point must be specified as a path.

                    url.fileURLToPath(padawan_file_url),
                    String(tcp_port)
                ),
                {env}
            );
            subprocess.stdout.on("data", on_stdout);
            subprocess.stderr.on("data", on_stderr);
            return subprocess;
        });
    });
}

export default Object.freeze(make_node_cmdl);
