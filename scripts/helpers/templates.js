import { MODULE_ID } from "../constants.js";

// Handlebars templates for the player windows and the GM dialogs (1.26.0). They are loaded once
// with foundry.applications.handlebars.loadTemplates, which also registers each one as a partial
// under the given name, and then rendered synchronously, so the windows can still be built and
// returned right away (DialogV2 needs its content when it is created).
const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates`;

export const MODULE_TEMPLATES = Object.freeze({
  "wildharvest.playerHero": `${TEMPLATE_ROOT}/partials/player-hero.hbs`,
  "wildharvest.playerSectionTitle": `${TEMPLATE_ROOT}/partials/player-section-title.hbs`,
  "wildharvest.containerOptions": `${TEMPLATE_ROOT}/partials/container-options.hbs`,
  "wildharvest.compendiumList": `${TEMPLATE_ROOT}/partials/compendium-list.hbs`,
  "wildharvest.tableList": `${TEMPLATE_ROOT}/partials/table-list.hbs`,
  "wildharvest.folderList": `${TEMPLATE_ROOT}/partials/folder-list.hbs`,
  "wildharvest.playerOffer": `${TEMPLATE_ROOT}/player/offer.hbs`,
  "wildharvest.playerRoll": `${TEMPLATE_ROOT}/player/roll.hbs`,
  "wildharvest.playerResult": `${TEMPLATE_ROOT}/player/result.hbs`,
  "wildharvest.confirm": `${TEMPLATE_ROOT}/dialogs/confirm.hbs`,
  "wildharvest.configExport": `${TEMPLATE_ROOT}/dialogs/config-export.hbs`,
  "wildharvest.configImport": `${TEMPLATE_ROOT}/dialogs/config-import.hbs`,
  "wildharvest.presetEditor": `${TEMPLATE_ROOT}/dialogs/preset-editor.hbs`,
  "wildharvest.previewRewards": `${TEMPLATE_ROOT}/dialogs/preview-rewards.hbs`,
  "wildharvest.chatResult": `${TEMPLATE_ROOT}/chat/result.hbs`,
  "wildharvest.lootReview": `${TEMPLATE_ROOT}/dialogs/loot-review.hbs`,
  // Partials of the Workbench tabs (templates/gm/tab-*.hbs, rendered as ApplicationV2 parts).
  "wildharvest.gmSessionActions": `${TEMPLATE_ROOT}/gm/partials/session-actions.hbs`,
  "wildharvest.gmSceneBar": `${TEMPLATE_ROOT}/gm/partials/scene-bar.hbs`,
  "wildharvest.gmResponseEntry": `${TEMPLATE_ROOT}/gm/partials/response-entry.hbs`,
  "wildharvest.gmResponseList": `${TEMPLATE_ROOT}/gm/partials/response-list.hbs`,
  "wildharvest.gmFilterButtons": `${TEMPLATE_ROOT}/gm/partials/filter-buttons.hbs`
});

const compiledTemplates = new Map();
let loading = null;

// Started at "init" (main.js), long before any window can open; a failed load is tried again
// the next time a window needs a template.
export function preloadModuleTemplates() {
  loading ??= foundry.applications.handlebars.loadTemplates(MODULE_TEMPLATES)
    .then((delegates) => {
      Object.keys(MODULE_TEMPLATES).forEach((name, index) => compiledTemplates.set(name, delegates[index]));
    })
    .catch((error) => {
      loading = null;
      console.error(`${MODULE_ID} | Failed to load templates.`, error);
      throw error;
    });
  return loading;
}

// Same options as foundry.applications.handlebars.renderTemplate.
export function renderModuleTemplate(name, data = {}) {
  const template = compiledTemplates.get(name);
  if (!template) {
    void preloadModuleTemplates().catch(() => {});
    throw new Error(`${MODULE_ID} | Template "${name}" is not loaded yet.`);
  }
  return template(data, {
    allowProtoMethodsByDefault: true,
    allowProtoPropertiesByDefault: true
  });
}
