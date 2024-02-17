// The WEBL server runs on Node.js, serving the WEBL client to the browser. A
// persistent connection is maintained between the two. The server can be
// started, stopped or asked to make new padawans.

/*jslint node */

import fs from "node:fs";
import http from "node:http";
import fileify from "../fileify.js";
import websocketify from "./websocketify.js";
const r2d2_svg_url = new URL("./r2d2.svg", import.meta.url);
const c3po_svg_url = new URL("./c3po.svg", import.meta.url);
const webl_js_url = new URL("./webl.js", import.meta.url);
const webl_client_js_url = new URL("./webl_client.js", import.meta.url);
const webl_relay_js_url = new URL("./webl_relay.js", import.meta.url);

// There is at least one Firefox bug that is resolved by including a trailing
// newline in the HTML source.
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1880710.

const html = `<!DOCTYPE html>
<html>
    <head><script type="module" src="webl_client.js"></script></head>
    <body></body>
</html>
`;

function make_webl_server(
    on_exception,
    on_client_found,
    on_client_lost,
    on_unhandled_request = function not_found(ignore, res) {
        res.statusCode = 404;
        return res.end();
    },
    humanoid = false
) {

// The 'on_exception' parameter is a function that is called when the WEBL
// server itself encounters a problem.

// When the WEBL server receives an unrecognized HTTP request, it invokes the
// optional 'on_unhandled_request' parameter with the req and res objects.

// The 'humainoid' parameter determines the WEBL client's favicon. If true, it
// will be the visage of C3PO, otherwise it will be R2D2.

// The other two parameters are covered below. The constructor returns an object
// containing two functions:

//  start(port, hostname)
//      The 'start' method starts the server on the specified 'port' and
//      'hostname', returning a Promise that resolves to the chosen port number
//      once the server is ready. The 'port' parameter determines the port of
//      the web server. If a port is not specified, one is chosen automatically.
//      The 'hostname' parameter defaults to "localhost" if it is undefined.

//  stop()
//      The 'stop' method closes down the server. It returns a Promise that
//      resolves once the server is stopped.

// When a WEBL client connects to the server, the 'on_client_found' function is
// called with an interface for the client. Likewise, when a client disconnects,
// the 'on_client_lost' function is called with the same interface object.

// A client's interface is an object containing two properties:

//  padawan(spec)
//      The 'padawan' method returns an interface for a new, unique padawan. It
//      takes a 'spec' object, described in ./webl.js. The returned object
//      contains three functions:

//          create()
//              See ./webl.js.

//          eval(script, imports)
//              See ./webl.js.

//          destroy()
//              Similar to the function as described in ./webl.js, except that
//              it returns a Promise that resolves once the padawan has ceased
//              to exist.

//  origin
//      The client's window.location.origin value.

    let sockets = [];
    let clients = new WeakMap();
    let on_response_callbacks = Object.create(null);
    let on_status_callbacks = Object.create(null);
    let padawan_count = 0;

    function make_client(connection, origin) {

        function request(name, parameters) {

// The 'request' function sends a request message thru the WebSocket connection
// to the client. It returns a Promise that resolves to the value of the
// response.

            const id = String(Math.random());
            connection.send(JSON.stringify({
                type: "request",
                id,
                name,
                parameters
            }));
            return new Promise(function (resolve, reject) {
                on_response_callbacks[id] = function (value, reason) {
                    return (
                        value === undefined
                        ? reject(reason)
                        : resolve(value)
                    );
                };
            });
        }

        function padawan(spec) {

// Each padawan is assigned a unique name, so that messages originating from
// different padawans may be distinguished.

            let name = "Padawan " + padawan_count;
            padawan_count += 1;

            function create() {
                on_status_callbacks[name] = function (
                    message_name,
                    parameters
                ) {
                    return (
                        message_name === "log"
                        ? spec.on_log(...parameters.values)
                        : spec.on_exception(parameters.reason)
                    );
                };
                return request(
                    "create_padawan",
                    {
                        name,
                        type: spec.type,
                        popup_window_features: spec.popup_window_features,
                        iframe_style_object: spec.iframe_style_object,
                        iframe_sandbox: spec.iframe_sandbox
                    }
                );
            }

            function eval_module(script, imports = []) {
                return request(
                    "eval_module",
                    {
                        script,
                        imports,
                        padawan_name: name
                    }
                );
            }

            function destroy() {
                delete on_status_callbacks[name];
                return request("destroy_padawan", {name});
            }

            return Object.freeze({
                create,
                eval: eval_module,
                destroy
            });
        }
        return Object.freeze({padawan, origin});
    }

    const server = http.createServer(function on_request(req, res) {

        function serve_file(url, mime_type) {
            return fileify(url).then(
                fs.promises.readFile
            ).then(function (buffer) {
                res.setHeader("content-type", mime_type);
                return res.end(buffer);
            }).catch(function (error) {
                on_exception(error);
                res.statusCode = 500;
                return res.end();
            });
        }

        if (req.url === "/favicon.ico") {
            return serve_file(
                (
                    humanoid
                    ? c3po_svg_url
                    : r2d2_svg_url
                ),
                "image/svg+xml"
            );
        }
        if (req.url === "/webl.js") {
            return serve_file(webl_js_url, "text/javascript");
        }
        if (req.url === "/webl_client.js") {
            return serve_file(webl_client_js_url, "text/javascript");
        }
        if (req.url === "/webl_relay.js") {
            return serve_file(webl_relay_js_url, "text/javascript");
        }
        if (req.url === "/") {
            res.setHeader("content-type", "text/html");
            return res.end(html);
        }
        return on_unhandled_request(req, res);
    });

// Modify the server to accept WebSocket connections, in addition to HTTP
// requests.

    websocketify(
        server,
        function on_open() {
            return;
        },
        function on_receive(connection, message) {
            message = JSON.parse(message);
            if (message.type === "ready") {

// The client is ready to start receiving messages.

                const client = make_client(connection, message.value);
                clients.set(connection, client);
                on_client_found(client);
            } else if (message.type === "response") {

// Attempt to match up the response with its request, using the request's ID.

                const on_response = on_response_callbacks[message.request_id];
                if (on_response !== undefined) {
                    return on_response(message.value, message.reason);
                }
            } else if (message.type === "status") {

// Attempt to match up status messages with the relevant padawan.

                const status_callback = on_status_callbacks[
                    message.value.padawan_name
                ];
                if (status_callback !== undefined) {
                    return status_callback(message.name, message.value);
                }
            }
        },
        function on_close(connection) {
            const client = clients.get(connection);
            if (client !== undefined) {
                clients.delete(connection);
                on_client_lost(client);
            }
        }
    );

// Keep track of each created socket so they can all be destroyed at once. This
// includes HTTP sockets in addition to WebSockets.

    server.on("connection", function (socket) {
        sockets.push(socket);
    });

    function start(port, hostname = "localhost") {
        return new Promise(function (resolve, reject) {
            server.once("error", reject);
            server.listen(port, hostname, function on_ready() {
                return resolve(server.address().port);
            });
        });
    }

    function stop() {

// The server will only close down once it no longer has active connections.
// Destroy all open sockets.

        sockets.forEach(function (socket) {
            socket.destroy();
        });
        return new Promise(function (resolve) {
            return server.close(resolve);
        });
    }

    return Object.freeze({start, stop});
}

export default Object.freeze(make_webl_server);
