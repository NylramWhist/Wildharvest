# Testing Wildharvest

Run the automated project checks first:

```powershell
.\tools\validate-module.ps1
.\tools\test-module.ps1
```

The current 1.14.0 suite contains 96 tests. Its deterministic GM-plus-two-player harness covers authority, ownership, duplicates, active-GM handoff, interrupted recovery, one-time grants, and target-scoped socket contracts. The additional footer contract verifies the localized Ko-fi URL, GM-only source placement, secure external-link attributes, responsive styling, and absence of remote embeds. It does not launch a world or replace the manual matrix below.

## Minimal single-client smoke test

Use a clean dnd5e world and log in as GM.

1. Enable Wildharvest and reload the world.
2. Confirm exactly one Wildharvest button appears in scene controls.
3. Open the GM panel and visit Launch Scene, Responses, Presets, and History.
4. Open Game Settings, select Wildharvest, and choose Configure rules.
5. Confirm both loot engines, the tolerance field, and all LP rows render.
6. Save unchanged values and confirm the address remains `/game`, the window closes, and the HUD stays aligned.
7. Configure a world or system Item compendium and run one GM-only preview for each loot engine.

## Two-client GM and player test

1. Join the same world as one active GM and one player who owns an Actor.
2. Send the player one search offer.
3. Accept it as the player and submit the resolution once.
4. Confirm the GM session changes to Accepted before Resolving and a second submission is blocked.
5. Confirm only the active GM resolves the roll and grants rewards.
6. Confirm the roll window closes and a compact result window opens in the same screen area without creating a result chat message.
7. Confirm View all is available with 2, 4, and more than 8 different rewards; the summary shows at most eight tiles and the expanded list shows every full Item detail.
8. Confirm the granted Items and quantities match the result and its inventory status.
9. Change the active GM and verify the new active GM can continue pending work without duplicate resolution.
10. Interrupt one `resolving` entry. After the 30-second grace period, confirm an existing Actor-log result is recovered as Completed; without such a log it must become Failed and must not grant rewards again.

## Live two-player and GM-handoff matrix

Use one clean world, two browser/client sessions for players, and two GM accounts where available. Keep inventory and Actor History visible before every resolution.

| Case | Roles and action | Expected result |
|---|---|---|
| Independent offers | Active GM sends the same scene to Player 1 and Player 2 | Each player sees only their own offer; both GM rows remain independent |
| Actor ownership | Player 2 attempts to use Player 1's Actor, then uses their own Actor | The foreign Actor cannot resolve the offer; the owned Actor can |
| Duplicate submission | Player 1 submits once, then repeats the action or request | One Completed result, one Actor-log entry, and one inventory grant |
| Parallel completion | Both players accept and resolve their own offers | Both rows complete with their own roll, Loot Points, rewards, and result window |
| Active-GM handoff | Queue/accept work for GM 1, then make GM 2 active before processing pending work | GM 2 becomes the sole authority; GM 1 cannot broadcast or mutate session state |
| Persisted recovery | Interrupt after the Actor result/inventory grant exists but before session completion persists | The new active GM recovers Completed from Actor History without another grant |
| Missing-result recovery | Interrupt `resolving` before an Actor result exists and wait past the grace period | The entry becomes Failed and no reward is granted |
| Target isolation | Compare the offer and completion notice received by both players | Each notice is directed to one player; no other Actor, roll, or reward payload leaks through the socket |

## Value-engine test

Use a test compendium with prices in PP, GP, EP, SP, and CP.

1. Select Combined GP value.
2. Set 5 LP to 5 GP with a 10% allowed difference.
3. Run enough previews to see mixed Items rather than a single multiplied document.
4. Confirm an available exact combination such as 1 + 2 + 1 + 1 GP consistently reaches 5 GP rather than occasionally stopping at a worse greedy total.
5. Confirm every accepted result stays between 4.5 and 5.5 GP unless the UI explicitly reports no combination within tolerance.
6. Confirm missing, zero, negative, or malformed prices are excluded and reported.
7. Include two Items with the same document `_id` in different compendiums and confirm they remain separate rewards.

## Configuration integrity test

1. Export the current Wildharvest configuration.
2. Import a copy that references one available Item pack, one missing pack, and one non-Item pack; confirm only the available Item pack remains attached.
3. Attempt an import containing duplicate location, activity, loot-pool, rarity-rule, Loot Point threshold, or value-bracket IDs and confirm it is rejected before settings change.
4. After a normal import, confirm locations, pools, rules, selected fallback packs, and data version all update together.

## Inventory persistence test

1. Grant five units of a stackable Item.
2. Consume two units through the dnd5e sheet.
3. Reload or restart the world.
4. Confirm three units remain.
5. Grant two more and confirm the stack becomes five, not seven or another value derived from an old module flag.

## Accessibility and visual resilience test

1. Open the GM panel without using the mouse and navigate its tabs with Arrow Left/Right, Arrow Up/Down, Home, End, Tab, and Shift+Tab.
2. Confirm the active tab is announced and every keyboard-focused button, field, tab, tab panel, and reward-details summary has a visible focus indicator.
3. Open and close a Preset editor, import/export window, confirmation dialog, player offer, roll window, and result window; confirm focus starts on a useful control and returns to a connected parent window where applicable.
4. Repeat the player offer, roll, and result flow with the operating system's reduced-motion preference enabled; confirm the action shimmer and other motion are disabled.
5. Review Polish and English labels, long Actor/Item/compendium names, all rules tables, and every GM tab at 1280×720 and 125%, 150%, 175%, and 200% scaling.
6. Confirm no control becomes unreachable and no table, panel, result list, or footer overlaps or escapes its window.
7. Confirm the Ko-fi banner appears at the right side of the GM footer in English and Polish, remains keyboard-focusable, opens `https://ko-fi.com/tomorrokoshii`, stacks below the update status on narrow windows, and never appears in player windows.

## Refactored dialog and stylesheet smoke test

1. Open configuration export and import from both the GM control panel and the full GM configuration window; confirm both paths render, cancel, confirm, and return focus correctly.
2. Send a player offer and confirm its appearance, Accept and Decline actions, locked roll window, second result window, and automatic inventory delivery are unchanged.
3. Visit Launch Scene, Responses, Presets, and History, then open the player offer, roll, and result windows; confirm the dedicated GM and player stylesheets load without an unstyled flash or missing layout.
4. Confirm all icons used by the control panel and player flow still render after legacy asset removal.

Record Foundry build, dnd5e version, browser, role, pass/fail, and any console error for every manual run. The version-specific matrix is maintained in [COMPATIBILITY.md](./COMPATIBILITY.md).
