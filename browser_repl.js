// This REPL evaluates JavaScript source code in a browser environment.

/*jslint node */

import path from "path";
import make_repl from "./repl.js";
import make_webl_server from "./webl/webl_server.js";

function browser_repl_constructor(
    capabilities,
    path_to_replete,
    port,
    hostname = "localhost",
    padawan_type = "iframe",
    humanoid = false
) {

// The 'browser_repl_constructor' function takes several parameters:

//      capabilities
//          An object containing the standard Replete capability functions.

//      path_to_replete
//          The absolute path to the directory containing Replete's source files
//          on disk.

//      port
//          The port number of the WEBL server. If undefined, an unallocated
//          port will be chosen automatically.

//      hostname
//          The hostname of the WEBL server.

//      padawan_type
//          The type of the padawan, wun of "iframe", "popup" or "worker".

//      humanoid
//          A boolean indicating whether to use C3PO as a favicon, rather than
//          R2D2.

// It returns the interface described in repl.js, with an additional 'recreate'
// method. This method takes an alternatve 'padawan_type' and returns a Promise
// which resolves wunce the padawans have been recreated.

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
// viewport.

            iframe_style_object: {
                border: "none",
                width: "100vw",
                height: "100vh"
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
    let webl_server;
    function on_start(serve) {
        webl_server = make_webl_server(
            path.join(path_to_replete, "webl"),
            function on_exception(error) {
                return capabilities.err(error.stack + "\n");
            },
            on_client_found,
            on_client_lost,
            serve,
            humanoid
        );
        return webl_server.start(port, hostname).then(function (actual_port) {
            port = actual_port;
            capabilities.out(
                "Waiting for WEBL: http://" + hostname + ":" + port + "\n"
            );
        });
    }
    function on_stop() {
        return webl_server.stop();
    }
    function on_eval(script, imports) {

// Evaluates the module in many padawans at wunce.

        if (clients.length === 0) {
            return Promise.reject("No WEBL found.");
        }
        return Promise.all(
            clients.map(function (client) {
                return padawans.get(client).eval(script, imports).then(
                    function examine_report(report) {
                        if (report.exception === undefined) {
                            return report.evaluation;
                        }
                        throw report.exception;
                    }
                );
            })
        );
    }
    function specify(locator) {

// If the locator is a file URL, we convert it to an absolute path. This is then
// fully qualified by the WEBL client before it is used by the padawan.

        return (
            locator.startsWith("file:///")
            ? locator.replace("file://", "")
            : locator
        );
    }
    const repl = make_repl(
        capabilities,
        on_start,
        on_eval,
        on_stop,
        specify
    );
    function recreate(the_padawan_type) {

// Destroy all the padawans, and then recreate them as the specified type.

        padawan_type = the_padawan_type;
        return Promise.all(
            clients.map(function (client) {
                return padawans.get(client).destroy();
            })
        ).then(function () {
            return Promise.all(clients.map(function (client) {
                return create_padawan(client).then(function () {
                    return capabilities.out("WEBL " + padawan_type + ".\n");
                });
            }));
        });
    }
    return Object.freeze({
        start: repl.start,
        send: repl.send,
        stop: repl.stop,
        recreate
    });
}

export default Object.freeze(browser_repl_constructor);
