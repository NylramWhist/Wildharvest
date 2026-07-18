# Wildharvest

`Wildharvest` (`wildharvest`) is a gameplay module for Foundry VTT search and harvesting scenes.

Current local functional release: `1.14.0`. Version `1.0.0` remains the stable functional rollback baseline, and `1.4.0` remains the pre-refactor visual reference.

Current target:
- Foundry VTT `13.351` to `14.360`
- `dnd5e` `5.3.0` to verified `5.3.3`, with automatic skill lookup support
- one or more Item compendiums selected from the world, game system, or another independently managed source

The exact verification matrix and remaining live checks are recorded in [COMPATIBILITY.md](./COMPATIBILITY.md).

## Installation from GitHub

After release `v1.14.0` has been published with the matching ZIP asset, paste this manifest URL into Foundry VTT's module installer:

```text
https://raw.githubusercontent.com/NylramWhist/Wildharvest/main/module.json
```

The repository layout intentionally keeps the Foundry module in the `wildharvest` directory. The installable release archive contains that same directory at its root.

## Features

- GM-facing `Wildharvest` scene control with launch, responses, presets, and history views
- search offers sent to the whole party or selected players
- per-activity or per-player skill overrides for D&D 5e checks
- loot generation from attached compendiums using either rarity rules or a combined GP-value target
- GM-authoritative reward delivery to actor inventories with a fallback module store
- response tracking, reminders, session closing, and persisted GM session state
- a compact two-window player flow with a roll dialog followed by a private result dialog

## Recommended setup

1. Enable `wildharvest`.
2. Open `Wildharvest > Configure` and create search options.
3. Attach one or more Item compendiums to each option or configure a fallback pack pool.
4. Test one GM-to-player search flow before first live use.

## First GM pass

1. Create or import search options in `Wildharvest > Configure`.
2. Review the built-in validation panel for missing skills or compendiums.
3. Choose `Rarity` or `Combined GP value` and confirm its rules in `Configure rules`.
4. Send a test search offer from the control panel.
5. Verify that results land in actor inventory or in the fallback resource log.

## Search flow

1. The GM sends a search offer.
2. A player accepts or declines.
3. Accept and resolution requests are stored briefly on the requesting User document, allowing Foundry's update hook to identify the actual requesting user.
4. The GM client validates the session and Actor, performs the roll, and converts the total into Loot Points.
5. The active loot engine either buys rarity or builds a varied item set toward the configured combined GP target.
6. The roll window closes and the searching player receives a compact result window; rewards are already stored before it opens.

## GM-authoritative resolution

For offered searches, the player client cannot submit a roll total or rewards. It writes a constrained, expiring request to its own Foundry User document. The active GM receives the server-confirmed requesting `userId` through `updateUser`, validates the accepted open offer and Actor ownership, persists a one-time lock, then performs the Foundry roll, generates loot, grants rewards, and writes the complete result to the owned Actor log. The player receives only a neutral completion notice through the module socket, reads the synchronized Actor entry, and opens the result dialog locally. Direct resolution without an offer remains GM-only and `openSearchDialog` is no longer exposed through the module API.

## Socket and multiple GMs

Only `game.users.activeGM` can open session controls, mutate or persist session state, and send authoritative module messages. Other GMs maintain a synchronized read-only snapshot and reload it when the active GM changes. The broadcast socket now carries only active-GM offers and neutral status notices; player decisions and resolution requests use authenticated User document updates. Roll results and rewards never travel through the broadcast module socket.

## Inventory quantity safety

The quantity stored by the active game system on each Item is the sole source of truth. Consuming an Item changes that system quantity permanently; module startup never raises it from a historical flag. Module flags identify reward origin and the detected quantity path, but they do not impose a minimum stack size.

## Loot engines

`Rarity` preserves the original weighted Loot Point rules. `Combined GP value` maps the awarded Loot Points to an editable target in GP and uses bounded subset-state selection to find an exact or closest varied set without exceeding the configured tolerance ceiling. The default 10 percent tolerance is symmetric. D&D5e prices in PP, GP, EP, SP, and CP are normalized automatically; invalid or zero prices are excluded. See [LOOT-ENGINES.md](./LOOT-ENGINES.md) for the exact rules.

## Validation and test scripts

Windows PowerShell helpers are included in the project root:

- `tools\check-format.ps1` checks UTF-8 text, trailing whitespace, and final newlines.
- `tools\validate-module.ps1` checks JS syntax with the local Foundry runtime and validates JSON files.
- `tools\test-module.ps1` runs regression, manifest, documentation, and compatibility contract tests.
- `tools\build-release.ps1` runs all checks and creates a verified clean ZIP without development tests or tools.

The supported local command is `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-release.ps1` from the workspace root. If npm is installed later, `npm run release` is an optional alias; npm is not required by the pipeline. Neither path publishes or contacts GitHub.

## Automatic migration safety

Before world-data migration starts, the active GM stores a snapshot of module settings and module-owned Actor/Item flags. The first snapshot for each migration boundary is retained, later restarts do not replace it, and a failed backup aborts migration. Up to three distinct migration snapshots are retained, and a GM can inspect them through `game.modules.get("wildharvest").api.getMigrationBackups()`.

Wildharvest starts with its own clean settings and flags namespace. It does not import data from earlier module IDs or retired content packages.

## Foundry lifecycle safety

Settings and settings menus are registered synchronously during `init`. Custom translation loading starts during `i18nInit`, while ready-time maintenance waits on its internal completion promise without relying on Foundry to await an async hook. Socket listeners still register immediately when `ready` fires.

## Localization

English and Polish strings come only from `lang/en.json` and `lang/pl.json`. The module can follow Foundry automatically or force English or Polish; forced modes load the same manifest dictionaries during `i18nInit` instead of keeping a second copy of English text in JavaScript. Automated tests require identical key sets and formatting placeholders in both languages.

Detailed manual scenarios are listed in [TESTING.md](./TESTING.md) and release preparation is tracked in [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md).
