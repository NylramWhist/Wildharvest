import { MODULE_ID } from "../constants.js";
import { DEFAULT_RULES_CONFIG } from "../data/default-rules.js";
import {
  MAX_VALUE_DISTINCT_ITEMS,
  MAX_VALUE_MAX_TOTAL_ITEMS,
  MIN_VALUE_MAX_TOTAL_ITEMS
} from "../helpers/loot-engine-value-core.js";
import { t } from "../i18n.js";
import {
  getRulesConfig,
  normalizeRulesConfig,
  saveRulesConfigFromText,
  serializeRulesConfig
} from "../settings.js";

const {
  ApplicationV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

const RARITY_LABEL_KEYS = {
  common: "WILDHARVEST.Rarity.Common",
  uncommon: "WILDHARVEST.Rarity.Uncommon",
  rare: "WILDHARVEST.Rarity.Rare",
  veryRare: "WILDHARVEST.Rarity.VeryRare",
  legendary: "WILDHARVEST.Rarity.Legendary"
};

function getBracketRows(formRules) {
  return formRules.lootPointBrackets.map((bracket, index) => ({
    ...bracket,
    index
  }));
}

function getRarityRows(formRules) {
  return formRules.rarityRules.map((rule) => ({
    ...rule,
    label: t(RARITY_LABEL_KEYS[rule.id] ?? rule.id)
  }));
}

function getValueRows(formRules) {
  return formRules.valueRules.brackets.map((bracket, index) => ({ ...bracket, index }));
}

// Rows the GM added but left empty are ignored instead of being read as 0.
function getFilledRows(rows) {
  return Object.values(rows ?? {}).filter((row) => Object.values(row ?? {})
    .some((value) => String(value ?? "").trim() !== ""));
}

function getRuleRowsBody(form, rowsKey) {
  return form?.querySelector?.(`tbody[data-rule-rows="${rowsKey}"]`) ?? null;
}

function getNextRowIndex(body) {
  let maxIndex = -1;
  for (const input of body.querySelectorAll("input[name]")) {
    const match = input.name.match(/\.(\d+)\.[^.]+$/);
    if (match) maxIndex = Math.max(maxIndex, Number(match[1]));
  }
  return maxIndex + 1;
}

// New rows are copies of an existing row, so the markup stays defined in one place (the template).
function appendRuleRow(body) {
  const template = body.querySelector("tr");
  if (!template) return null;
  const nextIndex = getNextRowIndex(body);
  const row = template.cloneNode(true);
  for (const input of row.querySelectorAll("input[name]")) {
    input.name = input.name.replace(/\.(\d+)\.([^.]+)$/, `.${nextIndex}.$2`);
    input.value = "";
  }
  body.append(row);
  return row;
}

function setRuleRows(body, entries, fieldNames) {
  if (!body) return;
  const rows = [...body.querySelectorAll("tr")];
  for (const row of rows.slice(Math.max(1, entries.length))) row.remove();
  while (body.querySelectorAll("tr").length < entries.length) appendRuleRow(body);

  for (const [rowIndex, row] of [...body.querySelectorAll("tr")].entries()) {
    const entry = entries[rowIndex] ?? {};
    for (const field of fieldNames) {
      const input = row.querySelector(`input[name$=".${field}"]`);
      if (input) input.value = String(entry[field] ?? "");
    }
  }
}

function syncRemoveRowButtons(form) {
  for (const body of form?.querySelectorAll?.("tbody[data-rule-rows]") ?? []) {
    const buttons = body.querySelectorAll('[data-action="removeRuleRow"]');
    for (const button of buttons) button.disabled = buttons.length <= 1;
  }
}

export class RulesSettingsForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-rules-settings`,
    tag: "form",
    classes: [MODULE_ID, "wildharvest-window", "wildharvest-window--gm", "wildharvest-rules-settings"],
    form: {
      handler: RulesSettingsForm.onSubmitForm,
      closeOnSubmit: true
    },
    actions: {
      addRuleRow: RulesSettingsForm.#onAddRuleRow,
      removeRuleRow: RulesSettingsForm.#onRemoveRuleRow
    },
    position: {
      width: 760,
      height: "auto"
    },
    window: {
      title: "WILDHARVEST.Setting.RulesMenu.Name",
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/rules-settings-form.hbs`
    }
  };

  async _prepareContext() {
    const rulesConfig = getRulesConfig();

    return {
      lootMode: rulesConfig.lootMode,
      isRarityMode: rulesConfig.lootMode === "rarity",
      isValueMode: rulesConfig.lootMode === "value",
      playerRollRules: rulesConfig.playerRollRules,
      lootPointBrackets: getBracketRows(rulesConfig),
      rarityRules: getRarityRows(rulesConfig),
      valueRules: getValueRows(rulesConfig),
      tolerancePercent: rulesConfig.valueRules.tolerancePercent,
      maxDistinctItems: rulesConfig.valueRules.maxDistinctItems,
      maxDistinctItemsLimit: MAX_VALUE_DISTINCT_ITEMS,
      maxTotalItems: rulesConfig.valueRules.maxTotalItems,
      maxTotalItemsMin: MIN_VALUE_MAX_TOTAL_ITEMS,
      maxTotalItemsMax: MAX_VALUE_MAX_TOTAL_ITEMS,
      labels: {
        activeModeTitle: t("WILDHARVEST.Setting.RulesMenu.ActiveModeTitle"),
        activeModeHint: t("WILDHARVEST.Setting.RulesMenu.ActiveModeHint"),
        playerRollTitle: t("WILDHARVEST.Setting.RulesMenu.PlayerRollTitle"),
        playerRollHint: t("WILDHARVEST.Setting.RulesMenu.PlayerRollHint"),
        allowExtraModifier: t("WILDHARVEST.Setting.RulesMenu.AllowExtraModifier"),
        maxExtraModifier: t("WILDHARVEST.Setting.RulesMenu.MaxExtraModifier"),
        allowRollModeSelection: t("WILDHARVEST.Setting.RulesMenu.AllowRollModeSelection"),
        rarityMode: t("WILDHARVEST.Setting.RulesMenu.RarityMode"),
        valueMode: t("WILDHARVEST.Setting.RulesMenu.ValueMode"),
        pointsTitle: t("WILDHARVEST.Setting.RulesMenu.PointsTitle"),
        pointsHint: t("WILDHARVEST.Setting.RulesMenu.PointsHint"),
        minTotal: t("WILDHARVEST.Setting.RulesMenu.MinTotal"),
        lootPoints: t("WILDHARVEST.Setting.RulesMenu.LootPoints"),
        rarityTitle: t("WILDHARVEST.Setting.RulesMenu.RarityTitle"),
        rarityHint: t("WILDHARVEST.Setting.RulesMenu.RarityHint"),
        name: t("WILDHARVEST.Table.Name"),
        cost: t("WILDHARVEST.Setting.RulesMenu.Cost"),
        weight: t("WILDHARVEST.Setting.RulesMenu.Weight"),
        quantityFormula: t("WILDHARVEST.Setting.RulesMenu.QuantityFormula"),
        valueTitle: t("WILDHARVEST.Setting.RulesMenu.ValueTitle"),
        valueHint: t("WILDHARVEST.Setting.RulesMenu.ValueHint"),
        valueLootPoints: t("WILDHARVEST.Setting.RulesMenu.ValueLootPoints"),
        targetGp: t("WILDHARVEST.Setting.RulesMenu.TargetGp"),
        tolerancePercent: t("WILDHARVEST.Setting.RulesMenu.TolerancePercent"),
        maxDistinctItems: t("WILDHARVEST.Setting.RulesMenu.MaxDistinctItems"),
        maxDistinctItemsHint: t("WILDHARVEST.Setting.RulesMenu.MaxDistinctItemsHint", { max: MAX_VALUE_DISTINCT_ITEMS }),
        maxTotalItems: t("WILDHARVEST.Setting.RulesMenu.MaxTotalItems"),
        maxTotalItemsHint: t("WILDHARVEST.Setting.RulesMenu.MaxTotalItemsHint", {
          min: MIN_VALUE_MAX_TOTAL_ITEMS,
          max: MAX_VALUE_MAX_TOTAL_ITEMS
        }),
        addRow: t("WILDHARVEST.Setting.RulesMenu.AddRow"),
        removeRow: t("WILDHARVEST.Setting.RulesMenu.RemoveRow"),
        rowActions: t("WILDHARVEST.Setting.RulesMenu.RowActions"),
        save: t("WILDHARVEST.Dialog.Config.Save"),
        resetDefaults: t("WILDHARVEST.Setting.RulesMenu.ResetDefaults")
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const resetButton = this.element?.querySelector?.('[data-action="reset-defaults"]');
    resetButton?.addEventListener("click", this.#onResetDefaults.bind(this));
    syncRemoveRowButtons(this.form);
  }

  static #onAddRuleRow(_event, target) {
    const body = getRuleRowsBody(this.form, target?.dataset?.ruleRows);
    const row = body ? appendRuleRow(body) : null;
    syncRemoveRowButtons(this.form);
    row?.querySelector("input")?.focus();
  }

  static #onRemoveRuleRow(_event, target) {
    const row = target?.closest?.("tr");
    const body = row?.parentElement;
    if (!row || !body || body.querySelectorAll("tr").length <= 1) return;
    const neighbour = row.nextElementSibling ?? row.previousElementSibling;
    row.remove();
    syncRemoveRowButtons(this.form);
    neighbour?.querySelector('[data-action="removeRuleRow"]')?.focus();
  }

  #onResetDefaults(event) {
    event?.preventDefault?.();

    const form = this.form;
    if (!form) return;

    const modeInput = form.querySelector('[name="lootMode"]');
    if (modeInput) modeInput.value = DEFAULT_RULES_CONFIG.lootMode;

    const allowExtraModifierInput = form.querySelector('[name="playerRollRules.allowExtraModifier"]');
    const maxExtraModifierInput = form.querySelector('[name="playerRollRules.maxExtraModifier"]');
    const allowRollModeSelectionInput = form.querySelector('[name="playerRollRules.allowRollModeSelection"]');
    if (allowExtraModifierInput) {
      allowExtraModifierInput.checked = DEFAULT_RULES_CONFIG.playerRollRules.allowExtraModifier;
    }
    if (maxExtraModifierInput) {
      maxExtraModifierInput.value = String(DEFAULT_RULES_CONFIG.playerRollRules.maxExtraModifier);
    }
    if (allowRollModeSelectionInput) {
      allowRollModeSelectionInput.checked = DEFAULT_RULES_CONFIG.playerRollRules.allowRollModeSelection;
    }

    setRuleRows(
      getRuleRowsBody(form, "lootPointBrackets"),
      DEFAULT_RULES_CONFIG.lootPointBrackets,
      ["minTotal", "lootPoints"]
    );

    for (const rarityRule of DEFAULT_RULES_CONFIG.rarityRules) {
      const costInput = form.querySelector(`[name="rarityRules.${rarityRule.id}.cost"]`);
      const weightInput = form.querySelector(`[name="rarityRules.${rarityRule.id}.weight"]`);
      const quantityInput = form.querySelector(`[name="rarityRules.${rarityRule.id}.quantityFormula"]`);
      if (costInput) costInput.value = String(rarityRule.cost);
      if (weightInput) weightInput.value = String(rarityRule.weight);
      if (quantityInput) quantityInput.value = rarityRule.quantityFormula;
    }

    const toleranceInput = form.querySelector('[name="valueRules.tolerancePercent"]');
    if (toleranceInput) toleranceInput.value = String(DEFAULT_RULES_CONFIG.valueRules.tolerancePercent);
    const distinctInput = form.querySelector('[name="valueRules.maxDistinctItems"]');
    if (distinctInput) distinctInput.value = String(DEFAULT_RULES_CONFIG.valueRules.maxDistinctItems);
    const totalItemsInput = form.querySelector('[name="valueRules.maxTotalItems"]');
    if (totalItemsInput) totalItemsInput.value = String(DEFAULT_RULES_CONFIG.valueRules.maxTotalItems);
    setRuleRows(
      getRuleRowsBody(form, "valueBrackets"),
      DEFAULT_RULES_CONFIG.valueRules.brackets,
      ["lootPoints", "targetGp"]
    );
    syncRemoveRowButtons(form);

    ui.notifications?.info(t("WILDHARVEST.Notifications.RulesResetPreview"));
  }

  static async onSubmitForm(_event, _form, formData) {
    const expanded = foundry.utils.expandObject(formData?.object ?? formData ?? {});
    const rulesConfig = normalizeRulesConfig({
      lootMode: expanded.lootMode,
      playerRollRules: {
        allowExtraModifier: Boolean(expanded.playerRollRules?.allowExtraModifier),
        maxExtraModifier: expanded.playerRollRules?.maxExtraModifier,
        allowRollModeSelection: Boolean(expanded.playerRollRules?.allowRollModeSelection)
      },
      lootPointBrackets: getFilledRows(expanded.lootPointBrackets),
      rarityRules: DEFAULT_RULES_CONFIG.rarityRules.map((rule) => ({
        id: rule.id,
        ...(expanded.rarityRules?.[rule.id] ?? {})
      })),
      valueRules: {
        tolerancePercent: expanded.valueRules?.tolerancePercent,
        maxDistinctItems: expanded.valueRules?.maxDistinctItems,
        maxTotalItems: expanded.valueRules?.maxTotalItems,
        brackets: getFilledRows(expanded.valueRules?.brackets)
      }
    });

    await saveRulesConfigFromText(serializeRulesConfig(rulesConfig));
    ui.notifications?.info(t("WILDHARVEST.Notifications.RulesSaved"));
  }
}

export function registerRulesSettingsMenu() {
  game.settings.registerMenu(MODULE_ID, "rulesMenu", {
    name: "WILDHARVEST.Setting.RulesMenu.Name",
    label: "WILDHARVEST.Setting.RulesMenu.Label",
    hint: "WILDHARVEST.Setting.RulesMenu.Hint",
    icon: "fa-solid fa-sliders",
    type: RulesSettingsForm,
    restricted: true
  });
}
