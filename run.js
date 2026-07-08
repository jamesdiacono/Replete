// The 'run' function starts a Replete instance, attaching it to the current
// process's stdin and stdout. It can only be called once per process. It
// handles termination signals gracefully. It takes an 'options' object
// described in ./README.md and returns an 'exit' function that safely stops
// Replete and exits the process.

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
//          deno_args: ["--allow-all", "--no-lock"],
//          headers(locator) {
//              if (locator.endsWith(".js")) {
//                  return {"Content-Type": "text/javascript"};
//              }
//              if (locator.endsWith(".css")) {
//                  return {"Content-Type": "text/css"};
//              }
//          }
//      });

// It could be run from the command line like

//      $ deno run \
//          --allow-all \
//          --importmap https://deno.land/x/replete/import_map.json \
//          custom_replete.js

/*jslint node, deno, bun */

import os from "node:os";
import process from "node:process";
import readline from "node:readline";
import url from "node:url";
import make_replete from "./make.js";

function run(options) {

    function on_result(message) {
        process.stdout.write(JSON.stringify(message) + "\n");
    }

    options = Object.assign({}, options);
    options.on_result = on_result;
    if (options.root_locator === undefined) {
        const cwd_href = url.pathToFileURL(process.cwd()).href;
        options.root_locator = (
            cwd_href.endsWith("/")
            ? cwd_href
            : cwd_href + "/"
        );
    }
    if (typeof Deno === "object") {
        if (options.which_deno === undefined) {
            options.which_deno = Deno.execPath();
        }
    } else if (typeof Bun === "object") {
        if (options.which_bun === undefined) {
            options.which_bun = process.argv[0];
        }
    } else {
        if (options.which_node === undefined) {
            options.which_node = process.argv[0];
        }
    }
    if (options.which_node === "") {
        delete options.which_node;
    }
    if (options.which_deno === "") {
        delete options.which_deno;
    }
    if (options.which_bun === "") {
        delete options.which_bun;
    }
    if (options.node_env === undefined) {
        options.node_env = process.env;
    }
    if (options.deno_env === undefined) {
        options.deno_env = process.env;
    }
    if (options.bun_env === undefined) {
        options.bun_env = process.env;
    }
    if (options.tjs_env === undefined) {
        options.tjs_env = process.env;
    }
    const {start, send, stop} = make_replete(options);

    function exit() {
        stop().then(function () {
            process.exit();
        });
    }

    start().then(function () {
        const line_reader = readline.createInterface({input: process.stdin});

// The closure of stdin is a reliable way to detect unclean termination of the
// parent process, for example via SIGKILL, allowing us to avoid zombification.

        line_reader.on("close", exit);
        line_reader.on("line", function (line) {
            if (line.trim() === "") {
                return;
            }
            let message;
            try {
                message = JSON.parse(line);
            } catch (exception) {
                return on_result({err: exception.stack + "\n"});
            }
            send(message).catch(function (error) {
                on_result({
                    exception: error.stack,
                    id: message.id
                });
            });
        });
    }).catch(function (error) {
        on_result({err: error.stack + "\n"});
    });
    process.on("SIGTERM", exit);
    process.on("SIGINT", exit);
    if (os.platform() !== "win32") {
        process.on("SIGHUP", exit);
    }
    return exit;
}

export default Object.freeze(run);
