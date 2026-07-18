export function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

export function getDialogForm(dialog, button) {
  return button?.form ?? dialog?.element?.querySelector?.("form") ?? null;
}

let accessibleControlSequence = 0;

function getAccessibleControlId(control, prefix) {
  if (control.id) return control.id;
  accessibleControlSequence += 1;
  const normalizedPrefix = String(prefix ?? "control")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "control";
  control.id = `wildharvest-${normalizedPrefix}-${accessibleControlSequence}`;
  return control.id;
}

export function linkFormLabels(root, prefix = "dialog-control") {
  if (!root?.querySelectorAll) return 0;
  let linked = 0;

  for (const group of root.querySelectorAll(".form-group")) {
    const directLabels = [...group.children].filter((element) => (
      element?.matches?.("label:not([for])") && !element.querySelector?.("input, select, textarea")
    ));
    const directControls = [...group.children].filter((element) => (
      element?.matches?.("input:not([type='hidden']), select, textarea:not([hidden])")
    ));
    if (directLabels.length !== 1 || directControls.length !== 1) continue;

    directLabels[0].htmlFor = getAccessibleControlId(directControls[0], prefix);
    linked += 1;
  }

  return linked;
}

export function focusDialogControl(dialog, selectors) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of selectorList.filter(Boolean)) {
    const control = dialog?.element?.querySelector?.(selector);
    if (!control || control.disabled || control.hidden) continue;
    control.focus?.({ preventScroll: true });
    return true;
  }
  return false;
}

export function addWindowClasses(dialog, ...classNames) {
  const element = dialog?.element;
  if (!element) return;
  element.classList.add("wildharvest-window", ...classNames);
  linkFormLabels(element);
}

export function bringDialogToFront(dialog) {
  if (!dialog?.element?.isConnected) return false;
  dialog.bringToFront?.();
  focusDialogControl(dialog, [
    "[role='tab'][aria-selected='true']",
    "[autofocus]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex='0']"
  ]);
  return true;
}

export function isHtmlElement(value) {
  const HtmlElement = value?.ownerDocument?.defaultView?.HTMLElement;
  return Boolean(HtmlElement && value instanceof HtmlElement);
}
