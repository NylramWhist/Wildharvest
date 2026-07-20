export function createCompendiumIndexCache(loadEntries) {
  if (typeof loadEntries !== "function") {
    throw new TypeError("A compendium index loader is required.");
  }

  const records = new Map();

  async function get(packId, pack) {
    const normalizedPackId = String(packId ?? "").trim();
    if (!normalizedPackId) return [];

    const cached = records.get(normalizedPackId);
    if (cached?.pack === pack) return cached.promise;

    const promise = Promise.resolve().then(() => loadEntries(normalizedPackId, pack));
    const record = { pack, promise };
    records.set(normalizedPackId, record);

    try {
      return await promise;
    } catch (error) {
      if (records.get(normalizedPackId) === record) records.delete(normalizedPackId);
      throw error;
    }
  }

  function invalidate(packId = null) {
    const normalizedPackId = String(packId ?? "").trim();
    if (!normalizedPackId) {
      records.clear();
      return;
    }
    records.delete(normalizedPackId);
  }

  return Object.freeze({
    get,
    invalidate,
    get size() {
      return records.size;
    }
  });
}
