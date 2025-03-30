// A WEBL is master to many padawans. A padawan is an isolated execution context
// with its own global object. It can be asked to evaluate arbitrary JavaScript
// source code, and it reports any logging or exceptions.

// The "iframe", "popup" and "worker" padawans are sandboxed such that they can
// not interfere with their master or other padawans.

// The "top" padawan executes code in the context of the current page, so is not
// sandboxed at all. Only a single "top" padawan can exist at one time.

/*jslint browser, global */

import webl_inspect from "./webl_inspect.js";

function reason(exception) {

// A self-contained function that formats an exception as a human-readable
// string.

    try {
        if (exception && exception.stack) {
            return (
                navigator.vendor === "Google Inc."

// Weirdly, the V8 JavaScript engine includes the name and message in the stack,
// so they are not included here.

                ? exception.stack
                : (
                    exception.name + ": " + exception.message
                    + "\n" + exception.stack
                )
            );
        }
        return "Exception: " + String(exception);
    } catch (_) {
        return "Exception";
    }
}

function fill(template, substitutions) {

// The 'fill' function prepares a script template for execution. As an example,
// all instances of <the_force> found in the 'template' will be replaced with
// 'substitutions.the_force'. The extra level of indentation we add to our
// templates is removed also.

    return template.replace(/<([^<>]*)>/g, function (original, filling) {
        return substitutions[filling] ?? original;
    }).replace(/^\u0020{4}/gm, "");
}

// The creation script is the first thing evaluated by a padawan. It adds
// listeners for messages and other events.

const padawan_create_script_template = `

// The '$webl' object contains a couple of functions used internally by the
// padawan to communicate with its master.

// Which global object handles postage depends on the type of the padawan. If
// the padawan is a popup, we grab a reference to its opener before that
// property is deleted.

    const global = (
        globalThis.opener       // popup
        ?? globalThis.parent    // iframe or top
        ?? globalThis           // worker
    );
    globalThis.$webl = Object.freeze({
        send(message) {

// Authenticate the message.

            message.secret = <secret>;

// For iframe padawans, we specify the wildcard "*" as the target origin,
// because the iframe may not share an origin with its master.

            return (
                global.parent !== undefined
                ? global.postMessage(message, "*")

// The 'postMessage' function of a window has a different signature to that of a
// worker, which does not accept a targetOrigin parameter.

                : global.postMessage(message)
            );
        },
        inspect: ${webl_inspect.toString()},
        reason: ${reason.toString()}
    });

// The 'console.log' function is commonly used in the browser as the equivalent
// of printing to stdout. Here we apply a wiretap, sending its arguments to the
// master.

    const original = console.log;
    globalThis.console.log = function (...args) {
        $webl.send({
            name: "log",
            padawan: "<name>",
            values: args.map(function (value) {
                return (

// If the value happens to be a string, it is passed through unchanged. This
// improves the readability of strings spanning multiple lines.

                    typeof value === "string"
                    ? value
                    : $webl.inspect(value)
                );
            })
        });
        return original(...args);
    };

// Inform the master of any uncaught exceptions.

    globalThis.onunhandledrejection = function (event) {
        return $webl.send({
            name: "exception",
            padawan: "<name>",
            reason: $webl.reason(event.reason)
        });
    };
    globalThis.onerror = function (...args) {

// Sometimes the error argument is null, for example the "ResizeObserver loop
// completed with undelivered notifications." error. In such cases, fall back to
// the message string.

        return globalThis.onunhandledrejection({reason: args[4] ?? args[0]});
    };

// Padawans receive only one kind of message, containing the fulfillment of the
// 'padawan_eval_script_template'. We use an indirect eval to avoid exposing our
// local variables.

    globalThis.onmessage = function (event) {
        return globalThis.eval(event.data);
    };

// Finally, inform the master that the padawan is ready for instruction.

    $webl.send({
        name: "ready",
        padawan: "<name>"
    });
`;

// An "eval script" is sent to the padawan for evaluation. Upon evaluation, it
// resolves some importations and then evaluates a payload script, informing
// the master of the result. The importations are added to the global scope,
// making them accessible to the payload script as it is indirectly evaluated.

// The payload script is encoded as a JSON string because this is an easy way to
// escape newlines.

// The script is evaluated in sloppy mode. Strict mode can be activated by
// prepending the payload script with "use strict";

const padawan_eval_script_template = `
    Promise.all([
        <import_expressions>
    ]).then(function ($imports) {
        globalThis.$imports = $imports;
        const value = globalThis.eval(<payload_script_json>);
        return (
            <wait>
            ? Promise.resolve(value).then($webl.inspect)
            : $webl.inspect(value)
        );
    }).then(function (evaluation) {
        return $webl.send({
            name: "evaluation",
            eval_id: "<eval_id>",
            value: {evaluation}
        });
    }).catch(function (exception) {
        return $webl.send({
            name: "evaluation",
            eval_id: "<eval_id>",
            value: {
                exception: $webl.reason(exception)
            }
        });
    });
`;

let top;

function make_top_padawan(
    name,
    secret,
    on_message
) {
    if (top !== undefined) {
        top.destroy();
    }
    addEventListener("message", on_message);
    const script_element = document.createElement("script");
    script_element.textContent = fill(
        padawan_create_script_template,
        {name, secret}
    );
    document.head.append(script_element);
    top = Object.freeze({
        send(message) {
            postMessage(message);
        },
        destroy() {
            removeEventListener("message", on_message);
            script_element.remove();
        }
    });
    return top;
}

function make_iframe_padawan(
    name,
    secret,
    on_message,
    iframe,
    style_object,

// Omitting the "allow-same-origin" permission places the iframe in a different
// origin from that of its master. This means that communication is only
// possible via the global 'postMessage' function.

    sandbox = "allow-scripts"
) {
    addEventListener("message", on_message);
    if (iframe === undefined) {
        iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        if (style_object === undefined) {
            style_object = {display: "none"};
        }
    }
    Object.assign(iframe.style, style_object);
    if (sandbox !== false) {
        iframe.sandbox = sandbox;
    }
    iframe.srcdoc = (
        "<!DOCTYPE html>"
        + "\n<script>\n"
        + fill(padawan_create_script_template, {name, secret})
        + "\n</script>"
    );
    return Object.freeze({
        send(message) {
            iframe.contentWindow.postMessage(message, "*");
        },
        destroy() {
            iframe.remove();
            removeEventListener("message", on_message);
        }
    });
}

function make_popup_padawan(
    name,
    secret,
    on_message,
    window_features
) {
    addEventListener("message", on_message);
    const padawan_window = globalThis.open(
        undefined,
        String(name),
        window_features
    );
    padawan_window.document.title = name;

// The padawan requires a reference to its master's window object to establish a
// communication channel. Disturbingly, the master and padawan share an origin,
// so this reference gives the padawan unlimited power over its master. We
// revoke this power immediately after creation - it would be unwise to lower
// our defenses!

    padawan_window.eval(fill(padawan_create_script_template, {name, secret}));
    delete padawan_window.opener;
    return Object.freeze({
        send(message) {
            padawan_window.postMessage(message, "*");
        },
        destroy() {
            padawan_window.close();
            removeEventListener("message", on_message);
        }
    });
}

function make_worker_padawan(name, secret, on_message) {
    const worker_src = URL.createObjectURL(
        new Blob(
            [fill(padawan_create_script_template, {name, secret})],
            {type: "text/javascript"}
        )
    );
    const worker = new Worker(worker_src);
    worker.onmessage = on_message;
    return Object.freeze({
        send(message) {
            worker.postMessage(message);
        },
        destroy() {
            worker.terminate();
            URL.revokeObjectURL(worker_src);
        }
    });
}

function make_webl() {

// The 'make_webl' function returns an object containing two functions:

//  padawan(spec)
//      The 'padawan' method returns an interface for a new padawan. It takes a
//      'spec' object, containing the following properties:

//          "on_log"
//              A function that is called with the stringified arguments of any
//              calls to console.log. The arguments are stringified by the
//              'inspect' function. Optional.

//          "on_exception"
//              A function that is called with a string representation of any
//              exceptions or Promise rejections encountered outside of
//              evaluation. Optional.

//          "name"
//              The name of the padawan, unique to this WEBL.

//          "type"
//              Determines the means of containerisation, and should be either
//              the string "top", "iframe", "popup" or "worker".

//          "popup_window_features"
//              The string passed as the third argument to window.open, for
//              popups.

//          "iframe_element"
//              The iframe element to use. If undefined, one is created and
//              appended to the body when the padawan is created.

//          "iframe_style_object"
//              An object containing styles to use for iframes.

//          "iframe_sandbox"
//              Controls iframes' "sandbox" attribute. If this property is
//              undefined, minimal capabilities are provided. If this property
//              is false, the iframe is not sandboxed at all. Otherwise this
//              property should be the string value of the "sandbox"
//              attribute.

//      The returned object contains three functions:

//          create()
//              The 'create' method creates the padawan if it does not already
//              exist. It returns a Promise that resolves once the padawan is
//              ready to perform evaluation.

//          eval(script, imports, wait)
//              The 'eval' method evaluates a script within the padawan.

//              The 'script' parameter should be a string containing JavaScript
//              source code devoid of import or export statements.

//              The 'imports' parameter is an array of module specifiers that
//              are to be imported prior to the scripts evaluation. A
//              corresponding array of module objects is made available to the
//              script via the "$imports" variable.

//              The 'wait' parameter controls whether to wait for the evaluated
//              value to resolve, if it is a Promise.

//              It returns a Promise that resolves to a report object. If the
//              evaluation was successful, the report contains an 'evaluation'
//              property containing the evaluated value after it has been
//              stringified by the 'inspect' function. If an exception occured
//              during evaluation, the report will instead contain an
//              'exception' property, which is a string representation of
//              the exception.

//          destroy()
//              The 'destroy' method destroys the padawan if is has not already
//              been destroyed.

//  destroy()
//      Destroy the WEBL and all of its padawans.

    const secret = Math.random();
    let padawans = Object.create(null);
    let ready_callbacks = Object.create(null);
    let eval_callbacks = Object.create(null);
    let log_callbacks = Object.create(null);
    let exception_callbacks = Object.create(null);
    let eval_count = 0;

    function on_message(event) {

// Messages from the padawans are received here.

        const message = event.data;
        if (
            !message
            || typeof message !== "object"
            || message.secret !== secret
        ) {

// We have received an unrecognized message. Ignore it.

            return;
        }
        if (message.name === "ready") {

// It is possible for an iframe padawan to reinitialize itself when moved around
// the DOM, resulting in superfluous "ready" messages.

            const callback = ready_callbacks[message.padawan];
            if (callback !== undefined) {
                return callback();
            }
        }
        if (message.name === "evaluation") {
            return eval_callbacks[message.eval_id](message.value);
        }
        if (message.name === "log") {
            return log_callbacks[message.padawan](message.values);
        }
        if (message.name === "exception") {
            return exception_callbacks[message.padawan](message.reason);
        }
    }

    function padawan(spec) {
        const {
            on_log,
            on_exception,
            name,
            type,
            popup_window_features,
            iframe_element,
            iframe_style_object,
            iframe_sandbox
        } = spec;
        log_callbacks[name] = function (strings) {
            if (on_log !== undefined) {
                on_log(...strings);
            }
        };
        exception_callbacks[name] = function (string) {
            if (on_exception !== undefined) {
                on_exception(string);
            }
        };

        function create() {
            if (padawans[name] !== undefined) {
                return Promise.resolve();
            }

// Make a copy of the on_message function, thereby giving each padawan a unique
// listener that can be added and removed to global events independently.

            function on_message_facet(event) {
                return on_message(event);
            }

            if (type === "worker") {
                padawans[name] = make_worker_padawan(
                    name,
                    secret,
                    on_message_facet
                );
            } else if (type === "popup") {
                padawans[name] = make_popup_padawan(
                    name,
                    secret,
                    on_message_facet,
                    popup_window_features
                );
            } else if (type === "iframe") {
                padawans[name] = make_iframe_padawan(
                    name,
                    secret,
                    on_message_facet,
                    iframe_element,
                    iframe_style_object,
                    iframe_sandbox
                );
            } else {
                padawans[name] = make_top_padawan(
                    name,
                    secret,
                    on_message_facet
                );
            }
            return new Promise(function (resolve) {
                ready_callbacks[name] = function on_ready() {
                    delete ready_callbacks[name];
                    return resolve();
                };
            });
        }

        function eval_module(script, imports = [], wait = false) {
            const id = String(eval_count);
            eval_count += 1;
            return new Promise(function (resolve) {
                eval_callbacks[id] = function on_evaluated(report) {
                    delete eval_callbacks[id];
                    return resolve(report);
                };
                return padawans[name].send(fill(
                    padawan_eval_script_template,
                    {
                        eval_id: id,
                        import_expressions: imports.map(
                            function (specifier) {
                                return "import(\"" + specifier + "\")";
                            }
                        ).join(
                            ",\n    "
                        ),
                        payload_script_json: JSON.stringify(script),
                        wait
                    }
                ));
            });
        }

        function destroy() {
            if (padawans[name] !== undefined) {
                padawans[name].destroy();
                delete padawans[name];
                delete ready_callbacks[name];
                delete log_callbacks[name];
                delete exception_callbacks[name];
            }
        }

        return Object.freeze({
            create,
            eval: eval_module,
            destroy
        });
    }

    function destroy() {

// I have seen a security hologram of this function...killing younglings.

        Object.keys(padawans).forEach(function (the_name) {
            try {
                padawans[the_name].destroy();
            } catch (_) {}
            delete padawans[the_name];
        });
    }

    return Object.freeze({padawan, destroy});
}

if (import.meta.main) {
    const webl = make_webl();
    const padawan = webl.padawan({
        on_log: globalThis.console.log,
        on_exception: globalThis.console.error,
        name: "Foo #0",
        type: "iframe",
        iframe_style_object: {width: "200px", height: "200px"}
    });
    padawan.create().then(
        function on_created() {
            return padawan.eval(`
                const btn = document.createElement("button");
                btn.innerText = "Foo";
                document.body.appendChild(btn);
            `, []);
        }
    ).then(
        function on_evaluated(report) {
            globalThis.console.log(report.evaluation);
            return setTimeout(webl.destroy, 10000);
        }
    );
}

export default Object.freeze(make_webl);
