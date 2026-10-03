// 1.27.0: every Workbench tab is its own ApplicationV2 part (templates/gm/tab-*.hbs). A refresh
// renders the active tab and the footer; a tab change also renders the tab bar and the tab left.
export const GM_CONTROL_PANEL_PARTS = Object.freeze({
  HEADER: "header",
  TABS: "tabs",
  LAUNCH: "launch",
  RESPONSES: "responses",
  PRESETS: "presets",
  HISTORY: "history",
  FOOTER: "footer"
});

export const GM_CONTROL_PANEL_TAB_PARTS = Object.freeze([
  GM_CONTROL_PANEL_PARTS.LAUNCH,
  GM_CONTROL_PANEL_PARTS.RESPONSES,
  GM_CONTROL_PANEL_PARTS.PRESETS,
  GM_CONTROL_PANEL_PARTS.HISTORY
]);

export function getGmControlPanelRenderParts({ navigation = false, activeTab = "", previousTab = "" } = {}) {
  const tabParts = [previousTab, activeTab]
    .filter((tab, index, list) => GM_CONTROL_PANEL_TAB_PARTS.includes(tab) && list.indexOf(tab) === index);
  if (!navigation) return [...tabParts.filter((tab) => tab === activeTab), GM_CONTROL_PANEL_PARTS.FOOTER];
  return [GM_CONTROL_PANEL_PARTS.TABS, ...tabParts, GM_CONTROL_PANEL_PARTS.FOOTER];
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
    const previousTab = renderedTab;
    const tabChanged = previousTab !== state.activeTab;
    renderedTab = state.activeTab;
    if (!application?.rendered) return Promise.resolve(application);
    return application.render({
      parts: getGmControlPanelRenderParts({
        navigation: navigation || tabChanged,
        activeTab: state.activeTab,
        previousTab: tabChanged ? previousTab : ""
      }),
      focusSelector
    }).catch((error) => {
      // The old tab may still be visible; the next refresh treats the tab as changed again.
      if (tabChanged && renderedTab === state.activeTab) renderedTab = previousTab;
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
