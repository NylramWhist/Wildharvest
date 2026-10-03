// 1.35.0: data for the chat message with a search result. Pure; no Foundry globals.
import { sortRewardsByValue } from "./result-view-core.js";

export const CHAT_RESULT_ITEM_LIMIT = 6;

// The most valuable stacks first (as in the result window), at most CHAT_RESULT_ITEM_LIMIT of them.
export function getChatResultItems(rewards, limit = CHAT_RESULT_ITEM_LIMIT) {
  const sorted = sortRewardsByValue(Array.isArray(rewards) ? rewards : []);
  return {
    shown: sorted.slice(0, Math.max(0, limit)).map((reward) => ({
      name: String(reward?.name ?? "").trim(),
      quantity: Number(reward?.quantity) || 1
    })),
    omitted: Math.max(0, sorted.length - Math.max(0, limit))
  };
}
