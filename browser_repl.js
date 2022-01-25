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

//      humanoid
//          A boolean indicating whether to use C3PO as a favicon, rather than
//          R2D2.

// It returns the interface described in repl.js.

// Configure the WEBL server.

    let clients_and_padawans = new Map();
    function on_client_found(client) {
        capabilities.out("WEBL found.\n");

// Create a single padawan on each connecting client. The padawan is rendered as
// an iframe which fills the WEBL client's viewport.

        const padawan = client.padawan({
            on_log(...strings) {
                return capabilities.out(strings.join(" ") + "\n");
            },
            on_exception(string) {
                return capabilities.err(string + "\n");
            },
            type: "iframe",
            iframe_style_object: {
                border: "none",
                width: "100vw",
                height: "100vh"
            },
            iframe_sandbox: false
        });
        clients_and_padawans.set(client, padawan);
        return padawan.create().catch(function (exception) {
            return capabilities.err(exception.stack + "\n");
        });
    }
    function on_client_lost(client) {
        capabilities.out("WEBL lost.\n");

// Forget the client and its padawans.

        clients_and_padawans.delete(client);
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

        return Promise.all(
            Array.from(clients_and_padawans.values()).map(function (padawan) {
                return padawan.eval(script, imports).then(
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

// Locators provided to the padawans are qualified by the WEBL client, so we do
// nothing here.

        return locator;
    }
    return make_repl(
        capabilities,
        on_start,
        on_eval,
        on_stop,
        specify
    );
}

export default Object.freeze(browser_repl_constructor);
