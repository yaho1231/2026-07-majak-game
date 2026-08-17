import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { blockContextMenu } from "./contextMenu.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { startUiScale } from "./uiScale.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root");
}

// 첫 렌더 전에 UI 배율을 걸어 둔다 — 뒤늦게 걸면 한 프레임 동안 깨진 배치가 보인다.
startUiScale();

// 우클릭은 게임 입력 몫이다 — 브라우저 기본 메뉴를 막는다 (글자 치는 칸은 예외).
blockContextMenu();

// 부팅 자체가 실패해도(모듈 평가 중 예외 등) 흰 화면 대신 뭔가는 보이게 한다.
// ErrorBoundary는 **렌더 중** 예외만 잡으므로, 그 바깥은 여기서 받는다.
window.addEventListener("error", (e) => {
  console.error("[window] 처리되지 않은 오류:", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[window] 처리되지 않은 Promise 거부:", e.reason);
});

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
