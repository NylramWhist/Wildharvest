import { getDefaultActorId, getAvailableActors, getLinkedPlayerCharacters } from "../helpers/actor-utils.js";
import {
  ACTIVITY_CATALOG_LOCATION_ID,
  createUniqueActivityOptionId,
  escapeHtml,
  getItemCompendiums,
  getPackLabelById,
  getQuickOptionsFromSettings,
  getQuickOptionValidationIssues,
  getSkillChoices,
  getSkillLabel,
  sanitizeQuickOptionsForStorage,
  serializeQuickOptionsTexts,
  validateQuickOptionDraft
} from "../helpers/activity-presets.js";
import { getRewardStackText } from "../helpers/reward-utils.js";
import { isActiveGmUser } from "../helpers/active-gm-core.js";
import { clearActorSearchLog, getActorSearchLog } from "../helpers/resource-store.js";
import { previewLootRewards } from "../helpers/search-engine.js";
import { notifyError } from "../helpers/notification-utils.js";
import { getModuleLocaleTag, t } from "../i18n.js";
import {
  bringDialogToFront,
  getDialogForm,
  isHtmlElement,
  linkFormLabels
} from "./dialog-utils.js";
import {
  openConfigExportDialog,
  openConfigImportDialog
} from "./config-transfer-dialogs.js";
import { renderHistoryTab } from "./gm-control-panel-history-view.js";
import { renderLaunchTab } from "./gm-control-panel-launch-view.js";
import { renderPresetsTab } from "./gm-control-panel-presets-view.js";
import { renderResponsesTab } from "./gm-control-panel-responses-view.js";
import { GM_UI_ASSETS, renderGmIcon } from "./gm-control-panel-view-shared.js";
import { GmControlPanelApplication } from "./gm-control-panel-application.js";
import {
  createGmControlPanelController,
  GM_CONTROL_PANEL_PARTS
} from "./gm-control-panel-controller.js";
import { getViewportSafeGmPanelSize } from "./gm-control-panel-layout-core.js";
import { openSearchDialog } from "./search-dialog.js";
import {
  ensureStateSelections as ensureStateSelectionsState,
  getFilteredLiveEntries,
  getFilteredPresets as getFilteredPresetsState,
  getLatestSession,
  getKeyboardTabTarget,
  getResponseEntryKey,
  getSelectedSession,
  getSelectedUserIds as getSelectedUserIdsState,
  getSessionCounts,
  GM_LIVE_FILTERS,
  GM_PRESET_FILTERS,
  GM_RESPONSE_FILTERS,
  GM_SEND_MODES,
  GM_TABS
} from "./gm-control-panel-state.js";
import {
  ASSIGNMENT_MODE,
  closeSearchSession,
  getSearchSessionsSnapshot,
  sendSearchReminder,
  sendSearchOffers,
  subscribeToSearchSessions
} from "./search-offer-dialogs.js";
import {
  importModuleConfigFromText,
  saveLocationsFromText,
  saveLootPoolsFromText,
  serializeModuleConfigExport
} from "../settings.js";

const DialogV2 = foundry.applications.api.DialogV2;
let gmControlPanelApplication = null;
const gmControlPanelControllers = new WeakMap();

function getActivePlayers() {
  return (game.users?.contents ?? []).filter((user) => user.active && !user.isGM);
}

function getPlayerCharacterName(user) {
  return user.character?.name || t("WILDHARVEST.Dialog.Offer.NoCharacter");
}

function formatSignedModifier(value) {
  const numericValue = Number(value) || 0;
  return numericValue >= 0 ? `+${numericValue}` : String(numericValue);
}

function getRollModeLabel(rollMode) {
  const key = {
    advantage: "WILDHARVEST.Dialog.Search.RollModeAdvantage",
    disadvantage: "WILDHARVEST.Dialog.Search.RollModeDisadvantage"
  }[String(rollMode ?? "normal").trim().toLowerCase()] ?? "WILDHARVEST.Dialog.Search.RollModeNormal";
  return t(key);
}

function getGmControlPanelInitialSize() {
  return getViewportSafeGmPanelSize({
    viewportWidth: window?.innerWidth,
    viewportHeight: window?.innerHeight
  });
}

function getPresetCompendiumSummary(preset) {
  return (Array.isArray(preset.packIds) ? preset.packIds : [])
    .map((packId) => getPackLabelById(packId))
    .filter(Boolean)
    .join(", ");
}

function assertPresetReady(preset) {
  return validateQuickOptionDraft({
    ...preset,
    packIds: Array.isArray(preset?.packIds) ? preset.packIds : []
  });
}

function getPresetValidationMessages(preset) {
  return getQuickOptionValidationIssues(preset).map((key) => t(key));
}

function getSelectedPreset(state) {
  return state.quickOptions.find((entry) => entry.id === state.selectedPresetId) ?? state.quickOptions[0] ?? null;
}

function getResolvedPresetSkillId(preset, overrideSkillId) {
  return String(overrideSkillId ?? "").trim().toLowerCase() || String(preset?.skillId ?? "").trim().toLowerCase();
}

function getResolvedPresetSkillLabel(preset, overrideSkillId) {
  return getSkillLabel(getResolvedPresetSkillId(preset, overrideSkillId));
}

function getSelectedUserIds(state) {
  return getSelectedUserIdsState(state, {
    activePlayers: getActivePlayers(),
    wholePartyMode: GM_SEND_MODES.WHOLE_PARTY
  });
}

function ensureStateSelections(state) {
  return ensureStateSelectionsState(state, {
    activePlayers: getActivePlayers(),
    liveFilters: Object.values(GM_LIVE_FILTERS),
    responseFilters: Object.values(GM_RESPONSE_FILTERS),
    presetFilters: Object.values(GM_PRESET_FILTERS)
  });
}

function getSessionModeLabel(session) {
  return session?.mode === ASSIGNMENT_MODE.PER_PLAYER
    ? t("WILDHARVEST.Dialog.Responses.ModePerPlayer")
    : t("WILDHARVEST.Dialog.Responses.ModeParty");
}

function getLiveFilterOptions() {
  return [
    { id: GM_LIVE_FILTERS.ALL, label: t("WILDHARVEST.Dialog.ControlPanel.LiveFilterAll") },
    { id: GM_LIVE_FILTERS.COMPLETED, label: t("WILDHARVEST.Dialog.ControlPanel.LiveFilterCompleted") },
    { id: GM_LIVE_FILTERS.PENDING, label: t("WILDHARVEST.Dialog.ControlPanel.LiveFilterPending") }
  ];
}

function getActiveSessionLabel(state) {
  const session = getLatestSession(state);
  if (!session) return t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneNone");

  const entries = Object.values(session.offers ?? {});
  return entries[0]?.activityName ?? session.id;
}

function getControlPanelLastUpdated(state) {
  if (!state.lastRefreshedAt) return t("WILDHARVEST.Dialog.ControlPanel.LastUpdatedNow");
  return new Date(state.lastRefreshedAt).toLocaleString(getModuleLocaleTag());
}

function getFilteredPresets(state) {
  return getFilteredPresetsState(state, {
    allFilter: GM_PRESET_FILTERS.ALL,
    needsAttentionFilter: GM_PRESET_FILTERS.NEEDS_ATTENTION,
    getPresetValidationMessages,
    getSkillLabel,
    getPresetCompendiumSummary,
    locale: getModuleLocaleTag()
  });
}

function isSessionClosed(session) {
  return Boolean(session?.closedAt);
}

function getPresetActivity(preset, state) {
  if (!preset) return null;

  return {
    ...preset,
    skillId: getResolvedPresetSkillId(preset, state?.selectedSkillOverride),
    skillLabel: getResolvedPresetSkillLabel(preset, state?.selectedSkillOverride),
    lootPoolId: preset.lootPoolId ?? ""
  };
}

async function saveQuickOptions(quickOptions) {
  const normalizedQuickOptions = sanitizeQuickOptionsForStorage(quickOptions);
  const { locationsText, lootPoolsText } = serializeQuickOptionsTexts(normalizedQuickOptions);
  await saveLootPoolsFromText(lootPoolsText, { validatePackIds: false, filterUnavailablePackIds: true });
  await saveLocationsFromText(locationsText);
  return normalizedQuickOptions;
}

function getResponsesStatusMeta(status) {
  const normalized = String(status ?? "pending").trim().toLowerCase();
  if (normalized === "completed") {
    return {
      label: t("WILDHARVEST.Dialog.Responses.Completed"),
      className: "wildharvest-gm-status--completed",
      iconAsset: GM_UI_ASSETS.completed
    };
  }

  if (normalized === "accepted") {
    return {
      label: t("WILDHARVEST.Dialog.ControlPanel.Joined"),
      className: "wildharvest-gm-status--accepted",
      iconAsset: GM_UI_ASSETS.joined
    };
  }

  if (normalized === "resolving") {
    return {
      label: t("WILDHARVEST.Dialog.Responses.Resolving"),
      className: "wildharvest-gm-status--accepted",
      iconAsset: GM_UI_ASSETS.pending
    };
  }

  if (normalized === "failed") {
    return {
      label: t("WILDHARVEST.Dialog.Responses.Failed"),
      className: "wildharvest-gm-status--declined",
      iconClass: "fa-solid fa-triangle-exclamation"
    };
  }

  if (normalized === "declined") {
    return {
      label: t("WILDHARVEST.Dialog.ControlPanel.Skipped"),
      className: "wildharvest-gm-status--declined",
      iconClass: "fa-solid fa-ban"
    };
  }

  return {
    label: t("WILDHARVEST.Dialog.Responses.Pending"),
    className: "wildharvest-gm-status--pending",
    iconAsset: GM_UI_ASSETS.pending
  };
}

function renderTabButton(tabId, label, activeTab, iconPath) {
  const isActive = tabId === activeTab;
  const activeClass = isActive ? " is-active" : "";
  return `
    <button
      type="button"
      id="wildharvest-gm-tab-${escapeHtml(tabId)}"
      class="wildharvest-gm-tab${activeClass}"
      role="tab"
      data-gm-tab="${escapeHtml(tabId)}"
      aria-selected="${isActive ? "true" : "false"}"
      aria-controls="wildharvest-gm-tabpanel-${escapeHtml(tabId)}"
      tabindex="${isActive ? "0" : "-1"}"
    >
      ${renderGmIcon(iconPath, "wildharvest-gm-tab__asset")}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderActiveSceneBox(state) {
  const session = getLatestSession(state);
  if (!session) {
    return `
      <section class="wildharvest-gm-active-scene wildharvest-gm-active-scene--empty">
        <div class="wildharvest-gm-active-scene__icon">
          ${renderGmIcon(GM_UI_ASSETS.launchScene, "wildharvest-gm-active-scene__asset")}
        </div>
        <div class="wildharvest-gm-active-scene__content">
          <h4>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneTitle"))}</h4>
          <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneNone"))}</p>
        </div>
      </section>
    `;
  }

  const sessionName = getActiveSessionLabel(state);
  const modeLabel = getSessionModeLabel(session);
  const counts = getSessionCounts(session);
  const statusLabel = isSessionClosed(session)
    ? t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneClosed")
    : t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneOpen");
  const statusClass = isSessionClosed(session)
    ? " wildharvest-gm-status--declined"
    : " wildharvest-gm-status--completed";

  return `
    <section class="wildharvest-gm-active-scene">
      <div class="wildharvest-gm-active-scene__icon">
        ${renderGmIcon(isSessionClosed(session) ? GM_UI_ASSETS.closed : GM_UI_ASSETS.launchScene, "wildharvest-gm-active-scene__asset")}
      </div>
      <div class="wildharvest-gm-active-scene__content">
        <h4>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneTitle"))}</h4>
        <strong>${escapeHtml(sessionName)}</strong>
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Created"))}: ${escapeHtml(session.createdAt ?? "")}</p>
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SendTo"))}: ${escapeHtml(modeLabel)}</p>
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneProgress", {
          completed: counts.completed,
          total: counts.total
        }))}</p>
      </div>
      <div class="wildharvest-gm-active-scene__aside">
        <span class="wildharvest-gm-status${statusClass}">
          ${renderGmIcon(isSessionClosed(session) ? GM_UI_ASSETS.closed : GM_UI_ASSETS.completed, "wildharvest-gm-status__asset")}
          ${escapeHtml(statusLabel)}
        </span>
        ${renderLiveSessionActionButtons(session)}
      </div>
    </section>
  `;
}

function renderLiveSessionActionButtons(session) {
  if (!session) return "";

  const counts = getSessionCounts(session);
  const canSendReminder = counts.pending > 0 && !isSessionClosed(session);
  const canCloseScene = !isSessionClosed(session);

  return `
    <div class="wildharvest-inline-actions wildharvest-inline-actions--end wildharvest-gm-session-actions">
      <button type="button" class="button" data-action="gm-open-responses">
        ${renderGmIcon(GM_UI_ASSETS.responses, "wildharvest-gm-button__asset")}
        <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.OpenResponses"))}</span>
      </button>
      ${canSendReminder ? `
        <button type="button" class="button" data-action="gm-send-reminder">
          ${renderGmIcon(GM_UI_ASSETS.reminder, "wildharvest-gm-button__asset")}
          <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SendReminder"))}</span>
        </button>
      ` : ""}
      ${canCloseScene ? `
        <button type="button" class="button" data-action="gm-close-scene">
          ${renderGmIcon(GM_UI_ASSETS.closeScene, "wildharvest-gm-button__asset")}
          <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CloseScene"))}</span>
        </button>
      ` : ""}
    </div>
  `;
}

function getResponseEntryActorName(entry) {
  return entry.actorName || entry.linkedCharacterName || t("WILDHARVEST.Dialog.Offer.NoCharacter");
}

function getResponseEntryViewModel(entry) {
  const statusMeta = getResponsesStatusMeta(entry.status);
  const hasResult = Boolean(entry.result);
  const entryClass = {
    completed: "is-completed",
    accepted: "is-pending",
    resolving: "is-pending",
    pending: "is-pending",
    failed: "is-skipped",
    declined: "is-skipped"
  }[entry.status] ?? "is-pending";
  const waitingText = hasResult
    ? ""
    : (entry.status === "resolving"
      ? t("WILDHARVEST.Dialog.Responses.Resolving")
      : entry.status === "failed"
        ? t("WILDHARVEST.Dialog.Responses.Failed")
        : entry.status === "accepted"
      ? t("WILDHARVEST.Dialog.ControlPanel.JoinedWaitingStatus")
      : entry.status === "declined"
        ? t("WILDHARVEST.Dialog.ControlPanel.PlayerDeclined")
        : t("WILDHARVEST.Dialog.ControlPanel.WaitingStatus"));
  const rewardsText = entry.result?.rewards?.length
    ? entry.result.rewards.map((reward) => getRewardStackText(reward)).join(" | ")
    : t("WILDHARVEST.Dialog.ControlPanel.NoRewardsShort");
  const baseSkillModifier = Number(entry.result?.baseSkillModifier ?? entry.result?.finalSkillModifier ?? 0);
  const extraModifier = Number(entry.result?.extraModifier ?? 0);
  const finalSkillModifier = Number(entry.result?.finalSkillModifier ?? baseSkillModifier + extraModifier);

  return {
    statusMeta,
    hasResult,
    entryClass,
    actorName: getResponseEntryActorName(entry),
    waitingText,
    rewardsText,
    modifierAuditText: t("WILDHARVEST.Dialog.Responses.ModifierAudit", {
      base: formatSignedModifier(baseSkillModifier),
      extra: formatSignedModifier(extraModifier),
      final: formatSignedModifier(finalSkillModifier)
    }),
    rollModeLabel: getRollModeLabel(entry.result?.rollMode),
    destinationName: String(entry.result?.containerName ?? "").trim()
      || t("WILDHARVEST.Dialog.Search.MainInventory"),
    rollTotal: Number(entry.result?.rollTotal ?? 0),
    lootPoints: Number(entry.result?.lootPoints ?? 0),
    updatedAt: String(entry.updatedAt ?? "").trim()
  };
}

function renderResponseEntryCard(session, entry, state) {
  const view = getResponseEntryViewModel(entry);
  const entryKey = getResponseEntryKey(session.id, entry);
  const isExpanded = state.expandedResponseKey === entryKey;
  const detailMarkup = view.hasResult
    ? `
      <div class="wildharvest-gm-response-entry__details">
        <strong>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Rewards"))}</strong>
        <p>${escapeHtml(view.rewardsText)}</p>
        <span>${escapeHtml(view.modifierAuditText)}</span>
        <span>${escapeHtml(t("WILDHARVEST.Dialog.Search.RollMode"))}: ${escapeHtml(view.rollModeLabel)}</span>
        <span>${escapeHtml(t("WILDHARVEST.Dialog.Search.LootDestination"))}: ${escapeHtml(view.destinationName)}</span>
        ${view.updatedAt ? `<span>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Updated"))}: ${escapeHtml(view.updatedAt)}</span>` : ""}
      </div>
    `
    : `
      <div class="wildharvest-gm-response-entry__details">
        <strong>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Status"))}</strong>
        <p>${escapeHtml(view.waitingText)}</p>
        ${view.updatedAt ? `<span>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Updated"))}: ${escapeHtml(view.updatedAt)}</span>` : ""}
      </div>
    `;

  return `
    <article class="wildharvest-gm-response-entry ${escapeHtml(view.entryClass)}${view.hasResult ? " has-result" : ""}${isExpanded ? "" : " is-collapsed"}">
      <div class="wildharvest-gm-response-entry__main">
        <div class="wildharvest-gm-response-entry__dot" aria-hidden="true"></div>
        <div class="wildharvest-gm-response-entry__identity">
          <strong>${escapeHtml(entry.userName)}</strong>
          <p>${escapeHtml(view.actorName)}</p>
        </div>
        ${view.hasResult ? `
          <div class="wildharvest-gm-response-entry__stat">
            <span>${escapeHtml(t("WILDHARVEST.Dialog.Result.FinalResult"))}</span>
            <strong>${escapeHtml(String(view.rollTotal))}</strong>
          </div>
          <div class="wildharvest-gm-response-entry__stat">
            <span>${escapeHtml(t("WILDHARVEST.Dialog.Result.LootPoints"))}</span>
            <strong>${escapeHtml(String(view.lootPoints))}</strong>
          </div>
        ` : `
          <div class="wildharvest-gm-response-entry__waiting">
            ${escapeHtml(view.waitingText)}
          </div>
        `}
        <span class="wildharvest-gm-status ${escapeHtml(view.statusMeta.className)}">
          ${view.statusMeta.iconAsset
            ? renderGmIcon(view.statusMeta.iconAsset, "wildharvest-gm-status__asset")
            : `<i class="${escapeHtml(view.statusMeta.iconClass ?? "")}" aria-hidden="true"></i>`}
          ${escapeHtml(view.statusMeta.label)}
        </span>
        <button
          type="button"
          class="wildharvest-gm-response-entry__toggle"
          data-action="gm-toggle-response"
          data-session-id="${escapeHtml(session.id)}"
          data-entry-user-id="${escapeHtml(String(entry.userId ?? ""))}"
          aria-expanded="${isExpanded ? "true" : "false"}"
        >
          <i class="fa-solid ${isExpanded ? "fa-chevron-up" : "fa-chevron-down"}" aria-hidden="true"></i>
        </button>
      </div>
      ${detailMarkup}
    </article>
  `;
}

function renderResponseStats(session) {
  const counts = getSessionCounts(session);
  const items = [
    { label: t("WILDHARVEST.Dialog.Responses.Completed"), value: counts.completed, className: "is-completed" },
    { label: t("WILDHARVEST.Dialog.ControlPanel.Joined"), value: counts.accepted, className: "is-accepted" },
    { label: t("WILDHARVEST.Dialog.Responses.Resolving"), value: counts.resolving, className: "is-pending" },
    { label: t("WILDHARVEST.Dialog.Responses.Pending"), value: counts.pending, className: "is-pending" },
    { label: t("WILDHARVEST.Dialog.Responses.Failed"), value: counts.failed, className: "is-declined" },
    { label: t("WILDHARVEST.Dialog.ControlPanel.Skipped"), value: counts.declined, className: "is-declined" }
  ];

  return `
    <div class="wildharvest-gm-stat-grid">
      ${items.map((item) => `
        <article class="wildharvest-gm-stat ${escapeHtml(item.className)}">
          <strong>${escapeHtml(String(item.value))}</strong>
          <span>${escapeHtml(item.label)}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSessionSelector(state) {
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  if (!sessions.length) return "";

  return `
    <div class="wildharvest-gm-session-selector">
      ${sessions.slice().reverse().map((session) => {
        const counts = getSessionCounts(session);
        const entries = Object.values(session.offers ?? {});
        const name = entries[0]?.activityName ?? session.id;
        const activeClass = session.id === state.selectedSessionId ? " is-active" : "";
        return `
          <button type="button" class="wildharvest-gm-session-chip${activeClass}" data-action="gm-select-session" data-session-id="${escapeHtml(session.id)}" aria-pressed="${session.id === state.selectedSessionId ? "true" : "false"}">
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(`${counts.completed}/${counts.total}`)} ${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Completed"))}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderResponseEntries(session, state) {
  const entries = Object.values(session?.offers ?? {});
  if (!entries.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Responses.Empty"))}</p>`;
  }

  return entries.map((entry) => renderResponseEntryCard(session, entry, state)).join("");
}

function renderLiveResponsesPanel(state) {
  const session = getLatestSession(state);
  if (!session) {
    return `
      <article class="wildharvest-gm-card wildharvest-gm-card--secondary wildharvest-gm-live-card">
        <div class="wildharvest-gm-card__header">
          <div>
            <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesTitle"))}</h3>
            <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesHint"))}</p>
          </div>
        </div>
        <div class="wildharvest-gm-empty-state-card">
          ${renderGmIcon(GM_UI_ASSETS.pending, "wildharvest-gm-empty-state-card__asset")}
          <strong>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesEmpty"))}</strong>
          <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesHint"))}</p>
        </div>
      </article>
    `;
  }

  const entries = Object.values(session.offers ?? {});
  const counts = getSessionCounts(session);
  const modeLabel = getSessionModeLabel(session);
  const sessionName = entries[0]?.activityName ?? session.id;
  const visibleEntries = getFilteredLiveEntries(session, state.liveFilter);
  const filterOptions = getLiveFilterOptions();
  const closedMarkup = isSessionClosed(session)
    ? `<p class="wildharvest-gm-live-summary__meta">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SceneClosedMeta", { closedAt: session.closedAt }))}</p>`
    : "";

  return `
    <article class="wildharvest-gm-card wildharvest-gm-card--secondary wildharvest-gm-live-card">
      <div class="wildharvest-gm-card__header">
        <div>
          <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesTitle"))}</h3>
          <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesHint"))}</p>
        </div>
        ${renderLiveSessionActionButtons(session)}
      </div>

      <div class="wildharvest-gm-live-summary">
        <div class="wildharvest-gm-live-summary__scene">
          <strong>${escapeHtml(sessionName)}</strong>
          <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SessionMeta", {
            mode: modeLabel,
            createdAt: session.createdAt
          }))}</p>
          ${closedMarkup}
        </div>
        <div class="wildharvest-gm-progress wildharvest-gm-progress--badge">
          <strong class="wildharvest-gm-progress__count">${escapeHtml(`${counts.completed} / ${counts.total}`)}</strong>
          <span class="wildharvest-gm-progress__label">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Completed"))}</span>
        </div>
        <div class="wildharvest-gm-live-filters" role="group" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.FiltersLabel"))}">
          ${filterOptions.map((option) => `
            <button
              type="button"
              class="button${state.liveFilter === option.id ? " is-active" : ""}"
              data-action="gm-live-filter"
              data-filter-id="${escapeHtml(option.id)}"
              aria-pressed="${state.liveFilter === option.id ? "true" : "false"}"
            >
              ${escapeHtml(option.label)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="wildharvest-gm-response-list">
        ${visibleEntries.length
          ? visibleEntries.map((entry) => renderResponseEntryCard(session, entry, state)).join("")
          : `<div class="wildharvest-gm-empty-state-card wildharvest-gm-empty-state-card--compact">
              ${renderGmIcon(GM_UI_ASSETS.pending, "wildharvest-gm-empty-state-card__asset")}
              <strong>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesEmptyFiltered"))}</strong>
            </div>`}
      </div>
    </article>
  `;
}

function openExportConfigDialog(parentDialog) {
  openConfigExportDialog(parentDialog, serializeModuleConfigExport());
}

function openImportConfigDialog(parentDialog, state) {
  openConfigImportDialog(parentDialog, {
    onImport: async (rawText) => {
      await importModuleConfigFromText(rawText);
      state.quickOptions = getQuickOptionsFromSettings();
      state.selectedPresetId = "";
      state.selectedSkillOverride = "";
      state.activeTab = GM_TABS.PRESETS;
      ensureStateSelections(state);
      refreshControlPanel(parentDialog, state);
    }
  });
}

function renderTabContent(state) {
  if (state.activeTab === GM_TABS.RESPONSES) {
    return renderResponsesTab(state, {
      isSessionClosed,
      renderLiveSessionActionButtons,
      renderResponseEntryCard,
      renderResponseStats,
      renderSessionSelector
    });
  }
  if (state.activeTab === GM_TABS.PRESETS) {
    return renderPresetsTab(state, {
      getFilteredPresets,
      getPresetCompendiumSummary,
      getPresetValidationMessages
    });
  }
  if (state.activeTab === GM_TABS.HISTORY) return renderHistoryTab(state);
  return renderLaunchTab(state, {
    getActivePlayers,
    getPlayerCharacterName,
    getPresetCompendiumSummary,
    getPresetValidationMessages,
    getSelectedPreset,
    renderActiveSceneBox,
    renderLiveResponsesPanel
  });
}

function renderControlPanelPart(partId, state) {
  if (partId === GM_CONTROL_PANEL_PARTS.HEADER) {
    return `
      <header class="wildharvest-gm-panel__header">
        <div class="wildharvest-gm-panel__title">
          <h2>
            ${renderGmIcon(GM_UI_ASSETS.controlPanel, "wildharvest-gm-panel__title-asset")}
            <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Title"))}</span>
          </h2>
          <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Description"))}</p>
        </div>
      </header>
    `;
  }

  if (partId === GM_CONTROL_PANEL_PARTS.TABS) {
    return `
      <nav class="wildharvest-gm-tabs" role="tablist" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.TabsLabel"))}">
        ${renderTabButton(GM_TABS.LAUNCH, t("WILDHARVEST.Dialog.ControlPanel.TabLaunch"), state.activeTab, GM_UI_ASSETS.launchScene)}
        ${renderTabButton(GM_TABS.RESPONSES, t("WILDHARVEST.Dialog.ControlPanel.TabResponses"), state.activeTab, GM_UI_ASSETS.responses)}
        ${renderTabButton(GM_TABS.PRESETS, t("WILDHARVEST.Dialog.ControlPanel.TabPresets"), state.activeTab, GM_UI_ASSETS.presets)}
        ${renderTabButton(GM_TABS.HISTORY, t("WILDHARVEST.Dialog.ControlPanel.TabHistory"), state.activeTab, GM_UI_ASSETS.history)}
      </nav>
    `;
  }

  if (partId === GM_CONTROL_PANEL_PARTS.CONTENT) {
    return `
      <section
        id="wildharvest-gm-tabpanel-${escapeHtml(state.activeTab)}"
        class="wildharvest-gm-panel__body"
        role="tabpanel"
        aria-labelledby="wildharvest-gm-tab-${escapeHtml(state.activeTab)}"
        tabindex="0"
      >
        ${renderTabContent(state)}
      </section>
    `;
  }

  return `
      <footer class="wildharvest-gm-footer">
        <div class="wildharvest-gm-footer__meta">
          <span class="wildharvest-gm-footer__dot" aria-hidden="true"></span>
          <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LastUpdated", { updatedAt: getControlPanelLastUpdated(state) }))}</span>
        </div>
        <a
          class="wildharvest-gm-footer__support"
          href="https://ko-fi.com/tomorrokoshii"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SupportKoFi"))}"
        >
          <i class="fa-solid fa-mug-hot" aria-hidden="true"></i>
          <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SupportKoFi"))}</span>
        </a>
      </footer>
  `;
}

function hasLiveControlPanelSession(state) {
  const latestSession = getLatestSession(state);
  return Boolean(latestSession && !isSessionClosed(latestSession));
}

function refreshControlPanel(application, _state, options = {}) {
  return gmControlPanelControllers.get(application)?.refresh(options);
}

async function persistQuickOptionsAndRefresh(dialog, state, quickOptions, nextTab = GM_TABS.PRESETS) {
  state.quickOptions = await saveQuickOptions(quickOptions);
  state.activeTab = nextTab;
  ensureStateSelections(state);
  refreshControlPanel(dialog, state);
  ui.notifications.info(t("WILDHARVEST.Notifications.ConfigSaved"));
}

function openDeletePresetConfirmDialog(parentDialog, state, presetId) {
  const preset = state.quickOptions.find((entry) => entry.id === presetId);
  if (!preset) return;

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.DeletePresetTitle")
    },
    content: `
      <div class="wildharvest-dialog">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.DeletePresetPrompt", { presetName: preset.name }))}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.ControlPanel.DeletePresetConfirm"),
        icon: "fa-solid fa-trash",
        default: true,
        callback: async () => {
          const nextQuickOptions = state.quickOptions.filter((entry) => entry.id !== preset.id);
          await persistQuickOptionsAndRefresh(parentDialog, state, nextQuickOptions);
          dialog.close();
          bringDialogToFront(parentDialog);
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.render({ force: true });
}

function renderEditorSkillOptions(selectedSkillId = "") {
  return getSkillChoices()
    .map((choice) => {
      const selected = choice.id === selectedSkillId ? " selected" : "";
      return `<option value="${escapeHtml(choice.id)}"${selected}>${escapeHtml(choice.label)}</option>`;
    })
    .join("");
}

function renderCompendiumSelectionRows(selectedPackIds, filterState = {}) {
  const selected = new Set(selectedPackIds);
  const searchText = String(filterState.searchText ?? "").trim().toLowerCase();
  const scope = String(filterState.scope ?? "all").trim().toLowerCase();
  let compendiums = getItemCompendiums();

  if (scope === "selected") {
    compendiums = compendiums.filter((pack) => selected.has(pack.id));
  } else if (scope === "world") {
    compendiums = compendiums.filter((pack) => pack.id.startsWith("world."));
  } else if (scope === "system") {
    compendiums = compendiums.filter((pack) => !pack.id.startsWith("world."));
  }

  if (searchText) {
    compendiums = compendiums.filter((pack) => {
      const haystack = `${pack.name} ${pack.id}`.toLowerCase();
      return haystack.includes(searchText);
    });
  }

  if (!compendiums.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Compendiums.Empty"))}</p>`;
  }

  return `
    <div class="wildharvest-gm-compendium-list">
      ${compendiums.map((pack) => `
        <label class="wildharvest-gm-compendium-option">
          <input
            type="checkbox"
            name="activityPackId"
            value="${escapeHtml(pack.id)}"
            ${selected.has(pack.id) ? "checked" : ""}
          >
          <span>
            <strong>${escapeHtml(pack.name)}</strong>
            <small>${escapeHtml(pack.id)}</small>
          </span>
        </label>
      `).join("")}
    </div>
  `;
}

function openPresetEditorDialog({ parentDialog, state, quickOption = null, onSave }) {
  const initialSkillId = String(quickOption?.skillId ?? getSkillChoices()[0]?.id ?? "").trim().toLowerCase();
  const initialPackIds = Array.isArray(quickOption?.packIds) ? quickOption.packIds : [];
  const filterState = {
    searchText: "",
    scope: "all"
  };
  let selectedPackIdsState = [...initialPackIds];

  const dialog = new DialogV2({
    window: {
      title: quickOption ? t("WILDHARVEST.Dialog.ControlPanel.EditPresetTitle") : t("WILDHARVEST.Dialog.ControlPanel.CreatePresetTitle")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Name"))}</label>
          <input type="text" name="activityName" value="${escapeHtml(quickOption?.name ?? "")}">
        </div>
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Skill"))}</label>
          <select name="skillId">
            ${renderEditorSkillOptions(initialSkillId)}
          </select>
        </div>
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Description"))}</label>
          <textarea name="activityDescription" rows="4">${escapeHtml(quickOption?.description ?? "")}</textarea>
        </div>
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.Compendiums"))}</label>
          <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.ActivityEditor.CompendiumsHint"))}</p>
        </div>
        <div class="wildharvest-gm-editor-filters">
          <input type="search" name="compendiumSearch" value="" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CompendiumSearchPlaceholder"))}" placeholder="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CompendiumSearchPlaceholder"))}">
          <select name="compendiumScope" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeLabel"))}">
            <option value="all">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeAll"))}</option>
            <option value="selected">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeSelected"))}</option>
            <option value="world">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeWorld"))}</option>
            <option value="system">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeSystem"))}</option>
          </select>
        </div>
        <div data-compendium-selection>
          ${renderCompendiumSelectionRows(initialPackIds, filterState)}
        </div>
      </div>
    `,
    buttons: [
      {
        action: "save",
        label: t("WILDHARVEST.Dialog.Config.Save"),
        icon: "fa-solid fa-save",
        default: true,
        callback: async (_event, button, instance) => {
          try {
            const form = getDialogForm(instance, button);
            const name = String(form?.elements?.activityName?.value ?? "").trim();
            if (!name) throw new Error(t("WILDHARVEST.Errors.ActivityNameRequiredSimple"));

            const skillId = String(form?.elements?.skillId?.value ?? "").trim().toLowerCase();
            if (!skillId) throw new Error(t("WILDHARVEST.Errors.ActivitySkillRequired"));

            const packIds = [...new Set(selectedPackIdsState.map((packId) => String(packId ?? "").trim()).filter(Boolean))];
            const id = createUniqueActivityOptionId(name, state.quickOptions, quickOption?.id ?? "");

            await onSave(validateQuickOptionDraft({
              id,
              name,
              description: String(form?.elements?.activityDescription?.value ?? "").trim(),
              skillId,
              lootPoolId: quickOption?.lootPoolId ?? id,
              packIds
            }));

            instance.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(error, "WILDHARVEST.Notifications.ConfigSaveFailed");
          }
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  function refreshCompendiumSelection() {
    const container = dialog.element?.querySelector?.("[data-compendium-selection]");
    if (!container) return;
    container.innerHTML = renderCompendiumSelectionRows(selectedPackIdsState, filterState);
  }

  dialog.addEventListener("render", () => {
    linkFormLabels(dialog.element, "preset-editor");
    dialog.element?.addEventListener("input", (event) => {
      const target = event.target;
      if (!isHtmlElement(target)) return;
      if (target.matches('[name="compendiumSearch"]')) {
        filterState.searchText = String(target.value ?? "");
        refreshCompendiumSelection();
      }
    });

    dialog.element?.addEventListener("change", (event) => {
      const target = event.target;
      if (!isHtmlElement(target)) return;
      if (target.matches('[name="compendiumScope"]')) {
        filterState.scope = String(target.value ?? "all");
        refreshCompendiumSelection();
        return;
      }

      if (target.matches('[name="activityPackId"]')) {
        const packId = String(target.value ?? "").trim();
        if (!packId) return;

        const selected = new Set(selectedPackIdsState);
        if (target.checked) selected.add(packId);
        else selected.delete(packId);
        selectedPackIdsState = [...selected];
      }
    });
  }, { once: true });

  dialog.render({ force: true });
}

function openClearHistoryConfirmDialog(parentDialog, state) {
  const actor = state.historyActorId ? game.actors.get(state.historyActorId) : null;
  if (!actor) {
    ui.notifications.warn(t("WILDHARVEST.Resources.NoActor"));
    return;
  }

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Logs.ClearTitle")
    },
    content: `
      <div class="wildharvest-dialog">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Logs.ClearPrompt", { actorName: actor.name }))}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.Logs.ClearConfirm"),
        icon: "fa-solid fa-trash",
        default: true,
        callback: async () => {
          try {
            await clearActorSearchLog(actor);
            state.historyEntryKey = "";
            refreshControlPanel(parentDialog, state);
            ui.notifications.info(t("WILDHARVEST.Notifications.LogsCleared", { actorName: actor.name }));
            dialog.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(new Error(t("WILDHARVEST.Notifications.LogsClearFailed", { actorName: actor.name })));
          }
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.render({ force: true });
}

function openCloseSceneConfirmDialog(parentDialog, state) {
  const session = getSelectedSession(state);
  if (!session || isSessionClosed(session)) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.SceneAlreadyClosed"));
    return;
  }

  const sessionName = Object.values(session.offers ?? {})[0]?.activityName ?? session.id;
  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.CloseSceneTitle")
    },
    content: `
      <div class="wildharvest-dialog">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CloseScenePrompt", { sessionName }))}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.ControlPanel.CloseSceneConfirm"),
        icon: "fa-solid fa-lock",
        default: true,
        callback: async () => {
          const closed = closeSearchSession(session.id);
          if (!closed) return;

          state.sessions = getSearchSessionsSnapshot();
          refreshControlPanel(parentDialog, state);
          dialog.close();
          bringDialogToFront(parentDialog);
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.render({ force: true });
}

function renderPreviewRewardSample(sample) {
  const rewardsMarkup = sample.rewards.length
    ? sample.rewards.map((reward) => `<li>${escapeHtml(getRewardStackText(reward))}</li>`).join("")
    : `<li>${escapeHtml(t("WILDHARVEST.Dialog.Result.NoItems"))}</li>`;
  const selectionPlan = sample.selectionGroups?.length
    ? sample.selectionGroups.map((group) => `${group.label} x${group.quantity}`).join(", ")
    : t("WILDHARVEST.History.None");
  const planKey = sample.strategy === "value"
    ? "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsValuePlan"
    : "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsPlan";
  const valueDetails = sample.strategy === "value"
    ? `<p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsValueDetails", {
      total: sample.totalValueGp,
      target: sample.targetValueGp,
      tolerance: sample.tolerancePercent,
      invalid: sample.invalidPriceCount,
      unaffordable: sample.unaffordableCount
    }))}</p>`
    : "";

  return `
    <article class="wildharvest-gm-card wildharvest-gm-preview-reward-card">
      <div class="wildharvest-gm-card__header">
        <div>
          <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsRollSample", {
            rollTotal: sample.rollTotal,
            lootPoints: sample.lootPoints
          }))}</h3>
          <p>${escapeHtml(t(planKey, { plan: selectionPlan }))}</p>
          ${valueDetails}
        </div>
      </div>
      <ul class="wildharvest-history">${rewardsMarkup}</ul>
    </article>
  `;
}

async function openPreviewRewardsDialog(parentDialog, state) {
  const preset = getSelectedPreset(state);
  if (!preset) {
    ui.notifications.warn(t("WILDHARVEST.Dialog.ControlPanel.NoPresetsDescription"));
    return;
  }

  try {
    const readyPreset = assertPresetReady(preset);
    const preview = await previewLootRewards(getPresetActivity(readyPreset, state));
    const breakdownMarkup = preview.breakdown
      .map((entry) => `
        <article class="wildharvest-gm-stat">
          <strong>${escapeHtml(entry.count === null ? String(entry.cost) : String(entry.count))}</strong>
          <span>${escapeHtml(`${entry.label} - ${t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsCost", { cost: entry.cost })}`)}</span>
        </article>
      `)
      .join("");
    const sampleMarkup = preview.samples.length
      ? preview.samples.map((sample) => renderPreviewRewardSample(sample)).join("")
      : `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsEmpty"))}</p>`;

    const dialog = new DialogV2({
      window: {
        title: t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsTitle", { presetName: preset.name })
      },
      content: `
        <div class="wildharvest-dialog wildharvest-dialog--wide">
          <section class="wildharvest-gm-card">
            <div class="wildharvest-gm-card__header">
              <div>
                <h3>${escapeHtml(preset.name)}</h3>
                <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsHint"))}</p>
              </div>
            </div>
            <div class="wildharvest-player-metrics">
              <div class="wildharvest-player-metric">
                <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsSource"))}</span>
                <strong>${escapeHtml(preview.lootSource.lootPoolLabel)}</strong>
              </div>
              <div class="wildharvest-player-metric">
                <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsItemCount"))}</span>
                <strong>${escapeHtml(String(preview.totalItems))}</strong>
              </div>
            </div>
          </section>
          <section class="wildharvest-gm-card">
            <div class="wildharvest-gm-card__header">
              <div>
                <h3>${escapeHtml(t(preview.strategy === "value"
                  ? "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsValueBreakdown"
                  : "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsRarityBreakdown"))}</h3>
              </div>
            </div>
            <div class="wildharvest-gm-stat-grid">${breakdownMarkup}</div>
          </section>
          <section class="wildharvest-gm-grid wildharvest-gm-grid--responses">
            ${sampleMarkup}
          </section>
        </div>
      `,
      buttons: [
        {
          action: "close",
          label: t("WILDHARVEST.Dialog.Close"),
          default: true
        }
      ],
      rejectClose: false
    });

    dialog.addEventListener("close", () => bringDialogToFront(parentDialog), { once: true });
    dialog.render({ force: true });
  } catch (error) {
    notifyError(error);
  }
}

async function handleSendScene(dialog, state) {
  try {
    const preset = getSelectedPreset(state);
    if (!preset) {
      ui.notifications.warn(t("WILDHARVEST.Dialog.ControlPanel.NoPresetsDescription"));
      return;
    }

    const readyPreset = assertPresetReady(preset);

    const players = getActivePlayers().filter((user) => getSelectedUserIds(state).includes(user.id));
    if (!players.length) {
      ui.notifications.warn(t("WILDHARVEST.Notifications.NoTargets"));
      return;
    }

    const skillId = getResolvedPresetSkillId(readyPreset, state.selectedSkillOverride);
    const skillLabel = getSkillLabel(skillId);
    const lootPoolLabel = getPresetCompendiumSummary(readyPreset);
    const mode = state.sendMode === GM_SEND_MODES.WHOLE_PARTY
      ? ASSIGNMENT_MODE.WHOLE_PARTY
      : ASSIGNMENT_MODE.PER_PLAYER;

    const offersByUserId = Object.fromEntries(players.map((user) => [
      user.id,
      {
        userId: user.id,
        userName: user.name,
        characterName: getPlayerCharacterName(user),
        locationId: ACTIVITY_CATALOG_LOCATION_ID,
        locationName: t("WILDHARVEST.Default.ActivityCatalogName"),
        activityId: readyPreset.id,
        activityName: readyPreset.name,
        lootPoolId: readyPreset.lootPoolId ?? "",
        lootPoolLabel,
        skillId,
        skillLabel
      }
    ]));

    const sessionId = sendSearchOffers(offersByUserId, mode, { openResponses: false });
    if (sessionId) {
      state.selectedSessionId = sessionId;
    }
    state.liveFilter = GM_LIVE_FILTERS.ALL;
    state.expandedResponseKey = "";
    state.sessions = getSearchSessionsSnapshot();
    refreshControlPanel(dialog, state);
  } catch (error) {
    notifyError(error);
  }
}

function handleSendReminder(dialog, state) {
  const session = getSelectedSession(state);
  if (!session) return;

  const offersByUserId = Object.fromEntries(
    Object.entries(session.offers ?? {})
      .filter(([, entry]) => entry.status === "pending")
      .map(([userId, entry]) => [
        userId,
        {
          userId,
          userName: entry.userName,
          characterName: entry.linkedCharacterName,
          locationId: entry.locationId,
          locationName: entry.locationName,
          activityId: entry.activityId,
          activityName: entry.activityName,
          lootPoolId: entry.lootPoolId ?? "",
          lootPoolLabel: entry.lootPoolLabel ?? "",
          skillId: entry.skillId ?? "",
          skillLabel: entry.skillLabel ?? ""
        }
      ])
  );

  const sent = sendSearchReminder(session.id, offersByUserId);
  if (sent) {
    ui.notifications.info(t("WILDHARVEST.Dialog.ControlPanel.ReminderSent"));
    state.sessions = getSearchSessionsSnapshot();
    refreshControlPanel(dialog, state);
  }
}

function openGmTestRoll(state) {
  try {
    const preset = getSelectedPreset(state);
    if (!preset) {
      ui.notifications.warn(t("WILDHARVEST.Dialog.ControlPanel.NoPresetsDescription"));
      return;
    }

    const readyPreset = assertPresetReady(preset);

    const availableActors = getLinkedPlayerCharacters();
    if (!availableActors.length) {
      ui.notifications.warn(t("WILDHARVEST.Dialog.ControlPanel.NoPlayerCharacters"));
      return;
    }

    const skillId = getResolvedPresetSkillId(readyPreset, state.selectedSkillOverride);
    const skillLabel = getSkillLabel(skillId);

    openSearchDialog({
      title: t("WILDHARVEST.Dialog.ControlPanel.TestRollTitle", { activityName: readyPreset.name }),
      locationId: ACTIVITY_CATALOG_LOCATION_ID,
      activityId: readyPreset.id,
      lootPoolId: readyPreset.lootPoolId ?? "",
      skillId,
      skillLabel,
      lockContext: true,
      availableActors
    });
  } catch (error) {
    notifyError(error);
  }
}

function handleControlPanelKeydown(dialog, event) {
  const tab = event.target?.closest?.('[role="tab"][data-gm-tab]');
  if (!tab) return;
  const tabIds = Object.values(GM_TABS);
  const nextTabId = getKeyboardTabTarget(tabIds, String(tab.dataset.gmTab ?? ""), event.key);
  if (!nextTabId) return;

  event.preventDefault();
  void gmControlPanelControllers.get(dialog)?.activateTab(nextTabId, { focus: true });
}

async function handleControlPanelClick(dialog, state, event) {
    const button = event.target?.closest?.("[data-action], [data-gm-tab]");
    if (!button) return;

    const tabId = String(button.dataset.gmTab ?? "").trim();
    if (tabId) {
      void gmControlPanelControllers.get(dialog)?.activateTab(tabId, { focus: true });
      return;
    }

    const action = String(button.dataset.action ?? "").trim();
    const presetId = String(button.dataset.presetId ?? "").trim();

    if (action === "gm-send-launch") {
      await handleSendScene(dialog, state);
      return;
    }

    if (action === "gm-test-roll") {
      openGmTestRoll(state);
      return;
    }

    if (action === "gm-preview-rewards") {
      if (button.disabled) return;
      const idleHtml = button.innerHTML;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CalculatingPreview"))}`;
      try {
        await openPreviewRewardsDialog(dialog, state);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.innerHTML = idleHtml;
        }
      }
      return;
    }

    if (action === "gm-select-session") {
      void gmControlPanelControllers.get(dialog)?.update({
        selectedSessionId: String(button.dataset.sessionId ?? ""),
        activeTab: GM_TABS.RESPONSES
      }, { navigation: true });
      return;
    }

    if (action === "gm-send-reminder") {
      state.selectedSessionId = getLatestSession(state)?.id ?? state.selectedSessionId;
      handleSendReminder(dialog, state);
      return;
    }

    if (action === "gm-close-scene") {
      state.selectedSessionId = getLatestSession(state)?.id ?? state.selectedSessionId;
      openCloseSceneConfirmDialog(dialog, state);
      return;
    }

    if (action === "gm-open-presets") {
      void gmControlPanelControllers.get(dialog)?.activateTab(GM_TABS.PRESETS);
      return;
    }

    if (action === "gm-open-responses") {
      void gmControlPanelControllers.get(dialog)?.update({
        selectedSessionId: getLatestSession(state)?.id ?? state.selectedSessionId,
        activeTab: GM_TABS.RESPONSES
      }, { navigation: true });
      return;
    }

    if (action === "gm-live-filter") {
      void gmControlPanelControllers.get(dialog)?.update({
        liveFilter: String(button.dataset.filterId ?? GM_LIVE_FILTERS.ALL)
      });
      return;
    }

    if (action === "gm-response-filter") {
      void gmControlPanelControllers.get(dialog)?.update({
        responseFilter: String(button.dataset.filterId ?? GM_RESPONSE_FILTERS.ALL)
      });
      return;
    }

    if (action === "gm-preset-filter") {
      void gmControlPanelControllers.get(dialog)?.update({
        presetModeFilter: String(button.dataset.filterId ?? GM_PRESET_FILTERS.ALL)
      });
      return;
    }

    if (action === "gm-select-history-actor") {
      void gmControlPanelControllers.get(dialog)?.update({
        historyActorId: String(button.dataset.actorId ?? "").trim(),
        historyEntryKey: ""
      });
      return;
    }

    if (action === "gm-select-history-entry") {
      void gmControlPanelControllers.get(dialog)?.update({
        historyEntryKey: String(button.dataset.entryKey ?? "")
      });
      return;
    }

    if (action === "gm-toggle-response") {
      const sessionId = String(button.dataset.sessionId ?? "").trim();
      const userId = String(button.dataset.entryUserId ?? "").trim();
      if (!sessionId || !userId) return;

      const entryKey = `${sessionId}:${userId}`;
      void gmControlPanelControllers.get(dialog)?.update({
        expandedResponseKey: state.expandedResponseKey === entryKey ? "" : entryKey
      });
      return;
    }

    if (action === "gm-send-preset") {
      void gmControlPanelControllers.get(dialog)?.update({
        selectedPresetId: presetId,
        selectedSkillOverride: "",
        activeTab: GM_TABS.LAUNCH
      }, { navigation: true });
      return;
    }

    if (action === "gm-create-preset") {
      openPresetEditorDialog({
        parentDialog: dialog,
        state,
        onSave: async (nextQuickOption) => {
          await persistQuickOptionsAndRefresh(dialog, state, [...state.quickOptions, nextQuickOption]);
        }
      });
      return;
    }

    if (action === "gm-export-config") {
      openExportConfigDialog(dialog);
      return;
    }

    if (action === "gm-import-config") {
      openImportConfigDialog(dialog, state);
      return;
    }

    if (action === "gm-edit-preset") {
      const currentQuickOption = state.quickOptions.find((entry) => entry.id === presetId);
      if (!currentQuickOption) return;

      openPresetEditorDialog({
        parentDialog: dialog,
        state,
        quickOption: currentQuickOption,
        onSave: async (nextQuickOption) => {
          const nextQuickOptions = state.quickOptions.map((entry) => entry.id === currentQuickOption.id ? nextQuickOption : entry);
          await persistQuickOptionsAndRefresh(dialog, state, nextQuickOptions);
        }
      });
      return;
    }

    if (action === "gm-duplicate-preset") {
      const currentQuickOption = state.quickOptions.find((entry) => entry.id === presetId);
      if (!currentQuickOption) return;

      const duplicateName = t("WILDHARVEST.Dialog.ControlPanel.DuplicateName", { presetName: currentQuickOption.name });
      const duplicate = {
        ...foundry.utils.deepClone(currentQuickOption),
        id: createUniqueActivityOptionId(duplicateName, state.quickOptions),
        lootPoolId: createUniqueActivityOptionId(duplicateName, state.quickOptions),
        name: duplicateName
      };
      await persistQuickOptionsAndRefresh(dialog, state, [...state.quickOptions, duplicate]);
      return;
    }

    if (action === "gm-delete-preset") {
      openDeletePresetConfirmDialog(dialog, state, presetId);
      return;
    }

    if (action === "gm-clear-history") {
      openClearHistoryConfirmDialog(dialog, state);
    }
}

async function handleControlPanelChange(dialog, state, event) {
    const target = event.target;
    if (!isHtmlElement(target)) return;

    if (target.matches('[name="gmPresetId"]')) {
      void gmControlPanelControllers.get(dialog)?.update({
        selectedPresetId: String(target.value ?? ""),
        selectedSkillOverride: ""
      });
      return;
    }

    if (target.matches('[name="gmSkillOverride"]')) {
      void gmControlPanelControllers.get(dialog)?.update({
        selectedSkillOverride: String(target.value ?? "")
      });
      return;
    }

    if (target.matches('[name="gmSendMode"]')) {
      void gmControlPanelControllers.get(dialog)?.update({
        sendMode: String(target.value ?? GM_SEND_MODES.WHOLE_PARTY)
      });
      return;
    }

    if (target.matches('[name="gmPresetFilter"]')) {
      void gmControlPanelControllers.get(dialog)?.update({
        presetFilter: String(target.value ?? "")
      });
      return;
    }

    if (target.matches('[name="gmHistoryFilter"]')) {
      void gmControlPanelControllers.get(dialog)?.update({
        historyFilter: String(target.value ?? "")
      });
      return;
    }

    if (target.matches("[data-recipient-id]")) {
      const input = target;
      const recipientId = String(input.dataset.recipientId ?? "");
      if (!recipientId) return;

      const nextSelected = new Set(state.selectedUserIds);
      if (input.checked) nextSelected.add(recipientId);
      else nextSelected.delete(recipientId);
      state.selectedUserIds = [...nextSelected];
    }
}

export function openGmControlPanel() {
  if (!isActiveGmUser(game.user, game.users?.activeGM)) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.ActiveGmOnly"));
    return;
  }

  if (gmControlPanelApplication?.element?.isConnected) {
    gmControlPanelApplication.bringToFront?.();
    return gmControlPanelApplication;
  }

  const state = {
    activeTab: GM_TABS.LAUNCH,
    quickOptions: getQuickOptionsFromSettings(),
    selectedPresetId: "",
    selectedSkillOverride: "",
    sendMode: GM_SEND_MODES.WHOLE_PARTY,
    liveFilter: GM_LIVE_FILTERS.ALL,
    responseFilter: GM_RESPONSE_FILTERS.ALL,
    expandedResponseKey: "",
    selectedUserIds: getActivePlayers().map((user) => user.id),
    sessions: getSearchSessionsSnapshot(),
    selectedSessionId: "",
    presetFilter: "",
    presetModeFilter: GM_PRESET_FILTERS.ALL,
    historyActorId: getDefaultActorId(getAvailableActors()),
    historyFilter: "",
    historyEntryKey: "",
    lastRefreshedAt: Date.now()
  };

  ensureStateSelections(state);

  const controller = createGmControlPanelController({
    state,
    normalizeState: ensureStateSelections,
    subscribeToSessions: subscribeToSearchSessions,
    onRenderError: notifyError
  });
  const application = new GmControlPanelApplication({
    state,
    renderPart: renderControlPanelPart,
    hasLiveSession: hasLiveControlPanelSession,
    handlers: {
      keydown: (event, app) => handleControlPanelKeydown(app, event),
      click: (event, app) => void handleControlPanelClick(app, state, event),
      change: (event, app) => void handleControlPanelChange(app, state, event),
      firstRender: (app) => controller.connect(app),
      close: (app) => {
        controller.disconnect();
        gmControlPanelControllers.delete(app);
        if (gmControlPanelApplication === app) gmControlPanelApplication = null;
      }
    }
  }, {
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.Title"),
      resizable: true
    },
    position: getGmControlPanelInitialSize()
  });
  gmControlPanelControllers.set(application, controller);
  gmControlPanelApplication = application;
  void application.render({
    force: true,
    focusSelector: `[data-gm-tab="${state.activeTab}"]`
  }).catch((error) => {
    controller.disconnect();
    gmControlPanelControllers.delete(application);
    if (gmControlPanelApplication === application) gmControlPanelApplication = null;
    notifyError(error);
  });
  return application;
}

export function closeGmControlPanelIfInactive() {
  if (isActiveGmUser(game.user, game.users?.activeGM)) return;
  if (gmControlPanelApplication?.element?.isConnected) {
    gmControlPanelApplication.close();
  }
}




