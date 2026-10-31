# Independent application lock

This original Node module implements password access control for the independent
engine. It is not the original Alpha vault or licensing service. Source databases
remain offline plaintext SQLite snapshots; this module does not encrypt them or
store WeChat keys, model credentials, or author entitlements.

`createSecurity({stateDir})` requires a pre-created absolute directory without
symlinks. It returns `status()`, `assertAccess()`, `lock()`, asynchronous
`unlock(passwordBytes)` and `configure({action,password,newPassword})`. Supported
actions are `enable_password`, `change_password`, and `disable`. Hello/biometric
provisioning and destructive reset are unsupported. The engine must check access
both before and after an asynchronous data request.

Passwords use NFC UTF-8, 8–256 characters when newly set, random 128-bit salts and
scrypt (N=32768,r=8,p=1,32-byte output). Only salts and derived hashes are persisted
in an atomically replaced 0600 file. Failure counts and an increasing 1–60 second
retry delay persist across restarts. A configured lock always starts locked.
Malformed, replaced, missing established state, symlinked paths, concurrent lock
changes and save failures are rejected. This is application access control, not
protection against an OS account owner modifying the executable or plaintext
database outside the application. Hardware protection is never claimed.

Run `npm run test:security`. No real passwords or databases are used in the tests.
