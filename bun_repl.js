// This REPL evaluates JavaScript in a Bun process.

/*jslint node */

import url from "node:url";
import make_cmdl_repl from "./cmdl_repl.js";
import fileify from "./fileify.js";
const padawan_url = new URL("./node_padawan.js", import.meta.url);

function make_bun_repl(capabilities, which, args = [], env = {}) {
    return make_cmdl_repl(
        capabilities,
        function make_command(tcp_host) {

// Make sure we have predownloaded the padawan script, necessary until Bun
// supports loading programs over HTTP.
// Pending https://github.com/oven-sh/bun/issues/38.

            return fileify(padawan_url).then(function (padawan_file_url) {
                return [
                    which,
                    "run",
                    ...args,
                    url.fileURLToPath(padawan_file_url.href),
                    tcp_host
                ];
            });
        },
        env
    );
}

export default Object.freeze(make_bun_repl);
