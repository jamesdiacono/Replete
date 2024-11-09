// The padawan program for the Node.js and Bun CMDLs. See cmdl.js.

//  $ node /path/to/node_padawan.js <tcp_port>
//  $ bun run /path/to/node_padawan.js <tcp_port>

// Exceptions that occur outside of evaluation are printed to stderr.

/*jslint node, bun, global */

import console from "node:console";
import process from "node:process";
import net from "node:net";
import util from "node:util";
import readline from "node:readline";

// Bun does not yet support HTTP imports. Pending
// https://github.com/oven-sh/bun/issues/38, we use a plugin to polyfill this
// behavior.

const rx_any = /./;
const rx_http = /^https?:\/\//;
const rx_path = /^\.*\//;

function load_http_module(href) {
    return fetch(href).then(function (response) {
        return response.text().then(function (text) {
            return (
                response.ok
                ? {contents: text, loader: "js"}
                : Promise.reject(
                    new Error("Failed to load module '" + href + "': " + text)
                )
            );
        });
    });
}

if (typeof Bun === "object") {
    Bun.plugin({
        name: "http_imports",
        setup(build) {
            build.onResolve({filter: rx_path}, function (args) {
                if (rx_http.test(args.importer)) {
                    return {path: new URL(args.path, args.importer).href};
                }
            });
            build.onLoad({filter: rx_any, namespace: "http"}, function (args) {
                return load_http_module("http:" + args.path);
            });
            build.onLoad({filter: rx_any, namespace: "https"}, function (args) {
                return load_http_module("https:" + args.path);
            });
        }
    });
}

function evaluate(script, import_specifiers, wait) {
    return Promise.all(
        import_specifiers.map(function (specifier) {
            return import(specifier);
        })
    ).then(function (modules) {
        globalThis.$imports = modules;
        const value = globalThis.eval(script);
        return (
            wait
            ? Promise.resolve(value).then(util.inspect)
            : util.inspect(value)
        );
    }).then(function (evaluation) {
        return {evaluation};
    }).catch(function (exception) {
        return {
            exception: (
                typeof Bun === "object"
                ? Bun.inspect(exception)
                : (
                    typeof exception?.stack === "string"
                    ? exception.stack
                    : "Exception: " + util.inspect(exception)
                )
            )
        };
    });
}

// Connect to the TCP server on the specified port, then wait for instructions.

const socket = net.connect(
    Number.parseInt(process.argv[2]),
    "127.0.0.1" // match the hostname chosen by cmdl.js
);
socket.once("connect", function () {
    readline.createInterface({input: socket}).on("line", function (line) {

// Parse each line as a command object. Evaluate the script, eventually sending
// a report back to the server.

        const command = JSON.parse(line);
        return evaluate(
            command.script,
            command.imports,
            command.wait
        ).then(
            function on_evaluated(report) {
                report.id = command.id;
                return socket.write(JSON.stringify(report) + "\n");
            }
        );
    });

// Uncaught exceptions that occur outside of evaluation are non-fatal. They are
// caught by a global handler and written to stderr.

    process.on("uncaughtException", console.error);
    process.on("unhandledRejection", console.error);
});
socket.once("error", function (error) {

// Any problem with the transport mechanism results in the immediate termination
// of the process.

    console.error(error);
    return process.exit(1);
});
