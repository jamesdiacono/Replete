// Attempts to resolves a specifier string to a file in "node_modules".

/*jslint node */

import fs from "node:fs";
import url from "node:url";

function unwrap_export(value) {

// A conditional export is an object whose properties are branches. A property
// value can be yet another conditional. This function unwraps any nested
// conditionals, returning a string.

    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        return unwrap_export(value[0]);
    }
    if (value) {
        return unwrap_export(value.import || value.module || value.default);
    }
}

function glob_map(string, mappings) {

// Match a string against an object of glob-style mappings. If a match is found,
// the transformed string is returned. Otherwise the return value is undefined.

// For example, the mappings

//  {
//      "./*.js": "./dist/*.mjs",
//      "./assets/*": "./dist/assets/*"
//  }

// will transform the string "./apple/orange.js" into "./dist/apple/orange.mjs",
// and "./assets/image.png" into "./dist/assets/image.png".

    let result;
    if (Object.entries(mappings).some(function ([from, to]) {
        const [from_prefix, from_suffix] = from.split("*");
        if (
            from_suffix !== undefined
            && string.startsWith(from_prefix)
            && string.endsWith(from_suffix)
        ) {
            const filling = string.slice(from_prefix.length, (
                from_suffix.length > 0
                ? -from_suffix.length
                : undefined
            ));
            const [to_prefix, to_suffix] = to.split("*");
            if (to_suffix !== undefined) {
                result = to_prefix + filling + to_suffix;
                return true;
            }
        }
        return false;
    })) {
        return result;
    }
}

function internalize(external, manifest) {
    const {exports, main, module} = manifest;
    if (exports !== undefined) {
        return (
            external === "."
            ? unwrap_export(exports["."] ?? exports)
            : unwrap_export(exports[external]) ?? glob_map(external, exports)
        );
    }
    return (
        external === "."
        ? module ?? main ?? "./index.js"
        : external
    );
}

function find_manifest(package_name, from_url) {
    const manifest_url = new URL(
        "node_modules/" + package_name + "/package.json",
        from_url
    );
    return fs.promises.readFile(manifest_url, "utf8").then(function (json) {
        return [JSON.parse(json), manifest_url];
    }).catch(function (ignore) {

// The manifest could not be read. Try searching the parent directory, unless we
// are at the root of the filesystem.

        const parent_url = new URL("../", from_url);
        return (
            parent_url.href === from_url.href
            ? Promise.resolve([])
            : find_manifest(package_name, parent_url)
        );
    });
}

function node_resolve(specifier, parent_locator) {

// Parse the specifier.

    const parts = specifier.split("/");
    const package_name = (
        parts[0].startsWith("@")
        ? parts[0] + "/" + parts[1]
        : parts[0]
    );
    const external = "." + specifier.replace(package_name, "");

// Find the package's package.json.

    function fail(message) {
        return Promise.reject(new Error(
            "Failed to resolve '" + specifier + "' from "
            + parent_locator + ". " + message
        ));
    }

    return find_manifest(
        package_name,
        new URL(parent_locator)
    ).then(function ([manifest, manifest_url]) {
        if (manifest === undefined) {
            return fail("Package '" + package_name + "' not found.");
        }
        const internal = internalize(external, manifest);
        if (internal === undefined) {
            return fail("Not exported.");
        }

// Join the internal path to the manifest URL to to get the file's URL.

        const file_url = new URL(internal, manifest_url);

// A given module should be instantiated at most once, so it is important to
// ensure that the file URL is canonical. To this aim, we attempt to resolve
// the file's "real" URL by following any symlinks.

        return fs.promises.realpath(
            file_url
        ).then(function (real_path) {
            return url.pathToFileURL(real_path).href;
        }).catch(function (ignore) {
            return file_url.href;
        });
    });
}

export default Object.freeze(node_resolve);
