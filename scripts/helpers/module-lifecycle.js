export function createModuleLifecycle({
  registerSettings,
  registerRulesSettingsMenu,
  preloadTranslations,
  registerSocketListeners,
  runReadyMaintenance,
  onInitComplete = () => {},
  onBackgroundError = () => {}
}) {
  let translationsReady = Promise.resolve();

  function onInit() {
    registerSettings();
    registerRulesSettingsMenu();
    onInitComplete();
  }

  function onI18nInit() {
    translationsReady = Promise.resolve()
      .then(() => preloadTranslations())
      .catch((error) => {
        onBackgroundError("translations", error);
      });
  }

  function onReady() {
    try {
      registerSocketListeners();
    } catch (error) {
      onBackgroundError("socket-registration", error);
    }

    void translationsReady
      .then(() => runReadyMaintenance())
      .catch((error) => {
        onBackgroundError("ready-maintenance", error);
      });
  }

  return {
    onInit,
    onI18nInit,
    onReady,
    waitForTranslations: () => translationsReady
  };
}
