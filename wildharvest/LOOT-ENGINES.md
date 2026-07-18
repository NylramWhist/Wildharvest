# Wildharvest loot engines

Since version 0.92.0, Wildharvest provides two world-level loot engines. The active engine is selected in `Wildharvest loot rules`; both configurations remain stored when the selection changes.

## Rarity

The roll total is converted to Loot Points. Affordable rarity rows are selected by weight until no further row can be bought. Every purchase evaluates its quantity formula independently. Draws use every matching item before repeating one, so a populated compendium does not collapse immediately into one large stack.

## Combined GP value

The roll total is converted to Loot Points using the same threshold table. A second table maps that exact LP amount to a target combined value in GP. For example, if 5 LP maps to 5 GP, a valid result can contain items priced at 1 GP, 2 GP, 1 GP, and 1 GP.

The tolerance is symmetric. With a 5 GP target and 10 percent tolerance, totals from 4.5 GP through 5.5 GP are accepted. The selector builds a bounded set of reachable totals from unique pack-qualified documents, chooses an exact total whenever one is found, never exceeds the upper tolerance, and otherwise returns the closest available combination. Randomness only changes which equivalent same-price documents are preferred; it no longer determines whether an obvious exact combination is discovered.

Prices are read from `system.price.value` and `system.price.denomination` and converted internally to copper:

- 1 PP = 1000 CP = 10 GP
- 1 GP = 100 CP
- 1 EP = 50 CP = 0.5 GP
- 1 SP = 10 CP = 0.1 GP
- 1 CP = 0.01 GP

Missing, malformed, zero, and negative prices are excluded. Items above the complete target plus tolerance are counted separately as unaffordable for that draw. The active GM remains authoritative for generation and inventory grants in both modes.

Every compendium reward is keyed by both the pack collection ID and the document ID. Two different packs may therefore contain the same document `_id` without their rewards, Actor flags, fallback resources, or history entries being merged.
