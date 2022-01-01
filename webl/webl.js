// A WEBL is master to many padawans. A padawan is an isolated execution context
// with its own global object. It can be asked to evaluate arbitrary JavaScript
// source code, and it reports any logging or exceptions. A padawan is sandboxed
// such that it can not interfere with its master or other padawans.

/*jslint browser */

function inspect(value) {

// The 'inspect' function formats the 'value' as a nice readable string. It is
// useful for debugging.

    function is_primitive(value) {
        return (
            typeof value === "string"
            || typeof value === "number"
            || typeof value === "boolean"
            || value === null
            || value === undefined
        );
    }
    let dent = "";
    function indent() {
        dent += "    ";
    }
    function outdent() {
        dent = dent.slice(4);
    }

// The string is built up as the value is traversed.

    let string = "";
    function write(fragment) {
        string += fragment;
    }

// We keep track of values which have already been (or are being) printed,
// otherwise we would be at risk of entering an infinite loop.

    let seen = new WeakMap();
    (function print(value) {
        if (typeof value === "function") {
            return write("[Function: " + (value.name || "(anonymous)") + "]");
        }
        if (typeof value === "string") {

// Add quotes around strings, and encode any newlines.

            return write(JSON.stringify(value));
        }
        if (is_primitive(value) || value.constructor === RegExp) {
            return write(String(value));
        }
        if (value.constructor === Date) {
            return write("[Date: " + value.toJSON() + "]");
        }
        if (seen.has(value)) {
            return write("[Circular]");
        }
        try {
            seen.set(value, true);
        } catch (ignore) {

// The value must be some kind of freaky primitive, like Symbol or BigInt.

            return write(
                "[" + value.constructor.name + ": " + String(value) + "]"
            );
        }
        function print_member(key, value, compact, last) {

// The 'print_member' function prints out an element of an array, or property of
// an object.

            if (!compact) {
                write("\n" + dent);
            }
            if (key !== undefined) {
                write(key + ": ");
            }
            print(value);
            if (!last) {
                return write(
                    compact
                    ? ", "
                    : ","
                );
            }
            if (!compact) {
                return write("\n" + dent.slice(4));
            }
        }
        if (Array.isArray(value)) {
            const compact = value.length < 3 && value.every(is_primitive);
            write("[");
            indent();
            value.forEach(function (element, element_nr) {
                print_member(
                    undefined,
                    element,
                    compact,
                    element_nr === value.length - 1
                );
            });
            outdent();
            return write("]");
        }

// The value is an object. Print out its properties.

        if (value.constructor !== Object) {

// The object has an unusual prototype. A descriptive prefix might be helpful.

            if (value.constructor === undefined) {
                write("[Object: null prototype] ");
            } else {
                write("[" + value.constructor.name + "] ");
            }
        }
        const keys = Object.keys(value);
        write("{");
        indent();
        keys.forEach(function (key, key_nr) {
            print_member(
                key,
                value[key],
                keys.length === 1 && is_primitive(value[key]),
                key_nr === keys.length - 1
            );
        });
        outdent();
        return write("}");
    }(value));
    return string;
}

function reason(exception) {

// A self-contained function which formats an exception as a human-readable
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
    } catch (ignore) {
        return "Exception";
    }
}

function fill(template, substitutions) {

// The 'fill' function prepares a script template for execution. As an example,
// all instances of "{the_force}" found in the 'template' will be replaced with
// 'substitutions.the_force'. The extra level of indentation we add to our
// templates is removed also.

    return template.replace(/\{([^{}]*)\}/g, function (original, filling) {
        return substitutions[filling] ?? original;
    }).replace(/^\u0020{4}/gm, "");
}

// The creation script is the first thing evaluated by a padawan. It adds
// listeners for messages and other events.

// Note that we strenously avoid defining any variables other than $webl. This
// is because the entire local scope is made available to any script executed by
// 'eval'.

const padawan_create_script_template = `
    /*jslint browser, eval */
    /*global name, secret */

// The '$webl' object contains a couple of functions used internally by the
// padawan to communicate with its master.

    const $webl = Object.freeze(function (master_window) {
        return {
            send(message) {

// Authenticate the message.

                message.secret = {secret};
                return master_window.postMessage(message, "*");
            },
            inspect: ${inspect.toString()},
            reason: ${reason.toString()}
        };
    }(window.opener ?? window.parent));

// The 'console.log' function is commonly used to send output to the REPL during
// debugging. Here we apply a wiretap, sending its arguments to the master.

    (function (original_log) {
        window.console.log = function (...args) {
            $webl.send({
                name: "log",
                padawan: "{name}",
                values: args.map(function (value) {
                    return (

// If the value happens to be a string, it is passed through unchanged. This
// improves the readability of strings which span multiple lines.

                        typeof value === "string"
                        ? value
                        : $webl.inspect(value)
                    );
                })
            });
            return original_log(...args);
        };
    })(window.console.log);

// Inform the master of any uncaught exceptions.

    window.onunhandledrejection = function (event) {
        return $webl.send({
            name: "exception",
            padawan: "{name}",
            reason: $webl.reason(event.reason)
        });
    };
    window.onerror = function (...args) {
        return window.onunhandledrejection({reason: args[4]});
    };

// Padawans receive only wun kind of message, containing the fulfillment of the
// 'padawan_eval_script_template'.

    window.onmessage = function (event) {

// Regrettably, the 'event' argument is made available to the eval scope. In a
// total fluke, the argument's value is identical to window.event, so we can
// ignore this infraction.

        return eval(event.data);
    };

// Finally, inform the master that the padawan is ready for instruction.

    $webl.send({
        name: "ready",
        padawan: "{name}"
    });
`;

// An "eval script" is sent to the padawan for evaluation. Upon evaluation, it
// resolves some importations and then evaluates a payload script, informing the
// master of the result. The importations are added to the local scope. This
// makes them accessible to the payload script during its evaluation.

// The payload script is encoded as a JSON string because this is an easy way to
// escape newlines.

// The script is evaluated in sloppy mode. Strict mode can be activated by
// prepending the payload script with "use strict";

const padawan_eval_script_template = `
    Promise.all([
        {import_expressions}
    ]).then(function ($imports) {
        return $webl.send({
            name: "evaluation",
            eval_id: "{eval_id}",
            value: {
                evaluation: $webl.inspect(eval({payload_script_json}))
            }
        });
    }).catch(function (exception) {
        return $webl.send({
            name: "evaluation",
            eval_id: "{eval_id}",
            value: {
                exception: $webl.reason(exception)
            }
        });
    });
`;

function make_iframe_padawan(
    name,
    secret,
    style_object = {display: "none"}
) {
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, style_object);

// Omitting the "allow-same-origin" permission places the iframe in a different
// origin from that of its master. This means that communication is only
// possible via 'window.postMessage'.

    iframe.sandbox = "allow-scripts";
    iframe.srcdoc = (
        "<script>\n"
        + fill(padawan_create_script_template, {name, secret})
        + "\n</script>"
    );
    document.body.appendChild(iframe);
    return Object.freeze({
        send(message) {
            iframe.contentWindow.postMessage(message, "*");
        },
        destroy() {
            document.body.removeChild(iframe);
        }
    });
}
function make_popup_padawan(
    name,
    secret,
    window_features
) {
    const padawan_window = window.open(
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
        }
    });
}

function webl_constructor() {

// The 'webl_constructor' function returns an object containing two functions:

//  padawan(spec)
//      The 'padawan' method returns an interface for a new padawan. It takes a
//      'spec' object, containing the following properties:

//          "on_log"
//              A function which is called with the stringified arguments of any
//              calls to console.log. The arguments are stringified by the
//              'inspect' function.
//          "on_exception"
//              A function which is called with a string representation of any
//              exceptions or Promise rejections encountered outside of
//              evaluation.
//          "name"
//              The name of the padawan, unique to this WEBL.
//          "type"
//              Determines the means of containerisation, and should be either
//              the string "popup" or "iframe".
//          "popup_window_features"
//              The string passed as the third argument to window.open, for
//              popups.
//          "iframe_style_object"
//              An object containing styles to use for iframes.

//      The returned object contains three functions:

//          create()
//              The 'create' method creates the padawan if it does not already
//              exist. It returns a Promise which resolves wunce the padawan is
//              ready to perform evaluation.

//          eval(script, imports)
//              The 'eval' method evaluates a script within the padawan.

//              The 'script' parameter should be a string containing JavaScript
//              source code devoid of import or export statements.

//              The 'imports' parameter is an array of module specifiers which
//              are to be imported prior to the scripts evaluation. A
//              corresponding array of module objects is made available to the
//              script via the "$imports" variable.

//              It returns a Promise which resolves to a report object. If the
//              evaluation was successful, the report contains an 'evaluation'
//              property containing the evaluated value after it has been
//              stringified by the 'inspect' function. If an exception occured
//              during evaluation, the report will instead contain an
//              'exception' property, which contains a string representation of
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
            typeof message !== "object"
            || message === null
            || message.secret !== secret
        ) {

// We have received an unrecognised message. Ignore it.

            return;
        }
        if (message.name === "ready") {
            return ready_callbacks[message.padawan]();
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
            iframe_style_object
        } = spec;
        log_callbacks[name] = function (strings) {
            return on_log(...strings);
        };
        exception_callbacks[name] = on_exception;
        function create() {
            if (padawans[name] !== undefined) {
                return Promise.resolve();
            }

// Listen for messages posted by the padawan, if we are not already.

            window.addEventListener("message", on_message);
            padawans[name] = (
                type === "popup"
                ? make_popup_padawan(
                    name,
                    secret,
                    popup_window_features
                )
                : make_iframe_padawan(
                    name,
                    secret,
                    iframe_style_object
                )
            );
            return new Promise(function (resolve) {
                ready_callbacks[name] = function on_ready() {
                    delete ready_callbacks[name];
                    return resolve();
                };
            });
        }
        function eval_module(script, imports = []) {
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
                        payload_script_json: JSON.stringify(script)
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
            } catch (ignore) {}
            delete padawans[the_name];
        });
        window.removeEventListener("message", on_message);
    }
    return Object.freeze({padawan, destroy});
}

// Below is a demonstration showing how the WEBL can be used within the browser.

export default Object.freeze(webl_constructor);
