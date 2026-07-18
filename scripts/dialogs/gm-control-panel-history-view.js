import { getAvailableActors } from "../helpers/actor-utils.js";
import { getRewardStackText } from "../helpers/reward-utils.js";
import { getActorSearchLog } from "../helpers/resource-store.js";
import { t } from "../i18n.js";
import { escapeHtml } from "./dialog-utils.js";

const HISTORY_ICON = "modules/wildharvest/assets/ui/icons/icon-history.svg";

function renderHistoryIcon(className) {
  return `<img class="${escapeHtml(className)}" src="${HISTORY_ICON}" alt="">`;
}

function getHistoryRollModeLabel(entry) {
  const rollMode = String(entry.rollMode ?? (entry.advantage ? "advantage" : "normal")).trim().toLowerCase();
  if (rollMode === "advantage") return t("WILDHARVEST.Dialog.Search.RollModeAdvantage");
  if (rollMode === "disadvantage") return t("WILDHARVEST.Dialog.Search.RollModeDisadvantage");
  return t("WILDHARVEST.Dialog.Search.RollModeNormal");
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
        entry.locationName,
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

function renderHistoryActorList(actors, selectedActorId) {
  if (!actors.length) {
    return `<p class="wildharvest-empty wildharvest-gm-history-empty">${escapeHtml(t("WILDHARVEST.Resources.NoActor"))}</p>`;
  }

  return `
    <div class="wildharvest-gm-history-actors">
      ${actors.map((actor) => {
        const entryCount = getActorSearchLog(actor).length;
        const activeClass = actor.id === selectedActorId ? " is-active" : "";
        const actorImage = String(actor.img ?? "").trim() || "icons/svg/mystery-man.svg";
        return `
          <button type="button" class="wildharvest-gm-history-actor${activeClass}" data-action="gm-select-history-actor" data-actor-id="${escapeHtml(actor.id)}" aria-pressed="${actor.id === selectedActorId ? "true" : "false"}">
            <img src="${escapeHtml(actorImage)}" alt="">
            <span>
              <strong>${escapeHtml(actor.name)}</strong>
              <small>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryEntryCount", { count: entryCount }))}</small>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderHistoryEntryRows(historyEntries, selectedEntryKey, hasFilter) {
  if (!historyEntries.length) {
    const emptyText = hasFilter
      ? t("WILDHARVEST.Dialog.ControlPanel.HistoryEmptyFiltered")
      : t("WILDHARVEST.Logs.Empty");
    return `<p class="wildharvest-empty wildharvest-gm-history-empty">${escapeHtml(emptyText)}</p>`;
  }

  return `
    <div class="wildharvest-gm-history-table__body">
      ${historyEntries.map(({ entry, key }) => {
        const selected = key === selectedEntryKey;
        return `
          <button type="button" class="wildharvest-gm-history-entry${selected ? " is-active" : ""}" data-action="gm-select-history-entry" data-entry-key="${escapeHtml(key)}" aria-pressed="${selected ? "true" : "false"}">
            <span class="wildharvest-gm-history-entry__activity" data-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryActivity"))}">${escapeHtml(entry.activityName || t("WILDHARVEST.History.None"))}</span>
            <span data-label="${escapeHtml(t("WILDHARVEST.Dialog.Search.Location"))}">${escapeHtml(entry.locationName || t("WILDHARVEST.History.None"))}</span>
            <span data-label="${escapeHtml(t("WILDHARVEST.Table.Skill"))}">${escapeHtml(entry.skillName || t("WILDHARVEST.History.None"))}</span>
            <strong data-label="${escapeHtml(t("WILDHARVEST.Dialog.Result.FinalResult"))}">${escapeHtml(String(entry.rollTotal ?? 0))}</strong>
            <span class="wildharvest-gm-history-entry__date" data-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryDate"))}">${escapeHtml(entry.timestamp || t("WILDHARVEST.History.None"))}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderHistoryEntryDetails(entry) {
  if (!entry) {
    return `
      <div class="wildharvest-gm-history-detail-empty">
        ${renderHistoryIcon("wildharvest-gm-history-detail-empty__asset")}
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryNoSelection"))}</p>
      </div>
    `;
  }

  const lootPoints = Number(entry.lootSummary?.lootPoints ?? 0);
  const rewards = Array.isArray(entry.rewards) ? entry.rewards : [];
  const rewardMarkup = rewards.length
    ? `<div class="wildharvest-gm-history-rewards">
        ${rewards.map((reward) => `
          <div class="wildharvest-gm-history-reward">
            <img src="${escapeHtml(reward.img || "icons/svg/item-bag.svg")}" alt="">
            <span>${escapeHtml(getRewardStackText(reward))}</span>
          </div>
        `).join("")}
      </div>`
    : `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Responses.NoRewards"))}</p>`;

  return `
    <div class="wildharvest-gm-history-detail">
      <header class="wildharvest-gm-history-detail__header">
        <strong>${escapeHtml(entry.activityName || t("WILDHARVEST.History.None"))}</strong>
        <span>${escapeHtml(entry.locationName || t("WILDHARVEST.History.None"))}</span>
      </header>
      <dl class="wildharvest-gm-history-detail__stats">
        <div><dt>${escapeHtml(t("WILDHARVEST.Table.Skill"))}</dt><dd>${escapeHtml(entry.skillName || t("WILDHARVEST.History.None"))}</dd></div>
        <div><dt>${escapeHtml(t("WILDHARVEST.Dialog.Result.FinalResult"))}</dt><dd>${escapeHtml(String(entry.rollTotal ?? 0))}</dd></div>
        <div><dt>${escapeHtml(t("WILDHARVEST.Dialog.Result.LootPoints"))}</dt><dd>${escapeHtml(String(lootPoints))}</dd></div>
        <div><dt>${escapeHtml(t("WILDHARVEST.Dialog.Search.LootDestination"))}</dt><dd>${escapeHtml(
          entry.storageState?.containerName || t("WILDHARVEST.Dialog.Search.MainInventory")
        )}</dd></div>
        <div><dt>${escapeHtml(t("WILDHARVEST.Dialog.Search.RollMode"))}</dt><dd>${escapeHtml(getHistoryRollModeLabel(entry))}</dd></div>
        <div><dt>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryDate"))}</dt><dd>${escapeHtml(entry.timestamp || t("WILDHARVEST.History.None"))}</dd></div>
      </dl>
      <section class="wildharvest-gm-history-detail__rewards">
        <h5>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Rewards"))}</h5>
        ${rewardMarkup}
      </section>
    </div>
  `;
}

export function renderHistoryTab(state) {
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
  const selectedEntry = selectedHistoryEntry?.entry ?? null;
  const historyCount = actor ? getActorSearchLog(actor).length : 0;

  return `
    <section class="wildharvest-gm-card">
      <div class="wildharvest-gm-card__header">
        <div>
          <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryTitle"))}</h3>
          <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryHint"))}</p>
        </div>
        <div class="wildharvest-inline-actions wildharvest-inline-actions--end">
          <button type="button" class="button" data-action="gm-clear-history"${actor && historyCount ? "" : " disabled"}>
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
            ${escapeHtml(t("WILDHARVEST.Dialog.Logs.Clear"))}
          </button>
        </div>
      </div>

      <div class="wildharvest-gm-history-workbench">
        <section class="wildharvest-gm-history-pane wildharvest-gm-history-pane--actors">
          <header class="wildharvest-gm-history-pane__header">
            <h4>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryCharacters"))}</h4>
            <span>${escapeHtml(String(playerActors.length))}</span>
          </header>
          ${renderHistoryActorList(playerActors, state.historyActorId)}
        </section>

        <section class="wildharvest-gm-history-pane wildharvest-gm-history-pane--entries">
          <header class="wildharvest-gm-history-pane__header">
            <h4>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryEntries"))}</h4>
            <span>${escapeHtml(String(historyEntries.length))}</span>
          </header>
          <div class="form-group wildharvest-form-group--tight wildharvest-gm-history-search">
            <label>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistorySearch"))}</label>
            <input type="search" name="gmHistoryFilter" value="${escapeHtml(state.historyFilter ?? "")}" placeholder="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistorySearchPlaceholder"))}">
          </div>
          <div class="wildharvest-gm-history-table" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryEntries"))}">
            <div class="wildharvest-gm-history-table__header" aria-hidden="true">
              <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryActivity"))}</span>
              <span>${escapeHtml(t("WILDHARVEST.Dialog.Search.Location"))}</span>
              <span>${escapeHtml(t("WILDHARVEST.Table.Skill"))}</span>
              <span>${escapeHtml(t("WILDHARVEST.Dialog.Result.FinalResult"))}</span>
              <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryDate"))}</span>
            </div>
            ${renderHistoryEntryRows(historyEntries, state.historyEntryKey, Boolean(String(state.historyFilter ?? "").trim()))}
          </div>
        </section>

        <aside class="wildharvest-gm-history-pane wildharvest-gm-history-pane--details">
          <header class="wildharvest-gm-history-pane__header">
            <h4>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.HistoryDetails"))}</h4>
          </header>
          ${renderHistoryEntryDetails(selectedEntry)}
        </aside>
      </div>
    </section>
  `;
}
