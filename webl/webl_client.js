/*jslint browser */

// This module is part of the WEBL suite. It is served to the browser by the
// WEBL server. When it is run, a WEBL is created and hooked up to the server.
// The WEBL may then be operated remotely.

import make_webl from "./webl.js";

let webl;
let padawans = Object.create(null);

// Create a worker to maintain the WebSocket connection. Configure it with the
// URL to the server.

const worker = new Worker("./webl_relay.js");
worker.postMessage("ws://" + window.location.host);

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
    eval_module(id, {imports, script, padawan_name}) {

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

// The connection has been opened or closed.

        if (event.data) {
            webl = make_webl();
            window.onbeforeunload = webl.destroy;
            document.title = "WEBL";
        } else {

// Destroy the WEBL (to avoid the possibility of orphaned padawans) and wait for
// the connection with the server to be repaired.

            webl.destroy();
            document.title = "Reconnecting...";
        }
        return;
    }

// A message has been received from the server.

    return message_handlers[event.data.name](
        event.data.id,
        event.data.parameters
    );
};
document.body.style.margin = "0";
document.title = "Connecting...";
