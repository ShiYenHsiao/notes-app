/**
 * 從內文抽出標題大綱。
 *
 * 一篇刑法總論兩三千字、標題五層深，捲動找章節比什麼都慢。大綱面板要的就是這份清單。
 *
 * **從原始碼解析而不是從渲染結果掃 DOM**：只看編輯的模式下右邊根本沒有預覽區，
 * 但那時候更需要跳章節。代價是這裡必須跟 CommonMark 的判斷一致 —— 下面每一條
 * 規則都是為了這個。
 */

export type OutlineItem = {
  /** 1–6，對應 h1–h6。 */
  level: number;
  text: string;
  /** 在內文裡的行號，從 1 起算。點大綱時編輯器跳到這裡。 */
  line: number;
  /** 第幾個標題（從 0 起算）。預覽區的錨點用這個對應。 */
  index: number;
};

/*
 * ATX 標題：行首最多三個空白、一到六個 `#`、然後**必須有空白**。
 *
 * 「必須有空白」這條對中文使用者特別重要：`#標題` 在 CommonMark 裡是普通段落，
 * 預覽也不會變成標題。大綱如果收了它，點下去會跳到一個看起來不是標題的地方。
 *
 * 結尾的 `#` 是選用的收尾記號（`## 標題 ##`），不算內容。
 */
const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/** 圍欄的開頭與結尾。四個空白以上就是縮排程式碼區塊，本來就不會匹配上面的 ATX。 */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let fence: string | null = null;

  content.split("\n").forEach((text, offset) => {
    const fenceMark = FENCE.exec(text)?.[1];

    if (fenceMark) {
      if (fence === null) {
        fence = fenceMark;
        return;
      }
      // 結尾的圍欄要同一種符號、而且不能比開頭短
      if (fenceMark[0] === fence[0] && fenceMark.length >= fence.length) {
        fence = null;
      }
      return;
    }

    // 圍欄裡的 `# 註解` 不是標題
    if (fence !== null) {
      return;
    }

    const heading = ATX.exec(text);
    if (!heading) {
      return;
    }

    const title = heading[2].trim();
    if (!title) {
      return; // 空標題沒有東西可以點
    }

    items.push({
      level: heading[1].length,
      text: title,
      line: offset + 1,
      index: items.length,
    });
  });

  return items;
}

/** 預覽區給每個標題掛的 id，跟 OutlineItem.index 對應。 */
export function headingAnchorId(index: number): string {
  return `nexum-heading-${index}`;
}
