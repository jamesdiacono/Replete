// This file is a Node.js "loader" module, allowing a Node.js process to import
// modules via HTTP.

// Unlike the --experimental-network-imports flag, this loader permits modules
// imported over the network to import built-in modules such as "node:fs".

/*jslint node */

const rx_http = /^https?:\/\//;

function resolve(specifier, context, next_resolve) {
    if (rx_http.test(specifier)) {
        return {
            url: specifier,
            shortCircuit: true
        };
    }
    if (context.parentURL && rx_http.test(context.parentURL)) {
        return {
            url: new URL(specifier, context.parentURL).href,
            shortCircuit: true
        };
    }
    return next_resolve(specifier, context);
}

function load(url, context, next_load) {
    if (rx_http.test(url)) {

// Load the module's source code from the network.

        return fetch(url).then(function (response) {
            if (!response.ok) {
                throw new Error("Failed to load " + url + ".");
            }
            return response.text();
        }).then(function (source) {
            return {
                format: "module",
                source,
                shortCircuit: true
            };
        });
    }
    return next_load(url, context);
}

export {resolve, load};
