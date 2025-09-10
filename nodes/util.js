"use strict";

const CODE_INFO = require("./ldap-errors.json");

// Map common ldapts/ldapjs error class names to codes
const NAME_CODE = {
  OperationsError: 1,
  ProtocolError: 2,
  TimeLimitExceededError: 3,
  SizeLimitExceededError: 4,
  CompareFalseError: 5,
  CompareTrueError: 6,
  AuthMethodNotSupportedError: 7,
  StrongAuthRequiredError: 8,
  ReferralError: 10,
  AdminLimitExceededError: 11,
  UnavailableCriticalExtensionError: 12,
  ConfidentialityRequiredError: 13,
  SaslBindInProgress: 14,
  NoSuchAttributeError: 16,
  UndefinedTypeError: 17,
  InappropriateMatchingError: 18,
  ConstraintViolationError: 19,
  TypeOrValueExistsError: 20,
  InvalidSyntaxError: 21,
  NoSuchObjectError: 32,
  AliasProblemError: 33,
  InvalidDNSyntaxError: 34,
  IsLeafError: 35,
  AliasDereferencingProblemError: 36,
  InappropriateAuthenticationError: 48,
  InvalidCredentialsError: 49,
  InsufficientAccessRightsError: 50,
  BusyError: 51,
  UnavailableError: 52,
  UnwillingToPerformError: 53,
  LoopDetectError: 54,
  NamingViolationError: 64,
  ObjectClassViolationError: 65,
  NotAllowedOnNonLeafError: 66,
  NotAllowedOnRDNError: 67,
  AlreadyExistsError: 68,
  NoObjectClassModsError: 69,
  ResultsTooLargeError: 70,
  AffectsMultipleDSAsError: 71,
  OtherError: 80,
  ServerDownError: 81,
  LocalError: 82,
  EncodingError: 83,
  DecodingError: 84,
  TimeoutError: 85,
  AuthUnknownError: 86,
  FilterError: 87,
  UserCancelledError: 88,
  ParamError: 89,
  NoMemoryError: 90,
  ConnectError: 91,
  NotSupportedError: 92,
  ControlNotFoundError: 93,
  NoResultsReturnedError: 94,
  MoreResultsToReturnError: 95,
  ClientLoopError: 96,
  ReferralLimitExceededError: 97,
  InvalidResponseError: 100,
  AmbiguousResponseError: 101,
  TLSNotSupportedError: 112,
  CanceledError: 118,
  NoSuchOperationError: 119,
  TooLateError: 120,
  CannotCancelError: 121,
  AssertionFailedError: 122,
  AuthorizationDeniedError: 123,
};

// Invert NAME_CODE to get a default class name for a code
const CODE_NAME = Object.create(null);
for (const [n, c] of Object.entries(NAME_CODE)) {
  if (!(c in CODE_NAME)) CODE_NAME[c] = n;
}

function codeToInfo(code) {
  if (typeof code === "number") return CODE_INFO[String(code)];
  return undefined;
}

function classifyLdapError(err) {
  try {
    const info = getLdapErrorInfo(err);
    return info.short;
  } catch (_) {
    return "error";
  }
}

function getLdapErrorInfo(err) {
  const code = typeof err?.code === "number" ? err.code : undefined;
  const name = err?.name || "Error";
  const raw = err?.message || String(err);
  const em = raw.toLowerCase();

  // Network/client heuristics override when detected
  if (em.includes("econnrefused") || em.includes("enotfound") || em.includes("ehostunreach") || em.includes("econnreset")) {
    return {
      code: 91,
      name,
      short: "connection error",
      description: "Cannot reach LDAP host/port. Verify hostname, port, firewall, and TLS settings.",
      message: raw,
    };
  }
  if (name === "TimeoutError" || em.includes("timeout") || em.includes("etimedout")) {
    return {
      code: 85,
      name,
      short: "timeout",
      description: "Operation exceeded the timeout limit awaiting server response.",
      message: raw,
    };
  }

  // Known numeric code
  let mapped = codeToInfo(code);

  // Map by class name if missing code
  if (!mapped && name && NAME_CODE[name] != null) {
    mapped = codeToInfo(NAME_CODE[name]);
  }

  // Friendlier wording for common cases
  if (mapped?.short === "no such object") {
    mapped = { ...mapped, short: "base dn not found" };
  }
  if (mapped?.short === "insufficient access rights") {
    mapped = { ...mapped, short: "insufficient rights" };
  }

  if (mapped) {
    return { code, name, short: mapped.short, description: mapped.description, message: raw };
  }

  return { code, name, short: raw, description: "An error occurred.", message: raw };
}

module.exports = { classifyLdapError, getLdapErrorInfo };

function createLdapError(code, message, name) {
  const info = codeToInfo(code);
  const err = new Error(
    message || info?.description || info?.short || "LDAP error"
  );
  err.code = code;
  err.name = name || CODE_NAME[code] || "LDAPError";
  return err;
}

module.exports.createLdapError = createLdapError;
