"use strict";
const { classifyLdapError, getLdapErrorInfo, createLdapError } = require("./util");

// Client is created via config node to inherit TLS options
// Centralized error handling for LDAP operations
function handleLdapError(node, err, msg, send, done) {
  try {
    const code = typeof err.code === "number" ? err.code : undefined;
    const name = err.name || "Error";
    const raw = err.message || String(err);

    // Classify and build our own error
    const info = getLdapErrorInfo(err);
    const statusText = info.short;
    const customErr = createLdapError(info.code != null ? info.code : 80, info.description || info.short, info.name || name);
    msg.error = {
      name,
      code,
      message: raw,
      short: info.short,
      description: info.description,
    };

    node.status({ fill: "red", shape: "dot", text: statusText });
    // Log custom error (suppress raw ldapts error)
    node.error(customErr, msg);
    send(msg);
    done(customErr);
  } catch (e) {
    // Fallback to ensure the runtime is notified even if formatting fails
    try { node.status({ fill: "red", shape: "dot", text: "error" }); } catch (_) {}
    done(err);
  }
}
module.exports = function (RED) {
  function LdapNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Reference to LDAP config node
    node.ldapConfig = RED.nodes.getNode(config.ldap);

    // Query defaults
    node.base = config.base || "";
    node.filter = config.filter || "(objectClass=*)";
    node.scope = config.scope || "sub"; // base|one|sub
    node.attributes = config.attributes || ""; // comma-separated string

    node.status({});

    function asAttributes(str) {
      if (!str) return undefined;
      if (Array.isArray(str)) return str;
      return String(str)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    node.on("input", async (msg, send, done) => {
      try {
        if (!node.ldapConfig) {
          throw createLdapError(89, "Missing LDAP config reference"); // ParamError
        }

        const base = msg.base || node.base || node.ldapConfig.base;
        const filter = msg.filter || node.filter || "(objectClass=*)";
        const scope = msg.scope || node.scope || "sub";
        const attributes = asAttributes(msg.attributes || node.attributes);

        const bindDN = msg.bindDN || node.ldapConfig.bindDN;
        const bindCredentials = msg.bindCredentials || node.ldapConfig.bindCredentials;

        if (!node.ldapConfig.host) {
          throw createLdapError(89, "LDAP host is not configured"); // ParamError
        }
        if (!base) {
          throw createLdapError(89, "Missing base DN"); // ParamError
        }
        if (scope && !["base", "one", "sub"].includes(scope)) {
          throw createLdapError(89, `Invalid search scope: ${scope}`); // ParamError
        }

        node.status({ fill: "yellow", shape: "ring", text: "connecting" });

        // Create client from config to inherit protocol, port and TLS settings
        const client = node.ldapConfig.createClient();
        try {
          if (bindDN && bindCredentials) {
            await client.bind(bindDN, bindCredentials);
          }

          node.status({ fill: "blue", shape: "dot", text: "searching" });
          const opts = { scope, filter };
          if (attributes) opts.attributes = attributes;

          const { searchEntries } = await client.search(base, opts);
          msg.payload = searchEntries;
          node.status({ fill: "green", shape: "dot", text: `ok (${searchEntries.length})` });
          send(msg);
          done();
        } finally {
          try { await client.unbind(); } catch (e) { /* ignore */ }
        }
      } catch (err) {
        handleLdapError(node, err, msg, send, done);
      }
    });

    node.on("close", (done) => {
      node.status({});
      done();
    });
  }

  RED.nodes.registerType("cappern-ldap", LdapNode);
};
