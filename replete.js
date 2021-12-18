/*jslint node */

// This is an example of a REPL built using Replete. It is a very minimal
// configuration, and may be considered a starting point for building more
// interesting REPLs. To start it, run

//      $ node --experimental-import-meta-resolve /path/to/replete.js

// from a directory which contains your source code.

// From STDIN, the process reads a line at a time. Each line is expected to be a
// JSON-encoded "message" object, with the following properties:

//      source
//          The JavaScript source code to be evaluated, as a string.

//      locator
//          The locator string of the module being evaluated. This is required
//          if the source contains any import statements, but optional
//          otherwise.

//      platform
//          Either "browser", "node" or "deno". This property determines which
//          REPL will evaluate the source.

// The process writes free-form text to STDOUT. This includes textual
// representations of evaluated values, as well as values logged with
// 'console.log'. Each time an exception is encountered, a textual
// representation is written to STDERR.

//          +------------------------------------------+
//          |                                          |
//          |               Text editor                |
//          |                                          |
//          |  +---------------+    +---------------+  |
//          |  |               |    |               |  |
//          |  |  File editor  |    |  REPL output  |  |
//          |  |    window     |    |    window     |  |
//          |  |               |    |               |  |
//          |  +-------------+-+    +-^-------------+  |
//          |                |        |                |
//          +----------------+--------+----------------+
//                           |        |
//                           |        |
//             JSON messages |        | Text via STDOUT
//               via STDIN   |        |   and STDERR
//                           |        |
//                           |        |
//       +-------------------v--------+--------------------+
//       |                                                 |
//       |                 Node.js process                 |
//       |                   (replete.js)                  |
//       |                                                 |
//       | +--------------+ +--------------+ +-----------+ |
//       | | Browser REPL | | Node.js REPL | | Deno REPL | |
//       | +--------------+ +--------------+ +-----------+ |
//       |                                                 |
//       +-------------------------------------------------+

// Here are some examples of messages and their corresponding output.

//      > {"platform":"browser", "source":"navigator.vendor"}
//      Google Inc.

//      > {"platform":"node", "source":"process.version"}
//      v14.4.0

//      > {"platform":"browser", "source":"process.cwd()"}
//      ReferenceError: process is not defined ...

//      > {"source":"console.log(0 / 0, 1 / 0)"}
//      NaN Infinity
//      undefined

import path from "path";
import fs from "fs";
import readline from "readline";
import make_node_repl from "./node_repl.js";
import make_deno_repl from "./deno_repl.js";
import make_browser_repl from "./browser_repl.js";

const root_directory = process.cwd();

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
// refuse to read any files which are hidden or not beneath the root directory.

        if (
            locator.startsWith(".") ||
            !locator.startsWith(root_directory + "/")
        ) {
            return Promise.reject(new Error("Forbidden: " + locator));
        }
        return fs.promises.readFile(locator);
    },
    mime(locator) {

// By default, only JavaScript files are served to the browser. If you wish to
// serve other types of files, such as images, just return a suitable mime
// type.

        if (locator.endsWith(".js")) {
            return "text/javascript";
        }
        throw new Error("Unknown extension: " + locator);
    },
    log(string) {
        process.stdout.write(string);
    },
    err(string) {
        process.stderr.write(string);
    }
});

// The REPLs requires access to Replete's source files. They are situated within
// a directory adjacent to this script file.

const path_to_replete = path.dirname(process.argv[1]);

// A separate REPL is created for each platform. No context is shared between
// them.

const node_repl = make_node_repl(capabilities, path_to_replete, 7375);
const deno_repl = make_deno_repl(capabilities, path_to_replete, 7376);
const browser_repl = make_browser_repl(capabilities, path_to_replete, 35897);

function on_message(message) {

// The 'on_message' function sends the 'message' to the relevant REPL, and
// prints the result to stdout or stderr.

    const repls = {
        browser: browser_repl,
        node: node_repl,
        deno: deno_repl
    };
    return repls[message.platform].send(message).then(
        function (value) {
            return (
                Array.isArray(value)

// The value is an array containing wun or more evaluations. Log each of them
// separately.

                ? value.forEach((value) => console.log(value))

// The value is a module object.

                : console.log(value)
            );
        },
        console.error
    );
}

// Start the REPLs.

node_repl.start().catch(console.error);
deno_repl.start().catch(console.error);
browser_repl.start().catch(console.error);

// Begin reading messages from STDIN, line by line.

readline.createInterface({input: process.stdin}).on(
    "line",
    function on_line(line) {
        return on_message(JSON.parse(line));
    }
);
