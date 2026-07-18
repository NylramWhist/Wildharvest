import { getSkillLabel } from "../helpers/activity-presets.js";
import { t } from "../i18n.js";
import { escapeHtml } from "./dialog-utils.js";
import { GM_PRESET_FILTERS } from "./gm-control-panel-state.js";
import { GM_UI_ASSETS, renderGmIcon } from "./gm-control-panel-view-shared.js";

function getPresetFilterOptions() {
  return [
    { id: GM_PRESET_FILTERS.ALL, label: t("WILDHARVEST.Dialog.ControlPanel.PresetFilterAll") },
    { id: GM_PRESET_FILTERS.NEEDS_ATTENTION, label: t("WILDHARVEST.Dialog.ControlPanel.PresetFilterAttention") }
  ];
}

function renderPresetRow(preset, getPresetCompendiumSummary, getPresetValidationMessages) {
  const validationMessages = getPresetValidationMessages(preset);
  const needsAttention = validationMessages.length > 0;
  const packSummary = getPresetCompendiumSummary(preset) || t("WILDHARVEST.Dialog.LootPools.NoCompendiums");
  const description = preset.description || t("WILDHARVEST.Dialog.ControlPanel.NoDescription");
  const statusLabel = needsAttention
    ? t("WILDHARVEST.Dialog.ControlPanel.PresetNeedsAttentionShort")
    : t("WILDHARVEST.Dialog.ControlPanel.PresetReady");
  const statusTitle = needsAttention
    ? validationMessages.join(" ")
    : t("WILDHARVEST.Dialog.ControlPanel.PresetReadyHint");

  return `
    <article class="wildharvest-gm-preset-row${needsAttention ? " needs-attention" : " is-ready"}" role="row">
      <div class="wildharvest-gm-preset-cell wildharvest-gm-preset-cell--identity" role="cell" data-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetColumn"))}">
        <div class="wildharvest-gm-preset-row__icon" aria-hidden="true">
          ${renderGmIcon(GM_UI_ASSETS.activity, "wildharvest-gm-preset-row__asset")}
        </div>
        <div class="wildharvest-gm-preset-row__copy">
          <strong>${escapeHtml(preset.name)}</strong>
          <p title="${escapeHtml(description)}">${escapeHtml(description)}</p>
        </div>
      </div>

      <div class="wildharvest-gm-preset-cell wildharvest-gm-preset-cell--skill" role="cell" data-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Skill"))}">
        <strong>${escapeHtml(getSkillLabel(preset.skillId))}</strong>
        <span>${escapeHtml(String(preset.skillId ?? "").toUpperCase())}</span>
      </div>

      <div class="wildharvest-gm-preset-cell wildharvest-gm-preset-cell--pool" role="cell" data-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LootPool"))}">
        <span title="${escapeHtml(packSummary)}">${escapeHtml(packSummary)}</span>
      </div>

      <div class="wildharvest-gm-preset-cell wildharvest-gm-preset-cell--status" role="cell" data-label="${escapeHtml(t("WILDHARVEST.Dialog.Responses.Status"))}">
        <span class="wildharvest-gm-preset-status${needsAttention ? " needs-attention" : " is-ready"}" title="${escapeHtml(statusTitle)}">
          <i class="fa-solid ${needsAttention ? "fa-triangle-exclamation" : "fa-check"}" aria-hidden="true"></i>
          ${escapeHtml(statusLabel)}
        </span>
      </div>

      <div class="wildharvest-gm-preset-cell wildharvest-gm-preset-cell--actions" role="cell" data-label="${escapeHtml(t("WILDHARVEST.Table.Actions"))}">
        <button type="button" class="button" data-action="gm-send-preset" data-preset-id="${escapeHtml(preset.id)}" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SendPreset"))}" title="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SendPreset"))}"${needsAttention ? " disabled" : ""}>
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
        </button>
        <button type="button" class="button" data-action="gm-edit-preset" data-preset-id="${escapeHtml(preset.id)}" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.Activities.Edit"))}" title="${escapeHtml(t("WILDHARVEST.Dialog.Activities.Edit"))}">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>
        <button type="button" class="button" data-action="gm-duplicate-preset" data-preset-id="${escapeHtml(preset.id)}" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Duplicate"))}" title="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Duplicate"))}">
          <i class="fa-solid fa-copy" aria-hidden="true"></i>
        </button>
        <button type="button" class="button wildharvest-gm-preset-action--danger" data-action="gm-delete-preset" data-preset-id="${escapeHtml(preset.id)}" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.Activities.Delete"))}" title="${escapeHtml(t("WILDHARVEST.Dialog.Activities.Delete"))}">
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    </article>
  `;
}

export function renderPresetsTab(state, {
  getFilteredPresets,
  getPresetCompendiumSummary,
  getPresetValidationMessages
}) {
  const presets = getFilteredPresets(state);
  const presetFilterOptions = getPresetFilterOptions();

  return `
    <section class="wildharvest-gm-card">
      <div class="wildharvest-gm-card__header">
        <div>
          <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetsTitle"))}</h3>
          <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetsHint"))}</p>
        </div>
        <div class="wildharvest-inline-actions wildharvest-inline-actions--end">
          <button type="button" class="button" data-action="gm-export-config">
            <i class="fa-solid fa-file-export" aria-hidden="true"></i>
            ${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ExportConfig"))}
          </button>
          <button type="button" class="button" data-action="gm-import-config">
            <i class="fa-solid fa-file-import" aria-hidden="true"></i>
            ${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ImportConfig"))}
          </button>
          <button type="button" class="button default" data-action="gm-create-preset">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            ${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CreatePreset"))}
          </button>
        </div>
      </div>
      <div class="wildharvest-gm-preset-toolbar">
        <div class="form-group wildharvest-form-group--tight wildharvest-gm-preset-search">
          <label>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetSearch"))}</label>
          <input type="search" name="gmPresetFilter" value="${escapeHtml(state.presetFilter ?? "")}" placeholder="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetSearchPlaceholder"))}">
        </div>
        <div class="wildharvest-gm-live-filters" role="group" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.FiltersLabel"))}">
          ${presetFilterOptions.map((option) => `
            <button
              type="button"
              class="button${state.presetModeFilter === option.id ? " is-active" : ""}"
              data-action="gm-preset-filter"
              data-filter-id="${escapeHtml(option.id)}"
              aria-pressed="${state.presetModeFilter === option.id ? "true" : "false"}"
            >
              ${escapeHtml(option.label)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="wildharvest-gm-preset-table" role="table" aria-label="${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetsTitle"))}">
        <div class="wildharvest-gm-preset-table__header" role="row">
          <span role="columnheader">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetColumn"))}</span>
          <span role="columnheader">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.Skill"))}</span>
          <span role="columnheader">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LootPool"))}</span>
          <span role="columnheader">${escapeHtml(t("WILDHARVEST.Dialog.Responses.Status"))}</span>
          <span role="columnheader">${escapeHtml(t("WILDHARVEST.Table.Actions"))}</span>
        </div>
        ${presets.length
          ? `<div class="wildharvest-gm-preset-table__body" role="rowgroup">${presets.map((preset) => renderPresetRow(preset, getPresetCompendiumSummary, getPresetValidationMessages)).join("")}</div>`
          : `<p class="wildharvest-empty wildharvest-gm-preset-table__empty">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.NoPresetSearchResults"))}</p>`}
      </div>
    </section>
  `;
}
