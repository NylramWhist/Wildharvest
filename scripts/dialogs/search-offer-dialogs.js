import {
  MODULE_ID,
  PLAYER_REQUESTS_FLAG,
  SEARCH_SESSIONS_SETTING_KEY
} from "../constants.js";
import { getAvailableActors } from "../helpers/actor-utils.js";
import { t } from "../i18n.js";
import {
  getActivitySkillLabel,
  getActorSkillModifier,
  getDnd5eSkillLabel
} from "../helpers/dnd5e-support.js";
import { getActorSearchLog } from "../helpers/resource-store.js";
import { getActiveGmId, isActiveGmUser } from "../helpers/active-gm-core.js";
import {
  buildPlayerDocumentRequest,
  getExpiredPlayerRequestKeys,
  isValidPlayerDocumentRequest,
  listStoredPlayerRequests,
  PLAYER_REQUEST_TYPES
} from "../helpers/player-request-core.js";
import { compactSessionResult } from "../helpers/data-format-core.js";
import {
  claimSearchResolution,
  completeSearchResolution,
  failSearchResolution
} from "../helpers/search-authority-core.js";
import {
  emitGmLootReview,
  emitGmPresence,
  emitGmSearchResolution,
  emitSearchOffer,
  emitSearchSessionClosed,
  emitSearchSessionSync,
  getSocketClientId,
  SOCKET_EVENT,
  SOCKET_MESSAGE_TYPES
} from "../helpers/search-session-socket.js";
import {
  createGmPresenceTracker,
  GM_PRESENCE_HEARTBEAT_MS
} from "../helpers/gm-presence-core.js";
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
import { openPlayerSearchOfferDialog } from "./player-search-offer-dialog.js";
import { reviewLootAsGm } from "./loot-review-dialog.js";
import {
  getLocations,
  getRulesConfig,
  isLootApprovalEnabled
} from "../settings.js";

const DialogV2 = foundry.applications.api.DialogV2;
export const ASSIGNMENT_MODE = {
  WHOLE_PARTY: "whole-party",
  PER_PLAYER: "per-player"
};
let socketListenersRegistered = false;
const playerOfferDialogs = new Map();
const playerSearchDialogs = new Map();
const pendingPlayerResults = new Map();
const closedSessionIds = new Set();
const searchSessions = new Map();
const sessionListeners = new Set();
const processedPlayerRequestIds = new Set();
const queuedPlayerRequestIds = new Set();
let sessionPersistence = Promise.resolve();
let playerRequestQueue = Promise.resolve();
let interruptedResolutionTimer = null;
let lastKnownActiveGmId = "";
// 1.34.0: "sessionId:userId" of the resolutions whose loot review window is open in this client.
const activeLootReviews = new Set();
const INTERRUPTED_RESOLUTION_GRACE_MS = 30_000;
const PLAYER_RESOLUTION_RESPONSE_TIMEOUT_MS = 60_000;
// 1.34.0: how long a player waits for the GM's loot review before being told nothing came back yet.
const PLAYER_LOOT_REVIEW_TIMEOUT_MS = 10 * 60_000;
const INVALID_PLAYER_REQUEST_REASON = "invalid-request";

function getServerNow() {
  const serverTime = Number(game.time?.serverTime);
  return Number.isFinite(serverTime) && serverTime > 0 ? serverTime : Date.now();
}

// Stored as ISO 8601 since 1.21.0; views format it in the module language.
function getNowTimestamp() {
  return new Date().toISOString();
}

function getOfferContext(locations, locationId, activityId) {
  const location = locations.find((entry) => entry.id === locationId) ?? locations[0];
  const activity = location?.activities.find((entry) => entry.id === activityId) ?? location?.activities[0];
  return { location, activity };
}

function isCurrentUserActiveGm() {
  return isActiveGmUser(game.user, game.users?.activeGM);
}

// A9: of several windows logged in as the active GM, only the oldest one handles player requests.
let gmPresence = null;
let gmPresenceTimer = null;
let wasPrimaryGmWindow = false;
let gmPresenceSettling = false;
const GM_PRESENCE_SETTLE_MS = 1_500;

export function isCurrentUserPrimaryGm() {
  if (!isCurrentUserActiveGm()) return false;
  // A window that has just announced itself waits for older windows to answer before taking requests.
  if (gmPresenceSettling) return false;
  return gmPresence ? gmPresence.isLeader(Date.now()) : true;
}

function onPrimaryGmWindowCheck() {
  if (gmPresenceSettling) return;
  const isPrimary = isCurrentUserPrimaryGm();
  if (isPrimary && !wasPrimaryGmWindow) {
    // Took over from a window that closed: reload the scenes it saved and handle waiting requests.
    wasPrimaryGmWindow = true;
    initializeSearchSessions();
    void processPendingPlayerRequests();
    return;
  }
  wasPrimaryGmWindow = isPrimary;
}

function handleGmPresence(message) {
  if (!gmPresence || !game.user?.isGM || message.senderId !== game.user.id) return;
  if (message.leaving) {
    gmPresence.forget(message.clientId);
  } else if (gmPresence.see(message, Date.now())) {
    // A window we did not know yet: answer so it learns about this one without waiting for a heartbeat.
    emitGmPresence({ startedAt: gmPresence.self.startedAt });
  }
  onPrimaryGmWindowCheck();
}

// Announces this GM window and waits briefly for older windows of the same user to answer.
export async function startGmPresence() {
  if (!game.user?.isGM || gmPresence) return;
  gmPresenceSettling = true;
  gmPresence = createGmPresenceTracker({ clientId: getSocketClientId(), startedAt: Date.now() });
  emitGmPresence({ startedAt: gmPresence.self.startedAt });
  gmPresenceTimer = setInterval(() => {
    emitGmPresence({ startedAt: gmPresence.self.startedAt });
    onPrimaryGmWindowCheck();
  }, GM_PRESENCE_HEARTBEAT_MS);
  globalThis.addEventListener?.("beforeunload", () => {
    emitGmPresence({ startedAt: gmPresence.self.startedAt, leaving: true });
  });
  await new Promise((resolve) => setTimeout(resolve, GM_PRESENCE_SETTLE_MS));
  gmPresenceSettling = false;
  wasPrimaryGmWindow = isCurrentUserPrimaryGm();
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
    createdAt: getServerNow()
  });
  if (!isValidPlayerDocumentRequest(request, { now: getServerNow() })) {
    throw new Error(t("WILDHARVEST.Errors.InvalidPlayerRequest"));
  }
  // Each request has its own key, so it never merges with one the GM has not handled yet.
  // Only this player's requests that the GM would reject as too old are removed here.
  const expiredKeys = getExpiredPlayerRequestKeys(
    game.user.getFlag(MODULE_ID, PLAYER_REQUESTS_FLAG),
    { now: getServerNow() }
  );
  for (const key of expiredKeys) {
    await game.user.unsetFlag(MODULE_ID, `${PLAYER_REQUESTS_FLAG}.${key}`);
  }
  await game.user.setFlag(MODULE_ID, `${PLAYER_REQUESTS_FLAG}.${request.id}`, request);
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

function notifySessionListeners() {
  for (const listener of sessionListeners) {
    try {
      listener(getSearchSessionsSnapshot());
    } catch (error) {
      console.warn("wildharvest | Session listener failed.", error);
    }
  }
}

// Scene results are summaries since 1.21.0; the full result stays in the actor history.
function buildPersistedResultFromLog(entry) {
  return compactSessionResult({
    rollTotal: entry?.rollTotal,
    skillName: entry?.skillName,
    lootPoints: entry?.lootSummary?.lootPoints,
    lootStrategy: entry?.lootSummary?.strategy,
    baseSkillModifier: entry?.baseSkillModifier,
    extraModifier: entry?.extraModifier,
    finalSkillModifier: entry?.finalSkillModifier,
    rollMode: entry?.rollMode,
    advantage: entry?.advantage,
    containerId: entry?.storageState?.containerId,
    containerName: entry?.storageState?.containerName,
    rewards: entry?.rewards,
    rewardCount: entry?.rewardCount
  });
}

async function recoverInterruptedResolutions() {
  interruptedResolutionTimer = null;
  if (!isCurrentUserPrimaryGm()) return;

  const recovery = settleInterruptedResolutions(searchSessions, {
    timestamp: getNowTimestamp(),
    isStillResolving: (session, entry) => activeLootReviews.has(`${session?.id}:${entry?.userId}`),
    getRecoveredResult: (session, entry) => {
      const actor = game.actors?.get(String(entry?.actorId ?? ""));
      if (!actor) return null;
      const logEntry = getActorSearchLog(actor)
        .find((candidate) => String(candidate?.sessionId ?? "") === String(session?.id ?? ""));
      return logEntry ? buildPersistedResultFromLog(logEntry) : null;
    }
  });

  if (!recovery.changed) return;
  notifySessionListeners();
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
  if (!isCurrentUserPrimaryGm()) return;
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

  notifySessionListeners();
  scheduleInterruptedResolutionRecovery();
}

export function handleActiveGmChange() {
  if (!game.user?.isGM) return;
  const activeGmId = getCurrentActiveGmId();
  if (activeGmId === lastKnownActiveGmId) return;
  initializeSearchSessions();
  if (isCurrentUserPrimaryGm()) void processPendingPlayerRequests();
}
function upsertSession(session) {
  searchSessions.set(session.id, session);
  notifySessionListeners();
  return scheduleSearchSessionPersistence();
}

function updateSessionEntry(sessionId, userId, updater, options = {}) {
  const session = searchSessions.get(sessionId);
  if (!session) return Promise.resolve(false);
  if (isSessionClosed(session) && !options.allowClosed) return Promise.resolve(false);

  const entry = session.offers[userId];
  if (!entry) return Promise.resolve(false);

  updater(entry);
  notifySessionListeners();
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

export function sendSearchOffers(offersByUserId, mode) {
  if (!requireActiveGm()) return;

  const targetUserIds = Object.keys(offersByUserId);
  if (!targetUserIds.length) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.NoTargets"));
    return;
  }

  const sessionId = createSessionId();
  upsertSession(createSessionRecord(sessionId, mode, offersByUserId));

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
  // 1.34.0: a roll whose loot is in an open review window is finished first.
  if (Object.values(session.offers ?? {}).some((entry) => activeLootReviews.has(`${session.id}:${entry?.userId}`))) {
    ui.notifications.warn(t("WILDHARVEST.Notifications.SceneCloseBlockedReview"));
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
  return compactSessionResult({
    rollTotal: summary.result.roll?.total,
    skillName: summary.result.skillName,
    lootPoints: summary.result.lootSummary?.lootPoints,
    lootStrategy: summary.result.lootSummary?.strategy,
    baseSkillModifier: summary.rollAudit?.baseSkillModifier ?? summary.result.modifier,
    extraModifier: summary.rollAudit?.extraModifier,
    finalSkillModifier: summary.rollAudit?.finalSkillModifier ?? summary.result.modifier,
    rollMode: summary.rollAudit?.rollMode ?? summary.result.rollMode,
    containerId: summary.storageSummary?.containerId,
    containerName: summary.storageSummary?.containerName,
    rewards: summary.result.rewards
  });
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
    rollPolicy: getRulesConfig().playerRollRules,
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

  // 1.34.0: with "GM approves the loot" on, the GM sees the loot before anything is given. The player
  // is told it is waiting for the GM, and the Workbench shows the entry as waiting for approval.
  const lootApproval = isLootApprovalEnabled();
  const isReviewStillCurrent = () => isCurrentUserActiveGm()
    && searchSessions.get(session.id) === session
    && claim.entry.status === "resolving";
  const reviewKey = `${session.id}:${claim.entry.userId ?? message.senderId}`;
  const reviewLoot = lootApproval
    ? async (result) => {
      // Nothing to approve: a roll without items goes straight to the player.
      if (!Array.isArray(result?.rewards) || !result.rewards.length) return null;
      activeLootReviews.add(reviewKey);
      claim.entry.lootReviewPending = true;
      claim.entry.updatedAt = getNowTimestamp();
      void upsertSession(session).catch(() => false);
      emitGmLootReview({ sessionId: message.sessionId, targetUserId: message.senderId });
      try {
        const reviewed = await reviewLootAsGm({
          playerName: sender?.name ?? "",
          actorName: claim.actor?.name ?? "",
          activity: effectiveActivity,
          result
        });
        // Nothing is given when this GM is no longer the active GM or the scene record was reloaded
        // in the meantime: another GM's recovery may already have settled this roll.
        if (!isReviewStillCurrent()) throw new Error("The loot review is no longer current.");
        return reviewed;
      } finally {
        activeLootReviews.delete(reviewKey);
        delete claim.entry.lootReviewPending;
      }
    }
    : null;

  const resolution = claimPersistence.then((persisted) => {
    if (!persisted) throw new Error("Active GM ownership changed before resolution.");
    return resolveSearchAsGm({
      actor: claim.actor,
      location,
      activity: effectiveActivity,
      skillName,
      skillModifier: baseSkillModifier + claim.request.extraModifier,
      baseSkillModifier,
      extraModifier: claim.request.extraModifier,
      rollMode: claim.request.rollMode,
      containerId: claim.request.containerId,
      resolutionId: message.sessionId,
      reviewLoot
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
      success: true,
      resultAvailable: summary.historyPersisted
    });
    return true;
  }).catch((error) => {
    // A stale scene record (another GM took over during a loot review) must not overwrite newer data.
    if (!lootApproval || isReviewStillCurrent()) {
      failSearchResolution(claim.entry, {
        timestamp: getNowTimestamp(),
        reason: "resolution-failed"
      });
      void upsertSession(session).catch(() => false);
    }
    console.warn(`${MODULE_ID} | GM search resolution failed.`, error);
    rejectPlayerResolution(message, "resolution-failed");
    return false;
  });
  // The review may take minutes; other players' requests must not wait for it in the queue.
  return lootApproval ? Promise.resolve(true) : resolution;
}

function rememberProcessedPlayerRequest(requestId) {
  processedPlayerRequestIds.add(requestId);
  while (processedPlayerRequestIds.size > 250) {
    processedPlayerRequestIds.delete(processedPlayerRequestIds.values().next().value);
  }
}

async function clearProcessedPlayerRequest(user, requestKey) {
  const key = String(requestKey ?? "");
  if (!key) return;
  const stored = user?.getFlag?.(MODULE_ID, PLAYER_REQUESTS_FLAG);
  if (!stored || typeof stored !== "object" || !(key in stored)) return;
  await user.unsetFlag(MODULE_ID, `${PLAYER_REQUESTS_FLAG}.${key}`);
}

function rejectInvalidPlayerRequest(user, request) {
  const sessionId = typeof request?.sessionId === "string" ? request.sessionId.trim() : "";
  console.warn(`${MODULE_ID} | Rejected invalid player request.`, {
    userId: user?.id,
    requestId: request?.id,
    sessionId
  });
  if (!sessionId || sessionId.length > 128) return;
  emitGmSearchResolution({
    sessionId,
    targetUserId: user.id,
    success: false,
    reason: INVALID_PLAYER_REQUEST_REASON
  });
}

async function processAuthenticatedPlayerRequest(user, { key, request, keyMismatch }) {
  if (!isCurrentUserPrimaryGm()) return false;
  if (!user || user.isGM || user.active === false) return false;
  if (keyMismatch || !isValidPlayerDocumentRequest(request, { now: getServerNow() })) {
    rejectInvalidPlayerRequest(user, request);
    await clearProcessedPlayerRequest(user, key);
    return false;
  }
  const requestedGm = game.users?.get(String(request.gmUserId ?? ""));
  if (!requestedGm?.isGM) {
    rejectInvalidPlayerRequest(user, request);
    await clearProcessedPlayerRequest(user, key);
    return false;
  }
  if (processedPlayerRequestIds.has(request.id)) {
    await clearProcessedPlayerRequest(user, key);
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
    await clearProcessedPlayerRequest(user, key);
  }
}

function queueAuthenticatedPlayerRequest(user, storedRequest) {
  const queueKey = `${user.id}:${storedRequest.key}`;
  if (queuedPlayerRequestIds.has(queueKey)) return playerRequestQueue;
  queuedPlayerRequestIds.add(queueKey);
  const snapshot = foundry.utils.deepClone(storedRequest);
  playerRequestQueue = playerRequestQueue
    .catch(() => undefined)
    .then(() => processAuthenticatedPlayerRequest(user, snapshot))
    .catch((error) => {
      console.warn(`${MODULE_ID} | Authenticated player request failed.`, error);
      return false;
    })
    .finally(() => {
      queuedPlayerRequestIds.delete(queueKey);
    });
  return playerRequestQueue;
}

// Queues every request the user has stored, oldest first, so a decision sent while the GM
// was busy is always handled before the roll request that follows it.
function queueStoredPlayerRequests(user) {
  const storedRequests = listStoredPlayerRequests(user.getFlag(MODULE_ID, PLAYER_REQUESTS_FLAG));
  for (const storedRequest of storedRequests) {
    queueAuthenticatedPlayerRequest(user, storedRequest);
  }
}

export function handlePlayerRequestDocumentUpdate(user, _changes, _options, userId) {
  if (!isCurrentUserPrimaryGm()) return;
  if (!user || user.isGM || String(userId ?? "") !== String(user.id ?? "")) return;
  queueStoredPlayerRequests(user);
}

export function processPendingPlayerRequests() {
  if (!isCurrentUserPrimaryGm()) return Promise.resolve(false);
  for (const user of game.users?.contents ?? []) {
    if (user.isGM) continue;
    queueStoredPlayerRequests(user);
  }
  return playerRequestQueue;
}

async function waitForPlayerResult(pendingResult, {
  timeoutMs = 8_000,
  pollIntervalMs = 250
} = {}) {
  const actorId = String(pendingResult?.actorId ?? "");
  const sessionId = String(pendingResult?.sessionId ?? "");
  const actor = game.actors?.get(actorId);
  if (!actor || !sessionId) return null;

  const findResult = () => {
    const liveActor = game.actors?.get(actorId) ?? actor;
    const entry = getActorSearchLog(liveActor)
      .find((candidate) => String(candidate?.sessionId ?? "") === sessionId);
    return entry ? { actor: liveActor, entry } : null;
  };
  const immediateResult = findResult();
  if (immediateResult) return immediateResult;

  return new Promise((resolve) => {
    let settled = false;
    let hookId = null;
    let pollTimer = null;
    let timeoutTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (hookId != null) Hooks.off("updateActor", hookId);
      if (pollTimer != null) clearInterval(pollTimer);
      if (timeoutTimer != null) clearTimeout(timeoutTimer);
      resolve(result);
    };
    const check = () => {
      const result = findResult();
      if (result) finish(result);
    };

    hookId = Hooks.on("updateActor", (updatedActor) => {
      if (String(updatedActor?.id ?? "") === actorId) check();
    });
    pollTimer = setInterval(check, Math.max(100, Number(pollIntervalMs) || 250));
    timeoutTimer = setTimeout(() => finish(null), Math.max(1_000, Number(timeoutMs) || 8_000));
    check();
  });
}

function clearPendingPlayerResult(sessionId) {
  const pendingResult = pendingPlayerResults.get(sessionId);
  if (pendingResult?.responseTimer != null) clearTimeout(pendingResult.responseTimer);
  pendingPlayerResults.delete(sessionId);
  return pendingResult;
}

function watchPendingPlayerResult(sessionId) {
  const pendingResult = pendingPlayerResults.get(sessionId);
  if (!pendingResult) return;
  // The loot review notice already set the longer wait (1.34.0).
  if (pendingResult.lootReviewNotified) return;
  if (pendingResult.responseTimer != null) clearTimeout(pendingResult.responseTimer);
  // The GM may still be busy with another scene, so the request stays pending:
  // a late answer still opens the result. The player only learns that nothing came back yet.
  pendingResult.responseTimer = setTimeout(() => {
    const current = pendingPlayerResults.get(sessionId);
    if (current !== pendingResult) return;
    current.responseTimer = null;
    ui.notifications.warn(t("WILDHARVEST.Notifications.ResolutionNoResponse"));
  }, PLAYER_RESOLUTION_RESPONSE_TIMEOUT_MS);
}

async function handleGmResolution(message) {
  if (message.targetUserId !== game.user.id) return;
  const sessionId = String(message.sessionId ?? "").trim();

  if (!message.success) {
    clearPendingPlayerResult(sessionId);
    ui.notifications.error(t(message.reason === INVALID_PLAYER_REQUEST_REASON
      ? "WILDHARVEST.Notifications.RequestRejectedInvalid"
      : "WILDHARVEST.Notifications.ResolutionRejected"));
    return;
  }

  if (message.resultAvailable === false) {
    clearPendingPlayerResult(sessionId);
    ui.notifications.warn(t("WILDHARVEST.Notifications.PlayerResultUnavailable"));
    return;
  }

  const pendingResult = pendingPlayerResults.get(sessionId);
  if (pendingResult?.responseTimer != null) {
    clearTimeout(pendingResult.responseTimer);
    pendingResult.responseTimer = null;
  }
  const resolvedResult = await waitForPlayerResult(pendingResult);
  if (pendingPlayerResults.get(sessionId) === pendingResult) pendingPlayerResults.delete(sessionId);
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

// 1.34.0: the roll is done and the GM is checking the loot; the "no answer yet" warning would be
// misleading, so the player is told what is happening instead.
function handleGmLootReview(message) {
  if (message.targetUserId !== game.user.id) return;
  const sessionId = String(message.sessionId ?? "").trim();
  const pendingResult = pendingPlayerResults.get(sessionId);
  if (!pendingResult) return;
  if (pendingResult.responseTimer != null) clearTimeout(pendingResult.responseTimer);
  // A longer wait: the GM decides at the table. If even that passes, the player is told as before.
  pendingResult.responseTimer = setTimeout(() => {
    if (pendingPlayerResults.get(sessionId) !== pendingResult) return;
    pendingResult.responseTimer = null;
    ui.notifications.warn(t("WILDHARVEST.Notifications.ResolutionNoResponse"));
  }, PLAYER_LOOT_REVIEW_TIMEOUT_MS);
  if (pendingResult.lootReviewNotified) return;
  pendingResult.lootReviewNotified = true;
  ui.notifications.info(t("WILDHARVEST.Notifications.LootAwaitingApproval"));
}

function handleSessionClosed(message) {
  const sessionId = String(message.sessionId ?? "").trim();
  if (!sessionId) return;
  if (message.targetUserId !== game.user.id) return;

  closedSessionIds.add(sessionId);
  clearPendingPlayerResult(sessionId);

  const offerDialog = playerOfferDialogs.get(sessionId);
  if (offerDialog?.element?.isConnected) {
    offerDialog.close();
  }
  const searchDialog = playerSearchDialogs.get(sessionId);
  if (searchDialog?.element?.isConnected) {
    searchDialog.close();
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
      if (!getAvailableActors().length) {
        ui.notifications.warn(t("WILDHARVEST.Errors.PlayerCharacterRequired"));
        return false;
      }
      const gmUserId = getCurrentActiveGmId();
      if (!gmUserId) {
        ui.notifications.warn(t("WILDHARVEST.Notifications.NoActiveGm"));
        return false;
      }
      const request = await submitPlayerDecisionRequest({
        type: PLAYER_REQUEST_TYPES.DECISION,
        sessionId: offer.sessionId,
        gmUserId,
        decision: "accepted"
      });
      if (!request) return false;

      const openSearch = playerSearchDialogs.get(offer.sessionId);
      if (openSearch?.element?.isConnected) {
        openSearch.bringToFront?.();
        return true;
      }

      const searchDialog = openSearchDialog({
        title: t("WILDHARVEST.Dialog.Offer.SearchTitle", { activityName: activity.name }),
        locationId: location.id,
        activityId: activity.id,
        lootPoolId: offer.lootPoolId ?? "",
        skillId: offer.skillId ?? "",
        skillLabel: offer.skillLabel ?? "",
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
          clearPendingPlayerResult(offer.sessionId);
          pendingPlayerResults.set(offer.sessionId, {
            sessionId: offer.sessionId,
            actorId,
            activityName: activity.name,
            dialogPosition,
            responseTimer: null
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
            clearPendingPlayerResult(offer.sessionId);
            throw error;
          }
          watchPendingPlayerResult(offer.sessionId);
          // The GM may already have answered (or started the loot review) while the request was saved;
          // the "roll sent" message would then come after the newer one.
          const pending = pendingPlayerResults.get(offer.sessionId);
          return { silent: !pending || Boolean(pending.lootReviewNotified) };
        }
      });
      if (!searchDialog) return false;
      playerSearchDialogs.set(offer.sessionId, searchDialog);
      searchDialog.addEventListener("close", () => {
        if (playerSearchDialogs.get(offer.sessionId) === searchDialog) {
          playerSearchDialogs.delete(offer.sessionId);
        }
      }, { once: true });
      return true;
    },
    onDecline: async () => {
      const gmUserId = getCurrentActiveGmId();
      if (!gmUserId) {
        ui.notifications.warn(t("WILDHARVEST.Notifications.NoActiveGm"));
        return false;
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
  if (!message) return;
  // Skip only this window's own messages; another window of the same user is a separate client (A9).
  if (message.clientId ? message.clientId === getSocketClientId() : message.senderId === game.user.id) return;
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

  if (message.type === SOCKET_MESSAGE_TYPES.GM_LOOT_REVIEW) {
    handleGmLootReview(message);
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.SESSION_CLOSED) {
    handleSessionClosed(message);
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.SESSION_SYNC) {
    if (game.user?.isGM) initializeSearchSessions();
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.GM_PRESENCE) {
    handleGmPresence(message);
  }
}

export function registerSocketListeners() {
  if (socketListenersRegistered) return;
  game.socket?.on(SOCKET_EVENT, handleSocketMessage);
  socketListenersRegistered = true;
}



