// A generic REPL for command-line runtimes. It uses a CMDL and serves modules
// from a dedicated HTTP server.

/*jslint node */

import http from "node:http";
import make_cmdl from "./cmdl.js";
import make_repl from "./repl.js";

// This should be "localhost", but we force IPv4 because, on Windows, Node.js
// seems unwilling to connect to Deno over IPv6.

const http_server_hostname = "127.0.0.1";

function make_cmdl_repl(capabilities, make_command, env) {
    let repl;

// An HTTP server serves modules to the padawan, which imports them via the
// dynamic 'import' function. As such, the padawan is expected to support HTTP
// imports.

    let http_server;
    let http_server_port;

    const cmdl = make_cmdl(
        function spawn_padawan(tcp_host) {
            const http_host = http_server_hostname + ":" + http_server_port;
            return make_command(tcp_host, http_host).then(function (command) {
                return capabilities.spawn(command, env, [tcp_host, http_host]);
            });
        },
        function on_stdout(buffer) {
            return capabilities.out(buffer.toString());
        },
        function on_stderr(buffer) {
            return capabilities.err(buffer.toString());
        }
    );

    function on_start() {
        http_server = http.createServer(function (req, res) {
            return repl.serve(
                new URL(req.url, "http://" + req.host).href,
                req.headers
            ).then(function ({body, headers}) {
                Object.entries(headers).forEach(function ([key, value]) {
                    res.setHeader(key, value);
                });
                res.end(body);
            }).catch(function fail(reason) {
                capabilities.err(reason.stack + "\n");
                res.statusCode = 500;
                return res.end();
            });
        });
        return Promise.all([
            new Promise(function start_http_server(resolve, reject) {
                http_server.on("error", reject);
                return http_server.listen(0, http_server_hostname, function () {
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
        import_specifiers,
        wait
    ) {
        return cmdl.eval(
            produce_script(dynamic_specifiers),
            import_specifiers,
            wait
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
                "http://" + http_server_hostname + ":" + http_server_port
                + locator.replace("file://", "")
            )
            : locator
        );
    }

    repl = make_repl(
        capabilities,
        on_start,
        on_eval,
        on_stop,
        specify
    );
    return repl;
}

export default Object.freeze(make_cmdl_repl);
