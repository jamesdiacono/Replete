# Replete VSCode plugin

[Replete](https://github.com/jamesdiacono/Replete) brings interactive programming to JavaScript. It is an evaluator for JavaScript modules, supporting a variety of environments including the browser, Node.js, Deno, Bun, and Txiki.

![](https://james.diacono.com.au/talks/feedback_and_the_repl/replete.gif)

[Watch the introduction](https://www.youtube.com/playlist?list=PLbPVisN8OkPDx78v-QsKdq7QL4HBVDsYX).

The source code for this extension is in the Public Domain.

## Installation

Make sure you have [Deno](https://docs.deno.com/runtime/getting_started/installation/) v1.35.3+ installed. In VSCode, go to

    View -> Extensions

and search for "Replete". Press "Install".

To install the plugin manually, move the directory containing this file (README.md) into VSCode's extensions directory (naming it `vscode_replete`) and restart VSCode.

OS      | Extensions directory
--------|----------------------
Linux   | ~/.vscode/extensions/vscode_replete
maxOS   | ~/.vscode/extensions/vscode_replete
Windows | %UserProfile%\\.vscode\\extensions\\vscode_replete

## Usage

The following keybindings can be used to control Replete:

Windows/Linux   | MacOS     | Command
----------------|-----------|-----------
alt+r           | ctrl+r    | Start Replete
alt+s           | ctrl+s    | Stop Replete
alt+l           | ctrl+l    | Clear output
alt+b           | ctrl+b    | Evaluate selection in browser
alt+n           | ctrl+n    | Evaluate selection in Node.js
alt+d           | ctrl+d    | Evaluate selection in Deno
alt+u           | ctrl+u    | Evaluate selection in Bun
alt+t           | ctrl+t    | Evaluate selection in Txiki

Alternatively, search for "Replete" in the command palette to see the available commands.

Upon starting Replete, a new Output panel will appear. This is where Replete writes its output. Now you can begin evaluating source code.

## Configuration

Ensure that the Output panel's "Auto Scrolling" feature is turned on. You may also want to disable VSCode's "Smart Scroll" feature, which can interfere with Replete's output:

    Settings -> User -> Features -> Output

The extension can be configured globally by navigating to

    Settings -> User -> Extensions -> Replete

or by choosing "Open User Settings (JSON)" in the command palette.

More configuration options are described [here](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#configuration).
