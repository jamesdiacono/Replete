// This REPL evaluates JavaScript source code in an isolated Deno process. See
// repl.js and deno_cmdl.js for more information.

import path from "path";
import http from "http";
import make_repl from "./repl.js";
import make_deno_cmdl from "./cmdl/deno_cmdl.js";

function deno_repl_constructor(
    capabilities,
    path_to_replete,
    debugger_port,
    which_deno
) {
    const cmdl = make_deno_cmdl(
        path.join(path_to_replete, "cmdl", "deno_padawan.js"),
        function on_stdout(buffer) {
            return capabilities.out(buffer.toString());
        },
        function on_stderr(buffer) {
            return capabilities.err(buffer.toString());
        },
        debugger_port,
        which_deno
    );

// The Deno REPL uses an HTTP server to serve modules to the padawan, which will
// import them via the dynamic 'import' function.

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
    function on_eval(script, imports) {
        return cmdl.eval(script, imports).then(
            function examine_report(report) {
                if (report.exception === undefined) {
                    return [report.evaluation];
                }
                throw report.exception;
            }
        );
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
            locator.startsWith("/")
            ? "http://localhost:" + http_server_port + locator
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
