/**
 * winShape — **채택된 채점 변형을 화면이 그릴 수 있는 몸통 목록으로** 옮긴다.
 *
 * 결과 화면은 화료한 손을 그냥 정렬해서 늘어놓았다. 표준 손이면 그것으로 읽히지만,
 * 손 모양 규칙을 바꾸는 증강(동수의 결속·비대칭·부숴진 벽·양극·조커…)으로 난 손은
 * 정렬만 하면 **왜 이게 화료인지 아무 데도 안 남는다** — 2만2삭5만5통6만6삭8만8통이
 * 그냥 2만5만6만8만2삭6삭5통8통으로 늘어서서, 화면만 보면 텐파이도 아닌 손이 난 것처럼
 * 보였다(2026-08-18 사용자 보고).
 *
 * 여기서 만드는 것은 **표시 전용**이다. 채점은 이미 끝나 있고(evaluate), 이 함수는
 * 채택된 변형(ScoringVariant)을 몸통 단위로 다시 늘어놓기만 한다.
 *
 * 조커: 변형의 `handKinds`는 조커가 **변한 뒤**의 손이라, 여기 실리는 kind도 조커가
 * 변한 결과다(백이 5만이 됐으면 5만). 화면이 실물 패에 붙일 때 짝이 안 맞는 자리가
 * 조커라는 사실은 클라이언트가 남은 패로 알아낸다.
 */

import { Suits, kindKey } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";
import type { ScoringVariant, WinContext } from "./WinContext.js";

/** 표시 순서 — 만·통·삭·풍·삼원, 같은 무늬면 랭크 순 (클라이언트 정렬과 같은 기준) */
const SUIT_ORDER: Record<string, number> = {
  [Suits.Man]: 0,
  [Suits.Pin]: 1,
  [Suits.Sou]: 2,
  [Suits.Wind]: 3,
  [Suits.Dragon]: 4,
};

function kindOrder(kind: TileKind): number {
  return (SUIT_ORDER[kind.suit] ?? 9) * 100 + kind.rank;
}

/**
 * 몸통을 읽기 좋은 순서로 세운다.
 * - 몸통끼리: 첫 패 순 (손패를 정렬해서 보던 눈이 그대로 따라온다)
 * - 몸통 안: 커쯔·머리·국사는 정렬하고, **슌쯔는 그대로 둔다** — 순환 슌쯔(8-9-1)는
 *   정렬하면 1-8-9가 되어 왜 슌쯔인지 못 읽는다.
 */
function ordered(groups: WinShapeGroup[]): WinShapeGroup[] {
  const sorted = groups.map((g) =>
    g.type === "run" ? g : { ...g, tiles: [...g.tiles].sort((a, b) => kindOrder(a) - kindOrder(b)) },
  );
  return sorted.sort(
    (a, b) => kindOrder(a.tiles[0] as TileKind) - kindOrder(b.tiles[0] as TileKind),
  );
}

export type WinShapeGroupType = "run" | "triplet" | "pair" | "single";

export interface WinShapeGroup {
  type: WinShapeGroupType;
  /**
   * 이 몸통의 실제 kind 목록. **순서가 의미를 가진다** — 순환 슌쯔(8-9-1)는 정렬하면
   * 순서가 무너져 왜 슌쯔인지 못 읽는다.
   */
  tiles: TileKind[];
  /** 암각·안깡 (론으로 완성한 커쯔는 false) */
  concealed: boolean;
}

export interface WinShape {
  form: "standard" | "chiitoitsu" | "kokushi";
  /** 손패(후로 제외)의 몸통. 후로는 화면이 이미 따로 그린다 */
  groups: WinShapeGroup[];
}

/** kindKey별 장수 */
function countOf(kinds: readonly TileKind[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of kinds) m.set(kindKey(k), (m.get(kindKey(k)) ?? 0) + 1);
  return m;
}

/** `kinds`에서 `used`를 빼고 남은 패 (원래 순서 유지) */
function remaining(kinds: readonly TileKind[], used: readonly TileKind[]): TileKind[] {
  const left = countOf(used);
  const out: TileKind[] = [];
  for (const k of kinds) {
    const key = kindKey(k);
    const n = left.get(key) ?? 0;
    if (n > 0) left.set(key, n - 1);
    else out.push(k);
  }
  return out;
}

/**
 * 치또이 14장을 실제 쌍으로 가른다. 같은 kind끼리 먼저 묶고(표준 치또이), 남은 것은
 * 랭크가 같은 것끼리 묶는다(비대칭 — 2만+2삭).
 *
 * `variant.pairs`는 쌍마다 **대표 kind 하나**뿐이라(decompose의 asyncChiitoiPairs)
 * 이종 쌍의 짝을 복원할 수 없다. 손패에서 다시 짝짓는 이유다.
 */
function chiitoiPairs(hand: readonly TileKind[]): WinShapeGroup[] | null {
  const rest = [...hand];
  const groups: WinShapeGroup[] = [];
  const takeBy = (match: (a: TileKind, b: TileKind) => boolean): void => {
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i] as TileKind;
      for (let j = i + 1; j < rest.length; j++) {
        const b = rest[j] as TileKind;
        if (!match(a, b)) continue;
        groups.push({ type: "pair", tiles: [a, b], concealed: true });
        rest.splice(j, 1);
        rest.splice(i, 1);
        i -= 1;
        break;
      }
    }
  };
  takeBy((a, b) => kindKey(a) === kindKey(b));
  takeBy((a, b) => a.suit !== b.suit && a.rank === b.rank);
  return rest.length === 0 ? groups : null;
}

/** 국사 13종 — 2장짜리 머리는 쌍으로, 나머지는 한 장씩 */
function kokushiGroups(hand: readonly TileKind[]): WinShapeGroup[] {
  const seen = new Map<string, TileKind[]>();
  const order: string[] = [];
  for (const k of hand) {
    const key = kindKey(k);
    const arr = seen.get(key);
    if (arr === undefined) {
      seen.set(key, [k]);
      order.push(key);
    } else arr.push(k);
  }
  return order.map((key) => {
    const tiles = seen.get(key) as TileKind[];
    return {
      type: tiles.length >= 2 ? ("pair" as const) : ("single" as const),
      tiles,
      concealed: true,
    };
  });
}

/**
 * 채택된 변형 → 표시용 몸통 목록. 손패로 설명이 안 되면 null (화면은 종전대로 정렬만 한다).
 *
 * @param variant evaluate가 고른 변형
 * @param ctx     그 변형을 만든 문맥 (후로 개수만 본다)
 */
export function winShapeOf(variant: ScoringVariant, ctx: WinContext): WinShape | null {
  const hand = variant.handKinds ?? [...ctx.hand];

  if (variant.form === "chiitoitsu") {
    const groups = chiitoiPairs(hand);
    return groups === null ? null : { form: "chiitoitsu", groups: ordered(groups) };
  }
  if (variant.form === "kokushi") {
    return { form: "kokushi", groups: ordered(kokushiGroups(hand)) };
  }

  // standard — `sets`는 손패 몸통 뒤에 후로 몸통이 붙은 순서다(buildVariants).
  const handSetCount = variant.sets.length - ctx.melds.length;
  if (handSetCount < 0) return null;
  const handSets = variant.sets.slice(0, handSetCount);
  const groups: WinShapeGroup[] = handSets.map((s) => ({
    type: s.type,
    tiles: [...s.tiles],
    concealed: s.concealed,
  }));

  /*
   * 머리는 **남은 두 장**으로 잡는다. `variant.pair`는 kind 하나뿐이라 혼색 머리
   * (2만+2통, scoring.mixedPairs)의 짝을 복원하지 못한다 — decompose가 대표 한쪽만
   * 싣고 지나가기 때문이다.
   */
  const rest = remaining(hand, handSets.flatMap((s) => s.tiles));
  if (rest.length === 2) {
    groups.push({ type: "pair", tiles: rest, concealed: true });
  } else if (variant.pair !== null) {
    groups.push({ type: "pair", tiles: [variant.pair, variant.pair], concealed: true });
  } else {
    return null;
  }

  return { form: "standard", groups: ordered(groups) };
}
