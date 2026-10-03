import {
  DATA_VERSION_SETTING_KEY,
  LEGACY_LANGUAGE_MODE_SETTING_KEY,
  LEGACY_LOCATIONS_SETTING_KEY,
  LEGACY_LOOT_POOLS_SETTING_KEY,
  LEGACY_RANDOM_LOOT_PACK_SETTING_KEY,
  MIGRATION_BACKUPS_SETTING_KEY,
  MODULE_ID,
  PRESETS_SETTING_KEY,
  RULES_SETTING_KEY,
  SEARCH_SESSIONS_SETTING_KEY
} from "../constants.js";
import {
  appendMigrationBackup,
  buildMigrationBackup,
  buildRestorePlan,
  keepNewestBackupPerReason,
  normalizeMigrationBackupHistory,
  summarizeMigrationBackups
} from "./migration-backup-core.js";

const BACKED_UP_SETTING_KEYS = Object.freeze([
  PRESETS_SETTING_KEY,
  RULES_SETTING_KEY,
  DATA_VERSION_SETTING_KEY,
  SEARCH_SESSIONS_SETTING_KEY
]);

function deepClone(value, fallback) {
  if (value === undefined) return fallback;
  return foundry.utils.deepClone(value);
}

function getSettingValue(key) {
  try {
    const value = game.settings.get(MODULE_ID, key);
    // Settings stored as a DataModel (presets, 1.25.0) are backed up as plain data.
    return typeof value?.toObject === "function" ? value.toObject() : value;
  } catch (_error) {
    return null;
  }
}

// Settings that are no longer registered; their stored world value is read from the Setting document.
const BACKED_UP_LEGACY_SETTING_KEYS = Object.freeze([
  LEGACY_LOCATIONS_SETTING_KEY,
  LEGACY_LOOT_POOLS_SETTING_KEY,
  LEGACY_RANDOM_LOOT_PACK_SETTING_KEY
]);

export function getRawWorldSetting(key) {
  try {
    return game.settings?.storage?.get?.("world")?.getSetting?.(`${MODULE_ID}.${key}`) ?? null;
  } catch (_error) {
    return null;
  }
}

function captureSettings() {
  const settings = Object.fromEntries(BACKED_UP_SETTING_KEYS.map((key) => [key, deepClone(getSettingValue(key), null)]));
  // Before the migration to data version 3 the presets setting has no stored value yet; its
  // default would restore as an empty list, so it is left out of the backup (1.25.0).
  if (!getRawWorldSetting(PRESETS_SETTING_KEY)) settings[PRESETS_SETTING_KEY] = null;
  for (const key of BACKED_UP_LEGACY_SETTING_KEYS) {
    const setting = getRawWorldSetting(key);
    if (setting) settings[key] = deepClone(setting.value, null);
  }
  return settings;
}

function captureActorData() {
  return (game.actors?.contents ?? [])
    .map((actor) => {
      const moduleFlags = deepClone(actor.flags?.[MODULE_ID], null);
      const items = Array.from(actor.items?.values?.() ?? actor.items ?? [])
        .map((item) => ({
          id: item.id,
          name: item.name,
          moduleFlags: deepClone(item.flags?.[MODULE_ID], null)
        }))
        .filter((item) => item.moduleFlags && Object.keys(item.moduleFlags).length);

      return {
        id: actor.id,
        name: actor.name,
        moduleFlags,
        items
      };
    })
    .filter((actor) => (actor.moduleFlags && Object.keys(actor.moduleFlags).length) || actor.items.length);
}

export function getMigrationBackups() {
  if (!game.user?.isGM) return [];
  return normalizeMigrationBackupHistory(game.settings.get(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY));
}

export async function createPreMigrationBackup({ targetDataVersion, reason = "pre-migrate-module-data" } = {}) {
  if (!game.user?.isGM) {
    throw new Error("Only a GM can create a migration backup.");
  }

  const rawHistory = game.settings.get(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY);
  const backup = buildMigrationBackup({
    moduleId: MODULE_ID,
    moduleVersion: game.modules?.get(MODULE_ID)?.version ?? "unknown",
    sourceDataVersion: getSettingValue(DATA_VERSION_SETTING_KEY),
    targetDataVersion,
    settings: captureSettings(),
    actors: captureActorData(),
    reason
  });
  const result = appendMigrationBackup(rawHistory, backup);

  if (result.added) {
    await game.settings.set(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY, JSON.stringify(result.history));
    console.info(`${MODULE_ID} | Created mandatory pre-migration backup ${result.backup.id}.`);
  }

  return {
    created: result.added,
    backupId: result.backup?.id ?? null,
    fingerprint: result.backup?.fingerprint ?? null,
    backupCount: result.history.length
  };
}

export function getMigrationBackupSummary() {
  if (!game.user?.isGM) return { count: 0, bytes: 0, newest: null };
  return summarizeMigrationBackups(game.settings.get(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY));
}

// 1.22.0 (D13): worlds updated from earlier versions may hold up to three backups; keep the newest of each kind.
export async function pruneMigrationBackups() {
  if (!game.user?.isGM) return false;
  const history = normalizeMigrationBackupHistory(game.settings.get(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY));
  const pruned = keepNewestBackupPerReason(history);
  if (pruned.length === history.length) return false;
  await game.settings.set(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY, JSON.stringify(pruned));
  console.info(`${MODULE_ID} | Removed ${history.length - pruned.length} older data backup(s).`);
  return true;
}

export async function deleteMigrationBackups() {
  if (!game.user?.isGM) throw new Error("Only a GM can delete Wildharvest data backups.");
  const { count } = getMigrationBackupSummary();
  await game.settings.set(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY, "[]");
  return count;
}

function getCurrentModuleDataForRestore() {
  return (game.actors?.contents ?? []).map((actor) => ({
    id: actor.id,
    moduleFlags: deepClone(actor.flags?.[MODULE_ID], null),
    items: Array.from(actor.items?.values?.() ?? actor.items ?? []).map((item) => ({
      id: item.id,
      moduleFlags: deepClone(item.flags?.[MODULE_ID], null)
    }))
  }));
}

// ForcedReplacement / ForcedDeletion (foundry.data.operators) replace the whole module flag
// object in one update, so nothing from the current state is merged into the restored flags.
function moduleFlagsOperator(setFlags) {
  const { ForcedDeletion, ForcedReplacement } = foundry.data.operators;
  return setFlags ? ForcedReplacement.create(deepClone(setFlags, {})) : ForcedDeletion.create();
}

// One request for all changed items of an actor and one for the actor itself.
// (1.22.0 first sent one request per flag key, which on a large inventory took minutes.)
async function restoreActorFlags(actor, step) {
  const itemUpdates = step.items
    .filter((itemStep) => actor.items?.has(itemStep.itemId))
    .map((itemStep) => ({ _id: itemStep.itemId, flags: { [MODULE_ID]: moduleFlagsOperator(itemStep.setFlags) } }));
  if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item", itemUpdates);
  if (step.actorChanged !== false) {
    await actor.update({ flags: { [MODULE_ID]: moduleFlagsOperator(step.setFlags) } });
  }
  return itemUpdates.length;
}

async function restoreSetting(key, value) {
  if (game.settings.settings.has(`${MODULE_ID}.${key}`)) {
    await game.settings.set(MODULE_ID, key, value);
    return;
  }
  // A setting that is no longer registered (for example randomLootPack) is stored as a Setting document.
  const existing = getRawWorldSetting(key);
  if (existing) await existing.update({ value });
  else await CONFIG.Setting.documentClass.create({ key: `${MODULE_ID}.${key}`, value });
}

// Puts module settings and module flags on actors and their items back as they were in the backup.
// The world's data version returns to the backup's, so the next start of the world migrates again.
// Before anything changes, the current state is saved as a "pre-restore" backup.
export async function restoreMigrationBackup(backupId, { confirm = false } = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can restore a Wildharvest data backup.");
  if (confirm !== true) {
    throw new Error("Restoring replaces the current Wildharvest data. Call again with { confirm: true }.");
  }
  const history = normalizeMigrationBackupHistory(game.settings.get(MODULE_ID, MIGRATION_BACKUPS_SETTING_KEY));
  const backup = history.find((entry) => entry.id === String(backupId ?? ""));
  if (!backup) throw new Error(`Wildharvest data backup "${backupId}" was not found.`);

  const safety = await createPreMigrationBackup({
    targetDataVersion: backup.sourceDataVersion,
    reason: "pre-restore"
  });

  // Data older than version 3 has no presets setting of its own (a backup made by 1.25.0 before
  // the migration may hold its empty default), so the presets key is skipped for it.
  const settingKeys = Object.keys(backup.settings ?? {})
    .filter((key) => key !== LEGACY_LANGUAGE_MODE_SETTING_KEY && backup.settings[key] !== null && backup.settings[key] !== undefined)
    .filter((key) => !(key === PRESETS_SETTING_KEY && Number(backup.sourceDataVersion) < 3));
  for (const key of settingKeys) {
    await restoreSetting(key, backup.settings[key]);
  }

  // A backup from before 1.25.0 holds the old "locations" + "lootPools" settings and no presets:
  // the current presets are removed, so the restored old settings are read until the world is
  // reloaded and migrated again.
  if (Number(backup.sourceDataVersion) < 3) {
    await getRawWorldSetting(PRESETS_SETTING_KEY)?.delete();
  }

  const plan = buildRestorePlan(backup, getCurrentModuleDataForRestore());
  let actorsRestored = 0;
  let itemsRestored = 0;
  for (const step of plan) {
    const actor = game.actors?.get(step.actorId);
    if (!actor) continue;
    itemsRestored += await restoreActorFlags(actor, step);
    actorsRestored += 1;
  }

  console.info(`${MODULE_ID} | Restored data backup ${backup.id}.`, { settingKeys, actorsRestored, itemsRestored });
  // Open windows still hold the scenes from before the restore; main.js reloads them and asks for a reload.
  Hooks.callAll(`${MODULE_ID}.dataRestored`, { backupId: backup.id });
  return {
    restoredBackupId: backup.id,
    safetyBackupId: safety.backupId,
    dataVersion: backup.sourceDataVersion,
    settings: settingKeys.length,
    actors: actorsRestored,
    items: itemsRestored,
    reloadRequired: true
  };
}
