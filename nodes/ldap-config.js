"use strict";

const { Client } = require("ldapts");

module.exports = function (RED) {
  function LdapConfigNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.host = config.host;
    node.port = config.port || (config.protocol === "ldaps" ? 636 : 389);
    node.protocol = config.protocol || "ldap"; // ldap | ldaps
    node.base = config.base || "";
    node.tlsInsecure = !!config.tlsInsecure;

    const creds = node.credentials || {};
    node.bindDN = creds.bindDN;
    node.bindCredentials = creds.bindCredentials;
    node.ca = creds.ca; // PEM string of one or more CAs

    node.getUrl = function () {
      return `${node.protocol}://${node.host}:${node.port}`;
    };

    // Lazy client creation per request to avoid long-lived sockets without pooling.
    node.createClient = function () {
      const options = { url: node.getUrl() };
      if (node.protocol === "ldaps") {
        options.tlsOptions = {
          // When insecure is true, disable verification entirely
          rejectUnauthorized: !node.tlsInsecure,
          // Ensure SNI uses the configured host
          servername: node.host,
        };
        if (node.ca && String(node.ca).trim()) {
          // Pass PEM as-is; Node can parse multiple certs in one string
          options.tlsOptions.ca = node.ca;
        }
      }
      return new Client(options);
    };

    node.on("close", (done) => {
      done();
    });
  }

  RED.nodes.registerType("cappern-ldap-config", LdapConfigNode, {
    credentials: {
      bindDN: { type: "text" },
      bindCredentials: { type: "password" },
      ca: { type: "text" }
    }
  });
};
