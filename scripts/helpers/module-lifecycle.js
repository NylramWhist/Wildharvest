// Hook order of the module. Since 1.27.0 translations come from Foundry (game.i18n), so there is
// nothing to load at "i18nInit"; templates are loaded from "init" (main.js).
export function createModuleLifecycle({
  registerSettings,
  registerRulesSettingsMenu,
  registerSocketListeners,
  runReadyMaintenance,
  onInitComplete = () => {},
  onBackgroundError = () => {}
}) {
  function onInit() {
    registerSettings();
    registerRulesSettingsMenu();
    onInitComplete();
  }

  function onReady() {
    try {
      registerSocketListeners();
    } catch (error) {
      onBackgroundError("socket-registration", error);
    }

    void Promise.resolve()
      .then(() => runReadyMaintenance())
      .catch((error) => {
        onBackgroundError("ready-maintenance", error);
      });
  }

  return {
    onInit,
    onReady
  };
}
