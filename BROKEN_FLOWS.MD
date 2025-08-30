# XMTP Group Creation Fix

## Root Cause
The backend created XMTP groups without adding the priest as a member. Because
membership determines visibility, the priest's client could not discover newly
created groups even after syncing.

## Resolution
The `/templs` endpoint now accepts a `priestInboxId` and uses it when creating
new groups:

1. Derive the inbox ID from the priest address if it isn't supplied.
2. Pass the priest's inbox ID to `newGroup([priestInboxId])` so the priest is a
   member from the start.
3. Continue to treat "sync succeeded" messages from the XMTP SDK as non-fatal
   during group creation.

With the priest included at creation, all core flows—deployment, join, and
messaging—work across real XMTP clients.
