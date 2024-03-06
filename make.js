// This module exports a function that makes a Replete instance. A Replete
// instance can be used to evaluate code in the browser, Node.js and Deno.

/*jslint node, deno */

import fs from "node:fs";
import node_resolve from "./node_resolve.js";
import make_node_repl from "./node_repl.js";
import make_deno_repl from "./deno_repl.js";
import make_browser_repl from "./browser_repl.js";

function make_replete({

// Required parameters.

    on_result,
    root_locator,

// Browser REPL configuration.

    browser_port,
    browser_hostname,

// Node.js REPL configuration.

    which_node,
    node_args,
    node_env,

// Deno REPL configuration.

    which_deno,
    deno_args,
    deno_env,

// These are the capabilities given to the REPLs. See README.md for an
// explanation of each.

// 'source' has been superseded by 'message', but is included for backward
// compatibility.

    source = function default_source(command) {
        return Promise.resolve(command.source);
    },
    message = function default_message(command) {
        return source(command).then(function (string) {
            command.source = string;
            return command;
        });
    },
    read = function default_read(locator) {
        return fs.promises.readFile(new URL(locator));
    },
    mime = function default_mime(locator) {

// By default, only JavaScript files are served to the REPLs. If you wish to
// serve other types of files, such as images, just return a suitable mime type.

        if (locator.endsWith(".js") || locator.endsWith(".mjs")) {
            return "text/javascript";
        }
    },
    locate = function default_locate(specifier, parent_locator) {

// Fully qualified specifiers, such as HTTP URLs or absolute paths, are left for
// the runtime to resolve.

        if (/^\w+:/.test(specifier)) {
            return Promise.resolve(specifier);
        }

// Relative paths are simply adjoined to the parent module's locator.

        if (specifier.startsWith(".") || specifier.startsWith("/")) {
            return Promise.resolve(new URL(specifier, parent_locator).href);
        }

// Any other specifier is assumed to designate a file in some "node_modules"
// directory reachable by the parent module.

// Deno does not expose its machinery for searching "node_modules".
// Node.js does, via 'import.meta.resolve', but in Node.js v20 this function
// became synchronous and thus a performance hazard.

// So, we do it the hard way.

        return node_resolve(specifier, parent_locator);
    },
    watch = function default_watch(locator) {
        return new Promise(function (resolve, reject) {
            const watcher = fs.watch(new URL(locator), resolve);
            watcher.on("error", reject);
            watcher.on("change", watcher.close);
        });
    },
    out = function default_out(string) {
        on_result({out: string});
    },
    err = function default_err(string) {
        on_result({err: string});
    }
}) {

    function safe_read(locator) {

// To avoid inadvertently exposing sensitive files to the network, we refuse to
// read any files outside the 'root_locator'.

        const locator_url = new URL(locator);

// Ensure a trailing slash.

        if (!locator_url.href.startsWith(root_locator.replace(/\/?$/, "/"))) {
            return Promise.reject(new Error("Forbidden: " + locator));
        }
        return read(locator);
    }

// Configurate a REPL for each platform.

    const capabilities = Object.freeze({
        source,
        message,
        locate,
        read: safe_read,
        watch,
        mime,
        out,
        err
    });
    const repls = Object.create(null);
    repls.browser = make_browser_repl(
        capabilities,
        browser_port,
        browser_hostname
    );
    if (which_node !== undefined) {
        repls.node = make_node_repl(
            capabilities,
            which_node,
            node_args,
            node_env
        );
    }
    if (which_deno !== undefined) {
        repls.deno = make_deno_repl(
            capabilities,
            which_deno,
            deno_args,
            deno_env
        );
    }

    function start() {
        return Promise.all(Object.values(repls).map(function (repl) {
            return repl.start();
        }));
    }

    function stop() {
        return Promise.all(Object.values(repls).map(function (repl) {
            return repl.stop();
        }));
    }

    function send(command) {

// Relay the incoming 'command' message to the relevant REPL. The REPL's
// responses are relayed back as result messages.

        const repl = repls[command.platform];
        if (repl === undefined) {
            return Promise.reject(new Error(
                "Platform unavailable: " + command.platform
            ));
        }
        return repl.send(command, function (evaluation, exception) {

// The browser REPL may yield multiple results for each command, when multiple
// tabs are connected. Only one of 'evaluation' and 'exception' is a string,
// the other is undefined.

            on_result({
                evaluation,
                exception,
                id: command.id
            });
        });
    }

    return Object.freeze({start, send, stop});
}

export default Object.freeze(make_replete);
