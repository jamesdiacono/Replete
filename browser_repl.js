// This REPL evaluates JavaScript source code in a browser environment.

/*jslint node */

import make_repl from "./repl.js";
import make_webl_server from "./webl/webl_server.js";

function make_browser_repl(
    capabilities,
    port,
    hostname = "localhost",
    padawan_type = "top",
    humanoid = false
) {

// The 'make_browser_repl' function takes several parameters:

//      capabilities
//          An object containing the standard Replete capability functions.

//      port
//          The port number of the WEBL server. If undefined, an unallocated
//          port will be chosen automatically.

//      hostname
//          The hostname of the WEBL server.

//      padawan_type
//          The type of the padawan, see ./webl/webl.js.

//      humanoid
//          A boolean indicating whether to use C3PO as a favicon, rather than
//          R2D2.

// Configure the WEBL server.

    let clients = [];
    let padawans = new WeakMap();

    function create_padawan(client) {
        const padawan = client.padawan({
            on_log(...strings) {
                return capabilities.out(strings.join(" ") + "\n");
            },
            on_exception(string) {
                return capabilities.err(string + "\n");
            },
            type: padawan_type,

// If the padawan is rendered as an iframe, it fills the WEBL client's
// viewport. We set block display to avoid vertical scrolling.

            iframe_style_object: {
                border: "none",
                width: "100vw",
                height: "100vh",
                display: "block"
            },
            iframe_sandbox: false
        });
        padawans.set(client, padawan);
        return padawan.create().catch(function (exception) {
            return capabilities.err(exception.stack + "\n");
        });
    }

    function on_client_found(client) {
        capabilities.out("WEBL found.\n");
        clients.push(client);

// Create a single padawan on each connecting client.

        return create_padawan(client);
    }

    function on_client_lost(client) {
        capabilities.out("WEBL lost.\n");

// Forget the client.

        clients = clients.filter(function (a_client) {
            return a_client !== client;
        });
    }

    function webl_href() {
        return "http://" + (

// IPv6 addresses must be wrapped in square brackets to appear in a URL.

            hostname.includes(":")
            ? "[" + hostname + "]"
            : hostname
        ) + ":" + port;
    }

    let webl_server;
    let repl;

    function on_start() {
        webl_server = make_webl_server(
            function on_exception(error) {
                return capabilities.err(error.stack + "\n");
            },
            on_client_found,
            on_client_lost,
            function on_request(req, res) {
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
            },
            humanoid
        );
        return webl_server.start(port, hostname).then(function (actual_port) {
            port = actual_port;
            capabilities.out(
                "Waiting for WEBL: " + webl_href() + "\n"
            );
        });
    }

    function on_stop() {
        return webl_server.stop();
    }

    function on_eval(
        on_result,
        produce_script,
        dynamic_specifiers,
        import_specifiers,
        wait
    ) {

// Evaluates the module in many padawans at once. Results are reported back as
// they arrive.

        if (clients.length === 0) {
            return Promise.reject(new Error(
                "No WEBLs connected. Open " + webl_href() + " in a browser."
            ));
        }
        return Promise.all(
            clients.map(function (client) {

                function qualify(specifier) {

// Generally, padawans have a different origin to that of the WEBL client. This
// means that absolute paths might be resolved against an unexpected origin. To
// avoid this hazard, each absolute path is converted to a fully-qualified URL
// by prepending the client's origin.

                    return (
                        specifier.startsWith("/")
                        ? client.origin + specifier
                        : specifier
                    );
                }

                return padawans.get(client).eval(
                    produce_script(dynamic_specifiers.map(qualify)),
                    import_specifiers.map(qualify),
                    wait
                ).then(function (report) {
                    return on_result(report.evaluation, report.exception);
                });
            })
        );
    }

    function specify(locator) {

// If the locator is a file URL, we convert it to an absolute path. This is then
// fully qualified in 'on_eval' above.

        return (
            locator.startsWith("file:///")
            ? locator.replace("file://", "")
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
    return Object.freeze({
        start: repl.start,
        send: repl.send,
        stop: repl.stop
    });
}

export default Object.freeze(make_browser_repl);
