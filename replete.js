// This is the Replete program. It defines the standard interface that text
// editor plugins are expected to adhere to. It should, however, be considered
// a starting point: you are encouraged to modify this file, in particular the
// capability functions, to suit your own needs.

// The Replete program can be run in either Node.js or Deno, depending on which
// environment your capabilities prefer. If you run Replete in Node.js, it
// will still be possible to evaluate in Deno (and vice versa).

// To start Replete in Node.js v18.6.0+, run

//      $ node /path/to/replete.js [options]

// To start Replete in Deno v1.35.3+, run

//      $ deno run --allow-all /path/to/replete.js [options]

// or, to skip installation,

//      $ deno run \
//          --allow-all \
//          --importmap https://link/to/Replete/import_map.json \
//          https://link/to/Replete/replete.js \
//          [options]

// Replete should be run from the directory containing your source code.

// The following options are supported:

//      --browser_port=<port>
//          The port number of the browser REPL. If this option is omitted, an
//          unallocated port is chosen automatically. Providing a static port
//          allows any connected tabs to survive a restart of Replete.

//      --browser_hostname=<hostname>
//          The hostname of the browser REPL. When this option is omitted, the
//          browser REPL listens only on localhost. This option may be used to
//          expose the browser REPL to the network.

//      --which_node=<path>
//          The path to the Node.js binary ('node'). If this option is omitted,
//          and Deno is running Replete, the Node.js REPL will not be available.

//      --node_debugger_port=<port>
//          A Node.js debugger will attempt to listen on the specified port.
//          This makes it possible to monitor your evaluations using a fully
//          featured debugger. To attach a debugger, open Google Chrome and
//          navigate to chrome://inspect.

//      --which_deno=<path>
//          The path to the Deno binary ('deno'). If this option is omitted,
//          and Node.js is running Replete, the Deno REPL will not be available.

//      --deno_debugger_port=<port>
//          Like the --node_debugger_port option, but for Deno. Both runtimes
//          use the V8 Inspector Protocol.

// The process communicates via its STDIN and STDOUT. Messages are sent in both
// directions, each occupying a single line. A message is a JSON-encoded object.

//             +------------------------------------------+
//             |                                          |
//             |               Text editor                |
//             |                                          |
//             +----------------+-------------------------+
//                              |        ^
//                              |        |
//                     Command  |        |  Result
//                    messages  |        |  messages
//                              |        |
//                              V        |
//          +----------------------------+--------------------+
//          |                                                 |
//          |                 Replete process                 |
//          |       (Node.js/Deno running replete.js)         |
//          |                                                 |
//          +---------+----------------+--------------+-------+
//                    |                |              |
//                    v                v              v
//            +--------------+ +--------------+ +-----------+
//            | Browser REPL | | Node.js REPL | | Deno REPL |
//            +--------------+ +--------------+ +-----------+

// The process receives "command" messages with the following properties:

//      source
//          The JavaScript source code to be evaluated, as a string.

//      locator
//          The file URL of the module being evaluated. This is required if the
//          source contains any import statements, but optional otherwise.

//      platform
//          Either "browser", "node" or "deno". This property determines which
//          REPL evaluates the source.

//      scope
//          If defined, this property is the name of the scope as a string.

//      id
//          If defined, this property will be copied verbatim onto the
//          corresponding result messages. It can be used to associate a result
//          with its command. It may be any value.

// The process sends "result" messages, which come in four varieties. Depending
// on its variety, a result message has one of the following properties. The
// value of the property is always a string representation of a value.

//      evaluation
//          The evaluated value, if evaluation was completed successfully.

//      exception
//          The exception, if evaluation failed.

//      out
//          Any arguments passed to console.log, or bytes written to STDOUT.

//      err
//          An exception that occurred outside of evaluation, or bytes written
//          to STDERR.

// A result message may also contain an 'id' property, as described above.

// Here are some examples of commands and the results they might induce.

//      COMMAND {"platform": "browser", "source": "navigator.vendor"}
//      RESULT  {"evaluation": "Google Inc."}

//      COMMAND {"platform": "node", "source": "process.version"}
//      RESULT  {"evaluation": "v14.4.0"}

//      COMMAND {"platform": "browser", "source": "process.version"}
//      RESULT  {"exception": "ReferenceError: process is not defined..."}

//      COMMAND {"platform": "deno", "source": "console.log(0 / 0, 1 / 0)"}
//      RESULT  {"out": "NaN Infinity\n"}
//      RESULT  {"evaluation": "undefined"}

//      COMMAND {"platform": "browser", "source": "1 + 1", "id": 42}
//      RESULT  {"evaluation": "2", "id": 42}

/*jslint node, deno */

import process from "node:process";
import url from "node:url";
import fs from "node:fs";
import readline from "node:readline";
import node_resolve from "./node_resolve.js";
import make_node_repl from "./node_repl.js";
import make_deno_repl from "./deno_repl.js";
import make_browser_repl from "./browser_repl.js";

function send_result(message) {
    process.stdout.write(JSON.stringify(message) + "\n");
}

// These are the capabilities given to the REPLs. See README.md for an
// explanation of each.

const capabilities = Object.freeze({
    source(message) {
        return Promise.resolve(message.source);
    },
    locate(specifier, parent_locator) {

// Fully qualified specifiers, such as HTTP URLs or absolute paths, are left for
// the runtime to resolve.

        if (/^\w+:/.test(specifier)) {
            return Promise.resolve(specifier);
        }

// Relative paths are simply adjoined to the parent module's locator.

        if (parent_locator === undefined) {
            return Promise.reject(
                "Can not resolve '" + specifier + "' without parent locator."
            );
        }
        if (specifier.startsWith(".") || specifier.startsWith("/")) {
            return Promise.resolve(new URL(specifier, parent_locator).href);
        }

// Any other specifier is assumed to designate a file some "node_modules"
// directory above the parent module.

// Deno does not expose its machinery for resolving into "node_modules".
// Node.js does, via 'import.meta.resolve', but in Node.js v20 this function
// became synchronous, making it a performance hazard.

// So, we do it ourselves.

        return node_resolve(specifier, parent_locator);
    },
    read(locator) {

// So that we do not inadvertently expose sensitive files to the network, we
// refuse to read any files that are not beneath the current working directory.

        const locator_url = new URL(locator);

// Ensure a trailing slash.

        const cwd_href = url.pathToFileURL(
            process.cwd()
        ).href.replace(
            /\/?$/,
            "/"
        );
        if (!locator_url.href.startsWith(cwd_href)) {
            return Promise.reject(new Error("Forbidden: " + locator));
        }
        return fs.promises.readFile(locator_url);
    },
    watch(locator) {
        return new Promise(function (resolve, reject) {
            const watcher = fs.watch(new URL(locator), resolve);
            watcher.on("error", reject);
            watcher.on("change", watcher.close);
        });
    },
    mime(locator) {

// By default, only JavaScript files are served to the REPLs. If you wish to
// serve other types of files, such as images, just return a suitable mime type.

        if (locator.endsWith(".js") || locator.endsWith(".mjs")) {
            return "text/javascript";
        }
    },
    out(string) {
        send_result({out: string});
    },
    err(string) {
        send_result({err: string});
    }
});

// Parse the command line arguments into an options object. Infer the path to
// the runtime's binary, using that as the default.

let options = Object.create(null);
if (typeof Deno === "object") {
    options.which_deno = Deno.execPath();
} else {
    options.which_node = process.argv[0];
}
process.argv.slice(2).forEach(function (argument) {
    const [ignore, name, value] = argument.match(/^--(\w+)=(.*)$/);
    options[name] = value;
});

// A separate REPL is configured for each platform.

const repls = Object.create(null);
repls.browser = make_browser_repl(
    capabilities,
    (
        options.browser_port !== undefined
        ? Number.parseInt(options.browser_port, 10)
        : undefined
    ),
    options.browser_hostname
);
if (options.which_node !== undefined) {
    repls.node = make_node_repl(
        capabilities,
        options.which_node,
        (
            options.node_debugger_port !== undefined
            ? ["--inspect=" + options.node_debugger_port]
            : []
        ),
        process.env
    );
}
if (options.which_deno !== undefined) {
    repls.deno = make_deno_repl(
        capabilities,
        options.which_deno,
        (
            options.deno_debugger_port !== undefined
            ? ["--inspect=127.0.0.1:" + options.deno_debugger_port]
            : []
        ),
        process.env
    );
}

function on_fail(exception) {
    send_result({err: exception.stack + "\n"});
}

function on_command(command) {

// The 'on_command' function relays an incoming 'command' message to the
// relevant REPL. The REPL's response is relayed back as a result message.

    const repl = repls[command.platform];
    if (repl === undefined) {
        return on_fail(new Error("Platform unavailable: " + command.platform));
    }
    return repl.send(
        command,
        function on_result(evaluation, exception) {

// The browser REPL may yield multiple results for each command, when multiple
// tabs are connected. Only one of 'evaluation' and 'exception' is a string,
// the other is undefined.

            send_result({
                evaluation,
                exception,
                id: command.id
            });
        }
    ).catch(
        on_fail
    );
}

// Start the REPLs.

Object.values(repls).forEach(function (repl) {
    repl.start().catch(on_fail);
});

// REPLs caught in an infinite loop require explicit termination, otherwise they
// can survive the death of this process.

function on_exit() {
    Promise.all(Object.values(repls).map(function (repl) {
        return repl.stop();
    })).then(function () {
        process.exit();
    });
}

process.on("SIGTERM", on_exit);
process.on("SIGINT", on_exit);

// Begin reading command messages from STDIN, line by line.

readline.createInterface(
    {input: process.stdin}
).on("line", function (line) {
    on_command(JSON.parse(line));
});
