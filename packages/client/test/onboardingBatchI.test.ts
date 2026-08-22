/**
 * 온보딩 §I 회귀 가드 — 감사 2026-08-17 §3-6·3-7·3-10·3-11·3-12.
 *
 * 공통점: **화면은 멀쩡히 그려진다.** 우마·오카는 숫자가 예쁘게 찍히고, 도감은
 * "0/0종"이라고 정확히 답하고, 드래프트 창은 카드 세 장을 잘 세운다. 다만 그것을
 * 처음 보는 사람이 무슨 뜻인지 알 길이 없었을 뿐이다. 그래서 못을 박는다.
 *
 * 정적 소스 스캔이다 — 이 패키지에는 jsdom이 없다(a11yPerfGuards와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_GROUPS } from "../src/glossary.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const ROOM = readFileSync(join(HERE, "../../server/src/RoomManager.ts"), "utf8");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const ROOM_CODE = code(ROOM);

const byKey = new Map(GLOSSARY.map((g) => [g.key, g]));

// ─────────────────── §3-10 우마·오카 ───────────────────

describe("결과 화면의 우마·오카에 설명이 있다", () => {
  it("셋 다 용어집에 실려 있다", () => {
    for (const key of ["uma", "oka", "return_score"]) {
      expect(byKey.get(key), `용어집에 ${key} 가 없다`).toBeDefined();
    }
  });

  it("한 줄로는 안 그려지는 개념이라 긴 풀이가 붙어 있다", () => {
    // "25000점인데 왜 +35지?"는 한 문장으로 답할 수 없다.
    expect(byKey.get("uma")?.long).toBeTruthy();
    expect(byKey.get("oka")?.long).toBeTruthy();
  });

  it("결과 화면이 그 숫자를 TermText로 흘려보낸다", () => {
    // 숫자만 찍는 것으로는 부족했다 — 용어집으로 이어져야 뜻이 닿는다.
    const at = APP_CODE.indexOf('className="rank-umaoka"');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 420)).toContain("<TermText");
  });

  it("머리말이 더 이상 오카를 '안 쓰는 말'의 예로 들지 않는다", () => {
    // 이 주석이 낡은 채로 남아 있어서, 그걸 믿은 사람이 같은 구멍을 다시 팠다.
    const glossary = readFileSync(join(HERE, "../src/glossary.ts"), "utf8");
    const header = glossary.slice(0, glossary.indexOf("export type GlossaryGroup"));
    expect(header).not.toMatch(/한 번도 안 쓰는 말\([^)]*오카/);
  });
});

// ─────────────────── §3-11 증강 시스템 용어 ───────────────────

describe("증강 시스템의 말이 용어집에 있다", () => {
  it("'증강 시스템' 분류가 설명집 목차에 있다", () => {
    expect(GLOSSARY_GROUPS.some((g) => g.id === "system")).toBe(true);
  });

  it("화면 배지로 쓰이는 말이 전부 실려 있다", () => {
    // UI 배지: ⚡ 액티브 · 🎯 퀘스트 · 🔒 무장해제 · 🕐N국 쿨다운
    for (const key of [
      "augment",
      "draft",
      "active_augment",
      "cooldown",
      "quest",
      "disarm",
      "reload",
    ]) {
      expect(byKey.get(key), `용어집에 ${key} 가 없다`).toBeDefined();
      expect(byKey.get(key)?.group).toBe("system");
    }
  });

  it("전부 hudOnly다 — 증강 설명문이 아니라 시스템이 찍는 말이다", () => {
    // 증강 텍스트를 코퍼스로 보는 미사용 검사에 걸릴 수 없는 항목들이다.
    for (const g of GLOSSARY.filter((e) => e.group === "system")) {
      expect(g.hudOnly, `${g.key} 에 hudOnly 가 없다`).toBe(true);
    }
  });

  it("풀이 안에서 또 다른 전문 용어로 도망가지 않는다", () => {
    // 설명이 설명을 필요로 하면 그건 설명이 아니다.
    for (const g of GLOSSARY.filter((e) => e.group === "system")) {
      expect(g.short.length).toBeLessThan(70);
      expect(g.short).not.toMatch(/샹텐|후리텐|멘젠/);
    }
  });
});

// ─────────────────── §3-6 첫 드래프트 안내 ───────────────────

describe("첫 드래프트에 안내가 있다", () => {
  it("소개 문단은 없다 — 카드가 이미 그 말을 한다", () => {
    // 예전에는 보유 0일 때 "증강은 이 판의 규칙을 바꿉니다…" 한 문단을 냈다.
    // 뺐다(2026-08-18 사용자 요청) — 고르려고 온 자리에 읽을 것을 더 얹지 않는다.
    // 남은 안내는 아래 `draft-howto` 한 줄뿐이다.
    expect(APP_CODE).not.toContain("draft-intro");
    expect(CSS).not.toContain(".draft-intro {");
  });

  it("조작 안내가 대기실 밖에도 있다", () => {
    // 예전에는 Shift 안내가 대기실 팁에만 있었는데, 체험·연습은 대기실을 안 거친다.
    expect(APP_CODE).toContain("draft-howto");
    expect(APP).toContain("자세히 ▾");
  });

  it("키보드 안내는 터치 화면에서 숨는다", () => {
    expect(CSS).toMatch(/@media \(hover: none\) \{\s*\.draft-howto-key \{ display: none; \}/);
  });
});

// ─────────────────── §3-7 로그인 전 도감 ───────────────────

describe("로그인 전에도 도감이 열린다", () => {
  it("도감을 열 때 카탈로그가 없으면 그때 요청한다", () => {
    const at = APP_CODE.indexOf("const openCodex = useStableFn");
    expect(at).toBeGreaterThan(0);
    const block = APP_CODE.slice(at, at + 300);
    expect(block).toContain("Object.keys(catalog).length === 0");
    expect(block).toContain('send({ type: "catalogRequest" })');
  });

  it("도감을 여는 자리가 전부 그 한 곳을 지난다", () => {
    // 한 자리라도 직접 `setCodexOpen(true)` 를 부르면 그 경로만 빈 도감이 뜬다.
    expect(APP_CODE.match(/setCodexOpen\(true\)/g)).toHaveLength(1);
  });

  it("서버가 인증 전에 답하고, 연타는 비싼 조회로 접는다", () => {
    expect(ROOM_CODE).toContain('case "catalogRequest"');
    // 인증 게이트 뒤의 heavyLimited 가 여기까지 오지 않으므로 직접 걸어야 한다.
    const at = ROOM_CODE.indexOf('case "catalogRequest"');
    expect(ROOM_CODE.slice(at, at + 400)).toContain("this.heavyLimited(conn, msg.type)");
    expect(ROOM_CODE).toMatch(/"catalogRequest",\s*\]\)/); // HEAVY_MESSAGES 목록에 있다
  });

  it("`serverInfo`에 카탈로그를 얹지 않았다 (도감을 안 여는 사람이 비용을 내지 않는다)", () => {
    const at = ROOM_CODE.indexOf('type: "serverInfo"');
    expect(at).toBeGreaterThan(0);
    const block = ROOM_CODE.slice(at, at + 400);
    // 종수(`augmentKinds`)는 실어도 좋다 — 숫자 하나다. 실으면 안 되는 것은
    // 상세 설명까지 담은 **목록**이다.
    expect(block).toContain("augmentKinds: this.augmentCatalog.length");
    expect(block).not.toMatch(/augments:\s*this\.augmentCatalog/);
  });
});

// ─────────────────── §3-12 빈 상태 CTA ───────────────────

describe("빈 상태가 다음 걸음을 준다", () => {
  it("내 통계 빈 카드에 누를 것이 있다", () => {
    // "첫 대국을 시작해 보세요!"는 서술이지 다음 걸음이 아니다 — 방을 만들지
    // 코드를 받을지 연습을 할지 다시 사람이 정해야 했다.
    const at = APP_CODE.indexOf("아직 완료한 대국이 없습니다");
    expect(at).toBeGreaterThan(0);
    // 창을 320 → 640 으로 넓혔다: 빈 상태 안내에 «튜토리얼·연습은 기록에 남지
    // 않습니다» 한 줄과 «방 만들기» 단추가 함께 들어왔다(QA 4차 loop 확정 4).
    // 이 테스트가 지키려는 것은 «누를 것이 있는가»지 그 글자 수가 아니다.
    expect(APP_CODE.slice(at, at + 640)).toContain("home-empty-cta");
    expect(APP_CODE.slice(at, at + 640)).toContain("props.onPractice");
    // 그리고 **기록에 남는 문**도 함께 서 있어야 한다 — 예전 CTA 는 시키는 대로
    // 한 판 두고 돌아와도 화면이 글자 하나 안 바뀌는 판을 열었다.
    expect(APP_CODE.slice(at, at + 640)).toContain("props.onCreateRoom");
  });

  it("정말 빈 목록에는 힌트가 붙어 있다", () => {
    expect(APP).toContain('emptyHint="한 판 두고 나면');
    expect(APP).toContain('emptyHint="증강 아이디어나');
  });
});
