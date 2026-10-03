import { getDefaultActorId, getAvailableActors, getLinkedPlayerCharacters } from "../helpers/actor-utils.js";
import {
  ACTIVITY_CATALOG_LOCATION_ID,
  createUniqueActivityOptionId,
  escapeHtml,
  getItemCompendiums,
  getFolderLabel,
  getPackFolderTree,
  getPackLabelById,
  getRollTableChoices,
  getRollTableLabel,
  loadRollTableIndexes,
  getQuickOptionsFromSettings,
  getQuickOptionValidationIssues,
  loadPresetPackIndexes,
  getSkillChoices,
  getSkillLabel,
  saveQuickOptionsToSettings,
  validateQuickOptionDraft
} from "../helpers/activity-presets.js";
import { getRewardStackText } from "../helpers/reward-utils.js";
import { isActiveGmUser } from "../helpers/active-gm-core.js";
import { clearActorSearchLog } from "../helpers/resource-store.js";
import { deleteMigrationBackups, getMigrationBackupSummary } from "../helpers/migration-backup.js";
import { previewLootRewards } from "../helpers/search-engine.js";
import { normalizePresetDifficulty, PRESET_DIFFICULTY_LIMIT } from "../helpers/preset-core.js";
import {
  expandFolderSelection,
  getFolderUuidPackId,
  getPackFolderSelection,
  normalizeFolderIds
} from "../helpers/folder-filter-core.js";
import { notifyError } from "../helpers/notification-utils.js";
import { renderModuleTemplate } from "../helpers/templates.js";
import {
  formatModuleClock,
  formatModuleDay,
  formatModuleNumber,
  formatModuleTimestamp,
  getModuleLocaleTag,
  t
} from "../i18n.js";
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
import { getHistoryTabContext } from "./gm-control-panel-history-view.js";
import { getLaunchTabContext } from "./gm-control-panel-launch-view.js";
import { getPresetsTabContext } from "./gm-control-panel-presets-view.js";
import { getResponsesTabContext } from "./gm-control-panel-responses-view.js";
import { GM_UI_ICONS } from "./gm-control-panel-view-shared.js";
import { GmControlPanelApplication } from "./gm-control-panel-application.js";
import {
  createGmControlPanelController,
  GM_CONTROL_PANEL_PARTS
} from "./gm-control-panel-controller.js";
import { getViewportSafeGmPanelSize } from "./gm-control-panel-layout-core.js";
import { openSearchDialog } from "./search-dialog.js";
import {
  ensureStateSelections as ensureStateSelectionsState,
  getFilteredPresets as getFilteredPresetsState,
  getLatestSession,
  getKeyboardTabTarget,
  getResponseEntryKey,
  getSelectedSession,
  getSelectedUserIds as getSelectedUserIdsState,
  getSessionCounts,
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
  serializeModuleConfigExport
} from "../settings.js";

const DialogV2 = foundry.applications.api.DialogV2;
const GM_DIALOG_CLASSES = ["wildharvest-window", "wildharvest-window--gm", "wildharvest-window--gm-dialog"];
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

// 1.36.0: roll tables are listed too; in "draw" mode they replace the compendiums.
function getPresetCompendiumSummary(preset) {
  const tableIds = Array.isArray(preset.tableIds) ? preset.tableIds : [];
  const drawMode = tableIds.length > 0 && preset.tableMode !== "pool";
  const folderIds = Array.isArray(preset.folderIds) ? preset.folderIds : [];
  // 1.37.0: a compendium limited to some folders lists them after its name.
  const packs = drawMode ? [] : (Array.isArray(preset.packIds) ? preset.packIds : []).map((packId) => {
    const label = getPackLabelById(packId);
    const folders = folderIds.filter((uuid) => getFolderUuidPackId(uuid) === packId).map(getFolderLabel);
    return folders.length ? t("WILDHARVEST.Dialog.ControlPanel.PackWithFolders", { pack: label, folders: folders.join("; ") }) : label;
  });
  const tables = tableIds.map((uuid) => t("WILDHARVEST.Dialog.ControlPanel.TableLabel", { name: getRollTableLabel(uuid) }));
  return [...packs, ...tables].filter(Boolean).join(", ");
}

function assertPresetReady(preset) {
  return validateQuickOptionDraft({
    ...preset,
    packIds: Array.isArray(preset?.packIds) ? preset.packIds : []
  });
}

// 1.37.1: sending, the GM test roll and the reward preview stop on the same problems the Presets tab
// shows as "needs attention" (missing or empty folders, no lootable items). The compendium indexes
// are loaded first, because the checks read them.
async function assertPresetSendable(preset) {
  await loadPresetPackIndexes(preset);
  const readyPreset = assertPresetReady(preset);
  const [issue] = getQuickOptionValidationIssues(readyPreset);
  if (issue) throw new Error(t(issue));
  return readyPreset;
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
    responseFilters: Object.values(GM_RESPONSE_FILTERS),
    presetFilters: Object.values(GM_PRESET_FILTERS)
  });
}

function getSessionModeLabel(session) {
  return session?.mode === ASSIGNMENT_MODE.PER_PLAYER
    ? t("WILDHARVEST.Dialog.Responses.ModePerPlayer")
    : t("WILDHARVEST.Dialog.Responses.ModeParty");
}

function getActiveSessionLabel(state) {
  const session = getLatestSession(state);
  if (!session) return "";

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
  return saveQuickOptionsToSettings(quickOptions);
}

function getResponsesStatusMeta(status) {
  const normalized = String(status ?? "pending").trim().toLowerCase();
  if (normalized === "completed") {
    return {
      label: t("WILDHARVEST.Dialog.Responses.Completed"),
      className: "wildharvest-gm-status--completed",
      icon: GM_UI_ICONS.completed
    };
  }

  if (normalized === "accepted") {
    return {
      label: t("WILDHARVEST.Dialog.ControlPanel.Joined"),
      className: "wildharvest-gm-status--accepted",
      icon: GM_UI_ICONS.joined
    };
  }

  if (normalized === "resolving") {
    return {
      label: t("WILDHARVEST.Dialog.Responses.Resolving"),
      className: "wildharvest-gm-status--accepted",
      icon: GM_UI_ICONS.pending
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
    icon: GM_UI_ICONS.pending
  };
}

function getResponseEntryActorName(entry) {
  return entry.actorName || entry.linkedCharacterName || t("WILDHARVEST.Dialog.Offer.NoCharacter");
}

function getResponseEntryViewModel(entry) {
  // 1.34.0: a roll whose loot is waiting in the GM's review window.
  const statusMeta = entry.status === "resolving" && entry.lootReviewPending
    ? {
      label: t("WILDHARVEST.Dialog.Responses.AwaitingApproval"),
      className: "wildharvest-gm-status--accepted",
      iconClass: "fa-solid fa-scale-balanced"
    }
    : getResponsesStatusMeta(entry.status);
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
      ? t(entry.lootReviewPending ? "WILDHARVEST.Dialog.Responses.AwaitingApproval" : "WILDHARVEST.Dialog.Responses.Resolving")
      : entry.status === "failed"
        ? t("WILDHARVEST.Dialog.Responses.Failed")
        : entry.status === "accepted"
      ? t("WILDHARVEST.Dialog.ControlPanel.JoinedWaitingStatus")
      : entry.status === "declined"
        ? t("WILDHARVEST.Dialog.ControlPanel.PlayerDeclined")
        : t("WILDHARVEST.Dialog.ControlPanel.WaitingStatus"));
  // Scene results keep a short reward list since 1.21.0; the full list is in the actor history.
  const shownRewards = Array.isArray(entry.result?.rewards) ? entry.result.rewards : [];
  const omittedRewardCount = Math.max(0, Math.trunc(Number(entry.result?.rewardCount) || 0) - shownRewards.length);
  const rewardsText = shownRewards.length
    ? [
      shownRewards.map((reward) => getRewardStackText(reward)).join(" | "),
      omittedRewardCount ? t("WILDHARVEST.History.MoreRewards", { count: omittedRewardCount }) : ""
    ].filter(Boolean).join(" ")
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
    updatedAt: formatModuleTimestamp(entry.updatedAt)
  };
}

// --- Workbench view data (1.27.0): the parts are Handlebars templates in templates/gm. ---

function getSessionActionsContext(session, { showOpenResponses = true } = {}) {
  if (!session) return null;
  const counts = getSessionCounts(session);
  return {
    showOpenResponses,
    canSendReminder: (counts.pending + counts.accepted) > 0 && !isSessionClosed(session),
    canCloseScene: !isSessionClosed(session)
  };
}

// One status bar for the latest scene (1.30.0): replaces the "Active scene" box and the
// "Live responses" card, which showed the same scene with the same buttons.
function getSceneBarContext(state) {
  const session = getLatestSession(state);
  if (!session) return { session: false };

  const closed = isSessionClosed(session);
  const counts = getSessionCounts(session);
  return {
    session: true,
    closed,
    sceneIcon: closed ? GM_UI_ICONS.closed : GM_UI_ICONS.launchScene,
    sessionName: getActiveSessionLabel(state),
    meta: t("WILDHARVEST.Dialog.ControlPanel.SessionMeta", {
      mode: getSessionModeLabel(session),
      createdAt: formatModuleTimestamp(session.createdAt)
    }),
    closedMeta: closed
      ? t("WILDHARVEST.Dialog.ControlPanel.SceneClosedMeta", { closedAt: formatModuleTimestamp(session.closedAt) })
      : "",
    statusClass: closed ? "wildharvest-gm-status--declined" : "wildharvest-gm-status--completed",
    statusIcon: closed ? GM_UI_ICONS.closed : GM_UI_ICONS.completed,
    statusLabel: closed
      ? t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneClosed")
      : t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneOpen"),
    progressCount: `${counts.completed} / ${counts.total}`,
    players: Object.values(session.offers ?? {}).map((entry) => {
      const view = getResponseEntryViewModel(entry);
      return {
        userName: entry.userName,
        entryClass: view.entryClass,
        status: {
          iconClass: view.statusMeta.icon ?? view.statusMeta.iconClass ?? "",
          label: view.statusMeta.label
        },
        result: view.hasResult
          ? t("WILDHARVEST.Dialog.ControlPanel.ScenePlayerResult", {
            roll: formatModuleNumber(view.rollTotal),
            lootPoints: formatModuleNumber(view.lootPoints)
          })
          : ""
      };
    }),
    actions: getSessionActionsContext(session)
  };
}

function getResponseEntryContext(session, entry, state) {
  const view = getResponseEntryViewModel(entry);
  const toggleLabel = t("WILDHARVEST.Dialog.Responses.ToggleDetails", { name: entry.userName ?? "" });
  return {
    ...view,
    status: {
      className: view.statusMeta.className,
      iconClass: view.statusMeta.icon
        ? `${view.statusMeta.icon} wildharvest-gm-status__asset`
        : (view.statusMeta.iconClass ?? ""),
      label: view.statusMeta.label
    },
    rollTotal: String(view.rollTotal),
    lootPoints: String(view.lootPoints),
    userName: entry.userName,
    userId: String(entry.userId ?? ""),
    sessionId: session.id,
    expanded: state.expandedResponseKey === getResponseEntryKey(session.id, entry),
    toggleLabel
  };
}

function getResponseStats(session) {
  const counts = getSessionCounts(session);
  return [
    { label: t("WILDHARVEST.Dialog.Responses.Completed"), value: counts.completed, className: "is-completed" },
    { label: t("WILDHARVEST.Dialog.ControlPanel.Joined"), value: counts.accepted, className: "is-accepted" },
    { label: t("WILDHARVEST.Dialog.Responses.Resolving"), value: counts.resolving, className: "is-pending" },
    { label: t("WILDHARVEST.Dialog.Responses.Pending"), value: counts.pending, className: "is-pending" },
    { label: t("WILDHARVEST.Dialog.Responses.Failed"), value: counts.failed, className: "is-declined" },
    { label: t("WILDHARVEST.Dialog.ControlPanel.Skipped"), value: counts.declined, className: "is-declined" }
  ].map((item) => ({ ...item, value: String(item.value) }));
}

// W-5 (1.31.0): recent scenes grouped by day, each with time, send mode, progress and state.
function getSessionSelectorGroups(state) {
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const groups = [];
  for (const session of sessions.slice().reverse()) {
    const counts = getSessionCounts(session);
    const entries = Object.values(session.offers ?? {});
    const closed = isSessionClosed(session);
    const day = formatModuleDay(session.createdAt);
    let group = groups[groups.length - 1];
    if (!group || group.day !== day) {
      group = { day, label: day || t("WILDHARVEST.Dialog.ControlPanel.SceneListUnknownDay"), sessions: [] };
      groups.push(group);
    }
    group.sessions.push({
      id: session.id,
      name: entries[0]?.activityName ?? session.id,
      active: session.id === state.selectedSessionId,
      closed,
      time: formatModuleClock(session.createdAt) || formatModuleTimestamp(session.createdAt),
      modeLabel: getSessionModeLabel(session),
      progress: `${counts.completed}/${counts.total}`,
      stateLabel: closed
        ? t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneClosed")
        : t("WILDHARVEST.Dialog.ControlPanel.ActiveSceneOpen")
    });
  }
  return groups;
}

function getTabPartContext(tabId, state) {
  if (tabId === GM_TABS.RESPONSES) {
    return getResponsesTabContext(state, {
      isSessionClosed,
      getSessionActionsContext,
      getResponseEntryContext,
      getResponseStats,
      getSessionSelectorGroups
    });
  }
  if (tabId === GM_TABS.PRESETS) {
    return getPresetsTabContext(state, {
      getFilteredPresets,
      getPresetCompendiumSummary,
      getPresetValidationMessages
    });
  }
  if (tabId === GM_TABS.HISTORY) return getHistoryTabContext(state);
  return getLaunchTabContext(state, {
    getActivePlayers,
    getPlayerCharacterName,
    getPresetCompendiumSummary,
    getPresetValidationMessages,
    getSelectedPreset,
    getSceneBarContext
  });
}

// Context for one part of the Workbench. Tab parts that are not active render only their hidden panel.
function getControlPanelPartContext(partId, state) {
  const base = { icons: GM_UI_ICONS };
  if (partId === GM_CONTROL_PANEL_PARTS.HEADER) return base;
  if (partId === GM_CONTROL_PANEL_PARTS.TABS) {
    return {
      ...base,
      tabs: [
        { id: GM_TABS.LAUNCH, label: t("WILDHARVEST.Dialog.ControlPanel.TabLaunch"), icon: GM_UI_ICONS.launchScene },
        { id: GM_TABS.RESPONSES, label: t("WILDHARVEST.Dialog.ControlPanel.TabResponses"), icon: GM_UI_ICONS.responses },
        { id: GM_TABS.PRESETS, label: t("WILDHARVEST.Dialog.ControlPanel.TabPresets"), icon: GM_UI_ICONS.presets },
        { id: GM_TABS.HISTORY, label: t("WILDHARVEST.Dialog.ControlPanel.TabHistory"), icon: GM_UI_ICONS.history }
      ].map((tab) => ({ ...tab, active: tab.id === state.activeTab }))
    };
  }
  if (partId === GM_CONTROL_PANEL_PARTS.FOOTER) {
    return {
      ...base,
      lastUpdated: t("WILDHARVEST.Dialog.ControlPanel.LastUpdated", { updatedAt: getControlPanelLastUpdated(state) })
    };
  }
  const active = partId === state.activeTab;
  return {
    ...base,
    tabId: partId,
    active,
    ...(active ? getTabPartContext(partId, state) : {})
  };
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

    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).

    classes: GM_DIALOG_CLASSES,
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.DeletePresetTitle")
    },
    content: renderModuleTemplate("wildharvest.confirm", {
      prompt: t("WILDHARVEST.Dialog.ControlPanel.DeletePresetPrompt", { presetName: preset.name })
    }),
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

function getCompendiumListContext(selectedPackIds, filterState = {}) {
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

  return {
    compendiums: compendiums.map((pack) => ({
      id: pack.id,
      name: pack.name,
      selected: selected.has(pack.id),
      notLootable: pack.hasPhysicalItems === false
    })),
    emptyText: t("WILDHARVEST.Dialog.Compendiums.Empty"),
    notLootableText: t("WILDHARVEST.Dialog.ActivityEditor.CompendiumNotLootable")
  };
}

// 1.36.0: roll tables for the preset editor; selected tables that no longer exist stay listed.
function getTableListContext(selectedTableIds) {
  const selected = new Set(selectedTableIds);
  const choices = getRollTableChoices();
  const known = new Set(choices.map((choice) => choice.uuid));
  const missing = [...selected].filter((uuid) => !known.has(uuid)).map((uuid) => ({
    uuid, name: getRollTableLabel(uuid), source: uuid, missing: true
  }));
  return {
    tables: [...choices, ...missing].map((choice) => ({ ...choice, selected: selected.has(choice.uuid) })),
    emptyText: t("WILDHARVEST.Dialog.ActivityEditor.TablesEmpty"),
    missingText: t("WILDHARVEST.Dialog.ActivityEditor.TableMissing")
  };
}

// 1.37.0: folders of the selected compendiums; selected folders that no longer exist stay listed.
function getFolderListContext(selectedPackIds, selectedFolderIds) {
  const selected = new Set(selectedFolderIds);
  const packs = [];
  for (const packId of selectedPackIds) {
    const tree = getPackFolderTree(packId);
    const known = new Set(tree.map((folder) => folder.uuid));
    const missing = [...selected]
      .filter((uuid) => getFolderUuidPackId(uuid) === packId && !known.has(uuid))
      .map((uuid) => ({ uuid, name: uuid, depth: 0, missing: true }));
    // 1.37.1: subfolders of a ticked folder are used too; the list marks them as included.
    const covered = expandFolderSelection(tree, getPackFolderSelection([...selected], packId));
    const folders = [...tree, ...missing].map((folder) => ({
      ...folder,
      selected: selected.has(folder.uuid),
      included: !selected.has(folder.uuid) && covered.has(String(folder.id))
    }));
    if (folders.length) packs.push({ packId, name: getPackLabelById(packId), folders });
  }
  return {
    packs,
    emptyText: t("WILDHARVEST.Dialog.ActivityEditor.FoldersEmpty"),
    missingText: t("WILDHARVEST.Dialog.ActivityEditor.FolderMissing"),
    includedText: t("WILDHARVEST.Dialog.ActivityEditor.FolderIncluded")
  };
}

function renderCompendiumSelectionRows(selectedPackIds, filterState = {}) {
  return renderModuleTemplate("wildharvest.compendiumList", getCompendiumListContext(selectedPackIds, filterState));
}

function openPresetEditorDialog({ parentDialog, state, quickOption = null, onSave }) {
  const initialSkillId = String(quickOption?.skillId ?? getSkillChoices()[0]?.id ?? "").trim().toLowerCase();
  const initialPackIds = Array.isArray(quickOption?.packIds) ? quickOption.packIds : [];
  const filterState = {
    searchText: "",
    scope: "all"
  };
  let selectedPackIdsState = [...initialPackIds];
  let selectedTableIdsState = Array.isArray(quickOption?.tableIds) ? [...quickOption.tableIds] : [];
  let selectedFolderIdsState = normalizeFolderIds(quickOption?.folderIds ?? []);
  const initialTableMode = quickOption?.tableMode === "pool" ? "pool" : "draw";

  const dialog = new DialogV2({

    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).

    classes: GM_DIALOG_CLASSES,
    window: {
      title: quickOption ? t("WILDHARVEST.Dialog.ControlPanel.EditPresetTitle") : t("WILDHARVEST.Dialog.ControlPanel.CreatePresetTitle")
    },
    // Keep the editor open on validation errors so the GM does not lose the entered data.
    form: { closeOnSubmit: false },
    content: renderModuleTemplate("wildharvest.presetEditor", {
      labels: {
        name: t("WILDHARVEST.Dialog.ActivityEditor.Name"),
        skill: t("WILDHARVEST.Dialog.ActivityEditor.Skill"),
        description: t("WILDHARVEST.Dialog.ActivityEditor.Description"),
        compendiums: t("WILDHARVEST.Dialog.ActivityEditor.Compendiums"),
        compendiumsHint: t("WILDHARVEST.Dialog.ActivityEditor.CompendiumsHint"),
        searchPlaceholder: t("WILDHARVEST.Dialog.ControlPanel.CompendiumSearchPlaceholder"),
        scopeLabel: t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeLabel"),
        difficulty: t("WILDHARVEST.Dialog.ActivityEditor.Difficulty"),
        difficultyHint: t("WILDHARVEST.Dialog.ActivityEditor.DifficultyHint"),
        tables: t("WILDHARVEST.Dialog.ActivityEditor.Tables"),
        tablesHint: t("WILDHARVEST.Dialog.ActivityEditor.TablesHint"),
        tableMode: t("WILDHARVEST.Dialog.ActivityEditor.TableMode"),
        folders: t("WILDHARVEST.Dialog.ActivityEditor.Folders"),
        foldersHint: t("WILDHARVEST.Dialog.ActivityEditor.FoldersHint")
      },
      folderList: getFolderListContext(initialPackIds, selectedFolderIdsState),
      tableModes: [
        { value: "draw", label: t("WILDHARVEST.Dialog.ActivityEditor.TableModeDraw") },
        { value: "pool", label: t("WILDHARVEST.Dialog.ActivityEditor.TableModePool") }
      ].map((mode) => ({ ...mode, selected: mode.value === initialTableMode })),
      tableList: getTableListContext(selectedTableIdsState),
      name: quickOption?.name ?? "",
      description: quickOption?.description ?? "",
      difficulty: String(normalizePresetDifficulty(quickOption?.difficulty)),
      difficultyLimit: String(PRESET_DIFFICULTY_LIMIT),
      skills: getSkillChoices().map((choice) => ({ ...choice, selected: choice.id === initialSkillId })),
      scopes: [
        { value: "all", label: t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeAll") },
        { value: "selected", label: t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeSelected") },
        { value: "world", label: t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeWorld") },
        { value: "system", label: t("WILDHARVEST.Dialog.ControlPanel.CompendiumScopeSystem") }
      ],
      compendiumList: getCompendiumListContext(initialPackIds, filterState)
    }),
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
              packIds,
              folderIds: normalizeFolderIds(selectedFolderIdsState, packIds),
              difficulty: normalizePresetDifficulty(form?.elements?.presetDifficulty?.value),
              tableIds: [...selectedTableIdsState],
              tableMode: form?.elements?.presetTableMode?.value === "pool" ? "pool" : "draw"
            }));

            await instance.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(error, "WILDHARVEST.Notifications.ConfigSaveFailed");
          }
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel"),
        callback: (_event, _button, instance) => instance.close()
      }
    ],
    rejectClose: false
  });

  function refreshFolderSelection(focusUuid = "") {
    const container = dialog.element?.querySelector?.("[data-folder-selection]");
    if (!container) return;
    container.innerHTML = renderModuleTemplate("wildharvest.folderList", getFolderListContext(selectedPackIdsState, selectedFolderIdsState));
    if (!focusUuid) return;
    const box = [...container.querySelectorAll('[name="presetFolderId"]')].find((input) => input.value === focusUuid);
    box?.focus?.();
  }

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
        refreshFolderSelection();
        return;
      }

      if (target.matches('[name="presetFolderId"]')) {
        const uuid = String(target.value ?? "").trim();
        if (!uuid) return;
        const selected = new Set(selectedFolderIdsState);
        if (target.checked) selected.add(uuid);
        else selected.delete(uuid);
        selectedFolderIdsState = [...selected];
        // 1.37.1: redraw so the subfolders of the ticked folder show as included; focus stays on the box.
        refreshFolderSelection(uuid);
        return;
      }

      if (target.matches('[name="presetTableId"]')) {
        const uuid = String(target.value ?? "").trim();
        if (!uuid) return;
        const selected = new Set(selectedTableIdsState);
        if (target.checked) selected.add(uuid);
        else selected.delete(uuid);
        selectedTableIdsState = [...selected];
      }
    });

    // Tables in compendiums appear once their indexes are loaded.
    void loadRollTableIndexes().then(() => {
      const container = dialog.element?.querySelector?.("[data-table-selection]");
      if (container?.isConnected) {
        container.innerHTML = renderModuleTemplate("wildharvest.tableList", getTableListContext(selectedTableIdsState));
      }
    });
  }, { once: true });

  dialog.render({ force: true });
}

function openDeleteBackupsConfirmDialog(parentDialog, state) {
  const { count, bytes } = getMigrationBackupSummary();
  if (!count) return;
  const size = `${formatModuleNumber(Math.max(1, Math.round(bytes / 1024)), { maximumFractionDigits: 0 })} KB`;
  const dialog = new DialogV2({
    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).
    classes: GM_DIALOG_CLASSES,
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.DeleteBackupsTitle")
    },
    content: renderModuleTemplate("wildharvest.confirm", {
      prompt: t("WILDHARVEST.Dialog.ControlPanel.DeleteBackupsPrompt", { count, size })
    }),
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.ControlPanel.DeleteBackupsConfirm"),
        icon: "fa-solid fa-trash",
        default: true,
        callback: async () => {
          try {
            const deleted = await deleteMigrationBackups();
            refreshControlPanel(parentDialog, state);
            ui.notifications.info(t("WILDHARVEST.Notifications.BackupsDeleted", { count: deleted }));
            dialog.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(error);
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

function openClearHistoryConfirmDialog(parentDialog, state) {
  const actor = state.historyActorId ? game.actors.get(state.historyActorId) : null;
  if (!actor) {
    ui.notifications.warn(t("WILDHARVEST.Resources.NoActor"));
    return;
  }

  const dialog = new DialogV2({

    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).

    classes: GM_DIALOG_CLASSES,
    window: {
      title: t("WILDHARVEST.Dialog.Logs.ClearTitle")
    },
    content: renderModuleTemplate("wildharvest.confirm", {
      prompt: t("WILDHARVEST.Dialog.Logs.ClearPrompt", { actorName: actor.name })
    }),
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
    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).
    classes: GM_DIALOG_CLASSES,
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.CloseSceneTitle")
    },
    content: renderModuleTemplate("wildharvest.confirm", {
      prompt: t("WILDHARVEST.Dialog.ControlPanel.CloseScenePrompt", { sessionName })
    }),
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

function getPreviewRewardSampleContext(sample) {
  // Value mode: the engine label holds raw numbers, so the plan is rebuilt in the module language.
  const selectionPlan = sample.strategy === "table"
    ? t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsTableDraws", { count: sample.lootPoints })
    : sample.strategy === "value" && sample.totalValueGp !== null
    ? `${formatModuleNumber(sample.totalValueGp)} / ${formatModuleNumber(sample.targetValueGp)} GP`
    : sample.selectionGroups?.length
      ? sample.selectionGroups.map((group) => `${group.label} x${group.quantity}`).join(", ")
      : t("WILDHARVEST.History.None");
  const planKey = sample.strategy === "table"
    ? "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsTablePlan"
    : sample.strategy === "value"
      ? "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsValuePlan"
      : "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsPlan";

  return {
    title: t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsRollSample", {
      rollTotal: sample.rollTotal,
      lootPoints: sample.lootPoints
    }),
    plan: t(planKey, { plan: selectionPlan }),
    valueDetails: sample.strategy === "value"
      ? t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsValueDetails", {
        total: formatModuleNumber(sample.totalValueGp),
        target: formatModuleNumber(sample.targetValueGp),
        tolerance: sample.tolerancePercent,
        invalid: sample.invalidPriceCount,
        unaffordable: sample.unaffordableCount
      })
      : "",
    rewards: sample.rewards.length
      ? sample.rewards.map((reward) => getRewardStackText(reward))
      : [t("WILDHARVEST.Dialog.Result.NoItems")]
  };
}

async function openPreviewRewardsDialog(parentDialog, state) {
  const preset = getSelectedPreset(state);
  if (!preset) {
    ui.notifications.warn(t("WILDHARVEST.Dialog.ControlPanel.NoPresetsDescription"));
    return;
  }

  try {
    const readyPreset = await assertPresetSendable(preset);
    const preview = await previewLootRewards(getPresetActivity(readyPreset, state));
    const content = renderModuleTemplate("wildharvest.previewRewards", {
      presetName: preset.name,
      labels: {
        // 1.37.1: roll-table draws do not use the compendium pool, so their hint says so.
        hint: t(preview.strategy === "table"
          ? "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsHintTables"
          : "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsHint"),
        limitNote: preview.strategy === "value" && preview.maxDistinctItems
          ? t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsValueLimitNote", { limit: preview.maxDistinctItems })
          : "",
        source: t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsSource"),
        itemCount: t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsItemCount"),
        breakdown: t(preview.strategy === "table"
          ? "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsTableBreakdown"
          : preview.strategy === "value"
            ? "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsValueBreakdown"
            : "WILDHARVEST.Dialog.ControlPanel.PreviewRewardsRarityBreakdown"),
        empty: t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsEmpty")
      },
      sourceLabel: preview.lootSource.lootPoolLabel,
      totalItems: String(preview.totalItems),
      breakdown: preview.breakdown.map((entry) => ({
        value: entry.count === null ? String(entry.cost) : String(entry.count),
        // Roll tables (1.36.0) have no cost; their count is the number of results.
        label: entry.cost === null
          ? entry.label
          : `${entry.label} - ${t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsCost", { cost: entry.cost })}`
      })),
      samples: preview.samples.map(getPreviewRewardSampleContext)
    });

    const dialog = new DialogV2({

      // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).

      classes: GM_DIALOG_CLASSES,
      window: {
        title: t("WILDHARVEST.Dialog.ControlPanel.PreviewRewardsTitle", { presetName: preset.name })
      },
      content,
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

    const readyPreset = await assertPresetSendable(preset);

    const activePlayers = getActivePlayers();
    if (!activePlayers.length) {
      ui.notifications.warn(t("WILDHARVEST.Notifications.NoPlayers"));
      return;
    }
    const players = activePlayers.filter((user) => getSelectedUserIds(state).includes(user.id));
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

    const sessionId = sendSearchOffers(offersByUserId, mode);
    if (sessionId) {
      state.selectedSessionId = sessionId;
    }
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
      // Accepted players may have closed the roll window; the reminder lets them reopen it.
      .filter(([, entry]) => entry.status === "pending" || entry.status === "accepted")
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

async function openGmTestRoll(state) {
  try {
    const preset = getSelectedPreset(state);
    if (!preset) {
      ui.notifications.warn(t("WILDHARVEST.Dialog.ControlPanel.NoPresetsDescription"));
      return;
    }

    const readyPreset = await assertPresetSendable(preset);

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
      availableActors,
      defaultToNoActor: true
    });
  } catch (error) {
    notifyError(error);
  }
}

// Buttons that form one list or group: the arrow keys, Home and End move between them (1.31.0).
const GM_KEYBOARD_LIST_ACTIONS = new Set([
  "gm-select-history-actor",
  "gm-select-history-entry",
  "gm-select-session",
  "gm-response-filter",
  "gm-preset-filter"
]);

function handleControlPanelListKeydown(event) {
  const item = event.target?.closest?.("button[data-action]");
  const action = String(item?.dataset?.action ?? "");
  if (!GM_KEYBOARD_LIST_ACTIONS.has(action)) return false;
  const scope = item.closest('[role="tabpanel"]') ?? item.parentElement;
  const items = [...scope.querySelectorAll(`button[data-action="${action}"]`)].filter((button) => !button.disabled);
  const next = getKeyboardTabTarget(items, item, event.key);
  if (!next || next === item) return Boolean(next);
  event.preventDefault();
  next.focus();
  next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
}

function handleControlPanelKeydown(dialog, event) {
  if (handleControlPanelListKeydown(event)) return;
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

    if (action === "gm-delete-backups") {
      openDeleteBackupsConfirmDialog(dialog, state);
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
    preparePart: getControlPanelPartContext,
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

// 1.30.0: the Launch Scene tab lists the logged-in players, so it is redrawn when one connects or leaves.
export function refreshGmControlPanelPlayers() {
  if (!gmControlPanelApplication?.element?.isConnected) return;
  void gmControlPanelControllers.get(gmControlPanelApplication)?.refresh();
}

export function closeGmControlPanelIfInactive() {
  if (isActiveGmUser(game.user, game.users?.activeGM)) return;
  if (gmControlPanelApplication?.element?.isConnected) {
    gmControlPanelApplication.close();
  }
}




