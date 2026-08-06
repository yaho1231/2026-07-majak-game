import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { startUiScale } from "./uiScale.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root");
}

// 첫 렌더 전에 UI 배율을 걸어 둔다 — 뒤늦게 걸면 한 프레임 동안 깨진 배치가 보인다.
startUiScale();

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
