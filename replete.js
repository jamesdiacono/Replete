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
//          Either "browser" or "node". This property determines which REPL will
//          evaluate the source. If undefined, the Node REPL is used.

// The message object may contain additional properties.

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
//          +----------------v--------+----------------+
//          |                                          |
//          |              Node.js process             |
//          |                (replete.js)              |
//          |                                          |
//          | +-------------------+ +----------------+ |
//          | |                   | |                | |
//          | |  browser_repl.js  | |  node_repl.js  | |
//          | |                   | |                | |
//          | +-------------------+ +----------------+ |
//          |                                          |
//          +------------------------------------------+

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
import browser_repl_constructor from "./browser_repl.js";
import node_repl_constructor from "./node_repl.js";

const root_directory = process.cwd();

// These are the capabilities given to each platform's REPL. They offer much
// opportunity for customisation.

const capabilities = Object.freeze({
    locate(specifier, parent_locator) {

// The simplest possible locator format is the absolute path of a file on disk.
// It must be turned into a URL for use with import.meta.resolve.

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

// Read the contents of a file as a Buffer. So that we do not inadvertently
// expose our entire filesystem to the network, we refuse to read any files
// which are hidden or not beneath the root directory.

        if (
            locator.startsWith(".") ||
            !locator.startsWith(root_directory + "/")
        ) {
            return Promise.reject(new Error("Forbidden: " + locator));
        }
        return fs.promises.readFile(locator);
    },
    transform(message) {
        return Promise.resolve(message.source);
    },
    transform_file(buffer, locator) {
        return Promise.resolve(buffer);
    },
    import(locator) {
        return import(locator);
    },
    mime(locator) {

// By default, only JavaScript files are served to the browser. If you wish to
// server other types of files, such as images, just return a suitable mime
// type.

        if (locator.endsWith(".js")) {
            return "text/javascript";
        }
        throw new Error("Unknown extension: " + locator);
    },
    on_log: console.log,
    on_exception: console.error
});

// A separate REPL is run for each platform. No context is shared between them.

const node_repl = node_repl_constructor(capabilities);
const browser_repl = browser_repl_constructor(
    capabilities,

// The browser REPL requires access to the WEBL source files. They are situated
// within a directory adjacent to this script file.

    path.join(path.dirname(process.argv[1]), "webl"),

// By specifying a static port number for the WEBL server, running clients are
// not orphaned when this process is restarted.

    35897
);

function on_message(message) {

// The 'on_message' function sends the 'message' to the relevant REPL, and
// prints the result to stdout or stderr.

    return (
        message.platform === "browser"
        ? browser_repl.send(message)
        : node_repl.send(message)
    ).then(
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

// Start the browser REPL. Note that the Node.js REPL does not require
// initialisation.

browser_repl.start().catch(console.error);

// Begin reading from STDIN, line by line.

readline.createInterface({input: process.stdin}).on(
    "line",
    function on_line(line) {
        return on_message(JSON.parse(line));
    }
);
