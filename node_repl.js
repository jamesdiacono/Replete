// This REPL evaluates JavaScript source code in an isolated Node.js process.
// See repl.js and node_cmdl.js for more information.

/*jslint node */

import http from "node:http";
import make_repl from "./repl.js";
import make_node_cmdl from "./cmdl/node_cmdl.js";

function make_node_repl(
    capabilities,
    which_node,
    node_args = [],
    env = {}
) {
    const cmdl = make_node_cmdl(
        function on_stdout(buffer) {
            return capabilities.out(buffer.toString());
        },
        function on_stderr(buffer) {
            return capabilities.err(buffer.toString());
        },
        which_node,
        node_args,
        env
    );

// The Node.js REPL uses an HTTP server to serve modules to the padawan, which
// imports them via the dynamic 'import' function. We rely on the loader
// configured in node_cmdl.js to provide support for HTTP module specifiers.

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

    function on_eval(
        on_result,
        produce_script,
        dynamic_specifiers,
        import_specifiers
    ) {
        return cmdl.eval(
            produce_script(dynamic_specifiers),
            import_specifiers
        ).then(function (report) {
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

export default Object.freeze(make_node_repl);
