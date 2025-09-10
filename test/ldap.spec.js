"use strict";

const path = require("path");
const { expect } = require("chai");
const helper = require("node-red-node-test-helper");

const ldapNode = require(path.join("..", "nodes", "ldap.js"));
const ldapConfigNode = require(path.join("..", "nodes", "ldap-config.js"));

helper.init(require.resolve("node-red"));

describe("ldap node", function () {
  before(function (done) {
    helper.startServer(done);
  });

  after(function (done) {
    helper.stopServer(done);
  });

  afterEach(function () {
    helper.unload();
  });

  it("loads the node", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1" }
    ];
    helper.load([ldapConfigNode, ldapNode], flow, () => {
      const n1 = helper.getNode("n1");
      expect(n1).to.exist;
      done();
    });
  });

  it("performs a search and outputs entries", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      // Capture status changes (not asserted to avoid runtime differences)
      n1.on("status", () => {});

      // Mock client implementation
      const entries = [{ cn: "Alice" }, { cn: "Bob" }];
      const mockClient = {
        bind: async () => {},
        search: async (base, opts) => {
          expect(base).to.equal("dc=example,dc=com");
          expect(opts).to.include({ scope: "sub" });
          return { searchEntries: entries };
        },
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", (msg) => {
        try {
          expect(msg).to.have.property("payload");
          expect(msg.payload).to.be.an("array").with.lengthOf(2);
          done();
        } catch (e) {
          done(e);
        }
      });

      n1.receive({});
    });
  });

  it("emits error when base DN is missing", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      cfg.createClient = () => ({
        bind: async () => {},
        search: async () => ({ searchEntries: [] }),
        unbind: async () => {}
      });

      h1.on("input", (msg) => {
        try {
          expect(msg).to.have.property("error");
          expect(msg.error).to.have.property("message").that.matches(/Missing base DN/);
          done();
        } catch (e) {
          done(e);
        }
      });

      n1.receive({});
    });
  });

  it("maps invalid credentials to friendly status", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com",
        credentials: { bindDN: "cn=admin", bindCredentials: "secret" } },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    // supply credentials via helper.load's credentials object
    const credentials = { cfg1: { bindDN: "cn=admin", bindCredentials: "secret" } };

    helper.load([ldapConfigNode, ldapNode], flow, credentials, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      n1.on("status", () => {});

      const mockClient = {
        bind: async () => {
          const err = new Error("Invalid credentials");
          err.code = 49; // LDAP invalid credentials
          err.name = "InvalidCredentialsError";
          throw err;
        },
        search: async () => { throw new Error("should not search"); },
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", (msg) => {
        try {
          expect(msg).to.have.property("error");
          expect(msg.error).to.include({ name: "InvalidCredentialsError", code: 49 });
          done();
        } catch (e) {
          done(e);
        }
      });

      n1.receive({});
    });
  });

  it("applies message overrides and parses attributes", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      const mockClient = {
        bind: async () => {},
        search: async (base, opts) => {
          expect(base).to.equal("ou=people,dc=example,dc=com");
          expect(opts).to.include({ scope: "one", filter: "(cn=Alice*)" });
          expect(opts.attributes).to.deep.equal(["cn", "mail"]);
          return { searchEntries: [{ cn: "Alice", mail: "a@example.com" }] };
        },
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", (msg) => {
        try {
          expect(msg.payload).to.be.an("array").with.lengthOf(1);
          done();
        } catch (e) {
          done(e);
        }
      });

      n1.receive({ base: "ou=people,dc=example,dc=com", filter: "(cn=Alice*)", scope: "one", attributes: "cn, mail" });
    });
  });

  it("rejects invalid scope with param error", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      cfg.createClient = () => ({ bind: async () => {}, search: async () => ({ searchEntries: [] }), unbind: async () => {} });

      h1.on("input", (msg) => {
        try {
          expect(msg).to.have.property("error");
          expect(msg.error.code).to.equal(89);
          expect(msg.error.short).to.equal("param error");
          done();
        } catch (e) {
          done(e);
        }
      });

      n1.receive({ scope: "invalid" });
    });
  });

  it("skips bind when credentials are incomplete", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      let bindCalls = 0;
      let searchCalls = 0;
      const mockClient = {
        bind: async () => { bindCalls += 1; },
        search: async () => { searchCalls += 1; return { searchEntries: [] }; },
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", () => {
        try {
          expect(bindCalls).to.equal(0);
          expect(searchCalls).to.equal(1);
          done();
        } catch (e) { done(e); }
      });

      // Only bindDN provided (incomplete)
      n1.receive({ bindDN: "cn=only" });
    });
  });

  it("maps connection errors to friendly status", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      const mockClient = {
        bind: async () => { throw new Error("connect ECONNREFUSED 1.2.3.4:636"); },
        search: async () => { throw new Error("should not search"); },
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", (msg) => {
        try {
          expect(msg.error).to.exist;
          expect(msg.error.short).to.equal("connection error");
          done();
        } catch (e) { done(e); }
      });

      // Supply credentials to trigger bind (and thus the connection error)
      n1.receive({ bindDN: "cn=admin", bindCredentials: "x" });
    });
  });

  it("maps timeout errors to friendly status", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      const timeoutErr = new Error("request timeout");
      timeoutErr.name = "TimeoutError";
      const mockClient = {
        bind: async () => {},
        search: async () => { throw timeoutErr; },
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", (msg) => {
        try {
          expect(msg.error).to.exist;
          expect(msg.error.short).to.equal("timeout");
          done();
        } catch (e) { done(e); }
      });

      n1.receive({});
    });
  });

  it("binds when both credentials provided", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      let bound = false;
      const mockClient = {
        bind: async () => { bound = true; },
        search: async () => ({ searchEntries: [] }),
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", () => {
        try { expect(bound).to.equal(true); done(); } catch (e) { done(e); }
      });

      n1.receive({ bindDN: "cn=admin", bindCredentials: "secret" });
    });
  });

  it("errors when LDAP host is not configured", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      cfg.createClient = () => ({ bind: async () => {}, search: async () => ({ searchEntries: [] }), unbind: async () => {} });

      h1.on("input", (msg) => {
        try {
          expect(msg.error).to.exist;
          expect(msg.error.short).to.equal("param error");
          expect(msg.error.message).to.match(/LDAP host is not configured/);
          done();
        } catch (e) { done(e); }
      });

      n1.receive({});
    });
  });

  it("handles attributes passed as an array", function (done) {
    const flow = [
      { id: "cfg1", type: "cappern-ldap-config", host: "example.com", protocol: "ldap", port: 389, base: "dc=example,dc=com" },
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "cfg1", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const cfg = helper.getNode("cfg1");
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      const mockClient = {
        bind: async () => {},
        search: async (base, opts) => {
          expect(opts.attributes).to.deep.equal(["cn", "mail"]);
          return { searchEntries: [] };
        },
        unbind: async () => {}
      };
      cfg.createClient = () => mockClient;

      h1.on("input", () => done());
      n1.receive({ attributes: ["cn", "mail"] });
    });
  });

  it("errors when LDAP config reference is missing", function (done) {
    const flow = [
      { id: "n1", type: "cappern-ldap", name: "ldap", ldap: "missing", wires: [["h1"]] },
      { id: "h1", type: "helper" }
    ];

    helper.load([ldapConfigNode, ldapNode], flow, async () => {
      const n1 = helper.getNode("n1");
      const h1 = helper.getNode("h1");

      h1.on("input", (msg) => {
        try {
          expect(msg.error).to.exist;
          expect(msg.error.short).to.equal("param error");
          expect(msg.error.message).to.match(/Missing LDAP config reference/);
          done();
        } catch (e) { done(e); }
      });

      n1.receive({});
    });
  });

  // Note: error-handler fallback path is intentionally not tested,
  // as it does not emit a message and is difficult to assert via helper.
});
