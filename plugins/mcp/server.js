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

const debug_path = process.argv[2];
const json_rpc_invalid_request = -32600;
const json_rpc_method_not_found = -32601;
const default_command = [
    "deno",
    "run",
    "--allow-all",
    "--importmap",
    "https://repletejs.org/src/latest/import_map.json",
    "https://repletejs.org/src/latest/replete.js",
    "--browser_port=0", // prevent collision with the human's WEBL
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
const restart_tool = {
    name: "restart",
    description: `
The _restart_ tool starts Replete, or restarts it if it is already running.

The tool responds with the path to the _output_ file containing the Replete
process's stdout and stderr. The _output_ file __must__ be monitored, for it is
the only way to discover evaluation results, logging, the WEBL's address, and
startup errors, among other things.

Prior to evaluating code in the browser, a WEBL must first be connected. This is
accomplished by launching a browser and opening the WEBL's address once it
appears in the _output_. The agent can then observe and interact with the WEBL
as necessary.

Replete's stdout appears in the _output_ as one JSON object per line. Each
object will have one of these properties, all a string representation of a
value:

- 'evaluation': the value, if evaluation completed.
- 'exception': the exception, if evaluation failed.
- 'out': arguments passed to 'console.log', or a UTF-8 interpretation of bytes
   written to stdout. Also Replete's own status messages, such as "WEBL
   found.".
- 'err': an uncaught exception or unhandled Promise rejection that occurred
   outside of evaluation (for example, in a callback), or a UTF-8
   interpretation of bytes written to stderr.

In addition, 'evaluation' and 'exception' objects will also carry the
corresponding 'id' property provided by the _evaluate_ tool, if specified.

The Replete process's stderr appears in the _output_ as lines of unstructured
text, not JSON. It is usually just chatter but can include important error
information.
`,
    inputSchema: {
        type: "object",
        properties: {
            cwd: {
                type: "string",
                description: (
                    "The absolute path to the project directory. Modules"
                    + " outside this directory will not be importable."
                    + " Where the replete.json file should be located, if there"
                    + " is one. Defaults to the MCP server's CWD if omitted."
                )
            },
            output: {
                type: "string",
                description: (
                    "The absolute path where the output file will be"
                    + " created. Defaults to a randomly named file in the"
                    + " system's temporary directory. Optional."
                )
            }
        }
    }
};
const evaluate_tool = {
    name: "evaluate",
    description: `
The _evaluate_ tool evaluates JavaScript code and reports the result. It fails
if Replete is not running.

It responds immediately with the path to the _output_ file, mentioned above,
which will grow as evaluation proceeds, and possibly afterwards if work has
been scheduled for a future turn. The vast majority of evaluations complete in
less than a second, so any evaluation taking longer than that has most likely
hung.

Unlike most JavaScript REPLs, Replete permits the evaluation of import
statements and other module syntax. Imports will be resolved relative to the
'locator' parameter.

Instances of 'import.meta.main' in evaluated source will be replaced
with 'true'. This can be leveraged to conditionally run module scaffolding such
as demos or tests. To run a module in this way, provide the file's text as
the 'source' parameter and its file URL as the 'locator'. __Do not__ import
such modules from a wrapper script, as the scaffolding will not run.

There is no need to catch errors and log them. Any uncaught exceptions or
unhandled Promise rejections will be reported as "err" results.
`,
    inputSchema: {
        type: "object",
        required: ["source", "platform"],
        properties: {
            source: {
                type: "string",
                description: (
                    "The source code to be evaluated, usually JavaScript."
                    + " It may contain import and export statements. Required."
                )
            },
            locator: {
                type: "string",
                description: (
                    "The file URL of the module containing the"
                    + " source, if any. Required if the source contains"
                    + " relative import specifiers, or lives in a file on disk."
                )
            },
            platform: {
                type: "string",
                description: (
                    "One of \"browser\", \"node\", \"deno\", etc."
                    + " Determines which REPL evaluates the"
                    + "source. If unsure, try \"deno\". Required."
                )
            },
            id: {
                type: "string",
                description: (
                    "An arbitrary value, usually a number or string, that can"
                    + " be used to correlate a result with a command. Optional."
                )
            }
        }
    }
};
const stop_tool = {
    name: "stop",
    description: "Stops Replete if it is running.",
    inputSchema: {type: "object"}
};

let log_queue = Promise.resolve();
let output_path;
let stdout_reader;
let subprocess;

function debug(stream, value) {
    if (debug_path === undefined) {
        return;
    }
    const string = (
        typeof value === "string"
        ? value
        : JSON.stringify(value, undefined, 4)
    );
    const lines = string.split("\n");
    const prefixed_lines = lines.map(function (line) {
        return stream.padEnd(11, " ") + " " + line;
    });
    const prefixed = prefixed_lines.join("\n") + "\n";
    log_queue = log_queue.then(function () {
        return fs.promises.appendFile(debug_path, prefixed);
    });
}

function write(message) {
    debug("JSONRPC OUT", message);
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

function output(text) {
    fs.promises.appendFile(output_path, text + "\n");
}

function close() {
    if (stdout_reader !== undefined) {
        stdout_reader.close();
        stdout_reader = undefined;
    }
}

function stop() {
    close();
    if (subprocess !== undefined) {
        subprocess.kill();
        subprocess = undefined;
    }
}

function restart(cwd) {
    stop();
    return Promise.all([
        fs.promises.readFile(
            path.join(cwd, "replete.json"),
            "utf8"
        ).then(function (text) {
            const parsed = JSON.parse(text);
            if (parsed.plugins?.mcp !== undefined) {
                return parsed.plugins.mcp.command;
            }
            return parsed.command;
        }).catch(function () {
            return default_command;
        }),
        fs.promises.writeFile(output_path, "")
    ]).then(function ([command]) {
        debug("Replete CMD", command);
        subprocess = child_process.spawn(
            command[0],
            command.slice(1),
            {cwd}
        );
        subprocess.on("exit", function () {
            output("Replete process died.");
            close();
            subprocess = undefined;
        });
        return new Promise(function (resolve, reject) {
            subprocess.on("error", reject);
            subprocess.on("spawn", function () {
                stdout_reader = readline.createInterface({
                    input: subprocess.stdout
                });
                stdout_reader.on("line", function (line) {
                    try {
                        const result = JSON.parse(line);
                        debug("Replete OUT", result);
                        output(JSON.stringify(result));
                    } catch (exception) {
                        debug("Replete OUT", line);
                        output(exception.stack);
                    }
                });
                subprocess.stderr.on("data", function (buffer) {
                    const string = buffer.toString();
                    debug("Replete ERR", string);
                    output(string);
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
                tools: {}
            },
            serverInfo: {
                name: "replete",
                title: "Replete",
                version: "1.0.0"
            }
        });
    }
    if (message.method.startsWith("notifications/")) {
        return;
    }
    if (message.method === "tools/list") {
        return ok(message.id, {
            tools: [
                restart_tool,
                evaluate_tool,
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
            const command = message.params.arguments;
            debug("Replete IN", command);
            ok(message.id, {
                content: [{type: "text", text: output_path}],
                isError: false
            });
            return subprocess.stdin.write(JSON.stringify(command) + "\n");
        }
        if (message.params.name === "restart") {
            const cwd = (
                message.params.arguments.cwd
                ?? process.cwd()
            );
            output_path = (
                message.params.arguments.output
                ?? path.join(os.tmpdir(), crypto.randomUUID())
            );
            return restart(cwd).then(function () {
                ok(message.id, {
                    content: [{type: "text", text: output_path}],
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

const in_reader = readline.createInterface({input: process.stdin});
in_reader.on("close", exit);
in_reader.on("line", function (line) {
    const message = JSON.parse(line);
    debug("JSONRPC IN", message);
    on_request(message);
});
process.on("SIGTERM", exit);
process.on("SIGINT", exit);
if (os.platform() !== "win32") {
    process.on("SIGHUP", exit);
}
