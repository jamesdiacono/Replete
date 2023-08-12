// The 'fileify' function stores a remote file locally for offline use.

/*jslint deno */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

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
            os.tmpdir(),
            name + "." + version + (replace_extension ?? extension)
        );
    }

// Check if a cached version of the file is available.

    let tmp = versioned_path(http_url.href);
    return fs.promises.stat(tmp).catch(function (ignore) {

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
                tmp = versioned_path(crypto.randomUUID());
            }
            return response.arrayBuffer();
        }).then(function (array_buffer) {
            return fs.promises.writeFile(tmp, new Uint8Array(array_buffer));
        });
    }).then(function () {
        return url.pathToFileURL(tmp);
    });
}

export default Object.freeze(fileify);
