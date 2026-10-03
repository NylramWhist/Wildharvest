import { sortRewardsByValue } from "./result-view-core.js";

// Data version 2 (Wildharvest 1.21.0): compact history entries and scene results,
// ISO timestamps. Pure functions, shared by the migration and by runtime writes,
// so data in the old shape never comes back once written by this version.

// Version 3 (1.25.0) changes only where presets are stored (settings.js, preset-core.js).
export const DATA_VERSION = 3;
export const HISTORY_REWARD_LIMIT = 30;
export const SESSION_REWARD_LIMIT = 10;

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
// Formats written by 1.20.x through Date#toLocaleString for the two module locales.
const PL_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const EN_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$/;

function buildLocalDate(year, month, day, hours, minutes, seconds) {
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day) return null;
  return date;
}

// Returns an ISO 8601 string, or the original text when it cannot be read safely.
// Old locale strings are read as local time of the computer running the migration
// (the GM who wrote them), which is how they were produced.
export function toIsoTimestamp(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : "";
  }

  const text = String(value).trim();
  if (!text) return "";
  if (ISO_PATTERN.test(text)) {
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
  }

  let match = text.match(PL_PATTERN);
  if (match) {
    const [, day, month, year, hours, minutes, seconds = "0"] = match;
    const date = buildLocalDate(Number(year), Number(month), Number(day), Number(hours), Number(minutes), Number(seconds));
    return date && Number(hours) < 24 && Number(minutes) < 60 ? date.toISOString() : text;
  }

  match = text.match(EN_PATTERN);
  if (match) {
    const [, month, day, year, rawHours, minutes, seconds = "0", meridiem] = match;
    let hours = Number(rawHours);
    if (hours < 1 || hours > 12 || Number(minutes) > 59) return text;
    if (/p/i.test(meridiem) && hours !== 12) hours += 12;
    if (/a/i.test(meridiem) && hours === 12) hours = 0;
    const date = buildLocalDate(Number(year), Number(month), Number(day), hours, Number(minutes), Number(seconds));
    return date ? date.toISOString() : text;
  }

  return text;
}

export function isIsoTimestamp(value) {
  return typeof value === "string" && ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toText(value) {
  return String(value ?? "").trim();
}

function getRewardUuid(reward) {
  const uuid = toText(reward?.uuid);
  if (uuid) return uuid;
  const pack = toText(reward?.pack);
  const documentId = toText(reward?.documentId);
  return pack && documentId ? `Compendium.${pack}.Item.${documentId}` : "";
}

export function compactReward(reward, { detailed = true } = {}) {
  const compact = {
    name: toText(reward?.name),
    quantity: toFiniteNumber(reward?.quantity, 1)
  };
  // A reward without a name is shown by its compendium reference, so keep that.
  if (!compact.name) {
    const pack = toText(reward?.pack);
    const documentId = toText(reward?.documentId);
    if (pack) compact.pack = pack;
    if (documentId) compact.documentId = documentId;
  }
  if (!detailed) return compact;

  const img = toText(reward?.img);
  if (img) compact.img = img;
  const uuid = getRewardUuid(reward);
  if (uuid) compact.uuid = uuid;
  if (reward?.unitValueGp !== undefined && reward?.unitValueGp !== null) {
    compact.unitValueGp = reward.unitValueGp;
  }
  // 1.33.0: the item type (dnd5e "loot", "consumable"…) lets the result window group the items.
  const type = toText(reward?.type ?? reward?.itemType);
  if (type) compact.type = type;
  return compact;
}

export function compactRewardList(rewards, source = {}, { limit, detailed = true } = {}) {
  const list = Array.isArray(rewards) ? rewards.filter((reward) => reward && typeof reward === "object") : [];
  const knownCount = Math.trunc(toFiniteNumber(source?.rewardCount, 0));
  const rewardCount = Math.max(list.length, knownCount);
  // 1.33.0 (W-11): with a limit, the most valuable stacks are the ones kept (and shown first).
  const ordered = detailed ? sortRewardsByValue(list) : list;
  const kept = ordered.slice(0, Math.max(0, limit)).map((reward) => compactReward(reward, { detailed }));
  return {
    rewards: kept,
    rewardCount,
    omittedRewardCount: rewardCount - kept.length
  };
}

function compactLootSummary(lootSummary) {
  const summary = {
    strategy: toText(lootSummary?.strategy) || "rarity",
    lootPoints: toFiniteNumber(lootSummary?.lootPoints, 0)
  };
  if (lootSummary?.totalValueGp !== undefined && lootSummary?.totalValueGp !== null) {
    summary.totalValueGp = lootSummary.totalValueGp;
  }
  if (lootSummary?.targetValueGp !== undefined && lootSummary?.targetValueGp !== null) {
    summary.targetValueGp = lootSummary.targetValueGp;
  }
  // 1.35.0: the preset's difficulty at the time of the search, when it was not 0.
  const difficulty = toFiniteNumber(lootSummary?.difficulty, 0);
  if (difficulty) summary.difficulty = difficulty;
  return summary;
}

function getRollMode(source) {
  const rollMode = toText(source?.rollMode).toLowerCase();
  if (["normal", "advantage", "disadvantage"].includes(rollMode)) return rollMode;
  return source?.advantage ? "advantage" : "normal";
}

export function compactHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const baseSkillModifier = toFiniteNumber(entry.baseSkillModifier ?? entry.finalSkillModifier, 0);
  const extraModifier = toFiniteNumber(entry.extraModifier, 0);
  const rewardList = compactRewardList(entry.rewards, entry, { limit: HISTORY_REWARD_LIMIT });
  const storage = entry.storageState ?? {};

  const compact = {
    locationName: toText(entry.locationName),
    activityName: toText(entry.activityName),
    skillName: toText(entry.skillName),
    rollTotal: toFiniteNumber(entry.rollTotal, 0),
    rollMode: getRollMode(entry),
    baseSkillModifier,
    extraModifier,
    finalSkillModifier: toFiniteNumber(entry.finalSkillModifier, baseSkillModifier + extraModifier),
    lootSummary: compactLootSummary(entry.lootSummary),
    ...rewardList,
    storageState: {
      inventoryCount: Math.trunc(toFiniteNumber(storage.inventoryCount, 0)),
      fallbackCount: Math.trunc(toFiniteNumber(storage.fallbackCount, 0)),
      containerId: toText(storage.containerId),
      containerName: toText(storage.containerName)
    },
    timestamp: toIsoTimestamp(entry.timestamp)
  };
  const sessionId = toText(entry.sessionId);
  return sessionId ? { sessionId, ...compact } : compact;
}

export function compactSessionResult(result) {
  if (!result || typeof result !== "object") return null;
  const baseSkillModifier = toFiniteNumber(result.baseSkillModifier ?? result.finalSkillModifier, 0);
  const extraModifier = toFiniteNumber(result.extraModifier, 0);
  return {
    rollTotal: toFiniteNumber(result.rollTotal, 0),
    skillName: toText(result.skillName),
    lootPoints: toFiniteNumber(result.lootPoints, 0),
    lootStrategy: toText(result.lootStrategy) || "rarity",
    baseSkillModifier,
    extraModifier,
    finalSkillModifier: toFiniteNumber(result.finalSkillModifier, baseSkillModifier + extraModifier),
    rollMode: getRollMode(result),
    containerId: toText(result.containerId),
    containerName: toText(result.containerName),
    ...compactRewardList(result.rewards, result, { limit: SESSION_REWARD_LIMIT, detailed: false })
  };
}

const SESSION_ENTRY_TIMESTAMP_KEYS = Object.freeze([
  "updatedAt",
  "resolutionStartedAt",
  "resolutionCompletedAt",
  "resolutionFailedAt"
]);

export function compactSessionEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const compact = { ...entry };
  for (const key of SESSION_ENTRY_TIMESTAMP_KEYS) {
    if (key in compact) compact[key] = toIsoTimestamp(compact[key]);
  }
  compact.result = compactSessionResult(entry.result);
  return compact;
}

export function compactSession(session) {
  if (!session || typeof session !== "object") return session;
  return {
    ...session,
    createdAt: toIsoTimestamp(session.createdAt),
    closedAt: session.closedAt ? toIsoTimestamp(session.closedAt) : null,
    offers: Object.fromEntries(Object.entries(session.offers ?? {})
      .map(([userId, entry]) => [userId, compactSessionEntry(entry)]))
  };
}
