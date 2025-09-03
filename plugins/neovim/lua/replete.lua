local json = require "json"

local function split(text)

-- Splits the 'text' string at its first linebreak, returning the two resulting
-- strings. If the 'text' did not contain a linebreak, the second return value
-- will be nil.

    local start_nr, end_nr = text:find("[\r\n]+")
    if start_nr == nil then
        return text
    end
    return text:sub(0, start_nr - 1), text:sub(end_nr + 1)
end

local output_buffer
local function append(text)

-- Write the 'text' string to end of the output buffer.

    local trailing = vim.api.nvim_buf_get_lines(output_buffer, -2, -1, true)[1]
    local line, rest = split(text)
    if rest == nil then

-- The text contains a single line. Append it to the last line in the buffer.

        vim.api.nvim_buf_set_lines(
            output_buffer,
            -2,
            -1,
            true,
            {trailing .. line}
        )

-- Scroll the bottom of the output buffer into view.

        return vim.api.nvim_buf_call(
            output_buffer,
            function ()
                vim.cmd("normal G")
            end
        )
    end

-- The text contains at least a whole line. Append this line to the last
-- line in the buffer, followed by an empty line.

    vim.api.nvim_buf_set_lines(
        output_buffer,
        -2,
        -1,
        true,
        {trailing .. line, ""}
    )

-- Then append the rest of the lines.

    return append(rest)
end

local function consume(text)

-- Process any messages in the 'text' string, returning the leftovers.

    local line, rest = split(text)
    if rest == nil then

-- If the text does not contain a linebreak, then it does not yet contain a
-- whole message. Return the leftover string.

        return text
    end

-- Parse the line into a message.

    local message = json.decode(line)

-- The message will contain one of the following keys. The last two do not come
-- with a trailing newline, so we supply one.

    if message["out"] ~= nil then
        append(message["out"])
    elseif message["err"] ~= nil then
        append(message["err"])
    elseif message["evaluation"] ~= nil then
        append(message["evaluation"] .. "\n")
    elseif message["exception"] ~= nil then
        append(message["exception"] .. "\n")
    end

-- Consume any other messages in the text.

    return consume(rest)
end

local replete
local function stop()

-- Stops Replete and closes its window.

    if output_buffer == nil then
        return
    end
    if replete ~= nil then
        replete:kill(15) -- SIGTERM
    end

-- Close the output buffer and its window.

    vim.api.nvim_buf_call(
        output_buffer,
        function ()
            vim.cmd("bdelete")
        end
    )
    output_buffer = nil
end

local output_window
local path_separator = package.config:sub(1,1)
local stdin
local remnant = ""
local function start()

-- Starts (or restarts) Replete.

    stop()

-- Split the window, creating a scratch buffer to the right of the current
-- buffer. This buffer will display Replete's output as it arrives.

    vim.cmd("vsplit")
    output_buffer = vim.api.nvim_create_buf(true, true)
    local windows = vim.api.nvim_list_wins()
    output_window = windows[#windows]
    vim.api.nvim_win_set_buf(output_window, output_buffer)

-- Read the project-specific configuration file.

    local path = vim.fn.getcwd() .. path_separator .. "replete.json"
    local file = io.open(path, "r")
    local command
    if file then
        local content = file:read("*a")
        command = json.decode(content).command
        file:close()
    end

-- Start the Replete process.

    local stdout = vim.loop.new_pipe()
    local stderr = vim.loop.new_pipe()
    stdin = vim.loop.new_pipe()
    local function destroy()
        stdin:close()
        stdout:close()
        stderr:close()
        if replete ~= nil then
            replete:close()
        end
    end
    local command_array = command or vim.g.replete_command or {
        "deno",
        "run",
        "--allow-all",
        "--importmap",
        "https://deno.land/x/replete/import_map.json",
        "https://deno.land/x/replete/replete.js",
        "--browser_port=9325",
        "--content_type=js:text/javascript",
        "--content_type=mjs:text/javascript",
        "--content_type=css:text/css",
        "--content_type=html:text/html; charset=utf-8",
        "--content_type=wasm:application/wasm",
        "--content_type=woff2:font/woff2",
        "--content_type=svg:image/svg+xml",
        "--content_type=png:image/png",
        "--content_type=webp:image/webp"
    }
    local cmd = command_array[1]
    local args = {unpack(command_array, 2)}
    replete = vim.loop.spawn(
        cmd,
        {
            args = args,
            stdio = {stdin, stdout, stderr},
            cwd = vim.g.replete_cwd
        },
        destroy
    )
    if replete == nil then
        append("Failed to start " .. cmd .. ".")
        return destroy()
    end

-- Listen for Replete's result messages on STDOUT. Each line is a JSON-encoded
-- message. A nil chunk indicates the end of the stream.

    stdout:read_start(vim.schedule_wrap(
        function (error, chunk)
            if error ~= nil then
                return append(error)
            end
            if chunk ~= nil then

-- When a chunk of text arrives from Replete's STDOUT, it is appended to any
-- remnant characters which arrived after the last message. If the resulting
-- string contains any messages, they are removed and processed. Any leftovers
-- become the new remnant.

                remnant = consume(remnant .. chunk)
            end
        end
    ))

-- Listen for any problems with Replete itself on STDERR.

    stderr:read_start(vim.schedule_wrap(
        function (ignore, chunk)
            if chunk ~= nil then
                append(chunk)
            end
        end
    ))
end

local function eval_selection(platform)

-- Evaluate the currently selected source code of the active buffer on the
-- specified 'platform'.

    if output_buffer == nil then
        return
    end

-- Recover the visual selection (gv), and yank it to the 'a' register ("ay).

    vim.cmd("normal! gv\"ay")

-- Send a command message to the Replete process.

    local buffer = vim.api.nvim_get_current_buf()

-- Determine the locator, which is a file URL.

    local locator = (
        "file://"
        .. vim.api.nvim_buf_get_name(
            buffer
        ):gsub(

-- Convert Windows-style path delimiters.

            "\\",
            "/"
        ):gsub(

-- Ensure a leading slash in the filename.

            "^/?",
            "/"
        )
    )
    stdin:write(
        json.encode({
            source = vim.fn.getreg("a"),
            locator = locator,
            platform = platform,
            scope = tostring(buffer)
        })
        .. "\n"
    )
end

local function toggle()
    if output_buffer == nil then
        start()
    else
        stop()
    end
end

return {
    start = start,
    stop = stop,
    toggle = toggle,
    eval = eval_selection
}
