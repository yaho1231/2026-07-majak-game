/**
 * docs/59 B03 «무장 이름·안내문·폴백 한 경로» 회귀 가드 (2026-09-25).
 *
 * U18 이름은 증강 이름 하나 · U19 무장 안내가 결과를 말한다 · U29 상대 태그에 동사 ·
 * U62 폴백은 actionLabel 한 경로 · U36 회수의 쯔모패 ✕ · U11 정적의 손 잔재 모달 삭제 ·
 * U14 연금술 순환 미리보기 · U15 위조 선택지 라벨 · U43 못 쓰는 이유 문장.
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 — 함수 하나의 본문 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

/** `const NAME: Record<string, string> = { key: "value", ... };` */
function record(name: string): Map<string, string> {
  const m = new RegExp(`const ${name}: Record<string, string> = \\{([\\s\\S]*?)^\\};`, "m").exec(
    APP_CODE,
  );
  expect(m, `${name} 선언이 없다`).not.toBeNull();
  return new Map([...m![1]!.matchAll(/(\w+):\s*"([^"]+)"/g)].map((x) => [x[1]!, x[2]!]));
}

describe("U18 같은 액션은 어디서나 증강 이름 하나로 부른다", () => {
  it("무장 안내·드롭존·armSub 제목의 이름이 augActionName이다", () => {
    expect(APP_CODE).toContain(
      'const armName = armedAug !== null ? augActionName(props.catalog, armedAug) : "";',
    );
    expect(APP_CODE).not.toContain("ACTION_LABEL[armedAug]");
  });

  it("ACTION_LABEL 값에 괄호 설명을 섞지 않는다 — 안내 줄이 같은 말을 두 번 한다", () => {
    const labels = record("ACTION_LABEL");
    const expected: Record<string, string> = {
      flip_riichi: "손바닥 뒤집기",
      joker_call: "조커",
      pruning_swap: "가지치기",
      hand_swap: "통째로 바꾸기",
      parasite_attach: "기생충",
      greed_use: "욕심",
      kokushi_pon: "국사 퐁",
      silent_pon: "묵계 퐁",
    };
    for (const [k, v] of Object.entries(expected)) expect(labels.get(k), k).toBe(v);
    // 키는 지우지 않는다 — 액션 바 톤·코치가 «키가 없으면 증강»으로 가른다
    expect(labels.size).toBeGreaterThan(80);
  });

  it("관전 칩·선택지 머리도 증강 이름이고, 칩 중복은 증강 이름으로 걷는다", () => {
    const strip = fnBody("SpectateUsableStrip");
    expect(strip).toContain("const name = augActionName(catalog, head);");
    expect(strip).toContain("if (!names.includes(name)) names.push(name);");
    expect(strip).not.toContain("ACTION_LABEL");
    const label = fnBody("ChoiceLabel");
    expect(label).toContain("const showHead = rest.length === 0 || name !== title;");
    expect(label).not.toContain("ACTION_LABEL");
    expect(APP_CODE).toContain(
      "<SpectateUsableStrip choice={props.spectateChoice} catalog={props.catalog} />",
    );
    // view — 좌석 id 인자를 이름으로 바꾼다(B18 U65)
    expect(APP_CODE).toContain(
      "<ChoiceLabel label={o.label} catalog={catalog} title={choice.title} view={view} />",
    );
  });
});

describe("U19 무장 안내가 누르면 무슨 일이 생기는지 말한다", () => {
  const prompts = record("ARM_PROMPT");

  it("손패·상대·바닥 무장형마다 전용 문구가 있다", () => {
    for (const t of [
      "tile_dye",
      "alchemy",
      "split_tile",
      "peek_forge",
      "spy_mark",
      "conjure_tsumo",
      "hand_swap",
      "peek_waits",
      "parasite_attach",
      "copy_take",
      "seat_swap",
      "recall",
      "silent_take",
    ]) {
      expect(prompts.has(t), t).toBe(true);
    }
    // 한 증강의 두 액션(선언 간파의 간파·위조)은 이름이 합쳐지므로 문구가 갈라야 한다
    expect(prompts.get("peek_forge")).not.toBe(prompts.get("peek_waits"));
  });

  it("누르는 것이 곧 확정인 소환·스파이는 확정 방법을 적는다 — 두 번 누르기 설정에 따라 (B06 U16)", () => {
    // 2026-09-25 B06: 두 번 누르기(터치 기본)가 켜지면 «누르면 바로»는 틀린 말이라, 표에서 빼고
    // armPromptText가 ARM_CONFIRM_TAIL과 설정으로 붙인다.
    const tails = record("ARM_CONFIRM_TAIL");
    expect(tails.get("spy_mark")).toBe("정해집니다");
    expect(tails.get("conjure_tsumo")).toBe("정해집니다");
    const fn = fnBody("armPromptText");
    expect(fn).toContain('${tapTwice ? "두 번 누르면" : "누르면 바로"} ${tail}');
  });

  it("docs/52 문체 — «~하세요», 줄표 대신 마침표", () => {
    for (const [t, v] of prompts) {
      expect(v, t).not.toContain("—");
      expect(v, t).toMatch(/하세요|합니다|니다$/);
    }
  });

  it("armPromptText가 표를 모드 기본값보다 먼저 본다", () => {
    const fn = fnBody("armPromptText");
    const at = fn.indexOf("ARM_PROMPT[type]");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(fn.indexOf("switch (mode)"));
  });
});

describe("U29 상대 줄 태그에 무엇이 일어나는지 적는다", () => {
  it("태그는 {증강 이름}: {동사}, 표에 없으면 «여기를 클릭»", () => {
    const verbs = record("OPP_ARM_TAG");
    for (const t of ["hand_swap", "seat_swap", "copy_take", "peek_waits", "scapegoat_mark", "push_brand", "parasite_attach", "rank_gate_mark", "swap3"]) {
      expect(verbs.has(t), t).toBe(true);
    }
    expect(APP_CODE).toContain(
      'armVerb === undefined ? "여기를 클릭" : compact ? armVerb : `${armAugName}: ${armVerb}`;',
    );
    expect(APP_CODE).toContain("return compact ? `⚡ 빠름. ${body}` : `⚡ 나보다 빠름. ${body}`;");
    // 위 줄은 이름까지, 좌우 세로 줄은 동사만
    expect(APP_CODE).toContain("{armTagText(false)}");
    expect(APP_CODE).toContain("{armTagText(true)}");
    expect(APP_CODE).not.toContain('"⚡ 나보다 빠름. 여기를 클릭"');
  });

  it("좌우 세로 줄의 태그는 바깥 모서리에 붙고 넘치면 말줄임", () => {
    expect(CSS_CODE).toMatch(/\.opp-strip-left > \.opp-arm-tag \{\s*left: 0;\s*transform: none;/);
    expect(CSS_CODE).toMatch(/\.opp-strip-right > \.opp-arm-tag \{\s*left: auto;\s*right: 0;\s*transform: none;/);
    expect(CSS_CODE).toContain(".opp-strip-right > .opp-arm-tag:not(.opp-arm-blocked) {");
    expect(CSS_CODE).toContain("text-overflow: ellipsis;");
  });
});

describe("U62 이름 폴백은 actionLabel 한 경로", () => {
  it("augActionName의 끝은 조용한 `?? type`이 아니라 actionLabel", () => {
    const fn = fnBody("augActionName");
    expect(fn).toContain("?? actionLabel(type, catalog)");
    expect(fn).not.toMatch(/\?\? type\b/);
  });

  it("잠긴 선언도 actionLabel로 떨어진다", () => {
    expect(APP_CODE).toMatch(
      /l\.type === "win" \? \(isMyTurn \? "쯔모" : "론"\) : actionLabel\(l\.type, props\.catalog\)/,
    );
  });

  it("optionDetail은 역·무늬 이름이 없을 때 원문 키 대신 생략한다", () => {
    const fn = fnBody("optionDetail");
    expect(fn).not.toContain("YAKU_NAMES[p.yaku] ?? p.yaku");
    expect(fn).not.toContain("suitKo[p.suit] ?? p.suit");
    // 단색 세계 행의 `|| suit` 폴백도 없다(optionDetail이 이미 무늬 이름을 돌려준다)
    expect(APP_CODE).not.toContain("optionDetail(view, o) || suit");
  });
});

describe("U36 회수 — 대가로 나가는 쯔모패를 확정 전에 짚는다", () => {
  it("doomedTileIdsOf와 무장 중 doomedNow가 회수의 쯔모패를 짚는다", () => {
    expect(fnBody("doomedTileIdsOf")).toContain(
      "return view.round.myDrawnTile !== null ? [view.round.myDrawnTile] : [];",
    );
    expect(APP_CODE).toContain('if (armedAug === "recall") return new Set(doomedTileIdsOf(view, "recall"));');
    expect(APP_CODE).toContain('"회수하면 대신 내 바닥으로 나가는 패"');
  });
  it("무장 전 ✦ 메뉴 hover로 짚힌 회수 쯔모패도 «내 바닥으로 나가는 패»로 읽는다", () => {
    expect(APP_CODE).toContain('if (armedAug === "recall") return doomedNow;');
    expect(APP_CODE).toMatch(/doomedTileIdsOf\(view, "recall"\)\.filter\(\(id\) => doomedNow\.has\(id\) && !burn\.has\(id\)\)/);
    expect(APP_CODE).toMatch(/doomed\s*\?\s*recallDoomed\.has\(id\)/);
  });
});

describe("U11 정적의 손 잔재 모달이 없다", () => {
  it("silent_take 모달·silentByOwner가 사라졌고 안내는 무장 문구로 옮겨졌다", () => {
    expect(APP_CODE).not.toContain('pickModal === "silent_take"');
    expect(APP_CODE).not.toContain("silentByOwner");
    expect(record("ARM_PROMPT").get("silent_take")).toContain("이어서 한 장을 버려야 합니다");
  });
});

describe("U14 연금술 순환 — 9+1은 1, 1−1은 9", () => {
  it("shiftedRank가 1~9 밖을 순환시킨다", () => {
    const src = fnBody("shiftedRank").replace(/: number/g, "");
    const shiftedRank = new Function(`${src}\n}\nreturn shiftedRank;`)() as (r: number, d: number) => number;
    expect(shiftedRank(9, 1)).toBe(1);
    expect(shiftedRank(1, -1)).toBe(9);
    expect(shiftedRank(5, 1)).toBe(6);
    expect(shiftedRank(5, -1)).toBe(4);
  });

  it("미리보기 두 곳(morphedTile·ActionTiles)이 rank + delta를 그대로 쓰지 않는다", () => {
    expect(APP_CODE).not.toContain("src.rank + p.delta");
    expect(fnBody("morphedTile")).toContain("shiftedRank(src.rank, p.delta)");
    expect(fnBody("ActionTiles")).toContain("shiftedRank(src.rank, p.delta)");
  });
});

describe("U15 위조 선택지는 결과 패 이름으로 갈린다", () => {
  it("optionDetail이 peek_forge·alchemy를 type으로 좁혀 «→ 패 이름»을 적는다", () => {
    const fn = fnBody("optionDetail");
    expect(fn).toContain('if (option.type === "peek_forge" && typeof p.kind === "string") {');
    expect(fn).toContain('if (option.type === "alchemy" && typeof p.delta === "number"');
    // 위조 분기는 무늬·증감 분기보다 앞이다
    expect(fn.indexOf('option.type === "peek_forge"')).toBeLessThan(fn.indexOf("const suitKo"));
  });

  it("armSub 제목이 위조의 맥락을 적는다", () => {
    expect(APP_CODE).toContain('"간파한 대기패 중 무엇으로 바꿀까요"');
  });
});

describe("U43 못 쓰는 이유 — 사유와 목록이 섞이지 않는다", () => {
  it("blockedReason은 사유만 돌려주고 이름은 부르는 쪽이 붙인다", () => {
    expect(APP_CODE).toContain("const blockedReason = (id: string): string | null => {");
    expect(APP_CODE).not.toContain("blockedNote");
    expect(APP_CODE).toContain("lines.push(`${unexplained.join(\", \")}: 지금 발동 조건이 아닙니다`);");
  });

  it("토스트와 title이 같은 조립을 쓴다", () => {
    expect(APP_CODE).toContain("props.onToast?.(blockedToast());");
    expect(APP_CODE).toContain(': blockedLines().join("\\n")');
  });
});
