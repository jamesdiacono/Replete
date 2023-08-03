// A Deno CMDL controls a single Deno padawan. It provides an interface for
// evaluating JavaScript source code within a padawan. Note that source code is
// evaluated in sloppy mode.

/*jslint node */

import child_process from "node:child_process";
import make_cmdl from "./cmdl.js";
const padawan_url = new URL("./deno_padawan.js", import.meta.url);

function allow_host(run_args, host) {

// Deno only permits the --allow-net argument to appear once in its list of run
// arguments. This means we need to jump thru hoops to avoid any duplication.

    if (run_args.includes("--allow-net")) {

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

function make_deno_cmdl(

// The 'on_stdout' and 'on_stderr' parameters are functions, called with a
// Buffer whenever data is written to STDOUT or STDERR.

    on_stdout,
    on_stderr,

// The 'which_deno' parameter is the command used to run Deno.

    which_deno,

// The 'run_args' parameter is an array containing arguments to be passed to
// Deno's "run" subcommand, before the script arg.

    run_args = [],

// The 'env' parameter is an object containing environment variables to make
// available to the process. Don't forget to specify --allow-env in the
// 'run_args'.

    env = {}
) {
    return make_cmdl(function spawn_deno_process(tcp_port) {
        const subprocess = child_process.spawn(
            which_deno,
            [
                "run",
                ...allow_host(run_args, "127.0.0.1:" + tcp_port),
                padawan_url.href,
                String(tcp_port)
            ],
            {env}
        );
        subprocess.stdout.on("data", on_stdout);
        subprocess.stderr.on("data", on_stderr);
        return Promise.resolve(subprocess);
    });
}

export default Object.freeze(make_deno_cmdl);
