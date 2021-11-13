# Replete

> The liquid pencil of this school is replete with a beauty peculiar to itself.
>   -- John Constable

Replete is an interpreter for JavaScript modules. It enables a highly interactive style of programming known as __REPL-driven development__. Replete can evaluate modules in both Node.js and the browser.

When integrated with a text editor, Replete becomes part of the development environment. Source code is sent from the editor's buffer to Replete, where it is evaluated. Anything from a mere expression to a whole file may be evaluated at a time. The evaluated value (or an exception) is reported back to the text editor for perusal.

This encourages the development of modules in isolation, rather than in the context of a running application. Modules written in this way tend to be more independent and hence more reusable, more testable and hence more robust.

Replete is in the public domain.

## The message
__Messages__ are JSON-encoded objects sent to Replete, from a text editor or similar. A message contains the following properties:

- `source`: The JavaScript source code to be evaluated. The source may contain `import` and `export` statements, but does not have to.
- `locator`: The locator of the module which contains `source`. This property is required only when the source contains `import` statements.

A message may also contain other properties, but Replete ignores these.

## The capabilities
Replete requires that the user provide several __capability__ functions. These offer a rich opportunity to customise the behaviour of Replete. The `capabilities` parameter passed to several of Replete's functions should be an object containing the following properties:

### capabilities.locate(_specifier_, _parent_locator_)
The __locate__ capability is responsible for resolving module specifiers. It is passed a _specifier_ string, which specifies which module is to be located. Usually, it is also passed a _parent_locator_ parameter, which is the locator of the module which contains the specifier. It returns a Promise which resolves to the locator.

A __specifier__ is the string portion of a module's `import` statement, for example "../my_module.js".

A __locator__ is a string containing sufficient information to physically locate a file on disk. If the file is to be accessible from the browser, it must begin with a "/", but otherwise its structure is completely up to you.

Because the example REPL (replete.js) uses absolute paths for locators, we would expect it's `locate` capability to behave like so for a relative specifier:

    capabilities.locate("../chocolate.js", "/food/fruit/orange.js")
    -> "/food/chocolate.js"

### capabilities.read(_locator_)
The __read__ capability is responsible for reading the contents of files. It is passed the  _locator_ of the file to be read, and returns a Promise which resolves to a Buffer.

It is vital that this function denies access to sensitive files. Otherwise it may be possible for anybody with network access to the WEBL server to read arbitrary files off the disk.

### capabilities.transform_file(_buffer_, _locator_)
The __transform_file__ capability is responsible for transforming the contents of a file after it has been read, but before it is evaluated or served. A source file might be compiled to JavaScript, for instance. It takes a _buffer_ parameter, which is the file's contents, and the file's _locator_. It returns a Promise which resolves to a Buffer.

### capabilities.transform(_message_)
The __transform__ capability is responsible for transforming the source code within a message, before it is evaluated. The _message_ parameter is the message object sent to the REPL, and the returned Promise resolves to a string with the transformed source.

### capabilities.import(_locator_, _evaluate_)
The __import__ capability is used by the Node.js REPL to import a module. The module is located using the _locator_ parameter. It returns a Promise which resolves to the module object, structurally identical to that produced by the native `import()` function:

     {
         default,
         my_named_member,
         my_other_named_member
     }

The _evaluate_ parameter is a function which imports the module by reading, compiling and evaluating the source. It takes no parameters, returning a Promise which resolves to the module object.

### capabilities.mime(locator)
The __mime__ capability is used by the browser REPL. It takes a _locator_ and returns the mime type of the file, or undefined if it should not be served.

For example, given a _locator_ ending with ".js", `mime` might return "text/javascript".

## The files
This section contains an overview of Replete's files. Refer to the files themselves for more detailed documentation.

- _replete.js_: A Node.js program that is a minimal Replete REPL. Reading thru the source will illuminate how Replete's components fit together at a high level.

- _browser_repl.js_: A Node.js module exporting the constructor for a browser REPL. It evaluates messages in a browser environment.

- _node_repl.js_: A Node.js module exporting the constructor for a Node.js REPL. It evaluates messages in a Node.js environment.

- _import_module.js_: A Node.js module exporting a function which, using its capabilities, imports a module dynamically.

- _scriptify_module.js_: A module exporting a function which deconstructs the source code of a JavaScript module into a script, its imports and its exports.

- _replize_script.js_: In a REPL, source code is evaluated over and over again in the same execution context. However, some JavaScript statements throw an exception when evaluated multiple times. For example, two `let` declarations using the same name can not be evaluated twice in the same context. The `replize_script` function transforms any offending statements within a script, making it safe for reevaluation.

- _webl/_: A directory containing source code for the WEBL. The WEBL is a standalone tool used internally to evaluate source code in the browser. See webl/README.md for more information.

## Dependencies
The replize_script.js and scriptify_module.js modules depend on JSLint (https://github.com/jamesdiacono/JSLint). Place the jslint.js file in the same directory as this README.

Replete currently supports only the subset of JavaScript which is parseable by JSLint (i.e. the Good Parts). If evaluation of Bad Parts is desired, then the `replize_script.js` and `scriptify_module.js` modules must be rewritten to use a different parser.

## Links
- A demonstration of Replete https://youtu.be/ZXXcn7jLNdk?t=1387
- REPL-driven development in Clojure (Stuart Halloway, 2017) https://vimeo.com/223309989
- Whats makes a REPL (Eric Normand, 2019) https://lispcast.com/what-makes-a-repl/

