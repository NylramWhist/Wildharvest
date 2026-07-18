export const GM_TABS = Object.freeze({
  LAUNCH: "launch",
  RESPONSES: "responses",
  PRESETS: "presets",
  HISTORY: "history"
});

export const GM_SEND_MODES = Object.freeze({
  WHOLE_PARTY: "whole-party",
  SELECTED_PLAYERS: "selected-players"
});

export const GM_LIVE_FILTERS = Object.freeze({
  ALL: "all",
  COMPLETED: "completed",
  PENDING: "pending"
});

export const GM_RESPONSE_FILTERS = Object.freeze({
  ALL: "all",
  COMPLETED: "completed",
  PENDING: "pending",
  FAILED: "failed",
  SKIPPED: "skipped"
});

export const GM_PRESET_FILTERS = Object.freeze({
  ALL: "all",
  NEEDS_ATTENTION: "needs-attention"
});

export function getKeyboardTabTarget(tabIds, currentTabId, key) {
  const tabs = [...(Array.isArray(tabIds) ? tabIds : [])].filter(Boolean);
  if (!tabs.length) return null;
  const currentIndex = Math.max(0, tabs.indexOf(currentTabId));

  if (key === "Home") return tabs[0];
  if (key === "End") return tabs.at(-1);
  if (key === "ArrowRight" || key === "ArrowDown") {
    return tabs[(currentIndex + 1) % tabs.length];
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return tabs[(currentIndex - 1 + tabs.length) % tabs.length];
  }
  return null;
}

export function getSelectedUserIds(state, { activePlayers = [], wholePartyMode = GM_SEND_MODES.WHOLE_PARTY } = {}) {
  const activeIds = new Set(activePlayers.map((user) => user.id));
  const normalizedIds = [...(Array.isArray(state?.selectedUserIds) ? state.selectedUserIds : [])].filter((userId) => activeIds.has(userId));

  if (state?.sendMode === wholePartyMode) {
    return activePlayers.map((user) => user.id);
  }

  return normalizedIds;
}

export function getSelectedSession(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  return sessions.find((entry) => entry.id === state?.selectedSessionId) ?? sessions[sessions.length - 1] ?? null;
}

export function getLatestSession(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  return sessions[sessions.length - 1] ?? null;
}

export function getResponseEntryKey(sessionId, entry) {
  return `${String(sessionId ?? "").trim()}:${String(entry?.userId ?? "").trim()}`;
}

export function ensureStateSelections(state, {
  activePlayers = [],
  liveFilters = Object.values(GM_LIVE_FILTERS),
  responseFilters = Object.values(GM_RESPONSE_FILTERS),
  presetFilters = Object.values(GM_PRESET_FILTERS)
} = {}) {
  const quickOptions = Array.isArray(state?.quickOptions) ? state.quickOptions : [];
  if (!quickOptions.length) {
    state.selectedPresetId = "";
  } else if (!quickOptions.some((entry) => entry.id === state.selectedPresetId)) {
    state.selectedPresetId = quickOptions[0].id;
  }

  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  if (!sessions.length) {
    state.selectedSessionId = "";
    state.expandedResponseKey = "";
  } else if (!sessions.some((session) => session.id === state.selectedSessionId)) {
    state.selectedSessionId = sessions[sessions.length - 1]?.id ?? sessions[0]?.id ?? "";
  }

  if (!liveFilters.includes(state.liveFilter)) {
    state.liveFilter = GM_LIVE_FILTERS.ALL;
  }

  if (!responseFilters.includes(state.responseFilter)) {
    state.responseFilter = GM_RESPONSE_FILTERS.ALL;
  }

  if (!presetFilters.includes(state.presetModeFilter)) {
    state.presetModeFilter = GM_PRESET_FILTERS.ALL;
  }

  if (state.expandedResponseKey) {
    const latestSession = getLatestSession(state);
    const liveEntryKeys = latestSession
      ? Object.values(latestSession.offers ?? {}).map((entry) => getResponseEntryKey(latestSession.id, entry))
      : [];
    if (!liveEntryKeys.includes(state.expandedResponseKey)) {
      state.expandedResponseKey = "";
    }
  }

  const activePlayerIds = activePlayers.map((user) => user.id);
  if (!Array.isArray(state.selectedUserIds) || !state.selectedUserIds.length) {
    state.selectedUserIds = [...activePlayerIds];
  } else {
    state.selectedUserIds = state.selectedUserIds.filter((userId) => activePlayerIds.includes(userId));
    if (!state.selectedUserIds.length) {
      state.selectedUserIds = [...activePlayerIds];
    }
  }

  state.presetFilter = String(state.presetFilter ?? "");
  state.historyFilter = String(state.historyFilter ?? "");
  state.historyEntryKey = String(state.historyEntryKey ?? "");
}

export function getFilteredLiveEntries(session, liveFilter, {
  completedFilter = GM_LIVE_FILTERS.COMPLETED,
  pendingFilter = GM_LIVE_FILTERS.PENDING,
  pendingStatuses = ["pending", "accepted", "resolving"]
} = {}) {
  const entries = Object.values(session?.offers ?? {});
  if (liveFilter === completedFilter) {
    return entries.filter((entry) => entry.status === "completed");
  }

  if (liveFilter === pendingFilter) {
    return entries.filter((entry) => pendingStatuses.includes(entry.status));
  }

  return entries;
}

export function getFilteredResponseEntries(session, responseFilter, {
  completedFilter = GM_RESPONSE_FILTERS.COMPLETED,
  pendingFilter = GM_RESPONSE_FILTERS.PENDING,
  failedFilter = GM_RESPONSE_FILTERS.FAILED,
  skippedFilter = GM_RESPONSE_FILTERS.SKIPPED,
  pendingStatuses = ["pending", "accepted", "resolving"]
} = {}) {
  const entries = Object.values(session?.offers ?? {});
  if (responseFilter === completedFilter) {
    return entries.filter((entry) => entry.status === "completed");
  }

  if (responseFilter === pendingFilter) {
    return entries.filter((entry) => pendingStatuses.includes(entry.status));
  }

  if (responseFilter === failedFilter) {
    return entries.filter((entry) => entry.status === "failed");
  }

  if (responseFilter === skippedFilter) {
    return entries.filter((entry) => entry.status === "declined");
  }

  return entries;
}

export function getFilteredPresets(state, {
  allFilter = GM_PRESET_FILTERS.ALL,
  needsAttentionFilter = GM_PRESET_FILTERS.NEEDS_ATTENTION,
  getPresetValidationMessages = () => [],
  getSkillLabel = () => "",
  getPresetCompendiumSummary = () => "",
  locale = "en"
} = {}) {
  const filterText = String(state?.presetFilter ?? "").trim().toLowerCase();
  const modeFilter = state?.presetModeFilter ?? allFilter;
  const quickOptions = Array.isArray(state?.quickOptions) ? state.quickOptions : [];

  return quickOptions
    .filter((preset) => {
      if (modeFilter === needsAttentionFilter && !getPresetValidationMessages(preset).length) return false;

      if (!filterText) return true;

      const haystack = [
        preset.name,
        preset.description,
        getSkillLabel(preset.skillId),
        getPresetCompendiumSummary(preset)
      ].join(" ").toLowerCase();

      return haystack.includes(filterText);
    })
    .sort((left, right) => {
      const leftInvalid = getPresetValidationMessages(left).length ? 1 : 0;
      const rightInvalid = getPresetValidationMessages(right).length ? 1 : 0;
      if (leftInvalid !== rightInvalid) return rightInvalid - leftInvalid;

      return String(left.name ?? "").localeCompare(String(right.name ?? ""), locale);
    });
}

export function getSessionCounts(session) {
  const entries = Object.values(session?.offers ?? {});
  return {
    total: entries.length,
    completed: entries.filter((entry) => entry.status === "completed").length,
    accepted: entries.filter((entry) => entry.status === "accepted").length,
    resolving: entries.filter((entry) => entry.status === "resolving").length,
    pending: entries.filter((entry) => entry.status === "pending").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    declined: entries.filter((entry) => entry.status === "declined").length
  };
}
