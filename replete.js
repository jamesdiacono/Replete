// This is the standard Replete program.

// It exposes a command line interface facilitating basic configuration. If you
// need more control over Replete, use ./run.js directly.

// This program can be run from the command line in either Node.js or Deno. Even
// if it is run it in Node.js, a Deno REPL can still be used (and vice versa).

// To start Replete in Node.js v18.6.0+, run

//      $ node /path/to/replete.js [options]

// To start Replete in Deno v1.35.3+, run

//      $ deno run --allow-all /path/to/replete.js [options]

// or, skipping installation entirely,

//      $ deno run \
//          --allow-all \
//          --importmap https://deno.land/x/replete/import_map.json \
//          https://deno.land/x/replete/replete.js \
//          [options]

// The following options are supported:

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
//          Like the --node_debugger_port option, but for Deno. Both runtimes
//          use the V8 Inspector Protocol.

// The process communicates via its stdin and stdout. See ./run.js for a
// description of the stream protocol.

// The REPLs will not be able to read files outside the current working
// directory.

/*jslint node, deno */

import process from "node:process";
import run from "./run.js";

let spec = {
    node_args: [],

// The Deno REPL is run with unlimited permissions. This seems justified for
// development, where it is not known in advance what the REPL may be asked to
// do.

    deno_args: ["--allow-all"]
};

// Parse the command line arguments into a spec object.

process.argv.slice(2).forEach(function (argument) {
    const [ignore, name, value] = argument.match(/^--(\w+)=(.*)$/);
    spec[name] = (
        name.endsWith("_port")
        ? parseInt(value)
        : value
    );
});
if (Number.isSafeInteger(spec.node_debugger_port)) {
    spec.node_args.push("--inspect=" + spec.node_debugger_port);
    delete spec.node_debugger_port;
}
if (Number.isSafeInteger(spec.deno_debugger_port)) {
    spec.deno_args.push("--inspect=127.0.0.1:" + spec.deno_debugger_port);
    delete spec.deno_debugger_port;
}

run(spec);
