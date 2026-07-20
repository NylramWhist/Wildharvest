import { MODULE_ID } from "./constants.js";
import {
  closeGmControlPanelIfInactive,
  openGmControlPanel
} from "./dialogs/gm-control-panel-dialog.js";
import { registerRulesSettingsMenu } from "./dialogs/rules-settings-menu.js";
import {
  handleActiveGmChange,
  handlePlayerRequestDocumentUpdate,
  initializeSearchSessions,
  processPendingPlayerRequests,
  registerSocketListeners
} from "./dialogs/search-offer-dialogs.js";
import { isActiveGmUser } from "./helpers/active-gm-core.js";
import { getMigrationBackups } from "./helpers/migration-backup.js";
import { createModuleLifecycle } from "./helpers/module-lifecycle.js";
import { clearSearchCompendiumCache } from "./helpers/search-engine.js";
import { preloadModuleTranslations, t } from "./i18n.js";
import { migrateModuleData, registerSettings } from "./settings.js";

async function runReadyMaintenance() {
  if (!game.user.isGM) return;
  initializeSearchSessions();
  const activeGm = game.users?.activeGM;
  if (!isActiveGmUser(game.user, activeGm)) return;

  const migrationResult = await migrateModuleData();
  if (migrationResult?.changed) {
    console.info(
      `${MODULE_ID} | Data migration completed.`,
      migrationResult
    );
  }
  await processPendingPlayerRequests();
}

const lifecycle = createModuleLifecycle({
  registerSettings,
  registerRulesSettingsMenu,
  preloadTranslations: preloadModuleTranslations,
  registerSocketListeners,
  runReadyMaintenance,
  onInitComplete: () => console.log(`${MODULE_ID} | init`),
  onBackgroundError: (phase, error) => {
    console.warn(`${MODULE_ID} | Failed during ${phase}.`, error);
  }
});

Hooks.once("init", lifecycle.onInit);

Hooks.once("i18nInit", lifecycle.onI18nInit);

Hooks.once("setup", () => {
  const activeModule = game.modules.get(MODULE_ID);
  if (!activeModule) return;

  activeModule.api = Object.freeze({
    apiVersion: 1,
    openControlPanel: openGmControlPanel,
    getMigrationBackups
  });
});

Hooks.once("ready", lifecycle.onReady);

function getCompendiumPackId(document) {
  if (document && "pack" in Object(document) && !document.pack) return "";
  const pack = document?.pack ?? document;
  if (typeof pack === "string") return pack;
  const collection = pack?.collection;
  if (typeof collection === "string") return collection.trim();
  return String(pack?.metadata?.id ?? "").trim();
}

for (const hookName of ["createCompendium", "updateCompendium", "deleteCompendium"]) {
  Hooks.on(hookName, (pack) => clearSearchCompendiumCache(getCompendiumPackId(pack)));
}

for (const hookName of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hookName, (item) => {
    const packId = getCompendiumPackId(item);
    if (packId) clearSearchCompendiumCache(packId);
  });
}

Hooks.on("updateUser", (user, changes, options, userId) => {
  void Promise.resolve().then(() => {
    closeGmControlPanelIfInactive();
    handleActiveGmChange();
    handlePlayerRequestDocumentUpdate(user, changes, options, userId);
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!isActiveGmUser(game.user, game.users?.activeGM)) return;

  if (!controls || typeof controls !== "object") return;
  const control = controls.tokens
    ?? Object.values(controls).find((entry) => entry?.tools && typeof entry.tools === "object");
  if (!control?.tools || control.tools[MODULE_ID]) return;

  control.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: t("WILDHARVEST.Controls.Title"),
    icon: "fa-solid fa-seedling",
    order: Object.keys(control.tools).length,
    visible: true,
    button: true,
    onChange: (_event, active) => {
      if (active === false) return;
      openGmControlPanel();
    }
  };
});
