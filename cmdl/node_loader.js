/*jslint node */

// This file is a Node.js "loader" module, which allows the Node.js padawan to
// import modules via HTTP.

import http from "http";
import https from "https";

const rx_http = /^https?:\/\//;

function resolve(specifier, context, default_resolve) {
    const parent_url = context.parentURL;
    if (rx_http.test(specifier)) {
        return {url: specifier};
    }
    if (parent_url && rx_http.test(parent_url)) {
        return {
            url: new URL(specifier, parent_url).href
        };
    }
    return default_resolve(specifier, context, default_resolve);
}

function load(url, context, default_load) {
    if (rx_http.test(url)) {

// Load the module's source code from the network.

        const http_module = (
            url.startsWith("https:")
            ? https
            : http
        );
        return new Promise(function (resolve, reject) {
            return http_module.get(
                url,
                function read_response(res) {
                    if (res.statusCode !== 200) {
                        return reject(new Error("Failed to load module."));
                    }
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
