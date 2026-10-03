import { notifyError } from "../helpers/notification-utils.js";
import { renderModuleTemplate } from "../helpers/templates.js";
import { t } from "../i18n.js";
import {
  bringDialogToFront,
  focusDialogControl,
  getDialogForm
} from "./dialog-utils.js";

const DialogV2 = foundry.applications.api.DialogV2;
const GM_DIALOG_CLASSES = ["wildharvest-window", "wildharvest-window--gm", "wildharvest-window--gm-dialog"];

export function openConfigExportDialog(parentDialog, exportText) {
  const dialog = new DialogV2({
    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).
    classes: GM_DIALOG_CLASSES,
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.ExportConfigTitle")
    },
    content: renderModuleTemplate("wildharvest.configExport", {
      hint: t("WILDHARVEST.Dialog.ControlPanel.ExportConfigHint"),
      label: t("WILDHARVEST.Dialog.ControlPanel.ExportConfig"),
      text: exportText
    }),
    buttons: [
      {
        action: "close",
        label: t("WILDHARVEST.Dialog.Close"),
        default: true
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => {
    focusDialogControl(dialog, "textarea");
  }, { once: true });
  dialog.addEventListener("close", () => bringDialogToFront(parentDialog), { once: true });
  dialog.render({ force: true });
  return dialog;
}

function openConfigImportConfirmDialog(parentDialog, importDialog, rawText, onImport) {
  const dialog = new DialogV2({
    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).
    classes: GM_DIALOG_CLASSES,
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigConfirmTitle")
    },
    content: renderModuleTemplate("wildharvest.confirm", {
      prompt: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigConfirmPrompt")
    }),
    buttons: [
      {
        action: "confirm",
        label: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigConfirm"),
        icon: "fa-solid fa-file-import",
        default: true,
        callback: async () => {
          try {
            await onImport(rawText);
            ui.notifications.info(t("WILDHARVEST.Notifications.ConfigImported"));
            dialog.close();
            importDialog?.close();
            bringDialogToFront(parentDialog);
          } catch (error) {
            notifyError(error, "WILDHARVEST.Notifications.ConfigImportFailed");
          }
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel")
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("close", () => bringDialogToFront(importDialog), { once: true });
  dialog.render({ force: true });
  return dialog;
}

export function openConfigImportDialog(parentDialog, { onImport }) {
  if (typeof onImport !== "function") {
    throw new TypeError("Wildharvest config import requires an onImport callback.");
  }

  const dialog = new DialogV2({

    // 1.28.0: GM dialogs use the module tokens (styles/tokens.css).

    classes: GM_DIALOG_CLASSES,
    window: {
      title: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigTitle")
    },
    // The import window stays open until the confirmed import succeeds, so pasted JSON is kept.
    form: { closeOnSubmit: false },
    content: renderModuleTemplate("wildharvest.configImport", {
      hint: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigHint"),
      label: t("WILDHARVEST.Dialog.ControlPanel.ImportConfig"),
      placeholder: t("WILDHARVEST.Dialog.ControlPanel.ImportConfigPlaceholder")
    }),
    buttons: [
      {
        action: "import",
        label: t("WILDHARVEST.Dialog.ControlPanel.ImportConfig"),
        icon: "fa-solid fa-file-import",
        default: true,
        callback: async (_event, button, instance) => {
          try {
            const form = getDialogForm(instance, button) ?? instance.element;
            const textarea = form?.querySelector?.('[name="importConfigJson"]');
            const rawText = String(textarea?.value ?? "").trim();
            if (!rawText) {
              throw new Error(t("WILDHARVEST.Errors.ImportConfigEmpty"));
            }
            openConfigImportConfirmDialog(parentDialog, instance, rawText, onImport);
          } catch (error) {
            notifyError(error, "WILDHARVEST.Notifications.ConfigImportFailed");
          }
        }
      },
      {
        action: "cancel",
        label: t("WILDHARVEST.Dialog.Cancel"),
        callback: (_event, _button, instance) => instance.close()
      }
    ],
    rejectClose: false
  });

  dialog.addEventListener("render", () => {
    focusDialogControl(dialog, '[name="importConfigJson"]');
  }, { once: true });
  dialog.addEventListener("close", () => bringDialogToFront(parentDialog), { once: true });
  dialog.render({ force: true });
  return dialog;
}
