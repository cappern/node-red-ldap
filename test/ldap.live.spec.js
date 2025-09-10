"use strict";

// Optional live LDAPS integration test for developers.
// This test is skipped unless LDAP_LIVE is set in the environment.
//
// Required env for most setups:
// - LDAP_LIVE=1                 Enable this test
// - LDAP_URL=ldaps://host:636   Or use LDAP_HOST/LDAP_PORT/LDAP_PROTOCOL
// - LDAP_BASE=dc=example,dc=com Base DN to search
// Optional:
// - LDAP_BIND_DN                Bind DN for authentication
// - LDAP_BIND_PW                Bind password
// - LDAP_FILTER=(objectClass=*) Filter to search with
// - LDAP_TLS_INSECURE=1         Disable TLS verification (insecure)
// - LDAP_CA_PATH=/path/to/ca.pem  Provide CA bundle from a file
// - LDAP_CA_PEM="...PEM..."       Provide CA bundle inline

const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const helper = require("node-red-node-test-helper");

// Optionally load environment variables from .env if dotenv is available
try {
  // eslint-disable-next-line global-require
  require("dotenv").config();
} catch (_) {
  // dotenv not installed; ignore and rely on process.env
}

const ldapNode = require(path.join("..", "nodes", "ldap.js"));
const ldapConfigNode = require(path.join("..", "nodes", "ldap-config.js"));

helper.init(require.resolve("node-red"));

const runLive = !!process.env.LDAP_LIVE;
const d = runLive ? describe : describe.skip;

d("live ldaps", function () {
  this.timeout(20000);

  before(function (done) {
    helper.startServer(done);
  });

  after(function (done) {
    helper.stopServer(done);
  });

  afterEach(function () {
    helper.unload();
  });

  it("connects and performs a live search", function (done) {
    // Prefer LDAP_URL if provided, else fall back to parts.
    let host, port, protocol;
    const url = process.env.LDAP_URL;
    if (url) {
      try {
        const u = new URL(url);
        protocol = (u.protocol || "ldaps:").replace(":", "");
        host = u.hostname;
        port = u.port ? Number(u.port) : (protocol === "ldaps" ? 636 : 389);
      } catch (e) {
        return done(new Error(`Invalid LDAP_URL: ${url}`));
      }
    } else {
      host = process.env.LDAP_HOST;
      port = process.env.LDAP_PORT ? Number(process.env.LDAP_PORT) : 636;
      protocol = process.env.LDAP_PROTOCOL || "ldaps";
    }

    const base = process.env.LDAP_BASE;
    if (!host || !base) {
      return done(new Error("LDAP_HOST/LDAP_URL and LDAP_BASE must be provided when LDAP_LIVE=1"));
    }

    const tlsInsecure = ["1", "true", "yes"].includes(String(process.env.LDAP_TLS_INSECURE || "").toLowerCase());
    const filter = process.env.LDAP_FILTER || "(objectClass=*)";

    let caPem;
    const caPath = process.env.LDAP_CA_PATH;
    const caInline = process.env.LDAP_CA_PEM;
    if (caInline && String(caInline).trim()) {
      caPem = caInline;
    } else if (caPath && String(caPath).trim()) {
      try {
        caPem = fs.readFileSync(caPath, "utf8");
      } catch (e) {
        return done(new Error(`Failed to read LDAP_CA_PATH: ${e.message}`));
      }
    }

    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host, protocol, port, base, tlsInsecure },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    const creds = {};
    creds["cfg1"] = {};
    if (process.env.LDAP_BIND_DN) creds["cfg1"].bindDN = process.env.LDAP_BIND_DN;
    if (process.env.LDAP_BIND_PW) creds["cfg1"].bindCredentials = process.env.LDAP_BIND_PW;
    if (caPem) creds["cfg1"].ca = caPem;

    helper.load([ldapConfigNode, ldapNode], flow, creds, async () => {
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      // Optional: observe statuses for debugging during live runs
      n1.on("status", (s) => {
        if (["1", "true", "yes"].includes(String(process.env.LDAP_LIVE_DEBUG || "").toLowerCase())) {
          // eslint-disable-next-line no-console
          console.log("[live ldaps] status:", s);
        }
      });

      h1.on("input", (msg) => {
        try {
          if (msg.error) {
            return done(new Error(`LDAP error: ${msg.error.short || msg.error.message || "unknown"}`));
          }
          expect(msg).to.have.property("payload");
          expect(msg.payload).to.be.an("array");
          if (["1", "true", "yes"].includes(String(process.env.LDAP_LIVE_DEBUG || "").toLowerCase())) {
            const first = msg.payload && msg.payload[0];
            // eslint-disable-next-line no-console
            console.log("[live ldaps] entries:", msg.payload.length, first ? Object.keys(first) : []);
          }
          done();
        } catch (e) {
          done(e);
        }
      });

      n1.receive({ filter });
    });
  });
});
