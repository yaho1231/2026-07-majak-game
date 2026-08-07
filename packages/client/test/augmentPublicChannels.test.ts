/**
 * 전원 공개 채널이 화면에 자리를 잡았는지 지키는 가드.
 *
 * 배경: 헌장 2번("발동이 테이블에서 보이지 않는 증강은 증강이 아니다")에 걸려 있던
 * 증강 일곱에 콘텐츠 쪽이 공개 채널을 냈다(ae87e47). 그런데 클라에는 그 채널을 아는
 * 코드가 없어서, 전부 📜 기록 맨 아래 "지금 상태"의 **폴백 한 줄**로만 떨어졌다 —
 * 접힌 서랍 안의 회색 글줄은 테이블에서 보이는 것이 아니다. 채널만 내고 그리는 곳을
 * 안 만들면 아무것도 고쳐지지 않는다는 뜻이라, 그 사이가 다시 벌어지지 않게 못을 박는다.
 *
 * 지키는 것은 셋이다.
 * 1. 콘텐츠가 내는 채널 이름이 `view:*:{증강id}:{보유자}` 꼴 그대로인가
 *    (클라의 pill·컷인은 전부 이 꼴을 전제로 접두를 맞춘다).
 * 2. 그 head마다 클라에 **전용 표시**가 있는가 — 이름표 pill(PILL_CUSTOM) 또는 컷인(AUG_EVENTS).
 * 3. 전용 표시가 붙었으면 폴백 로그에서는 빠지는가 (같은 정보가 두 군데 겹치지 않게).
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다(이 패키지에는 jsdom이 없다) —
 * `helpAugment.test.ts`·`resultYakuGlossary.test.ts`와 같은 방식이다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const AUG_DIR = join(HERE, "../../content/src/augments");

/** App.tsx의 `const NAME ... {` 선언 본문 (닫는 줄 전까지) */
function block(header: string, close: string): string {
  const at = SRC.indexOf(header);
  expect(at, header).toBeGreaterThan(0);
  const to = SRC.indexOf(close, at);
  expect(to, header).toBeGreaterThan(at);
  return SRC.slice(at, to);
}

/** 표의 최상위 키만 걷는다 (`  key: {` / `  "key:sub": {` / `  key: (raw) => …`) */
function topKeys(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/^ {2}"?([\w:]+)"?:/gm)) out.add(m[1] as string);
  return out;
}

const PILL_CUSTOM_KEYS = topKeys(block("const PILL_CUSTOM: Record<", "\n};"));
const AUG_EVENT_KEYS = topKeys(block("const AUG_EVENTS: Record<", "\n};"));

/**
 * ae87e47이 낸 공개 채널과, 그것을 받기로 한 자리.
 *
 * - `pill`: 국이 끝날 때까지(또는 매치 내내) **계속 보여야 하는 상태**.
 *   조약이 살아 있는지·론이 막혔는지·문턱이 얼마인지·각인한 숫자가 몇인지는
 *   한 번 스치고 사라지면 정작 필요한 순간(론을 누르려는 순간, 깡을 치는 순간)에 없다.
 * - `cutin`: 그 순간에만 뜻이 있는 **사건**. 무엇이 무엇으로 바뀌었는지가 전부다.
 */
const CHANNELS: { id: string; where: "pill" | "cutin" }[] = [
  { id: "unification", where: "pill" },
  { id: "no_ron_pact", where: "pill" },
  { id: "invincible", where: "pill" },
  { id: "red_five_touch", where: "pill" },
  { id: "rinshan_preview", where: "pill" },
  { id: "tile_dyeing", where: "cutin" },
  { id: "alchemist", where: "cutin" },
];

describe("증강 전원 공개 채널의 자리", () => {
  it.each(CHANNELS)("$id — 콘텐츠가 view:*:{id}:{보유자} 꼴로 낸다", ({ id }) => {
    const src = readFileSync(join(AUG_DIR, `${id}.ts`), "utf8");
    // `viewKey("*", ...)`(매치 유지) 또는 `roundViewKey("*", ...)`(국 스코프) 중 하나로,
    // 채널 이름 앞머리가 증강 id여야 한다 — 클라는 이 접두로만 채널을 찾는다.
    const opened = [...src.matchAll(/\b(?:round)?[vV]iewKey\(\s*"\*"\s*,\s*`([^`]+)`/g)].map(
      (m) => m[1] as string,
    );
    const heads = opened.map((tpl) => tpl.replace(/\$\{ID\}/g, id).split(":")[0]);
    expect(heads, `${id}: 공개 채널이 없다`).toContain(id);
  });

  it.each(CHANNELS.filter((c) => c.where === "pill"))(
    "$id — 이름표 pill에 상태로 선다 (폴백 로그가 아니라)",
    ({ id }) => {
      expect(PILL_CUSTOM_KEYS, `PILL_CUSTOM에 ${id}가 없다`).toContain(id);
    },
  );

  it.each(CHANNELS.filter((c) => c.where === "cutin"))(
    "$id — 발동 순간 컷인으로 뜬다",
    ({ id }) => {
      expect(AUG_EVENT_KEYS, `AUG_EVENTS에 ${id}가 없다`).toContain(id);
    },
  );

  it("전용 표시가 있는 head는 폴백 로그에서 빠진다", () => {
    // 두 집합은 표에서 자동으로 만들어져야 한다. 손으로 다시 적으면 표에 증강을
    // 더할 때마다 한쪽만 갱신돼 같은 줄이 두 군데 뜬다.
    const owned = block("const PILL_OWNED_HEADS: ReadonlySet<string>", "\n]);");
    expect(owned).toContain("...Object.keys(PILL_CUSTOM)");
    const evHeads = block("const AUG_EVENT_HEADS: ReadonlySet<string>", "\n]);");
    expect(evHeads).toContain("Object.keys(AUG_EVENTS)");
    // 그리고 로그 쪽이 두 집합을 실제로 걸러야 의미가 있다.
    expect(SRC).toContain("if (PILL_OWNED_HEADS.has(head)) continue;");
    expect(SRC).toContain("if (AUG_EVENT_HEADS.has(head)) continue;");
  });
});

describe("컷인 접두 매칭의 안전장치", () => {
  it("꼬리가 좌석 id인 채널만 사건으로 본다", () => {
    /*
     * 염색·연금술사는 접두를 공유하는 채널이 둘이다 — 공개 `tile_dyeing:{보유자}`와
     * 보유자 전용 잔량 `tile_dyeing:left`. 접두만 보면 잔량이 줄 때마다 컷인이 터지고
     * 사람 이름 자리에 "left"가 앉는다. 그래서 꼬리를 좌석 id로 검사한다.
     */
    expect(SRC).toContain("const tail = key.slice(def.prefix.length + 1);");
    expect(SRC).toContain("if (!(next.players ?? []).some((p) => p.id === tail)) continue;");
  });

  it("바뀌기 전→후를 컷인에 두 장으로 편다", () => {
    // 채널 값이 "man3→pin3"이라 통째로 파싱하면 null — 패가 한 장도 안 뜬다.
    const fn = block("function augEventTiles(", "\n}");
    expect(fn).toContain('raw.includes("→")');
  });
});

describe("공개해서는 안 되는 것", () => {
  it("영상 정찰은 맞바꾼 패를 흘리지 않는다", () => {
    // 왕패는 원래 안 보이는 것이 맞다. 채널이 싣는 것도 사실 한 줄뿐이라,
    // 클라가 패를 그리려 들면 없는 정보를 지어내는 셈이 된다.
    const src = readFileSync(join(AUG_DIR, "rinshan_preview.ts"), "utf8");
    const pub = /augmentDataSet\(\s*pullViewKey\([^)]*\)\s*,\s*"([^"]*)"/.exec(src);
    expect(pub?.[1], "공개 채널 값이 바뀌었다 — 패가 새는지 다시 본다").toBe(
      "영상패 맨 앞을 자기 쯔모패와 맞바꿨다",
    );
    // 클라 쪽도 이 채널을 컷인(패를 함께 띄우는 자리)에 올리지 않는다.
    expect(AUG_EVENT_KEYS).not.toContain("rinshan_preview");
  });
});
