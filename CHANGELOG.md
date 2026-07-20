# Changelog

## 1.20.0

- consolidated inventory stacking around one versioned source-identity policy: UUID first, then pack plus document ID, then the explicit reward ID; matching also remains scoped to the selected container and never falls back to Item name/type
- aligned fallback-resource keys with that same canonical identity while retaining one-time cleanup of resource entries written under the older reward-ID key
- replaced the raw ten-entry Actor search-log array with a versioned `{ schemaVersion, retentionLimit, updatedAt, entries }` store that lazily accepts the old array format, deduplicates retries by session ID, and retains the newest 25 entries
- reduced the public module integration API to a frozen version-1 surface containing `openControlPanel` and GM-only `getMigrationBackups`; legacy dialog-opening methods are no longer exposed
- documented the current no-license status in `LICENSING.md` without claiming an owner-unapproved open-source license or adding a misleading manifest field
- completed the third-audit documentation and conservative Foundry 13/14 compatibility closure without raising the manifest beyond actually recorded runtime evidence
- expanded the automated suite from 118 to 123 tests with exact stack identity, fallback-key transition, structured-history upgrade/retention, minimal public API, and licensing-status contracts
