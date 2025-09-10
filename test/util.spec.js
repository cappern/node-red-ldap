"use strict";

const path = require("path");
const { expect } = require("chai");

const util = require(path.join("..", "nodes", "util.js"));

describe("util mappings", function () {
  it("maps code 32 to 'base dn not found'", function () {
    const info = util.getLdapErrorInfo({ code: 32, name: "NoSuchObjectError", message: "no such object" });
    expect(info.short).to.equal("base dn not found");
  });

  it("maps code 50 to 'insufficient rights'", function () {
    const info = util.getLdapErrorInfo({ code: 50, name: "InsufficientAccessRightsError", message: "insufficient access rights" });
    expect(info.short).to.equal("insufficient rights");
  });

  it("maps by error name when code missing", function () {
    const info = util.getLdapErrorInfo({ name: "InvalidCredentialsError", message: "Invalid credentials" });
    expect(info.short).to.equal("invalid credentials");
    expect(util.classifyLdapError({ name: "InvalidCredentialsError", message: "Invalid credentials" })).to.equal("invalid credentials");
  });

  it("maps connection errors heuristically", function () {
    const info = util.getLdapErrorInfo({ name: "Error", message: "connect ECONNREFUSED" });
    expect(info.short).to.equal("connection error");
    expect(info.code).to.equal(91);
  });

  it("maps timeouts heuristically", function () {
    const info = util.getLdapErrorInfo({ name: "TimeoutError", message: "timeout" });
    expect(info.short).to.equal("timeout");
    expect(info.code).to.equal(85);
  });

  it("falls back to raw message for unknown errors", function () {
    const info = util.getLdapErrorInfo({ name: "Weird", message: "strange issue" });
    expect(info.short).to.equal("strange issue");
  });
});

