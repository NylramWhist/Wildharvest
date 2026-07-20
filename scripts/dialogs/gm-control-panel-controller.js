export const GM_CONTROL_PANEL_PARTS = Object.freeze({
  HEADER: "header",
  TABS: "tabs",
  CONTENT: "content",
  FOOTER: "footer"
});

const CONTENT_RENDER_PARTS = Object.freeze([
  GM_CONTROL_PANEL_PARTS.CONTENT,
  GM_CONTROL_PANEL_PARTS.FOOTER
]);

const NAVIGATION_RENDER_PARTS = Object.freeze([
  GM_CONTROL_PANEL_PARTS.TABS,
  ...CONTENT_RENDER_PARTS
]);

export function getGmControlPanelRenderParts({ navigation = false } = {}) {
  return [...(navigation ? NAVIGATION_RENDER_PARTS : CONTENT_RENDER_PARTS)];
}

export function createGmControlPanelController({
  state,
  normalizeState,
  subscribeToSessions,
  onRenderError = null
}) {
  let application = null;
  let unsubscribe = () => {};
  let renderedTab = null;

  function refresh({ focusSelector = "", navigation = false } = {}) {
    normalizeState(state);
    state.lastRefreshedAt = Date.now();
    const tabChanged = renderedTab !== state.activeTab;
    renderedTab = state.activeTab;
    if (!application?.rendered) return Promise.resolve(application);
    return application.render({
      parts: getGmControlPanelRenderParts({ navigation: navigation || tabChanged }),
      focusSelector
    }).catch((error) => {
      onRenderError?.(error);
      return application;
    });
  }

  function update(changes, options = {}) {
    Object.assign(state, changes);
    return refresh(options);
  }

  function activateTab(tabId, { focus = false } = {}) {
    state.activeTab = String(tabId ?? "").trim() || state.activeTab;
    return refresh({
      navigation: true,
      focusSelector: focus ? `[data-gm-tab="${state.activeTab}"]` : ""
    });
  }

  function connect(nextApplication) {
    if (application === nextApplication) return;
    unsubscribe?.();
    application = nextApplication;
    renderedTab = state.activeTab;
    unsubscribe = subscribeToSessions((sessions) => {
      state.sessions = sessions;
      void refresh();
    });
  }

  function disconnect() {
    unsubscribe?.();
    unsubscribe = () => {};
    application = null;
    renderedTab = null;
  }

  return Object.freeze({
    state,
    activateTab,
    connect,
    disconnect,
    refresh,
    update
  });
}
