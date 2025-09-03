# Replete Sublime plugin

This is a Sublime Text 4 package for [Replete](https://repletejs.org), a REPL facilitating interactive programming in JavaScript.

The source code for this package is in the Public Domain.

## Installation

Install [Deno](https://deno.com) then move the directory containing this file (README.md) into Sublime's "Packages" directory, which may need to be created:

OS      | Package directory
--------|------------------
Linux   | `~/.config/sublime-text/Packages/Replete`
macOS   | `~/Library/Application Support/Sublime Text/Packages/Replete`
Windows | `%AppData%\Sublime Text\Packages\Replete`

You may need to provide explicit paths for the directories holding your runtime binaries, such as `deno`. To do so, go to

    Preferences -> Package Settings -> Replete -> Settings

and paste this JSON into the right-hand pane, modifying the paths as appropriate.

    {
        "env": {
            "PATH": "/path/to/node/bin:/path/to/deno/bin:/path/to..."
        }
    }

You can also copy over and modify the "command" array, although the use of _replete.json_ files is recommended instead.

## Usage

First, you must start Replete. A new tab entitled \[Replete\] is created. This is where Replete's output will appear. Now you can evaluate JavaScript.

You can run commands by opening the command palette and typing "Replete". Additionally, the following keyboard shortcuts are available:

Shortcut            | Command
--------------------|-------------------
ctrl+alt+shift+r    | Start Replete
ctrl+alt+shift+b    | Evaluate the selected region in the browser
ctrl+alt+shift+n    | Evaluate the selected region in Node.js
ctrl+alt+shift+d    | Evaluate the selected region in Deno
ctrl+alt+shift+u    | Evaluate the selected region in Bun
ctrl+alt+shift+t    | Evaluate the selected region in Txiki
ctrl+alt+shift+l    | Clear output

To modify the keybindings, go to

    Preferences -> Package Settings -> Replete -> Key Bindings

More configuration options are described [here](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#configuration).
