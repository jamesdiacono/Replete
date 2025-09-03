/*jslint node */

const child_process = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const readline = require("node:readline");
const url = require("node:url");
const {window, commands, workspace} = require("vscode");

const colors = {
    browser: "rgba(255, 242, 130, 0.3)",    // yellow
    node: "rgba(60, 135, 58, 0.5)",         // green
    deno: "rgba(255, 255, 255, 0.5)",       // white
    bun: "rgba(254, 187, 207, 0.5)",        // pink
    tjs: "rgba(76, 89, 207, 0.5)"           // blue
};

let replete;
let line_reader;
let output_channel;

function stop() {

// Stop the Replete process and dispose of any related resources.

    if (replete !== undefined) {
        output_channel.dispose();
        line_reader.close();
        replete.kill();
        replete = undefined;
    }
}

function read_config() {

// Look for a replete.json in the workspace root. If found, merge it with the
// user config. If anything goes wrong, just produce the user config.

    const user_config = workspace.getConfiguration("replete");
    if (typeof workspace.rootPath !== "string") {
        return Promise.resolve(user_config);
    }
    return fs.promises.readFile(
        path.join(workspace.rootPath, "replete.json"),
        "utf8"
    ).then(
        JSON.parse
    ).then(function (project_config) {
        return {
            command: project_config.command ?? user_config.command,
            env: Object.assign({}, user_config.env, project_config.env)
        };
    }).catch(function () {
        return user_config;
    });
}

function start() {

// Start the Replete process, or restart it if it is already running.

    stop();

// Create a channel to display Replete's output. It will appear in the "Output"
// window.

    output_channel = window.createOutputChannel("Replete");
    output_channel.show(true);

// Spawn the Replete process.

    return read_config().then(function (config) {
        const [command, ...args] = config.command;
        replete = child_process.spawn(command, args, {
            cwd: workspace.rootPath,

// Deno's colorful output is not rendered correctly, so suppress it.

            env: Object.assign({}, process.env, {NO_COLOR: "1"}, config.env)
        });
        replete.on("error", function (error) {
            return output_channel.append(error.stack);
        });

// Listen for Replete's result messages on STDOUT. Each line is a JSON-encoded
// message.

        line_reader = readline.createInterface({input: replete.stdout});
        line_reader.on("line", function (line) {

// Exactly one of these four properties will be defined. Evaluations and
// exceptions do not come with a trailing newline.

            const {out, err, evaluation, exception} = JSON.parse(line);
            const text = out ?? err ?? evaluation ?? exception;
            return output_channel.append(
                (evaluation !== undefined || exception !== undefined)
                ? text + "\n"
                : text
            );
        });

// Listen for any problems with Replete itself on STDERR.

        replete.stderr.setEncoding("utf8");
        replete.stderr.on("data", function (chunk) {
            return output_channel.append(chunk);
        });
    });
}

function clear() {
    if (output_channel !== undefined) {
        output_channel.clear();
    }
}

function evaluate(platform) {

// Evaluate the currently selected source code in the 'platform' REPL.

    if (replete === undefined) {
        throw new Error("Replete is not running.");
    }
    const editor = window.activeTextEditor;

// Any empty selections are expanded to fill the line.

    const selections = editor.selections.map(function (selection) {
        return (
            selection.isEmpty
            ? editor.document.lineAt(selection.start).range
            : selection
        );
    });

// Briefly highlight the selected text.

    const decoration = window.createTextEditorDecorationType({
        backgroundColor: colors[platform],
        borderRadius: "3px"
    });
    window.activeTextEditor.setDecorations(decoration, selections);
    setTimeout(decoration.dispose, 300);

// Extract the selected source code from the document. Selections are provided
// in the order that they were created, so we first sort them in the order they
// appear on the page before amalgamating them.

    const source = selections.sort(function (a, b) {
        return (
            a.start.line - b.start.line
            || a.start.character - b.start.character
        );
    }).map(function (selection) {
        return editor.document.getText(selection);
    }).join("\n");

// Send a command message to Replete.

    replete.stdin.write(JSON.stringify({
        source,
        locator: url.pathToFileURL(editor.document.fileName),
        scope: editor.document.fileName,
        platform
    }) + "\n");

// Show the output pane in anticipation of a result.

    output_channel.show(true);
}

function activate(context) {
    context.subscriptions.push(
        commands.registerCommand("replete_start", start),
        commands.registerCommand("replete_stop", stop),
        commands.registerCommand("replete_clear", clear),
        commands.registerCommand("replete_browser", () => evaluate("browser")),
        commands.registerCommand("replete_node", () => evaluate("node")),
        commands.registerCommand("replete_deno", () => evaluate("deno")),
        commands.registerCommand("replete_tjs", () => evaluate("tjs")),
        commands.registerCommand("replete_bun", () => evaluate("bun"))
    );
}

module.exports = {
    activate,
    deactivate: stop
};
