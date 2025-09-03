# Replete NeoVim plugin

This is a Neovim plugin for [Replete](https://repletejs.org), a REPL facilitating interactive programming in JavaScript.

The code for this plugin is [MIT licenced](https://opensource.org/licenses/MIT), as is its dependency [json.lua](https://github.com/rxi/json.lua).

## Installation

Install [Deno](https://deno.com), ensuring `deno` is in your `PATH`, then move the directory containing this file (README.md) into Neovim's autostart directory (which may need to be created).

OS      | Autostart directory
--------|---------------------
Linux   | `~/.local/share/nvim/site/pack/plugins/start/`
macOS   | `~/.local/share/nvim/site/pack/plugins/start/`
Windows | `%LocalAppData%\share\nvim\site\pack\plugins\start\`

Restart nvim.

## Usage

To start Replete, run `:Replete`. A new buffer will appear to hold Replete's output. Now you can evaluate JavaScript. The following keymaps are available:

    <M-b> (alt+b)   Evaluate the visual selection in the browser.
    <M-n> (alt+n)   Evaluate the visual selection in Node.js.
    <M-d> (alt+d)   Evaluate the visual selection in Deno.
    <M-u> (alt+u)   Evaluate the visual selection in Bun.
    <M-t> (alt+t)   Evaluate the visual selection in Txiki.

To stop Replete, run `:Replete` again.

By default, Replete will not let you import modules located outside of the directory in which nvim was started.

## Configuration

Configuration options are described [here](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#configuration).

Although per-project configuration is recommended, the plugin may also be configured by pasting the following code into Neovim's configuration file, located at

OS      | Config file
--------|------------------
Linux   | `~/.config/nvim/init.vim`
macOS   | `~/.config/nvim/init.vim`
Windows | `%LocalAppData%\nvim\init.vim`

and adjusting the values as necessary:

    let g:replete_command = [
        \"/path/to/deno",
        \"run",
        \"--allow-all",
        ...
        \]
    let g:replete_cwd = "/path/to/your/source/code/directory"

If `replete_cwd` is specified, ensure it points to a directory above every module that might be imported, directly or indirectly, during evaluation.

Restart nvim for the changes to take effect.
