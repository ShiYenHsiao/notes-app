/**
 * 備註／重點框。
 *
 * 法律筆記真正需要標記的是四件事：這是考點、法院怎麼說、哪裡會扣分、我自己怎麼理解。
 * 通用筆記工具的「提示／警告／訣竅」套在這個情境上很勉強，所以這裡自己定四種。
 *
 * 語法沿用 GitHub 的 callout 形式（`> [!KEY]`），底層仍是 blockquote ——
 * 匯出到不認得這些類型的編輯器時會退回成引用，標記那一行以文字留著，讀得懂也不會壞。
 */

export type CalloutTag = "KEY" | "PRACTICE" | "PITFALL" | "INSIGHT";

export type CalloutPreset = {
  tag: CalloutTag;
  label: string;
  /** 選單上的第二行說明。寫的是用途，不是語法名稱。 */
  usage: string;
};

export const CALLOUTS: CalloutPreset[] = [
  { tag: "KEY", label: "重點", usage: "考點與結論" },
  { tag: "PRACTICE", label: "實務見解", usage: "判決、函釋、通說" },
  { tag: "PITFALL", label: "易錯提醒", usage: "會扣分的地方" },
  { tag: "INSIGHT", label: "自我理解", usage: "自己的話，不是權威來源" },
];

/** 預設那一個：⌘⇧M 直接插這個，不用先開選單。 */
export const DEFAULT_CALLOUT: CalloutTag = "KEY";

/** 產生要插進內文的區塊。游標會落在第二行的 `> ` 後面。 */
export function calloutBlock(tag: CalloutTag): string {
  return `> [!${tag}]\n> `;
}
