# Changelog

## 1.39.0

- the Combined GP value engine now reaches high GP targets on cheap pools. After the first stage (at most **Different items per search** items, each in 1–5 copies) a top-up stage adds further copies of those same items whenever the total is still below the tolerance range: always one copy to the stack that has the fewest, so the stacks differ by at most one where the prices allow it. A tuning stage may then add a cheaper item from the pool to close the last gap.
- new loot rule **Copies per search (total)** (10–2000, 300 by default): the top-up stage stops there even when the total is still below the tolerance, and the result is marked as below the tolerance in the GM's review window. Rules saved before this version get 300; an emptied field is an error, as with the limit of different items.
- the 5-copy cap applies to the first stage only, so a 1000 GP search on a compendium of cheap trade goods no longer ends at a few hundred GP
- the top-up stage aims at the GP target instead of the lower edge of the tolerance range, so a topped-up result no longer always lands 10 % short
- when even the priciest items in the pool cannot reach the tolerance range in the first stage, the engine skips the search over sums and seeds one copy of each item instead, leaving the total to the top-up stage: the same even stacks, and a search that took about a second now takes a few milliseconds. The reachability check counts the copy limit as well, so a low **Copies per search** no longer makes the search slower instead of faster.
- the search over sums picks items that tile the target rather than the priciest ones, so on a cheap pool the top-up stage could run out of copies well short of the range. When the search misses the range, or the copy limit stops it short of the target, the engine now also seeds the stacks and keeps whichever attempt came out closer: targets around 1000–1700 GP on a compendium of cheap goods used to land outside the tolerance about half the time, and now land on it.
- a tolerance of 100 % no longer switches the top-up stage off (its lower bound is 0, which used to count as "already in range" and reported any sum as a success)
- the engine result carries `maxTotalItems`, `topUpEntryCount` and `hitTotalLimit` for the GM windows and the history. `hitTotalLimit` means the copy limit stopped the stage short of the target, which may still be inside the tolerance range.

## 1.38.1

- one pressed, disabled and keyboard-focus state for every button, tab, link and summary of the module windows (end of `styles/icons.css`): a pressed button moves down 1 px and darkens a little, a disabled button is dimmed and ignores hover, and the same 2 px focus ring shows on every control (it replaces the separate disabled rule of the GM sheet)
- plain "nothing here" notes inside the module windows (empty lists, no rewards, no responses) use the same dashed card as the empty states with an icon, through the new `--wh-empty-border` and `--wh-empty-bg` tokens
- the empty Responses tab tells the GM where to send a scene from (EN and PL)
- transition and animation durations and easing come from tokens (`--wh-motion-fast/base/slow`, `--wh-ease`, `--wh-ease-out`) instead of values written in each rule; reduced motion keeps switching them off

## 1.38.0

- one set of design scales in `styles/tokens.css` (on `:root`, so the chat result card uses them too): three radii (`--wh-radius-sm/md/lg` = 4 / 8 / 12 px, plus `--wh-radius-pill`), a spacing scale (`--wh-space-0..4` = 2 / 4 / 8 / 12 / 16 px), a type scale (`--wh-fs-xs..4xl`), line heights (`--wh-lh-*`), weights (`--wh-fw-*`) and the three font stacks (`--wh-font-heading`, `--wh-font-ui`, `--wh-font-mono`)
- every gap, padding, margin, font size, radius, line height, font weight and font family of the module stylesheets now comes from those scales instead of values written in place; values between two steps snap to the nearest one, so spacing and text sizes differ from before by up to about 2 px and the player cards, which used radii from 10 to 18 px, now use 8 or 12 px
- the old GM radius names (`--wildharvest-gm-radius-sm/md/lg`) now all point to the small radius, as before they were 3 to 5 px
- fonts are unchanged (Georgia headings, Signika for the player interface, a monospace font for the code field); only their place of definition moved to the tokens

## 1.37.3

- one tick box look in the whole module (`wh-check` in `styles/icons.css`): a square box with a border and an accent fill with a tick when ticked, level with the first line of its text; it replaces Foundry's default box that stretched to the height of its row and showed the tick only in the top part. Used for the compendium, folder and table lists and the recipients of the Workbench, the items of the loot review, and the two options of the loot rules window; a ticked card is also highlighted as a whole, and the box stays visible in the high contrast mode
- the loot rules window lays its options out as rows of label and control: the label no longer breaks over three lines and the number fields have a fixed width (they stack below the label in a narrow window)
- the cards of the compendium, folder, table and recipient lists are grids again (the general label rule of the window had turned them into centred rows), with the tick box at the top
- the preset icon, the scene bar icon and the icons of the empty states of the Workbench use the shared icon component from 1.37.2

## 1.37.2

- icons in the player windows (invitation, roll, result) are centred in their boxes: the emblem, the section badge and the header icon sat off-centre because a grid wrapper placed the glyph at the start of its box (up to 6.5 px for the emblem)
- new shared icon component (`styles/icons.css`, classes `wh-icon` and `wh-icon-frame`, sizes from the `--wh-icon-size-*` tokens) replaces the separate centring rules of each icon

## 1.37.1

- sending a scene, the GM test roll and the reward preview now stop on the same problems the Presets tab shows as "needs attention" (a deleted folder, folders without lootable items, no lootable items); the compendium indexes are loaded first, so a preset whose folders hold no lootable items no longer slips through when the index was not loaded yet
- the loot review window (GM approves the loot) shows a note when a Combined GP value result is outside the tolerance, for example 97 of 100 GP when 90–110 GP is allowed
- in the preset editor the subfolders of a ticked folder are marked as included, the folder list scrolls inside the editor, and the list keeps the focus on the box you ticked
- the reward preview says that roll-table presets draw from the tables, and in Combined GP value mode that the counts show the whole pool while one search gives at most the set number of different items
- an emptied **Different items per search** field is now reported as an error instead of being saved as 20
- removed the player window background gradient that was always overridden by a later rule and used variables that no longer exist

## 1.37.0

- presets can use only some **folders of a compendium**: the preset editor lists the folders of the selected compendiums, and a compendium with ticked folders gives only the items in them and their subfolders; a compendium with no ticked folder is used whole
- the Launch Scene and Presets tabs show the chosen folders after the compendium name, and the reward preview counts only the items in them
- a preset whose folder was deleted, or whose folders hold no lootable items, needs attention; a compendium whose ticked folders were all deleted gives nothing (it does not fall back to the whole compendium)
- folders are ignored when every Loot Point draws from roll tables; presets saved by earlier versions use whole compendiums as before, and configuration files exported by 1.37.0 carry the folders

## 1.36.0

- presets can use **roll tables** (world tables or tables in compendiums) as a loot source, chosen in the preset editor
- two ways for the tables to give loot, set per preset: **each Loot Point is one draw** from the tables (in turn when there are several; the compendiums are not used), or **the items of the tables join the compendium pool** (the Rarity or Combined GP value engine picks from them; the table weights are not used, and only Items stored in compendiums are added)
- only table results that point to physical items give loot; text results and other documents are skipped; drawing does not post to chat and does not mark results as drawn
- a preset with only roll tables no longer needs a compendium; a preset whose table was deleted needs attention, and a scene already sent skips the missing table and draws from the others
- a preset that adds table items to the pool without a compendium needs attention when its tables hold no compendium items
- the Launch Scene and Presets tabs list the tables as "Table: <name>"; the reward preview shows the tables and their number of results
- table loot stacks with the same items from compendium loot, and keeps the item price for the result window when the item has one

## 1.35.0

- presets have a **Difficulty** (from -20 to 20, 0 by default): it is added to every Loot Point threshold, so +2 needs a total 2 higher for the same loot and -2 makes the place easier; the Presets tab shows it under the skill, and the reward preview, the loot review and the "how much was missing" hint use it
- presets saved by earlier versions get difficulty 0; configuration files exported by 1.35.0 carry the difficulty
- new world setting **Search result in chat**: no message (default), a public message, or a whisper to the GMs; after the loot of a player's search is given it posts the roll, the Loot Points and up to six most valuable items (the GM's own test rolls are not posted)
- the character history keeps the difficulty of each search when it was not 0

## 1.34.0

- new world setting **GM approves the loot** (off by default): after a player's roll the GM sees the found items in a review window before anything is given
- a roll that found no items goes straight to the player without a review
- in the review window the GM can untick items, roll the loot again for the same roll total, or give nothing; closing the window gives the ticked items
- the player is told that the roll is done and the GM is checking the loot, instead of a "no answer yet" warning after a minute
- the Workbench shows such a player as **Awaiting your approval** in the scene bar and on the Responses tab
- while one review window is open, other players' requests are still handled; each roll gets its own window
- a review interrupted by a GM reload, or ended after another GM became the active GM, gives nothing; the roll is marked as failed like any interrupted resolution
- a scene cannot be closed while one of its rolls is in an open review window
- if rolling the loot again fails (for example a missing compendium), the GM is told and the loot shown before is kept
- a result with Loot Points but no items (the GM gave nothing, or nothing fitted the GP target) no longer says it was a good find
- the player waits up to ten minutes for the review before the usual "no answer yet" warning

## 1.33.1

- Responses: the rows of the recent scenes list no longer spill their second line (time, send mode, state) onto the next row; Foundry's fixed button height cut them short; the same fix keeps the History entries whole in a narrow Workbench
- History: in a narrow Workbench the entries use the stacked card layout again; a table rule without the location column overrode it, so the rows ran out of the pane
- Responses: in a narrow column a player's response keeps the name and the expand button on the first line and moves the roll, Loot Points and status to a second line, instead of running out of the card
- Presets and History switch to their stacked layout already in a medium-width Workbench (up to about 940 px of content), where the table columns were too narrow for the Polish texts; the History table then scrolls within 20 rem
- Presets: the reason a preset needs attention is shown under its name instead of squeezed into the status column

## 1.33.0

- the result window shows a summary above the items, such as "Items: 42 · 10 GP in total" (the total value in Combined GP value mode)
- the eight item tiles show the most valuable items ("Most valuable") instead of the first eight found
- **View all** groups the items by type (weapons, equipment, consumables, tools, containers, loot, other), most valuable first within each group
- the character history saves the item type with each reward and, when a search finds more than 30 kinds of items, keeps the 30 most valuable instead of the first 30; entries saved before 1.33.0 are shown without groups
- an empty result after a roll below the first Loot Point says how much was missing, for example "The first Loot Point needs a total of 10; the roll was 3 short."
- removed the player window styles for the old dialog button bar, which Foundry 13 and later no longer use

## 1.32.0

- the invitation window is called "Invitation: <scene>" instead of only "Wildharvest", and shows the scene, the skill check and the description in a short header, with the question right above the buttons
- **Join Search** and **Search the Area** are filled with the module accent and the second button (**Skip**, **Cancel**) is quiet and narrower, so the main choice stands out; the player window buttons had lost their own styling since Foundry 13 moved dialog buttons into a new footer, and are styled again
- the roll window has a one-line header and its fields have the labels above them, two or three in a row, so the whole form fits without scrolling and labels such as "Loot destination" no longer break over two lines
- a player with one character sees the character's name instead of a list with one entry
- removed the unused "Wildharvest" title and "Skill" section keys

## 1.31.0

- the Workbench, the loot rules window and the roll and result windows change their layout from the width of the window instead of the screen (`@container` rules instead of `@media` rules on the screen width); a narrowed Workbench switches to one column by itself; only the loot rules window's own size still follows the screen
- History: in a medium-width Workbench the characters are a row above the table and the entry details stay next to the table instead of below it; the result column is called "Result", so its header is no longer cut off; the last row of the details (the date) is no longer cut off
- Responses: the recent scenes are grouped by day, and each row shows the time, the send mode, the progress and whether the scene is open or closed; the **Open Responses** button is no longer shown on the Responses tab itself
- Presets: **Create New Preset** comes first; a preset that needs attention shows the reason in the row, not only in a tooltip; the icon buttons name their preset for screen readers ("Edit: SRD Items"); the repeated skill code under the skill name is gone
- keyboard: after a click or a live update redraws a tab, the focus returns to the same control instead of the window; the arrow keys, Home and End move between the characters, the history entries, the recent scenes and the filter buttons
- cards in the Workbench no longer stretch their rows in a tall window

## 1.30.0

- the Launch Scene tab has one status bar for the latest scene at the top ("Latest scene", so a closed scene is no longer called active): name, status, send mode and time, progress, each player's status or roll and Loot Points, and one set of buttons (Open Responses, Send Reminder, Close Scene); the "Active scene" box and the "Live responses" card, which showed the same scene with the same buttons, are gone
- with **Whole party** selected, the tab lists who will get the invitation (every player who is logged in, with their character); with nobody logged in it says so before sending; the list updates when a player logs in or out
- removed the **Presets** button next to Test Roll and Preview Rewards, which only repeated the Presets tab
- removed the live response filters from the Launch Scene tab (the Responses tab keeps its own filters), the two old templates and their styles

## 1.29.0

- the invitation, roll and result windows follow Foundry's light and dark application theme too, with the same gold accent as the GM windows; the separate player colour set and its second accent are gone
- the about 120 colours written directly in the player stylesheet now use the module tokens from `styles/tokens.css`
- the reward preview's "Loot source" and "Available items" labels are readable in the light theme
- in the light theme the accent and state colours are darker again and the default buttons use a lighter accent tint, so text on stacked cards and highlighted rows keeps at least 4.5:1 contrast
- dimmed text (dates, counts in the history) is a little brighter in the dark theme and darker in the light theme, so it stays readable on the highlighted row
- a partly successful search has its own olive status colour again, between the success and warning colours
- contrast checked on every Workbench tab, the reward preview, the invitation, the roll window and the result windows in both themes

## 1.28.0

- the Workbench, the loot rules window and the other GM windows follow Foundry's application theme: the parchment background and dark text in the light theme, Foundry's dark background in the dark theme, with the module's gold accent in both
- new `styles/tokens.css` with the module's colour tokens (text, surfaces, borders, accent, states), built on Foundry's theme variables; the roughly 200 colours written directly in the GM stylesheets now use these tokens, and the two separate GM colour sets are gone
- in the light theme the accent and state colours are darker, so text keeps at least 4.5:1 contrast (checked on every Workbench tab in both themes)
- with the operating system's "increase contrast" setting, borders are stronger and muted text is shown at full strength
- the player windows keep their current look until the next version

## 1.27.0

- the module uses Foundry's own translations: texts follow the language chosen in Foundry, and the separate **Module language** setting is removed (a value saved by earlier versions is ignored)
- all windows, including the loot rules window title and the Workbench title, now change language together with Foundry
- the Workbench tabs (Launch Scene, Responses, Presets, History), its header, tab bar and footer are ApplicationV2 parts built from Handlebars templates (`templates/gm`) instead of HTML written in JavaScript; a refresh redraws only the open tab and the footer
- removed the module's own translation loader and the four old Workbench templates that only inserted HTML built in JavaScript

## 1.26.0

- the invitation, the roll window, the result window, the preset editor, the reward preview, configuration export and import, and the confirmation windows are built from Handlebars templates (`templates/player`, `templates/dialogs`, `templates/partials`) instead of HTML written in JavaScript; they look and work as before
- the templates are loaded once when the world starts, so the windows still open immediately

## 1.25.0

- search presets are stored as one list in a new world setting with a validated data model (data version 3), instead of two JSON texts ("locations" and "loot pools") with a hidden internal location
- at the first start the active GM's client backs up the module data, moves the presets to the new setting and removes the two old settings; scenes and history from earlier versions still open, because the presets keep their ids
- configuration export files now hold the preset list (file version 2); files from earlier versions (version 1) can still be imported
- removed the settings code that parsed locations and loot pools, 14 translation keys used only by it, and the circular import between the settings and the preset editor
- restoring a data backup made before 1.25.0 brings back the presets it holds (the old settings are used until the world is reloaded and migrated again)

## 1.24.0

- the search check is rolled by the D&D5e system (the character's skill roll) on the GM's side, so Reliable Talent, Halfling Lucky, roll bonuses and advantage or disadvantage from active effects count as they do on the character sheet; no roll dialog opens and no chat message is posted
- a player's extra modifier and advantage or disadvantage choice are added to that roll; the player's choice does not cancel advantage the character already has from an effect
- new world setting **Roll skill checks through D&D5e**, on by default; turned off, Wildharvest rolls a plain d20 + the skill total as before
- the history records the roll mode actually used, so advantage from an effect shows as advantage
- if the system cannot roll the skill (for example a preset skill that D&D5e does not know, or another module's roll hook stops or breaks the roll), Wildharvest falls back to its own roll
- when the GM runs a search with a base modifier different from the character sheet, Wildharvest uses the GM's number with its own roll

## 1.23.0

- the Combined GP value engine gives at most 20 different items per search by default; the new **Different items per search** field in the loot rules sets the limit (1–100), and each item can still come in up to 5 copies
- on a large compendium the engine looks at a random sample of items that fit the budget instead of all of them, preferring items expensive enough to reach the target within the limit; on a compendium of about 1,000 items a 250 GP search now takes well under a second instead of over 13 seconds and gives about 30 items instead of about 670
- while the value loot is being built, the GM's browser pauses the work every few milliseconds, so the interface stays responsive even with high limits, also when Foundry is in a background tab
- existing loot rules without the new field use the default of 20

## 1.22.0

- only the newest data backup is kept: a new backup made before a data update replaces the previous one, and at the first start on 1.22.0 older backups are removed (in a world updated from 1.20.x this frees a few hundred kilobytes that every player downloads)
- the Presets tab has a **Delete Backups** button, shown when a backup exists, with its size in the confirmation
- new GM-only API functions: `restoreMigrationBackup(id, { confirm: true })` puts module settings and Wildharvest data on actors and items back as they were in the backup, after saving the current state as a separate "pre-restore" backup; `deleteMigrationBackups()` removes all backups
- documented backups and restoring in the README

## 1.21.3

- the Workbench tab content now scrolls inside its own area, so it no longer runs under the footer ("Last updated" / Ko-fi) at the bottom of the window
- in a tall window the Presets tab no longer stretches its header and search bar, which left a large empty gap above the preset list
- the "Recent scenes" list shows when each scene was sent, so scenes from the same preset can be told apart
- a search that finds nothing shows one message instead of two ("No items were found this time" and "No rewards were added")
- the "Active scene" heading has its own colour and stays readable when Foundry uses the light theme
- focused fields in the Workbench get a solid outline instead of a faint glow
- accessibility: the buttons that expand a player's response have a name for screen readers, tabs point to their panel only when it exists, item pictures in the result window no longer repeat the item name for screen readers, and the inventory message in the result window is announced as a status
- removed 31 unused CSS classes left over from windows removed in earlier versions

## 1.21.2

- interface texts in English and Polish now use one set of terms: a "search scene" ("scena poszukiwań") is what the GM sends, a "search" ("przeszukanie") is a player's roll in it, an "invitation" ("zaproszenie") is what a player receives, and "Wildharvest" / "Zbieractwo" is used only as the module name
- "Clear logs" in the History tab is now "Clear History", with matching confirmation and notification texts
- player notices no longer say that "the GM rejected your request": they explain that the roll could not be made and what to do next, and speak about the player's roll or answer instead of a "request"
- the result window now shows a short description of the find under the numbers (for example "You turn up a solid haul"); these texts already existed but were never displayed
- GP values in the result window and in the reward preview use the number format of the module language (for example "0,02 GP" in Polish), and the preview shows "PŁ" instead of "LP" in Polish
- fixed Polish texts that said "wildharvest" instead of a word ("Gracz odrzucił wildharvest", history hint) and texts that still mentioned the fallback compendium settings removed in 1.21.0
- consistent capitalisation: window titles, tabs and buttons in Title Case, labels, headings inside cards and messages in sentence case; Polish texts address the player with lowercase "ty"

## 1.21.1

- Foundry VTT 13 is no longer supported: the module now declares Foundry VTT 14 as its minimum version (verified on 14.360)
- when several browser windows are logged in as the same GM, only the oldest one now handles player requests; the others no longer answer a player with a false "the GM rejected this request" and cannot resolve the same roll twice; if that window closes, another one takes over within about 25 seconds
- module socket messages now carry the id of the sending window, so windows of the same user see each other's scene updates
- the History tab no longer shows the internal preset location ("Wildharvest Options") as a place; the Location column appears only when an entry names a real location
- the loot destination list in the roll window shows only containers lying directly in the inventory (not vials, jugs or bags stored inside another container), lists equipped containers first, and adds the number of items inside when two containers share a name
- new items are created in batches of up to 100 per request to the server
- after changing the module language, the open Workbench updates its title bar as well as its content
- a preset whose compendiums hold no lootable items now shows "Needs attention" instead of "Ready" and cannot be sent

## 1.21.0

- saved data now uses a smaller format (data version 2); the first start of the world on this version migrates existing data once, after an automatic backup of the module settings and of Wildharvest data on actors
- character history stores a short summary of each search: names, roll, modifiers, Loot Points, destination and up to 30 rewards (name, quantity, image and compendium link); larger finds show "and N more", and the full set stays in the inventory; a history of 25 large trade-goods searches drops from about 2 MB to about 160 KB per character
- recent scenes keep only a summary of each player's result with up to 10 rewards, and the world keeps the newest 20 scenes instead of 50; scenes no longer store loot draw groups, so the setting sent to every client at startup shrinks from megabytes to tens of kilobytes
- each player request is now stored under its own key on the player's User (`flags.wildharvest.requests.<id>`), so a decision and a roll request sent while the GM is busy can no longer overwrite each other; the GM handles them oldest first and removes each one after handling it, and players clear only their own expired requests
- dates in history and scenes are stored in ISO format and shown in the module language, so switching between English and Polish also changes how existing dates look; older dates written in Polish or English format are converted during the migration
- character lists are sorted according to the module language instead of always Polish
- removed the unused fallback loot compendium setting (`randomLootPack`, the `@selected` alias); its stored value is removed from the world during the migration, configuration exports no longer contain `selectedRandomLootPackIds`, and an activity without a loot pool now reports that clearly
- if the migration fails, the GM sees a notice, the data version stays unchanged and the migration is tried again at the next start

## 1.20.6

- all interface icons now use Font Awesome, which ships with Foundry, instead of the module's own SVG images; the module no longer includes third-party icon files
- icons follow the colour of the theme and of the text around them, so status icons (for example "added to inventory") take the colour of their status, and icons stay visible in high-contrast (forced colours) mode
- removed the `assets/ui/icons` folder

## 1.20.5

- rewards are now added to the character in batches: each compendium is read with one `getDocuments` query, new items are created with one `createEmbeddedDocuments` call and existing stacks are raised with one `updateEmbeddedDocuments` call, instead of several requests per item; large finds (for example a few hundred trade goods) no longer keep the GM's queue busy for tens of seconds
- items taken from a compendium are prepared with `game.items.fromCompendium()`, so they keep their compendium source (`_stats.compendiumSource`) like items dragged from a compendium by hand
- if Foundry rejects the batch, the items are retried one by one, so a single invalid item no longer blocks the rest of the rewards
- several rewards for the same item in one search now go to a single stack with the combined quantity

## 1.20.4

- removed unused code: the unreachable legacy configuration and resource-log dialogs, the old GM offer and Responses dialogs (the Workbench replaced them), the unused location/activity pickers in the roll window and a set of unused helper exports; about 1,450 fewer lines of JavaScript
- removed 158 translation keys that no code used any more, from both English and Polish
- result wording ("some", "good", "rich" loot) and the colour of the result window now scale with the highest Loot Points in the GM's rules instead of fixed limits; with the default rules nothing changes
- the GP value preview now counts only items with a positive price within the allowed difference for each target, instead of every item with a price field
- the loot rules form can now add and remove rows in the Loot Point and GP value tables; empty new rows are ignored on save, "Reset form to defaults" restores the default rows, and the rarity point cost field no longer accepts 0, matching the validation
- the result and rewards icons now share one file

## 1.20.3

- completed the Polish translation: rarity names, Loot Points (now "Punkty Łupu", abbreviated "PŁ") and rarity terms in rules, preview and error texts are no longer in English, and Polish texts consistently call the module "Zbieractwo"
- the GM Test Roll now starts on "No character save", so test rewards reach a character only when the GM picks one
- the module language now defaults to "Auto (follow Foundry)" instead of English; users who already chose a language keep their choice
- the default player roll limits now allow an extra modifier of up to ±100 (previously ±20) together with advantage/disadvantage selection; existing worlds keep their saved rules until the GM changes them or uses "Reset form to defaults" in the loot rules

## 1.20.2

- loot is now drawn only from physical item types (weapon, equipment, consumable, tool, loot, container); spells, class features, classes, subclasses, backgrounds and species from an attached compendium can no longer be granted by a search, including the Rarity preview
- the preset editor marks compendiums with no lootable items, and a preset without any lootable items reports that clearly instead of a generic empty-pool error
- entries in the fallback resource flag are now removed with `unsetFlag` and addressed by path, so rewards later added to the inventory no longer leave stale fallback entries behind
- the result window no longer mentions an inaccessible "fallback store"; players who did not receive every item are asked to contact the GM, with all found items listed in the window
- a pre-migration backup is created only when the stored data version changes, so installing a new module release no longer adds a redundant backup to the world settings
- removed listeners for the non-existent `createCompendium` and `deleteCompendium` client hooks
- documented loot limitations in the README

## 1.20.1

- fixed player requests that could be silently dropped while the GM was busy with another player's scene: the previous request is now removed from the User flag before a new one is written, so `setFlag` can no longer merge a stale decision into a roll request
- the GM now answers invalid or expired player requests with a rejection notice instead of discarding them, and the player sees why the request was not accepted
- players get a notice when the GM has not answered a roll request within 60 seconds; the request stays pending, so a late result still opens normally
- request age is now checked against Foundry's server time (`game.time.serverTime`) on both sides, so a player's wrong system clock no longer makes every request expire
- the player roll window, the scene invitation, the preset editor and the configuration import window now stay open when an action fails (`closeOnSubmit: false`), so the player can retry and the GM keeps the entered data or pasted JSON
- Send Reminder now also reaches players who accepted the scene but closed the roll window; accepting again reopens the roll window, or brings it to the front if it is still open
- the player's roll window closes when the GM closes the scene

## 1.20.0

- consolidated inventory stacking around one versioned source-identity policy: UUID first, then pack plus document ID, then the explicit reward ID; matching also remains scoped to the selected container and never falls back to Item name/type
- aligned fallback-resource keys with that same canonical identity while retaining one-time cleanup of resource entries written under the older reward-ID key
- replaced the raw ten-entry Actor search-log array with a versioned `{ schemaVersion, retentionLimit, updatedAt, entries }` store that lazily accepts the old array format, deduplicates retries by session ID, and retains the newest 25 entries
- reduced the public module integration API to a frozen version-1 surface containing `openControlPanel` and GM-only `getMigrationBackups`; legacy dialog-opening methods are no longer exposed
- documented the current no-license status in `LICENSING.md` without claiming an owner-unapproved open-source license or adding a misleading manifest field
- completed the third-audit documentation and conservative Foundry 13/14 compatibility closure without raising the manifest beyond actually recorded runtime evidence
- expanded the automated suite from 118 to 123 tests with exact stack identity, fallback-key transition, structured-history upgrade/retention, minimal public API, and licensing-status contracts

## 1.19.1

- removed the decorative panel texture entirely, including its WebP asset, client setting, localization, runtime preference code, reduced-data override, and related CSS selectors
- standardized every GM window on the same solid `--wildharvest-gm-bg-deep` background without loading or decoding a bitmap
- replaced the former texture optimization regression with a contract that rejects texture assets, texture settings, image URLs, and texture-specific fallbacks
- retained all 1.19.0 viewport, typography, contrast, responsive rules, forced-colors, gameplay, world-data, and compatibility behavior

## 1.19.0

- made the GM Workbench initial size respect the available viewport without enforcing desktop minimums that could exceed compact screens
- added CSS maximums for the Workbench and rules window, long-label wrapping, a 0.75 rem floor for compact labels, and WCAG AA contrast regressions for the primary GM text palette
- changed the rules configuration tables into labelled stacked cards below 840 px while preserving every field name, value, and submit behavior
- replaced the 1.86 MB 1254 px PNG panel texture with a 6.4 KB 768 px WebP background and disabled image painting automatically on narrow or reduced-data displays
- added a client-scoped `Decorative GM panel texture` setting that switches every GM window to a solid dark background immediately and independently on each device
- added forced-colors focus and background fallbacks without changing gameplay, world data, compatibility declarations, or the player search workflow
- expanded automated coverage from 115 to 118 tests with viewport sizing, readable text/contrast, responsive rules, optimized-asset, and texture-preference contracts

## 1.18.0

- replaced the GM Workbench's long-lived `DialogV2` wrapper with a dedicated `ApplicationV2` using Foundry's `HandlebarsApplicationMixin`
- split the Workbench shell into native `header`, `tabs`, `content`, and `footer` template parts; ordinary state changes now refresh only content and footer, while tab navigation additionally refreshes the tab strip
- removed the full-panel `root.innerHTML` replacement path, preserving the application frame and unaffected Workbench sections across live session, filter, selection, and history updates
- added a dedicated controller boundary for state normalization, render scope, tab activation, session subscription, cleanup, and render-error handling
- moved delegated keyboard, click, and change listener ownership into the ApplicationV2 lifecycle so listeners attach once and close-time subscription cleanup is deterministic
- retained all Launch, Responses, Presets, History, child-dialog, focus-restoration, live-session, and native title-bar close behavior
- expanded automated coverage from 113 to 115 tests with ApplicationV2/partial-template architecture and controller render-scope regressions

## 1.17.0

- replaced the Combined GP selector's repeated entry-list copying and per-candidate duplicate scans with a compact bounded dynamic-programming state graph that processes each unique source Item once
- preserved exact-target priority, the hard tolerance ceiling, randomized equivalent combinations, pack-qualified deduplication, denomination conversion, and the five-unit maximum for each source Item
- cache normalized compendium indexes and prepared copper prices per pack, share concurrent index requests, retry failed loads, and invalidate affected entries after Compendium or compendium Item changes
- added localized busy states to player/GM search calculation and GM reward preview controls so longer pack calculations no longer look like an unresponsive interface
- added a 500-item Combined GP performance regression; the local 10 GP benchmark improved from roughly 2.6 seconds to roughly 78 milliseconds in the same test environment
- expanded automated coverage from 108 to 113 tests with cache concurrency, invalidation, failed-load recovery, prepared-price, calculation-state, and performance contracts

## 1.16.0

- added GM-configurable player roll controls to the existing rules form: extra modifiers can be allowed or locked, their absolute limit defaults to 20, and player selection of advantage or disadvantage can be allowed or locked
- made the active GM enforce the current roll-control policy after authenticating every player request, while preserving unrestricted GM-only test rolls
- require every player resolution to target an owned Actor; players without an available owned Actor cannot accept and submit a search that would lose its result
- persist the base, extra, and final skill modifiers, roll mode, and resolved destination in both GM Responses and Actor History
- retry Actor history writes up to three times and replace an existing session entry instead of duplicating it, keeping retry behavior safe after an uncertain document update
- replace the fixed five-second result polling loop with immediate lookup, an `updateActor` listener, safety polling, and an eight-second timeout; the neutral socket notice now reports only whether the private Actor result is available
- clarify the degraded result warning when rewards were granted but the player result panel could not synchronize
- keep expanded response details attached to the selected historical session instead of incorrectly validating them against the newest session
- expanded automated coverage from 103 to 108 tests with roll-policy enforcement, required-Actor, neutral availability notice, selected-session expansion, and idempotent history retry regressions

## 1.15.0

- added a player-selectable loot destination that lists the selected Actor's D&D5e container Items while keeping the main inventory as the default
- authenticated the selected container ID through the existing short-lived User request and made the active GM verify the Actor, ownership, container existence, and `container` Item type before granting rewards
- stored new rewards with D&D5e's native `system.container` relationship and scoped existing-stack matching to the same destination, preventing a matching root-inventory stack from absorbing loot intended for a backpack or pouch
- fall back safely to the main inventory if a selected container disappears before the authoritative grant, and record the resolved destination in Actor history and player result status
- changed Combined GP value selection from unique-only subsets to randomized bounded multisets, allowing repeated source Items while limiting each pack-qualified Item to five units per search
- retained exact-target and tolerance priority, source-index deduplication, currency normalization, and the hard upper-value ceiling while randomizing equivalent item compositions
- expanded automated coverage from 96 to 103 tests with bounded and randomized GP repetition, container discovery, authenticated destination validation, destination-scoped stacking, new contained Item creation, and deleted-container fallback contracts

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
