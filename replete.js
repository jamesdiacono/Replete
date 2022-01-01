// This is an example of a REPL built using Replete. It is a very minimal
// configuration, and may be considered a starting point for building more
// interesting REPLs. To start it, run

//      $ node --experimental-import-meta-resolve /path/to/replete.js

// from a directory which contains your source code.

// The process communicates via STDIN and STDOUT. Messages are sent in both
// directions, each message occupying a single line. A message is a JSON-encoded
// object.

//             +------------------------------------------+
//             |                                          |
//             |               Text editor                |
//             |                                          |
//             +----------------+--------^----------------+
//                              |        |
//                              |        |
//       Command messages       |        |  Status messages
//  {source, locator, platform} |        |  {type, string}
//                              |        |
//                              |        |
//          +-------------------v--------+--------------------+
//          |                                                 |
//          |                 Node.js process                 |
//          |                   (replete.js)                  |
//          |                                                 |
//          | +--------------+ +--------------+ +-----------+ |
//          | | Browser REPL | | Node.js REPL | | Deno REPL | |
//          | +--------------+ +--------------+ +-----------+ |
//          |                                                 |
//          +-------------------------------------------------+

// The process receives "command" messages with the following properties:

//      source
//          The JavaScript source code to be evaluated, as a string.

//      locator
//          The locator string of the module being evaluated. This is required
//          if the source contains any import statements, but optional
//          otherwise.

//      platform
//          Either "browser", "node" or "deno". This property determines which
//          REPL will evaluate the source.

// The process sends "status" messages with the following properties:

//      type
//          Wun of "evaluation", "exception", "out" or "err". A "evaluation" or
//          "exception" message is sent with the result of each evaluation. The
//          "out" and "err" messages result from indirect output and exceptions.

//      string
//          A textual representation of the value or exception.

// Here are some examples of commands and the status messages they might induce.

//      COMMAND {"platform":"browser", "source":"navigator.vendor"}
//      STATUS  {"type": "evaluation", "string": "Google Inc."}

//      COMMAND {"platform":"node", "source":"process.version"}
//      STATUS  {"type": "evaluation", "string": "v14.4.0"}

//      COMMAND {"platform":"browser", "source":"process.version"}
//      STATUS  {"type": "exception", "string": "ReferenceError: process is..."}

//      COMMAND {"source":"console.log(0 / 0, 1 / 0)"}
//      STATUS  {"type": "out", "string": "NaN Infinity"}
//      STATUS  {"type": "evaluation", "string": "undefined"}

/*jslint node */

import path from "path";
import fs from "fs";
import readline from "readline";
import util from "util";
import make_node_repl from "./node_repl.js";
import make_deno_repl from "./deno_repl.js";
import make_browser_repl from "./browser_repl.js";

const root_directory = process.cwd();

function send_status(type, string) {

// The 'send_status' function writes a single status message to STDOUT, followed
// by a newline.

    console.log(JSON.stringify({type, string}));
}

// These are the capabilities given to each platform's REPL. See README.md for a
// description of each.

const capabilities = Object.freeze({
    source(message) {
        return Promise.resolve(message.source);
    },
    locate(specifier, parent_locator) {
        if (/^https?:/.test(specifier)) {

// Remote specifiers are left for the runtime to resolve.

            return Promise.resolve(specifier);
        }

// This set of capabilities use absolute file paths as locators. This is the
// simplest possible locator format.

// The 'import.meta.resolve' function allows us to use Node's own mechanism for
// locating files. It deals in URLs rather than paths, hence the conversions.

        if (parent_locator !== undefined) {
            parent_locator = "file://" + parent_locator;
        }
        return import.meta.resolve(specifier, parent_locator).then(
            function (file_url) {
                return file_url.replace("file://", "");
            }
        );
    },
    read(locator) {

// So that we do not inadvertently expose sensitive files to the network, we
// refuse to read any files which are not beneath the root directory.

        if (!locator.startsWith(root_directory + "/")) {
            return Promise.reject(new Error("Forbidden: " + locator));
        }
        return fs.promises.readFile(locator);
    },
    mime(locator) {

// By default, only JavaScript files are served to the REPLs. If you wish to
// serve other types of files, such as images, just return a suitable mime type.

        if (locator.endsWith(".js")) {
            return "text/javascript";
        }
    },
    out(string) {
        send_status("out", string);
    },
    err(string) {
        send_status("err", string);
    }
});

// The REPLs need to read to Replete's source files. They are situated in the
// same directory as this file.

const path_to_replete = path.dirname(process.argv[1]);

// A separate REPL is created for each platform. No context is shared between
// them.

const node_repl = make_node_repl(capabilities, path_to_replete, 7375);
const deno_repl = make_deno_repl(capabilities, path_to_replete, 7376);
const browser_repl = make_browser_repl(capabilities, path_to_replete, 35897);

function on_command(command) {

// The 'on_command' function relays a 'command' message to the relevant REPL.
// The REPL's response is relayed as a status message.

    const repls = {
        browser: browser_repl,
        node: node_repl,
        deno: deno_repl
    };
    return repls[command.platform].send(command).then(
        function (evaluations) {

// The reply is an array of evaluated values, produced in parallel. Each
// evaluation is written to STDOUT.

            return evaluations.forEach(function (evaluation) {
                send_status("evaluation", evaluation);
            });
        },
        function (reason) {
            if (typeof reason !== "string") {
                reason = util.inspect(reason);
            }
            send_status("exception", reason);
        }
    );
}

// Start the REPLs.

node_repl.start().catch(console.error);
deno_repl.start().catch(console.error);
browser_repl.start().catch(console.error);

// Begin reading command messages from STDIN, line by line.

readline.createInterface({input: process.stdin}).on(
    "line",
    function on_line(line) {
        return on_command(JSON.parse(line));
    }
);
