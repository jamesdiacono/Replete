// A Model Context Protocol (MCP) server for Replete.

// Speaks the basic protocol over standard I/O, for example:

//  STDIN   {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
//  STDOUT  {"jsonrpc": "2.0", "id": 1, "result": {"tools": [...] }}

import child_process from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

const log_levels = Object.freeze([
    "debug",
    "info",
    "notice",
    "warning",
    "error",
    "critical",
    "alert",
    "emergency"
]);
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
const tools = [
    {
        name: "evaluate",
        description: "Evaluates code. Replete must already be running.",
        inputSchema: {
            type: "object",
            required: ["source", "platform"],
            properties: {
                source: {
                    type: "string",
                    description: (
                        "The source code to be evaluated, usually JavaScript."
                        + " It may contain import and export statements."
                    )
                },
                locator: {
                    type: "string",
                    description: (
                        "The file URL of the module containing the"
                        + " source, if any. Required if the source is contained"
                        + " in a file on disk."
                    )
                },
                platform: {
                    type: "string",
                    description: (
                        "Either \"browser\", \"node\", \"deno\", \"bun\","
                        + " or \"tjs\"."
                        + " This property determines which REPL evaluates the"
                        + "source. If unsure, try \"deno\"."
                    )
                }
            }
        }
    },
    {
        name: "start",
        description: "Starts Replete, or restarts if already running.",
        inputSchema: {
            type: "object",
            properties: {
                cwd: {
                    type: "string",
                    description: (
                        "The absolute path to the project directory. Modules"
                        + " outside this directory will not be importable."
                    )
                }
            }
        }
    },
    {
        name: "stop",
        description: "Stops Replete if it is running.",
        inputSchema: {type: "object"}
    }
];
const in_reader = readline.createInterface({input: process.stdin});

let log_level = "notice";
let out_reader;
let subprocess;

function write(message) {
    process.stdout.write(JSON.stringify(message) + "\n");
}

function respond(request_id, result) {
    return write({
        jsonrpc: "2.0",
        id: request_id,
        result
    });
}

function notify(params) {
    if (log_levels.indexOf(params.level) >= log_levels.indexOf(log_level)) {
        return write({
            jsonrpc: "2.0",
            method: "notifications/message",
            params
        });
    }
}

function on_result(message) {
    if (message.out !== undefined) {
        return notify({level: "notice", data: "Output: " + message.out});
    }
    if (message.err !== undefined) {
        return notify({level: "notice", data: "Error: " + message.err});
    }
    if (message.evaluation !== undefined) {
        return respond(message.id, {
            content: [{type: "text", text: "Value: " + message.evaluation}],
            isError: false
        });
    }
    if (message.exception !== undefined) {
        return respond(message.id, {
            content: [{type: "text", text: "Exception: " + message.exception}],
            isError: false
        });
    }
}

function close_out() {
    if (out_reader !== undefined) {
        out_reader.close();
        out_reader = undefined;
    }
}

function stop() {
    close_out();
    if (subprocess !== undefined) {
        subprocess.kill();
        subprocess = undefined;
    }
}

function start(cwd) {
    stop();
    return fs.promises.readFile(
        path.join(cwd, "replete.json"),
        "utf8"
    ).then(function (text) {
        return JSON.parse(text).command;
    }).catch(function () {
        return default_command;
    }).then(function (command) {
        subprocess = child_process.spawn(
            command[0],
            command.slice(1),
            {cwd}
        );
        subprocess.on("exit", function () {
            notify({level: "error", data: "Replete process died."});
            close_out();
            subprocess = undefined;
        });
        return new Promise(function (resolve, reject) {
            subprocess.on("error", reject);
            subprocess.on("spawn", function () {
                out_reader = readline.createInterface({
                    input: subprocess.stdout
                });
                out_reader.on("line", function (line) {
                    try {
                        on_result(JSON.parse(line));
                    } catch (exception) {
                        notify({level: "error", data: exception.stack});
                    }
                });
                subprocess.stderr.on("data", function (buffer) {
                    notify({level: "error", data: buffer.toString()});
                });
                resolve(subprocess);
            });
        });
    });
}

function on_request(message) {
    if (message.method === "initialize") {
        return respond(message.id, {
            protocolVersion: "2024-11-05",
            capabilities: {logging: {}, tools: {}},
            serverInfo: {name: "replete", title: "Replete", version: "1.0.0"}
        });
    }
    if (message.method === "logging/setLevel") {
        log_level = message.params.level;
        return respond(message.id, {});
    }
    if (message.method === "tools/list") {
        return respond(message.id, {tools});
    }
    if (message.method === "tools/call") {
        if (message.params.name === "evaluate") {
            if (subprocess === undefined) {
                return respond(message.id, {
                    content: [{
                        type: "text",
                        text: "Replete is not running, start it first."
                    }],
                    isError: true
                });
            }
            const command = Object.assign(
                {id: message.id},
                message.params.arguments
            );
            return subprocess.stdin.write(JSON.stringify(command) + "\n");
        }
        if (message.params.name === "start") {
            const cwd = message.params.arguments.cwd ?? process.cwd();
            return start(cwd).then(function () {
                respond(message.id, {
                    content: [{
                        type: "text",
                        text: "Replete started in " + cwd + "."
                    }],
                    isError: false
                });
            }).catch(function (error) {
                respond(message.id, {
                    content: [{type: "text", text: error.stack}],
                    isError: true
                });
            });
        }
        if (message.params.name === "stop") {
            stop();
            return respond(message.id, {
                content: [{type: "text", text: "Replete stopped."}],
                isError: false
            });
        }
        return respond(message.id, {
            content: [{
                type: "text",
                text: "Unknown tool \"" + message.params.name + "\"."
            }],
            isError: true
        });
    }
    return respond(message.id, {
        content: [{
            type: "text",
            text: "Unknown method \"" + message.method + "\"."
        }],
        isError: true
    });
}

function exit() {
    in_reader.close();
    stop();
    process.exit();
}

in_reader.on("close", stop);
in_reader.on("line", function (line) {
    on_request(JSON.parse(line));
});
process.on("SIGTERM", exit);
process.on("SIGINT", exit);
if (os.platform() !== "win32") {
    process.on("SIGHUP", exit);
}
