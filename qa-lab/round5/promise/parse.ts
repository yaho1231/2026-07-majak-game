/**
 * B-4 약속 검사기 ① — 카드 설명(description + detail)에서 **기계적으로** 뽑을 수 있는
 * «약속»을 JSON으로 만든다. (docs/55 §4 B-4)
 *
 *   npx tsx qa-lab/round5/promise/parse.ts            → qa-lab/round5/promise/promises.json
 *
 * 무엇을 뽑나 (전부 정규식 — 자연어 전체를 읽지 않는다):
 *  - 횟수형   «게임 내 N회» «동풍전 N회 · 반장전 M회» «매 국 K회» «국에 1회» «상시» «획득 즉시»
 *  - 쿨다운형 «N국에 1회» «동풍전 N국에 1회 · 반장전 M국에 1회» «동풍전 N국 · 반장전 M국에 1회» «N순에 1회»
 *  - 수치형   «+N판» «N배» «N점» «최소 만관»
 *  - 조건형   «리치 중에는 사용할 수 없다» «리치 중에는 쯔모한 패만» «첫 순» «상대에게 공개되지 않는다» «나만» «공개된다»
 *
 * 설명 첫머리 괄호는 이 저장소의 관례로 **사용 한도**를 적는 자리다
 * (`packages/content/test/description_numbers.test.ts` ② 한도 표기). 그 테스트의 정규식
 * (`^\(([^)]*)\)`, `(\d+)국에 1회`, `게임 내 (\d+)회`, `동풍전 (\d+)회 · 반장전 (\d+)회`)을
 * 그대로 다시 쓰고, 그 테스트가 다루지 않는 꼴(쿨다운의 모드 분기·순 단위·라벨 붙은 한도)을
 * 더했다. 괄호 안에서 어느 규칙에도 안 걸린 조각은 `unparsed`에 남겨 사람이 본다.
 *
 * **라벨(label)** — «만개는 동풍전 1회 · 반장전 2회» «상시 열람 · 2국에 1회 교환» 처럼 한도가
 * 카드의 *일부 기능*에만 걸린 것. 액션 횟수와 1:1로 대응하지 않으므로 judge 는 라벨이 붙은
 * 한도를 «관찰»로만 적고 위반으로 올리지 않는다.
 *
 * 117장(content 113 + core standard 4) 전부 출력한다 — 약속이 하나도 없는 카드도
 * `pledges: []` 로 남겨 «못 뽑은 것»이 눈에 보이게 한다.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { standardAugments } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { contentAugments } from "@majak/content";

export type CondKind =
  | "no_riichi" // 리치 중에는 사용할 수 없다
  | "riichi_drawn_only" // 리치 중에는 쯔모한 패만
  | "first_turn" // 국의 첫 순 / 자기 첫 순 / 첫 타패 전
  | "hidden_from_opponents" // 상대에게 공개되지 않는다 / 비밀리에
  | "self_only" // 나만 / 나에게만 (정보 전용 — 판정 없음)
  | "public"; // 모두에게 공개된다

export type Pledge =
  | { kind: "uses_match"; tonpuu: number; hanchan: number; label?: string; src: string }
  | { kind: "uses_round"; perRound: number; label?: string; src: string }
  | { kind: "cooldown_rounds"; tonpuu: number; hanchan: number; label?: string; src: string }
  | { kind: "cooldown_turns"; turns: number; label?: string; src: string }
  | { kind: "always"; label?: string; src: string }
  | { kind: "on_acquire"; src: string }
  | { kind: "han_bonus"; han: number; src: string }
  | { kind: "multiplier"; factor: number; src: string }
  | { kind: "points"; points: number; src: string }
  | { kind: "mangan_floor"; src: string }
  | { kind: "cond"; cond: CondKind; src: string };

export interface CardPromises {
  id: string;
  name: string;
  tier: string;
  category: string;
  modes: readonly string[] | null;
  /** 설명 첫머리 괄호 안 (없으면 null) */
  head: string | null;
  pledges: Pledge[];
  /** 괄호 안에서 어느 규칙에도 안 걸린 조각 */
  unparsed: string[];
}

export interface PromisesFile {
  generatedAt: string;
  count: number;
  cards: CardPromises[];
  /** 약속이 하나도 안 뽑힌 카드 (사람이 검토) */
  emptyCards: string[];
  /** 괄호에 못 읽은 조각이 남은 카드 */
  unparsedCards: string[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROMISES_PATH = join(HERE, "promises.json");

/** 자릿점 제거 — description_numbers.test.ts 의 flattenCommas 와 같다 */
function flattenCommas(text: string): string {
  let out = text;
  for (;;) {
    const next = out.replace(/(\d),(\d{3})/g, "$1$2");
    if (next === out) return out;
    out = next;
  }
}

/** 괄호 첫머리 — description_numbers.test.ts 와 같은 정규식 */
export function headOf(description: string): string | null {
  return /^\(([^)]*)\)/.exec(description)?.[1] ?? null;
}

/**
 * 괄호 안 한도 규칙. 순서가 중요하다 — 넓은 꼴(모드 분기)이 좁은 꼴(«N국에 1회»)에
 * 먼저 잡히면 안 되므로 긴 것부터 소비한다. 매치한 조각은 head 에서 지워 나간다.
 */
type HeadRule = { re: RegExp; make: (m: RegExpMatchArray) => Pledge | null };

/** 라벨이 있을 때만 `label` 키를 만든다 (exactOptionalPropertyTypes — undefined 를 넣지 않는다) */
const lbl = (s: string | undefined): { label?: string } =>
  s === undefined || s === "" ? {} : { label: s };

const HEAD_RULES: HeadRule[] = [
  // «동풍전 2국에 1회 · 반장전 3국에 1회»  «동풍전 2국에 1회, 반장전 3국에 1회»
  {
    re: /(?:(\S+?)[은는] )?동풍전 (\d+)국에 1회(?: · |, )반장전 (\d+)국에 1회/,
    make: (m) => ({ kind: "cooldown_rounds", tonpuu: Number(m[2]), hanchan: Number(m[3]), ...lbl(m[1]), src: m[0] }),
  },
  // «동풍전 2국 · 반장전 3국에 1회»
  {
    re: /(?:(\S+?)[은는] )?동풍전 (\d+)국 · 반장전 (\d+)국에 1회/,
    make: (m) => ({ kind: "cooldown_rounds", tonpuu: Number(m[2]), hanchan: Number(m[3]), ...lbl(m[1]), src: m[0] }),
  },
  // «동풍전 1회 · 반장전 2회»  «만개는 동풍전 1회 · 반장전 2회»  (description_numbers ② 와 같은 정규식)
  {
    re: /(?:(\S+?)[은는] )?동풍전 (\d+)회 · 반장전 (\d+)회/,
    make: (m) => ({ kind: "uses_match", tonpuu: Number(m[2]), hanchan: Number(m[3]), ...lbl(m[1]), src: m[0] }),
  },
  // «반장전은 게임 내 1회 재장전» — 동풍전에는 없는 재장전
  {
    re: /반장전은 게임 내 (\d+)회 (\S+)/,
    make: (m) => ({ kind: "uses_match", tonpuu: 0, hanchan: Number(m[1]), ...lbl(m[2]), src: m[0] }),
  },
  // «게임 내 N회»
  {
    re: /게임 내 (\d+)회(?: (\S+))?/,
    make: (m) => ({ kind: "uses_match", tonpuu: Number(m[1]), hanchan: Number(m[1]), ...lbl(m[2]), src: m[0] }),
  },
  // «매 국 K회»
  {
    re: /매 국 (\d+)회/,
    make: (m) => ({ kind: "uses_round", perRound: Number(m[1]), src: m[0] }),
  },
  // «재배열은 국에 1회»
  {
    re: /(?:(\S+?)[은는] )?(?<!\d)국에 1회/,
    make: (m) => ({ kind: "uses_round", perRound: 1, ...lbl(m[1]), src: m[0] }),
  },
  // «N국에 1회»  «2국에 1회 교환»  (description_numbers ② 와 같은 정규식 + 라벨)
  {
    re: /(?:(\S+?)[은는] )?(\d+)국에 1회(?: ([^\s·,]+))?/,
    make: (m) => ({ kind: "cooldown_rounds", tonpuu: Number(m[2]), hanchan: Number(m[2]), ...lbl(m[1] ?? m[3]), src: m[0] }),
  },
  // «3순에 1회»  «열람 4순에 1회»
  {
    re: /(?:(\S+?) )?(\d+)순에 1회/,
    make: (m) => ({ kind: "cooldown_turns", turns: Number(m[2]), ...lbl(m[1]), src: m[0] }),
  },
  // «상시»  «상시 열람»
  {
    re: /상시(?: (열람))?/,
    make: (m) => ({ kind: "always", ...lbl(m[1]), src: m[0] }),
  },
  { re: /획득 즉시/, make: (m) => ({ kind: "on_acquire", src: m[0] }) },
  // 첫 순 표기 — 괄호 안에 있으면 조건으로 뽑는다
  { re: /국의 첫 순|자기 첫 순/, make: (m) => ({ kind: "cond", cond: "first_turn", src: m[0] }) },
  // 한도가 아닌 설명 조각 — 읽었다는 표시만 하고 약속은 안 만든다
  {
    re: /리치는 국당 한 번|이번 국만|반장전 전용|동풍전 전용|게임 시작 드래프트에서만 등장|멘젠 한정|횟수 제한 없음|그 국의 첫 리치를 내가 선언할 때/,
    make: () => null,
  },
];

export function parseHead(head: string): { pledges: Pledge[]; unparsed: string[] } {
  const pledges: Pledge[] = [];
  let rest = head;
  for (const rule of HEAD_RULES) {
    // 같은 규칙이 두 번 나올 수 있다(«열람 4순에 1회 · 재배열은 국에 1회»는 다른 규칙이지만
    // 안전하게 반복 소비한다)
    for (let guard = 0; guard < 4; guard++) {
      const m = rule.re.exec(rest);
      if (m === null) break;
      const p = rule.make(m);
      if (p !== null) pledges.push(p);
      rest = rest.slice(0, m.index) + " ¦ " + rest.slice(m.index + m[0].length);
    }
  }
  const unparsed = rest
    .split(/¦|·|,/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return { pledges, unparsed };
}

/** 본문(description + detail)에서 수치·조건을 뽑는다 */
export function parseBody(description: string, detail: string): Pledge[] {
  const out: Pledge[] = [];
  const both = flattenCommas(`${description}\n${detail}`);
  const seen = new Set<string>();
  const push = (p: Pledge): void => {
    const key = JSON.stringify({ ...p, src: undefined });
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  // «+N판»  «N판이 붙는다»  «N판이 추가된다»  «N판을 얻는다»  («N판으로 취급»은 보너스가 아니다)
  for (const m of both.matchAll(/\+(\d+)판|(\d+)판(?:이|을) (?:붙|추가|더해|얻|받)/g)) {
    push({ kind: "han_bonus", han: Number(m[1] ?? m[2]), src: m[0] });
  }
  // «N배»
  for (const m of both.matchAll(/(\d+(?:\.\d+)?)배/g)) {
    push({ kind: "multiplier", factor: Number(m[1]), src: m[0] });
  }
  // «N점» (기록만 — 판정 대상은 아니다)
  for (const m of both.matchAll(/(\d+)점/g)) {
    push({ kind: "points", points: Number(m[1]), src: m[0] });
  }
  if (/최소 만관/.test(both)) push({ kind: "mangan_floor", src: "최소 만관" });

  // 조건형
  const condRe: [CondKind, RegExp, string][] = [
    [
      "no_riichi",
      /리치 중에는 (?:사용할 수 없다|쓸 수 없다|선언할 수 없다|발동하지 않는다|사용할 수 없고)|리치 중(?:이거나|이면|에도)[^.]*사용할 수 없다|리치 중,[^.]*사용할 수 없다/,
      "description+detail",
    ],
    ["riichi_drawn_only", /리치 중에는 (?:방금 )?쯔모한 패(?:만|에만)/, "description+detail"],
    ["hidden_from_opponents", /(?:상대에게|모두에게|전원에게) 공개되지 않는다|비밀리에|나만 안다/, "description+detail"],
    ["public", /모두에게 공개|전원에게 공개|공개된다|전원에게 표시|모두에게 보인다/, "description+detail"],
    ["self_only", /나만|나에게만/, "description+detail"],
  ];
  for (const [cond, re, where] of condRe) {
    const m = re.exec(both);
    if (m !== null) push({ kind: "cond", cond, src: `${where}: ${m[0]}` });
  }
  // «첫 순»은 description 에서만 — detail 은 «첫 순에 빼면 천화가 안 된다» 같은 부연이 섞인다
  const ft = /국의 첫 순|자기 첫 순|내 첫 순|첫 타패 전|국 시작에 발동|첫 순에(?:만| 상대| 발동)/.exec(description);
  if (ft !== null) push({ kind: "cond", cond: "first_turn", src: `description: ${ft[0]}` });
  return out;
}

export function parseCard(def: AugmentDef): CardPromises {
  const head = headOf(def.description);
  const h = head === null ? { pledges: [], unparsed: [] } : parseHead(head);
  const body = parseBody(def.description, def.detail ?? "");
  // 괄호에서 이미 뽑은 first_turn 과 본문의 first_turn 이 겹치면 하나만
  const pledges = [...h.pledges];
  for (const p of body) {
    if (p.kind === "cond" && pledges.some((q) => q.kind === "cond" && q.cond === p.cond)) continue;
    pledges.push(p);
  }
  return {
    id: def.id,
    name: def.name,
    tier: def.tier,
    category: (def as { category?: string }).category ?? "?",
    modes: def.modes ?? null,
    head,
    pledges,
    unparsed: h.unparsed,
  };
}

export function buildPromises(): PromisesFile {
  const all: readonly AugmentDef[] = [...contentAugments, ...standardAugments];
  const cards = all.map(parseCard);
  return {
    generatedAt: new Date().toISOString(),
    count: cards.length,
    cards,
    emptyCards: cards.filter((c) => c.pledges.length === 0).map((c) => c.id),
    unparsedCards: cards.filter((c) => c.unparsed.length > 0).map((c) => c.id),
  };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const file = buildPromises();
  writeFileSync(PROMISES_PATH, `${JSON.stringify(file, null, 2)}\n`);
  const byKind = new Map<string, number>();
  for (const c of file.cards) for (const p of c.pledges) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  console.log(`promises.json: ${file.count} cards → ${PROMISES_PATH}`);
  console.log(`kinds: ${[...byKind].map(([k, n]) => `${k}=${n}`).join(" ")}`);
  console.log(`empty(약속 없음): ${file.emptyCards.length} → ${file.emptyCards.join(", ")}`);
  console.log(`unparsed(괄호 조각 남음): ${file.unparsedCards.length}`);
  for (const c of file.cards) if (c.unparsed.length > 0) console.log(`  ${c.id}: (${c.head}) → ${JSON.stringify(c.unparsed)}`);
}
