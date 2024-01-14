// The 'fileify' function stores a remote file locally for offline use.

/*jslint deno */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import url from "node:url";

function user_cache_dir() {

// Returns the path to the user's cache directory, a more permanent alternative
// to the system's temporary directory which gets cleaned out every few days.

// Platform | Path                            | Example
// ---------|---------------------------------|---------------------------------
// Linux    | $XDG_CACHE_HOME or $HOME/.cache | /home/me/.cache
// macOS    | $HOME/Library/Caches            | /Users/me/Library/Caches
// Windows  | $LOCALAPPDATA                   | C:\Users\me\AppData\Local

    if (os.platform() === "win32") {
        return process.env.LOCALAPPDATA;
    }
    if (os.platform() === "darwin") {
        return path.join(process.env.HOME, "Library", "Caches");
    }
    return process.env.XDG_CACHE_HOME ?? path.join(process.env.HOME, ".cache");
}

function replete_cache_dir() {
    try {
        return path.join(user_cache_dir(), "replete");
    } catch (ignore) {
        return os.tmpdir();
    }
}

function fileify(http_url, replace_extension) {

// If the URL is already a file URL, we are done.

    if (http_url.protocol === "file:") {
        return Promise.resolve(http_url);
    }

    function versioned_path(vary) {

// Construct a temporary path for the file, based on the HTTP URL.

        const extension = path.extname(http_url.pathname);
        const name = path.basename(http_url.pathname, extension);
        const version = crypto.createHash(
            "md5"
        ).update(
            vary
        ).digest(
            "hex"
        ).slice(0, 8);
        return path.join(
            replete_cache_dir(),
            name + "." + version + (replace_extension ?? extension)
        );
    }

// Check if a cached version of the file is available.

    let file = versioned_path(http_url.href);
    return fs.promises.stat(file).catch(function (ignore) {

// The file is not cached, so download it to the filesystem.

        return fetch(http_url).then(function (response) {
            if (!response.ok) {
                return Promise.reject(
                    new Error("Failed to download '" + http_url.href + "'.")
                );
            }

// Should the file be cached indefinitely? Only if the Cache-Control header
// indicates that the file is immutable.

            const immutable = (
                response.headers.has("cache-control")
                && response.headers.get("cache-control").includes("immutable")
            );
            if (!immutable) {
                file = versioned_path(crypto.randomUUID());
            }
            return response.arrayBuffer();
        }).then(function ensure_directory(array_buffer) {
            return fs.promises.mkdir(
                path.dirname(file),
                {recursive: true, mode: 0o700}
            ).then(function create_file() {
                return fs.promises.writeFile(
                    file,
                    new Uint8Array(array_buffer),
                    {mode: 0o700}
                );
            });
        });
    }).then(function () {
        return url.pathToFileURL(file);
    });
}

export default Object.freeze(fileify);
