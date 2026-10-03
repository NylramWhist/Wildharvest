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
  // A backup taken before a restore always saves the current state, even when the same
  // module version already made one; migration backups are made once per version pair.
  const matchesByVersion = backup?.reason !== "pre-restore";
  const duplicate = history.find((entry) => entry.fingerprint === backup?.fingerprint
    || (matchesByVersion && entry.moduleId === backup?.moduleId
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

  const nextHistory = keepNewestBackupPerReason(normalizeMigrationBackupHistory([...history, backup], maxBackups));
  return {
    added: true,
    backup: cloneJsonValue(backup, null),
    history: nextHistory
  };
}

// 1.22.0 (D13): only the newest backup of each kind is kept (a pre-migration backup and,
// after a restore, the backup of the state that was replaced). Older ones only take up room
// in a world setting that every client downloads.
export function keepNewestBackupPerReason(history) {
  const newestByReason = new Map();
  for (const backup of history) {
    const reason = String(backup?.reason ?? "");
    const previous = newestByReason.get(reason);
    if (!previous || String(backup.createdAt ?? "") >= String(previous.createdAt ?? "")) {
      newestByReason.set(reason, backup);
    }
  }
  const kept = new Set(newestByReason.values());
  return history.filter((backup) => kept.has(backup));
}

export function summarizeMigrationBackups(rawValue) {
  const history = normalizeMigrationBackupHistory(rawValue);
  return {
    count: history.length,
    bytes: history.length ? new TextEncoder().encode(JSON.stringify(history)).length : 0,
    newest: history.at(-1) ?? null
  };
}

function flagKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

// Plan of flag changes that puts module flags back exactly as they were in the backup:
// every current top-level key is removed first, then the backed-up flags are written.
// Documents that had no module data at backup time lose their current module data.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameModuleFlags(current, saved) {
  const left = current && flagKeys(current).length ? current : null;
  const right = saved && flagKeys(saved).length ? saved : null;
  return stableStringify(left) === stableStringify(right);
}

export function buildRestorePlan(backup, currentActors) {
  const backedUp = new Map((backup?.actors ?? []).map((actor) => [String(actor.id), actor]));
  const plan = [];
  for (const actor of currentActors ?? []) {
    const saved = backedUp.get(String(actor.id));
    const items = [];
    const savedItems = new Map((saved?.items ?? []).map((item) => [String(item.id), item]));
    for (const item of actor.items ?? []) {
      const savedItem = savedItems.get(String(item.id));
      const unsetKeys = flagKeys(item.moduleFlags);
      const setFlags = savedItem?.moduleFlags && flagKeys(savedItem.moduleFlags).length ? savedItem.moduleFlags : null;
      // Items whose module flags already match the backup need no update (1.22.0: large inventories).
      if (sameModuleFlags(item.moduleFlags, setFlags)) continue;
      if (unsetKeys.length || setFlags) items.push({ itemId: String(item.id), unsetKeys, setFlags });
    }
    const unsetKeys = flagKeys(actor.moduleFlags);
    const setFlags = saved?.moduleFlags && flagKeys(saved.moduleFlags).length ? saved.moduleFlags : null;
    const actorChanged = !sameModuleFlags(actor.moduleFlags, setFlags);
    if (actorChanged || items.length) {
      plan.push({ actorId: String(actor.id), actorChanged, unsetKeys, setFlags, items });
    }
  }
  return plan;
}
