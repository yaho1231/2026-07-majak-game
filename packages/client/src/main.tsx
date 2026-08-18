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

/*
 * 서비스워커 등록 (감사 §8-4).
 *
 * **왜 등록하는가**: 안드로이드의 "앱 설치" 배너는 매니페스트만으로 뜨지 않는다 —
 * fetch 핸들러를 가진 서비스워커가 있어야 설치 가능으로 판정한다. 설치하면
 * 주소창이 사라지고, 그 몇십 픽셀이 이 게임에서는 판의 세로 폭 그 자체다.
 *
 * **왜 `load` 뒤인가**: 등록은 첫 화면과 대역폭·CPU를 다툰다. 첫 방문에서 얻는
 * 것이 없는 작업이므로(캐시가 비어 있다) 그릴 것을 다 그린 뒤로 미룬다.
 *
 * 실패는 삼킨다. 서비스워커가 없어도 게임은 그대로 돌아간다 — 잃는 것은 설치
 * 배너와 두 번째 방문의 자산 캐시뿐이다. 안전하지 않은 컨텍스트(http://로 연
 * 원격 주소)에서는 API 자체가 없다.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("[sw] 등록하지 못했습니다 — 게임에는 지장이 없습니다:", err);
    });
  });
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
