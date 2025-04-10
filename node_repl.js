// This REPL evaluates JavaScript in a Node.js process.

/*jslint node */

import url from "node:url";
import make_cmdl_repl from "./cmdl_repl.js";
import fileify from "./fileify.js";
const loader_url = new URL("./node_loader.js", import.meta.url);
const padawan_url = new URL("./node_padawan.js", import.meta.url);

function make_node_repl(capabilities, which, args = [], env = {}) {
    return make_cmdl_repl(
        capabilities,
        function make_command(tcp_host) {

// Make sure we have predownloaded the loader and padawan scripts. By default,
// Node.js is not capable of importing modules over HTTP. We specify a file
// extension to force Node.js to interpret the source as a module.

            return Promise.all([
                fileify(loader_url, ".mjs"),
                fileify(padawan_url, ".mjs")
            ]).then(function ([
                loader_file_url,
                padawan_file_url
            ]) {
                return [
                    which,
                    ...args,

// Imbue the padawan process with the ability to import modules over HTTP. The
// loader specifier must be a fully qualified URL on Windows.

                    "--experimental-loader",
                    loader_file_url.href,

// Suppress the "experimental feature" warnings.

                    "--no-warnings",

// The program entry point must be specified as a path.

                    url.fileURLToPath(padawan_file_url),
                    tcp_host
                ];
            });
        },
        env
    );
}

export default Object.freeze(make_node_repl);
