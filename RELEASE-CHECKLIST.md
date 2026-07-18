# Wildharvest local release checklist

This checklist records the private local 1.0.0 baseline separately from requirements for any future public distribution or broader compatibility claim. Remote hosting, GitHub, manifest URLs, download URLs, and automatic updates remain disabled until the project owner explicitly restores that scope.

## Local 1.0.0 release checks

- [x] Canonical source folder and manifest ID are both exactly `wildharvest`.
- [x] Manifest and workspace package versions are both `1.0.0`.
- [x] JavaScript syntax and every JSON file pass local validation.
- [x] All 67 regression and documentation-contract tests pass.
- [x] UTF-8, trailing-whitespace, and final-newline format checks pass.
- [x] The release builder uses an explicit runtime/documentation allowlist.
- [x] The release ZIP contains `wildharvest/module.json` at the expected root.
- [x] The release ZIP excludes `tests/`, PowerShell tools, backups, package metadata, and nested archives.
- [x] Every staged file matches the corresponding expanded ZIP file by SHA-256.
- [x] Pre-stage and post-stage local backups are recorded in `BACKUPS.md`.
- [x] `Wildharvest-1.0.0.zip` is retained as the stable baseline before visual work begins.

## Owner-managed Foundry tests

- [ ] Run one combined 1.4.0–1.14.0 single-client GM smoke and visual flow on Foundry 14.360 with dnd5e 5.3.3; the earlier 0.95.0 candidate passed the functional smoke flow.
- [ ] Run the smoke flow on Foundry 13.351 with a compatible dnd5e 5.3.x build.
- [ ] Run the smoke flow on Foundry 14.364 before raising the manifest's `verified` build.
- [ ] Complete the two-client authenticated User-request flow, acceptance, one-time resolution, second result dialog, Actor-log synchronization, and inventory grant.
- [ ] Interrupt `resolving` during an active-GM handoff and confirm recovery never repeats rewards.
- [ ] Test value loot against real Items priced in PP, GP, EP, SP, and CP.
- [ ] Grant a stack, consume part of it, restart the world, and confirm the consumed quantity does not return.
- [ ] Review Polish and English UI at 1280x720 and at 125–200% scaling.
- [ ] Navigate the complete GM tab bar with Arrow keys, Home, End, Tab, and Shift+Tab; confirm focus remains visible and child dialogs restore focus to the parent.
- [ ] Enable reduced motion in the operating system and confirm player offer, roll, and result windows do not animate or shimmer.
- [ ] Confirm the localized Ko-fi footer banner appears only in the GM panel, remains usable by keyboard and at narrow widths, and opens the intended external page.

The project owner reports that gameplay through 1.8.1 appears to work correctly. The 1.9.0 authority transport, 1.10.0 real-compendium value/import changes, 1.11.0 visual accessibility checks, 1.12.0 refactored dialog/style loading, 1.13.0 two-client/compatibility closure, and 1.14.0 support-link appearance remain focused manual work. The automated contracts strengthen these areas but do not change the conservative manifest values or mark them as live-tested.

## Gates before public distribution

- [ ] Choose the project license, add `wildharvest/LICENSE`, and point `module.json.license` to that file.
- [ ] Decide where the project will be hosted after the current GitHub deferral is lifted.
- [ ] Add and verify stable `url`, `manifest`, and `download` fields only after hosting is explicitly authorized.

## Next development cycle

- [x] Keep 1.0.0 unchanged as the functional rollback baseline.
- [x] Begin visual changes as version 1.1.0 with a new pre-change backup.
- [x] Complete the Launch/Responses density and native-close cleanup as version 1.2.0.
- [x] Complete the compact Presets list/table redesign as version 1.3.0.
- [x] Complete the three-pane History workbench and original visual roadmap as version 1.4.0.
- [x] Complete the no-behavior-change dialog/CSS technical stabilization as version 1.5.0.
- [x] Complete the native-close, obsolete Favorites removal, and History Actor grouping hotfix as version 1.5.1.
- [x] Limit the History selector to player-character and player-assigned Actors as version 1.5.2.
- [x] Extract Launch, Responses, and Presets view boundaries as version 1.6.0.
- [x] Remove inert DC, margin, and outcomes fields in favor of the explicit total-roll model as version 1.7.0.
- [x] Replace result chat messages with a compact second player dialog and Actor-log synchronization as version 1.8.0.
- [x] Keep View all available for every reward result and guard disconnected parent-dialog focus as version 1.8.1.
- [x] Complete second-audit stage 1 as version 1.9.0 with authenticated User requests, accepted-only authority, duplicate protection, and conservative interrupted-resolution recovery.
- [x] Complete second-audit stage 2 as version 1.10.0 with canonical reward identity, bounded value selection, unavailable-pack filtering, strict identifiers, and transactional import.
- [x] Complete second-audit stage 3 as version 1.11.0 with linked controls, accessible keyboard tabs, visible focus, focus restoration, and player reduced-motion coverage.
- [x] Complete second-audit stage 4 as version 1.12.0 with shared DialogV2 boundaries, split GM/player CSS, canonical custom-property names, and dead-asset removal.
- [x] Complete second-audit stage 5 as version 1.13.0 with a two-player integration harness, active-GM handoff/recovery coverage, a machine-readable compatibility matrix, and conservative Foundry 13/14 closure.
- [x] Add the localized, accessible, GM-only Ko-fi support footer as version 1.14.0 without remote embeds or gameplay changes.

Detailed procedures are in [TESTING.md](./TESTING.md), and supported-version evidence is in [COMPATIBILITY.md](./COMPATIBILITY.md).
