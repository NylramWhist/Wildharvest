import { getSkillLabel } from "../helpers/activity-presets.js";
import { formatModuleNumber, t } from "../i18n.js";
import { getMigrationBackupSummary } from "../helpers/migration-backup.js";
import { GM_PRESET_FILTERS } from "./gm-control-panel-state.js";

function getPresetFilterOptions() {
  return [
    { id: GM_PRESET_FILTERS.ALL, label: t("WILDHARVEST.Dialog.ControlPanel.PresetFilterAll") },
    { id: GM_PRESET_FILTERS.NEEDS_ATTENTION, label: t("WILDHARVEST.Dialog.ControlPanel.PresetFilterAttention") }
  ];
}

function getPresetRowContext(preset, getPresetCompendiumSummary, getPresetValidationMessages) {
  const validationMessages = getPresetValidationMessages(preset);
  const needsAttention = validationMessages.length > 0;
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description || t("WILDHARVEST.Dialog.ControlPanel.NoDescription"),
    skillLabel: getSkillLabel(preset.skillId),
    // 1.35.0: shown only when the place is harder or easier than normal.
    difficultyText: Number(preset.difficulty)
      ? t("WILDHARVEST.Dialog.ControlPanel.PresetDifficulty", {
        value: Number(preset.difficulty) > 0 ? `+${preset.difficulty}` : String(preset.difficulty)
      })
      : "",
    packSummary: getPresetCompendiumSummary(preset) || t("WILDHARVEST.Dialog.LootPools.NoCompendiums"),
    needsAttention,
    statusLabel: needsAttention
      ? t("WILDHARVEST.Dialog.ControlPanel.PresetNeedsAttentionShort")
      : t("WILDHARVEST.Dialog.ControlPanel.PresetReady"),
    statusTitle: needsAttention
      ? validationMessages.join(" ")
      : t("WILDHARVEST.Dialog.ControlPanel.PresetReadyHint"),
    // 1.31.0: the reason is shown in the row, not only in a tooltip that keyboard users cannot open.
    statusDetail: needsAttention ? validationMessages[0] : "",
    // Icon buttons name the preset, so a screen reader does not hear "Edit" three times in a row.
    actionLabels: Object.fromEntries([
      ["send", "WILDHARVEST.Dialog.ControlPanel.SendPreset"],
      ["edit", "WILDHARVEST.Dialog.Activities.Edit"],
      ["duplicate", "WILDHARVEST.Dialog.ControlPanel.Duplicate"],
      ["remove", "WILDHARVEST.Dialog.Activities.Delete"]
    ].map(([id, key]) => [id, t("WILDHARVEST.Dialog.ControlPanel.PresetActionLabel", { action: t(key), name: preset.name })]))
  };
}

// 1.22.0 (D13): data backups made before module data updates can be removed from here once not needed.
function getDeleteBackupsContext() {
  const { count, bytes } = getMigrationBackupSummary();
  if (!count) return null;
  const size = `${formatModuleNumber(Math.max(1, Math.round(bytes / 1024)), { maximumFractionDigits: 0 })} KB`;
  return {
    hint: t("WILDHARVEST.Dialog.ControlPanel.DeleteBackupsHint", { count, size }),
    label: t("WILDHARVEST.Dialog.ControlPanel.DeleteBackups", { count })
  };
}

// Data for templates/gm/tab-presets.hbs (1.27.0).
export function getPresetsTabContext(state, {
  getFilteredPresets,
  getPresetCompendiumSummary,
  getPresetValidationMessages
}) {
  return {
    backups: getDeleteBackupsContext(),
    presetFilter: state.presetFilter ?? "",
    filters: {
      action: "gm-preset-filter",
      options: getPresetFilterOptions().map((option) => ({ ...option, active: state.presetModeFilter === option.id }))
    },
    presets: getFilteredPresets(state)
      .map((preset) => getPresetRowContext(preset, getPresetCompendiumSummary, getPresetValidationMessages))
  };
}
