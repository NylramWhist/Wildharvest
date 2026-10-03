import { getAvailableActors } from "../helpers/actor-utils.js";
import { getRewardStackText } from "../helpers/reward-utils.js";
import { getActorSearchLog } from "../helpers/resource-store.js";
import { formatModuleTimestamp, t } from "../i18n.js";

function getHistoryRollModeLabel(entry) {
  const rollMode = String(entry.rollMode ?? (entry.advantage ? "advantage" : "normal")).trim().toLowerCase();
  if (rollMode === "advantage") return t("WILDHARVEST.Dialog.Search.RollModeAdvantage");
  if (rollMode === "disadvantage") return t("WILDHARVEST.Dialog.Search.RollModeDisadvantage");
  return t("WILDHARVEST.Dialog.Search.RollModeNormal");
}

function formatSignedModifier(value) {
  const numericValue = Number(value) || 0;
  return numericValue >= 0 ? `+${numericValue}` : String(numericValue);
}

// Presets live in one internal location (ACTIVITY_CATALOG_LOCATION_ID). Entries written before 1.21.1
// stored its translated name as if it were a real place; it is not shown.
const CATALOG_LOCATION_NAMES = new Set(["Wildharvest Options", "Opcje zbieractwa"]);

export function getHistoryLocationName(entry) {
  const name = String(entry?.locationName ?? "").trim();
  if (!name || CATALOG_LOCATION_NAMES.has(name) || name === t("WILDHARVEST.Default.ActivityCatalogName")) return "";
  return name;
}

export function getHistoryEntryKey(entry, index) {
  return [
    index,
    entry?.timestamp,
    entry?.activityName,
    entry?.locationName,
    entry?.rollTotal
  ].map((value) => String(value ?? "").replaceAll("|", "/")).join("|");
}

export function getFilteredHistoryEntries(actor, historyFilter = "") {
  if (!actor) return [];
  const filterText = String(historyFilter ?? "").trim().toLowerCase();
  return getActorSearchLog(actor)
    .map((entry, index) => ({
      entry,
      key: getHistoryEntryKey(entry, index)
    }))
    .filter(({ entry }) => {
      if (!filterText) return true;

      const rewards = entry.rewards?.length
        ? entry.rewards.map((reward) => getRewardStackText(reward)).join(" ")
        : "";
      const haystack = [
        entry.activityName,
        getHistoryLocationName(entry),
        entry.skillName,
        entry.storageState?.containerName,
        rewards
      ].join(" ").toLowerCase();

      return haystack.includes(filterText);
    });
}

export function getHistoryPlayerActors(actors, linkedPlayerActorIds = new Set()) {
  const linkedIds = linkedPlayerActorIds instanceof Set
    ? linkedPlayerActorIds
    : new Set(Array.isArray(linkedPlayerActorIds) ? linkedPlayerActorIds : []);
  return (Array.isArray(actors) ? actors : []).filter((actor) => {
    const actorId = String(actor?.id ?? "");
    const actorType = String(actor?.type ?? "").trim().toLowerCase();
    return actorType === "character" || linkedIds.has(actorId);
  });
}

function getHistoryDetailContext(entry) {
  if (!entry) return null;
  const none = t("WILDHARVEST.History.None");
  const baseSkillModifier = Number(entry.baseSkillModifier ?? entry.finalSkillModifier ?? 0);
  const extraModifier = Number(entry.extraModifier ?? 0);
  const finalSkillModifier = Number(entry.finalSkillModifier ?? baseSkillModifier + extraModifier);
  const rewards = Array.isArray(entry.rewards) ? entry.rewards : [];
  const omittedRewardCount = Math.max(0, Math.trunc(Number(entry.rewardCount) || 0) - rewards.length);
  return {
    activityName: entry.activityName || none,
    locationName: getHistoryLocationName(entry),
    stats: [
      { label: t("WILDHARVEST.Table.Skill"), value: entry.skillName || none },
      { label: t("WILDHARVEST.Dialog.Result.FinalResult"), value: String(entry.rollTotal ?? 0) },
      { label: t("WILDHARVEST.Dialog.Result.LootPoints"), value: String(Number(entry.lootSummary?.lootPoints ?? 0)) },
      {
        label: t("WILDHARVEST.Dialog.Search.LootDestination"),
        value: entry.storageState?.containerName || t("WILDHARVEST.Dialog.Search.MainInventory")
      },
      { label: t("WILDHARVEST.Dialog.Search.RollMode"), value: getHistoryRollModeLabel(entry) },
      { label: t("WILDHARVEST.Dialog.Search.BaseModifier"), value: formatSignedModifier(baseSkillModifier) },
      { label: t("WILDHARVEST.Dialog.Search.ExtraModifier"), value: formatSignedModifier(extraModifier) },
      { label: t("WILDHARVEST.Dialog.Search.FinalModifier"), value: formatSignedModifier(finalSkillModifier) },
      { label: t("WILDHARVEST.Dialog.ControlPanel.HistoryDate"), value: formatModuleTimestamp(entry.timestamp) || none }
    ],
    rewards: rewards.map((reward) => ({
      img: reward.img || "icons/svg/item-bag.svg",
      text: getRewardStackText(reward)
    })),
    omittedText: omittedRewardCount ? t("WILDHARVEST.History.MoreRewards", { count: omittedRewardCount }) : ""
  };
}

// Data for templates/gm/tab-history.hbs (1.27.0). Also settles the selected character and entry.
export function getHistoryTabContext(state) {
  const actors = getAvailableActors();
  const linkedPlayerActorIds = new Set((game.users?.contents ?? [])
    .filter((user) => !user.isGM && user.character?.id)
    .map((user) => String(user.character.id)));
  const playerActors = getHistoryPlayerActors(actors, linkedPlayerActorIds);
  const actor = playerActors.find((entry) => entry.id === state.historyActorId) ?? playerActors[0] ?? null;
  if (actor && actor.id !== state.historyActorId) {
    state.historyActorId = actor.id;
    state.historyEntryKey = "";
  } else if (!actor) {
    state.historyActorId = "";
    state.historyEntryKey = "";
  }

  const historyEntries = getFilteredHistoryEntries(actor, state.historyFilter);
  const selectedHistoryEntry = historyEntries.find(({ key }) => key === state.historyEntryKey) ?? historyEntries[0] ?? null;
  state.historyEntryKey = selectedHistoryEntry?.key ?? "";
  // The location column only helps when at least one entry names a real place.
  const showLocation = historyEntries.some(({ entry }) => getHistoryLocationName(entry));
  const historyCount = actor ? getActorSearchLog(actor).length : 0;
  const none = t("WILDHARVEST.History.None");
  const hasFilter = Boolean(String(state.historyFilter ?? "").trim());

  return {
    canClear: Boolean(actor && historyCount),
    actors: playerActors.map((entry) => ({
      id: entry.id,
      name: entry.name,
      img: String(entry.img ?? "").trim() || "icons/svg/mystery-man.svg",
      countLabel: t("WILDHARVEST.Dialog.ControlPanel.HistoryEntryCount", { count: getActorSearchLog(entry).length }),
      active: entry.id === state.historyActorId
    })),
    historyFilter: state.historyFilter ?? "",
    showLocation,
    entries: historyEntries.map(({ entry, key }) => ({
      key,
      active: key === state.historyEntryKey,
      activityName: entry.activityName || none,
      locationName: getHistoryLocationName(entry) || none,
      skillName: entry.skillName || none,
      rollTotal: String(entry.rollTotal ?? 0),
      date: formatModuleTimestamp(entry.timestamp) || none
    })),
    emptyText: hasFilter ? t("WILDHARVEST.Dialog.ControlPanel.HistoryEmptyFiltered") : t("WILDHARVEST.Logs.Empty"),
    detail: getHistoryDetailContext(selectedHistoryEntry?.entry ?? null)
  };
}
