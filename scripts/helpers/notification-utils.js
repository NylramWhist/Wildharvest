import { MODULE_ID } from "../constants.js";
import { t } from "../i18n.js";

export function getErrorMessage(error, fallbackKey = "WILDHARVEST.Notifications.ActionFailed") {
  const message = String(error?.message ?? "").trim();
  return message || t(fallbackKey);
}

export function notifyError(error, fallbackKey = "WILDHARVEST.Notifications.ActionFailed", logContext = "") {
  if (logContext) {
    console.error(`${MODULE_ID} | ${logContext}`, error);
  } else {
    console.error(error);
  }

  ui.notifications?.error(getErrorMessage(error, fallbackKey));
}
