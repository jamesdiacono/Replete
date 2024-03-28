// This file is a Deno program whose sole purpose is to evaluate JavaScript
// source code in its global context, and report the results. When it is run, it
// connects to a TCP server and awaits instructions.

//  $ deno run /path/to/deno_padawan.js <tcp_port>

// The 'tcp_port' argument is the port number of a TCP server running on
// localhost. See cmdl.js for a description of the message protocol.

// Unlike the Node.js padawan, the Deno padawan will die on any uncaught
// exceptions or unhandled promise rejections. This is because Deno does not
// provide global handlers for errors.

function evaluate(script, import_specifiers, wait) {

// The 'evaluate' function evaluates the 'script', after resolving any imported
// modules. It returns a Promise that resolves to a report object.

    return Promise.all(
        import_specifiers.map(function (specifier) {
            return import(specifier);
        })
    ).then(function (modules) {

// The script is evaluated in the global scope, so it does not have access to
// any local variables. The imported modules are provided as a global variable.

        window.$imports = modules;

// The script is evaluated using an "indirect" eval, depriving it of access to
// the local scope.

        const value = window.eval(script);
        return (
            wait
            ? Promise.resolve(value).then(Deno.inspect)
            : Deno.inspect(value)
        );
    }).then(function (evaluation) {
        return {evaluation};
    }).catch(function (exception) {
        return {
            exception: (
                typeof exception?.stack === "string"
                ? exception.stack
                : "Exception: " + Deno.inspect(exception)
            )
        };
    });
}

let connection;
let buffer = new Uint8Array(0);

function consume() {

// The 'consume' function runs every command in the buffer in parallel.

    const string = new TextDecoder().decode(buffer);
    const parts = string.split("\n");
    if (parts.length === 1) {

// There is not yet a complete command in the buffer. Wait for more bytes.

        return;
    }
    const command = JSON.parse(parts[0]);

// Evaluate the script, eventually sending a report back to the server.

    evaluate(
        command.script,
        command.imports,
        command.wait
    ).then(function (report) {
        report.id = command.id;
        return connection.write(
            new TextEncoder().encode(
                JSON.stringify(report) + "\n"
            )
        );
    });

// Immediately run any remaining commands in the buffer.

    buffer = new TextEncoder().encode(
        parts.slice(1).join("\n")
    );
    return consume();
}

function receive(bytes) {

// Appends an array of bytes to the buffer.

    const concatenated = new Uint8Array(buffer.length + bytes.length);
    concatenated.set(buffer);
    concatenated.set(bytes, buffer.length);
    buffer = concatenated;
}

let chunk = new Uint8Array(16640);

function read() {

// Read the incoming bytes into the buffer.

    return connection.read(chunk).then(function (nr_bytes) {
        if (nr_bytes === null) {
            throw new Error("Connection closed.");
        }
        receive(chunk.slice(0, nr_bytes));
        consume();
        return read();
    });
}

// Connect to the TCP server on the specified port, and wait for instructions.

Deno.connect({
    port: Number.parseInt(Deno.args[0])
}).then(function (the_connection) {
    connection = the_connection;
    return read();
});
