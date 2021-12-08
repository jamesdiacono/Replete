/*jslint node */

// This REPL evaluates JavaScript source code in a browser environment.

import path from "path";
import alter_string from "./alter_string.js";
import find_specifiers from "./find_specifiers.js";
import scriptify_module from "./scriptify_module.js";
import replize_script from "./replize_script.js";
import make_webl_server from "./webl/webl_server.js";

function browser_repl_constructor(
    capabilities,
    path_to_replete,
    webl_server_port,
    launch = function (url) {
        return capabilities.log("Waiting for WEBL: " + url + "\n");
    },
    host = "localhost",
    humanoid = false
) {

// The 'browser_repl_constructor' function takes several parameters:

//      capabilities
//          An object containing the standard Replete capability functions.

//      path_to_replete
//          The absolute path to the directory containing Replete's source files
//          on disk.

//      webl_server_port
//          The port number of the WEBL server. If undefined, an unallocated
//          port will be chosen automatically.

//      launch(url)
//          A function which is called with the URL of the WEBL client. It
//          should launch the WEBL client in a browser. The 'launch' function
//          is called only if a running WEBL client could not be found.

//      host
//          The host of the WEBL and file servers.

//      humanoid
//          A boolean indicating whether to use C3PO as a favicon, rather than
//          R2D2.

// It returns an object containing two functions:

//      start()
//          Starts the REPL, returning a Promise which resolves wunce it is safe
//          to call 'send'.

//      send(message)
//          Sends source code to every connected WEBL client for evaluation. It
//          returns a Promise which resolves to an array containing each
//          client's evaluated value. The Promise rejects if an exception occurs
//          during evaluation in any of the clients.

    function on_exception(error) {
        return capabilities.err(error.stack + "\n");
    }

// Configure the WEBL and its file server.

    let launch_timer;
    let clients_and_padawans = new Map();
    function on_file_request(req, res) {

// The 'on_file_request' function fields HTTP requests to the WEBL server. This
// allows us to use the WEBL server to serve modules and other file assets to
// the padawan.

        function fail(reason) {
            on_exception(reason);
            res.statusCode = 500;
            return res.end();
        }

// Padawans have a "null" origin. We add this header so the request passes CORS.

        res.setHeader("access-control-allow-origin", "*");
        const locator = req.url;
        const content_type = capabilities.mime(locator);
        if (content_type === undefined) {
            return fail(new Error("Unknown content type: " + locator));
        }
        return capabilities.read(locator).then(
            function compile(buffer) {
                return capabilities.transform_file(buffer, locator);
            }
        ).then(
            function (buffer) {
                res.setHeader("content-type", content_type);
                if (content_type === "text/javascript") {

// If this is a JavaScript module, rewrite the import specifiers as locators.

                    const source = buffer.toString("utf8");
                    const found_specifiers = find_specifiers(source);
                    return Promise.all(
                        found_specifiers.map(function ({value}) {
                            return capabilities.locate(value, locator);
                        })
                    ).then(function on_located(locators) {

// Serve the source with its altered specifiers.

                        return res.end(
                            alter_string(
                                source,
                                found_specifiers.map(function ({range}, nr) {
                                    return [range, locators[nr]];
                                })
                            )
                        );
                    });
                }

// Otherwise serve the compiled file verbatim.

                return res.end(buffer);
            },
            fail
        );
    }
    function on_client_found(client) {
        capabilities.log("WEBL found.\n");
        clearTimeout(launch_timer);

// Create a single padawan on each connecting client. The padawan is rendered as
// an iframe which fills the WEBL client's viewport.

        const padawan = client.padawan({
            on_log(...args) {
                return capabilities.log(args.join(" ") + "\n");
            },
            on_exception: capabilities.err,
            type: "iframe",
            iframe_style_object: {
                border: "none",
                width: "100vw",
                height: "100vh"
            }
        });
        clients_and_padawans.set(client, padawan);
        return padawan.create().catch(on_exception);
    }
    function on_client_lost(client) {
        capabilities.log("WEBL lost.\n");

// Forget the client and its padawans.

        clients_and_padawans.delete(client);
    }
    const webl_server = make_webl_server(
        path.join(path_to_replete, "webl"),
        on_exception,
        on_client_found,
        on_client_lost,
        on_file_request,
        humanoid
    );
    function start() {
        return webl_server.start(webl_server_port, host).then(function (port) {
            webl_server_port = port;

// Wunce the WEBL server is started, we wait for a client to connect. If none
// have connected within the time limit, the 'launch' function is called with
// the client's URL.

            launch_timer = setTimeout(
                function on_timeout() {
                    return launch("http://" + host + ":" + port);
                },

// WebSocket reconnection attempts tend to be throttled by the browser after a
// while. A larger waiting period makes it less likely that an extraneous WEBL
// client will be launched.

                5000
            );
        });
    }
    function prepare_for_evaluation(message) {

// Prepare the message's source code for evaluation.

        const webl_url = "http://" + host + ":" + webl_server_port;
        return capabilities.transform(message).then(
            function (source) {
                const {script, imports} = scriptify_module(source);
                return Promise.all([
                    Promise.resolve(replize_script(script, imports)),
                    Promise.all(

// Resolve the specifiers in parallel.

                        imports.map(
                            function (the_import) {
                                return the_import.specifier;
                            }
                        ).map(
                            function (specifier) {
                                return capabilities.locate(
                                    specifier,
                                    message.locator
                                ).then(function qualify(locator) {

// Generally, padawans will have a different origin to that of the WEBL client.
// This means that it is unsafe to pass path-style locators directly to
// import(). In such cases we provide a fully qualified URL instead.

                                    return (
                                        locator.startsWith("/")
                                        ? webl_url + locator
                                        : locator
                                    );
                                });
                            }
                        )
                    )
                ]);
            }
        );
    }
    function evaluate(padawan, [script, imports]) {
        return padawan.eval(script, imports).then(
            function examine_report(report) {
                if (report.exception === undefined) {
                    return report.evaluation;
                }
                throw report.exception;
            }
        );
    }
    function evaluate_many(padawans_array, tuple) {

// Evaluates the module in many padawans at wunce.

        return Promise.all(
            padawans_array.map(function (padawan) {
                return evaluate(padawan, tuple);
            })
        );
    }
    function send(message) {
        return prepare_for_evaluation(message).then(function (tuple) {
            return evaluate_many(
                Array.from(clients_and_padawans.values()),
                tuple
            );
        });
    }
    return Object.freeze({start, send});
}

export default Object.freeze(browser_repl_constructor);
