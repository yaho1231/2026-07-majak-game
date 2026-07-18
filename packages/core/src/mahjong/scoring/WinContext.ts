/**
 * WinContext — 화료 순간의 모든 문맥과, 분해 × 화료패 위치 조합으로 만드는
 * 채점 변형(ScoringVariant).
 *
 * 핵심: 론으로 완성된 커쯔는 명각 취급 (산안커·스안커·부 계산),
 * 대기 형태(양면/간짱/변짱/단기/샹퐁)는 변형마다 다르다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §2
 */

import { kindKey, sameKind } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";
import { decompose } from "./decompose.js";
import type { DecompSet, DecomposeOptions } from "./decompose.js";

export interface MeldInfo {
  kind: "chi" | "pon" | "kan_open" | "kan_added" | "kan_closed" | "kokushi_pon";
  /** 치·펑: 3개 / 깡: 4개 (도라 계산에 4장째도 포함) / 울어 국사: 3개(서로 다른 요구패) */
  tiles: TileKind[];
}

export interface WinContext {
  /** 손패 kind 목록 — 화료패 포함, 부로 제외 */
  hand: TileKind[];
  melds: MeldInfo[];
  winningTile: TileKind;
  winType: "tsumo" | "ron";
  /** 1동 2남 3서 4북 */
  seatWind: number;
  prevalentWind: number;
  riichi: { double: boolean; ippatsu: boolean } | null;
  flags?: {
    haitei?: boolean;
    houtei?: boolean;
    rinshan?: boolean;
    chankan?: boolean;
    tenhou?: boolean;
    chihou?: boolean;
  };
  /** 도라 그 자체의 kind (표시패 아님). 없으면 도라 0 */
  doraKinds?: TileKind[];
  /** 리치 화료 시에만 적용 */
  uraDoraKinds?: TileKind[];
  /** 적도라 수 (attrs.red인 패의 수 — 호출자가 센다) */
  redCount?: number;
  /** 화료자 id — 증강이 만든 역이 보유자를 판별할 때 사용 */
  winnerId?: string;
  /** 성립을 금지할 역 id 목록 (win.blockedYaku 규칙에서 유도) */
  blockedYaku?: string[];
  /** 분해 옵션 (scoring.* 규칙에서 유도 — helpers.scoringOptionsOf) */
  options?: DecomposeOptions;
}

export type WaitType =
  | "ryanmen"
  | "kanchan"
  | "penchan"
  | "tanki"
  | "shanpon"
  | "chiitoi"
  | "kokushi";

export interface ScoringSet {
  type: "run" | "triplet";
  /** 대표 3장 (깡도 3장으로 대표, isKan으로 구분) */
  tiles: TileKind[];
  /** 암각/안깡 여부. 론으로 완성된 커쯔는 false */
  concealed: boolean;
  isKan: boolean;
}

export interface ScoringVariant {
  form: "standard" | "chiitoitsu" | "kokushi";
  pair: TileKind | null;
  pairs?: TileKind[];
  /** kokushi: 손패 14장 전체 (sets/pair로 표현이 안 되므로) */
  handKinds?: TileKind[];
  /** standard: 손패 멘쯔 + 부로 멘쯔 통합 */
  sets: ScoringSet[];
  waitType: WaitType;
  isClosed: boolean;
}

function meldToSet(meld: MeldInfo): ScoringSet {
  const first = meld.tiles[0] as TileKind;
  return {
    type: meld.kind === "chi" ? "run" : "triplet",
    tiles: meld.kind === "chi" ? meld.tiles.slice(0, 3) : [first, first, first],
    concealed: meld.kind === "kan_closed",
    // kokushi_pon(울어 국사 특수 부로)은 깡이 아니다. 국사 폼은 이 set을 쓰지 않지만
    // 다른 계산이 깡으로 오인하지 않도록 명시적으로 제외한다.
    isKan:
      meld.kind !== "chi" && meld.kind !== "pon" && meld.kind !== "kokushi_pon",
  };
}

function classifyRunWait(run: DecompSet, winningTile: TileKind): WaitType {
  const [a, b, c] = run.tiles as [TileKind, TileKind, TileKind];
  if (sameKind(b, winningTile)) return "kanchan";
  if (a.rank === 1 && sameKind(c, winningTile)) return "penchan"; // 12 + 3
  if (c.rank === 9 && sameKind(a, winningTile)) return "penchan"; // 89 + 7
  return "ryanmen";
}

/**
 * 분해 전체 × "화료패가 완성한 묶음" 선택지를 곱해 채점 변형을 만든다.
 * 화료 형태가 아니면 빈 배열.
 */
export function buildVariants(ctx: WinContext): ScoringVariant[] {
  const isClosed = ctx.melds.every((m) => m.kind === "kan_closed");
  const meldSets = ctx.melds.map(meldToSet);
  const variants: ScoringVariant[] = [];
  const winKey = kindKey(ctx.winningTile);

  for (const decomp of decompose(ctx.hand, ctx.melds.length, ctx.options)) {
    if (decomp.form === "chiitoitsu") {
      variants.push({
        form: "chiitoitsu",
        pair: null,
        pairs: decomp.pairs ?? [],
        sets: [],
        waitType: "chiitoi",
        isClosed,
      });
      continue;
    }
    if (decomp.form === "kokushi") {
      variants.push({
        form: "kokushi",
        pair: decomp.pair,
        handKinds: [...ctx.hand],
        sets: [],
        waitType: "kokushi",
        isClosed,
      });
      continue;
    }

    // standard: 화료패를 품을 수 있는 곳마다 변형 하나
    const baseSets = decomp.sets;

    if (decomp.pair !== null && kindKey(decomp.pair) === winKey) {
      variants.push({
        form: "standard",
        pair: decomp.pair,
        sets: [
          ...baseSets.map((s) => ({
            type: s.type,
            tiles: s.tiles,
            concealed: true,
            isKan: false,
          })),
          ...meldSets,
        ],
        waitType: "tanki",
        isClosed,
      });
    }

    baseSets.forEach((absorber, i) => {
      if (!absorber.tiles.some((t) => kindKey(t) === winKey)) return;
      const waitType: WaitType =
        absorber.type === "triplet" ? "shanpon" : classifyRunWait(absorber, ctx.winningTile);
      variants.push({
        form: "standard",
        pair: decomp.pair,
        sets: [
          ...baseSets.map((s, j) => ({
            type: s.type,
            tiles: s.tiles,
            // 론으로 완성된 커쯔는 명각 취급
            concealed: !(
              j === i &&
              s.type === "triplet" &&
              ctx.winType === "ron"
            ),
            isKan: false,
          })),
          ...meldSets,
        ],
        waitType,
        isClosed,
      });
    });
  }

  return variants;
}

/** 변형의 모든 패 kind (부·역 판정용. 깡은 3장 대표, 도라 계산에는 쓰지 말 것) */
export function allKinds(variant: ScoringVariant): TileKind[] {
  if (variant.form === "chiitoitsu") {
    return (variant.pairs ?? []).flatMap((k) => [k, k]);
  }
  if (variant.form === "kokushi") {
    return variant.handKinds ?? [];
  }
  const tiles = variant.sets.flatMap((s) => s.tiles);
  return variant.pair !== null ? [...tiles, variant.pair, variant.pair] : tiles;
}
