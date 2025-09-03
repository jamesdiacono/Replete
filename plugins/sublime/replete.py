import os
import threading
import sublime
import sublime_plugin
import subprocess
import queue
import json
import uuid
import pathlib

running_repls = []

def merge_dicts(*dicts):
    merged = {}
    for the_dict in dicts:
        merged.update(the_dict)
    return merged

def load_replete_json(cwd):
    if cwd is not None:
        try:
            with open(os.path.join(cwd, "replete.json")) as file:
                return json.load(file)
        except:
            return {}
    return {}

def load_settings():
    try:
        return sublime.load_settings("Replete.sublime-settings").to_dict()
    except:
        return {}

class REPL(object):

# A 'REPL' represents an instance of Replete. Each REPL has a dedicated view
# that holds its textual output.

    def __init__(self, view):
        self.view = view
        self.id = uuid.uuid4().hex
        view.settings().set("repl_id", self.id)
        cwd = view.settings().get("repl_cwd")

# Start the Replete process. STDERR is piped to STDOUT for easy access, and we
# configure the input and output streams to deal in lines of text.

        self.popen = subprocess.Popen(
            merge_dicts(load_settings(), load_replete_json(cwd))["command"],
            cwd=cwd,
            stderr=subprocess.STDOUT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            bufsize=1, # buffer by line
            universal_newlines=True,
            text=True,

# Extend the environment with NO_COLOR=1 to prevent Deno coloring its output,
# then merge in any overrides from the settings.

            env=merge_dicts(
                os.environ,
                {"NO_COLOR": "1"},
                load_settings().get("env", {}),
                load_replete_json(cwd).get("env", {})
            ),
            creationflags=(
                subprocess.CREATE_NO_WINDOW # only on Windows
                if hasattr(subprocess, "CREATE_NO_WINDOW")
                else 0
            )
        )

# Result messages are processed as they arrive. We use a thread as a worker,
# which places each line of STDOUT it receives into a queue. We monitor the
# queue via Sublime's event loop.

        results_queue = queue.Queue()
        def read_results():
            for line in self.popen.stdout:
                results_queue.put(line)
        reader = threading.Thread(target=read_results, daemon=True)
        reader.start()
        def check_queue():
            try:
                while True:
                    line = results_queue.get_nowait()
                    try:

# Usually, each line is a JSON-encoded message object. If Replete crashes,
# however, the line may contain arbitrary error information.

                        message = json.loads(line)
                    except:
                        message = {"err": line}
                    view.run_command("replete_receive", {"message": message})
            except queue.Empty:
                sublime.set_timeout(check_queue, 100)
        check_queue()

    def stop(self):
        self.popen.terminate()

    def send_command(self, message):
        self.popen.stdin.write(json.dumps(message) + "\n")
        self.popen.stdin.flush()

def find_repl(view):

# The 'find_repl' function returns the REPL associated with the 'view', if any.

    for repl in running_repls:
        if repl.id == view.settings().get("repl_id"):
            return repl

def find_repl_view(window):

# The 'find_repl_view' function returns the view from the 'window' that is
# (or was) associated with a REPL.

    for view in window.views():
        if view.settings().get("repl_id") is not None:
            return view

class RepleteCommand(sublime_plugin.TextCommand):

# Starts a REPL in the current window. If a REPL already exists, it is
# restarted.

    def run(self, edit):
        view = find_repl_view(self.view.window())
        if view is not None:

# There is already a REPL for in this window. Restart it, keeping its view
# intact.

            repl = find_repl(view)
            if repl is not None:
                repl.stop()
                running_repls.remove(repl)
            running_repls.append(REPL(view))
            view.insert(edit, view.size(), "REPL restarted.\n")
            return

# Infer the current working directory from the root folder opened in the current
# window.

        cwd = None
        file_name = self.view.file_name()
        if file_name is not None:
            cwd = os.path.dirname(file_name)
        window = self.view.window()
        if len(window.folders()) > 0:
            cwd = window.folders()[0]

# Create a new view to hold the REPL's output.

        view = window.new_file()
        view.set_scratch(True)
        view.set_name("[Replete]")
        view.settings().set("repl_cwd", cwd)
        view.settings().set("spell_check", False)
        view.settings().set("line_numbers", False)
        view.settings().set("gutter", False)

# Start the REPL process and attach it to the view.

        running_repls.append(REPL(view))

# Move the REPL view to the next group.

        (group, index) = window.get_view_index(view)
        window.set_view_index(view, group + 1, 0)

# Return focus to the non-REPL view.

        window.focus_view(self.view)

class RepleteClearCommand(sublime_plugin.TextCommand):

# Empties the output views of all the REPLs.

    def run(self, edit):
        view = find_repl_view(self.view.window())
        if view is not None:
            view.run_command("select_all")
            view.run_command("right_delete")

class RepleteSendCommand(sublime_plugin.TextCommand):

# Sends a command message to Replete.

    def run(
        self,
        edit,
        platform,
        color="region.yellowish",
        **additional_properties
    ):

# Expand each selected region to fill the line. This is generally more useful
# than evaluating nothing.

        regions = [
            (
                self.view.expand_by_class(
                    region,
                    sublime.CLASS_LINE_START | sublime.CLASS_LINE_END
                )
                if len(region) == 0
                else region
            )
            for region
            in self.view.sel()
        ]

# Construct a command message containing the selected source code.

        message = {
            "source": "\n".join([
                self.view.substr(region)
                for region
                in regions
            ]),
            "platform": platform,
            "scope": str(self.view.id())
        }
        if self.view.file_name() != None:
            message["locator"] = pathlib.Path(self.view.file_name()).as_uri()

# Key bindings specified by the user may augment the message with arbitrary
# properties. Because these properties will be available to Replete's "source"
# capability, they can be used to dictate how the source is interpreted.

        for name, value in additional_properties.items():
            message[name] = value

# Send the command to the window's REPL, if one can be found.

        view = find_repl_view(self.view.window())
        if view is None:
            return
        try:
            find_repl(view).send_command(message)
        except:
            view.insert(edit, view.size(), "REPL not running.\n")
            view.show(view.size())

# Momentarily highlight the evaluated regions in the view. This is a nice touch.

        key = uuid.uuid4().hex
        self.view.add_regions(key, regions, color)
        sublime.set_timeout(
            lambda: self.view.erase_regions(key),
            300
        )

class RepleteReceiveCommand(sublime_plugin.TextCommand):

# Displays a result message from Replete. Implemented as a TextCommand because
# we require an 'edit' token to modify the text of the output view.

    def run(self, edit, message):
        string = (
            message.get("out")
            or message.get("err")
            or message.get("evaluation")
            or message.get("exception")
        )

# The following types of messages do supply a trailing newline, so we add one.

        if "evaluation" in message or "exception" in message:
            string += "\n"

# Append the output string to the view, for perusal.

        self.view.insert(edit, self.view.size(), string)
        self.view.show(self.view.size())

class RepleteViewListener(sublime_plugin.EventListener):

# When a REPL's view is closed, the corresponding Replete instance is stopped.

    def on_close(self, view):
        repl = find_repl(view)
        if repl:
            repl.stop()
            running_repls.remove(repl)

def plugin_unloaded():

# The 'plugin_unloaded' function is called when this file is about to be
# reloaded on-the-fly. Let's not orphan our subprocesses!

    for repl in running_repls:
        repl.stop()
