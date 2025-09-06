# Replete MCP server

A [Model Context Protocol](https://modelcontextprotocol.io/) server for [Replete](https://repletejs.org). It provides LLMs with tools to evaluate JavaScript in a variety of platforms including Deno, Node.js, and the browser.

The source code for this server is in the Public Domain.

## Warning

Code evaluated in any platform other than the browser (such as Deno) has uninhibited access to the filesystem, network, etc. Allowing your LLM to evaluate code using Replete is equivalent to giving it access to your terminal. To ensure LLM activity is properly sandboxed, Replete can be configured with only the browser REPL by passing  [`--which_deno=""`](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#optionswhich_deno---which_deno) (assuming Replete is hosted by Deno, as it is by default).

## Installation

Install [Deno](https://deno.com) then configure your editor to start the MCP server using this command:

    deno run --allow-all https://deno.land/x/replete/plugins/mcp/server.js

MCP messages are read from stdin and written to stdout.

To configure the Cursor editor, for example, go to Settings -> Cursor Settings -> MCP & Integrations -> New MCP Server and paste the following:

    {
        "mcpServers": {
            "replete": {
                "command": "deno",
                "args": [
                    "run",
                    "--allow-all",
                    "https://deno.land/x/replete/plugins/mcp/server.js"
                ]
            }
        }
    }

If you have problems, try running the server with the
[MCP inspector](https://modelcontextprotocol.io/legacy/tools/inspector).

## Usage

Tools provided include _restart_, _stop_, _evaluate_, and _output_.

The _restart_ tool starts Replete, or restarts it if it is already running. It takes a `cwd` parameter, which is the absolute path to your project's root directory. This is where the server will look for a _replete.json_ file (see below).

The _stop_ tool stops Replete.

The _evaluate_ tool evaluates code and reports the result, providing Replete is running. It takes the following parameters:

- `source`: the source code to be evaluated (required)
- `platform`: one of `"browser"`, `"deno"`,`"node"`, etc. (required)
- `locator`: the `file://` URL of the file containing the source (required only if the source contains relative imports)

The _output_ tool reports any logs and errors that have occurred since the last call to _output_ or _evaluate_. When evaluated code is expected to run over many turns, this tool must be called to discover the result.

When evaluating code in the browser, you may need your LLM to observe and interact with the page. This can be accomplished by installing the [Playwright MCP server](https://github.com/microsoft/playwright-mcp) or similar and using it to navigate to and interact with the WEBL.

Configuration of Replete is described [here](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#configuration).
