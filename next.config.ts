import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Next.js 的開發指示器預設在左下角，正好壓住側邊欄底部的主題切換與登出。
   * 它由框架繪製在我們的 React 樹之外，沒辦法放進 sidebar，只能選四個角落之一。
   * 右下角是編輯區與預覽區的交界，那裡沒有互動元件。
   * production build 本來就不會出現這個指示器。
   */
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
