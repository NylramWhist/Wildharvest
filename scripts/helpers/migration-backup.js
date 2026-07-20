import {
  DATA_VERSION_SETTING_KEY,
  LANGUAGE_MODE_SETTING_KEY,
  LOOT_POOLS_SETTING_KEY,
  LOCATIONS_SETTING_KEY,
  MIGRATION_BACKUPS_SETTING_KEY,
  MODULE_ID,
  RANDOM_LOOT_PACK_SETTING_KEY,
  RULES_SETTING_KEY,
  SEARCH_SESSIONS_SETTING_KEY
} from "../constants.js";
import {
  appendMigrationBackup,
  buildMigrationBackup,
  normalizeMigrationBackupHistory
} from "./migration-backup-core.js";

const BACKED_UP_SETTING_KEYS = Object.freeze([
  LANGUAGE_MODE_SETTING_KEY,
  LOCATIONS_SETTING_KEY,
  LOOT_POOLS_SETTING_KEY,
  RANDOM_LOOT_PACK_SETTING_KEY,
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
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return null;
  }
}

function captureSettings() {
  return Object.fromEntries(BACKED_UP_SETTING_KEYS.map((key) => [key, deepClone(getSettingValue(key), null)]));
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
