// The CMDL remotely evaluates arbitrary source code in command-line JavaScript
// runtimes.

// The CMDL is not a security feature. It should not be used to run untrusted
// code. Evaluated code will be able to read and write to disk, access the
// network and start new processes.

// Code is evaluated in the global context.
// Code is evaluated in sloppy mode (as opposed to strict mode).
// Code is evaluated in a dedicated process.

// A CMDL instance instructs a single padawan. A padawan is a process that is
// used as an isolated execution environment. If a padawan dies, it is
// resurrected immediately.

// When a CMDL is created, it waits for a TCP connection to be initiated by the
// padawan. Via this communication channel, the CMDL instructs the padawan to
// evaluate JavaScript source code.

// The TCP server sends commands and receives reports, each of which is a
// JSON-encoded object followed by a newline.

//          +-------------------------------------+
//          |                                     |
//          |            Master process           |
//          |                                     |
//          |      +-----------------------+      |
//          |      |                       |      |
//          |      |          CMDL         |      |
//          |      |                       |      |
//          |      +-------+---------------+      |
//          |              |        ^             |
//          |              |        |             |
//          |           command   report          |
//          |              |        |             |
//          |              V        |             |
//          |      +----------------+------+      |
//          |      |                       |      |
//          |      |       TCP server      |      |
//          |      |                       |      |
//          |      +-------+---------------+      |
//          |              |        ^             |
//          |              |        |             |
//          +--------------|--------|-------------+
//                         |        |
//                      command   report
//                         |        |
//                         V        |
//          +-----------------------+-------------+
//          |                                     |
//          |           Padawan process           |
//          |                                     |
//          +-------------------------------------+

// There is only one kind of command, and that is the "eval" command. The "eval"
// command is an object containing these properties:

//      script:
//          The JavaScript source code to be evaluated. It must not contain any
//          import or export statements.

//      imports:
//          An array of import specifier strings. These will be resolved before
//          the script is evaluated, and an array of the resultant module
//          objects will be provided in the '$imports' variable.

//      wait:
//          Whether to wait for the evaluated value to resolve, if it is a
//          Promise.

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

import net from "node:net";
import readline from "node:readline";

// This should be "localhost", but we force IPv4 because, on Windows, Node.js
// seems unwilling to connect to Deno over IPv6.

const tcp_hostname = "127.0.0.1";

function make_cmdl(spawn_padawan, on_stdout, on_stderr) {

// The 'spawn_padawan' parameter is the function responsible for starting a
// padawan process. It is passed the port number of the running TCP server, and
// returns a Promise resolving to the ChildProcess object. It may be called
// more than once, to restart the padawan if it dies.

// The 'on_stdout' and 'on_stderr' parameters are functions that are called with
// a Buffer whenever data is written to stdout or stderr.

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
            the_process.on("exit", function () {

// Inform any waiting callbacks of the failure.

                Object.values(report_callbacks).forEach(function (callback) {
                    return callback({exception: "CMDL died."});
                });
                report_callbacks = Object.create(null);

// If the padawan starts correctly but then dies due to its own actions, it is
// restarted immediately. For example, the padawan may be asked to evaluate
// "process.exit();". In such a case, we get the padawan back on line as soon as
// possible.

                if (!the_process.killed && socket !== undefined) {
                    start_padawan();
                }
                socket = undefined;
            });
            padawan_process = the_process;
            return new Promise(function (resolve, reject) {
                the_process.on("error", reject);
                the_process.on("spawn", function () {
                    the_process.stdout.on("data", on_stdout);
                    the_process.stderr.on("data", on_stderr);
                    resolve(the_process);
                });
            });
        }

        const tcp_host = tcp_hostname + ":" + tcp_server.address().port;
        return Promise.all([
            spawn_padawan(tcp_host).then(register),
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

// The TCP server is allocated an unused port number by the system.

                return tcp_server.listen(0, tcp_hostname, resolve);
            }
        ).then(
            start_padawan
        );
    }

    function eval_module(script, imports, wait) {
        const id = String(Math.random());
        return new Promise(function (resolve) {
            report_callbacks[id] = resolve;
            return socket.write(
                JSON.stringify({script, imports, wait, id}) + "\n"
            );
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
