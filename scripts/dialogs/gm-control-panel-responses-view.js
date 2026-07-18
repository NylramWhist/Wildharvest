import { t } from "../i18n.js";
import { escapeHtml } from "./dialog-utils.js";
import {
  getFilteredResponseEntries,
  getSelectedSession,
  GM_RESPONSE_FILTERS
} from "./gm-control-panel-state.js";
import { GM_UI_ASSETS, renderGmIcon } from "./gm-control-panel-view-shared.js";
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

export function renderResponsesTab(state, {
  isSessionClosed,
  renderLiveSessionActionButtons,
  renderResponseEntryCard,
  renderResponseStats,
  renderSessionSelector
}) {
  const session = getSelectedSession(state);
  if (!session) {
    return `
      <section class="wildharvest-gm-card">
        <div class="wildharvest-gm-card__header">
          <div>
            <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ResponsesTitle"))}</h3>
            <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ResponsesHint"))}</p>
          </div>
        </div>
        <p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Dialog.Responses.Empty"))}</p>
      </section>
    `;
  }

  const modeLabel = session.mode === ASSIGNMENT_MODE.PER_PLAYER
    ? t("WILDHARVEST.Dialog.Responses.ModePerPlayer")
    : t("WILDHARVEST.Dialog.Responses.ModeParty");
  const entries = Object.values(session.offers ?? {});
  const sessionName = entries[0]?.activityName ?? session.id;
  const filteredEntries = getFilteredResponseEntries(session, state.responseFilter);
  const responseFilterOptions = getResponseFilterOptions();
  const closedDescription = isSessionClosed(session)
    ? t("WILDHARVEST.Dialog.ControlPanel.SceneClosedMeta", { closedAt: session.closedAt })
    : t("WILDHARVEST.Dialog.ControlPanel.SessionMeta", {
      mode: modeLabel,
      createdAt: session.createdAt
    });

  return `
    <section class="wildharvest-gm-grid wildharvest-gm-grid--responses">
      <article class="wildharvest-gm-card wildharvest-gm-session-detail">
        <div class="wildharvest-gm-card__header">
          <div>
            <h3>${escapeHtml(sessionName)}</h3>
            <p>${escapeHtml(closedDescription)}</p>
          </div>
          ${renderLiveSessionActionButtons(session)}
        </div>
        ${renderResponseStats(session)}
        <div class="wildharvest-gm-live-filters wildharvest-gm-live-filters--left" role="group" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.FiltersLabel"))}">
          ${responseFilterOptions.map((option) => `
            <button
              type="button"
              class="button${state.responseFilter === option.id ? " is-active" : ""}"
              data-action="gm-response-filter"
              data-filter-id="${escapeHtml(option.id)}"
              aria-pressed="${state.responseFilter === option.id ? "true" : "false"}"
            >
              ${escapeHtml(option.label)}
            </button>
          `).join("")}
        </div>
        <div class="wildharvest-gm-response-list">
          ${filteredEntries.length
            ? filteredEntries.map((entry) => renderResponseEntryCard(session, entry, state)).join("")
            : `<div class="wildharvest-gm-empty-state-card wildharvest-gm-empty-state-card--compact">
                ${renderGmIcon(GM_UI_ASSETS.pending, "wildharvest-gm-empty-state-card__asset")}
                <strong>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LiveResponsesEmptyFiltered"))}</strong>
              </div>`}
        </div>
      </article>

      <article class="wildharvest-gm-card">
        <div class="wildharvest-gm-card__header">
          <div>
            <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SceneHistoryTitle"))}</h3>
            <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SceneHistoryHint"))}</p>
          </div>
        </div>
        ${renderSessionSelector(state)}
      </article>
    </section>
  `;
}
