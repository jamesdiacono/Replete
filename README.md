# Replete

Replete brings interactive programming to JavaScript. It is an evaluator for JavaScript modules, supporting a variety of environments including the browser, Node.js, Deno, Bun, and Txiki.

[Try it online](https://repletejs.org/play/) or install one of the plugins:

Text editor     | Plugin
----------------|--------------------
VSCode          |[Source](plugins/vscode/) [Marketplace](https://marketplace.visualstudio.com/items?itemName=jamesdiacono.Replete)
Sublime Text 4  |[Source](plugins/sublime/)
Emacs           |[Source](plugins/emacs/)
Neovim          |[Source](plugins/neovim/)
nREPL           |[Source](plugins/nrepl/)
MCP             |[Source](plugins/mcp/)

Once integrated with your text editor, Replete becomes part of your development environment. Source code is sent directly from your editor to Replete, where it is evaluated. Anything from a mere expression to a whole file may be evaluated at a time. The resulting value (or an exception) is reported back for perusal.

![](https://james.diacono.com.au/talks/feedback_and_the_repl/replete.gif)

Replete encourages the development of modules in isolation, rather than in the context of a running application. Modules written in this way tend to be more independent and hence more reusable, more testable and hence more robust.

Replete is in the Public Domain, and does not come with a warranty. It is at least as dangerous as the source code it is asked to import or evaluate, so be careful.

## Communication
Replete operates as a heirarchy of communicating processes, as shown in the diagram below.

                      +------------------------------------------+
                      |                                          |
                      |             Your application             |
                      |         (such as a text editor)          |
                      |                                          |
                      +----------------+-------------------------+
                                       |        ^
                                       |        |
                      Command messages |        | Result messages
                                       |        |
                                       V        |
    +-------------------------------------------+-----------------------------+
    |                                                                         |
    |                                    Replete                              |
    |                                                                         |
    +-------+----------------+--------------+-------------+------------+------+
            |                |              |             |            |
            |                |              |             |            |
            |                |              |             |            |
    +-------+------+ +-------+------+ +-----+-----+ +-----+----+ +-----+------+
    | Browser REPL | | Node.js REPL | | Deno REPL | | Bun REPL | | Txiki REPL |
    +--------------+ +--------------+ +-----------+ +----------+ +------------+

The Replete process is responsible for coordinating the REPL processes. It can run in Deno, Node.js, or Bun. When Replete runs in a Deno process, for example, we say that Replete is _hosted_ by Deno.

It is important to understand that the choice of host runtime imposes no constraints on the choice of REPLs running underneath. For example, a Deno-hosted Replete can spawn a Node.js REPL just as easily as a Node.js-hosted Replete can spawn a Deno REPL.

Replete communicates by sending and receiving command and result messages. Messages are JSON-encodable objects.

A __command__ message is an object with the following properties:

- __source__: The source code to be evaluated, as a string. The source may contain import and export statements.
- __locator__: The locator of the module containing the source. It is required if the source contains any relative imports.
- __platform__: Either `"browser"`, `"node"`, `"deno"`, `"bun"`, or `"tjs"`. This property determines which REPL evaluates the source.
- __scope__: The name of the scope, which can be any string. If undefined, the scope `""` is chosen. The scope is created if it does not exist.
- __id__: If defined, this property is copied verbatim onto the corresponding result messages. It can be used to associate a result with its command. It can be any value.

A __scope__ holds the value of every variable or function declared during evaluation, allowing them to be used in future evaluations. Distinct scopes provide a degree of isolation, however the same global object is shared by all scopes.

A __result__ message is an object with one of the following properties, each of which is a string representation of a value:

- __evaluation__: The evaluated value, if evaluation was completed successfully.
- __exception__: The exception, if evaluation failed.
- __out__: Any arguments passed to console.log, or bytes written to stdout.
- __err__: An exception that occurred outside of evaluation, or bytes written to stderr.

In addition, a result may contain the __id__ property described above.

Here are some examples of commands and the results they might induce.

    COMMAND {platform: "browser", source: "navigator.vendor"}
    RESULT  {evaluation: "Google Inc."}

    COMMAND {platform: "node", source: "process.version"}
    RESULT  {evaluation: "v14.4.0"}

    COMMAND {platform: "browser", source: "process.version"}
    RESULT  {exception: "ReferenceError: process is not defined..."}

    COMMAND {platform: "deno", source: "console.log(0 / 0, 1 / 0)"}
    RESULT  {out: "NaN Infinity\n"}
    RESULT  {evaluation: "undefined"}

    COMMAND {platform: "browser", source: "1 + 1", "id": 42}
    RESULT  {evaluation: "2", id: 42}

## Notable files
Replete is distributed as a collection of source files. The modules listed below contain their own usage instructions.

- [_replete.js_](./replete.js):
    Replete as a program. It takes command line arguments for basic configuration.

- [_run.js_](./run.js):
    Replete as a process. This module exports a function that starts a Replete instance and binds it to the current process's stdin and stdout. Use this module if you wish to configure Replete programmatically.

- [_make.js_](./make.js):
    Replete as a module. It exports a function that can be used to create multiple Replete instances. Each instance coordinates REPLs for a variety of environments.

- [_browser_repl.js_](./browser_repl.js),
  [_node_repl.js_](./node_repl.js),
  [_deno_repl.js_](./deno_repl.js),
  [_bun_repl.js_](./bun_repl.js),
  [_tjs_repl.js_](./tjs_repl.js):
    Modules, each exporting a constructor for a REPL specialized to a particular environment.

- [_repl.js_](./repl.js):
    A module exporting the constructor for a generic REPL. This is the heart of Replete.

- [_node_resolve.js_](./node_resolve.js):
    A module exporting a function that resolves an import specifier to a file in some "node_modules" directory.

- [_webl/_](./webl/):
    A directory containing source code for the WEBL, used by the browser REPL. The WEBL is a standalone tool for remotely evaluating source code in the browser. See webl/README.md.

- [_cmdl.js_](./cmdl.js):
    Like the WEBL but for command-line runtimes such as Node.js.

- [_package.json_](./package.json):
    A Node.js package manifest. It declares Replete's dependencies and compels Node.js to interpret these files as modules.

- [_import_map.json_](./import_map.json):
    A Deno import map declaring Replete's dependencies. It supports Deno's ability to run Replete without installation, directly over HTTP.

## Configuration
The function exported by [_run.js_](./run.js) takes an __options__ object containing any of the properties listed below. The [_replete.js_](./replete.js) program accepts a subset of these options as command line arguments.

Most plugins support configuration on a per-project basis. Simply create a _replete.json_ file in the project's root directory and specify a command like so:

    {
        "command": [
            "deno",
            "run",
            "--allow-all",
            "--importmap",
            "https://deno.land/x/replete/import_map.json",
            "https://deno.land/x/replete/replete.js",
            "--browser_port=9325",
            "--content_type=js:text/javascript",
            "--content_type=css:text/css",
            "--content_type=svg:image/svg+xml"
        ]
    }

Additional configuration, including [transpilation](https://github.com/jamesdiacono/Replete/issues/6), can be achieved via Replete's programmatic interface. See [run.js](./run.js) for an example.

### Browser REPL
The browser REPL evaluates code in a browser tab. All modern browsers are supported. When multiple tabs are connected, the same code is evaluated in all tabs concurrently.

On startup, a message like

    Waiting for WEBL: http://localhost:9325

is output by Replete. To connect, open the URL in a browser. A blank page with the title "WEBL" should appear.

Because the browser REPL has access to the DOM, it can be used to develop user interfaces. For example, evaluating the following code renders an interactive button on the page:

    const button = document.createElement("button");
    button.textContent = "Click me";
    button.onclick = function () {
        alert("You clicked me.");
    };
    document.body.append(button);

The browser REPL is also capable of serving static files, so long as a suitable `options.headers` function is provided. For example, passing

    function headers(locator) {
        if (locator.endsWith(".js")) {
            return {"Content-Type": "text/javascript"};
        }
        if (locator.endsWith(".jpg")) {
            return {"Content-Type": "image/jpeg"};
        }
    }

as `options.headers` makes it possible to render a JPEG image on the page, where the image file is resolved relative to the current module:

    const melon_url = import.meta.resolve("./melon.jpg");
    const img = document.createElement("img");
    img.src = melon_url;
    document.body.append(img);

#### options.browser_port, `--browser_port`
The port number of the browser REPL. If omitted, the browser REPL will be unavailable.

#### options.browser_hostname, `--browser_hostname`
The hostname of the browser REPL. When this option is omitted, the browser REPL listens only on localhost.

A hostname of `"0.0.0.0"` exposes the browser REPL to the local network, making it possible to evaluate code in mobile browsers.

When exposing the browser REPL to the network, care should be taken to configure `options.headers` such that sensitive files are not accessible.

### Node.js REPL
[Node.js](https://nodejs.org) is a command-line runtime based on Google's V8 JavaScript engine.

#### options.which_node, `--which_node`
The path to the Node.js binary, `node`. If Node.js is in the `PATH` (see `options.node_env`), this can simply be `"node"`. Not required if Node.js is hosting Replete.

#### options.node_args
An array of command line arguments provided to the `node` process running the Node.js REPL, for example `["--inspect=7227"]`. Run `node --help` for a list of available arguments.

#### options.node_env
An object containing environment variables made available to the Node.js REPL. If omitted, the environment is inherited from the Replete process.

### Deno REPL
Like Node.js, [Deno](https://deno.com) is a command-line runtime based on V8, but it aims to behave more like a browser.

#### options.which_deno, `--which_deno`
The path to the Deno binary, `deno`. If Deno is in the `PATH` (see `options.deno_env`), this can simply be `"deno"`. Not required if Deno is hosting Replete.

#### options.deno_args
An array of command line arguments to follow `deno run`, for example `["--allow-all", "--no-lock"]`. By default, this array is empty and so the Deno REPL runs with no permissions. Run `deno help run` for a list of available arguments.

#### options.deno_env
Same as `options.node_env`, but for the Deno REPL.

### Bun REPL
[Bun](https://bun.sh) is a command-line runtime based on Apple's [JavaScriptCore](https://docs.webkit.org/Deep%20Dive/JSC/JavaScriptCore.html), also used by Safari. JavaScriptCore implements [Proper Tail Calls](https://webkit.org/blog/6240/ecmascript-6-proper-tail-calls-in-webkit/), making it the [only](https://compat-table.github.io/compat-table/es6/) JavaScript engine to achieve ES6 compliance.

The Bun REPL restarts whenever an unhandled exception or Promise rejection occurs outside of evaluation.

#### options.which_bun, `--which_bun`
The path to the Bun binary, `bun`. If Bun is in the `PATH` (see `options.bun_env`), this can simply be `"bun"`. Not required if Bun is hosting Replete.

#### options.bun_args
An array of command line arguments to follow `bun run`, for example `["--smol"]`. Run `bun --help` for a list of available arguments.

#### options.bun_env
Same as `options.node_env`, but for the Bun REPL.

### Txiki REPL
[Txiki](https://github.com/saghul/txiki.js) is a command-line runtime based on Fabrice Bellard's [QuickJS](https://bellard.org/quickjs/) engine. QuickJS sacrifices execution speed for reduced size and startup times.

Txiki is unable to host Replete because it does not implement a Node.js compatibility layer.

#### options.which_tjs, `--which_tjs`
The path to the Txiki binary, `tjs`. If Txiki is in the `PATH` (see `options.tjs_env`), this can simply be `"tjs"`.

#### options.tjs_args
An array of command line arguments provided to the `tjs` process running the Txiki REPL, for example `["--stack-size", "100"]`.

#### options.tjs_env
Same as `options.node_env`, but for the Txiki REPL.

### All REPLs
The remaining configuration options apply to all of the REPLs.

#### options.command(_message_)
Modifies a command _message_ prior to evaluation, for example by transforming its source code or locator. The returned Promise resolves to the modified message, with the "source" property containing JavaScript source code.

    options.command({
        source: "1 < 2 < 3",
        locator: "file:///yummy/cinnamon.coffee",
        ...
    });
    -> {
        source: "(1 < 2 && 2 < 3);",
        locator: "file:///yummy/cinnamon.coffee",
        ...
    }

It is safe for `options.command` to mutate _message_.

#### options.locate(_specifier_, _parent_locator_)
Resolves a module specifier. The _specifier_ parameter is the specifier string of a module to be located. The _parent_locator_ parameter is the locator of the module that contains the _specifier_, and is optional if _specifier_ is fully qualified. The returned Promise resolves to the locator.

A __specifier__ is the string portion of a module's import statement, for example "../my_module.js".

A __locator__ is a URL string containing sufficient information to locate a file. Locators that refer to a file on disk should begin with a regular file URL, but can be suffixed with arbitrary information such as a query string.

    options.locate("./apple.js", "file:///yummy/orange.js");
    -> "file:///yummy/apple.js"

    options.locate("fs", "file:///yummy/orange.js");
    -> "node:fs"

    options.locate("yucky", "file:///yummy/orange.js");
    -> "file:///yummy/node_modules/yucky/yucky.js"

    options.locate("https://yum.my/noodles.js", "file:///yummy/orange.js");
    -> "https://yum.my/noodles.js"

#### options.read(_locator_)
Reads the contents of a file on disk. The _locator_ is a file URL. The returned Promise resolves to a Uint8Array or a string.

    options.read("file:///yummy/apple.js");
    -> A string containing JavaScript.

    options.read("file:///yummy/cinnamon.coffee");
    -> A string containing JavaScript, transpiled from CoffeeScript.

    options.read("file:///yummy/bread.png");
    -> A Uint8Array containing PNG image data.

#### options.watch(_locator_)
Detects when a file on disk is modified. The returned Promise resolves when the file designated by _locator_ next changes. This does not trigger any visible action. It simply informs Replete that it should drop the file from its cache.

#### options.headers(_locator_), `--content_type`
Determines the response headers for a file served over HTTP. If an object is returned, the file is served with those headers. If `undefined` is returned, the file is not served. Note that, unlike the other options, `options.headers` does not return a Promise.

    options.headers("file:///yummy/apple.js");
    -> {"Content-Type": "text/javascript"}
    options.headers("file:///yummy/cinnamon.coffee");
    -> {"Content-Type": "text/javascript"}
    options.headers("file:///yummy/spaghetti.jpg");
    -> {"Content-Type": "image/jpeg"}
    options.headers("file:///yummy/secret.key");
    -> undefined

If this option is absent, only files with a ".js" extension will be served. The headers (in particular Content-Type) should be consistent with the value produced by calling `options.read` with _locator_, not necessarily the file as it exists on disk.

A simplified form of this option may be provided on the command line like `--content_type=<ext>:<type>`. Each appearance of `--content_type` maps a file extension to its Content-Type. For example, the following would configure Replete to serve .js, .css, and .html files with appropriate Content-Type headers.

    --content_type=js:text/javascript
    --content_type=css:text/css
    --content_type="html:text/html; charset=utf-8"

#### options.out(_string_)
Called with a string representation of any arguments passed to `console.log` or bytes written to stdout.

#### options.err(_string_)
Called with a string representation of any exceptions that occur outside of evaluation, or of any bytes written to stderr.

#### options.root_locator, `--root_locator`
The file URL string of the "root" directory. Files inside this directory may be read and served over the network by Replete. Files outside this directory will not be accessible. Defaults to the current working directory of the Replete process if not specified.

For example, suppose `options.root_locator` was chosen to be

    file:///home/me/code

and then Replete attempted to read the file locators

    file:///etc/passwd
    file:///etc/config.json
    file:///home/me/tool.json
    file:///home/me/code/project/bundle.json

Only the last attempt (bundle.json) could succeed, and only if `options.headers` recognized JSON files, which it does not do by default.

It is your responsibility to choose `options.root_locator`, `options.headers`, and `options.browser_hostname` such that sensitive files are not exposed.

#### options.spawn(_command_, _env_, _hosts_)
Spawns a command line REPL process. The returned Promise resolves to a Node.js `ChildProcess` instance.

The _command_ parameter is an array of string arguments, the first of which is the path to the executable (such as `/bin/deno`).

The _hosts_ parameter is an array of local network endpoints, formatted like `"<hostname>:<port>"`, that the REPL process will depend on. If the REPL process is to be spawned on a remote machine, each of these hosts must be tunnelled via a reverse proxy or similar.

For example, an SSH command based on the following pattern both spawns the REPL process on a remote machine and tunnels the necessary endpoints:

    ssh [-R <host>:<host>]+ -tt user@server <command>

Notice how _command_ and _hosts_ are incorporated into the resulting command. The `-tt` argument ensures that the REPL process is correctly killed when the time comes.

## Links
- [The REPL is not a toy](https://www.youtube.com/watch?v=6hMOtPnVr3A)
- [What makes a REPL?](https://ericnormand.me/podcast/what-makes-a-repl)
