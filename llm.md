# LLM Context: @cappern/node-red-ldap

This repository contains a **Node-RED plugin** that provides nodes for querying LDAP/LDAPS directories.  
It is designed to let Node-RED flows interact with Active Directory and other LDAP servers.

## Purpose
- Expose LDAP queries as a native Node-RED node.
- Support both **ldap://** and **ldaps://** connections.
- Make it easy to search for users, groups, or custom objects in LDAP directories.
- Provide configuration via Node-RED credentials.

## Key Concepts
- **LDAP Connection Config Node (required)**  
  - Every LDAP Query node must reference a configuration node.  
  - This stores:
    - Host (hostname or IP)
    - Port (default 389 / 636)
    - Protocol (ldap / ldaps)
    - Bind DN (service account)
    - Password (stored securely by Node-RED)
    - Base DN
    - TLS/SSL options
  - The config node maintains the connection pool so multiple queries can share it.

- **LDAP Query Node**  
  - Executes LDAP search queries against the configured connection.
  - Can be configured with:
    - Default search base
    - Default filter
    - Default attributes to return
  - These can be overridden by message properties at runtime.

## Inputs
- A Node-RED message (`msg`) can supply:
  - `msg.filter` → LDAP search filter
  - `msg.base` → Search base override
  - `msg.attributes` → Array of attribute names to return
  - `msg.dn` → Distinguished Name for operations (future: add/modify/delete)

## Outputs
- On success:  
  `msg.payload` will be an **array of LDAP objects**, each with attributes returned by the query.  
  Example:
  ```json
  [
    {
      "dn": "CN=John Doe,OU=Users,DC=example,DC=com",
      "cn": "John Doe",
      "sAMAccountName": "jdoe",
      "mail": "jdoe@example.com"
    }
  ]
  ```
- On error:  
  The node will send a message with `msg.error` containing the error details.

## Example Use Case
```text
Inject → LDAP Query → Debug
```
- Inject `{"filter":"(sAMAccountName=jdoe)"}`  
- LDAP Query node searches AD for user *jdoe*  
- Debug node shows attributes in `msg.payload`

## Notes
- This project depends on the [`ldapts`](https://github.com/ldapts/ldapts) library.
- Future features may include: authentication, group membership resolution, add/modify/delete operations.

---

This file is meant to give LLMs and contributors a concise understanding of the repository.
