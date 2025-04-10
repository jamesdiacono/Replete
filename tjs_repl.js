// This REPL evaluates JavaScript in a Txiki process.

/*jslint node */

import url from "node:url";
import make_cmdl_repl from "./cmdl_repl.js";
import fileify from "./fileify.js";
const padawan_url = new URL("./tjs_padawan.js", import.meta.url);

function make_tjs_repl(capabilities, which, args = [], env = {}) {
    return make_cmdl_repl(
        capabilities,
        function make_command(tcp_host) {

// Txiki is not capable of loading a program over HTTP, even though it can
// import modules over HTTP.

            return fileify(padawan_url).then(function (padawan_file_url) {
                return [
                    which,
                    ...args,
                    "run",
                    url.fileURLToPath(padawan_file_url),
                    tcp_host
                ];
            });
        },
        env
    );
}

export default Object.freeze(make_tjs_repl);
