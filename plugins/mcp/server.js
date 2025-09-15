// A Model Context Protocol (MCP) server for Replete.

// Speaks the basic protocol over standard I/O, for example:

//  STDIN   {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
//  STDOUT  {"jsonrpc": "2.0", "id": 1, "result": {"tools": [...]}}

/*jslint web */

import child_process from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
const methodology_href = import.meta.resolve("./methodology.md");

const json_rpc_not_found = -32002;
const json_rpc_invalid_request = -32600;
const json_rpc_method_not_found = -32601;
const log_levels = [
    "debug",
    "info",
    "notice",
    "warning",
    "error",
    "critical",
    "alert",
    "emergency"
];
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
    "--content_type=map:application/json",
    "--content_type=css:text/css",
    "--content_type=html:text/html; charset=utf-8",
    "--content_type=wasm:application/wasm",
    "--content_type=woff2:font/woff2",
    "--content_type=svg:image/svg+xml",
    "--content_type=png:image/png",
    "--content_type=webp:image/webp"
];
const out_resource = {
    uri: "file://out.log",
    name: "out.log",
    title: "Log output",
    description: (
        "For the browser, this is a textual description of arguments passed"
        + " to console.log."
        + " For other platforms, this is stdout interpreted as UTF-8."
    ),
    mimeType: "text/plain"
};
const err_resource = {
    uri: "file://err.log",
    name: "err.log",
    title: "Error output",
    description: (
        "For the browser, this is a textual description of any uncaught"
        + " exceptions or unhandled Promise rejections in string form."
        + " For other platforms, this is stderr interpreted as UTF-8."
    ),
    mimeType: "text/plain"
};

let evaluate_tool = {
    name: "evaluate",
    description: (
        "Evaluates code. Replete must already be running.\n\n"
        + "During and after evaluation, there may be output in the form of"
        + " logging and errors. This output can be vital to understanding"
        + " the behavior of evaluated code, so always read the "
        + out_resource.uri + " and " + err_resource.uri + " resources"
        + " following evaluation. Because output can continue after"
        + " evaluation completes, for example on a future turn,"
        + " subscribing to these resources is recommended."
    ),
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
};
let output_tool = {
    name: "output",
    description: (
        "Polls for any logs and errors that have occurred since the last"
        + " call to Output or Evaluate. This is a fallback for clients that"
        + " want to know the output of evaluated code that runs"
        + " over many turns of the event loop, but"
        + " are unable to subscribe to the MCP resources "
        + out_resource.uri + " and " + err_resource.uri + "."
    ),
    inputSchema: {type: "object"}
};
let restart_tool = {
    name: "restart",
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
};
let stop_tool = {
    name: "stop",
    description: "Stops Replete if it is running.",
    inputSchema: {type: "object"}
};

let err = "";
let out = "";
let err_at = err.length;
let out_at = out.length;
let err_subscribed = false;
let out_subscribed = false;
let log_level = "notice";
let out_reader;
let subprocess;

function write(message) {
    process.stdout.write(JSON.stringify(message) + "\n");
}

function ok(request_id, result) {
    return write({
        jsonrpc: "2.0",
        id: request_id,
        result
    });
}

function fail(request_id, code, message, data = {}) {
    return write({
        jsonrpc: "2.0",
        id: request_id,
        error: {code, message, data}
    });
}

function resource_updated(resource) {
    return write({
        jsonrpc: "2.0",
        method: "notifications/resources/updated",
        params: resource
    });
}

function resource_not_found(request_id, uri) {
    return fail(request_id, json_rpc_not_found, "Resource not found", {uri});
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

function indent(string) {
    return string.split("\n").map(function (line) {
        return "    " + line;
    }).join("\n");
}

function on_result(message) {
    if (message.out !== undefined) {
        out += message.out;
        if (out_subscribed) {
            resource_updated(out_resource);
        }
        return;
    }
    if (message.err !== undefined) {
        err += message.err;
        if (err_subscribed) {
            resource_updated(err_resource);
        }
        return;
    }
    if (message.evaluation !== undefined || message.exception !== undefined) {
        const request = message.id;
        let report = (
            (
                message.exception !== undefined
                ? (
                    "# Status"
                    + "\n\nEvaluation failed with an exception."
                    + "\n\n# Exception\n\n"
                    + indent(message.exception)
                )
                : (
                    "# Status"
                    + "\n\nEvaluation succeeded."
                    + "\n\n# Value\n\n"
                    + indent(message.evaluation)
                )
            )
            + "\n\n# Log output\n\n"
            + indent(out.slice(out_at))
            + "\n\n# Error output\n\n"
            + indent(err.slice(err_at))
            + "\n\n# Platform\n\n"
            + request.params.arguments.platform
            + "\n\n# Evaluated source\n\n"
            + indent(request.params.arguments.source)
        );
        err_at = err.length;
        out_at = out.length;
        return ok(request.id, {
            content: [{type: "text", text: report}],
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

function restart(cwd) {
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
        return ok(message.id, {
            protocolVersion: "2024-11-05",
            capabilities: {
                logging: {},
                resources: {subscribe: true},
                tools: {}
            },
            serverInfo: {
                name: "replete",
                title: "Replete",
                version: "1.0.0"
            }
        });
    }
    if (message.method === "logging/setLevel") {
        log_level = message.params.level;
        return ok(message.id, {});
    }
    if (message.method.startsWith("notifications/")) {
        return;
    }
    if (message.method === "resources/list") {
        return ok(message.id, {resources: [out_resource, err_resource]});
    }
    if (message.method === "resources/read") {
        if (message.params.uri === out_resource.uri) {
            return ok(message.id, {
                contents: [Object.assign({text: out}, out_resource)]
            });
        }
        if (message.params.uri === err_resource.uri) {
            return ok(message.id, {
                contents: [Object.assign({text: err}, err_resource)]
            });
        }
        return resource_not_found(message.id, message.params.uri);
    }
    if (message.method === "resources/subscribe") {
        if (message.params.uri === out_resource.uri) {
            out_subscribed = true;
            return;
        }
        if (message.params.uri === err_resource.uri) {
            err_subscribed = true;
            return;
        }
        return resource_not_found(message.id, message.params.uri);
    }
    if (message.method === "resources/templates/list") {
        return ok(message.id, {resourceTemplates: []});
    }
    if (message.method === "tools/list") {
        return ok(message.id, {
            tools: [
                restart_tool,
                evaluate_tool,
                output_tool,
                stop_tool
            ]
        });
    }
    if (message.method === "tools/call") {
        if (message.params.name === "evaluate") {
            if (subprocess === undefined) {
                return ok(message.id, {
                    content: [{
                        type: "text",
                        text: "Replete is not running, start it first."
                    }],
                    isError: true
                });
            }
            const command = Object.assign(
                {id: message},
                message.params.arguments
            );
            err_at = err.length;
            out_at = out.length;
            return subprocess.stdin.write(JSON.stringify(command) + "\n");
        }
        if (message.params.name === "output") {
            const report = (
                "\n\n# Log output\n\n"
                + indent(out.slice(out_at))
                + "\n\n# Error output\n\n"
                + indent(err.slice(err_at))
            );
            err_at = err.length;
            out_at = out.length;
            return ok(message.id, {
                content: [{type: "text", text: report}],
                isError: false
            });
        }
        if (message.params.name === "restart") {
            const cwd = message.params.arguments.cwd ?? process.cwd();
            return restart(cwd).then(function () {
                ok(message.id, {
                    content: [{
                        type: "text",
                        text: "Replete started in " + cwd + "."
                    }],
                    isError: false
                });
            }).catch(function (error) {
                ok(message.id, {
                    content: [{type: "text", text: error.stack}],
                    isError: true
                });
            });
        }
        if (message.params.name === "stop") {
            stop();
            return ok(message.id, {
                content: [{type: "text", text: "Replete stopped."}],
                isError: false
            });
        }
        return fail(
            message.id,
            json_rpc_invalid_request,
            "Unknown tool \"" + message.params.name + "\"."
        );
    }
    return fail(
        message.id,
        json_rpc_method_not_found,
        "Unknown method \"" + message.method + "\"."
    );
}

function exit() {
    stop();
    process.exit();
}

fetch(methodology_href).then(function (response) {
    return (
        response.ok
        ? response.text()
        : Promise.reject(new Error(response.status))
    );
}).catch(function (error) {
    return "Failed to load " + methodology_href + ": " + error.message;
}).then(function (methodology_text) {
    evaluate_tool.description += (
        "\n\nIf this tool is available to you, you may be"
        + " expected to practice REPL-driven development. Read on for an"
        + " introduction to that methodology.\n\n"
        + methodology_text
    );
    const in_reader = readline.createInterface({input: process.stdin});
    in_reader.on("close", exit);
    in_reader.on("line", function (line) {
        const message = JSON.parse(line);
        on_request(message);
    });
});
process.on("SIGTERM", exit);
process.on("SIGINT", exit);
if (os.platform() !== "win32") {
    process.on("SIGHUP", exit);
}
