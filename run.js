// The 'run' function starts a Replete instance, attaching it to the current
// process's stdin and stdout. It can only be called once per process. It
// handles termination signals gracefully. It takes a 'spec' object described
// in ./README.md and returns an 'exit' function that safely stops Replete and
// exits the process.

// Messages are sent in both directions, each occupying a single line. A message
// is a JSON-encoded object. Command messages are read from stdin, and result
// messages are written to stdout. This is the standard interface that text
// editor plugins are expected to adhere to.

// For example,

//      STDIN   {"platform": "browser", "source": "navigator.vendor"}
//      STDOUT  {"evaluation": "Google Inc."}

// See ./make.js for a description of the message protocol.

// Here is an example program, custom_replete.js, that serves the WEBL on port
// 3000, gives the Deno REPL full permissions, and serves CSS files in addition
// to JavaScript files.

//      import run from "https://deno.land/x/replete/run.js";
//      run({
//          browser_port: 3000,
//          deno_args: ["--allow-all"],
//          mime(locator) {
//              if (locator.endsWith(".js")) {
//                  return "text/javascript";
//              }
//              if (locator.endsWith(".css")) {
//                  return "text/css";
//              }
//          }
//      });

// It could be run from the command line like

//      $ deno run \
//          --allow-all \
//          --importmap https://deno.land/x/replete/import_map.json \
//          custom_replete.js

/*jslint node, deno */

import os from "node:os";
import process from "node:process";
import readline from "node:readline";
import url from "node:url";
import make_replete from "./make.js";

function run(spec) {

    function on_result(message) {
        process.stdout.write(JSON.stringify(message) + "\n");
    }

    spec = Object.assign({}, spec);
    spec.on_result = on_result;
    spec.root_locator = (
        spec.root_locator
        ?? url.pathToFileURL(process.cwd()).href
    );
    if (typeof Deno === "object") {
        spec.which_deno = spec.which_deno ?? Deno.execPath();
    } else {
        spec.which_node = spec.which_node ?? process.argv[0];
    }
    spec.node_env = spec.node_env ?? process.env;
    spec.deno_env = spec.deno_env ?? process.env;
    const line_reader = readline.createInterface({input: process.stdin});
    const {start, send, stop} = make_replete(spec);

    function exit() {
        line_reader.close();
        stop().then(function () {
            process.exit();
        });
    }

    function on_error(error) {
        on_result({
            err: (error.stack ?? error) + "\n"
        });
    }

    start().then(function () {
        line_reader.on("line", function (line) {
            send(JSON.parse(line)).catch(on_error);
        });
    }).catch(
        on_error
    );
    process.on("SIGTERM", exit);
    process.on("SIGINT", exit);
    if (os.platform() !== "win32") {
        process.on("SIGHUP", exit);
    }
    return exit;
}

export default Object.freeze(run);
