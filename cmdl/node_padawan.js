// This file is a Node.js program whose sole purpose is to evaluate JavaScript
// source code in its global context, and report the results. When it is run, it
// connects to a TCP server and awaits instructions.

//  $ node /path/to/node_padawan.js <tcp_port>

// The 'tcp_port' argument is the port number of a TCP server running on
// localhost. See cmdl.js for a description of the message protocol.

// Any exceptions that occur outside of evaluation are printed to stderr.

import net from "node:net";
import vm from "node:vm";
import util from "node:util";
import readline from "node:readline";

function evaluate(script, import_specifiers, wait) {

// The 'evaluate' function evaluates the 'script', after resolving any imported
// modules. It returns a Promise that resolves to a report object.

    return Promise.all(
        import_specifiers.map(function (specifier) {
            return import(specifier);
        })
    ).then(function (modules) {

// The script is evaluated in the global scope so that it does not have access
// to any local variables. The imported modules are provided as a global
// variable.

        global.$imports = modules;
        const value = vm.runInThisContext(script, {
            importModuleDynamically(specifier) {
                return import(specifier);
            }
        });
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
                (
                    exception
                    && typeof exception.stack === "string"
                )
                ? exception.stack
                : "Exception: " + util.inspect(exception)
            )
        };
    });
}

// Connect to the TCP server on the specified port, then wait for instructions.

const socket = net.connect(
    Number.parseInt(process.argv[2]),
    "127.0.0.1", // match the hostname chosen by cmdl.js
    function on_connect() {
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

// Uncaught exceptions that occur as a result of, but not during evaluation are
// non-fatal. They are caught by a global handler and reported to stderr.

        process.on("uncaughtException", console.error);
        process.on("unhandledRejection", console.error);

// On the other hand, any problem with the transport mechanism results in
// the immediate and violent death of the process.

        socket.on("error", function (error) {
            console.error(error);
            return process.exit(1);
        });
    }
);
