import {
  getDnd5eSkillChoices,
  getDnd5eSkillLabel,
  isDnd5eSystem
} from "./dnd5e-support.js";
import { isPhysicalItemDocument } from "./search-engine-core.js";
import {
  getAllowedPackFolderIds,
  getFolderPath,
  getFolderUuidDocumentId,
  getFolderUuidPackId,
  getPackFolderRecords,
  getPackFolderSelection,
  normalizeFolderIds,
  orderFolderTree
} from "./folder-filter-core.js";
import { getModuleLocale, t } from "../i18n.js";
import { filterAvailableItemPackIds, getPresets, savePresets } from "../settings.js";
import {
  normalizePackIds,
  normalizePresetList,
  normalizeTableIds,
  PRESET_CATALOG_LOCATION_ID,
  slugify
} from "./preset-core.js";

// Kept under the old name: scenes and history point to this location id.
export const ACTIVITY_CATALOG_LOCATION_ID = PRESET_CATALOG_LOCATION_ID;

export function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

// true / false when the loaded compendium index shows whether the pack holds any
// lootable (physical) items; null when the index is not available yet.
function getPackPhysicalItemState(pack) {
  const index = pack?.index;
  if (!index?.size) return null;
  for (const entry of index.values()) {
    if (isPhysicalItemDocument(entry)) return true;
  }
  return false;
}

export function getItemCompendiums() {
  return Array.from(game.packs?.values?.() ?? [])
    .filter((pack) => pack.documentName === "Item")
    .map((pack) => ({
      id: pack.collection,
      name: pack.title ?? pack.metadata?.label ?? pack.collection,
      hasPhysicalItems: getPackPhysicalItemState(pack)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, getModuleLocale()));
}

// 1.36.0: roll tables for the preset editor: world tables and tables in RollTable compendiums
// whose index is loaded (loadRollTableIndexes loads them).
export function getRollTableChoices() {
  const world = Array.from(game.tables?.values?.() ?? []).map((table) => ({
    uuid: table.uuid,
    name: table.name,
    source: t("WILDHARVEST.Dialog.ActivityEditor.TableSourceWorld")
  }));
  const packed = Array.from(game.packs?.values?.() ?? [])
    .filter((pack) => pack.documentName === "RollTable")
    .flatMap((pack) => Array.from(pack.index?.values?.() ?? []).map((entry) => ({
      uuid: entry.uuid ?? `Compendium.${pack.collection}.RollTable.${entry._id}`,
      name: entry.name,
      source: pack.title ?? pack.collection
    })));
  return [...world, ...packed].sort((left, right) => left.name.localeCompare(right.name, getModuleLocale()));
}

export async function loadRollTableIndexes() {
  const packs = Array.from(game.packs?.values?.() ?? []).filter((pack) => pack.documentName === "RollTable");
  await Promise.all(packs.map((pack) => pack.getIndex().catch(() => null)));
}

// Tables that still exist (fromUuidSync finds world documents and compendium index entries).
export function getAvailableTableIds(tableIds) {
  return normalizeTableIds(tableIds).filter((uuid) => {
    try {
      return Boolean(foundry.utils.fromUuidSync(uuid, { strict: false }));
    } catch (_error) {
      return false;
    }
  });
}

// Whether a roll table holds compendium Items (the only results that join the pool in "pool" mode).
// null when that cannot be told without loading the table (a table in a compendium).
export function rollTableHasCompendiumItems(uuid) {
  let table = null;
  try {
    table = foundry.utils.fromUuidSync(uuid, { strict: false });
  } catch (_error) {
    return null;
  }
  const results = table?.results?.contents;
  if (!Array.isArray(results)) return null;
  return results.some((result) => result?.type === "document" && /^Compendium\..+\.Item\.[^.]+$/.test(String(result.documentUuid ?? "")));
}

// 1.37.0: folders of a compendium in tree order, for the preset editor and the summaries.
export function getPackFolderTree(packId) {
  const folders = getPackFolderRecords(game.packs.get(String(packId ?? "").trim()));
  return orderFolderTree(folders).map((folder) => ({
    ...folder,
    parentPath: folder.parent ? getFolderPath(folders, folder.parent) : ""
  }));
}

// "Parent / Child" of a compendium folder, or the UUID when the folder no longer exists.
export function getFolderLabel(uuid) {
  const folders = getPackFolderRecords(game.packs?.get(getFolderUuidPackId(uuid)));
  return getFolderPath(folders, getFolderUuidDocumentId(uuid)) || uuid;
}

// Folder problems of a preset: "missing" when a selected folder no longer exists, "empty" when the
// loaded index shows that the selected folders of a compendium hold no lootable items.
function getPresetFolderProblems(packIds, folderIds) {
  const problems = new Set();
  for (const packId of packIds) {
    const selected = getPackFolderSelection(folderIds, packId);
    if (!selected.length) continue;
    const pack = game.packs?.get(packId);
    if (!pack) continue;
    const folders = getPackFolderRecords(pack);
    const known = new Set(folders.map((folder) => folder.id));
    if (selected.some((id) => !known.has(id))) {
      problems.add("missing");
      continue;
    }
    const allowed = getAllowedPackFolderIds(folders, folderIds, packId);
    if (pack.index?.size) {
      let lootable = false;
      for (const entry of pack.index.values()) {
        if (allowed.has(String(entry.folder ?? "")) && isPhysicalItemDocument(entry)) {
          lootable = true;
          break;
        }
      }
      if (!lootable) problems.add("empty");
    }
  }
  return problems;
}

// 1.37.1: the preset checks (empty folders, no lootable items) read the loaded compendium indexes,
// so sending a preset loads the indexes of its compendiums first instead of trusting an empty index.
export async function loadPresetPackIndexes(preset) {
  const packIds = normalizePackIds(preset?.packIds ?? []);
  await Promise.all(packIds.map(async (packId) => {
    const pack = game.packs?.get(packId);
    if (!pack || pack.index?.size) return;
    try {
      await pack.getIndex();
    } catch (_error) {
      // An index that cannot load keeps the preset checks as they were.
    }
  }));
}

export function getRollTableLabel(uuid) {
  try {
    return foundry.utils.fromUuidSync(uuid, { strict: false })?.name ?? uuid;
  } catch (_error) {
    return uuid;
  }
}

export function getPackLabelById(packId) {
  const pack = game.packs.get(String(packId ?? "").trim());
  if (!pack) return String(packId ?? "").trim();

  const name = pack.title ?? pack.metadata?.label ?? pack.collection;
  return `${name} [${pack.collection}]`;
}

export function getSkillChoices() {
  return isDnd5eSystem() ? getDnd5eSkillChoices() : [];
}

export function getSkillLabel(skillId) {
  return skillId ? getDnd5eSkillLabel(skillId) : t("WILDHARVEST.Default.SkillLabel");
}

export function sanitizeQuickOptionPackIds(packIds) {
  return normalizePackIds(packIds ?? []);
}

export function validateQuickOptionDraft(option) {
  const name = String(option?.name ?? "").trim();
  if (!name) throw new Error(t("WILDHARVEST.Errors.ActivityNameRequiredSimple"));

  const skillId = String(option?.skillId ?? "").trim().toLowerCase();
  if (!skillId) throw new Error(t("WILDHARVEST.Errors.ActivitySkillRequired"));

  const packIds = sanitizeQuickOptionPackIds(option?.packIds ?? []);
  const tableIds = normalizeTableIds(option?.tableIds ?? []);
  // 1.36.0: drawing from roll tables needs no compendium; otherwise one available compendium,
  // or (pool mode) at least one table.
  const drawsFromTables = option?.tableMode !== "pool" && tableIds.length > 0;
  if (!drawsFromTables && !filterAvailableItemPackIds(packIds).length && !tableIds.length) {
    throw new Error(t("WILDHARVEST.Errors.ActivityCompendiumsRequired"));
  }
  if (tableIds.length && !getAvailableTableIds(tableIds).length) {
    throw new Error(t("WILDHARVEST.Errors.ActivityTablesMissing"));
  }

  return {
    ...option,
    name,
    skillId,
    packIds,
    folderIds: normalizeFolderIds(option?.folderIds ?? [], packIds),
    tableIds
  };
}

export function getQuickOptionValidationIssues(option) {
  const issues = [];
  const name = String(option?.name ?? "").trim();
  const skillId = String(option?.skillId ?? "").trim().toLowerCase();
  const packIds = sanitizeQuickOptionPackIds(option?.packIds ?? []);
  const tableIds = normalizeTableIds(option?.tableIds ?? []);

  if (!name) issues.push("WILDHARVEST.Errors.ActivityNameRequiredSimple");
  if (!skillId) issues.push("WILDHARVEST.Errors.ActivitySkillRequired");
  // 1.36.0: tables that no longer exist make the preset need attention.
  if (tableIds.length && getAvailableTableIds(tableIds).length < tableIds.length) {
    issues.push("WILDHARVEST.Errors.ActivityTablesMissing");
  }
  const availablePackIds = filterAvailableItemPackIds(packIds);
  // 1.37.0: compendium folders (not used when every Loot Point draws from the tables).
  const drawsFromTables = tableIds.length > 0 && option?.tableMode !== "pool";
  const folderProblems = drawsFromTables
    ? new Set()
    : getPresetFolderProblems(availablePackIds, normalizeFolderIds(option?.folderIds ?? [], packIds));
  if (folderProblems.has("missing")) issues.push("WILDHARVEST.Errors.ActivityFoldersMissing");
  if (folderProblems.has("empty")) issues.push("WILDHARVEST.Errors.ActivityFoldersEmpty");
  if (tableIds.length) {
    // "pool" mode without a usable compendium: the tables must hold compendium Items, or every
    // search would end with an empty pool. Compendiums that are missing are not an issue here,
    // because the tables still give loot.
    if (option?.tableMode === "pool" && !availablePackIds.length
      && getAvailableTableIds(tableIds).every((uuid) => rollTableHasCompendiumItems(uuid) === false)) {
      issues.push("WILDHARVEST.Errors.ActivityTablesNoPoolItems");
    }
    return issues;
  }
  if (!packIds.length || !availablePackIds.length) {
    issues.push("WILDHARVEST.Errors.ActivityCompendiumsRequired");
  } else if (availablePackIds.every((packId) => getPackPhysicalItemState(game.packs?.get(packId)) === false)) {
    // T-7 (1.21.1): every attached compendium is loaded and none holds lootable items,
    // so sending this preset would only end with an empty-pool error.
    issues.push("WILDHARVEST.Errors.ActivityNoLootableItems");
  }

  return issues;
}

// The editor works on "quick options": presets with a loot pool id, which is the preset id (1.25.0).
function toQuickOption(preset) {
  return { ...preset, lootPoolId: preset.id };
}

export function sanitizeQuickOptionsForStorage(quickOptions) {
  return normalizePresetList(quickOptions).map(toQuickOption);
}

export function getQuickOptionsFromSettings() {
  return getPresets().map(toQuickOption);
}

export async function saveQuickOptionsToSettings(quickOptions) {
  const saved = await savePresets((Array.isArray(quickOptions) ? quickOptions : []).map((option) => ({
    ...option,
    packIds: filterAvailableItemPackIds(option?.packIds ?? [])
  })));
  return saved.map(toQuickOption);
}

export function createUniqueActivityOptionId(baseName, existingOptions, currentId = "") {
  if (currentId) return currentId;

  const existingIds = new Set(existingOptions.map((option) => option.id));
  const baseId = slugify(baseName, "activity");
  let nextId = baseId;
  let index = 2;

  while (existingIds.has(nextId)) {
    nextId = `${baseId}-${index}`;
    index += 1;
  }

  return nextId;
}
