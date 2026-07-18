import { MODULE_ID } from "../constants.js";
import { DEFAULT_RULES_CONFIG } from "../data/default-rules.js";
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

export class RulesSettingsForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-rules-settings`,
    tag: "form",
    classes: [MODULE_ID, "wildharvest-window", "wildharvest-window--gm"],
    form: {
      handler: RulesSettingsForm.onSubmitForm,
      closeOnSubmit: true
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
      lootPointBrackets: getBracketRows(rulesConfig),
      rarityRules: getRarityRows(rulesConfig),
      valueRules: getValueRows(rulesConfig),
      tolerancePercent: rulesConfig.valueRules.tolerancePercent,
      labels: {
        activeModeTitle: t("WILDHARVEST.Setting.RulesMenu.ActiveModeTitle"),
        activeModeHint: t("WILDHARVEST.Setting.RulesMenu.ActiveModeHint"),
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
        save: t("WILDHARVEST.Dialog.Config.Save"),
        resetDefaults: t("WILDHARVEST.Setting.RulesMenu.ResetDefaults")
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const resetButton = this.element?.querySelector?.('[data-action="reset-defaults"]');
    resetButton?.addEventListener("click", this.#onResetDefaults.bind(this));
  }

  #onResetDefaults(event) {
    event?.preventDefault?.();

    const form = this.form;
    if (!form) return;

    const modeInput = form.querySelector('[name="lootMode"]');
    if (modeInput) modeInput.value = DEFAULT_RULES_CONFIG.lootMode;

    for (const [index, bracket] of DEFAULT_RULES_CONFIG.lootPointBrackets.entries()) {
      const minTotalInput = form.querySelector(`[name="lootPointBrackets.${index}.minTotal"]`);
      const lootPointsInput = form.querySelector(`[name="lootPointBrackets.${index}.lootPoints"]`);
      if (minTotalInput) minTotalInput.value = String(bracket.minTotal);
      if (lootPointsInput) lootPointsInput.value = String(bracket.lootPoints);
    }

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
    for (const [index, bracket] of DEFAULT_RULES_CONFIG.valueRules.brackets.entries()) {
      const pointsInput = form.querySelector(`[name="valueRules.brackets.${index}.lootPoints"]`);
      const targetInput = form.querySelector(`[name="valueRules.brackets.${index}.targetGp"]`);
      if (pointsInput) pointsInput.value = String(bracket.lootPoints);
      if (targetInput) targetInput.value = String(bracket.targetGp);
    }

    ui.notifications?.info(t("WILDHARVEST.Notifications.RulesResetPreview"));
  }

  static async onSubmitForm(_event, _form, formData) {
    const expanded = foundry.utils.expandObject(formData?.object ?? formData ?? {});
    const rulesConfig = normalizeRulesConfig({
      lootMode: expanded.lootMode,
      lootPointBrackets: Object.values(expanded.lootPointBrackets ?? {}),
      rarityRules: DEFAULT_RULES_CONFIG.rarityRules.map((rule) => ({
        id: rule.id,
        ...(expanded.rarityRules?.[rule.id] ?? {})
      })),
      valueRules: {
        tolerancePercent: expanded.valueRules?.tolerancePercent,
        brackets: Object.values(expanded.valueRules?.brackets ?? {})
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
