# Replete

Replete is an evaluator for JavaScript modules. It enables a highly interactive style of programming called __REPL-driven development__. Replete can evaluate modules in the browser, Node.js and Deno.

When integrated with your text editor, Replete becomes part of your development environment. Source code is sent directly from your editor to Replete, where it is evaluated. Anything from a mere expression to a whole file may be evaluated at a time. The resulting value (or an exception) is reported back for perusal.

![](https://james.diacono.com.au/talks/feedback_and_the_repl/replete.gif)

Replete encourages the development of modules in isolation, rather than in the context of a running application. Modules written in this way tend to be more independent and hence more reusable, more testable and hence more robust.

[Browse the text editor plugins](https://github.com/jamesdiacono/Replete/issues/5).

Replete is in the Public Domain, and does not come with a warranty. It is at least as dangerous as the source code it is asked to import or evaluate, so be careful.

## Files
- _replete.js_: The Replete program. It can be run with either Node.js or Deno. Read this file for instructions on its use.

- _browser_repl.js_, _node_repl.js_, _deno_repl.js_: Modules, each exporting a constructor for a REPL specialized to a particular environment.

- _repl.js_: A module exporting the constructor for the generic REPL. This is the heart of Replete.

- _node_resolve.js_: A module exporting a function that resolve an import specifier to a file in a "node_modules" directory.

- _webl/_: A directory containing source code for the WEBL, used by the browser REPL. The WEBL is a standalone tool for remotely evaluating source code in the browser. See webl/README.md.

- _cmdl/_: A directory containing the source code for the CMDL, like the WEBL but for command-line runtimes like Node.js and Deno. See cmdl/README.md.

- _package.json_: A Node.js package manifest. It declares Replete's dependencies and tells Node to interpret the above files as modules.

- _import_map.json_: An import map declaring Replete's dependencies. It is only used when Deno loads _replete.js_ directly from the network.

## Capabilities
Replete expects to be provided with several __capability__ functions. These provide a rich opportunity to customize Replete. A minimal set of capabilities is defined for you, in the replete.js file. If you do not find them to be lacking, you may skip this section.

Messages are sent to Replete, generally from a text editor. A __message__ is an object containing the following properties:

- __source__: The source code to be evaluated. The source may contain import and export statements.
- __locator__: The locator of the module that contains the source. It is used to resolve the source's imports. More on locators below.
- __scope__: The name of the scope, which can be any string. If undefined, the default scope `""` is chosen. The scope is created if it does not exist.

A __scope__ holds the value of every variable or function declared during evaluation, allowing them to be used in future evaluations. Distinct scopes provide a degree of isolation, however the same global object is shared by all scopes.

The _capabilities_ parameter passed to Replete's constructors is an object with the following methods:

### capabilities.source(_message_)
The __source__ capability extracts the source from a _message_ object, before it is evaluated. The returned Promise resolves to a string containing JavaScript source code.

    capabilities.source({
        source: "Math.random();",
        locator: "file:///yummy/apple.js"
    });
    -> "Math.random();"

    capabilities.source({
        source: "1 < 2 < 3",
        locator: "file:///yummy/cinnamon.coffee"
    });
    -> "(1 < 2 && 2 < 3);"

### capabilities.locate(_specifier_, _parent_locator_)
The __locate__ capability resolves a module specifier. It is passed a _specifier_ string, specifying a module to be located. It may also be passed a _parent_locator_ parameter, which is the locator of the module that contains the specifier. The returned Promise resolves to the locator.

A __specifier__ is the string portion of a module's import statement, for example "../my_module.js".

A __locator__ is a URL string containing sufficient information to locate a file. A locator should begin with `file:///` if it refers to a file on disk, but the structure of the rest of it is completely up to you. If locators for files on disk were structured like `file:///absolute/path/to/file.xyz`, then the `locate` capability might behave like so:

    capabilities.locate("./apple.js", "file:///yummy/orange.js");
    -> "file:///yummy/apple.js"

    capabilities.locate("fs", "file:///yummy/orange.js");
    -> "node:fs"

    capabilities.locate("yucky", "file:///yummy/orange.js");
    -> "file:///yummy/node_modules/yucky/yucky.js"

    capabilities.locate("https://yum.my/noodles.js", "file:///yummy/orange.js");
    -> "https://yum.my/noodles.js"

### capabilities.read(_locator_)
The __read__ capability reads the contents of a file on disk. It is passed the _locator_ of the file, and returns a Promise that resolves to a Buffer.

This function should deny access to sensitive files. Otherwise it may be possible for anybody with network access to the browser REPL to read arbitrary files off the disk.

    capabilities.read("file:///yummy/apple.js");
    -> A Buffer containing JavaScript.

    capabilities.read("file:///yummy/cinnamon.coffee");
    -> A Buffer containing JavaScript, transpiled from CoffeeScript.

    capabilities.read("file:///etc/passwd");
    -> Rejected!

### capabilities.watch(_locator_)
The __watch__ capability detects when a file on disk is modified. It is passed the _locator_ of the file, and returns a Promise that resolves when the file next changes. This does not trigger any visible action. It simply informs Replete that it should drop the file from its cache.

### capabilities.mime(_locator_)
The __mime__ capability predicts the MIME type of the Buffer produced by the `read` capability when it is called with the file _locator_. It returns a string, or `undefined` if access to the file should be denied.

    capabilities.mime("file:///yummy/apple.js");          // "text/javascript"
    capabilities.mime("file:///yummy/cinnamon.coffee");   // "text/javascript"
    capabilities.mime("file:///yummy/spaghetti.jpg");     // "image/jpeg"
    capabilities.mime("file:///yummy/secret.key");        // undefined

### capabilities.out(_string_)
The __out__ capability is called with a string representation of any arguments passed to `console.log` or bytes written to STDOUT.

### capabilities.err(_string_)
The __err__ capability is called with a string representation of any exceptions that occur outside of evaluation, or of any bytes written to STDERR.

## Quotes
> The liquid pencil of this school is replete with a beauty peculiar to itself.
>   — John Constable

> Any mechanism that can decrease the cost of testing and debugging a large program is worth its weight in gold.
>   — Glenford Myers

## Links
- [Feedback and the REPL](https://www.youtube.com/watch?v=A_JrJekP9tQ&t=706s)
- [What makes a REPL?](https://ericnormand.me/podcast/what-makes-a-repl)
