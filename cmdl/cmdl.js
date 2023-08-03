// A CMDL is a Node.js interface for instructing a single CMDL padawan process.

// When the CMDL is created, it listens for a TCP connection from the padawan.
// Via this communication channel, the CMDL asks the padawan to evaluate
// JavaScript source code and return a report.

// This TCP server sends commands and receives reports, each of which is a
// JSON-encoded message followed by a newline.

// There is only one kind of command, and that is the "eval" command. The "eval"
// command is an object containing these properties:

//      script:
//          The JavaScript source code to be evaluated. It must not contain any
//          import or export statements.

//      imports:
//          An array of import specifier strings. These will be resolved before
//          the script is evaluated, and an array of the resultant module
//          objects will be provided in the '$imports' variable.

//      id:
//          A unique identifier for the evaluation. It may be any JSON-encodable
//          value. It is used to match reports to commands.

// After evaluation has completed, successfully or not, a report is sent back to
// the CMDL. A report is an object with the following properties:

//      evaluation:
//          A string representation of the evaluated value, if evaluation
//          succeeded.

//      exception:
//          A string representation of the exception, if evaluation failed.

//      id:
//          The ID of the corresponding evaluation.

//                  +-------------------------------------+
//                  |                                     |
//                  |           Node.js process           |
//                  |                                     |
//                  |      +-----------------------+      |
//                  |      |                       |      |
//                  |      |          CMDL         |      |
//                  |      |                       |      |
//                  |      +-------+--------^------+      |
//                  |              |        |             |
//                  |           command   report          |
//                  |              |        |             |
//                  |          +---v--------+---+         |
//                  |          |                |         |
//                  |          |   TCP server   |         |
//                  |          |                |         |
//                  |          +---+--------^---+         |
//                  |              |        |             |
//                  +--------------+--------+-------------+
//                                 |        |
//                              command   report
//                                 |        |
//                       +---------v--------+---------+
//                       |                            |
//                       |      Padawan process       |
//                       |                            |
//                       +----------------------------+

import net from "node:net";
import readline from "node:readline";

function make_cmdl(spawn_padawan) {

// The 'spawn_padawan' parameter is a function that is responsible for starting
// a padawan process. It is passed the port number of the running TCP server,
// and returns a Promise resolving to the ChildProcess object. It may be called
// more than once, to restart the padawan if it dies.

// The return value is an object with the same interface as a padawan described
// in webl_server.js.

    let padawan_process;
    let socket;
    let tcp_server = net.createServer();
    let report_callbacks = Object.create(null);

    function wait_for_connection() {

// The returned Promise resolves once a TCP connection with the padawan has been
// established.

        return new Promise(function (resolve) {
            return tcp_server.once("connection", function (the_socket) {
                socket = the_socket;
                readline.createInterface({input: socket}).on(
                    "line",
                    function relay_report(line) {
                        const report = JSON.parse(line);
                        const id = report.id;
                        delete report.id;
                        return report_callbacks[id](report);
                    }
                );
                return resolve();
            });
        });
    }

    function start_padawan() {

// Starts the padawan and waits for it to connect to the TCP server.

        function register(the_process) {
            padawan_process = the_process;
            padawan_process.on("exit", function () {

// Inform any waiting callbacks of the failure.

                Object.values(report_callbacks).forEach(function (callback) {
                    return callback({exception: "CMDL died."});
                });
                report_callbacks = Object.create(null);

// If the padawan starts correctly but then dies due to its own actions, it is
// restarted immediately. For example, the padawan may be asked to evaluate
// "process.exit();". In such a case, we get the padawan back on line as soon as
// possible.

                if (!padawan_process.killed && socket !== undefined) {
                    start_padawan();
                }
                socket = undefined;
            });
        }

        return Promise.all([
            spawn_padawan(
                tcp_server.address().port
            ).then(
                register
            ),
            wait_for_connection()
        ]);
    }

    function create() {
        if (tcp_server.listening) {
            return Promise.resolve();
        }
        return new Promise(
            function start_tcp_server(resolve, reject) {
                tcp_server.on("error", reject);

// The TCP server is allocated a port number by the system.

                return tcp_server.listen(resolve);
            }
        ).then(
            start_padawan
        );
    }

    function eval_module(script, imports) {
        const id = String(Math.random());
        return new Promise(function (resolve) {
            report_callbacks[id] = resolve;
            return socket.write(JSON.stringify({script, imports, id}) + "\n");
        });
    }

    function destroy() {
        return new Promise(function (resolve) {
            if (padawan_process !== undefined) {
                padawan_process.kill();
            }
            return tcp_server.close(resolve);
        });
    }

    return Object.freeze({
        create,
        eval: eval_module,
        destroy
    });
}

export default Object.freeze(make_cmdl);
