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
https://raw.githubusercontent.com/NylramWhist/Wildharvest/main/wildharvest/module.json
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

## Known limitations

- The module is tuned around `dnd5e` data paths for automatic skill resolution.
- Remote hosting and package URLs are disabled indefinitely and remain outside the 1.0 roadmap until the project owner explicitly changes this policy.
- License choice and the corresponding `LICENSE` file remain an explicit project-owner gate before any public distribution.
- No content compendiums are bundled; without a configured Item compendium the module cannot generate meaningful loot.

Post-1.0 visual work started with version `1.1.0`; version `1.0.0` remains the stable functional baseline for comparison and rollback.

## GM Workbench theme

Version 1.1.0 introduced the first visual-only Workbench layer for the GM control panel. It uses warm black and dark brown surfaces, restrained brass accents, compact tabs and buttons, reduced corner radii, denser status rows, visible keyboard focus, and reduced-motion support. The later 1.2.0–1.4.0 releases completed the structural Launch, Responses, Presets, and History work.

Version 1.2.0 adds the first structural density pass for Launch Scene and Responses. Forms, actions, active-scene information, progress statistics, filters, and response rows use less vertical space. Redundant bottom Close buttons are hidden throughout Wildharvest because Foundry already provides the native title-bar X; workflow controls such as cancellation and Close Scene remain available.

Version 1.3.0 rebuilt Presets as a compact Workbench table. Version 1.5.1 removes the later-abandoned Favorites slot and keeps the useful preset description, skill, loot pool, validation status, and accessible Send/Edit/Duplicate/Delete tools. Full validation messages remain available in the status tooltip, while narrow windows switch to stacked preset rows.

Version 1.4.0 completes the original Workbench visual roadmap with a three-pane History view. Characters are listed with portraits and saved-entry counts, the center pane provides searchable selectable history rows, and the details pane shows the complete roll and reward summary. The layout collapses to two panes and then a vertical stack on narrower windows. Existing Actor flags and the ten-entry history limit are unchanged.

Version 1.5.0 is a technical stabilization release. Shared DialogV2 utilities and the History view now live in dedicated modules, while the Workbench CSS is split into core, Presets, History, and responsive layers. The refactor intentionally preserves the 1.4.0 interface and behavior. Automated tests cover the new module boundaries; manual Foundry checks for 1.4.0 and 1.5.0 remain deferred for a combined owner test pass.

Version 1.5.1 is a UI hotfix. It hides Foundry 14's real DialogV2 footer when it contains only the redundant Close action, removes the abandoned preset Favorites feature, and separates the History Actor list into Player Characters and Non-player Characters. The split uses Actor type plus non-GM user assignments, so linked companions remain visible with player characters even if their system type differs.

Version 1.5.2 removes the unused non-player section from History. The character list now contains only Actors of type `character` and Actors assigned to non-GM users, including assigned companions whose system type differs. NPC, vehicle, and group Actors remain untouched in the world but are no longer displayed in this search-history selector.

Version 1.6.0 continues the internal stabilization without changing behavior. Launch, Responses, and Presets now have explicit view modules, while shared GM icon resources live behind one rendering boundary. The main panel remains the event and persistence controller instead of also owning every tab's markup.

Version 1.7.0 makes the total-roll model explicit. A skill roll's final total maps directly to the configured Loot Points brackets, and the selected rarity or combined-value engine spends that result. The old DC, margin, and outcomes fields never affected rewards and have been removed from active activities, sessions, logs, UI, localization, and exported presets. Older extra fields are ignored and stripped when configuration is normalized; existing world documents are not rewritten.

Version 1.8.0 redesigns the player flow as two compact windows without result cards in Foundry chat. After the player submits the roll request, the first window closes; once the active GM has resolved and stored the result, a Search Complete window opens in the same screen area. It shows the final result, Loot Points, up to eight reward tiles, an expandable full list when needed, and the inventory-delivery state. Detailed result data is synchronized through the owned Actor log rather than the broadcast socket.

Version 1.8.1 keeps the expandable full reward list available for every non-empty result, even when the compact summary contains fewer than eight Items. It also prevents child-dialog close handlers from focusing a GM parent window that has already been removed from the Foundry interface.

Version 1.9.0 begins the five-stage second-audit roadmap. Player authority no longer trusts a `senderId` inside broadcast socket data: Foundry's `updateUser` hook supplies the actual requester identity. Offers must be accepted before resolution, duplicate and expired requests are rejected, and interrupted `resolving` entries recover from Actor history or fail conservatively without repeating rewards.

Version 1.10.0 completes the loot-data stage of the second audit. Reward identity now includes both compendium and document IDs, the value engine searches bounded possible totals instead of repeating greedy attempts, unavailable imported compendiums are discarded, duplicate configuration identities are rejected, and all imported world settings roll back together if a write fails.

Version 1.11.0 completes the accessibility implementation stage of the second audit. Form labels are linked to their controls, GM tabs use ARIA tab semantics and cyclic Arrow/Home/End keyboard navigation, filter and session controls expose their selected state, and both GM and player windows have visible keyboard focus. Player dialogs place focus on their primary control when opened, child dialogs return focus to a connected parent, and reduced-motion preferences now cover the complete player flow. Visual scaling, long-name, and overflow checks remain owner-managed Foundry tests.

Version 1.12.0 completes the architecture-cleanup stage of the second audit without changing gameplay or stored data. Shared configuration import/export dialogs and the player-offer view now have explicit DialogV2 modules, while the authority controller keeps ownership of requests and session state. The former 2,359-line stylesheet is split into a 179-line shared base, GM dialogs, player dialogs, Workbench, Presets, History, and responsive layers. All active CSS custom properties use the `--wildharvest-*` namespace, and seven unreferenced legacy graphics were removed. Automated tests now reject both legacy variable names and packaged assets without a live reference.

Version 1.13.0 completes the five-stage second audit. A deterministic GM-plus-two-player integration harness exercises authenticated decisions, per-player Actor ownership, one-time completion, duplicate rejection, active-GM handoff, Actor-log recovery, and target-scoped socket messages. A machine-readable compatibility matrix binds the conservative manifest to Foundry minimum 13.351 and verified 14.360 while keeping 14.364 and real two-client execution as explicit owner-managed live gates. The automated suite now contains 95 tests; it does not claim to replace a live Foundry world test.

Version 1.14.0 adds one localized Ko-fi support link to the right side of the GM control-panel footer. The compact Workbench-styled banner opens `https://ko-fi.com/tomorrokoshii` in a separate browser context with `noopener` and `noreferrer`, remains keyboard-visible, stacks safely on narrow windows, and never appears in player roll or result dialogs. It uses no remote widget, script, or image and does not change gameplay, settings, stored data, sockets, or compatibility declarations.
