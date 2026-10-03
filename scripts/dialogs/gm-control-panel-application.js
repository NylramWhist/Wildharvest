import { focusDialogControl, linkFormLabels } from "./dialog-utils.js";
import { GM_CONTROL_PANEL_PARTS } from "./gm-control-panel-controller.js";
import { GM_CONTROL_PANEL_DEFAULT_SIZE } from "./gm-control-panel-layout-core.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const HandlebarsApplicationV2 = HandlebarsApplicationMixin(ApplicationV2);

// Attributes that identify a control again after its part is redrawn (1.31.0).
const FOCUS_KEY_ATTRIBUTES = [
  "data-gm-tab", "data-action", "data-filter-id", "data-preset-id", "data-session-id", "data-entry-key",
  "data-actor-id", "data-entry-user-id", "data-recipient-id", "name"
];

// Selector for the focused control when a redraw of its part would otherwise drop the focus.
function getFocusRestoreSelector(root, parts) {
  const focused = globalThis.document?.activeElement;
  if (!root || !focused || focused === root || !root.contains(focused)) return "";
  const partId = focused.closest?.("[data-application-part]")?.dataset?.applicationPart;
  if (partId && Array.isArray(parts) && !parts.includes(partId)) return "";
  const attributes = FOCUS_KEY_ATTRIBUTES
    .filter((name) => focused.hasAttribute(name))
    .map((name) => `[${name}="${CSS.escape(focused.getAttribute(name))}"]`);
  return attributes.length ? `${focused.tagName.toLowerCase()}${attributes.join("")}` : "";
}

export class GmControlPanelApplication extends HandlebarsApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "wildharvest-gm-control-panel",
    classes: ["wildharvest-window", "wildharvest-window--gm"],
    position: {
      ...GM_CONTROL_PANEL_DEFAULT_SIZE
    },
    window: {
      frame: true,
      resizable: true,
      contentClasses: ["wildharvest-dialog", "wildharvest-gm-panel"]
    }
  };

  static PARTS = {
    [GM_CONTROL_PANEL_PARTS.HEADER]: {
      template: "modules/wildharvest/templates/gm/header.hbs"
    },
    [GM_CONTROL_PANEL_PARTS.TABS]: {
      template: "modules/wildharvest/templates/gm/tabs.hbs"
    },
    [GM_CONTROL_PANEL_PARTS.LAUNCH]: {
      template: "modules/wildharvest/templates/gm/tab-launch.hbs",
      // Keeps the scroll position of the tab when a live update redraws it.
      scrollable: [""]
    },
    [GM_CONTROL_PANEL_PARTS.RESPONSES]: {
      template: "modules/wildharvest/templates/gm/tab-responses.hbs",
      // Keeps the scroll position of the tab when a live update redraws it.
      scrollable: [""]
    },
    [GM_CONTROL_PANEL_PARTS.PRESETS]: {
      template: "modules/wildharvest/templates/gm/tab-presets.hbs",
      // Keeps the scroll position of the tab when a live update redraws it.
      scrollable: [""]
    },
    [GM_CONTROL_PANEL_PARTS.HISTORY]: {
      template: "modules/wildharvest/templates/gm/tab-history.hbs",
      // Keeps the scroll position of the tab when a live update redraws it.
      scrollable: [""]
    },
    [GM_CONTROL_PANEL_PARTS.FOOTER]: {
      template: "modules/wildharvest/templates/gm/footer.hbs"
    }
  };

  #state;
  #preparePart;
  #handlers;

  constructor({ state, preparePart, handlers = {} }, options = {}) {
    super(options);
    this.#state = state;
    this.#preparePart = preparePart;
    this.#handlers = handlers;
  }

  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    return {
      ...partContext,
      ...this.#preparePart(partId, this.#state)
    };
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if (typeof this.#handlers.keydown === "function") {
      this.element.addEventListener("keydown", (event) => this.#handlers.keydown(event, this));
    }
    if (typeof this.#handlers.click === "function") {
      this.element.addEventListener("click", (event) => this.#handlers.click(event, this));
    }
    if (typeof this.#handlers.change === "function") {
      this.element.addEventListener("change", (event) => this.#handlers.change(event, this));
    }
    this.#handlers.firstRender?.(this);
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    // Keyboard users keep their place when a click or a live update redraws the tab (1.31.0).
    if (!options.focusSelector) options.focusSelector = getFocusRestoreSelector(this.element, options.parts);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    linkFormLabels(this.element, "gm-control");
    if (options.focusSelector && focusDialogControl(this, options.focusSelector)) {
      const focused = globalThis.document?.activeElement;
      if (focused?.matches?.("input[type='search'], input[type='text']")) {
        focused.setSelectionRange?.(focused.value.length, focused.value.length);
      }
    }
  }

  _onClose(options) {
    super._onClose(options);
    this.#handlers.close?.(this);
  }
}
