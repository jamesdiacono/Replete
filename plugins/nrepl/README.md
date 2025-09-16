# Replete nREPL server

This is an nREPL server for Replete (https://repletejs.org), a multi-platform JavaScript REPL.

The source code is in the Public Domain.

# Bugs

nREPL integration is currently buggy, due to some limitations in most nREPL clients including CIDER. Output and errors that are not a direct result of evaluation may not appear in the output buffer.

- https://docs.cider.mx/cider/platforms/overview.html
- https://github.com/clojure-emacs/cider/discussions/3422

# Usage (server)

Install [Deno](https://deno.com) then run

    deno run --allow-all https://deno.land/x/replete/plugins/nrepl/server.js [port]

from the root directory of your project. If no port number is specified, an unused port will be chosen at random. You will see a message like this written to stdout:

    nREPL server started on port 7888 on host 127.0.0.1 - nrepl://127.0.0.1:7888

The nREPL server will spawn Replete using the command from the _replete.json_ file in the current directory, if it is present.

It listens on an unused TCP port and starts a Replete process (preferring to use the command from _replete.json_) then relays messages translating between the Replete and nREPL protocols as necessary.

On startup it writes the TCP port number to the _.nrepl-port_ file in the current directory.

# Usage (client)

The most compatible nREPL client appears to be [CIDER](https://cider.mx/), but it assumes a Clojure VM and tries to evaluate Clojure expressions at the beginning of a session. You may need to update your `~/.emacs` file with the following:

    (custom-set-variables
     '(package-selected-packages '(cider))
     '(cider-repl-init-code ""))

To connect, do the following:

    $ M-x cider-connect <RET>
    > Host: <RET>
    > Port for localhost: (type port) <RET>
    > Connected! ...

A buffer containing a REPL will appear, be sure to check it for errors whenever evaluation appears to fail. Now switch to your JavaScript buffer:

    $ M-x cider-mode <RET>
    > Cider mode enabled in current buffer
    ...select some JavaScript...
    $ M-x cider-eval-region
    > => ...
