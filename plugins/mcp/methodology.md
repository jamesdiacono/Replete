# REPL-driven development

This document describes a methodology for developing JavaScript modules using REPL-driven development. It involves frequent use of [Replete](https://repletejs.org), a text-editor integrated, multi-platform JavaScript REPL, to evaluate expressions, statements, and whole files. This not only provides feedback on the behavior of code as it is written, but also lets us conveniently test modules in total isolation.

Unlike most JavaScript REPLs, Replete supports the evaluation of import statements and other module syntax. This means that, in general, it is possible to evaluate the entire text of compatible JavaScript modules without error on at least one platform (Deno, Node.js, the browser, etc.). For example, user interface components can only be evaluated in the browser, whereas modules that export pure functions can be evaluated in any platform.

## Whole Modules

Due to the runtime semantics of `import.meta.main`, evaluating a module can have a different effect than importing that same module. We take advantage of this duality to embed "demos" inside modules that effectively function as a unit test: these run when `import.meta.main` is `true`, and do not run when it is `false` or `undefined`. This approach is called [Whole Modules](https://james.diacono.com.au/whole_modules.html).

For example:

    function double (number) {
        return 2 * number;
    }

    if (import.meta.main) {
        if (double(3) !== 6) {
            throw new Error("FAIL positive");
        }
        if (double(-2) !== -3) {
            throw new Error("FAIL negative");
        }
    }

    export default Object.freeze(double);

For modules without a user interface aspect, demos are generally a test that produces a pass or a fail result. Failure is indicated by an exception or unhandled Promise rejection, such that if the module was run directly in Deno (`deno run my_module.js`) then the pass/fail result would be encoded in the exit code of the process.

An example of a pure function with a test is [crc32.js](https://repletejs.org/play/crc32.js).

## UI

User interface code must be evaluated in the browser REPL. When Replete is started, it prints the HTTP address of the WEBL (`Waiting for WEBL: http://localhost:9325`), which is essentially a blank canvas that you open in a browser tab. The WEBL's DOM can be manipulated via evaluation, for example evaluating

    document.body.style.background = "fuchsia";

would change the background color.

For user interface components, demos generally render the component with randomized parameters as well as simulated delays and failures. Because demos must run in isolation, they can not rely on any global state (such as global CSS classes) and must import and initialize such functionality explicitly (either in the demo or the component).

UI demos should begin by clearing any residual content from the DOM via a reset such as `document.documentElement.innerHTML = ""`.

An example of a UI component is [split_ui.js](https://repletejs.org/play/split_ui.js). Not all UI code needs to be a component, for example the demo in [pkzip.js](https://repletejs.org/play/pkzip.js).

## Method

When writing a new module, begin with an empty file. Write something concrete, for example

    const boolean = Math.random() < 0.5;

or

    fetch(
        "http://my-api.com"
    ).then(function (response) {
        return response.json();
    }).then(
        console.log
    )

or

    const button = document.createElement("button");
    button.textContent = "Click me";
    button.style.fontSize = "30px";
    document.body.append(button);

and then evaluate it and examine the result (in Replete's output or in the WEBL). Do _not_ write or modify more than a few lines of code between evaluations. Aim for small, safe steps, the aim being to develop a module whose parts have each been well exercised. If you have a tendency to write large amounts of code up front, you must exercise self restraint. Gradually build out the required functionality, creating abstractions (such as parameterized functions) as necessary, and eventually wrap the demo in a conditional and export the relevant interface. The resulting module should follow this pattern:

    IMPLEMENTATION

    if (import.meta.main) {
        DEMO
    }

    export default Object.freeze(INTERFACE);

When modifying an existing module, first run its demo to get a feel for the current and expected behavior.

## Common misunderstandings

In demos, there is no need to catch errors and log them. Leave exceptions and Promise rejections uncaught, thereby failing more loudly.

Demos should never take command line arguments. They are evaluated in Replete, where providing external arguments is not possible.
