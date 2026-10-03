import { getSkillChoices, getSkillLabel } from "../helpers/activity-presets.js";
import { t } from "../i18n.js";
import { GM_SEND_MODES } from "./gm-control-panel-state.js";

// Data for templates/gm/tab-launch.hbs (1.27.0; before, this file built the HTML itself).
export function getLaunchTabContext(state, {
  getActivePlayers,
  getPlayerCharacterName,
  getPresetCompendiumSummary,
  getPresetValidationMessages,
  getSelectedPreset,
  getSceneBarContext
}) {
  const preset = getSelectedPreset(state);
  if (!preset) return { preset: null };

  const selectedSkill = String(state.selectedSkillOverride ?? "").trim().toLowerCase();
  const validationMessages = getPresetValidationMessages(preset);
  // T-14 (1.30.0): the recipients are listed in both modes; only "selected players" lets the GM choose.
  const showRecipientChoice = state.sendMode === GM_SEND_MODES.SELECTED_PLAYERS;

  return {
    preset: true,
    presetOptions: state.quickOptions.map((option) => ({
      id: option.id,
      name: option.name,
      selected: option.id === state.selectedPresetId
    })),
    skillOverride: selectedSkill,
    skillDefaultLabel: t("WILDHARVEST.Dialog.ControlPanel.ActivitySkillDefault", {
      skillLabel: getSkillLabel(preset?.skillId ?? "")
    }),
    skillOptions: getSkillChoices().map((choice) => ({ ...choice, selected: choice.id === selectedSkill })),
    compendiumSummary: getPresetCompendiumSummary(preset) || t("WILDHARVEST.Dialog.LootPools.NoCompendiums"),
    sendModeOptions: [
      { id: GM_SEND_MODES.WHOLE_PARTY, label: t("WILDHARVEST.Dialog.ControlPanel.SendWholeParty") },
      { id: GM_SEND_MODES.SELECTED_PLAYERS, label: t("WILDHARVEST.Dialog.ControlPanel.SendSelectedPlayers") }
    ].map((option) => ({ ...option, selected: option.id === state.sendMode })),
    showRecipientChoice,
    recipients: getActivePlayers().map((user) => ({
      id: user.id,
      name: user.name,
      characterName: getPlayerCharacterName(user),
      checked: state.selectedUserIds.includes(user.id)
    })),
    description: preset.description || t("WILDHARVEST.Dialog.ControlPanel.NoDescription"),
    validationMessages,
    ready: validationMessages.length === 0,
    sceneBar: getSceneBarContext(state)
  };
}
