import { MODULE_ID } from "./constants.js";
import {
  closeGmControlPanelIfInactive,
  refreshGmControlPanelPlayers,
  openGmControlPanel
} from "./dialogs/gm-control-panel-dialog.js";
import { registerRulesSettingsMenu } from "./dialogs/rules-settings-menu.js";
import {
  handleActiveGmChange,
  handlePlayerRequestDocumentUpdate,
  initializeSearchSessions,
  isCurrentUserPrimaryGm,
  processPendingPlayerRequests,
  registerSocketListeners,
  startGmPresence
} from "./dialogs/search-offer-dialogs.js";
import { isActiveGmUser } from "./helpers/active-gm-core.js";
import { emitSearchSessionSync } from "./helpers/search-session-socket.js";
import {
  deleteMigrationBackups,
  getMigrationBackups,
  pruneMigrationBackups,
  restoreMigrationBackup
} from "./helpers/migration-backup.js";
import { createModuleLifecycle } from "./helpers/module-lifecycle.js";
import { clearSearchCompendiumCache } from "./helpers/search-engine.js";
import { t } from "./i18n.js";
import { preloadModuleTemplates } from "./helpers/templates.js";
import { migrateModuleData, registerSettings } from "./settings.js";

async function runReadyMaintenance() {
  if (!game.user.isGM) return;
  const activeGm = game.users?.activeGM;
  if (!isActiveGmUser(game.user, activeGm)) {
    initializeSearchSessions();
    return;
  }

  // Another window may already be logged in as this GM; only the oldest one migrates and handles requests (A9).
  await startGmPresence();
  if (!isCurrentUserPrimaryGm()) {
    initializeSearchSessions();
    return;
  }

  // Migrate before scenes are loaded into memory, so the active GM never writes
  // the old scene format back over the migrated setting.
  let migrationResult = null;
  try {
    migrationResult = await migrateModuleData();
  } catch (error) {
    console.error(`${MODULE_ID} | Data migration failed; stored data version left unchanged.`, error);
    ui.notifications?.error(t("WILDHARVEST.Notifications.MigrationFailed"), { permanent: true });
  }
  try {
    await pruneMigrationBackups();
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to remove older data backups.`, error);
  }
  initializeSearchSessions();
  if (migrationResult?.changed) {
    console.info(
      `${MODULE_ID} | Data migration completed.`,
      migrationResult
    );
    emitSearchSessionSync();
  }
  await processPendingPlayerRequests();
}

const lifecycle = createModuleLifecycle({
  registerSettings,
  registerRulesSettingsMenu,
  registerSocketListeners,
  runReadyMaintenance,
  onInitComplete: () => console.log(`${MODULE_ID} | init`),
  onBackgroundError: (phase, error) => {
    console.warn(`${MODULE_ID} | Failed during ${phase}.`, error);
  }
});

Hooks.once("init", lifecycle.onInit);
// Templates load in the background from "init"; windows open only after "ready".
Hooks.once("init", () => {
  void preloadModuleTemplates().catch(() => {});
});


Hooks.once("setup", () => {
  const activeModule = game.modules.get(MODULE_ID);
  if (!activeModule) return;

  activeModule.api = Object.freeze({
    apiVersion: 1,
    openControlPanel: openGmControlPanel,
    getMigrationBackups,
    // 1.22.0: GM-only; restore needs { confirm: true } and a reload of the world afterwards.
    restoreMigrationBackup,
    deleteMigrationBackups
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

// Foundry has no createCompendium/deleteCompendium client hooks; a removed pack
// simply stops resolving through game.packs, so only metadata updates matter here.
Hooks.on("updateCompendium", (pack) => clearSearchCompendiumCache(getCompendiumPackId(pack)));

for (const hookName of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hookName, (item) => {
    const packId = getCompendiumPackId(item);
    if (packId) clearSearchCompendiumCache(packId);
  });
}


Hooks.on(`${MODULE_ID}.dataRestored`, () => {
  initializeSearchSessions();
  emitSearchSessionSync();
  ui.notifications?.warn(t("WILDHARVEST.Notifications.BackupRestored"), { permanent: true });
});

Hooks.on("updateUser", (user, changes, options, userId) => {
  void Promise.resolve().then(() => {
    closeGmControlPanelIfInactive();
    handleActiveGmChange();
    handlePlayerRequestDocumentUpdate(user, changes, options, userId);
  });
});

Hooks.on("userConnected", () => refreshGmControlPanelPlayers());

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
