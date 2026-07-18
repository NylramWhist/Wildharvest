import { getSkillChoices, getSkillLabel } from "../helpers/activity-presets.js";
import { t } from "../i18n.js";
import { escapeHtml } from "./dialog-utils.js";
import { GM_SEND_MODES } from "./gm-control-panel-state.js";
import { GM_UI_ASSETS, renderGmIcon, renderGmLabel } from "./gm-control-panel-view-shared.js";

function renderRecipientChecklist(state, getActivePlayers, getPlayerCharacterName) {
  const players = getActivePlayers();
  if (!players.length) {
    return `<p class="wildharvest-empty">${escapeHtml(t("WILDHARVEST.Notifications.NoPlayers"))}</p>`;
  }

  return `
    <div class="wildharvest-gm-recipient-list">
      ${players.map((user) => `
        <label class="wildharvest-gm-recipient">
          <input
            type="checkbox"
            data-recipient-id="${escapeHtml(user.id)}"
            ${state.selectedUserIds.includes(user.id) ? "checked" : ""}
          >
          <span>
            <strong>${escapeHtml(user.name)}</strong>
            <small>${escapeHtml(getPlayerCharacterName(user))}</small>
          </span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderSkillOverrideOptions(selectedPreset, selectedSkillOverride) {
  const selectedValue = String(selectedSkillOverride ?? "").trim().toLowerCase();
  const defaultSelected = !selectedValue ? " selected" : "";
  const presetLabel = getSkillLabel(selectedPreset?.skillId ?? "");
  const options = getSkillChoices()
    .map((choice) => {
      const selected = choice.id === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(choice.id)}"${selected}>${escapeHtml(choice.label)}</option>`;
    })
    .join("");

  return `
    <option value=""${defaultSelected}>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.ActivitySkillDefault", { skillLabel: presetLabel }))}</option>
    ${options}
  `;
}

export function renderLaunchTab(state, {
  getActivePlayers,
  getPlayerCharacterName,
  getPresetCompendiumSummary,
  getPresetValidationMessages,
  getSelectedPreset,
  renderActiveSceneBox,
  renderLiveResponsesPanel
}) {
  const preset = getSelectedPreset(state);
  if (!preset) {
    return `
      <section class="wildharvest-gm-empty-state">
        <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.NoPresetsTitle"))}</h3>
        <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.NoPresetsDescription"))}</p>
        <div class="wildharvest-inline-actions">
          <button type="button" class="button" data-action="gm-open-presets">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.OpenPresets"))}</button>
          <button type="button" class="button" data-action="gm-create-preset">${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.CreatePreset"))}</button>
        </div>
      </section>
    `;
  }

  const sendModeOptions = [
    { id: GM_SEND_MODES.WHOLE_PARTY, label: t("WILDHARVEST.Dialog.ControlPanel.SendWholeParty") },
    { id: GM_SEND_MODES.SELECTED_PLAYERS, label: t("WILDHARVEST.Dialog.ControlPanel.SendSelectedPlayers") }
  ];
  const description = preset.description || t("WILDHARVEST.Dialog.ControlPanel.NoDescription");
  const compendiumSummary = getPresetCompendiumSummary(preset) || t("WILDHARVEST.Dialog.LootPools.NoCompendiums");
  const showRecipients = state.sendMode === GM_SEND_MODES.SELECTED_PLAYERS;
  const presetValidationMessages = getPresetValidationMessages(preset);
  const presetReady = presetValidationMessages.length === 0;

  return `
    <div class="wildharvest-gm-main-grid">
      <article class="wildharvest-gm-card wildharvest-gm-card--primary wildharvest-gm-launch-card">
        <div class="wildharvest-gm-card__header">
          <div>
            <h3>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LaunchTitle"))}</h3>
            <p>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.LaunchHint"))}</p>
          </div>
        </div>

        <div class="wildharvest-gm-launch-form-shell">
          <div class="wildharvest-gm-form wildharvest-gm-form--launch">
            <div class="form-group wildharvest-gm-form-group--half">
              <label>${renderGmLabel(GM_UI_ASSETS.activity, t("WILDHARVEST.Dialog.ControlPanel.Activity"))}</label>
              <select name="gmPresetId">
                ${state.quickOptions.map((option) => {
                  const selected = option.id === state.selectedPresetId ? " selected" : "";
                  return `<option value="${escapeHtml(option.id)}"${selected}>${escapeHtml(option.name)}</option>`;
                }).join("")}
              </select>
            </div>

            <div class="form-group wildharvest-gm-form-group--half">
              <label>${renderGmLabel(GM_UI_ASSETS.skill, t("WILDHARVEST.Dialog.ControlPanel.Skill"))}</label>
              <select name="gmSkillOverride">
                ${renderSkillOverrideOptions(preset, state.selectedSkillOverride)}
              </select>
            </div>

            <div class="form-group wildharvest-gm-form-group--half">
              <label>${renderGmLabel(GM_UI_ASSETS.lootPool, t("WILDHARVEST.Dialog.ControlPanel.LootPool"))}</label>
              <div class="wildharvest-gm-readonly wildharvest-gm-readonly--scroll" title="${escapeHtml(compendiumSummary)}">${escapeHtml(compendiumSummary)}</div>
            </div>

            <div class="form-group wildharvest-gm-form-group--half">
              <label>${renderGmLabel(GM_UI_ASSETS.sendTo, t("WILDHARVEST.Dialog.ControlPanel.SendTo"))}</label>
              <select name="gmSendMode">
                ${sendModeOptions.map((option) => {
                  const selected = option.id === state.sendMode ? " selected" : "";
                  return `<option value="${escapeHtml(option.id)}"${selected}>${escapeHtml(option.label)}</option>`;
                }).join("")}
              </select>
            </div>

            ${showRecipients ? `
              <div class="form-group wildharvest-gm-form-group--full">
                <label>${renderGmLabel(GM_UI_ASSETS.sendTo, t("WILDHARVEST.Dialog.ControlPanel.Recipients"))}</label>
                ${renderRecipientChecklist(state, getActivePlayers, getPlayerCharacterName)}
              </div>
            ` : ""}

            <div class="form-group wildharvest-gm-form-group--full">
              <label>${renderGmLabel(GM_UI_ASSETS.description, t("WILDHARVEST.Dialog.ControlPanel.SceneDescription"))}</label>
              <div class="wildharvest-gm-readonly wildharvest-gm-readonly--multiline">${escapeHtml(description)}</div>
            </div>
          </div>

          ${presetReady ? "" : `
            <div class="notification warning wildharvest-gm-validation">
              <p><strong>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PresetNeedsAttention"))}</strong></p>
              <ul class="wildharvest-history">
                ${presetValidationMessages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
              </ul>
            </div>
          `}

          <div class="wildharvest-gm-launch-actions">
            <button type="button" class="button default" data-action="gm-send-launch"${presetReady ? "" : " disabled"}>
              ${renderGmIcon(GM_UI_ASSETS.sendTo, "wildharvest-gm-button__asset")}
              <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.SendPlayers"))}</span>
            </button>
            <div class="wildharvest-gm-launch-secondary-actions">
              <button type="button" class="button" data-action="gm-test-roll"${presetReady ? "" : " disabled"}>
                ${renderGmIcon(GM_UI_ASSETS.testRoll, "wildharvest-gm-button__asset")}
                <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.TestRoll"))}</span>
              </button>
              <button type="button" class="button" data-action="gm-preview-rewards"${presetReady ? "" : " disabled"}>
                ${renderGmIcon(GM_UI_ASSETS.rewards, "wildharvest-gm-button__asset")}
                <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.PreviewRewards"))}</span>
              </button>
              <button type="button" class="button" data-action="gm-open-presets">
                ${renderGmIcon(GM_UI_ASSETS.presets, "wildharvest-gm-button__asset")}
                <span>${escapeHtml(t("WILDHARVEST.Dialog.ControlPanel.TabPresets"))}</span>
              </button>
            </div>
          </div>
        </div>

        ${renderActiveSceneBox(state)}
      </article>

      ${renderLiveResponsesPanel(state)}
    </div>
  `;
}
