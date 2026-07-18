import {
  MODULE_ID,
  PLAYER_REQUEST_FLAG,
  SEARCH_SESSIONS_SETTING_KEY
} from "../constants.js";
import { getModuleLocaleTag, t } from "../i18n.js";
import {
  getActivitySkillLabel,
  getActorSkillModifier,
  getDnd5eSkillChoices,
  getDnd5eSkillLabel
} from "../helpers/dnd5e-support.js";
import { getRewardStackText } from "../helpers/reward-utils.js";
import { getActorSearchLog } from "../helpers/resource-store.js";
import { getActiveGmId, isActiveGmUser } from "../helpers/active-gm-core.js";
import {
  buildPlayerDocumentRequest,
  isValidPlayerDocumentRequest,
  PLAYER_REQUEST_TYPES
} from "../helpers/player-request-core.js";
import {
  claimSearchResolution,
  completeSearchResolution,
  failSearchResolution
} from "../helpers/search-authority-core.js";
import {
  emitGmSearchResolution,
  emitSearchOffer,
  emitSearchSessionClosed,
  emitSearchSessionSync,
  SOCKET_EVENT,
  SOCKET_MESSAGE_TYPES
} from "../helpers/search-session-socket.js";
import {
  MAX_PERSISTED_SESSIONS,
  collectPersistedSearchSessions,
  isAuthorizedSearchSocketMessage,
  restorePersistedSearchSessions,
  settleInterruptedResolutions
} from "../helpers/search-session-state.js";
import {
  openSearchDialog,
  openSearchResultFromLog,
  resolveSearchAsGm
} from "./search-dialog.js";
import {
  escapeHtml,
  getDialogForm,
  linkFormLabels
} from "./dialog-utils.js";
import { openPlayerSearchOfferDialog } from "./player-search-offer-dialog.js";
import {
  getLocations,
  getLootPoolLabel,
  getSelectedRandomLootPackLabel,
  hasSelectedRandomLootPacks
} from "../settings.js";

const DialogV2 = foundry.applications.api.DialogV2;
const ACTIVITY_CATALOG_LOCATION_ID = "wildharvest-options";
export const ASSIGNMENT_MODE = {
  WHOLE_PARTY: "whole-party",
  PER_PLAYER: "per-player"
};
let socketListenersRegistered = false;
let responsesDialog = null;
const playerOfferDialogs = new Map();
const pendingPlayerResults = new Map();
const closedSessionIds = new Set();
const searchSessions = new Map();
const sessionListeners = new Set();
const processedPlayerRequestIds = new Set();
let sessionPersistence = Promise.resolve();
let playerRequestQueue = Promise.resolve();
let interruptedResolutionTimer = null;
let lastKnownActiveGmId = "";
const INTERRUPTED_RESOLUTION_GRACE_MS = 30_000;

function getNowTimestamp() {
  return new Date().toLocaleString(getModuleLocaleTag());
}

function getOfferContext(locations, locationId, activityId) {
  const location = locations.find((entry) => entry.id === locationId) ?? locations[0];
  const activity = location?.activities.find((entry) => entry.id === activityId) ?? location?.activities[0];
  return { location, activity };
}

function isHiddenActivityCatalog(location) {
  return String(location?.id ?? "").trim() === ACTIVITY_CATALOG_LOCATION_ID;
}

function getActivePlayers() {
  return (game.users?.contents ?? []).filter((user) => user.active && !user.isGM);
}

function isCurrentUserActiveGm() {
  return isActiveGmUser(game.user, game.users?.activeGM);
}

function requireActiveGm() {
  if (isCurrentUserActiveGm()) return true;
  ui.notifications.warn(t("WILDHARVEST.Notifications.ActiveGmOnly"));
  return false;
}

function getCurrentActiveGmId(fallbackId = "") {
  return getActiveGmId(game.users?.activeGM, fallbackId);
}

function createPlayerRequestId() {
  return `${game.user.id}-${Date.now().toString(36)}-${foundry.utils.randomID(16)}`.slice(0, 128);
}

async function submitPlayerDocumentRequest(data) {
  const request = buildPlayerDocumentRequest({
    ...data,
    id: createPlayerRequestId(),
    createdAt: Date.now()
  });
  if (!isValidPlayerDocumentRequest(request)) {
    throw new Error(t("WILDHARVEST.Errors.InvalidPlayerRequest"));
  }
  await game.user.setFlag(MODULE_ID, PLAYER_REQUEST_FLAG, request);
  return request;
}

async function submitPlayerDecisionRequest(data) {
  try {
    return await submitPlayerDocumentRequest(data);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to submit authenticated player decision.`, error);
    ui.notifications.error(t("WILDHARVEST.Notifications.ActionFailed"));
    return null;
  }
}

function getPlayerCharacterName(user) {
  return user.character?.name || t("WILDHARVEST.Dialog.Offer.NoCharacter");
}

function createSessionId() {
  return foundry.utils.randomID?.() ?? `${Date.now()}`;
}

function buildActivitySkillOverride(activity, selectedSkillId) {
  const skillId = String(selectedSkillId ?? "").trim().toLowerCase();
  if (!skillId) return activity;

  return {
    ...activity,
    skillId,
    skillLabel: getDnd5eSkillLabel(skillId)
  };
}

function buildOfferActivity(location, activity, selectedSkillId) {
  const effectiveActivity = buildActivitySkillOverride(activity, selectedSkillId);
  return {
    ...effectiveActivity,
    lootPoolId: String(activity?.lootPoolId ?? location?.lootPoolId ?? "").trim() || null
  };
}

function getOfferLootPoolLabel(location, activity) {
  const lootPoolId = String(activity?.lootPoolId ?? location?.lootPoolId ?? "").trim();
  if (lootPoolId) {
    return getLootPoolLabel(lootPoolId);
  }

  if (hasSelectedRandomLootPacks()) {
    return getSelectedRandomLootPackLabel();
  }

  return "";
}

function renderActivityOptions(location, selectedActivityId) {
  return location.activities
    .map((activity) => {
      const selected = activity.id === selectedActivityId ? " selected" : "";
      return `<option value="${escapeHtml(activity.id)}"${selected}>${escapeHtml(activity.name)}</option>`;
    })
    .join("");
}

function renderSkillOptions(selectedSkillId = "") {
  const dnd5eSkillChoices = getDnd5eSkillChoices();
  const defaultSelected = !selectedSkillId ? " selected" : "";
  const options = dnd5eSkillChoices
    .map((entry) => {
      const selected = entry.id === selectedSkillId ? " selected" : "";
      return `<option value="${escapeHtml(entry.id)}"${selected}>${escapeHtml(entry.label)}</option>`;
    })
    .join("");

  return `
    <option value=""${defaultSelected}>${escapeHtml(t("WILDHARVEST.Dialog.Offer.UseActivitySkill"))}</option>
    ${options}
  `;
}

function renderOfferPreview(location, activity, selectedSkillId = "") {
  if (!location || !activity) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Preview.InvalidConfig"))}</p>`;
  }

  const effectiveActivity = buildOfferActivity(location, activity, selectedSkillId);
  const skillLabel = getActivitySkillLabel(effectiveActivity) || effectiveActivity.skillLabel;
  const lootPoolLabel = getOfferLootPoolLabel(location, effectiveActivity);
  const description = String(activity.description ?? location.description ?? "").trim();
  const lootPoolMarkup = lootPoolLabel
    ? `<p>${escapeHtml(t("WILDHARVEST.Preview.LootPoolValue", { lootPool: lootPoolLabel }))}</p>`
    : `<p class="wildharvest-muted">${escapeHtml(t("WILDHARVEST.Preview.CompendiumRequired"))}</p>`;
  const locationMarkup = isHiddenActivityCatalog(location)
    ? ""
    : `
      <div class="wildharvest-preview__block">
        <strong>${escapeHtml(location.name)}</strong>
        <p>${escapeHtml(location.description || t("WILDHARVEST.Preview.NoLocationDescription"))}</p>
      </div>
    `;

  return `
    ${locationMarkup}
    <div class="wildharvest-preview__block">
      <strong>${escapeHtml(activity.name)}</strong>
      <p>${escapeHtml(t("WILDHARVEST.Preview.Test", {
        skillLabel
      }))}</p>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      ${lootPoolMarkup}
    </div>
  `;
}

function renderPerPlayerRows(players, locations) {
  const initialLocation = locations[0];
  const initialActivity = initialLocation.activities[0];

  return players
    .map((user) => `
      <tr data-player-row="${escapeHtml(user.id)}">
        <td class="wildharvest-table__value">
          <input type="checkbox" name="targetUser-${escapeHtml(user.id)}" aria-label="${escapeHtml(`${t("WILDHARVEST.Dialog.Offer.SendTo")}: ${user.name}`)}" checked>
        </td>
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(getPlayerCharacterName(user))}</td>
        <td>
          <select name="playerActivity-${escapeHtml(user.id)}" data-player-activity="${escapeHtml(user.id)}" aria-label="${escapeHtml(`${t("WILDHARVEST.Dialog.Search.Activity")}: ${user.name}`)}">
            ${renderActivityOptions(initialLocation, initialActivity.id)}
          </select>
        </td>
        <td>
          <select name="playerSkill-${escapeHtml(user.id)}" data-player-skill="${escapeHtml(user.id)}" aria-label="${escapeHtml(`${t("WILDHARVEST.Dialog.Offer.Skill")}: ${user.name}`)}">
            ${renderSkillOptions("")}
          </select>
        </td>
      </tr>
    `)
    .join("");
}

function refreshWholePartyActivityOptions(dialog, locations) {
  const form = getDialogForm(dialog);
  if (!form) return;

  const { location } = getOfferContext(locations, null, null);
  const activitySelect = form.elements.activityId;
  const skillSelect = form.elements.skillId;
  if (!location || !activitySelect) return;

  const currentActivityId = String(activitySelect.value ?? "");
  const nextActivityId = location.activities.some((entry) => entry.id === currentActivityId)
    ? currentActivityId
    : location.activities[0]?.id;

  activitySelect.innerHTML = renderActivityOptions(location, nextActivityId);
  activitySelect.value = nextActivityId;

  const { activity } = getOfferContext(locations, location.id, nextActivityId);
  const preview = dialog.element.querySelector("[data-offer-preview]");
  if (preview && activity) {
    preview.innerHTML = renderOfferPreview(location, activity, String(skillSelect?.value ?? ""));
  }
}

function refreshAssignmentMode(dialog) {
  const form = getDialogForm(dialog);
  if (!form) return;

  const mode = String(form.elements.assignmentMode?.value ?? ASSIGNMENT_MODE.WHOLE_PARTY);
  const wholePartySection = dialog.element.querySelector("[data-assignment-mode='whole-party']");
  const perPlayerSection = dialog.element.querySelector("[data-assignment-mode='per-player']");

  if (wholePartySection) wholePartySection.hidden = mode !== ASSIGNMENT_MODE.WHOLE_PARTY;
  if (perPlayerSection) perPlayerSection.hidden = mode !== ASSIGNMENT_MODE.PER_PLAYER;
}

function attachOfferListeners(dialog, locations) {
  linkFormLabels(dialog.element, "search-offer");
  const form = getDialogForm(dialog);
  if (!form) return;

  form.elements.assignmentMode?.addEventListener("change", () => refreshAssignmentMode(dialog));
  form.elements.activityId?.addEventListener("change", () => refreshWholePartyActivityOptions(dialog, locations));
  form.elements.skillId?.addEventListener("change", () => refreshWholePartyActivityOptions(dialog, locations));

  refreshWholePartyActivityOptions(dialog, locations);
  refreshAssignmentMode(dialog);
}

function buildWholePartyOffers(players, form, locations) {
  const activityId = String(form.elements.activityId?.value ?? "");
  const { location, activity } = getOfferContext(locations, null, activityId);
  if (!location) throw new Error(t("WILDHARVEST.Errors.LocationMissing"));
  if (!activity) throw new Error(t("WILDHARVEST.Errors.ActivityMissing"));
  const selectedSkillId = String(form.elements.skillId?.value ?? "").trim().toLowerCase();
  const effectiveActivity = buildOfferActivity(location, activity, selectedSkillId);
  const skillLabel = getActivitySkillLabel(effectiveActivity) || effectiveActivity.skillLabel;
  const lootPoolLabel = getOfferLootPoolLabel(location, effectiveActivity);

  return Object.fromEntries(players.map((user) => [
    user.id,
    {
      userId: user.id,
      userName: user.name,
      characterName: getPlayerCharacterName(user),
      locationId: location.id,
      locationName: location.name,
      activityId: activity.id,
      activityName: activity.name,
      lootPoolId: effectiveActivity.lootPoolId ?? "",
      lootPoolLabel,
      skillId: effectiveActivity.skillId ?? "",
      skillLabel
    }
  ]));
}

function buildPerPlayerOffers(players, form, locations) {
  const offers = {};

  for (const user of players) {
    const enabled = form.elements[`targetUser-${user.id}`]?.checked;
    if (!enabled) continue;

    const activityId = String(form.elements[`playerActivity-${user.id}`]?.value ?? "");
    const { location, activity } = getOfferContext(locations, null, activityId);
    if (!location) throw new Error(t("WILDHARVEST.Errors.LocationMissing"));
    if (!activity) throw new Error(t("WILDHARVEST.Errors.ActivityMissing"));
    const selectedSkillId = String(form.elements[`playerSkill-${user.id}`]?.value ?? "").trim().toLowerCase();
    const effectiveActivity = buildOfferActivity(location, activity, selectedSkillId);
    const skillLabel = getActivitySkillLabel(effectiveActivity) || effectiveActivity.skillLabel;
    const lootPoolLabel = getOfferLootPoolLabel(location, effectiveActivity);

    offers[user.id] = {
      userId: user.id,
      userName: user.name,
      characterName: getPlayerCharacterName(user),
      locationId: location.id,
      locationName: location.name,
      activityId: activity.id,
      activityName: activity.name,
      lootPoolId: effectiveActivity.lootPoolId ?? "",
      lootPoolLabel,
      skillId: effectiveActivity.skillId ?? "",
      skillLabel
    };
  }

  return offers;
}

function isSessionClosed(session) {
  return Boolean(session?.closedAt);
}

function isSessionClosedId(sessionId) {
  return closedSessionIds.has(String(sessionId ?? "").trim())
    || isSessionClosed(searchSessions.get(String(sessionId ?? "").trim()));
}

function createSessionRecord(sessionId, mode, offersByUserId) {
  const createdAt = getNowTimestamp();

  return {
    id: sessionId,
    mode,
    createdAt,
    closedAt: null,
    closedByName: "",
    closedByUserId: "",
    offers: Object.fromEntries(Object.entries(offersByUserId).map(([userId, offer]) => [
      userId,
      {
        userId,
        userName: offer.userName,
        linkedCharacterName: offer.characterName,
        actorName: "",
        locationId: offer.locationId,
        locationName: offer.locationName,
        activityId: offer.activityId,
        activityName: offer.activityName,
        lootPoolId: offer.lootPoolId ?? "",
        lootPoolLabel: offer.lootPoolLabel ?? "",
        skillId: offer.skillId ?? "",
        skillLabel: offer.skillLabel,
        status: "pending",
        result: null,
        updatedAt: createdAt
      }
    ]))
  };
}

function renderStatus(status) {
  const statusKey = {
    pending: "WILDHARVEST.Dialog.Responses.Pending",
    accepted: "WILDHARVEST.Dialog.Responses.Accepted",
    declined: "WILDHARVEST.Dialog.Responses.Declined",
    resolving: "WILDHARVEST.Dialog.Responses.Resolving",
    failed: "WILDHARVEST.Dialog.Responses.Failed",
    completed: "WILDHARVEST.Dialog.Responses.Completed"
  }[status] ?? "WILDHARVEST.Dialog.Responses.Pending";

  return t(statusKey);
}

function renderResultLine(entry) {
  if (!entry.result) return t("WILDHARVEST.Dialog.Responses.NoResult");

  const baseLine = t("WILDHARVEST.Dialog.Responses.RollLine", {
    rollTotal: entry.result.rollTotal,
    skillName: entry.result.skillName
  });

  if (!Number.isFinite(Number(entry.result.lootPoints)) || Number(entry.result.lootPoints) <= 0) {
    return baseLine;
  }

  return `${baseLine} | ${t("WILDHARVEST.Dialog.Responses.LootPoints", { lootPoints: entry.result.lootPoints })}`;
}

function renderAssignmentLine(entry) {
  if (isHiddenActivityCatalog({ id: entry.locationId })) {
    return entry.activityName;
  }

  return `${entry.locationName} / ${entry.activityName}`;
}

function renderRewardsLine(entry) {
  if (!entry.result?.rewards?.length) return t("WILDHARVEST.Dialog.Responses.NoRewards");

  return entry.result.rewards
    .map((reward) => getRewardStackText(reward))
    .join(", ");
}

function renderSessionClosedLine(session) {
  if (!isSessionClosed(session)) return "";

  return `
    <br>
    ${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SceneClosedMeta", {
      closedAt: session.closedAt
    }))}
  `;
}

function renderSessionsMarkup() {
  const sessions = [...searchSessions.values()].reverse();
  if (!sessions.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Responses.Empty"))}</p>`;
  }

  return sessions
    .map((session) => {
      const rows = Object.values(session.offers)
        .map((entry) => `
          <tr>
            <td>
              <strong>${escapeHtml(entry.userName)}</strong>
              <br>
              <span class="wildharvest-muted">${escapeHtml(entry.actorName || entry.linkedCharacterName)}</span>
            </td>
            <td>
              ${escapeHtml(renderAssignmentLine(entry))}
              <br>
              <span class="wildharvest-muted">${escapeHtml(entry.skillLabel ?? "")}</span>
              ${entry.lootPoolLabel ? `<br><span class="wildharvest-muted">${escapeHtml(t("WILDHARVEST.Preview.LootPoolValue", { lootPool: entry.lootPoolLabel }))}</span>` : ""}
            </td>
            <td>${escapeHtml(renderStatus(entry.status))}</td>
            <td>${escapeHtml(renderResultLine(entry))}</td>
            <td>${escapeHtml(renderRewardsLine(entry))}</td>
            <td>${escapeHtml(entry.updatedAt ?? "")}</td>
          </tr>
        `)
        .join("");

      const modeLabel = session.mode === ASSIGNMENT_MODE.PER_PLAYER
        ? t("WILDHARVEST.Dialog.Responses.ModePerPlayer")
        : t("WILDHARVEST.Dialog.Responses.ModeParty");

      return `
        <section class="wildharvest-preview__block">
          <strong>${escapeHtml(session.id)}</strong>
          <p>
            ${escapeHtml(t("WILDHARVEST.Dialog.Responses.Mode"))}: ${escapeHtml(modeLabel)}
            <br>
            ${escapeHtml(t("WILDHARVEST.Dialog.Responses.Created"))}: ${escapeHtml(session.createdAt)}
            ${renderSessionClosedLine(session)}
          </p>
          <table class="wildharvest-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Player"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Assignment"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Status"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Result"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Rewards"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Responses.Updated"))}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    })
    .join("");
}

function refreshResponsesDialog() {
  const container = responsesDialog?.element?.querySelector("[data-search-sessions]");
  if (container) {
    container.innerHTML = renderSessionsMarkup();
  }

  for (const listener of sessionListeners) {
    try {
      listener(getSearchSessionsSnapshot());
    } catch (error) {
      console.warn("wildharvest | Session listener failed.", error);
    }
  }
}

function buildPersistedResultFromLog(entry) {
  return {
    rollTotal: Number(entry?.rollTotal ?? 0),
    skillName: String(entry?.skillName ?? ""),
    lootPoints: Number(entry?.lootSummary?.lootPoints ?? 0),
    lootStrategy: entry?.lootSummary?.strategy ?? "rarity",
    selectionGroups: entry?.lootSummary?.selectionGroups ?? [],
    rarityGroups: entry?.lootSummary?.rarityGroups ?? [],
    rewards: (Array.isArray(entry?.rewards) ? entry.rewards : []).map((reward) => ({
      id: reward.id,
      name: reward.name,
      quantity: reward.quantity
    }))
  };
}

async function recoverInterruptedResolutions() {
  interruptedResolutionTimer = null;
  if (!isCurrentUserActiveGm()) return;

  const recovery = settleInterruptedResolutions(searchSessions, {
    timestamp: getNowTimestamp(),
    getRecoveredResult: (session, entry) => {
      const actor = game.actors?.get(String(entry?.actorId ?? ""));
      if (!actor) return null;
      const logEntry = getActorSearchLog(actor)
        .find((candidate) => String(candidate?.sessionId ?? "") === String(session?.id ?? ""));
      return logEntry ? buildPersistedResultFromLog(logEntry) : null;
    }
  });

  if (!recovery.changed) return;
  refreshResponsesDialog();
  await scheduleSearchSessionPersistence();
  ui.notifications.warn(t("WILDHARVEST.Notifications.InterruptedResolutionsRecovered", {
    recovered: recovery.recovered,
    failed: recovery.failed
  }));
}

function scheduleInterruptedResolutionRecovery() {
  if (interruptedResolutionTimer) {
    clearTimeout(interruptedResolutionTimer);
    interruptedResolutionTimer = null;
  }
  if (!isCurrentUserActiveGm()) return;
  const hasResolvingEntries = [...searchSessions.values()]
    .some((session) => Object.values(session?.offers ?? {}).some((entry) => entry?.status === "resolving"));
  if (!hasResolvingEntries) return;

  interruptedResolutionTimer = setTimeout(() => {
    void recoverInterruptedResolutions().catch((error) => {
      console.warn(`${MODULE_ID} | Failed to recover interrupted resolutions.`, error);
    });
  }, INTERRUPTED_RESOLUTION_GRACE_MS);
}

function scheduleSearchSessionPersistence() {
  if (!isCurrentUserActiveGm()) return Promise.resolve(false);

  const sessions = collectPersistedSearchSessions(searchSessions, MAX_PERSISTED_SESSIONS);
  const writePromise = sessionPersistence
    .catch(() => undefined)
    .then(async () => {
      await game.settings.set(
        MODULE_ID,
        SEARCH_SESSIONS_SETTING_KEY,
        JSON.stringify(sessions)
      );
      emitSearchSessionSync();
      return true;
    });
  sessionPersistence = writePromise.catch((error) => {
    console.warn("wildharvest | Failed to persist search sessions.", error);
  });
  return writePromise;
}

export function initializeSearchSessions() {
  if (!game.user?.isGM) return;
  lastKnownActiveGmId = getCurrentActiveGmId();

  const {
    restoredSessions,
    closedSessionIds: restoredClosedSessionIds,
    parseError
  } = restorePersistedSearchSessions(
    game.settings.get(MODULE_ID, SEARCH_SESSIONS_SETTING_KEY),
    {
      deepClone: (value) => foundry.utils.deepClone(value),
      isSessionClosed,
      maxPersistedSessions: MAX_PERSISTED_SESSIONS
    }
  );
  if (parseError) {
    console.warn("wildharvest | Failed to restore search sessions.", parseError);
  }

  searchSessions.clear();
  closedSessionIds.clear();
  for (const session of restoredSessions) {
    searchSessions.set(session.id, session);
  }
  for (const sessionId of restoredClosedSessionIds) {
    closedSessionIds.add(sessionId);
  }

  refreshResponsesDialog();
  scheduleInterruptedResolutionRecovery();
}

export function handleActiveGmChange() {
  if (!game.user?.isGM) return;
  const activeGmId = getCurrentActiveGmId();
  if (activeGmId === lastKnownActiveGmId) return;
  initializeSearchSessions();
  if (isCurrentUserActiveGm()) void processPendingPlayerRequests();
}
function upsertSession(session) {
  searchSessions.set(session.id, session);
  refreshResponsesDialog();
  return scheduleSearchSessionPersistence();
}

function updateSessionEntry(sessionId, userId, updater, options = {}) {
  const session = searchSessions.get(sessionId);
  if (!session) return Promise.resolve(false);
  if (isSessionClosed(session) && !options.allowClosed) return Promise.resolve(false);

  const entry = session.offers[userId];
  if (!entry) return Promise.resolve(false);

  updater(entry);
  refreshResponsesDialog();
  return scheduleSearchSessionPersistence();
}

export function getSearchSessionsSnapshot() {
  return foundry.utils.deepClone([...searchSessions.values()]);
}

export function subscribeToSearchSessions(listener) {
  if (typeof listener !== "function") return () => {};

  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function sendSearchOffers(offersByUserId, mode, options = {}) {
  if (!requireActiveGm()) return;

  const targetUserIds = Object.keys(offersByUserId);
  if (!targetUserIds.length) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.NoTargets"));
    return;
  }

  const {
    openResponses = true
  } = options;

  const sessionId = createSessionId();
  upsertSession(createSessionRecord(sessionId, mode, offersByUserId));
  if (openResponses) {
    openSearchResponsesDialog();
  }

  for (const targetUserId of targetUserIds) {
    emitSearchOffer({
      sessionId,
      targetUserId,
      offer: offersByUserId[targetUserId]
    });
  }

  ui.notifications.info(t("WILDHARVEST.Notifications.OfferSent"));
  return sessionId;
}

export function sendSearchReminder(sessionId, offersByUserId) {
  if (!requireActiveGm()) return false;

  const session = searchSessions.get(sessionId);
  if (session && isSessionClosed(session)) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.ReminderBlockedClosed"));
    return false;
  }

  const targetUserIds = Object.keys(offersByUserId);
  if (!targetUserIds.length) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.NoTargets"));
    return false;
  }

  for (const targetUserId of targetUserIds) {
    emitSearchOffer({
      sessionId,
      targetUserId,
      offer: offersByUserId[targetUserId]
    });
  }

  return true;
}

export function closeSearchSession(sessionId, options = {}) {
  if (!requireActiveGm()) return false;

  const session = searchSessions.get(sessionId);
  if (!session) return false;
  if (isSessionClosed(session)) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.SceneAlreadyClosed"));
    return false;
  }

  session.closedAt = getNowTimestamp();
  session.closedByName = game.user?.name ?? "";
  session.closedByUserId = game.user?.id ?? "";
  upsertSession(session);

  if (options.broadcast !== false) {
    emitSearchSessionClosed({
      sessionId,
      gmUserId: game.user.id,
      targetUserIds: Object.keys(session.offers ?? {})
    });
  }

  ui.notifications.info(t("WILDHARVEST.Notifications.SceneClosed"));
  return true;
}

function handlePlayerDecision(message) {
  if (!isCurrentUserActiveGm() || message.gmUserId !== game.user.id) return Promise.resolve(false);

  return updateSessionEntry(message.sessionId, message.senderId, (entry) => {
    if (entry.status !== "pending" && entry.status !== "accepted") return;
    if (entry.status === "accepted" && message.decision === "declined") return;
    entry.status = message.decision === "declined" ? "declined" : "accepted";
    entry.updatedAt = getNowTimestamp();
  });
}

function buildPersistedResolutionResult(summary) {
  return {
    rollTotal: Number(summary.result.roll?.total ?? 0),
    skillName: summary.result.skillName,
    lootPoints: Number(summary.result.lootSummary?.lootPoints ?? 0),
    lootStrategy: summary.result.lootSummary?.strategy ?? "rarity",
    containerId: summary.storageSummary?.containerId ?? "",
    containerName: summary.storageSummary?.containerName ?? "",
    selectionGroups: summary.result.lootSummary?.selectionGroups ?? [],
    rarityGroups: summary.result.lootSummary?.rarityGroups ?? [],
    rewards: summary.result.rewards.map((reward) => ({
      id: reward.id,
      name: reward.name,
      quantity: reward.quantity
    }))
  };
}

function rejectPlayerResolution(message, reason) {
  emitGmSearchResolution({
    sessionId: message.sessionId,
    targetUserId: message.senderId,
    success: false,
    reason
  });
}

function handlePlayerResolutionRequest(message) {
  if (!isCurrentUserActiveGm() || message.gmUserId !== game.user.id) return Promise.resolve(false);

  const session = searchSessions.get(String(message.sessionId ?? "").trim());
  const sender = game.users?.get(String(message.senderId ?? "").trim());
  const actorId = String(message.actorId ?? "").trim();
  const actor = actorId ? game.actors?.get(actorId) : null;
  const timestamp = getNowTimestamp();
  const claim = claimSearchResolution({
    message,
    session,
    sender,
    currentGmId: game.user.id,
    actor,
    isActorOwner: (candidate, user) => candidate.testUserPermission(
      user,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    ),
    timestamp
  });

  if (!claim.ok) {
    console.warn(`${MODULE_ID} | Rejected search resolution request.`, {
      reason: claim.reason,
      sessionId: message.sessionId,
      senderId: message.senderId
    });
    rejectPlayerResolution(message, claim.reason);
    return Promise.resolve(false);
  }

  const claimPersistence = upsertSession(session);

  const locations = getLocations();
  const { location, activity } = getOfferContext(
    locations,
    claim.entry.locationId,
    claim.entry.activityId
  );
  if (!location || !activity
    || location.id !== claim.entry.locationId
    || activity.id !== claim.entry.activityId) {
    failSearchResolution(claim.entry, {
      timestamp: getNowTimestamp(),
      reason: "offer-context-missing"
    });
    upsertSession(session);
    rejectPlayerResolution(message, "offer-context-missing");
    return Promise.resolve(false);
  }

  const effectiveActivity = buildOfferActivity(location, activity, claim.entry.skillId ?? "");
  const skillName = claim.entry.skillLabel
    || getActivitySkillLabel(effectiveActivity)
    || effectiveActivity.skillLabel;
  const baseSkillModifier = getActorSkillModifier(claim.actor, effectiveActivity) ?? 0;

  return claimPersistence.then((persisted) => {
    if (!persisted) throw new Error("Active GM ownership changed before resolution.");
    return resolveSearchAsGm({
      actor: claim.actor,
      location,
      activity: effectiveActivity,
      skillName,
      skillModifier: baseSkillModifier + claim.request.extraModifier,
      rollMode: claim.request.rollMode,
      containerId: claim.request.containerId,
      resolutionId: message.sessionId
    });
  }).then(async (summary) => {
    const persistedResult = buildPersistedResolutionResult(summary);
    if (!completeSearchResolution(claim.entry, persistedResult, {
      actorName: claim.actor?.name ?? "",
      timestamp: getNowTimestamp()
    })) return;

    const persisted = await upsertSession(session);
    if (!persisted) throw new Error("Active GM ownership changed before completion persistence.");
    emitGmSearchResolution({
      sessionId: message.sessionId,
      targetUserId: message.senderId,
      success: true
    });
    return true;
  }).catch((error) => {
    failSearchResolution(claim.entry, {
      timestamp: getNowTimestamp(),
      reason: "resolution-failed"
    });
    upsertSession(session);
    console.warn(`${MODULE_ID} | GM search resolution failed.`, error);
    rejectPlayerResolution(message, "resolution-failed");
    return false;
  });
}

function rememberProcessedPlayerRequest(requestId) {
  processedPlayerRequestIds.add(requestId);
  while (processedPlayerRequestIds.size > 250) {
    processedPlayerRequestIds.delete(processedPlayerRequestIds.values().next().value);
  }
}

async function clearProcessedPlayerRequest(user, requestId) {
  const currentRequest = user?.getFlag?.(MODULE_ID, PLAYER_REQUEST_FLAG);
  if (String(currentRequest?.id ?? "") !== requestId) return;
  await user.unsetFlag(MODULE_ID, PLAYER_REQUEST_FLAG);
}

async function processAuthenticatedPlayerRequest(user, request) {
  if (!isCurrentUserActiveGm()) return false;
  if (!user || user.isGM || user.active === false) return false;
  if (!isValidPlayerDocumentRequest(request)) {
    await clearProcessedPlayerRequest(user, String(request?.id ?? ""));
    return false;
  }
  const requestedGm = game.users?.get(String(request.gmUserId ?? ""));
  if (!requestedGm?.isGM) {
    await clearProcessedPlayerRequest(user, request.id);
    return false;
  }
  if (processedPlayerRequestIds.has(request.id)) {
    await clearProcessedPlayerRequest(user, request.id);
    return false;
  }
  rememberProcessedPlayerRequest(request.id);

  try {
    if (request.type === PLAYER_REQUEST_TYPES.DECISION) {
      await handlePlayerDecision({
        ...request,
        gmUserId: game.user.id,
        senderId: user.id
      });
      return true;
    }

    if (request.type === PLAYER_REQUEST_TYPES.RESOLUTION) {
      return await handlePlayerResolutionRequest({
        ...request,
        gmUserId: game.user.id,
        senderId: user.id
      });
    }

    return false;
  } finally {
    await clearProcessedPlayerRequest(user, request.id);
  }
}

function queueAuthenticatedPlayerRequest(user, request) {
  const snapshot = foundry.utils.deepClone(request);
  playerRequestQueue = playerRequestQueue
    .catch(() => undefined)
    .then(() => processAuthenticatedPlayerRequest(user, snapshot))
    .catch((error) => {
      console.warn(`${MODULE_ID} | Authenticated player request failed.`, error);
      return false;
    });
  return playerRequestQueue;
}

export function handlePlayerRequestDocumentUpdate(user, _changes, _options, userId) {
  if (!isCurrentUserActiveGm()) return;
  if (!user || user.isGM || String(userId ?? "") !== String(user.id ?? "")) return;
  const request = user.getFlag(MODULE_ID, PLAYER_REQUEST_FLAG);
  if (!request) return;
  queueAuthenticatedPlayerRequest(user, request);
}

export function processPendingPlayerRequests() {
  if (!isCurrentUserActiveGm()) return Promise.resolve(false);
  for (const user of game.users?.contents ?? []) {
    if (user.isGM) continue;
    const request = user.getFlag(MODULE_ID, PLAYER_REQUEST_FLAG);
    if (request) queueAuthenticatedPlayerRequest(user, request);
  }
  return playerRequestQueue;
}

async function waitForPlayerResult(pendingResult, attempts = 25) {
  const actor = game.actors?.get(String(pendingResult?.actorId ?? ""));
  if (!actor) return null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const entry = getActorSearchLog(actor)
      .find((candidate) => String(candidate?.sessionId ?? "") === pendingResult.sessionId);
    if (entry) return { actor, entry };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return null;
}

async function handleGmResolution(message) {
  if (message.targetUserId !== game.user.id) return;
  const sessionId = String(message.sessionId ?? "").trim();
  const pendingResult = pendingPlayerResults.get(sessionId);

  if (!message.success) {
    pendingPlayerResults.delete(sessionId);
    ui.notifications.error(t("WILDHARVEST.Notifications.ResolutionRejected"));
    return;
  }

  const resolvedResult = await waitForPlayerResult(pendingResult);
  pendingPlayerResults.delete(sessionId);
  if (!resolvedResult) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.PlayerResultUnavailable"));
    return;
  }

  openSearchResultFromLog({
    ...resolvedResult,
    activityName: pendingResult.activityName,
    position: pendingResult.dialogPosition
  });
  ui.notifications.info(t("WILDHARVEST.Notifications.PlayerResultReady"));
}

function handleSessionClosed(message) {
  const sessionId = String(message.sessionId ?? "").trim();
  if (!sessionId) return;
  if (message.targetUserId !== game.user.id) return;

  closedSessionIds.add(sessionId);
  pendingPlayerResults.delete(sessionId);

  const offerDialog = playerOfferDialogs.get(sessionId);
  if (offerDialog?.element?.isConnected) {
    offerDialog.close();
  }

  ui.notifications.info(t("WILDHARVEST.Notifications.SceneClosedByGM"));
}

function openPlayerOfferDialog(offer) {
  if (isSessionClosedId(offer.sessionId)) {
    ui.notifications.info(t("WILDHARVEST.Notifications.SceneClosedByGM"));
    return;
  }

  const locations = getLocations();
  const { location, activity } = getOfferContext(locations, offer.locationId, offer.activityId);
  if (!location || !activity) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.InvalidOffer"));
    return;
  }

  const previousDialog = playerOfferDialogs.get(offer.sessionId);
  if (previousDialog?.element?.isConnected) {
    previousDialog.close();
  }

  let dialog = null;
  dialog = openPlayerSearchOfferDialog({
    activity: buildOfferActivity(location, activity, offer.skillId ?? ""),
    onAccept: async () => {
      const gmUserId = getCurrentActiveGmId();
      if (!gmUserId) {
        ui.notifications.warn(t("WILDHARVEST.Notifications.NoActiveGm"));
        return;
      }
      const request = await submitPlayerDecisionRequest({
        type: PLAYER_REQUEST_TYPES.DECISION,
        sessionId: offer.sessionId,
        gmUserId,
        decision: "accepted"
      });
      if (!request) return false;

      openSearchDialog({
        title: t("WILDHARVEST.Dialog.Offer.SearchTitle", { activityName: activity.name }),
        locationId: location.id,
        activityId: activity.id,
        lootPoolId: offer.lootPoolId ?? "",
        skillId: offer.skillId ?? "",
        skillLabel: offer.skillLabel ?? "",
        lockContext: true,
        actorId: game.user.character?.id ?? "",
        beforeSubmit: () => {
          if (isSessionClosedId(offer.sessionId)) {
            throw new Error(t("WILDHARVEST.Errors.SceneClosed"));
          }
        },
        onSubmitRequest: async ({ actorId, containerId, extraModifier, rollMode, dialogPosition }) => {
          const activeGmId = getCurrentActiveGmId();
          if (!activeGmId) {
            throw new Error(t("WILDHARVEST.Notifications.NoActiveGm"));
          }
          pendingPlayerResults.set(offer.sessionId, {
            sessionId: offer.sessionId,
            actorId,
            activityName: activity.name,
            dialogPosition
          });
          try {
            await submitPlayerDocumentRequest({
              type: PLAYER_REQUEST_TYPES.RESOLUTION,
              sessionId: offer.sessionId,
              gmUserId: activeGmId,
              actorId,
              containerId,
              extraModifier,
              rollMode
            });
          } catch (error) {
            pendingPlayerResults.delete(offer.sessionId);
            throw error;
          }
        }
      });
    },
    onDecline: async () => {
      const gmUserId = getCurrentActiveGmId();
      if (!gmUserId) {
        ui.notifications.warn(t("WILDHARVEST.Notifications.NoActiveGm"));
        return;
      }
      const request = await submitPlayerDecisionRequest({
        type: PLAYER_REQUEST_TYPES.DECISION,
        sessionId: offer.sessionId,
        gmUserId,
        decision: "declined"
      });
      return Boolean(request);
    },
    onClose: () => {
      if (playerOfferDialogs.get(offer.sessionId) === dialog) {
        playerOfferDialogs.delete(offer.sessionId);
      }
    }
  });
  playerOfferDialogs.set(offer.sessionId, dialog);
}

function isAuthorizedSocketMessage(message) {
  return isAuthorizedSearchSocketMessage(message, {
    getUser: (userId) => game.users?.get(userId),
    getActiveGm: () => game.users?.activeGM ?? null,
    messageTypes: SOCKET_MESSAGE_TYPES
  });
}

function handleSocketMessage(message) {
  if (!message || message.senderId === game.user.id) return;
  if (!isAuthorizedSocketMessage(message)) {
    console.warn("wildharvest | Rejected unauthorized socket message.", {
      type: message?.type,
      senderId: message?.senderId
    });
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.OFFER_SEARCH) {
    if (message.targetUserId !== game.user.id || !message.offer) return;

    openPlayerOfferDialog({
      ...message.offer,
      sessionId: message.sessionId,
      gmUserId: message.gmUserId
    });
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.GM_RESOLUTION) {
    void handleGmResolution(message);
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.SESSION_CLOSED) {
    handleSessionClosed(message);
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.SESSION_SYNC) {
    if (game.user?.isGM) initializeSearchSessions();
  }
}

export function registerSocketListeners() {
  if (socketListenersRegistered) return;
  game.socket?.on(SOCKET_EVENT, handleSocketMessage);
  socketListenersRegistered = true;
}

export function openSearchResponsesDialog() {
  if (!requireActiveGm()) return;

  if (responsesDialog?.element?.isConnected) {
    refreshResponsesDialog();
    responsesDialog.bringToFront?.();
    return;
  }

  responsesDialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Responses.Title")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <div data-search-sessions>${renderSessionsMarkup()}</div>
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

  responsesDialog.render({ force: true });
}

export function openGmOfferDialog() {
  if (!requireActiveGm()) return;

  const locations = getLocations();
  if (!locations.length) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.NoLocations"));
    return;
  }

  const players = getActivePlayers();
  if (!players.length) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.NoPlayers"));
    return;
  }

  const initialLocation = locations[0];
  const initialActivity = initialLocation.activities[0];

  const dialog = new DialogV2({
    window: {
      title: t("WILDHARVEST.Dialog.Offer.Title")
    },
    content: `
      <div class="wildharvest-dialog wildharvest-dialog--wide">
        <p>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Description"))}</p>
        <div class="form-group">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Mode"))}</label>
          <select name="assignmentMode">
            <option value="${ASSIGNMENT_MODE.WHOLE_PARTY}">${escapeHtml(t("WILDHARVEST.Dialog.Offer.ModeParty"))}</option>
            <option value="${ASSIGNMENT_MODE.PER_PLAYER}">${escapeHtml(t("WILDHARVEST.Dialog.Offer.ModePerPlayer"))}</option>
          </select>
        </div>

        <section data-assignment-mode="whole-party">
          <div class="form-group">
            <label>${escapeHtml(t("WILDHARVEST.Dialog.Search.Activity"))}</label>
            <select name="activityId">
              ${renderActivityOptions(initialLocation, initialActivity.id)}
            </select>
          </div>
          <div class="form-group">
            <label>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Skill"))}</label>
            <select name="skillId">
              ${renderSkillOptions("")}
            </select>
          </div>
          <section class="wildharvest-preview" data-offer-preview>
            ${renderOfferPreview(initialLocation, initialActivity, "")}
          </section>
        </section>

        <section data-assignment-mode="per-player" hidden>
          <p class="hint">${escapeHtml(t("WILDHARVEST.Dialog.Offer.PlayerDescription"))}</p>
          <table class="wildharvest-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Offer.SendTo"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Player"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Character"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Search.Activity"))}</th>
                <th>${escapeHtml(t("WILDHARVEST.Dialog.Offer.Skill"))}</th>
              </tr>
            </thead>
            <tbody>
              ${renderPerPlayerRows(players, locations)}
            </tbody>
          </table>
        </section>
      </div>
    `,
    buttons: [
      {
        action: "send",
        label: t("WILDHARVEST.Dialog.Offer.Send"),
        icon: "fa-solid fa-paper-plane",
        default: true,
        callback: async (_event, button, instance) => {
          const form = getDialogForm(instance, button);
          if (!form) {
            ui.notifications.error(t("WILDHARVEST.Errors.OfferFormMissing"));
            return;
          }

          const mode = String(form.elements.assignmentMode?.value ?? ASSIGNMENT_MODE.WHOLE_PARTY);
          const offersByUserId = mode === ASSIGNMENT_MODE.PER_PLAYER
            ? buildPerPlayerOffers(players, form, locations)
            : buildWholePartyOffers(players, form, locations);

          sendSearchOffers(offersByUserId, mode);
        }
      },
      {
        action: "responses",
        label: t("WILDHARVEST.Controls.Responses"),
        callback: async () => openSearchResponsesDialog()
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => attachOfferListeners(dialog, locations), { once: true });
  dialog.render({ force: true });
}



