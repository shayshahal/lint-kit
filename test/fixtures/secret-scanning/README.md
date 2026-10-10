# secret-scanning fixtures

`clean.ts` is the only committed fixture: a file with nothing for a secret scanner to report. It is
what the branch and history tests start from.

The credential-shaped cases are **generated** by `test/secret-scanning.test.js` into a fresh git
repository under the OS temp directory, never committed here. The values they use live in that test
as plain hex strings assigned to `apiKey` (Gitleaks' `generic-api-key` rule reports them) and are
documented there and in `tools/security/gitleaks.toml`: one is the allowlisted dummy value, the
others must be reported. Keeping them out of the working tree means this repository never stores a
value that looks like a credential, while the tests still run the real scanner over real files,
commits and working trees.
