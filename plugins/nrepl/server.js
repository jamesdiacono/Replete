// An nREPL server for Replete. See ./README.md for instructions.

//  $ node server.js [port]          # using Node.js
//  $ deno run -A server.js [port]   # using Deno

import {Buffer} from "node:buffer";
import child_process from "node:child_process";
import console from "node:console";
import fs from "node:fs";
import process from "node:process";
import net from "node:net";
import os from "node:os";
import readline from "node:readline";
import url from "node:url";
import bencode from "./bencode.js";

// The official nREPL protocol specification is vague.

//      https://nrepl.org/nrepl/design/overview.html
//      https://nrepl.org/nrepl/ops.html
//      https://nrepl.org/nrepl/building_servers.html

// Missing details were obtained by monitoring the communication between various
// clients and a Clojure nREPL server. For CIDER, monitoring can be enabled by
// typing

//      M-x nrepl-toggle-message-logging

const hostname = "127.0.0.1";
const default_command = [
    "deno",
    "run",
    "--allow-all",
    "--importmap",
    "https://deno.land/x/replete/import_map.json",
    "https://deno.land/x/replete/replete.js",
    "--browser_port=9325",
    "--content_type=js:text/javascript",
    "--content_type=mjs:text/javascript",
    "--content_type=css:text/css",
    "--content_type=html:text/html; charset=utf-8",
    "--content_type=wasm:application/wasm",
    "--content_type=woff2:font/woff2",
    "--content_type=svg:image/svg+xml",
    "--content_type=png:image/png",
    "--content_type=webp:image/webp"
];
const rx_platform = /\*([a-z]+)\*/;

function timestamp() {
    return new Date().toJSON().replace("T", " ").replace("Z", "000000");
}

function start_replete(command) {
    return new Promise(function (resolve, reject) {
        const the_process = child_process.spawn(
            command[0],
            command.slice(1),
            {stdio: ["pipe", "pipe", "inherit"]}  // passthru stderr
        );
        the_process.on("error", reject);
        the_process.on("spawn", function () {
            resolve(the_process);
        });
    });
}

function start_tcp() {
    return new Promise(function (resolve, reject) {
        const tcp_server = net.createServer();
        tcp_server.on("error", reject);
        return tcp_server.listen(
            Number(process.argv[2]) || 0,
            hostname,
            function callback() {
                resolve(tcp_server);
            }
        );
    });
}

Promise.all([
    start_replete(default_command),
    start_tcp()
]).then(function ([replete_process, tcp_server]) {
    let sockets = [];
    let sessions = Object.create(null);
    let requests = Object.create(null);
    let buffer = new Uint8Array();
    let platform = "deno";
    const port = tcp_server.address().port;

    function send_command(message) {
        replete_process.stdin.write(JSON.stringify(message) + "\n");
    }

    function send_response(message, routing) {
        const socket_nr = sessions[routing.session];
        const socket = sockets[socket_nr];
        if (socket !== undefined) {
            socket.write(bencode.encode(
                Object.assign({}, message, {
                    id: routing.id,
                    session: String(routing.session),
                    "time-stamp": timestamp()
                })
            ));
        }
    }

    function broadcast_response(message) {
        const entries = Object.entries(requests);
        entries.forEach(function ([id, session]) {
            send_response(message, {id, session});
        });
        return entries.length > 0;
    }

    function on_request(socket_nr, message) {
        if (message.op === "clone") {
            const session_nr = Object.keys(sessions).length;
            const session = String(session_nr);
            sessions[session] = socket_nr;
            return send_response(
                {
                    "new-session": session,
                    status: ["done"]
                },
                {
                    id: message.id,
                    session
                }
            );
        }
        const routing = {
            id: message.id,
            session: message.session,
            socket: socket_nr
        };
        if (message.op === "close") {
            send_response({status: ["done"]}, routing);
            delete sessions[message.session];
            return;
        }
        if (message.op === "describe") {
            return send_response(
                {
                    aux: {},
                    ops: {
                        clone: {},
                        close: {},
                        describe: {},
                        eval: {},
                        "out-subscribe": {}
                    },
                    versions: {
                        nrepl: {
                            "version-string": "1.0.0",
                            major: "1",
                            minor: "0",
                            incremental: "0",
                            qualifier: ""
                        },
                        clojure: {},    // avoid breaking monroe
                        java: {}        // avoid breaking monroe
                    },
                    status: ["done"]
                },
                routing
            );
        }
        if (message.op === "eval") {
            const matches = message.code.trim().match(rx_platform);
            if (matches) {
                platform = matches[1];
                console.error("Set platform: ", platform);
                message.code = "navigator.userAgent";
            }
            requests[message.id] = message.session;
            let locator;
            try {
                locator = url.pathToFileURL(message.file);
            } catch (_) {}
            return send_command({
                platform,
                source: message.code,
                locator,
                scope: message.session + ":" + message.file,
                id: routing
            });
        }
        if (message.op === "out-subscribe") {
            requests[message.id] = message.session;
            return send_response(
                {"out-subscribe": message.session, status: ["done"]},
                routing
            );
        }
        console.error("Op not supported: ", message.op);
    }

// For the benefit of nREPL clients, print the network address of the server to
// stdout and write the port to the .nrepl-port file.

    console.log(
        "nREPL server started on port " + port + " on host " + hostname
        + " - nrepl://" + hostname + ":" + port
    );
    fs.writeFile(".nrepl-port", String(port), function (error) {
        if (error) {
            console.error("Failed to write .nrepl-port: ", error);
        }
    });

// Listen for TCP connections from nREPL clients.

    tcp_server.on("connection", function (socket) {
        const socket_nr = sockets.length;
        sockets.push(socket);
        socket.on("data", function (chunk) {
            buffer = Buffer.concat([buffer, chunk]);
            try {
                const [value, at] = bencode.decode_from(buffer, 0);
                buffer = buffer.slice(at);
                on_request(socket_nr, value);
            } catch (_) {}
        });
        socket.on("error", console.error);
        socket.on("close", function () {
            console.error(`nREPL #${socket_nr} disconnected.`);
            sockets[socket_nr] = undefined;
        });
        console.error(`nREPL #${socket_nr} connected.`);
    });

// Listen for result messages from Replete.

    readline.createInterface(
        {input: replete_process.stdout}
    ).on("line", function (line) {
        const {id, evaluation, exception, out, err} = JSON.parse(line);
        const routing = id;
        if (evaluation !== undefined) {
            send_response({value: evaluation}, routing);
            send_response({status: ["done"]}, routing);
            delete requests[routing.id];
        } else if (exception !== undefined) {
            send_response({ex: exception, status: ["eval-error"]}, routing);

// For CIDER at least, it is not enough to send an :ex response because it is
// never displayed anywhere. To be sure that the exception is visible, we must
// also send an :err response.

            send_response({err: exception + "\n"}, routing);
            send_response({status: ["done"]}, routing);
            delete requests[routing.id];
        } else if (out !== undefined) {
            if (!broadcast_response({out})) {
                console.log(out);
            }
        } else if (err !== undefined) {
            if (!broadcast_response({err})) {
                console.log(err);
            }
        }
    });
    replete_process.on("exit", function (exit_code) {
        console.error("Replete exited with code " + exit_code + ".");
        process.exit(1);
    });

    function exit() {
        replete_process.kill();
        process.exit();
    }

    process.on("SIGTERM", exit);
    process.on("SIGINT", exit);
    if (os.platform() !== "win32") {
        process.on("SIGHUP", exit);
    }
});
