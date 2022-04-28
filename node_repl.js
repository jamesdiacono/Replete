// This REPL evaluates JavaScript source code in an isolated Node.js process.
// See repl.js and node_cmdl.js for more information.

import path from "path";
import http from "http";
import make_repl from "./repl.js";
import make_node_cmdl from "./cmdl/node_cmdl.js";

function node_repl_constructor(
    capabilities,
    path_to_replete,
    which_node,
    node_args = [],
    env = {}
) {
    const cmdl = make_node_cmdl(
        path.join(path_to_replete, "cmdl", "node_padawan.js"),
        function on_stdout(buffer) {
            return capabilities.out(buffer.toString());
        },
        function on_stderr(buffer) {
            return capabilities.err(buffer.toString());
        },
        which_node,
        node_args.concat(

// By default, Node.js will not import modules via HTTP. Adding a flag enables
// this feature but causes a warning to be logged, which we suppress.

            "--experimental-network-imports",
            "--no-warnings"
        ),
        env
    );

// The Node.js REPL uses an HTTP server to serve modules to the padawan, which
// will import them via the dynamic 'import' function.

    let http_server;
    let http_server_port;
    function on_start(serve) {
        http_server = http.createServer(serve);
        return Promise.all([
            new Promise(function start_http_server(resolve, reject) {
                http_server.on("error", reject);
                return http_server.listen(function () {
                    http_server_port = http_server.address().port;
                    return resolve();
                });
            }),
            cmdl.create()
        ]);
    }
    function on_eval(script, imports, on_result) {
        return cmdl.eval(script, imports).then(function (report) {
            return on_result(report.evaluation, report.exception);
        });
    }
    function on_stop() {
        return Promise.all([
            new Promise(function (resolve) {
                return http_server.close(resolve);
            }),
            cmdl.destroy()
        ]);
    }
    function specify(locator) {
        return (
            locator.startsWith("file:///")
            ? (
                "http://localhost:"
                + http_server_port
                + locator.replace("file://", "")
            )
            : locator
        );
    }
    return make_repl(
        capabilities,
        on_start,
        on_eval,
        on_stop,
        specify
    );
}

export default Object.freeze(node_repl_constructor);
