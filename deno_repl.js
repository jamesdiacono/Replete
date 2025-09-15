// This REPL evaluates JavaScript in a Deno process.

// If you provide environment variables via 'env', don't forget to include
// "--allow-env" in the 'args' array.

/*jslint node */

import make_cmdl_repl from "./cmdl_repl.js";
const padawan_url = new URL("./deno_padawan.js", import.meta.url);

function allow_host(run_args, host, permission) {

// Deno only permits the --allow-net argument to appear once in its list of run
// arguments. This means we need to jump thru hoops to avoid any duplication.

    if (run_args.includes("--allow-all") || run_args.includes(permission)) {

// All hosts are already allowed.

        return run_args;
    }

// If the specific form of --allow-net is present, we append 'host' onto its
// list of hosts.

    run_args = run_args.map(function (arg) {
        return (
            arg.startsWith(permission + "=")
            ? arg + "," + host
            : arg
        );
    });

// Otherwise we add the --allow-net.

    return (
        !run_args.some((arg) => arg.startsWith(permission + "="))
        ? run_args.concat(permission + "=" + host)
        : run_args
    );
}

function make_deno_repl(capabilities, which, args = [], env = {}) {
    if (padawan_url.protocol !== "file:") {
        args = allow_host(args, padawan_url.host, "--allow-import");
    }
    return make_cmdl_repl(
        capabilities,
        function make_command(tcp_host, http_host) {
            let run_args = args;
            run_args = allow_host(run_args, tcp_host, "--allow-net");
            run_args = allow_host(run_args, http_host, "--allow-import");
            return Promise.resolve([
                which,
                "run",
                ...run_args,
                padawan_url.href,
                tcp_host
            ]);
        },
        Object.assign({NO_COLOR: "1"}, env)
    );
}

export default Object.freeze(make_deno_repl);
