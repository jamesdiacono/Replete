# Replete

> The liquid pencil of this school is replete with a beauty peculiar to itself.
>   -- John Constable

Replete is an evaluator for JavaScript modules. It enables a highly interactive style of programming known as __REPL-driven development__. Replete can evaluate modules in the browser, Node.js and Deno.

When integrated with a text editor, Replete becomes part of your development environment. Source code is sent from the editor's buffer to Replete, where it is evaluated. Anything from a mere expression to a whole file may be evaluated at a time. The evaluated value (or an exception) is reported back for perusal.

Replete encourages the development of modules in isolation, rather than in the context of a running application. Modules written in this way tend to be more independent and hence more reusable, more testable and hence more robust.

Replete is in the public domain. [Watch the demonstration](https://youtu.be/ZXXcn7jLNdk?t=1389).

## The files
- _replete.js_: A Node.js program which starts Replete. You should read this file.

- _browser_repl.js_: A Node.js module exporting the constructor for a REPL which evaluates messages in a browser environment.

- _node_repl.js_: A Node.js module exporting the constructor for a REPL which evaluates messages in a Node.js environment.

- _deno_repl.js_: A Node.js module exporting the constructor for a REPL which evaluates messages in a Deno environment.

- _command_repl.js_: A Node.js module providing generic functionality for the Node.js and Deno REPLs.

- _scriptify_module.js_: A module exporting a function which deconstructs the source code of a JavaScript module into a script, its imports and its exports.

- _replize_script.js_: In a REPL, source code is evaluated over and over again in the same execution context. However, some JavaScript statements throw an exception when evaluated multiple times. For example, two `let` declarations using the same name can not be evaluated twice in the same context. This module exports the `replize_script` function, which transforms a script to make it safe for reevaluation.

- _find_specifiers.js_: A module exporting a source analysis function, used for code transformations.

- _alter_string.js_: A module exporting a string manipulation function, used for code transformations.

- _webl/_: A directory containing source code for the WEBL, which is used by the browser REPL. The WEBL is a standalone tool for evaluating source code in the browser. See webl/README.md.

- _cmdl/_: A directory containing the source code for the CMDL, which is like the WEBL but for command-line runtimes. See cmdl/README.md.

- _package.json_: The Node.js package manifest. It specifies the Acorn dependency, and compels Node to interpret Replete's JavaScript files as modules.

## The message
__Messages__ are sent to Replete, from a text editor or similar. A message is an object containing the following properties:

- __source__: The JavaScript source code to be evaluated. The source may contain import and export statements.
- __locator__: The locator of the module which contains the source. More on locators below.

A message may contain additional properties, although these are ignored by Replete.

## The capabilities
You must supply Replete with several __capability__ functions. These provide a rich opportunity to customise Replete. The _capabilities_ parameter passed to several of Replete's constructors should be an object with the following methods:

### capabilities.source(_message_)
The __source__ capability extracts the source from a _message_ object, before it is evaluated. The returned Promise resolves to a string containing JavaScript source code.

    capabilities.source({
        source: "Math.random();",
        locator: "/yummy/apple.js"
    });
    -> "Math.random();"

    capabilities.source({
        source: "1 < 2 < 3",
        locator: "/yummy/cinnamon.coffee"
    });
    -> "(1 < 2 && 2 < 3);"

### capabilities.locate(_specifier_, _parent_locator_)
The __locate__ capability resolves a module specifier. It is passed a _specifier_ string, which specifies which module is to be located. Usually, it is also passed a _parent_locator_ parameter, which is the locator of the module which contains the specifier. It returns a Promise which resolves to the locator.

A __specifier__ is the string portion of a module's import statement, for example "../my_module.js".

A __locator__ is a string containing sufficient information to locate a file. A locator should start with a "/" if it refers to a file on disk, but otherwise its structure is completely up to you.

If absolute paths were used as locators, the `locate` capability might behave like so:

    capabilities.locate("./apple.js", "/yummy/orange.js");
    -> "/yummy/apple.js"
    capabilities.locate("fs", "/yummy/orange.js");
    -> "fs"
    capabilities.locate("yucky", "/yummy/orange.js");
    -> "/yummy/node_modules/yucky/yucky.js"
    capabilities.locate("https://yum.my/noodles.js", "/yummy/orange.js");
    -> "https://yum.my/noodles.js"

### capabilities.read(_locator_)
The __read__ capability reads the contents of a file on disk. It is passed the  _locator_ of the file, and returns a Promise which resolves to a Buffer.

It is vital that this function denies access to sensitive files. Otherwise it may be possible for anybody with network access to the WEBL server to read arbitrary files off the disk.

    capabilities.read("/yummy/apple.js");
    -> A Buffer containing JavaScript.
    capabilities.read("/yummy/cinnamon.coffee");
    -> A Buffer containing JavaScript, transpiled from CoffeeScript.
    capabilities.read("/etc/passwd");
    -> Rejected!

### capabilities.mime(_locator_)
The __mime__ capability predicts the MIME type of the Buffer produced by the `read` capability when it called with the _locator_. It returns a string, or `undefined` if access to the file should be denied.

    capabilities.mime("/yummy/apple.js");          // "text/javascript"
    capabilities.mime("/yummy/cinnamon.coffee");   // "text/javascript"
    capabilities.mime("/yummy/spaghetti.jpg");     // "image/jpeg"
    capabilities.mime("/yummy/secret.key");        // undefined

### capabilities.out(_string_)
The __out__ capability is called with a string representation of any arguments passed to `console.log` or bytes written to STDOUT.

### capabilities.err(_string_)
The __err__ capability is called with a string representation of any exceptions which occur outside of evaluation, or of any bytes written to STDERR.

## Dependencies
Replete requires the Acorn JavaScript parser (https://github.com/acornjs/acorn). The Node.js REPL requires Node.js v17 or higher.

## Links
- REPL-driven development in Clojure (Stuart Halloway, 2017) https://vimeo.com/223309989
- Whats makes a REPL (Eric Normand, 2019) https://lispcast.com/what-makes-a-repl/
