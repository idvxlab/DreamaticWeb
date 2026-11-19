// Test-only preload. Production never imports this file.
import net from "node:net";
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const options =
    typeof first === "object"
      ? first
      : {
          port: first,
          host: typeof normalized[1] === "string" ? normalized[1] : "localhost",
        };
  if (
    !options.path &&
    !["127.0.0.1", "::1", "[::1]", "localhost"].includes(
      options.host || "localhost",
    )
  )
    throw new Error("OFFLINE_TEST: external network blocked");
  return connect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!["127.0.0.1", "::1", "[::1]", "localhost"].includes(url.hostname))
    throw new Error("OFFLINE_TEST: external fetch blocked");
  return originalFetch(input, options);
};
