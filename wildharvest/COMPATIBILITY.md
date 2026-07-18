# Compatibility

Wildharvest 1.14.0 retains the public API contract established for 1.0.0 and extended in 1.9.0 with the public `updateUser` hook plus User `setFlag`/`unsetFlag` methods. The 1.10.0 loot/import layer, 1.11.0 DOM accessibility layer, 1.12.0 internal DialogV2/CSS boundaries, 1.13.0 test-only integration harness, and 1.14.0 semantic external support link operate on the already reviewed Compendium, settings, DialogV2, and standard browser surfaces available in Foundry 13 and 14. The manifest intentionally records only versions for which the project has concrete evidence.

## Supported runtime

| Foundry | dnd5e | Verification level | Result |
|---|---|---|---|
| 13.351 | 5.3.x | official API review and automated contract tests | compatible API surface; live world test still required |
| 14.360 | 5.3.3 | local runtime test on 2026-07-11 | passed |
| 14.364 | 5.3.x | official API review | live world test required before raising `verified` |

The module manifest therefore declares Foundry minimum `13.351`, Foundry verified `14.360`, dnd5e minimum `5.3.0`, and dnd5e verified `5.3.3`. No maximum is declared so later compatible patch versions can be evaluated without an artificial hard block.

The same evidence is stored in the test-only `tests/compatibility-matrix.json` contract. Its 14.364 row remains a candidate and its live status remains `owner-required`; the automated test fails if this matrix drifts away from the manifest or this document.

The official dnd5e 5.3 release line supports Foundry VTT 13 and 14. Wildharvest relies on its prepared `system.skills.<id>.total`/`mod`, Item `system.price.value` and `system.price.denomination`, and numeric Item `system.quantity` data.

## Reviewed Foundry APIs

The compatibility pass checked the following public surfaces in both API generations:

- `foundry.applications.api.ApplicationV2`
- `foundry.applications.api.DialogV2`
- `foundry.applications.api.HandlebarsApplicationMixin`
- `getSceneControlButtons` using the record-shaped controls and tools collections
- `CompendiumCollection#getIndex({ fields })`
- `foundry.utils.fromUuid`
- `Actor#createEmbeddedDocuments("Item", ...)`
- `User#setFlag` and `User#unsetFlag`
- `updateUser(user, changes, options, userId)`

Wildharvest does not use the legacy global `Application`, `FormApplication`, or a global `fromUuid` fallback.

## Local Foundry 14 result

The local check used Foundry 14.360 and dnd5e 5.3.3 as GM. It confirmed:

- the module loads and contributes one Wildharvest scene-control button;
- the GM control panel opens and renders;
- the settings category exposes the rules menu;
- the rules form renders both `Rarity` and `Combined GP value` engines, the 10% tolerance, and LP-to-GP rows;
- submitting unchanged rules keeps the browser at `/game`, closes the rules form, and leaves the Foundry HUD usable.

## Automated two-client model in 1.13.0

The test-only integration harness models two active GMs, two active players, two separately owned Actors, persisted sessions, processed request IDs, Actor-log results, and grant counts. It uses the production request validator, authority state transition, completion guard, interrupted-resolution recovery, and socket authorization functions. The current 96-test suite verifies:

- each player can accept and complete only their own offer with an Actor they own;
- a forged cross-player Actor selection is rejected without consuming the valid offer;
- replaying a processed request and submitting again after completion cannot grant another result;
- a request created for the former valid GM can be processed by the new active GM after handoff, matching the authenticated User-request runtime path;
- a persisted Actor result completes an interrupted entry exactly once after handoff, while repeated recovery is inert;
- only the current active GM can send state messages, and offer/result notices remain scoped to one target player.

This is an integration contract for module logic, not a replacement for Electron, server synchronization, timing, DialogV2 rendering, dnd5e document preparation, or an actual multi-client Foundry session.

## Remaining live checks before expanding compatibility claims or public distribution

These checks are deliberately left manual. Automated contracts are complete, but live runtime evidence must still come from the owner-managed Foundry runs:

1. Start a clean Foundry 13.351 world with a compatible dnd5e 5.3.x release and run the smoke flow in `TESTING.md`.
2. Repeat the smoke flow on Foundry 14.364 before changing the manifest's `verified` value.
3. Run a two-client GM-to-player offer, confirm the accepted User request reaches only the active GM authority path, submit one resolution, and verify the second result dialog, Actor-log synchronization, and inventory grant.
4. During a test resolution, change or disconnect the active GM. Confirm the new active GM recovers an existing Actor-log result or marks the entry failed after the grace period without granting rewards twice.
5. In value mode, draw from a real pack containing PP, GP, EP, SP, and CP prices and verify the combined total and tolerance.
6. Grant a stack, consume part of it, restart the world, and verify the consumed quantity does not return.

## Official references

- [Foundry V13 scene controls hook](https://foundryvtt.com/api/v13/functions/hookEvents.getSceneControlButtons.html)
- [Foundry V14 scene controls hook](https://foundryvtt.com/api/v14/functions/hookEvents.getSceneControlButtons.html)
- [Foundry V13 ApplicationV2](https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html)
- [Foundry V14 application API](https://foundryvtt.com/api/v14/modules/foundry.applications.api.html)
- [Foundry V13 CompendiumCollection](https://foundryvtt.com/api/v13/classes/foundry.documents.collections.CompendiumCollection.html)
- [Foundry V14 CompendiumCollection](https://foundryvtt.com/api/v14/classes/foundry.documents.collections.CompendiumCollection.html)
- [Foundry V13 User](https://foundryvtt.com/api/v13/classes/foundry.documents.User.html)
- [Foundry V14 User](https://foundryvtt.com/api/v14/classes/foundry.documents.User.html)
- [Foundry V14 document update hook contract](https://foundryvtt.com/api/v14/functions/hookEvents.updateDocument.html)
- [Foundry module manifest relationships](https://foundryvtt.com/article/module-development/)
- [Official dnd5e releases](https://github.com/foundryvtt/dnd5e/releases)
