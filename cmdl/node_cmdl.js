// A Node.js CMDL controls a single Node.js padawan, imbued with the ability to
// import modules over HTTP. It provides an interface for evaluating JavaScript
// source code within a padawan. Note that source code is evaluated in sloppy
// mode.

/*jslint node */

import child_process from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import make_cmdl from "./cmdl.js";
const loader_url = new URL("./node_loader.js", import.meta.url);
const padawan_url = new URL("./node_padawan.js", import.meta.url);

function download_file(remote_url, file_path) {
    return fetch(remote_url).then(function (response) {
        if (!response.ok) {
            throw new Error("Failed to download '" + remote_url.href + "'.");
        }
        return response.arrayBuffer();
    }).then(function (array_buffer) {
        return fs.promises.writeFile(file_path, new Uint8Array(array_buffer));
    });
}

function fileify(module_url) {

// The 'fileify' function caches a remote module as a local file. It is
// necessary because Node.js is not able to import modules via HTTP (unless run
// with a loader).

// Beware! The file is cached for an indefinite period of time, so the remote
// URL should contain any relevant versioning information.

// If the URL is already a file URL, we are done.

    if (module_url.protocol === "file:") {
        return Promise.resolve(module_url);
    }

// Construct a temporary path, based on the URL. Force Node.js to interpret the
// source as a module.

    const hash = crypto.createHash("md5").update(module_url.href).digest("hex");
    const file_path = path.join(
        os.tmpdir(),
        path.basename(module_url.pathname).replace(
            /\.js$/,
            "." + hash.slice(0, 8) + ".mjs"
        )
    );

// Check if the temporary file already exists. If not, fetch it from the
// network. If all goes well, produce the temporary file's URL.

    return fs.promises.stat(file_path).catch(function (ignore) {
        return download_file(module_url, file_path);
    }).then(function () {
        return url.pathToFileURL(file_path);
    });
}

function make_node_cmdl(

// The 'on_stdout' and 'on_stderr' parameters are functions, called with a
// Buffer whenever data is written to STDOUT or STDERR.

    on_stdout,
    on_stderr,

// The 'which_node' parameter is the command used to run Node.js.

    which_node,

// The 'node_args' parameter is an array containing arguments to be passed to
// node, before the script arg.

    node_args = [],

// The 'env' parameter is an object containing environment variables to make
// available to the process.

    env = {}
) {
    return make_cmdl(function spawn_node_process(tcp_port) {
        return Promise.all([
            fileify(loader_url),
            fileify(padawan_url)
        ]).then(function ([
            loader_file_url,
            padawan_file_url
        ]) {
            const subprocess = child_process.spawn(
                which_node,
                node_args.concat(

// Imbue the padawan process with the ability to import modules over HTTP. The
// loader specifier must be a fully qualified URL on Windows.

                    "--experimental-loader",
                    loader_file_url.href,

// Suppress the "experimental feature" warnings. We know we are experimenting!

                    "--no-warnings",

// The program entry point must be specified as a path.

                    url.fileURLToPath(padawan_file_url),
                    String(tcp_port)
                ),
                {env}
            );
            subprocess.stdout.on("data", on_stdout);
            subprocess.stderr.on("data", on_stderr);
            return subprocess;
        });
    });
}

export default Object.freeze(make_node_cmdl);
