# @cappern/node-red-ldap

Another LDAP node for Node-RED built on top of `ldapts`. It provides:

- A config node `cappern-ldap-config` to define server connection (host, port, protocol, TLS options, base DN, and credentials)
- A runtime node `cappern-ldap` to perform LDAP searches with optional message-based overrides


## Install

From your Node-RED user directory (usually `~/.node-red`):

```
npm install @cappern/node-red-ldap
```

Restart Node-RED and look for the nodes under the Function category.


## Nodes

- cappern-ldap-config: Shared connection configuration
  - host: Server hostname or IP
  - port: Defaults to 389 for `ldap` and 636 for `ldaps`
  - protocol: `ldap` or `ldaps`
  - base: Default Base DN
  - Ignore TLS errors: When `ldaps`, disables certificate verification (insecure)
  - CA Certificates (PEM): Optional trusted CA bundle for `ldaps`
  - credentials: Bind DN and Password (optional)

- cappern-ldap: Perform LDAP search
  - Default Base DN, Filter, Scope (`base|one|sub`), Attributes (comma separated)
  - Outputs: `msg.payload` as an array of entry objects
  - Errors: attaches `msg.error = { name, code, message }` and sets node status


## Message Overrides

The `cappern-ldap` node accepts the following fields from the incoming message to override the node/config:

- msg.base: Base DN
- msg.filter: LDAP filter (defaults to `(objectClass=*)`)
- msg.scope: `base`, `one`, or `sub` (defaults to `sub`)
- msg.attributes: comma-separated string or array of attribute names
- msg.bindDN: Bind DN for this invocation
- msg.bindCredentials: Bind password for this invocation

When `attributes` is empty, the server default attribute set is returned.


## Examples

Find a user by uid under the node’s Base DN:

```
{
  "filter": "(uid=alice)"
}
```

Return specific attributes only under a specific OU:

```
{
  "base": "ou=people,dc=example,dc=com",
  "filter": "(objectClass=person)",
  "attributes": ["cn", "mail", "sn"]
}
```

Search one level below an OU:

```
{
  "base": "ou=people,dc=example,dc=com",
  "filter": "(cn=Alice*)",
  "scope": "one"
}
```

Bind as end-user for this search only:

```
{
  "bindDN": "uid=alice,ou=people,dc=example,dc=com",
  "bindCredentials": "user-password",
  "base": "dc=example,dc=com",
  "filter": "(uid=alice)"
}
```


## Error Handling

On error, the node sets a red status with a concise message (e.g. `invalid credentials`, `base DN not found`, `timeout`, `connection error`) and attaches details to `msg.error`:

```
{
  "error": { "name": "InvalidCredentialsError", "code": 49, "message": "Invalid credentials" }
}
```

You can branch on `msg.error` using a Switch node.


## Development & Tests

This repo includes a Mocha test suite using the official Node-RED node test helper. The LDAP client is mocked so tests do not require a live directory server.

- Test runner: Mocha + Chai
- Helper: `node-red-node-test-helper` with embedded Node-RED runtime
- Location: `test/ldap.spec.js`

Install dev dependencies and run tests:

```
npm install
npm test
```

What’s covered:

- Node loads with the config node
- Successful search emits entries to `msg.payload`
- Missing base DN reports an error on output
- Invalid credentials are mapped to a friendly status and error payload

### Optional Live LDAPS Test

There is an opt-in integration test that connects to a real LDAPS server. It is skipped by default and only runs when `LDAP_LIVE=1` is set and connection details are provided.

Env vars:

- `LDAP_LIVE=1` — enable the live test
- `LDAP_URL=ldaps://host:636` — or provide `LDAP_HOST`, `LDAP_PORT`, `LDAP_PROTOCOL`
- `LDAP_BASE=dc=example,dc=com` — base DN to search
- `LDAP_BIND_DN` and `LDAP_BIND_PW` — optional bind credentials
- `LDAP_FILTER` — optional search filter (defaults to `(objectClass=*)`)
- `LDAP_TLS_INSECURE=1` — optional, disable TLS verification (insecure)
- `LDAP_CA_PATH=/path/to/ca.pem` or `LDAP_CA_PEM="...PEM..."` — optional CA bundle

Run just the live test:

```
LDAP_LIVE=1 LDAP_URL=ldaps://ldap.example.com:636 LDAP_BASE=dc=example,dc=com \
LDAP_BIND_DN="cn=admin,dc=example,dc=com" LDAP_BIND_PW="secret" \
npm test -- --grep "live ldaps"
```


## License

AGPL-3.0-or-later (see `LICENSE`)
