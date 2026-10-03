# Wildharvest

Wildharvest is a Foundry VTT module for running search and harvesting scenes in D&D 5e.

Current release: `1.39.0`

## Compatibility

- Foundry VTT: minimum `14`, verified `14.360` (Foundry VTT 13 is no longer supported since 1.21.1)
- D&D5e: minimum `5.3.0`, verified `5.3.3`

The compatibility values remain conservative until additional live Foundry builds are tested by the project owner.

## Features

- GM control panel with Launch, Responses, Presets, and History views
- invitations for the whole party or selected players, with the list of recipients shown before sending
- one status bar for the latest scene on the Launch Scene tab: progress, each player's status or result, and the scene actions
- GM-authoritative rolls, loot generation, and reward delivery
- optional GM approval of the loot (**GM approves the loot** setting): before a player's loot is given, the GM can remove items, roll the loot again for the same roll, or give nothing; the window also flags a Combined GP value result that is outside the tolerance
- skill checks through the D&D5e skill roll (Reliable Talent, Halfling Lucky, bonuses and advantage from active effects), without a roll dialog or chat message; the **Roll skill checks through D&D5e** setting switches back to a plain d20 + skill total
- rarity-based and Combined GP value loot engines
- a difficulty per preset that raises or lowers the Loot Point thresholds for that place
- roll tables as a loot source: each Loot Point is one draw from the preset's tables, or the tables' items join the compendium pool
- compendium folders: a preset can take loot only from chosen folders of a compendium (with their subfolders), for example only the food of a trade goods compendium
- optional chat message with the search result (**Search result in chat** setting: public or whispered to the GMs)
- D&D5e container destinations such as backpacks and pouches
- English and Polish interface in the language chosen in Foundry
- follows Foundry's light and dark application theme, with a gold module accent

## Limitations

- Only physical D&D5e items can drop as loot: weapons, equipment, consumables, tools, loot and containers. Spells, features, classes, subclasses, backgrounds and species in an attached compendium are ignored, and the preset editor marks compendiums that contain no lootable items.
- Wildharvest has no compendiums of its own. Every preset needs at least one Item compendium with physical items (for example the D&D5e SRD items or a trade goods module) or a roll table whose results point to such items. Text results of a roll table give nothing.
- The character history keeps up to 30 rewards per search (since 1.33.0 the 30 most valuable when the loot has prices) and a Responses entry up to 10; larger finds are shown with an "and N more" note, and the full set is in the character's inventory.
- The Combined GP value engine builds the loot in stages. First it picks at most 20 different items per search by default, each in up to 5 copies (**Different items per search** in the loot rules, 1–100). If that stays below the tolerance range, a top-up stage adds further copies of those same items, one at a time to the smallest stack, so the stacks stay even. The second stage is bounded by **Copies per search (total)** (10–2000, 300 by default): when the pool is too cheap to reach the target, the loot stops at that limit and the GM's review window marks it as below the tolerance. With high limits and high GP targets on a large compendium, building the loot can take a few seconds; the GM's browser stays responsive while it runs.

## Installation

Install through Foundry using this manifest URL:

```text
https://raw.githubusercontent.com/NylramWhist/Wildharvest/main/module.json
```

For manual installation, download `Wildharvest-1.20.0.zip` from the matching GitHub release and extract its `wildharvest` folder into Foundry's `Data/modules` directory.

## First setup

1. Enable Wildharvest in a D&D5e world.
2. Open the Wildharvest scene control and configure at least one search preset.
3. Attach one or more Item compendiums.
4. Choose the Rarity or Combined GP value loot engine.
5. Run one GM-to-player test search before using the module in a session.

## Updating from 1.20.x

Wildharvest 1.21.0 changes the format of its saved data (data version 2). The first time the world starts with 1.21.0, the active GM's client saves a backup of the module settings and of Wildharvest data on actors, then converts the character history and the recent scenes to the new, smaller format. Keep a GM logged in until the world has finished loading. Search history written by 1.21.0 still opens in 1.20.x if you need to go back.

## Updating to 1.25.0

Wildharvest 1.25.0 stores the search presets as one list in a new world setting (data version 3) instead of two JSON texts. At the first start the active GM's client makes a backup, moves the presets to the new setting and removes the old ones. Scenes and history from earlier versions keep working. Configuration files exported by earlier versions can still be imported; files exported by 1.25.0 cannot be imported into earlier versions.

## Data backups

Before Wildharvest changes the format of its saved data, it stores a backup of its settings and of its data on actors in a world setting. Since 1.22.0 only the newest backup is kept, and a GM can delete it in the Presets tab (**Delete Backups**) once the update has worked; every player downloads this setting when the world starts.

A GM can restore a backup from the browser console (F12):

```js
const api = game.modules.get("wildharvest").api;
const [backup] = api.getMigrationBackups();
await api.restoreMigrationBackup(backup.id, { confirm: true });
```

The restore first saves the current state as a separate backup, then puts back the module settings and the Wildharvest data on actors and their items. Reload the world afterwards; if the backup is from an older data format, the data is converted again at the next start.

## Support

[Support Wildharvest on Ko-fi](https://ko-fi.com/tomorrokoshii)

## Licensing

No open-source license has been selected. See [LICENSING.md](./LICENSING.md) before copying, modifying, redistributing, or publishing the project.
