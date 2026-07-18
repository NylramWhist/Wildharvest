export const MIGRATION_BACKUP_FORMAT = "wildharvest-migration-backup";
export const MIGRATION_BACKUP_SCHEMA_VERSION = 1;
export const MAX_MIGRATION_BACKUPS = 3;

function cloneJsonValue(value, fallback) {
  if (value === undefined) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeIsoTimestamp(value) {
  const timestamp = String(value ?? "").trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Migration backup requires a valid ISO timestamp.");
  }
  return new Date(timestamp).toISOString();
}

export function buildMigrationBackup({
  moduleId,
  moduleVersion,
  sourceDataVersion,
  targetDataVersion,
  settings,
  actors,
  reason = "pre-migration",
  createdAt = new Date().toISOString()
}) {
  const payload = {
    moduleId: String(moduleId ?? "").trim(),
    moduleVersion: String(moduleVersion ?? "").trim(),
    sourceDataVersion: Number.isFinite(Number(sourceDataVersion)) ? Number(sourceDataVersion) : 0,
    targetDataVersion: Number.isFinite(Number(targetDataVersion)) ? Number(targetDataVersion) : 0,
    settings: cloneJsonValue(settings, {}),
    actors: cloneJsonValue(actors, [])
  };
  if (!payload.moduleId) throw new Error("Migration backup requires a module ID.");

  const fingerprint = hashString(JSON.stringify(payload));
  const normalizedCreatedAt = normalizeIsoTimestamp(createdAt);
  const timestampId = normalizedCreatedAt.replace(/[^0-9]/g, "").slice(0, 14);

  return {
    id: `${payload.moduleId}-${timestampId}-${fingerprint}`,
    format: MIGRATION_BACKUP_FORMAT,
    schemaVersion: MIGRATION_BACKUP_SCHEMA_VERSION,
    createdAt: normalizedCreatedAt,
    reason: String(reason ?? "pre-migration").trim() || "pre-migration",
    fingerprint,
    ...payload
  };
}

export function normalizeMigrationBackupHistory(rawValue, maxBackups = MAX_MIGRATION_BACKUPS) {
  let parsed = rawValue;
  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(rawValue || "[]");
    } catch (_error) {
      parsed = [];
    }
  }

  const limit = Number.isInteger(Number(maxBackups)) && Number(maxBackups) > 0
    ? Number(maxBackups)
    : MAX_MIGRATION_BACKUPS;

  return (Array.isArray(parsed) ? parsed : [])
    .filter((backup) => backup?.format === MIGRATION_BACKUP_FORMAT
      && Number(backup?.schemaVersion) === MIGRATION_BACKUP_SCHEMA_VERSION
      && String(backup?.id ?? "").trim()
      && String(backup?.fingerprint ?? "").trim())
    .slice(-limit)
    .map((backup) => cloneJsonValue(backup, {}));
}

export function appendMigrationBackup(rawHistory, backup, maxBackups = MAX_MIGRATION_BACKUPS) {
  const history = normalizeMigrationBackupHistory(rawHistory, maxBackups);
  const duplicate = history.find((entry) => entry.fingerprint === backup?.fingerprint
    || (entry.moduleId === backup?.moduleId
      && entry.moduleVersion === backup?.moduleVersion
      && Number(entry.sourceDataVersion) === Number(backup?.sourceDataVersion)
      && Number(entry.targetDataVersion) === Number(backup?.targetDataVersion)
      && entry.reason === backup?.reason));
  if (duplicate) {
    return {
      added: false,
      backup: cloneJsonValue(duplicate, null),
      history
    };
  }

  const nextHistory = normalizeMigrationBackupHistory([...history, backup], maxBackups);
  return {
    added: true,
    backup: cloneJsonValue(backup, null),
    history: nextHistory
  };
}
