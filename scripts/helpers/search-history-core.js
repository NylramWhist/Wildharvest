export const SEARCH_HISTORY_SCHEMA_VERSION = 1;
export const SEARCH_HISTORY_RETENTION_LIMIT = 25;

function normalizeRetentionLimit(value) {
  const numericValue = Math.trunc(Number(value));
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : SEARCH_HISTORY_RETENTION_LIMIT;
}

function normalizeEntries(rawValue) {
  const entries = Array.isArray(rawValue)
    ? rawValue
    : Array.isArray(rawValue?.entries)
      ? rawValue.entries
      : [];

  return entries.filter((entry) => entry && typeof entry === "object");
}

export function normalizeSearchHistoryStore(rawValue, {
  retentionLimit = SEARCH_HISTORY_RETENTION_LIMIT
} = {}) {
  const limit = normalizeRetentionLimit(retentionLimit);
  const entries = normalizeEntries(rawValue).slice(0, limit);
  const updatedAt = Array.isArray(rawValue)
    ? ""
    : String(rawValue?.updatedAt ?? "").trim();

  return {
    schemaVersion: SEARCH_HISTORY_SCHEMA_VERSION,
    retentionLimit: limit,
    updatedAt,
    entries
  };
}

export function upsertSearchHistoryEntry(rawValue, entry, {
  retentionLimit = SEARCH_HISTORY_RETENTION_LIMIT,
  updatedAt = new Date().toISOString()
} = {}) {
  if (!entry || typeof entry !== "object") {
    throw new TypeError("Search history entry must be an object.");
  }

  const store = normalizeSearchHistoryStore(rawValue, { retentionLimit });
  const sessionId = String(entry.sessionId ?? "").trim();
  const retainedEntries = sessionId
    ? store.entries.filter((candidate) => String(candidate?.sessionId ?? "").trim() !== sessionId)
    : store.entries;

  return {
    ...store,
    updatedAt: String(updatedAt ?? "").trim(),
    entries: [entry, ...retainedEntries].slice(0, store.retentionLimit)
  };
}

export function createEmptySearchHistoryStore({
  retentionLimit = SEARCH_HISTORY_RETENTION_LIMIT,
  updatedAt = new Date().toISOString()
} = {}) {
  const store = normalizeSearchHistoryStore([], { retentionLimit });
  return {
    ...store,
    updatedAt: String(updatedAt ?? "").trim()
  };
}
