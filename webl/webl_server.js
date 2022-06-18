// A WEBL server runs on Node.js, and serves the WEBL client to the browser. A
// persistent connection is maintained between the two. The server can be
// started, stopped or asked to make new padawans.

/*jslint node */

import path from "path";
import fs from "fs";
import http from "http";
import websocketify from "./websocketify.js";

function webl_server_constructor(
    location_of_the_webl_base,
    on_exception,
    on_client_found,
    on_client_lost,
    on_unhandled_request = function not_found(ignore, res) {
        res.statusCode = 404;
        return res.end();
    },
    humanoid = false
) {

// The 'location_of_the_webl_base' parameter is the absolute path to the
// directory containing the WEBL's source files on disk. Without it, the source
// of the webellion can not be found.

// The 'on_exception' parameter is a function which is called when the WEBL
// server itself encounters a problem.

// When the WEBL server receives an unrecognised HTTP request, it invokes the
// optional 'on_unhandled_request' parameter with the req and res objects.

// The 'humainoid' parameter determines the WEBL client's favicon. If true, it
// will be the visage of C3PO, otherwise it will be R2D2.

// The other two parameters are covered below. The constructor returns an object
// containing two functions:

//  start(port, hostname)
//      The 'start' method starts the server on the specified 'port' and
//      'hostname', returning a Promise which resolves to the chosen port number
//      once the server is ready. The 'port' parameter determines the port of
//      the web server. If a port is not specified, one is chosen automatically.
//      The 'hostname' parameter defaults to "localhost" if it is undefined.

//  stop()
//      The 'stop' method closes down the server. It returns a Promise which
//      resolves once the server is stopped.

// When a WEBL client connects to the server, the 'on_client_found' function is
// called with an interface for the client. Likewise, when a client disconnects,
// the 'on_client_lost' function is called with the same interface object.

// A client's interface is an object containing a single function:

//  padawan(spec)
//      The 'padawan' method returns an interface for a new, unique padawan. It
//      takes a 'spec' object, which is described in ./webl.js. The returned
//      object contains three functions:

//          create()
//              See ./webl.js.

//          eval(script, imports)
//              See ./webl.js.

//          destroy()
//              Similar to the function as described in ./webl.js, except that
//              it returns a Promise which resolves once the padawan has ceased
//              to exist.

    let connections = [];
    let clients = new WeakMap();
    let on_open_callbacks = [];
    let on_response_callbacks = Object.create(null);
    let on_status_callbacks = Object.create(null);
    let padawan_count = 0;
    function client_constructor(connection) {
        function request(name, parameters) {

// The 'request' function sends a request message thru the WebSocket connection
// to the client. It returns a Promise which resolves to the value of the
// response.

            const id = String(Math.random());
            connection.send(JSON.stringify({
                type: "request",
                id,
                name,
                parameters
            }));
            return new Promise(function (resolve) {
                on_response_callbacks[id] = resolve;
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
        return Object.freeze({padawan});
    }
    const server = http.createServer(function on_request(req, res) {
        function serve_file(file_path, mime_type) {
            return fs.readFile(file_path, "utf8", function (error, data) {
                if (error) {
                    on_exception(error);
                    res.statusCode = 500;
                    return res.end();
                }
                res.setHeader("content-type", mime_type);
                return res.end(data);
            });
        }
        if (req.url === "/favicon.ico") {
            return serve_file(
                path.join(
                    location_of_the_webl_base,
                    (
                        humanoid
                        ? "c2po.svg"
                        : "r2d2.svg"
                    )
                ),
                "image/svg+xml"
            );
        }
        if (
            req.url === "/webl.js" ||
            req.url === "/webl_client.js" ||
            req.url === "/webl_relay.js"
        ) {
            return serve_file(
                path.join(location_of_the_webl_base, req.url),
                "text/javascript"
            );
        }
        if (req.url === "/") {
            res.setHeader("content-type", "text/html");
            return res.end(
                "<!DOCTYPE html>\n"
                + "<script type=module src=webl_client.js></script>"
            );
        }
        return on_unhandled_request(req, res);
    });

// Modify the server to accept WebSocket connections, in addition to HTTP
// requests.

    websocketify(
        server,
        function on_open(connection) {
            connections.push(connection);

// Inform the subscribers of the newly opened connection.

            on_open_callbacks.forEach((callback) => callback());
            on_open_callbacks = [];
            const client = client_constructor(connection);
            clients.set(connection, client);
            return on_client_found(client);
        },
        function on_receive(ignore, message) {
            message = JSON.parse(message);
            if (message.type === "response") {

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
            connections.splice(connections.indexOf(connection), 1);
            const client = clients.get(connection);
            clients.delete(connection);
            return on_client_lost(client);
        }
    );
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

        connections.forEach(function (connection) {
            return connection.close();
        });
        return new Promise(function (resolve) {
            return server.close(resolve);
        });
    }
    return Object.freeze({start, stop});
}

export default Object.freeze(webl_server_constructor);
