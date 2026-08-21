import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      /*
       * 두 번째 진입점 — 연출 점검 페이지(`/fx-showcase.html`).
       *
       * **게임 번들과 섞이지 않는다.** 별도 진입점이라 `index.html` 을 여는 사람은
       * 이 코드를 내려받지 않는다. 개발·점검용이므로 `noindex` 를 달아 두었고,
       * 연출을 다 확인하고 나면 진입점째로 지우면 된다.
       */
      input: {
        main: resolve(__dirname, "index.html"),
        showcase: resolve(__dirname, "fx-showcase.html"),
      },
    },
  },
});
