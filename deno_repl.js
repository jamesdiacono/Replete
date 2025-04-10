// This REPL evaluates JavaScript in a Deno process.

// If you provide environment variables via 'env', don't forget to include
// "--allow-env" in the 'args' array.

/*jslint node */

import make_cmdl_repl from "./cmdl_repl.js";
const padawan_url = new URL("./deno_padawan.js", import.meta.url);

function allow_host(run_args, host) {

// Deno only permits the --allow-net argument to appear once in its list of run
// arguments. This means we need to jump thru hoops to avoid any duplication.

    if (run_args.includes("--allow-all") || run_args.includes("--allow-net")) {

// All hosts are already allowed.

        return run_args;
    }

// If the specific form of --allow-net is present, we append 'host' onto its
// list of hosts.

    run_args = run_args.map(function (arg) {
        return (
            arg.startsWith("--allow-net=")
            ? arg + "," + host
            : arg
        );
    });

// Otherwise we add the --allow-net.

    return (
        !run_args.some((arg) => arg.startsWith("--allow-net="))
        ? run_args.concat("--allow-net=" + host)
        : run_args
    );
}

function make_deno_repl(capabilities, which, args = [], env = {}) {
    return make_cmdl_repl(
        capabilities,
        function make_command(tcp_host) {
            return Promise.resolve([
                which,
                "run",
                ...allow_host(args, tcp_host),
                padawan_url.href,
                tcp_host
            ]);
        },
        Object.assign({NO_COLOR: "1"}, env)
    );
}

export default Object.freeze(make_deno_repl);
