# Replete MCP server

A [Model Context Protocol](https://modelcontextprotocol.io/) server for [Replete](https://repletejs.org). It provides LLM agents with tools to evaluate JavaScript in a variety of platforms including Deno, Node.js, and the browser.

The source code for this server is in the Public Domain.

## Warning

Code evaluated in any platform other than the browser (such as Deno) has uninhibited access to the filesystem, network, etc. Allowing your agent to evaluate code using Replete is equivalent to giving it access to your terminal. To ensure agent activity is properly sandboxed, Replete can be configured with only the browser REPL by passing  [`--which_deno=""`](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#optionswhich_deno---which_deno) (assuming Replete is hosted by Deno, as it is by default).

## Installation

Install [Deno](https://deno.com) then configure the MCP server to start with this command:

    deno run --allow-all https://repletejs.org/src/latest/plugins/mcp/server.js [debug_path]

An MCP configuration file might look something like this:

    {
        "mcpServers": {
            "replete": {
                "command": "deno",
                "args": [
                    "run",
                    "--allow-all",
                    "https://repletejs.org/src/latest/plugins/mcp/server.js"
                ]
            }
        }
    }

MCP messages are read from stdin and written to stdout. Optionally, a debug log with all message traffic between the agent, the server, and Replete can be written. If you have problems, try running the server with the [MCP inspector](https://modelcontextprotocol.io/legacy/tools/inspector).

It is possible to configure the MCP server with its own Replete command by specifying the `plugins.mcp.command` array in replete.json. This can avoid port conflicts between different Replete processes.

    {
        "command": [
            ...
            "--browser_port=9325",
            ...
        ],
        "plugins": {
            "mcp": {
                "command": [
                    ...
                    "--browser_port=0",
                    ...
                ]
            }
        }
    }

Configuration of Replete is described [here](https://github.com/jamesdiacono/Replete?tab=readme-ov-file#configuration).
