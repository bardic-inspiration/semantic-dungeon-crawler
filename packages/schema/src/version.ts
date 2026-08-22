// packages/schema/src/version.ts
//
// SPEC §3.5 (INV-5) — the running protocol version, as one constant.
//
// This is the value §5.1's `X-Spec-Version` header echoes on every response. It
// belongs to the ENGINE, not to any ruleset: `Ruleset.spec_version` (§3.4) is
// author-supplied content, and INV-4 requires the engine to run a ruleset whose
// version disagrees rather than reject it — so reading the header from a ruleset
// would let author content set the protocol version an adapter negotiates
// against. §5.1 depends on that not happening: the header is what "lets a
// third-party adapter trust a MINOR version bump to be safe to ignore".
//
// Keep in step with `SPEC.md`'s `spec-version` header and this package's
// CHANGELOG (INV-5); `version.test.ts` pins the two together.

/** The `spec_version` this build of `packages/schema` implements (§3.5). */
export const SPEC_VERSION = "0.12.0";
