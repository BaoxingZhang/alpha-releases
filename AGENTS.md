# Alpha recovery and maintenance

The user's goal is to retain as much of Alpha's complete existing functionality as possible and turn it into a project they can maintain and update. Do not silently reduce the product to a generic chat viewer or remove unfinished features. Use MAINTENANCE.md as the scope and parity record.

The current target is Alpha 0.3.5 macOS arm64. src/ initially contains recovered emitted JavaScript and assets; it is not the original TypeScript project. vendor/runtime contains original compiled files. Preserve their provenance, licenses and hashes. Record subsequent source refactors accurately rather than continuing to claim unchanged hashes.

Read README.md and docs/local-build-and-run.md before running. Use npm run build and npm run test:smoke. The launcher uses isolated project data and OS-level restrictions; do not point it at personal WeChat data merely to make a smoke test pass. Do not return mock ready states, fabricate accounts, or treat UI startup as backend success.

Keep original signatures, trust policies and licensing behavior intact when using the original binaries. Independent replacements should have their own real implementations and explicit capability states. The current backend error is SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY; it has not been established to mean expiry.

Generated dist/, build/, workers/agent/dist/ and .runtime/ are disposable outputs. Edit sources, maintenance modules and scripts; rebuild rather than hand-editing generated app files. New modules must be added to the build inputs when bundle:false would otherwise omit them.

Test the behavior changed. Protocol/framing tests and app smoke have different scopes; keep backend status separate. Record real-data, network/model, mutation and cross-platform workflows as untested until actually exercised in an appropriate authorized test environment.
