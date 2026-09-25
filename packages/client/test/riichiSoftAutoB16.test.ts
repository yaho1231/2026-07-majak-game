/**
 * B16 — 리치 중 소프트 자동 쯔모기리 (2026-09-25, docs/59 U52).
 *
 * 서버는 리치 중 후보가 쯔모기리 하나뿐일 때만 대신 버린다(FlowController `auto`). 승부수처럼
 * 리치 내내 서는 선택형 액티브가 끼면 그 자동이 꺼져 매 순 직접 눌러야 했다. 클라가 잠시 뒤
 * 쯔모기리를 대신 보내되, 사람이 손을 대면 걷는다.
 *
 * AutoRespondBeat 와 같은 정적 소스 스캔 — 소켓·타이머·React 상태가 얽힌 배관이다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");
const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");

/** 주석을 걷어낸 코드만 — 주석에 적힌 말이 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `${start} 가 없다`).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(end, a + start.length);
  expect(b, `${end} 가 없다`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("B16 소프트 자동 조건 (riichiSoftAutoOption)", () => {
  const fn = between(APP_CODE, "function riichiSoftAutoOption(", "\n}\n");

  it("내 프롬프트이고 내가 리치 중일 때만", () => {
    expect(fn).toContain("p.player !== view.playerId");
    expect(fn).toMatch(/view\.round\.byPlayer\[view\.playerId\]\?\.riichiDeclared !== true\) return null/);
  });

  it("버림 후보는 쯔모패 한 장뿐이어야 한다", () => {
    expect(fn).toContain("view.round.myDrawnTile");
    expect(fn).toMatch(/if \(discard !== null \|\| \(o\.payload as \{ tileId\?: unknown \}\)\?\.tileId !== drawn\) return null;/);
  });

  it("나머지는 전부 액티브 증강 — 버릴 패를 바꾸는 증강(DRAG)·화료·깡·구종구패는 멈춘다", () => {
    expect(fn).toMatch(/!AUGMENT_ACTION_TYPES\.has\(o\.type\) \|\| !RIICHI_SOFT_AUTO_OK_TYPES\.has\(o\.type\)\) return null/);
    // 화료·깡·구종구패가 액티브 증강 집합에 섞여 들어오면 위 판정이 그걸 자동으로 흘려보낸다
    const set = between(APP_CODE, "const AUGMENT_ACTION_TYPES = new Set([", "]);");
    for (const t of ["win", "ankan", "shouminkan", "kyushuKyuhai", "discard"]) {
      expect(set).not.toContain(`"${t}"`);
    }
    // 손바닥 뒤집기는 쯔모패가 대기를 바꿀 때만 뜨는 의미 있는 결정이다
    expect(between(APP_CODE, "const DRAG_DISCARD_ARM_TYPES = new Set([", "]);")).toContain('"flip_riichi"');
  });

  it("멈춤 목록이 아니라 허용 목록이다 — bloom_pick·DRAG 계열은 목록 밖이라 멈춘다 (리뷰 라운드 2 · W4 통합 리뷰)", () => {
    // 절벽 위 꽃: 리치 중 안깡 → 영상 쯔모에 bloom_pick 넷이 붙고 선택 창이 스스로 뜬다.
    // 2초 뒤 영상패를 버리면 고를 기회(영상개화 포함)가 사라진다.
    expect(APP_CODE).not.toContain("RIICHI_SOFT_AUTO_STOP_TYPES");
    const ok = between(APP_CODE, "const RIICHI_SOFT_AUTO_OK_TYPES: ReadonlySet<string> = new Set([", "]);");
    expect(ok).not.toContain('"bloom_pick"');
    for (const t of between(APP_CODE, "const DRAG_DISCARD_ARM_TYPES = new Set([", "]);").match(/"[a-z_]+"/g) ?? []) {
      expect(ok).not.toContain(t);
    }
  });

  it("자물쇠(격에 막힌 화료)·강제 선택이 있으면 걸지 않는다", () => {
    expect(fn).toMatch(/\(p\.locked\?\.length \?\? 0\) > 0 \|\| isForcedPickPrompt\(p\)\) return null/);
  });

  it("증강 후보가 없으면(서버 auto 몫) 걸지 않는다", () => {
    expect(fn).toContain("return augs > 0 ? discard : null;");
  });
});

describe("B16 예약 — 자동응답과 같은 타이머 맵을 쓰고 프롬프트는 띄워 둔다", () => {
  const fn = between(APP_CODE, "function tryRiichiSoftAuto(", "function tryAutoRespond(");

  it("튜토리얼·증강 테스트·관전에서는 걸지 않는다", () => {
    expect(fn).toMatch(/if \(coachOnRef\.current \|\| sandboxRef\.current !== null \|\| spectatingRef\.current\) return;/);
  });

  it("scheduleAutoRespond 로 RIICHI_SOFT_AUTO_MS 뒤에 보낸다 (cancelAutoRespond 공유)", () => {
    expect(fn).toContain("scheduleAutoRespond(");
    expect(fn).toContain("RIICHI_SOFT_AUTO_MS,");
    expect(APP_CODE).toMatch(/const scheduleAutoRespond = \(seat: string, fire: \(\) => void, ms: number = AUTO_RESPOND_MS\): void/);
    const ms = /const RIICHI_SOFT_AUTO_MS = ([\d_]+);/.exec(APP);
    expect(ms).not.toBeNull();
    const n = Number((ms?.[1] ?? "0").replace(/_/g, ""));
    // 1.5~2초 — 자동응답 한 박자(1초)보다 길고, 초읽기 유예(10초) 안이라 은행이 깎이지 않는다
    expect(n).toBeGreaterThanOrEqual(1500);
    expect(n).toBeLessThanOrEqual(2000);
  });

  it("예약 시점에는 프롬프트를 접지 않는다 — 전송에 성공했을 때만 접는다", () => {
    expect(fn).not.toMatch(/^\s*dropPrompt\(/m);
    expect(fn).toContain("if (send({ type: \"action\", actionType: disc.type, payload: disc.payload, seat })) dropPrompt(seat);");
  });

  it("끊겨 있으면 소리·진동·토스트 없이 프롬프트만 남긴다 (리뷰 라운드 2)", () => {
    // (W4 수정 커밋 리뷰) 끊겨 멈춘 것도 «자동 멈춤»으로 보인다 — 가드가 블록이 됐다
    const guard = fn.indexOf("if (wsRef.current?.readyState !== WebSocket.OPEN) {");
    expect(guard).toBeGreaterThan(0);
    expect(fn.indexOf("sfx.discard();")).toBeGreaterThan(guard);
    expect(fn.indexOf("haptics.discard();")).toBeGreaterThan(guard);
    expect(fn.indexOf("rememberOwnDiscard(disc.payload);")).toBeGreaterThan(guard);
  });

  it("프롬프트 수신부가 새 프롬프트마다 낡은 것을 걷고, 그린 뒤에 건다", () => {
    const at = APP_CODE.indexOf('if (msg.type === "prompt") {');
    const end = APP_CODE.indexOf('if (msg.type === "promptCancel") {', at);
    const body = APP_CODE.slice(at, end);
    const cancel = body.indexOf("cancelRiichiSoftAuto(msg.prompt.player);");
    const auto = body.indexOf("if (tryAutoRespond(msg.prompt, settingsRef.current))");
    const shown = body.indexOf("setPrompts((prev) => ({ ...prev, [msg.prompt.player]: msg.prompt }));");
    const soft = body.indexOf("tryRiichiSoftAuto(msg.prompt);");
    expect(cancel).toBeGreaterThan(0);
    expect(auto).toBeGreaterThan(cancel);
    // 자동버림이 먼저 받아 가면(return) 소프트 자동은 걸리지 않는다 — 중복 예약 없음
    expect(soft).toBeGreaterThan(shown);
    expect(soft).toBeGreaterThan(auto);
  });
});

describe("B16 취소 — 손이 닿으면 소프트 자동만 걷는다", () => {
  it("cancelRiichiSoftAuto 는 자기 타이머일 때만 cancelAutoRespond 를 부른다", () => {
    const fn = between(APP_CODE, "const cancelRiichiSoftAuto = (seat?: string): void => {", "\n  };");
    expect(fn).toContain("if (autoRespondTimers.current.get(soft.seat) === soft.timer) cancelAutoRespond(soft.seat);");
  });

  it("cancelAutoRespond(promptCancel·방 나가기)가 소프트 자동 표시도 함께 걷는다", () => {
    const fn = between(APP_CODE, "const cancelAutoRespond = (seat?: string): void => {", "\n  };");
    expect(fn).toContain("riichiSoftAutoRef.current = null;");
    expect(fn).toContain("setRiichiSoftAutoAt(null);");
  });

  it("사람이 직접 고르면(submitOption) 걷는다", () => {
    const fn = between(APP_CODE, "function submitOption(option: ActionOption): boolean", "const sent = send(");
    expect(fn).toContain("cancelRiichiSoftAuto(seat);");
  });

  it("누르기·키·✦/액션 바 hover 를 문서 전체에서 캡처로 본다", () => {
    const fx = between(APP_CODE, "if (riichiSoftAutoAt === null) return;", "}, [riichiSoftAutoAt]);");
    expect(fx).toContain('document.addEventListener("pointerdown", stop, true);');
    expect(fx).toContain('document.addEventListener("keydown", onKey, true);');
    expect(fx).toContain('document.addEventListener("pointerover", onOver, true);');
    expect(fx).toContain('t.closest(".aug-btn, .aug-menu, .action-bar")');
    expect(fx).toContain("RIICHI_SOFT_AUTO_HOVER_GRACE_MS");
    // 정리는 넷 + 틈이 끝날 때 떼는 움직임(pointermove) 하나
    expect(fx.match(/document\.removeEventListener\(/g)?.length).toBe(5);
    expect(fx).toContain("window.clearTimeout(graceEnd);");
  });

  it("틈 동안 움직여 ✦·액션 바 위에 멈춘 포인터는 틈이 끝날 때 걷는다 (리뷰 라운드 1)", () => {
    const fx = between(APP_CODE, "if (riichiSoftAutoAt === null) return;", "}, [riichiSoftAutoAt]);");
    expect(fx).toContain('document.addEventListener("pointermove", onMove, true);');
    expect(fx).toMatch(
      /if \(movedInGrace && document\.querySelector\("\.aug-btn:hover, \.aug-menu:hover, \.action-bar:hover"\) !== null\) stop\(\);/,
    );
  });

  it("✦ 메뉴가 열려 있거나 무장이 남아 있으면(안내 줄·왕패 도킹) 곧바로 걷는다 (리뷰 라운드 1·2)", () => {
    const fx = between(APP_CODE, "if (riichiSoftAutoAt === null) return;", "}, [riichiSoftAutoAt]);");
    expect(fx).toMatch(/if \(document\.querySelector\(RIICHI_SOFT_AUTO_BUSY_SELECTOR\) !== null\) \{\s*stop\(\);\s*return;\s*\}/);
    expect(APP_CODE).toContain('const RIICHI_SOFT_AUTO_BUSY_SELECTOR = ".aug-menu, .arm-hint, .dw-dock, .rinshan-pick-overlay";');
  });

  it("재입장(joined)은 떠 있던 프롬프트와 함께 걸린 자동응답도 걷는다 (리뷰 라운드 1)", () => {
    const at = APP_CODE.indexOf('if (msg.type === "joined") {');
    const body = APP_CODE.slice(at, APP_CODE.indexOf("return;", at));
    expect(body).toMatch(/setPrompts\(\{\}\);\s*cancelAutoRespond\(\);/);
  });
});

describe("B16 설정 — «리치 중 자동 쯔모기리» (기본 켬)", () => {
  it("설정 키가 있고 기본은 켜짐, 끄면 걸지 않는다", () => {
    expect(APP_CODE).toMatch(/\n  riichiSoftAuto: boolean;/);
    expect(between(APP_CODE, "const DEFAULT_SETTINGS: Settings = {", "\n};")).toContain("riichiSoftAuto: true,");
    const fn = between(APP_CODE, "function tryRiichiSoftAuto(", "function tryAutoRespond(");
    expect(fn).toContain("if (!settingsRef.current.riichiSoftAuto) return;");
  });

  it("설정 창에 스위치가 있다", () => {
    const panel = between(APP_CODE, "function SettingsPanel(", "const votes = ");
    expect(panel).toMatch(/key: "riichiSoftAuto",\s*label: "리치 중 자동 쯔모기리",/);
  });
});

describe("B16 표시 — 쯔모패 위 게이지", () => {
  it("App → GameTable → OwnArea 로 걸린 시각을 넘기고 쯔모패에만 그린다", () => {
    expect(APP_CODE).toContain("riichiSoftAutoAt={riichiSoftAutoAt}");
    expect(APP_CODE).toContain("riichiSoftAutoAt={props.riichiSoftAutoAt ?? null}");
    expect(APP_CODE).toMatch(
      /isDrawn && myPrompt !== null && !isSpectator && props\.riichiSoftAutoAt != null \? \(\s*<span\s*key=\{props\.riichiSoftAutoAt\}\s*className="hand-soft-auto"/,
    );
    expect(APP_CODE).toContain('"--soft-auto-ms": `${RIICHI_SOFT_AUTO_MS}ms`');
  });

  it("게이지는 --soft-auto-ms 동안 한 번 줄어든다", () => {
    expect(CSS).toMatch(/\.hand-soft-auto \{[^}]*animation: soft-auto-drain var\(--soft-auto-ms, 2000ms\) linear forwards;/);
    expect(CSS).toMatch(/@keyframes soft-auto-drain \{\s*from \{ transform: scaleX\(1\); \}\s*to \{ transform: scaleX\(0\); \}/);
  });
});

describe("W4 수정 커밋 리뷰 — 허용 목록 안이라도 이번 순에 묶이면 멈춘다", () => {
  const fn = between(APP_CODE, "function riichiSoftAutoOption(", "\n}\n");
  const list = between(APP_CODE, "const RIICHI_SOFT_AUTO_OK_TYPES", "]);");

  it("일확천금은 첫 순 한정이라 목록에서 뺐다(리치 중에는 설 수 없다)", () => {
    expect(list).not.toContain('"jackpot_roll"');
    // 결정적 액티브는 목록에 없다(fail-closed)
    for (const t of ["grave_rob", "alchemy", "tile_dye", "rinshan_arrange", "foresight_order", "bloom_pick", "copy_take", "greed_use", "conjure_tsumo"]) {
      expect(list, t).not.toContain(`"${t}"`);
    }
  });

  it("스파이 후보가 쯔모패 자체면 멈춘다 — 그 종류가 손에 한 장뿐이다", () => {
    expect(fn).toMatch(/o\.type === "spy_mark" && \(o\.payload as \{ tileId\?: unknown \}\)\?\.tileId === drawn\) return null;/);
  });

  it("밑장빼기가 이번 순의 결정(밑장이 대기패·패산 4장 이하)이면 멈춘다", () => {
    expect(fn).toContain('if (o.type === "bottom_deal" && bottomDealDecisive(view, drawn)) return null;');
    const dec = between(APP_CODE, "function bottomDealDecisive(", "\n}\n");
    expect(dec).toMatch(/visible\.length \+ \(wall\?\.hiddenCount \?\? 0\) <= 4\) return true;/);
    expect(dec).toContain("visible[visible.length - 1]");
    expect(dec).toContain("winningKinds(");
    // 셀 수 없으면 결정으로 본다
    expect(dec).toMatch(/catch \{\s*return true;\s*\}/);
  });

  it("멈춘 경로에도 «자동 멈춤» 표시를 남긴다 — 같은 순 재무장 금지·끊김", () => {
    const tr = between(APP_CODE, "function tryRiichiSoftAuto(", "\n  }\n");
    expect(tr).toMatch(/riichiSoftAutoHandTurnRef\.current === turnKey\) \{\s*setRiichiSoftAutoStopped\(true\);\s*return;/);
    expect(tr).toMatch(/readyState !== WebSocket\.OPEN\) \{\s*setRiichiSoftAutoStopped\(true\);\s*return;/);
  });

  it("관리자 일시정지는 소프트 자동을 걷는다", () => {
    const pause = between(APP_CODE, 'msg.type === "gamePaused"', "pausedAt.current =");
    expect(pause).toContain("cancelRiichiSoftAuto();");
  });

  it("왕패의 주인 큐의 순 경계는 turnCount 에 내 버림 수를 붙여 판정한다", () => {
    expect(APP_CODE).toContain("const dwTurnKey = `${view.round.turnCount}|${view.zones[`discards:${view.playerId}`]?.tileIds.length ?? 0}`;");
    expect(APP_CODE).toContain("if (dwQueueTurnRef.current !== dwTurnKey) {");
  });
});
