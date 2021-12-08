/*jslint node */

// This file is a Node.js "loader" module, which allows the Node.js padawan to
// import modules via HTTP.

import http from "http";

function resolve(specifier, context, default_resolve) {
    const parent_url = context.parentURL;
    if (specifier.startsWith("http://")) {
        return {url: specifier};
    }
    if (parent_url && parent_url.startsWith("http://")) {
        return {
            url: new URL(specifier, parent_url).href
        };
    }
    return default_resolve(specifier, context, default_resolve);
}

function load(url, context, default_load) {
    if (url.startsWith("http://")) {

// Load the module's source code from the network.

        return new Promise(function (resolve, reject) {
            return http.get(
                url,
                function read_response(res) {
                    let source = "";
                    res.on("data", function (chunk) {
                        source += chunk;
                    });
                    return res.on("end", function () {
                        return resolve({
                            format: "module",
                            source
                        });
                    });
                }
            ).on(
                "error",
                reject
            );
        });
    }
    return default_load(url, context, default_load);
}

export {resolve, load};
