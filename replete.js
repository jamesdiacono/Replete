// This is the standard Replete program.

// It exposes a command line interface facilitating basic configuration. If you
// need more control over Replete, use ./run.js directly.

// This program can be run from the command line using any runtime that
// implements the Node.js built-in modules, such as "node:fs". The choice of
// runtime used to run Replete does not affect which REPLs are available,
// because each REPL is run as a separate process.

// To start Replete in Node.js v19.0.0+, run

//      $ node /path/to/replete.js [options]

// To start Replete in Deno v1.35.3+, run

//      $ deno run --allow-all /path/to/replete.js [options]

// or, skipping installation entirely,

//      $ deno run \
//          --allow-all \
//          --importmap https://deno.land/x/replete/import_map.json \
//          https://deno.land/x/replete/replete.js \
//          [options]

// To start Replete in Bun v1.1.0+, run

//      $ bun run /path/to/replete.js [options]

// The following options are supported:

//      --content_type=<ext>:<type>
//          See README.md.

//      --browser_port=<port>
//          See README.md.

//      --browser_hostname=<hostname>
//          See README.md.

//      --which_node=<path>
//          See README.md.

//      --node_debugger_port=<port>
//          A Node.js debugger will attempt to listen on the specified port.
//          This makes it possible to monitor your evaluations using a fully
//          featured debugger. To attach a debugger, open Google Chrome and
//          navigate to chrome://inspect.

//      --which_deno=<path>
//          See README.md.

//      --deno_debugger_port=<port>
//          Like the --node_debugger_port option, but for Deno. Exposes the V8
//          Inspector Protocol.

//      --which_bun=<path>
//          See README.md.

//      --bun_debugger_port=<port>
//          Like the --node_debugger_port option, but for Bun. Exposes the
//          WebKit Inspector Protocol.

//      --which_tjs=<path>
//          See README.md.

// The process communicates via its stdin and stdout. See ./run.js for a
// description of the stream protocol.

// The REPLs will not be able to read files outside the current working
// directory.

/*jslint node */

import process from "node:process";
import run from "./run.js";

let content_type_object = Object.create(null);
let options = {
    node_args: [],

// The Deno REPL is run with unlimited permissions. This seems justified for
// development, where it is not known in advance what the REPL may be asked to
// do.

    deno_args: ["--allow-all", "--no-lock"],
    bun_args: []
};

// Parse the command line arguments into an options object.

process.argv.slice(2).forEach(function (argument) {
    const [_, name, value] = argument.match(/^--(\w+)=(.*)$/);
    if (name === "content_type") {
        const [file_extension, type] = value.split(":");
        content_type_object[file_extension] = type;
    } else {
        options[name] = (
            name.endsWith("_port")
            ? parseInt(value)
            : value
        );
    }
});
if (Number.isSafeInteger(options.node_debugger_port)) {
    options.node_args.push("--inspect=" + options.node_debugger_port);
    delete options.node_debugger_port;
}
if (Number.isSafeInteger(options.deno_debugger_port)) {
    options.deno_args.push("--inspect=127.0.0.1:" + options.deno_debugger_port);
    delete options.deno_debugger_port;
}
if (Number.isSafeInteger(options.bun_debugger_port)) {
    options.bun_args.push("--inspect=" + options.bun_debugger_port);
    delete options.bun_debugger_port;
}
if (Object.keys(content_type_object).length > 0) {
    options.headers = function (locator) {
        const file_extension = locator.split(".").pop().toLowerCase();
        const content_type = content_type_object[file_extension];
        if (content_type !== undefined) {
            return {"Content-Type": content_type};
        }
    };
}

run(options);
