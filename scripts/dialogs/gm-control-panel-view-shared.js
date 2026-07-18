import { escapeHtml } from "./dialog-utils.js";

export const GM_UI_ASSETS = Object.freeze({
  controlPanel: "modules/wildharvest/assets/ui/icons/icon-control-panel.svg",
  launchScene: "modules/wildharvest/assets/ui/icons/icon-launch-scene.svg",
  responses: "modules/wildharvest/assets/ui/icons/icon-responses.svg",
  presets: "modules/wildharvest/assets/ui/icons/icon-presets.svg",
  history: "modules/wildharvest/assets/ui/icons/icon-history.svg",
  activity: "modules/wildharvest/assets/ui/icons/icon-activity.svg",
  skill: "modules/wildharvest/assets/ui/icons/icon-skill.svg",
  lootPool: "modules/wildharvest/assets/ui/icons/icon-loot-pool.svg",
  sendTo: "modules/wildharvest/assets/ui/icons/icon-send-to.svg",
  description: "modules/wildharvest/assets/ui/icons/icon-description.svg",
  completed: "modules/wildharvest/assets/ui/icons/icon-completed.svg",
  pending: "modules/wildharvest/assets/ui/icons/icon-pending.svg",
  joined: "modules/wildharvest/assets/ui/icons/icon-joined.svg",
  closed: "modules/wildharvest/assets/ui/icons/icon-closed.svg",
  reminder: "modules/wildharvest/assets/ui/icons/icon-reminder.svg",
  rewards: "modules/wildharvest/assets/ui/icons/icon-rewards.svg",
  testRoll: "modules/wildharvest/assets/ui/icons/icon-test-roll.svg",
  closeScene: "modules/wildharvest/assets/ui/icons/icon-close-scene.svg"
});

export function renderGmIcon(iconPath, className = "wildharvest-gm-icon", alt = "") {
  if (!iconPath) return "";
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(iconPath)}" alt="${escapeHtml(alt)}">`;
}

export function renderGmLabel(iconPath, label) {
  return `${renderGmIcon(iconPath, "wildharvest-gm-label__asset")}<span>${escapeHtml(label)}</span>`;
}
