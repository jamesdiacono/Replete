/*jslint node */

// The browser REPL evaluates JavaScript source code in a browser environment.

import scriptify_module from "./scriptify_module.js";
import replize_script from "./replize_script.js";
import webl_server_constructor from "./webl/webl_server.js";

function replace_specifiers(source, from_array, to_array) {

// Replaces the some or all of the specifier strings of the source's import
// statements.

    from_array.forEach(function (from, from_nr) {
        source = source.replace(
            " from \"" + from + "\"",
            " from \"" + to_array[from_nr] + "\""
        );
    });
    return source;
}

function browser_repl_constructor(
    capabilities,
    location_of_the_webl_base,
    webl_server_port,
    launch = capabilities.on_log,
    host = "localhost",
    humanoid = false
) {

// The 'browser_repl_constructor' function takes several parameters:

//      capabilities
//          An object containing the standard Replete functions.

//      location_of_the_webl_base
//          The absolute path to the directory containing the WEBL's source
//          files on disk.

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
//          Starts the WEBL, returning a Promise which resolves wunce it is safe
//          to call 'send'.

//      send(message)
//          Sends source code to every connected WEBL client for evaluation. It
//          returns a Promise which resolves to an array containing each
//          client's evaluated value. The Promise rejects if an exception occurs
//          during evaluation in any of the clients.

// Configure the WEBL and its file server.

    let launch_timer;
    let clients_and_padawans = new Map();
    function on_file_request(req, res) {

// The 'on_file_request' function fields HTTP requests to the WEBL server. This
// allows us to use the WEBL server to serve modules and other file assets to
// the padawan.

        const locator = req.url;

// Padawans have a "null" origin. We add this header so the request passes CORS.

        res.setHeader("access-control-allow-origin", "*");
        function fail(reason) {
            res.statusCode = 500;
            capabilities.on_exception(reason);
            return res.end();
        }
        return capabilities.read(locator).then(
            function compile(buffer) {
                return capabilities.transform_file(buffer, locator);
            }
        ).then(
            function (buffer) {
                const content_type = capabilities.mime(locator);
                if (content_type === undefined) {
                    return fail(new Error("Unknown content type: " + locator));
                }
                res.setHeader("content-type", content_type);
                if (content_type === "text/javascript") {

// If this is a JavaScript module, rewrite the import specifiers as locators.

                    const source = buffer.toString("utf8");
                    const imports = scriptify_module(source).imports;
                    return Promise.all(
                        imports.map(function (the_import) {
                            return capabilities.locate(
                                the_import.specifier,
                                locator
                            );
                        })
                    ).then(
                        function on_located(locators) {
                            return res.end(
                                replace_specifiers(
                                    source,
                                    imports.map(function (the_import) {
                                        return the_import.specifier;
                                    }),
                                    locators
                                )
                            );
                        },
                        fail
                    );
                }

// Otherwise serve the compiled file verbatim.

                return res.end(buffer);
            },
            fail
        );
    }
    function on_client_found(client) {
        capabilities.on_log("WEBL found.");
        clearTimeout(launch_timer);

// Create a single padawan on each connecting client. The padawan is rendered as
// an iframe which fills the WEBL client's viewport.

        const padawan = client.padawan({
            on_log: capabilities.on_log,
            on_exception: capabilities.on_exception,
            type: "iframe",
            iframe_style_object: {
                border: "none",
                width: "100vw",
                height: "100vh"
            }
        });
        clients_and_padawans.set(client, padawan);
        return padawan.create().catch(capabilities.on_exception);
    }
    function on_client_lost(client) {
        capabilities.on_log("WEBL lost.");

// Forget the client and its padawans.

        clients_and_padawans.delete(client);
    }
    const webl_server = webl_server_constructor(
        location_of_the_webl_base,
        capabilities.on_exception,
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
                                );
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
