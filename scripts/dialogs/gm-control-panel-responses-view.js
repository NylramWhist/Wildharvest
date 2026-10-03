import { formatModuleTimestamp, t } from "../i18n.js";
import {
  getFilteredResponseEntries,
  getSelectedSession,
  GM_RESPONSE_FILTERS
} from "./gm-control-panel-state.js";
import { ASSIGNMENT_MODE } from "./search-offer-dialogs.js";

function getResponseFilterOptions() {
  return [
    { id: GM_RESPONSE_FILTERS.ALL, label: t("WILDHARVEST.Dialog.ControlPanel.LiveFilterAll") },
    { id: GM_RESPONSE_FILTERS.COMPLETED, label: t("WILDHARVEST.Dialog.ControlPanel.LiveFilterCompleted") },
    { id: GM_RESPONSE_FILTERS.PENDING, label: t("WILDHARVEST.Dialog.ControlPanel.LiveFilterPending") },
    { id: GM_RESPONSE_FILTERS.FAILED, label: t("WILDHARVEST.Dialog.Responses.Failed") },
    { id: GM_RESPONSE_FILTERS.SKIPPED, label: t("WILDHARVEST.Dialog.ControlPanel.LiveFilterSkipped") }
  ];
}

// Data for templates/gm/tab-responses.hbs (1.27.0).
export function getResponsesTabContext(state, {
  isSessionClosed,
  getSessionActionsContext,
  getResponseEntryContext,
  getResponseStats,
  getSessionSelectorGroups
}) {
  const session = getSelectedSession(state);
  if (!session) return { session: null };

  const modeLabel = session.mode === ASSIGNMENT_MODE.PER_PLAYER
    ? t("WILDHARVEST.Dialog.Responses.ModePerPlayer")
    : t("WILDHARVEST.Dialog.Responses.ModeParty");
  const entries = Object.values(session.offers ?? {});

  return {
    session: true,
    sessionName: entries[0]?.activityName ?? session.id,
    sessionDescription: isSessionClosed(session)
      ? t("WILDHARVEST.Dialog.ControlPanel.SceneClosedMeta", { closedAt: formatModuleTimestamp(session.closedAt) })
      : t("WILDHARVEST.Dialog.ControlPanel.SessionMeta", {
        mode: modeLabel,
        createdAt: formatModuleTimestamp(session.createdAt)
      }),
    actions: getSessionActionsContext(session, { showOpenResponses: false }),
    stats: getResponseStats(session),
    filters: {
      extraClass: "wildharvest-gm-live-filters--left",
      action: "gm-response-filter",
      options: getResponseFilterOptions().map((option) => ({ ...option, active: state.responseFilter === option.id }))
    },
    responses: {
      entries: getFilteredResponseEntries(session, state.responseFilter)
        .map((entry) => getResponseEntryContext(session, entry, state))
    },
    sessionGroups: getSessionSelectorGroups(state)
  };
}
