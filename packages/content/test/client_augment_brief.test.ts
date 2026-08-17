/**
 * 증강 요약·용어 사전 가드.
 *
 * 게임 화면에 **기본으로** 뜨는 설명은 `packages/client/src/augmentBrief.ts`의 한 줄이다.
 * 원문 `description`은 조건·예외까지 담느라 최대 157자여서, 드래프트 카드(240~290px)에
 * 넣으면 열 줄 가까이 흘렀다 — 고르는 몇 초 동안 읽히지 않는다. 그래서 요약을 앞에 세우고
 * 원문은 Shift/"자세히"로 물렸다.
 *
 * 이 표는 증강 정의와 **떨어져 있어서** tsc가 누락을 못 잡는다. 새 증강을 추가하고 요약을
 * 빠뜨리면 원문 첫 문장으로 대체 표시되는데(화면은 안 깨진다) 길고 어려운 문장이 그대로
 * 노출된다. 그 조용한 퇴행을 여기서 막는다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { standardAugments } from "@majak/core";
import { describe, expect, it } from "vitest";
import { contentAugments } from "../src/index.js";
import { AUGMENT_BRIEF, briefOf, expandParas, forMode } from "../../client/src/augmentBrief.js";
import { GLOSSARY, GLOSSARY_GROUPS, splitTerms } from "../../client/src/glossary.js";

const ALL = [...standardAugments, ...contentAugments];

/**
 * 결과 화면에 뜨는 역 이름표(App.tsx의 `YAKU_NAMES`).
 *
 * App.tsx는 React 모듈이라 노드 테스트에서 import할 수 없다 — 소스에서 정적으로 읽는다
 * (`packages/client/test/resultYakuGlossary.test.ts`가 같은 방식으로 이 표를 검사한다).
 */
function resultYakuLabels(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL("../../client/src/App.tsx", import.meta.url)),
    "utf8",
  );
  const at = src.indexOf("const YAKU_NAMES: Record<string, string> = {");
  if (at < 0) throw new Error("App.tsx에서 YAKU_NAMES를 찾지 못했다");
  const body = src.slice(at, src.indexOf("\n};", at));
  return [...body.matchAll(/^\s*\w+:\s*"([^"]+)",/gm)].map((m) => m[1]!);
}

/** 툴팁·드래프트 카드에서 다섯 줄을 넘지 않는 상한 (좁은 쪽 기준 대략 20자/줄) */
const BRIEF_MAX = 60;

describe("증강 요약 (클라이언트 기본 설명)", () => {
  it("모든 증강에 요약이 있다", () => {
    const missing = ALL.filter((a) => AUGMENT_BRIEF[a.id] === undefined).map((a) => `${a.id}(${a.name})`);
    expect(missing).toEqual([]);
  });

  it("요약 표에 사라진 증강이 남아 있지 않다", () => {
    const live = new Set(ALL.map((a) => a.id));
    expect(Object.keys(AUGMENT_BRIEF).filter((id) => !live.has(id))).toEqual([]);
  });

  it(`요약 본문이 ${BRIEF_MAX}자를 넘지 않는다`, () => {
    const over = Object.entries(AUGMENT_BRIEF)
      .filter(([, b]) => b.text.length > BRIEF_MAX)
      .map(([id, b]) => `${id}: ${b.text.length}자`);
    expect(over).toEqual([]);
  });

  it("요약에 사용 빈도 배지가 있고, 본문에 머리말 괄호가 남아 있지 않다", () => {
    const bad = Object.entries(AUGMENT_BRIEF)
      .filter(([, b]) => b.use.trim() === "" || b.text.startsWith("("))
      .map(([id]) => id);
    expect(bad).toEqual([]);
  });

  it("요약이 없는 증강은 원문 머리말을 배지로 떼어내 대체한다", () => {
    const b = briefOf("__unknown__", "(매 국 1회) 첫 문장이다. 두 번째 문장은 버린다.");
    expect(b.use).toBe("매 국 1회");
    expect(b.text).toBe("첫 문장이다.");
  });

  /*
   * 배지가 원문보다 **넓은 범위**를 말하면 안 된다.
   *
   * 등 떠밀기는 구현도 설명도 "매 국 1회"인데 배지만 MODE_1_2였다. 인게임에서는
   * forMode가 그걸 "게임 1회"로 줄이므로, 요약은 판당 한 번이라 하고 상세를 펼치면
   * 국당 한 번이라 하는 정면 모순이 됐다(2026-08-17 사용자 지적). 손바닥 뒤집기도
   * 사양이 2국 쿨다운으로 바뀐 뒤 배지만 남아 같은 상태였다.
   *
   * 반대 방향(원문은 매치 단위인데 배지가 국 단위)은 막지 않는다 — 자리 바꿈처럼
   * 두 제약을 함께 지는 증강은 **좁은 쪽**을 배지로 쓰는 것이 맞다.
   */
  it("배지가 원문에 없는 '매치 단위 횟수'를 지어내지 않는다", () => {
    const matchScoped = (t: string): boolean =>
      /동풍전\s*\d/.test(t) || /반장전\s*\d/.test(t) || /게임\s*(내\s*)?\d+\s*회/.test(t);
    const bad = ALL.filter((a) => {
      const brief = AUGMENT_BRIEF[a.id];
      if (brief === undefined || !matchScoped(brief.use)) return false;
      const head = /^\(([^)]*)\)/.exec(a.description);
      // 머리말이 없는 증강은 비교할 원문이 없다 — 이 검사의 대상이 아니다
      return head !== null && !matchScoped(head[1] ?? "");
    }).map((a) => `${a.id}: 배지 "${AUGMENT_BRIEF[a.id]?.use}" ↔ 원문 "${/^\(([^)]*)\)/.exec(a.description)?.[1]}"`);
    expect(bad).toEqual([]);
  });
});

/**
 * 화면마다 펼치는 층이 다르다 (augmentBrief.ts 헤더의 표).
 *   드래프트(카드·이름표 툴팁) → 요약 + **설명**. 판 중에 몇 초로 고르는 자리라 상세는 길다.
 *   도감(도감 상세·샌드박스 상세) → 요약 + **상세**. 목록에 이미 요약이 있고 설명은 상세와 겹친다.
 *
 * 예전에는 도감 상세가 세 겹을 다 폈다 — 같은 얘기를 설명과 상세로 두 번 읽혔다.
 * 어느 한쪽으로 되돌아가는 것을 여기서 막는다.
 */
describe("설명 층 나누기 (화면별)", () => {
  const DESC = "(매 국 1회) 조건과 예외를 담은 정식 문장이다.";
  const DETAIL = "작동 원리 문단.\n\n전략과 주의점 문단.";

  it("드래프트는 설명만 편다 — 상세는 절대 섞이지 않는다", () => {
    expect(expandParas("draft", DESC, DETAIL)).toEqual(["조건과 예외를 담은 정식 문장이다."]);
  });

  it("도감은 상세만 편다 — 설명은 섞이지 않는다", () => {
    expect(expandParas("codex", DESC, DETAIL)).toEqual(["작동 원리 문단.", "전략과 주의점 문단."]);
  });

  it("상세가 없는 증강만 도감에서 설명이 그 자리를 대신한다", () => {
    expect(expandParas("codex", DESC, undefined)).toEqual(["조건과 예외를 담은 정식 문장이다."]);
    expect(expandParas("codex", DESC, "   ")).toEqual(["조건과 예외를 담은 정식 문장이다."]);
  });

  it("어느 쪽이든 머리말 괄호는 본문에 남지 않는다 (배지가 이미 말한다)", () => {
    for (const v of ["draft", "codex"] as const) {
      const bad = ALL.filter((a) => expandParas(v, a.description, a.detail).some((p) => p.startsWith("(")));
      expect(bad.map((a) => a.id), v).toEqual([]);
    }
  });

  it("실제 증강 전부에서 두 경로가 서로의 층을 끌어오지 않는다", () => {
    const withDetail = ALL.filter((a) => (a.detail ?? "").trim() !== "");
    // 상세를 가진 증강이 있어야 이 검사가 의미를 가진다
    expect(withDetail.length).toBeGreaterThan(0);
    for (const a of withDetail) {
      const draft = expandParas("draft", a.description, a.detail).join("\n");
      const codex = expandParas("codex", a.description, a.detail).join("\n");
      // 드래프트에 상세 첫 문단이 실려 있으면 안 된다
      const detailHead = a.detail!.trim().split(/\n\n+/)[0]!.trim();
      expect(draft.includes(detailHead), `${a.id}: 드래프트에 상세가 샜다`).toBe(false);
      // 도감에 설명 본문이 실려 있으면 안 된다
      const descBody = a.description.replace(/^\([^)]*\)\s*/, "").trim();
      expect(codex.includes(descBody), `${a.id}: 도감에 설명이 샜다`).toBe(false);
    }
  });

  it("App.tsx의 모든 AugDesc 호출부가 variant를 명시한다", () => {
    // 컴포넌트가 자기 위치를 추측하게 두면 화면이 늘 때마다 조용히 어긋난다
    const src = readFileSync(
      fileURLToPath(new URL("../../client/src/App.tsx", import.meta.url)),
      "utf8",
    );
    const calls = [...src.matchAll(/<AugDesc\b[^>]*>/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => !/\bvariant="(draft|codex)"/.test(c))).toEqual([]);
  });
});

/**
 * "동풍전 1회 · 반장전 2회"는 도감에서는 두 숫자가 다 필요하지만, 판 중에는 지금 도는
 * 판의 숫자 하나면 된다 — 안 쓰는 숫자가 옆에 서 있으면 몇 번 남았는지 한 번 더 셈해야
 * 한다(2026-08-12 사용자 요청). 인게임(`variant="draft"`)만 줄이고 도감은 그대로 둔다.
 */
describe("모드별 횟수 표기", () => {
  it("배지·머리말·본문 어디에 있든 그 판의 숫자 하나로 줄인다", () => {
    expect(forMode("동풍전1·반장전2", "tonpuu")).toBe("게임 1회");
    expect(forMode("동풍전1·반장전2", "hanchan")).toBe("게임 2회");
    expect(forMode("(동풍전 1회 · 반장전 2회) 발동한다.", "tonpuu")).toBe("(게임 1회) 발동한다.");
    expect(forMode("(동풍전 1회 · 반장전 2회) 발동한다.", "hanchan")).toBe("(게임 2회) 발동한다.");
    // 1·2가 아닌 것(자리 바꾸기)과 뒤에 조건이 더 붙는 머리말도 같이 받는다
    expect(forMode("(동풍전 2회 · 반장전 3회, 국당 1회)", "tonpuu")).toBe("(게임 2회, 국당 1회)");
    expect(forMode("(동풍전 2회 · 반장전 3회, 국당 1회)", "hanchan")).toBe("(게임 3회, 국당 1회)");
  });

  it("도감(mode=null)은 두 숫자를 그대로 둔다", () => {
    const raw = "(동풍전 1회 · 반장전 2회) 발동한다.";
    expect(forMode(raw, null)).toBe(raw);
  });

  it("모드 전용 증강의 '반장전 전용' 같은 말은 건드리지 않는다", () => {
    // 숫자가 붙은 횟수 표기만 줄인다 — 모드 이름 자체는 정보다
    expect(forMode("상시(반장전)", "tonpuu")).toBe("상시(반장전)");
    expect(forMode("(상시 · 동풍전 전용) 만개한다.", "hanchan")).toBe("(상시 · 동풍전 전용) 만개한다.");
  });

  it("실제 증강 전부 — 판 중에는 두 모드가 나란히 선 횟수가 남지 않는다", () => {
    const both = /동풍전\s*\d+\s*회?\s*·\s*반장전\s*\d+/;
    // 줄일 거리가 실제로 있어야 이 검사가 의미를 가진다
    expect(ALL.filter((a) => both.test(a.description)).length).toBeGreaterThan(0);
    for (const mode of ["tonpuu", "hanchan"] as const) {
      const leftover = ALL.filter((a) => {
        const brief = briefOf(a.id, a.description);
        const texts = [
          forMode(brief.use, mode),
          forMode(brief.text, mode),
          forMode(a.description, mode),
          ...expandParas("draft", a.description, a.detail).map((p) => forMode(p, mode)),
        ];
        return texts.some((t) => both.test(t));
      });
      expect(leftover.map((a) => a.id), mode).toEqual([]);
    }
  });
});

describe("마작 용어 사전", () => {
  it("항목 key가 중복되지 않는다", () => {
    const keys = GLOSSARY.map((g) => g.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("풀이는 한 문장이고 용어 자신을 되풀이하지 않는다", () => {
    const bad = GLOSSARY.filter((g) => g.short.trim() === "" || g.short.startsWith(g.label)).map((g) => g.key);
    expect(bad).toEqual([]);
  });

  it("모든 항목이 설명집 분류에 속한다", () => {
    // 용어 설명집(App.tsx `TermsTab`)은 GLOSSARY_GROUPS 순서대로만 그린다 —
    // 목록에 없는 분류를 적으면 그 항목은 화면 어디에도 안 뜬다(조용히 사라진다).
    const known = new Set(GLOSSARY_GROUPS.map((g) => g.id));
    expect(GLOSSARY.filter((g) => !known.has(g.group)).map((g) => g.key)).toEqual([]);
    // 빈 분류는 칩만 남고 내용이 없다 — 목록에서 빼야 한다
    const used = new Set(GLOSSARY.map((g) => g.group));
    expect(GLOSSARY_GROUPS.filter((g) => !used.has(g.id)).map((g) => g.id)).toEqual([]);
  });

  it("긴 풀이는 한 줄 풀이보다 실제로 더 말해 준다", () => {
    // `long`은 설명집에서 `short`를 **대신한다**. 더 짧거나 같으면 붙일 이유가 없다.
    const bad = GLOSSARY.filter((g) => g.long !== undefined && g.long.length <= g.short.length).map(
      (g) => g.key,
    );
    expect(bad).toEqual([]);
  });

  it("매칭 표기에 캡처 그룹이 없다 (있으면 그룹 번호로 항목을 되찾지 못한다)", () => {
    // 이스케이프한 괄호 `\(`와 전방탐색 `(?!)`은 그룹이 아니다 — 문자열로 세지 말고
    // 실제로 컴파일해서 그룹 수를 센다 (`|` 를 붙이면 빈 문자열에 항상 매칭된다)
    const groupCount = (source: string): number => (new RegExp(`${source}|`).exec("")?.length ?? 1) - 1;
    const bad = GLOSSARY.filter((g) => (g.match ?? []).some((m) => groupCount(m) > 0)).map((g) => g.key);
    expect(bad).toEqual([]);
  });

  it("긴 표기가 짧은 표기에 잡아먹히지 않는다", () => {
    const pick = (text: string): string[] =>
      splitTerms(text).filter((c) => c.kind === "term").map((c) => (c.kind === "term" ? c.entry.key : ""));
    expect(pick("뒷도라가 도라 표시패보다 세다")).toEqual(["ura_dora", "dora_indicator"]);
    expect(pick("더블리치는 리치의 두 배")).toEqual(["double_riichi", "riichi"]);
    expect(pick("안깡·가깡·대명깡은 전부 깡이다")).toEqual(["ankan", "kakan", "daiminkan", "kan"]);
    expect(pick("역만은 역이 아니다")).toEqual(["yakuman", "yaku"]);
    expect(pick("황패유국과 유국만관")).toEqual(["ryuukyoku", "nagashi"]);
  });

  it("두 글자 용어가 일반 문장에 파묻히지 않는다", () => {
    const pick = (text: string): string[] =>
      splitTerms(text).filter((c) => c.kind === "term").map((c) => (c.kind === "term" ? c.entry.key : ""));
    // `대가`는 "그 상대가"의 꼬리에 통째로 들어 있다 — 여기에 밑줄이 그이면 안 된다
    expect(pick("그 상대가 버린 패")).toEqual([]);
    expect(pick("대가와 상가")).toEqual(["toimen", "kamicha"]);
    expect(pick("하가·대면·상가·나")).toEqual(["shimocha", "toimen", "kamicha"]);
    // `머리`·`대기`도 낱말 안에 숨는다
    expect(pick("대기만성")).toEqual([]);
    expect(pick("머리카락")).toEqual([]);
  });

  it("쪼갠 조각을 도로 이으면 원문이 된다", () => {
    for (const a of ALL) {
      const joined = splitTerms(a.description).map((c) => c.text).join("");
      expect(joined, a.id).toBe(a.description);
    }
  });

  it("요약 본문에서 전문 용어를 실제로 잡아낸다", () => {
    // 요약 전체에서 한 번도 안 걸리면 사전이 본문 표기와 어긋났다는 뜻이다
    const hit = new Set<string>();
    for (const b of Object.values(AUGMENT_BRIEF)) {
      for (const c of splitTerms(b.text)) if (c.kind === "term") hit.add(c.entry.key);
    }
    for (const key of ["shuntsu", "koutsu", "winning_tile", "riichi", "furiten", "tenpai", "dora"]) {
      expect(hit.has(key), key).toBe(true);
    }
  });

  it("게임 텍스트에 한 번도 안 나오는 항목은 싣지 않는다", () => {
    // 사전의 수록 기준은 "이 게임이 실제로 쓰는 말"이다. 마작 용어 전체를 옮겨 오면
    // 안 쓰는 말이 사전의 대부분을 차지해, 쓰는 말을 고칠 때 어디를 볼지 흐려진다.
    // 증강 설명이 바뀌어 더는 안 쓰는 말이 되면 여기서 걸린다 — 항목을 빼거나,
    // 그 말을 다시 쓰는 증강과 함께 남긴다.
    const corpus = [
      ...ALL.map((a) => a.description),
      ...ALL.map((a) => a.detail ?? ""),
      ...Object.values(AUGMENT_BRIEF).map((b) => b.text),
      // 결과 화면의 역 이름표도 플레이어가 읽는 글이다 — 스안커·대사희는 증강 설명에
      // 한 번도 안 나오지만 화료 한 번이면 그 자리에 뜬다.
      ...resultYakuLabels(),
    ].join("\n");
    const hit = new Set<string>();
    const shown: string[] = [];
    for (const c of splitTerms(corpus)) {
      if (c.kind !== "term") continue;
      hit.add(c.entry.key);
      shown.push(c.text);
    }
    // 긴 표기에 통째로 먹힌 짧은 표기는 쓰인 것으로 친다 — "깡쯔"는 이제 늘
    // "산깡쯔·스깡쯔" 안에서만 나오지만, 그 둘의 풀이가 여전히 그 말을 쓴다.
    const swallowed = (g: (typeof GLOSSARY)[number]): boolean =>
      shown.some((t) => t !== g.label && t.includes(g.label));
    // 판 위에만 뜨는 표기(hudOnly)는 이 코퍼스에 없는 것이 정상이다 — 증강 텍스트가
    // 아니라 대국 화면이 직접 찍는 말이라 여기서 걸릴 수가 없다.
    expect(
      GLOSSARY.filter((g) => !hit.has(g.key) && !swallowed(g) && g.hudOnly !== true).map(
        (g) => g.key,
      ),
    ).toEqual([]);
  });
});
