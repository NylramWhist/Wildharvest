# Changelog

## 1.14.0

- added a compact `Support Wildharvest on Ko-fi` banner to the right side of the GM control-panel footer, linking to `https://ko-fi.com/tomorrokoshii`
- kept the support link out of every player-facing offer, roll, and result window
- added English and Polish labels, semantic link behavior, visible keyboard focus, secure external-link attributes, and a narrow-window stacked layout
- used only local Foundry/CSS presentation with no remote Ko-fi script, widget, or image request
- added a regression contract that locks the URL to the GM panel, verifies localization and link safety, and prevents accidental remote embedding
- expanded automated coverage from 95 to 96 tests without changing gameplay, settings, stored data, sockets, loot engines, or compatibility declarations

## 1.13.0

- added a deterministic GM-plus-two-player integration harness built on the production request validation, authority claim/completion, interrupted-resolution recovery, and socket authorization helpers
- covered isolated Actor ownership, independent player completion, rejected duplicate resolutions, and exactly one simulated inventory/Actor-log grant per accepted result
- covered an active-GM handoff where a queued request aimed at the former valid GM is handled by the new authority and an already persisted Actor result is recovered without another grant
- added target-isolation contracts for minimal offers and neutral GM resolution notices across two player clients
- added a machine-readable Foundry 13.351, 14.360, and 14.364 compatibility matrix tied to the manifest and compatibility documentation
- retained Foundry minimum `13.351` and verified `14.360`; live Foundry 13.351, Foundry 14.364, and real two-client execution remain owner-managed gates rather than inferred compatibility claims
- expanded automated coverage from 91 to 95 tests without changing gameplay, settings, flags, sockets, loot engines, stored data, or the existing player interface

## 1.12.0

- moved the duplicated configuration export, import, and confirmation DialogV2 workflow into one shared `config-transfer-dialogs.js` boundary used by both GM configuration surfaces
- moved the complete player offer presentation and DialogV2 lifecycle into `player-search-offer-dialog.js` while keeping authenticated requests, pending results, and session authority in the existing controller
- split the former 2,359-line `module.css` into a 179-line shared base plus dedicated `gm-dialogs.css` and `player-dialogs.css` layers, preserving the existing Workbench, Presets, History, and responsive override order
- replaced every active `--posz-*` custom property with its canonical `--wildharvest-*` equivalent and removed the temporary GM compatibility-alias block
- removed seven unreferenced legacy UI assets after checking all script, template, manifest, and stylesheet references
- added automated contracts for shared DialogV2 boundaries, stylesheet ordering, complete custom-property naming, and live references for every packaged UI asset
- expanded automated coverage from 89 to 91 tests without changing gameplay, settings, flags, sockets, loot engines, or migration behavior

## 1.11.0

- linked unlabeled DialogV2 form controls to stable generated IDs and added explicit accessible names to compendium selectors, import/export fields, per-player assignment controls, and the rules tables
- implemented the GM Workbench tabs as an ARIA tablist with roving focus, active-state semantics, and cyclic Arrow, Home, and End keyboard navigation
- exposed selected session and filter states through `aria-pressed` without changing their existing click behavior
- added visible `:focus-visible` treatment for GM form controls, tab panels, player inputs, buttons, and expandable reward details
- placed initial focus on useful controls in the player offer, roll, and result windows and restored focus to connected parent dialogs after child dialogs close
- extended reduced-motion handling to player windows, transitions, animations, and the primary-button shimmer
- expanded automated coverage from 86 to 89 tests with executable label/focus and tab-navigation checks plus an accessibility source contract
- left 1280×720, 125–200% scaling, long-name, and overflow assessment as explicit owner-managed Foundry tests

## 1.10.0

- made compendium reward IDs canonical by including both the pack collection ID and document ID, preventing cross-pack collisions in inventory flags, fallback resources, and persisted results
- replaced the value engine's repeated randomized greedy attempts with bounded subset-state selection that reliably finds exact or closer totals while retaining variation between equal-price Items
- deduplicate repeated pack-qualified index entries before value selection and report the ignored duplicate count in preview summaries
- made unavailable-pack filtering actually remove missing and non-Item compendiums from imported loot pools and fallback selections
- reject duplicate location, activity, loot-pool, rarity-rule, Loot Point threshold, and value-bracket identities before imported data can be written
- apply all five imported world settings as one rollback-capable transaction so a partial write failure restores the previous configuration
- expanded automated coverage from 80 to 86 tests with canonical identity, deterministic value selection, duplicate-index, unavailable-pack, identifier-integrity, and transaction-rollback regressions

## 1.9.0

- removed player decisions and resolution requests from the broadcast module socket
- moved player authority requests to short-lived flags on the requesting User document and consume the server-confirmed `userId` from the `updateUser` hook
- validate request shape, target GM, age, Actor ownership, modifier bounds, and roll mode before the active GM can mutate a session
- queue authenticated requests so an accepted decision is persisted before the following resolution request is processed
- require the authoritative session entry to be `accepted` before it can transition atomically to `resolving`
- keep at most 250 processed request IDs in memory and reject duplicate or expired document requests
- after an active-GM handoff or restart, give persisted `resolving` entries a 30-second grace period, then recover completed results from the Actor log or mark the entry failed without rerunning rewards
- preserve the minimal GM-to-player socket for offers, neutral completion, close, and synchronization notices only
- expanded automated coverage from 77 to 80 tests with authenticated transport, request expiry, accepted-only, socket-boundary, and interrupted-resolution recovery contracts

## 1.8.1

- always render the expandable View all section for every non-empty reward result, including results with fewer than eight different Items
- retained the compact eight-tile summary while making full names, unit values, icons, and quantities consistently available in the details section
- fixed a Foundry `bringToFront()` error triggered when a child dialog closed after its parent GM panel had already been removed from the DOM
- added one shared guarded dialog-focus helper and applied it to GM configuration, control-panel, import/export, preview, and resource-log child dialogs
- extended the existing 77-test suite with disconnected-dialog and always-visible reward-details regression assertions

## 1.8.0

- replaced player result chat messages with a dedicated compact Search Complete dialog
- kept the roll and result as two separate windows: the roll window closes before the result window opens in the same screen area
- limited the immediate reward preview to eight item tiles and added an expandable full list for longer results
- added the restrained warm player palette with gold reserved for actions and results, and green reserved for successful inventory delivery
- preserved automatic reward grants and the GM-authoritative one-time resolution model
- synchronized player result details through the owned Actor search log while keeping the broadcast socket notice free of rolls, Actor data, storage data, and rewards
- added a bounded five-second wait for Foundry Actor synchronization before reporting that the result could not be displayed
- removed obsolete result-chat localization and CSS
- expanded automated coverage from 76 to 77 tests with a player-dialog, Actor-log, no-chat, and styling contract

## 1.7.0

- adopted the owner-selected total-roll model: the final roll maps directly to Loot Points thresholds for both loot engines
- removed inert `dc`, `baseDc`, `margin`, `outcomes`, and `minMargin` fields from the active activity, result, session, and search-log schemas
- removed obsolete DC and outcome validation, normalization, editor carry-through, offer preview data, response text, History details, and localization
- replaced the legacy outcome object with a simple localized `lootMessage` derived from awarded Loot Points
- made quick-option storage an explicit allowlist so imported legacy DC/outcome fields are discarded instead of silently surviving export/import
- left previously stored world Actors and logs untouched; old extra fields are ignored while all new entries use the clean schema
- expanded automated coverage from 75 to 76 tests with a source contract and legacy-field stripping test

## 1.6.0

- completed the second no-behavior-change GM control-panel modularization pass
- moved the complete Launch tab view into `gm-control-panel-launch-view.js`
- moved the Responses tab composition into `gm-control-panel-responses-view.js`
- moved the complete Presets table and row renderer into `gm-control-panel-presets-view.js`
- centralized GM Workbench icon paths and icon/label rendering in `gm-control-panel-view-shared.js`
- removed the unused legacy session-card renderer and reduced the main GM controller to 1,457 lines
- kept event handling, persistence, session authority, loot behavior, and the rendered UI contract unchanged
- expanded automated coverage from 74 to 75 tests with explicit tab-view module-boundary checks

## 1.5.2

- removed non-player Actors from the History character list to keep the panel focused on usable search characters
- History now shows only D&D5e `character` Actors and Actors explicitly assigned to non-GM users
- retained support for player-linked Actors whose system type is not `character`, such as assigned companions
- removed the now-unnecessary Player/Non-player subgroup headers while preserving character selection, log filtering, details, and stored history
- kept automated coverage at 74 tests with the Actor-list contract updated to reject unassigned NPC and vehicle Actors

## 1.5.1

- fixed redundant bottom Close buttons on Foundry 14 by targeting the actual DialogV2 `.form-footer` in addition to the legacy footer class
- removed the complete obsolete preset Favorites subsystem: filter, slot data, controls, rendering, localization, icon, and styles
- simplified the Presets table to five useful columns after removing the Favorites slot
- divided the History actor list into Player Characters and Non-player Characters with separate counts and empty states
- classifies D&D5e `character` actors and actors linked to non-GM users as Player Characters; all remaining Actor types stay in the non-player section
- preserved the current Actor selection and defaults to the first Player Character when no valid selection exists
- expanded automated coverage from 73 to 74 tests; gameplay, loot engines, sockets, and stored history remain unchanged

## 1.5.0

- completed a technical stabilization pass without changing gameplay, stored data, or the intended 1.4.0 visuals
- moved shared DialogV2 escaping, form lookup, window-class handling, and HTMLElement checks into `scripts/dialogs/dialog-utils.js`
- removed duplicate dialog helper implementations from the GM panel, GM configuration, player search, search offers, and resource log
- moved the complete History renderer and its filter/key helpers into `scripts/dialogs/gm-control-panel-history-view.js`
- split the Workbench stylesheet into a 606-line core plus dedicated Presets, History, and responsive/reduced-motion stylesheets loaded in deterministic order
- reduced the main GM panel source from 2,389 to 2,171 lines and the monolithic Workbench stylesheet from 1,388 to 606 lines
- added executable History helper tests and architecture guards for shared DialogV2 utilities and split stylesheet order
- expanded automated coverage from 71 to 73 tests; manual Foundry runtime and visual checks remain explicitly deferred by the project owner

## 1.4.0

- rebuilt History as a three-pane Workbench with Characters, Gathering history, and Entry details sections
- replaced the Actor dropdown with a compact character list showing portraits and saved-entry counts
- added selectable searchable history rows for activity, location, skill, final result, and date
- added a details pane for skill, final result, DC, Loot Points, roll mode, date, and reward stacks with item images
- retained the existing ten-entry-per-Actor storage, clear-current-character behavior, and history search semantics without migrating world data
- added responsive two-pane and stacked layouts for narrower Foundry windows
- completed every structural screen from the original post-1.0 Workbench visual guidelines
- expanded automated coverage from 70 to 71 tests with a History structure, selection-state, and responsive-layout guard

## 1.3.0

- replaced large Preset cards with a compact Workbench list/table that keeps more activities visible at once
- added dedicated columns for preset identity and description, skill, loot pool, favorite slot, validation status, and actions
- replaced expanded validation warnings with compact Ready or Needs Attention badges whose tooltips retain the complete validation message
- preserved Send, Edit, Duplicate, Delete, favorite-slot assignment, search, filters, import, export, and create behavior
- changed row actions to compact accessible icon buttons with localized labels and tooltips
- added warm row hover treatment, valid/warning edge markers, restrained table dividers, and a stacked mobile layout
- kept gameplay, stored preset data, compendium selection, loot engines, sockets, and compatibility declarations unchanged
- expanded automated coverage from 69 to 70 tests with a Presets structure and action-preservation guard

## 1.2.0

- removed redundant bottom Close buttons from Wildharvest dialogs; normal window closing now uses Foundry's native X in the title bar
- retained operational cancellation controls and the separate Close Scene action, which change workflow state rather than merely dismissing a window
- compacted the Launch Scene form, primary and secondary actions, description area, and active-scene summary
- compacted the Responses overview, filters, progress badges, status strip, response rows, and expanded details to show more information without scrolling
- added responsive single-column handling for the denser Launch/Responses layout
- kept gameplay rules, session state, socket messages, loot engines, player data, and Foundry/dnd5e compatibility declarations unchanged
- expanded automated coverage from 68 to 69 tests with guards for native-close cleanup and the 1.2.0 density layer

## 1.1.0

- introduced the first post-1.0 visual release with a GM-only Wildharvest Workbench theme
- replaced the purple-black dashboard palette with warm black, dark brown, restrained brass, and semantic status colors
- added namespaced design tokens for backgrounds, borders, accents, text, states, radii, shadows, and focus treatment
- moved the visual layer into `styles/gm-workbench.css`, loaded after the stable base stylesheet for isolated rollback and comparison
- compacted the native frame, branded header, four-tab navigation, cards, forms, tool buttons, active-scene row, status strip, response rows, and footer without changing their behavior
- reduced corner radii, spacing, glow, and large empty areas while retaining the existing Launch, Responses, Presets, and History structure
- added visible keyboard focus, reduced-motion handling, warm scrollbars, responsive two-column tabs, and compact status grids
- kept player dialogs, loot rules, resource log, socket behavior, data schema, and both loot engines unchanged
- expanded automated coverage from 67 to 68 tests with a manifest order and GM-theme scope guard

## 1.0.0

- completed the 14-stage local stabilization roadmap and established the first stable Wildharvest baseline
- promoted the verified 0.99.0 candidate without changing its gameplay rules, data schema, authority model, or loot economies
- retained the tested Foundry 13.351 minimum, Foundry 14.360 verified build, and dnd5e 5.3.0–5.3.3 compatibility contract without overstating untested builds
- finalized the local release checklist, clean allowlisted archive, source snapshot, pre-stage backup, and per-file SHA-256 verification
- left final Foundry runtime scenarios to project-owner manual testing, while retaining the documented 0.95.0 Foundry 14.360 smoke-test evidence
- kept GitHub, remote manifests, automatic updates, and public distribution outside scope until explicitly restored by the project owner
- kept the manifest license field absent for this private local release; a license file remains required before any public distribution
- reserved post-1.0 development beginning with 1.1.0 for the upcoming visual redesign cycle

## 0.99.0

- added a deterministic local release builder that runs format, syntax, JSON, and regression checks before packaging
- changed release packaging to an explicit allowlist and removed the development-only `tests/` directory from distributable ZIPs
- added post-build archive expansion, forbidden-path checks, manifest identity checks, and SHA-256 comparison for every packaged file
- added the missing release checklist with separate automated candidate checks and manual 1.0 gates
- added a dependency-free workspace `package.json`, EditorConfig policy, UTF-8/whitespace checker, and documentation-link tests
- aligned README, compatibility, loot-engine, backup, roadmap, audit, and changelog documentation with the 0.99.0 candidate
- removed the invalid `license: "MIT"` manifest value because Foundry expects a file path or URL; license selection remains an explicit owner decision before 1.0.0
- expanded regression coverage from 65 to 67 tests

## 0.95.0

- completed the Foundry VTT 13/14 public-API compatibility pass for scene controls, ApplicationV2, DialogV2, compendium indexes, UUID lookup, and embedded Item creation
- declared the supported dnd5e 5.3 line in the module manifest, with 5.3.0 minimum and 5.3.3 verified
- verified module loading, the scene-control entry, the GM panel, both loot-rule engines, and rules-form submission on Foundry 14.360 with dnd5e 5.3.3
- kept Foundry `verified` at 14.360 until a real 14.364 runtime test is completed
- documented the compatibility evidence and the intentionally deferred two-client, Foundry 13.351, and Foundry 14.364 manual scenarios
- expanded regression coverage with manifest and stable-API contract guards

## 0.92.1

- fixed the loot-rules Save button performing a native browser form navigation instead of the configured ApplicationV2 submission
- made the rules window itself the single top-level form and removed the unbound nested form from its Handlebars part
- stopped saving loot rules from reloading the game view and corrupting the Foundry HUD layout until a hard refresh
- added a regression guard for the ApplicationV2 form tag, handler, template structure, and reset-form reference
- expanded regression coverage from 62 to 63 tests

## 0.92.0

- added an independently selectable `Rarity` or `Combined GP value` loot engine
- added editable `Loot Points -> target GP` rules and a configurable symmetric tolerance, defaulting to 10 percent
- normalized D&D5e item prices across PP, GP, EP, SP, and CP before value selection
- made value loot assemble different items toward the configured combined price while excluding invalid, zero, and unaffordable prices
- preserved the original rarity engine and made every rarity purchase evaluate its quantity formula independently
- prevented rarity draws from repeating an item until the remaining matching pool has been used
- extracted common, rarity, and value generation into separate testable helper modules with one result-summary contract
- updated rules UI, GM reward preview, result chat, persisted summaries, EN/PL localization, and configuration import/export
- expanded regression coverage from 54 to 62 tests

## 0.90.0

- renamed the module title, manifest ID, source folder, socket namespace, settings, flags, API lookup, and asset paths to Wildharvest / `wildharvest`
- renamed all active CSS classes from the former prefix to `wildharvest-*`
- renamed the localization namespace to `WILDHARVEST.*` and updated visible EN/PL branding
- changed configuration exports to the new `wildharvest-config` format
- intentionally started a clean data schema v1 without importing settings, flags, sessions, backups, or exports from earlier module IDs
- removed the last retired-content compatibility migration and its obsolete tests
- redirected validation, testing, and backup tools to the canonical `wildharvest` folder
- kept 54 regression tests, including guards for manifest/folder identity, old-brand removal, CSS/i18n prefixes, and export format

## 0.85.0

- removed the complete retired `gathering-content` companion module, authoring sources, compiled packs, and build scripts
- removed its dedicated workspace backup tool, installation recommendations, and redundant old local snapshots
- retained one final local retirement ZIP outside Git for recovery only
- kept the tested v4 legacy pack-reference migration without any runtime dependency on the retired project
- documented that loot compendiums must now come from the world, game system, or another independently managed source
- expanded regression coverage from 53 to 54 tests with a workspace-retirement guard

## 0.80.0

- removed the 271-entry embedded English translation catalogue from JavaScript
- made `lang/en.json` and `lang/pl.json` the only translation sources
- retained independent `auto`, `en`, and `pl` module-language modes by loading both JSON dictionaries during `i18nInit`
- registered Foundry settings and menus with localization keys and refreshed their labels after language loading or changes
- routed the rules form through the same module-language wrapper instead of bypassing forced language through Handlebars
- aligned EN/PL result formatting parameters and localized previously hard-coded internal setting metadata
- expanded regression coverage from 47 to 53 tests for locale loading, key parity, placeholder parity, reference coverage, and catalogue removal

## 0.70.2

- added audit scope for a second, selectable loot-generation mode based on normalized item value instead of rarity
- assigned the value-based engine, its settings, previews, migrations, and tests to roadmap stage 11 without changing the 14-stage plan

## 0.70.1

- fixed Foundry compendium index entries being identified only through `document.id` even though raw index data uses `_id`
- stopped different randomly selected items from collapsing into one reward stack such as `Book x8`
- preserved intentional stacking when the same actual compendium document is rolled more than once
- restored missing index IDs from Foundry collection keys and now reports malformed entries instead of silently grouping them
- expanded regression coverage from 45 to 47 tests for distinct `_id` reward keys and collection-key fallback

## 0.70.0

- replaced aggregate offer broadcasts with one minimal identifier-only offer per target player
- removed roll totals, rewards, Actor details, activity labels, and storage summaries from GM result socket messages
- kept private result details in Foundry whisper ChatMessages and reduced the result socket message to a neutral status
- removed Actor names and IDs from decision messages and targeted session-close notices individually
- restricted session panels, mutations, persistence, and authoritative socket messages to `game.users.activeGM`
- added neutral session-sync notices for secondary GMs and state reload on active-GM changes
- allowed a new active GM to claim an assigned pending offer after handoff without allowing duplicates
- expanded regression coverage from 40 to 45 tests for payload privacy and multi-GM ownership

## 0.60.0

- removed ready-time managed-inventory synchronization which could restore consumed items
- made the current system quantity field the sole source of truth for existing stacks
- stopped writing or reading `stackQuantity` for new reward operations
- retained legacy `stackQuantity` flags as inert data for the later namespace migration instead of mutating worlds automatically
- rejected fake stacking when an existing Item has no recognized system quantity field
- made stale preferred quantity paths fall back to a currently available supported path
- expanded regression coverage from 35 to 40 tests, including grant 5, consume 2, restart, and grant again

## 0.50.0

- moved offered search rolls, loot generation, reward grants, search logs, and chat creation to the GM client
- replaced player-submitted results with a constrained resolution request
- validated session, assigned player, offer status, actor ownership, roll mode, and modifier bounds on the GM
- persisted the one-time `resolving` lock before rolling and permanently consumed completed or failed attempts
- blocked duplicate UI submissions and removed `openSearchDialog` from the public module API
- preserved private result chat delivery to the requesting player
- expanded regression coverage from 29 to 35 tests, including forged sessions, actors, rewards, inactive users, wrong GMs, and duplicate requests

## 0.40.0

- made Foundry lifecycle hook callbacks synchronous because hook dispatch does not await promises
- registered module settings and the rules menu immediately during `init`
- moved custom translation preload startup to `i18nInit`
- coordinated ready-time maintenance through an internal promise without delaying socket registration
- contained and reported translation, socket-registration, and maintenance failures
- expanded regression coverage from 25 to 29 tests, including delayed and failed translation loading

## 0.33.0

- replaced the destructive `gathering-content` reset with targeted pack-reference removal
- preserved locations, activities, loot pools, unrelated compendiums, fallback packs, and custom rules
- retained empty post-cleanup pools so the GM can reconfigure them instead of losing presets
- stopped migration on invalid loot-pool JSON instead of replacing it with empty defaults
- removed the automatic legacy sample reset and obsolete legacy sample source
- advanced the internal data schema to v4 and expanded regression coverage to 25 tests

## 0.32.0

- added a mandatory in-world data snapshot before module migrations
- captured raw settings plus Actor and Item module flags for recovery
- added deterministic fingerprints, duplicate suppression, and a three-snapshot retention limit
- exposed read-only GM access to migration backup history through the module API
- expanded regression coverage from 16 to 21 tests, including a mocked Foundry persistence test

## 0.31.0

- established `ghateret` as the only active module source
- archived the retired `poszukiwania` 0.30.0 working copy
- redirected validation, tests, and backup tooling to the canonical source
- initialized the version roadmap and Git repository policy for the Wildharvest 1.0.0 migration

## 0.30.0

- prepared the module for a 1.0 release pass
- added release, testing, and manual QA documentation
- extracted pure session, search-engine, and GM control-panel state logic into smaller modules
- added regression tests for loot, session, and control-panel helper logic
- improved whisper targeting so search results go only to GM(s) and the searching player
- hardened persisted session restore and socket message validation
- optimized compendium reads for Foundry 13/14 by using compendium indexes
