# Replete

Replete is an evaluator for JavaScript modules. It enables a highly interactive style of programming called __REPL-driven development__. Replete can evaluate modules in the browser, Node.js and Deno.

When integrated with your text editor, Replete becomes part of your development environment. Source code is sent directly from your editor to Replete, where it is evaluated. Anything from a mere expression to a whole file may be evaluated at a time. The resulting value (or an exception) is reported back for perusal.

![](https://james.diacono.com.au/talks/feedback_and_the_repl/replete.gif)

Replete encourages the development of modules in isolation, rather than in the context of a running application. Modules written in this way tend to be more independent and hence more reusable, more testable and hence more robust.

[Browse the text editor plugins](https://github.com/jamesdiacono/Replete/issues/5).

Replete is in the Public Domain, and does not come with a warranty. It is at least as dangerous as the source code it is asked to import or evaluate, so be careful.

## Files
Replete is distributed as a collection of source files. Each module listed below contains usage instructions, and is compatible with both Node.js and Deno.

- [_replete.js_](./replete.js):
    Replete as a program. It takes command line arguments for basic configuration.

- [_run.js_](./run.js):
    Replete as a process. This module exports a function that starts a Replete instance and binds it to the current process's stdin and stdout. Use this module if you wish to configure Replete programmatically.

- [_make.js_](./make.js):
    Replete as a module. It exports a function that can be used to create multiple Replete instances. Each instance operates a browser REPL, a Node.js REPL, and a Deno REPL.

- [_browser_repl.js_](./browser_repl.js),
  [_node_repl.js_](./node_repl.js),
  [_deno_repl.js_](./deno_repl.js):
    Modules, each exporting a constructor for a REPL specialized to a particular environment.

- [_repl.js_](./repl.js):
    A module exporting the constructor for a generic REPL. This is the heart of Replete.

- [_node_resolve.js_](./node_resolve.js):
    A module exporting a function that resolves an import specifier to a file in a "node_modules" directory.

- [_webl/_](./webl/):
    A directory containing source code for the WEBL, used by the browser REPL. The WEBL is a standalone tool for remotely evaluating source code in the browser. See webl/README.md.

- [_cmdl/_](./cmdl/):
    A directory containing the source code for the CMDL, like the WEBL but for command-line runtimes like Node.js and Deno. See cmdl/README.md.

- [_package.json_](./package.json):
    A Node.js package manifest. It declares Replete's dependencies and tells Node to interpret the above files as modules.

The following files support Deno's ability to import the above modules over HTTP.

- [_import_map.json_](./import_map.json):
    A Deno import map declaring Replete's dependencies.

- [_fileify.js_](./fileify.js):
    A module exporting a function that downloads files for offline use.

## Configuration
Replete can be completely customized, or it can be run with no configuration at all.

The function exported by _run.js_ takes a __spec__ object containing the properties listed below, all of which are optional. The _replete.js_ program accepts a subset of these properties as command line arguments.

### spec.browser_port (or `--browser_port`)
The port number of the browser REPL. If this option is omitted, an unallocated port is chosen automatically. Providing a static port allows any connected tabs to survive a restart of Replete.

### spec.browser_hostname (or `--browser_hostname`)
The hostname of the browser REPL. When this option is omitted, the browser REPL listens only on localhost. This option can be used to expose the browser REPL to the network, in which case care must be taken to configure `spec.root_locator` and `spec.mime` such that sensitive files are not leaked.

### spec.which_node (or `--which_node`)
The path to the Node.js binary (`node`). If `node` is in the `PATH` (see `spec.node_env`), this can just be `"node"`.

If omitted, and Replete is being run in Deno, the Node.js REPL will not be available.

### spec.node_args
An array of command line arguments provided to the `node` process that runs the Node.js REPL, for example `["--inspect=7227"]`. Run `node --help` for a list of available arguments.

### spec.node_env
An object containing environment variables made available to the `node` process running the Node.js REPL. If omitted, the environment is inherited from the process running Replete.

### spec.which_deno (or `--which_deno`)
The path to the Deno binary (`deno`). If `deno` is in the `PATH` (see `spec.deno_env`), this can just be `"deno"`.

If omitted, and Replete is being run in Node.js, the Deno REPL will not be available.

### spec.deno_args
An array of command line arguments provided to the `deno` process that runs the Deno REPL, for example `["--allow-all"]`. By default, this array is empty and so the Deno REPL runs with no permissions. Run `deno help run` for a list of available arguments.

### spec.deno_env
Same as `spec.node_env`, but for the Deno REPL.

### spec.root_locator
The file URL string of the "root" directory. Files inside this directory may be read and served over the network by Replete. Files outside this directory will not be accessible.

For example, suppose `spec.root_locator` was chosen to be

    file:///home/me/code

and then Replete attempted to read the file locators

    file:///etc/passwd
    file:///etc/config.json
    file:///home/me/tool.json
    file:///home/me/code/project/bundle.json

Only the last attempt (bundle.json) could succeed, and only if `spec.mime` recognized JSON files, which it does not do by default.

It is your responsibility to choose `spec.root_locator`, `spec.mime`, and `spec.browser_hostname` such that sensitive files are not exposed.

### spec.message(_command_)
Modify a _command_ message prior to evaluation. It can be used to transform source code or locators. The returned Promise resolves to the modified command message, whose "source" property must contain JavaScript source code.

    spec.message({
        source: "1 < 2 < 3",
        locator: "file:///yummy/cinnamon.coffee"
    });
    -> {
        source: "(1 < 2 && 2 < 3);",
        locator: "file:///yummy/cinnamon.coffee"
    }

It is safe for `spec.message` to mutate its _command_ parameter.

### spec.locate(_specifier_, _parent_locator_)
Resolves a module specifier. The _specifier_ parameter is the specifier string of a module to be located. The _parent_locator_ parameter is the locator of the module that contains the _specifier_, and is optional if _specifier_ is fully qualified. The returned Promise resolves to the locator.

A __specifier__ is the string portion of a module's import statement, for example "../my_module.js".

A __locator__ is a URL string containing sufficient information to locate a file. Locators that refer to a file on disk should begin with a regular file URL, but can be suffixed with arbitrary information such as a query string.

    spec.locate("./apple.js", "file:///yummy/orange.js");
    -> "file:///yummy/apple.js"

    spec.locate("fs", "file:///yummy/orange.js");
    -> "node:fs"

    spec.locate("yucky", "file:///yummy/orange.js");
    -> "file:///yummy/node_modules/yucky/yucky.js"

    spec.locate("https://yum.my/noodles.js", "file:///yummy/orange.js");
    -> "https://yum.my/noodles.js"

### spec.read(_locator_)
Reads the contents of a file on disk. The _locator_ is a file URL. The returned Promise resolves to a Uint8Array or a string.

    spec.read("file:///yummy/apple.js");
    -> A string containing JavaScript.

    spec.read("file:///yummy/cinnamon.coffee");
    -> A string containing JavaScript, transpiled from CoffeeScript.

    spec.read("file:///yummy/bread.png");
    -> A Uint8Array containing PNG image data.

### spec.watch(_locator_)
Detects when a file on disk is modified. The returned Promise resolves when the file designated by _locator_ next changes. This does not trigger any visible action. It simply informs Replete that it should drop the file from its cache.

### spec.mime(_locator_)
Predicts the MIME type of the content produced by `spec.read` when it is called with the file _locator_. It returns a string, or `undefined` if access to the file should be denied.

    spec.mime("file:///yummy/apple.js");          // "text/javascript"
    spec.mime("file:///yummy/cinnamon.coffee");   // "text/javascript"
    spec.mime("file:///yummy/spaghetti.jpg");     // "image/jpeg"
    spec.mime("file:///yummy/secret.key");        // undefined

### spec.out(_string_)
Called with a string representation of any arguments passed to `console.log` or bytes written to stdout.

### spec.err(_string_)
Called with a string representation of any exceptions that occur outside of evaluation, or of any bytes written to stderr.

## Communication
Replete communicates by sending and receiving command and result messages.

       +------------------------------------------+
       |                                          |
       |               Your program               |
       |         (such as a text editor)          |
       |                                          |
       +----------------+-------------------------+
                        |        ^
                        |        |
       Command messages |        | Result messages
                        |        |
                        V        |
    +----------------------------+--------------------+
    |                                                 |
    |                    Replete                      |
    |                                                 |
    +---------+----------------+--------------+-------+
              |                |              |
              v                v              v
      +--------------+ +--------------+ +-----------+
      | Browser REPL | | Node.js REPL | | Deno REPL |
      +--------------+ +--------------+ +-----------+

Messages are JSON-encodable objects.

A __command__ message is an object with the following properties:

- __source__: The source code to be evaluated, as a string. The source may contain import and export statements.
- __locator__: The locator of the module containing the source. It is required if the source contains any import statements that are not fully qualified.
- __platform__: Either `"browser"`, `"node"` or `"deno"`. This property determines which REPL is used to evaluate the source.
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

## Links
- [Feedback and the REPL](https://www.youtube.com/watch?v=A_JrJekP9tQ&t=706s)
- [What makes a REPL?](https://ericnormand.me/podcast/what-makes-a-repl)
