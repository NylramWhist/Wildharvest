# Wildharvest Workspace

This workspace has one active Foundry module source: `wildharvest`. The module is developed according to [AUDYT-WILDHARVEST.md](./AUDYT-WILDHARVEST.md), the [version roadmap](./VERSIONING.md), the [loot-engine rules](./wildharvest/LOOT-ENGINES.md), the [migration-backup policy](./DATA-BACKUPS.md), the [world-data initialization policy](./MIGRATIONS.md), the [Foundry lifecycle policy](./LIFECYCLE.md), the [localization policy](./LOCALIZATION.md), the [retired-content policy](./CONTENT-RETIREMENT.md), the [GM authority policy](./GM-AUTHORITY.md), the [inventory quantity policy](./INVENTORY.md), and the [socket and multi-GM policy](./SOCKET-MULTIGM.md).

## Source of truth

- `wildharvest` — the only active Foundry module source
- `tools` — format, validation, tests, release, and snapshot helpers targeting `wildharvest`
- `backups` — local ZIPs and archived legacy copies; excluded from Git

Historical pre-Wildharvest snapshots remain local under `backups/` and are not active sources. Wildharvest intentionally starts with a clean `wildharvest` settings and flags namespace; it does not import data from earlier module IDs.

Wildharvest `1.0.0` is the stable rollback baseline. The Workbench visual roadmap is complete in `1.4.0`; versions `1.5.0`–`1.8.1` stabilize and polish the module, `1.9.0`–`1.13.0` complete the five-stage second-audit roadmap, and `1.14.0` adds the localized Ko-fi support footer without changing gameplay.

## Verification

Run from the workspace root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\validate-module.ps1
powershell -ExecutionPolicy Bypass -File .\tools\test-module.ps1
powershell -ExecutionPolicy Bypass -File .\tools\check-format.ps1
```

PowerShell is the supported local path and requires no package installation or remote service. If npm is installed later, `npm run validate`, `npm test`, and `npm run format:check` are optional aliases defined in `package.json`; npm is not currently required or available on this machine.

## Clean local release

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-release.ps1
```

The release builder runs all checks, packages only the runtime and linked documentation allowlist, excludes `tests/` and workspace tools, expands the resulting ZIP, and verifies every file hash. `npm run release` becomes an equivalent optional shortcut only on machines where npm is installed.

## Versioned backup

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\create-module-backup.ps1
```

Every completed update must have a versioned ZIP under `backups/`. Risky migrations also require a pre-change ZIP.

## Foundry development copy

The manifest ID is `wildharvest`, so every manual Foundry installation or development copy must use the folder name `wildharvest` exactly.
