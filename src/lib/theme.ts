export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "notes-theme";

/**
 * 在任何畫面繪製之前就把主題 class 掛上去的腳本。
 *
 * 這段字串會直接內嵌在 <head>，同步執行。少了它，重新整理時會先閃一下
 * 系統主題的顏色再跳成使用者選的那個。
 *
 * 寫成字串是因為它必須在 React 接手之前就跑完 —— 這是少數該用
 * dangerouslySetInnerHTML 的正當場合。內容是寫死的常數，沒有注入風險。
 */
export const themeInitScript = `
(function () {
  try {
    var pref = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (pref === "light" || pref === "dark") {
      document.documentElement.classList.add(pref);
    }
  } catch (e) {
    // 無痕模式等情況讀不到 localStorage，那就退回跟隨系統。
  }
})();
`.trim();

/** 把偏好套到 <html> 上。system 就是把兩個 class 都拿掉，交還給媒體查詢。 */
export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  if (preference !== "system") {
    root.classList.add(preference);
  }
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // 讀不到就當作跟隨系統
  }
  return "system";
}

export function storeTheme(preference: ThemePreference) {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // 存不起來也不影響當下這一次切換
  }
}
