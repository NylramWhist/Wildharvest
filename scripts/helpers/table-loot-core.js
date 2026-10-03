// 1.36.0: loot from roll tables. Pure functions; the Foundry calls (RollTable#roll, fromUuidSync)
// stay in search-engine.js.

// One reward stack per Item from the table results; text results and other documents are skipped.
// `results` are { documentUuid, item } pairs, where item is { name, img, type } of the Item or null.
export function aggregateTableItemResults(results, { isPhysicalItem = () => true } = {}) {
  const stacks = new Map();
  let skipped = 0;
  for (const entry of Array.isArray(results) ? results : []) {
    const uuid = String(entry?.documentUuid ?? "").trim();
    const item = entry?.item;
    if (!uuid || !item || !isPhysicalItem(item)) {
      skipped += 1;
      continue;
    }
    // Compendium Items carry pack + documentId like compendium loot, so both stack together
    // in the inventory; world Items keep their UUID.
    const pack = getItemUuidPackId(uuid);
    const documentId = pack ? getItemUuidDocumentId(uuid) : "";
    const stack = stacks.get(uuid) ?? {
      id: `table:${uuid}`,
      name: String(item.name ?? "").trim(),
      quantity: 0,
      uuid: pack ? null : uuid,
      ...(pack ? { pack, documentId } : {}),
      itemType: item.type ?? null,
      img: item.img ?? null
    };
    stack.quantity += 1;
    stacks.set(uuid, stack);
  }
  return { rewards: [...stacks.values()], skipped };
}

// Which table each of the Loot Points draws from: the preset's tables in turn.
export function getTableDrawPlan(tableIds, lootPoints) {
  const tables = Array.isArray(tableIds) ? tableIds.filter(Boolean) : [];
  const draws = Math.max(0, Math.trunc(Number(lootPoints) || 0));
  if (!tables.length) return [];
  return Array.from({ length: draws }, (_, index) => tables[index % tables.length]);
}

// Compendium pack id from an Item UUID ("Compendium.<pack>.Item.<id>"), or "" for a world Item.
export function getItemUuidPackId(uuid) {
  const match = /^Compendium\.(.+)\.Item\.([^.]+)$/.exec(String(uuid ?? "").trim());
  return match ? match[1] : "";
}

export function getItemUuidDocumentId(uuid) {
  const match = /(?:^|\.)Item\.([^.]+)$/.exec(String(uuid ?? "").trim());
  return match ? match[1] : "";
}
