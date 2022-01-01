// The command REPL evaluates JavaScript source code in an isolated process.
// Specifically, a process which can be run from the command line.

// If the evaluated script depends on other modules, the source code for those
// modules is served via an HTTP server. In the below diagram, the dashed line
// is the boundary between the two processes.

//                        +----------------+
//                        |                |
//                        |      You       |
//                        |                |
//                        +--+----------^--+
//                           |          |           +----------------+
//                           |          |           |                |
//                           |          |       +--->  Capabilities  |
//                           |          |       |   |                |
//                        message   evaluation  |   +----------------+
//                           |          |       |
//                     +-----v----------+-------v---+
//                     |                            |
//                     |                            |
//                 +--->        Command REPL        +--------+
//                 |   |                            |        |
//                 |   |                            |        |
//                 |   +----------------------------+        |
//                 |                                         |
//   +-------------v------------------------+     +----------v---------+
//   |                                      |     |                    |
//   |                CMDL                  |     |     HTTP server    |
//   |                                      |     |                    |
//   +-----+-------^--------^--------^------+     +----^----------+----+
//         |       |        |        |                 |          |
//         |       |        |        |                 |          |
//         |       |        |        |                 |          |
//       eval    report   STDOUT  STDERR            module      module
//         |       |        |        |              locator     source
//         |       |        |        |                 |          |
//   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
//         |       |        |        |                 |          |
//   +-----v-------+--------+--------+-----------------+----------v----+
//   |                                                                 |
//   |                             Padawan                             |
//   |                                                                 |
//   +-----------------------------------------------------------------+

import http from "http";
import alter_string from "./alter_string.js";
import find_specifiers from "./find_specifiers.js";
import scriptify_module from "./scriptify_module.js";
import replize_script from "./replize_script.js";

function command_repl_constructor(capabilities, cmdl) {

// The 'command_repl_constructor' function takes several parameters:

//      capabilities:
//          An object containing the standard Replete capability functions.

//      cmdl:
//          An unstarted CMDL instance.

// It returns an object containing two functions:

//      start()
//          Starts the REPL, returning a Promise which resolves wunce it is safe
//          to call 'send'.

//      send(message)
//          Sends source code to the CMDL for evaluation. It returns a Promise
//          which resolves to an array containing just the evaluated value. The
//          Promise rejects if an exception occurs during evaluation.

// The command REPL uses an HTTP server to serve modules to the CMDL, which will
// import them via the dynamic 'import' function.

    const http_server = http.createServer(function (req, res) {
        function fail(reason) {
            capabilities.err(reason.stack + "\n");
            res.statusCode = 500;
            return res.end();
        }
        const locator = req.url;
        if (capabilities.mime(locator) !== "text/javascript") {
            return fail(new Error("Bad MIME type: " + locator));
        }
        return capabilities.read(locator).then(
            function (buffer) {
                const source = buffer.toString("utf8");

// Rewrite the module's import specifiers as fully qualified URLs.

                const found_specifiers = find_specifiers(source);
                return Promise.all(
                    found_specifiers.map(function ({value}) {
                        return capabilities.locate(value, locator);
                    })
                ).then(function on_located(locators) {
                    return res.end(
                        alter_string(
                            source,
                            found_specifiers.map(function ({range}, nr) {
                                return [range, locators[nr]];
                            })
                        )
                    );
                });
            }
        ).catch(
            fail
        );
    });
    let http_server_port;
    function start() {
        return Promise.all([
            new Promise(function start_http_server(resolve, reject) {
                http_server.on("error", reject);
                return http_server.listen(function () {
                    http_server_port = http_server.address().port;
                    return resolve();
                });
            }),
            cmdl.create()
        ]);
    }
    function send(message) {
        return Promise.resolve(
            message
        ).then(
            capabilities.source
        ).then(
            function prepare_for_evaluation(source) {
                const {script, imports} = scriptify_module(source);
                return Promise.all([
                    Promise.resolve(replize_script(script, imports)),
                    Promise.all(
                        imports.map(
                            function (the_import) {
                                return the_import.specifier;
                            }
                        ).map(
                            function (specifier) {
                                return capabilities.locate(
                                    specifier,
                                    message.locator
                                ).then(function qualify(locator) {
                                    return (
                                        locator.startsWith("/")
                                        ? (
                                            "http://localhost:"
                                            + http_server_port
                                            + locator
                                        )
                                        : locator
                                    );
                                });
                            }
                        )
                    )
                ]);
            }
        ).then(
            function evaluate([script, imports]) {
                return cmdl.eval(script, imports);
            }
        ).then(
            function examine_report(report) {
                if (report.exception === undefined) {
                    return [report.evaluation];
                }
                throw report.exception;
            }
        );
    }
    return Object.freeze({start, send});
}

export default Object.freeze(command_repl_constructor);
