// This module is part of the WEBL suite. It is served to the browser by the
// WEBL server. When it is run, a WEBL is created and hooked up to the server.
// The WEBL may then be operated remotely.

/*jslint browser */

import make_webl from "./webl.js";

let webl;
let padawans = Object.create(null);

// Create a Worker that will be responsible for maintaining the WebSocket
// connection.

const worker = new Worker("./webl_relay.js");

// Inform the worker of the WebSockets endpoint.

const websockets_url = (
    window.location.protocol === "http:"
    ? "ws://"
    : "wss://"
) + window.location.host;
worker.postMessage(websockets_url);

// Each type of message received from the server invokes a different handler
// function.

const message_handlers = {
    create_padawan(id, spec) {

// Create a new padawan and let the server know when it is ready.

        function on_log(...values) {
            return worker.postMessage({
                type: "status",
                name: "log",
                value: {
                    padawan_name: spec.name,
                    values
                }
            });
        }

        function on_exception(reason) {
            return worker.postMessage({
                type: "status",
                name: "exception",
                value: {
                    padawan_name: spec.name,
                    reason
                }
            });
        }

        padawans[spec.name] = webl.padawan(Object.assign(
            {on_log, on_exception},
            spec
        ));
        return padawans[spec.name].create().then(
            function on_success() {
                return worker.postMessage({
                    type: "response",
                    request_id: id,
                    value: true
                });
            },
            function on_fail(exception) {
                return on_exception(exception.stack);
            }
        );
    },
    eval_module(id, {script, imports, padawan_name}) {

// Give a padawan some source code to evaluate, then transmit the
// resulting value to the server.

        const padawan = padawans[padawan_name];
        if (padawan === undefined) {
            return worker.postMessage({
                type: "response",
                request_id: id,
                reason: {
                    code: "padawan_not_found",
                    evidence: padawan_name
                }
            });
        }
        return padawan.eval(script, imports).then(
            function on_success(report) {
                return worker.postMessage({
                    type: "response",
                    request_id: id,
                    value: report
                });
            },
            function on_fail(exception) {
                return worker.postMessage({
                    type: "status",
                    name: "exception",
                    value: {
                        padawan_name,
                        reason: exception.stack
                    }
                });
            }
        );
    },
    destroy_padawan(id, {name}) {

// Destroy a padawan, if it exists.

        if (padawans[name] !== undefined) {
            padawans[name].destroy();
            delete padawans[name];
        }
        return worker.postMessage({
            type: "response",
            request_id: id,
            value: true
        });
    }
};
worker.onmessage = function (event) {
    if (typeof event.data === "boolean") {
        if (event.data) {

// The connection has been opened.

            if (webl === undefined) {
                webl = make_webl();
                window.onbeforeunload = webl.destroy;
                document.title = "WEBL";
                worker.postMessage({
                    type: "ready",
                    value: window.location.origin
                });
            } else {

// The server is back up. Reload the page to clear any global state (for
// example, modifications to the DOM or window object made by a "top" padawan).
// Following the reload a new connection will be attempted.

// Firefox, unlike other browsers, fires the "close" event on any open
// WebSockets as the page unloads. The relay worker responds to a "close" event
// by attempting to reestablish a WebSocket connection, and this appears to
// occasionally leave behind some sort of "ghost" WebSocket that kicks the page
// into an infinite reload loop. To suppress any doomed reconnection attempts,
// we terminate the relay worker before unloading the page.

                worker.terminate();
                window.location.reload();
            }
        } else {

// The connection has been closed. Destroy the WEBL (to avoid the possibility of
// orphaned padawans) and wait for the connection with the server to be
// repaired.

            if (webl !== undefined) {
                webl.destroy();
            }
            document.title = "Reconnecting...";
        }
    } else {

// A message has been received from the server.

        message_handlers[event.data.name](
            event.data.id,
            event.data.parameters
        );
    }
};
document.title = "Connecting...";
