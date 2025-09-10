"use strict";

const path = require("path");
const { expect } = require("chai");
const helper = require("node-red-node-test-helper");

helper.init(require.resolve("node-red"));

describe("ldap-config client options", function () {
  before(function (done) { helper.startServer(done); });
  after(function (done) { helper.stopServer(done); });
  afterEach(function () { helper.unload(); });

  function withMockedLdapts(fakeClientCtor, testFn) {
    // Inject a fake ldapts module BEFORE requiring the node module
    const ldaptsPath = require.resolve("ldapts");
    const prev = require.cache[ldaptsPath];
    require.cache[ldaptsPath] = { id: ldaptsPath, filename: ldaptsPath, loaded: true, exports: { Client: fakeClientCtor } };
    // Fresh require of the node to capture the mocked Client
    delete require.cache[require.resolve(path.join("..", "nodes", "ldap-config.js"))];
    const ldapConfigNode = require(path.join("..", "nodes", "ldap-config.js"));
    return testFn(ldapConfigNode).finally(() => {
      // restore
      if (prev) {
        require.cache[ldaptsPath] = prev;
      } else {
        delete require.cache[ldaptsPath];
      }
      delete require.cache[require.resolve(path.join("..", "nodes", "ldap-config.js"))];
    });
  }

  it("builds ldaps client with TLS options", function () {
    const seen = [];
    function FakeClient(options) { seen.push(options); }

    return withMockedLdapts(FakeClient, (ldapConfigNode) => new Promise((resolve, reject) => {
      const flow = [
        { id: "cfg1", type: "cappern-ldap-config", host: "ldap.example.com", protocol: "ldaps", base: "dc=ex,dc=com", tlsInsecure: true }
      ];
      const creds = { cfg1: { ca: "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----" } };
      helper.load([ldapConfigNode], flow, creds, () => {
        try {
          const cfg = helper.getNode("cfg1");
          cfg.createClient();
          expect(seen).to.have.lengthOf(1);
          const opts = seen[0];
          expect(opts.url).to.equal("ldaps://ldap.example.com:636");
          expect(opts).to.have.property("tlsOptions");
          expect(opts.tlsOptions.rejectUnauthorized).to.equal(false);
          expect(opts.tlsOptions.servername).to.equal("ldap.example.com");
          expect(opts.tlsOptions.ca).to.include("BEGIN CERTIFICATE");
          resolve();
        } catch (e) { reject(e); }
      });
    }));
  });

  it("builds ldap client without TLS options and default port", function () {
    const seen = [];
    function FakeClient(options) { seen.push(options); }

    return withMockedLdapts(FakeClient, (ldapConfigNode) => new Promise((resolve, reject) => {
      const flow = [
        { id: "cfg1", type: "cappern-ldap-config", host: "ldap.example.com", protocol: "ldap", base: "dc=ex,dc=com" }
      ];
      helper.load([ldapConfigNode], flow, () => {
        try {
          const cfg = helper.getNode("cfg1");
          cfg.createClient();
          expect(seen).to.have.lengthOf(1);
          const opts = seen[0];
          expect(opts.url).to.equal("ldap://ldap.example.com:389");
          expect(opts).to.not.have.property("tlsOptions");
          resolve();
        } catch (e) { reject(e); }
      });
    }));
  });

  it("builds ldaps client with verification by default", function () {
    const seen = [];
    function FakeClient(options) { seen.push(options); }

    return withMockedLdapts(FakeClient, (ldapConfigNode) => new Promise((resolve, reject) => {
      const flow = [
        { id: "cfg1", type: "cappern-ldap-config", host: "secure.example.com", protocol: "ldaps", base: "dc=ex,dc=com", tlsInsecure: false }
      ];
      helper.load([ldapConfigNode], flow, () => {
        try {
          const cfg = helper.getNode("cfg1");
          cfg.createClient();
          expect(seen).to.have.lengthOf(1);
          const opts = seen[0];
          expect(opts.url).to.equal("ldaps://secure.example.com:636");
          expect(opts.tlsOptions.rejectUnauthorized).to.equal(true);
          expect(opts.tlsOptions.servername).to.equal("secure.example.com");
          expect(opts.tlsOptions).to.not.have.property("ca");
          resolve();
        } catch (e) { reject(e); }
      });
    }));
  });
});
