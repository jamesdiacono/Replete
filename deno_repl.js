// This REPL evaluates JavaScript source code in an isolated Deno process. See
// repl.js and deno_cmdl.js for more information.

/*jslint node */

import path from "path";
import http from "http";
import make_repl from "./repl.js";
import make_deno_cmdl from "./cmdl/deno_cmdl.js";

function deno_repl_constructor(
    capabilities,
    path_to_replete,
    which_deno,
    run_args = [],
    env = {}
) {
    const cmdl = make_deno_cmdl(
        path.join(path_to_replete, "cmdl", "deno_padawan.js"),
        function on_stdout(buffer) {
            return capabilities.out(buffer.toString());
        },
        function on_stderr(buffer) {
            return capabilities.err(buffer.toString());
        },
        which_deno,
        run_args.concat(

// The Deno padawan is run with unlimited permissions. This seems justified for
// development, where it is not known in advance what the REPL will be asked to
// do.

// It also has the important side-effect of allowing the padawan access to the
// HTTP server. This could also be accomplished using the --allow-net argument,
// but care must be taken that it only appears once.

            "--allow-all"
        ),
        Object.assign({NO_COLOR: "1"}, env)
    );

// The Deno REPL uses an HTTP server to serve modules to the padawan, which
// imports them via the 'import' function.

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

export default Object.freeze(deno_repl_constructor);
