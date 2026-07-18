import { t } from "../i18n.js";
import {
  getRewardPackLabel
} from "../settings.js";

export function getRewardDisplayName(reward) {
  const explicitName = String(reward?.name ?? "").trim();
  if (explicitName) return explicitName;

  const pack = String(reward?.pack ?? "").trim();
  const documentId = String(reward?.documentId ?? "").trim();
  const uuid = String(reward?.uuid ?? "").trim();
  const packLabel = getRewardPackLabel(pack);

  if (pack && documentId) {
    return t("WILDHARVEST.Reward.CompendiumDocument", {
      pack: packLabel,
      documentId
    });
  }

  if (pack) {
    return t("WILDHARVEST.Reward.RandomCompendium", { pack: packLabel });
  }

  if (uuid) {
    return t("WILDHARVEST.Reward.UuidReference", { uuid });
  }

  return t("WILDHARVEST.Reward.Unnamed");
}

export function getRewardStackText(reward) {
  return `${getRewardDisplayName(reward)} x${String(reward?.quantity ?? 1)}`;
}

export function getRewardPreviewText(reward) {
  if (reward?.pack && !reward?.documentId && !reward?.uuid) {
    return t("WILDHARVEST.Reward.RandomPreview", {
      pack: getRewardPackLabel(reward.pack),
      quantity: String(reward.quantity ?? 1),
      draws: String(reward.draws ?? 1)
    });
  }

  return `${getRewardDisplayName(reward)} (${String(reward?.quantity ?? 1)})`;
}
