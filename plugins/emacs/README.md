# Replete Emacs plugin

This is an Emacs plugin for Replete, a multi-platform JavaScript REPL.

The source code derives from [Skerrick](https://github.com/anonimitoraf/skerrick), making it subject to the GPL v3.0 licence.

## Installation

Install [Deno](https://deno.com), ensuring `deno` is in your `PATH`, then run `(load-file "/path/to/replete.el")` (adjusting the path as necessary).

## Usage

    M-x replete-start

Starts (or restarts) the Replete process. Run this before you try to evaluate anything. Whilst Replete is running, you can monitor its output in the *replete* buffer.

You will be prompted for the directory in which to start Replete. This directory will be checked for a _replete.json_ file. By default, Replete will not let you import modules located outside of this directory.

    M-x replete-stop

Kills the Replete process and closes the *replete* buffer.

    M-x replete-browser
    M-x replete-node
    M-x replete-deno
    M-x replete-bun
    M-x replete-tjs

Evaluates the selected region of your buffer. The result will appear in the *replete* buffer.

Configuration options are described [here](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#configuration).
