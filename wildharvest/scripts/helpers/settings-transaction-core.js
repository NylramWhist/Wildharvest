export class SettingsTransactionError extends Error {
  constructor(message, { cause = null, rollbackErrors = [] } = {}) {
    super(message);
    this.name = "SettingsTransactionError";
    this.cause = cause;
    this.rollbackErrors = rollbackErrors;
  }
}

export async function applySettingsTransaction(changes, { getValue, setValue }) {
  if (!Array.isArray(changes) || typeof getValue !== "function" || typeof setValue !== "function") {
    throw new TypeError("Invalid settings transaction contract.");
  }

  const normalizedChanges = changes.map((change) => ({
    key: String(change?.key ?? "").trim(),
    value: change?.value
  }));
  const keys = normalizedChanges.map((change) => change.key);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
    throw new TypeError("Settings transaction keys must be unique and non-empty.");
  }

  const snapshots = new Map();
  for (const { key } of normalizedChanges) {
    snapshots.set(key, await getValue(key));
  }

  const attemptedKeys = [];
  try {
    for (const { key, value } of normalizedChanges) {
      attemptedKeys.push(key);
      await setValue(key, value);
    }
  } catch (cause) {
    const rollbackErrors = [];
    for (const key of attemptedKeys.reverse()) {
      try {
        await setValue(key, snapshots.get(key));
      } catch (rollbackError) {
        rollbackErrors.push({ key, error: rollbackError });
      }
    }

    if (rollbackErrors.length) {
      throw new SettingsTransactionError("Settings transaction failed and rollback was incomplete.", {
        cause,
        rollbackErrors
      });
    }
    throw cause;
  }

  return normalizedChanges;
}
