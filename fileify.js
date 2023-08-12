// The 'fileify' function caches a remote file locally, for offline use.

// Beware! The file is cached for an indefinite period of time, so the remote
// URL should contain versioning information.

/*jslint deno */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

function download_file(remote_url, file_path) {
    return fetch(remote_url).then(function (response) {
        if (!response.ok) {
            throw new Error("Failed to download '" + remote_url.href + "'.");
        }
        return response.arrayBuffer();
    }).then(function (array_buffer) {
        return fs.promises.writeFile(file_path, new Uint8Array(array_buffer));
    });
}

function fileify(http_url, force_extension) {

// If the URL is already a file URL, we are done.

    if (http_url.protocol === "file:") {
        return Promise.resolve(http_url);
    }

// Construct a temporary path, based on the URL.

    const hash = crypto.createHash("md5").update(http_url.href).digest("hex");
    const extension = path.extname(http_url.pathname);
    const name = path.basename(http_url.pathname, extension);
    const file_path = path.join(
        os.tmpdir(),
        name + "." + hash.slice(0, 8) + (force_extension ?? extension)
    );

// Check if the temporary file already exists. If not, fetch it from the
// network. If all goes well, produce the temporary file's URL.

    return fs.promises.stat(file_path).catch(function (ignore) {
        return download_file(http_url, file_path);
    }).then(function () {
        return url.pathToFileURL(file_path);
    });
}

export default Object.freeze(fileify);
