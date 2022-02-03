// This Web Worker maintains a WebSocket connection between the client and the
// server, attempting to reconnect indefinitely if it is severed.

// The reason we maintain the connection via a Web Worker is that workers have
// their own processing loop. This means that reconnection may occur even if the
// window's processing loop is blocked, as it often is by a breakpoint in a
// padawan. This helps avoid accidentally launching duplicate WEBL clients
// following a server restart.

// If this worker receives a string message, it is taken to be a WebSocket URL
// to connect to. Any other message is JSON encoded and sent to the server.

// When the status of the connection changes, this worker sends a boolean value.
// Any other value is a message from the server.

/*jslint browser */
/*global self */

let socket;
function connect_to_server(url) {
    socket = new WebSocket(url);
    socket.onopen = function () {

// Inform the master that the connection is open.

        self.postMessage(true);
    };
    socket.onclose = function () {

// Inform the master that the connection is closed. Then attempt to restore it.

        self.postMessage(false);
        return setTimeout(connect_to_server, 250, url);
    };
    socket.onmessage = function (event) {
        self.postMessage(JSON.parse(event.data));
    };
}
self.onmessage = function (event) {
    if (typeof event.data === "string") {

// The initial event contains the address of the WebSocket server.

        return connect_to_server(event.data);
    }
    return socket.send(JSON.stringify(event.data));
};
