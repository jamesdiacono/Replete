# Replete Emacs plugin

This is an Emacs plugin for Replete, a REPL facilitating interactive programming in JavaScript.

The source code in this file is derived from [Skerrick](https://github.com/anonimitoraf/skerrick), making it subject to the GPL v3.0 licence.

## Installation

Install [Deno](https://deno.com), ensuring `deno` is in your `PATH`, then run `(load-file "/path/to/replete.el")` (adjusting the path as necessary).

By default, Replete will not let you import modules located outside of the directory in which Emacs was started.

## Usage

    (replete-start)

Starts (or restarts) the Replete process. Run this before you try to evaluate anything. Whilst Replete is running, you can monitor its output in the *replete* buffer.

    (replete-stop)

Kills the Replete process and closes the *replete* buffer.

    (replete-browser)
    (replete-node)
    (replete-deno)
    (replete-bun)
    (replete-tjs)

Evaluates the selected region of your buffer. The result will appear in the *replete* buffer.

## Configuration

This plugin does not yet support project-specific configuration via a _replete.json_ file. The plugin can be configured by running something like the following, with the value adjusted as necessary.

    (setq replete-command
      (list "/path/to/deno"
            "run"
            "--allow-all"
            ...))
    (setq replete-cwd "/path/to/your/source/code/directory")

The full list of supported arguments can be found [here](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#configuration).

Make sure `replete-cwd` points to a directory above every module that might be imported, directly or indirectly, during evaluation.
