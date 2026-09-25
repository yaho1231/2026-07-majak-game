/**
 * docs/59 B18 «서버·콘텐츠 데이터» 클라 회귀 가드 (2026-09-25).
 *
 * content·core·server가 새로 싣는 데이터를 화면이 그린다:
 *  - U42 귀환 미리보기(`honor_return:preview:{나}`) — 이름표 pill 칩·✦ 메뉴 줄 글자·패 그림(잔상과 같은 경로)
 *  - U77 roundOver.gameEnds — 결과창 «최종 결과 보기»(패널 쪽은 roundResultPanel.test.ts)
 *  - U49 미래를 보는 자 시간 초과 = 무작위 교환(서버 FORCED_ACTION_TYPES) — 문구는 forcedHandPickB07.test.ts
 *  - U65 관전 선택 라벨 — 좌석 id·증강 id를 이름으로
 *  - U28 카피 후보 수(`copy:pool:{나}`) — 비후보 사유·«N개 중 무작위»
 *  - U09 등가교환 넘길 3장(`hand_swap3:gives:{나}`) — take 모달(swap3InfoB08.test.ts)
 *  - U61 짝수의 세계 변환 미리보기(`even_world:preview:{나}`) — 손패 제자리 유령패
 *
 * 채널 이름은 content와 문자열로 맞물린다 — 한쪽만 바꾸면 화면이 조용히 빈다. 그래서 content
 * 소스의 채널 키도 함께 읽어 확인한다. 정적 소스 스캔이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");
const AUG = (id: string): string => read(`../../content/src/augments/${id}.ts`);

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

describe("채널 이름 — content와 화면이 같은 키를 쓴다", () => {
  it("귀환·짝수의 세계 미리보기, 카피 후보 수, 등가교환 넘길 패", () => {
    expect(AUG("honor_return")).toContain("roundViewKey(h, `${ID}:preview:${h}`)");
    expect(APP_CODE).toContain("`honor_return:preview:${view.playerId}`");
    expect(AUG("even_world")).toContain("roundViewKey(h, `${ID}:preview:${h}`)");
    expect(APP_CODE).toContain("`even_world:preview:${me.id}`");
    expect(AUG("copy")).toContain("viewKey(h, `${ID}:pool:${h}`)");
    expect(APP_CODE).toContain("`copy:pool:${view.playerId}`");
    expect(AUG("hand_swap3")).toContain("roundViewKey(holder, `${ID}:gives:${holder}`)");
    expect(APP_CODE).toContain("`hand_swap3:gives:${me.id}`");
  });
});

describe("U42 귀환 — 누르기 전에 돌아올 자패를 보인다", () => {
  it("이름표 pill: 발동 뒤는 전원 공개 목록, 발동 전은 보유자 본인에게만 미리보기", () => {
    const pill = fnBody("augmentPillStatus");
    const at = pill.indexOf('if (augId === "honor_return") {');
    expect(at).toBeGreaterThan(-1);
    const branch = pill.slice(at, pill.indexOf("\n  }\n", at));
    expect(branch).toContain("av[`honor_return:${playerId}`]");
    expect(branch).toContain("isSelf ? kindsIn(av[`honor_return:preview:${playerId}`]) : []");
    expect(branch).toContain("발동하면 다음 국 배패에 이 자패가 들어옵니다");
    expect(branch).toContain("chip: `↺ ${names}`");
  });

  it("✦ 메뉴 줄 — 잔상과 같은 경로로 글자(optionDetail)와 패 그림(ActionTiles)", () => {
    const kinds = fnBody("recallKindsOf");
    expect(kinds).toContain('type === "dora_recall"');
    expect(kinds).toContain("`dora_afterimage:prev:${view.playerId}`");
    expect(kinds).toContain('type === "honor_recall"');
    const detail = fnBody("optionDetail");
    expect(detail).toContain('if (option.type === "dora_recall" || option.type === "honor_recall") {');
    expect(detail).toContain("recallKindsOf(view, option.type)");
    const tiles = fnBody("ActionTiles");
    expect(tiles).toContain('if (option.type === "dora_recall" || option.type === "honor_recall") {');
    expect(tiles).toContain("attrs: { conjured: true }");
  });

  it("📜 기록에는 새 채널이 줄로 새지 않는다(귀환 head는 건너뛴다)", () => {
    const log = APP_CODE.slice(
      APP_CODE.indexOf("function augmentLogRows("),
      APP_CODE.indexOf("  return rows;\n}", APP_CODE.indexOf("function augmentLogRows(")),
    );
    expect(log).toContain('if (head === "regret" || head === "honor_return") continue;');
  });
});

describe("U65 관전 선택 라벨 — 원문 id를 찍지 않는다", () => {
  it("좌석 id는 이름으로, 증강 id는 증강 이름으로", () => {
    const label = fnBody("ChoiceLabel");
    expect(label).toContain("view !== undefined && view.players.some((p) => p.id === tok)");
    expect(label).toContain("playerNameById(view, tok)");
    expect(label).toContain("catalog[tok] !== undefined");
    expect(label).toContain("augName(tok, catalog)");
    // 선택 완료 줄도 같은 뷰로 — 목록과 확정 줄의 표기가 갈리지 않게
    expect(APP_CODE).toContain(
      "선택한 항목: <ChoiceLabel label={picked} catalog={catalog} title={choice.title} view={view} />",
    );
  });

  it("서버 라벨은 패 id 키에서만 패를 읽는다 — delta는 부호를 붙인 글자", () => {
    const core = read("../../core/src/match/HanchanController.ts");
    expect(core).toContain("TILE_ID_PAYLOAD_KEYS.has(k)");
    expect(core).toContain('parts.push(v > 0 ? `+${v}` : String(v));');
  });
});

describe("U28 카피 — 후보 수와 비후보 사유", () => {
  it("비후보 상대는 서버 후보 수가 0일 때만 사유를 말한다(모르면 말하지 않는다)", () => {
    const pool = fnBody("copyPoolOf");
    expect(pool).toContain("`copy:pool:${view.playerId}`");
    expect(pool).toContain('return typeof n === "number" ? n : null;');
    const sel = APP_CODE.slice(APP_CODE.indexOf("const oppBlockedReason = (pid: string): string | null => {"));
    const fn = sel.slice(0, sel.indexOf("\n  };\n"));
    expect(fn).toMatch(
      /if \(armedType === "copy_take"\) \{\s*if \(oppArmable\(pid\) \|\| pid === view\.playerId\) return null;\s*return copyPoolOf\(view, pid\) === 0 \? "가져올 수 있는 액티브가 없습니다" : null;/,
    );
  });

  it("후보 상대 태그에 «액티브 N개 중 무작위»", () => {
    expect(APP_CODE).toContain(
      'const copyPool = armType === "copy_take" && oppArmable ? copyPoolOf(view, player.id) : null;',
    );
    expect(APP_CODE).toContain("`${verb} · 액티브 ${copyPool}개 중 무작위`");
    expect(APP_CODE).toContain("`${verb} (${copyPool}개 중 무작위)`");
  });
});

describe("U61 짝수의 세계 — 손패 제자리 유령패", () => {
  it("✦ 줄 hover·첫 탭에서 켜고, 전부 비추기·끄기·프롬프트 변경에서 끈다", () => {
    const ctl = fnBody("ActiveAugmentControl");
    expect(ctl).toMatch(/const hintOne = \(type: string\): void => \{[\s\S]*?props\.onFlipHint\?\.\(type === "even_world_flip"\);/);
    expect(ctl).toMatch(/const clearHints = \(\): void => \{[\s\S]*?props\.onFlipHint\?\.\(false\);/);
    expect(ctl).toMatch(/const primeFirst = \(type: string\): boolean => \{[\s\S]*?props\.onFlipHint\?\.\(type === "even_world_flip"\);/);
    expect(ctl).toMatch(/setPrimed\(null\);\s*onHint\?\.\(null\);\s*onDoomed\?\.\(null\);\s*onFlip\?\.\(false\);/);
  });

  it("OwnArea가 서버 채널 값 그대로 제자리에 바뀐 모양을 그린다(클라가 다시 세지 않는다)", () => {
    const own = fnBody("OwnArea");
    expect(own).toContain("onFlipHint={setFlipHint}");
    expect(own).toContain("const flipped = flipPreview.get(id);");
    expect(own).toContain("{ ...t, kind: flipped, attrs: { ...t.attrs, conjured: true, red: false } }");
    expect(own).toContain('flipPreview.has(id) ? " hand-flip-preview" : ""');
    expect(own).toContain('<span className="hand-flip-badge" aria-hidden="true">');
    // 원래 패 이름은 aria-label이 그대로 읽고, 바뀔 모양을 덧붙인다
    expect(own).toContain("짝수의 세계 미리보기: ${formatTile({ kind: flipPreview.get(id)! })}(으)로 바뀜");
    // 규칙(홀수+1·9→8)을 클라에 두 벌 두지 않는다
    expect(own).not.toMatch(/rank === 9 \? 8/);
    expect(CSS).toContain(".hand-flip-preview .tile-face {");
    expect(CSS).toContain(".hand-flip-badge {");
  });
});
