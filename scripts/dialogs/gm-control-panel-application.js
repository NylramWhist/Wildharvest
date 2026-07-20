import { focusDialogControl, linkFormLabels } from "./dialog-utils.js";
import { GM_CONTROL_PANEL_PARTS } from "./gm-control-panel-controller.js";
import { GM_CONTROL_PANEL_DEFAULT_SIZE } from "./gm-control-panel-layout-core.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const HandlebarsApplicationV2 = HandlebarsApplicationMixin(ApplicationV2);

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
      template: "modules/wildharvest/templates/gm-control-panel-header.hbs"
    },
    [GM_CONTROL_PANEL_PARTS.TABS]: {
      template: "modules/wildharvest/templates/gm-control-panel-tabs.hbs"
    },
    [GM_CONTROL_PANEL_PARTS.CONTENT]: {
      template: "modules/wildharvest/templates/gm-control-panel-content.hbs"
    },
    [GM_CONTROL_PANEL_PARTS.FOOTER]: {
      template: "modules/wildharvest/templates/gm-control-panel-footer.hbs"
    }
  };

  #state;
  #renderPart;
  #hasLiveSession;
  #handlers;

  constructor({ state, renderPart, hasLiveSession, handlers = {} }, options = {}) {
    super(options);
    this.#state = state;
    this.#renderPart = renderPart;
    this.#hasLiveSession = hasLiveSession;
    this.#handlers = handlers;
  }

  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    return {
      ...partContext,
      markup: this.#renderPart(partId, this.#state)
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

  async _onRender(context, options) {
    await super._onRender(context, options);
    const content = this.element?.querySelector?.(".window-content");
    content?.classList.toggle("wildharvest-gm-panel--has-live-session", Boolean(this.#hasLiveSession(this.#state)));
    linkFormLabels(this.element, "gm-control");
    if (options.focusSelector) focusDialogControl(this, options.focusSelector);
  }

  _onClose(options) {
    super._onClose(options);
    this.#handlers.close?.(this);
  }
}
