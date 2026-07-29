/**
 * WinContext — 화료 순간의 모든 문맥과, 분해 × 화료패 위치 조합으로 만드는
 * 채점 변형(ScoringVariant).
 *
 * 핵심: 론으로 완성된 커쯔는 명각 취급 (산안커·스안커·부 계산),
 * 대기 형태(양면/간짱/변짱/단기/샹퐁)는 변형마다 다르다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §2
 */

import { Suits, kindKey, sameKind } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";
import { decompose } from "./decompose.js";
import type { DecompSet, DecomposeOptions } from "./decompose.js";

export interface MeldInfo {
  kind: "chi" | "pon" | "kan_open" | "kan_added" | "kan_closed" | "kokushi_pon";
  /** 치·펑: 3개 / 깡: 4개 (도라 계산에 4장째도 포함) / 울어 국사: 3개(서로 다른 요구패) */
  tiles: TileKind[];
  /** 멘젠 유지 후로 (묵계) — 채점 isClosed 판정에서 안깡처럼 손을 열지 않는다 */
  silent?: boolean;
}

export interface WinContext {
  /** 손패 kind 목록 — 화료패 포함, 후로 제외 */
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
  /**
   * 리치를 걸지 않았어도 뒷도라를 센다 (숨은 칼날).
   * 기본은 "리치한 손만 뒷도라"이므로 증강이 이 문을 열 때만 true다.
   */
  uraAlways?: boolean;
  /** 적도라 수 (attrs.red인 패의 수 — 호출자가 센다) */
  redCount?: number;
  /** 화료자 id — 증강이 만든 역이 보유자를 판별할 때 사용 */
  winnerId?: string;
  /** 론이면 쏜 사람 id (창깡이면 깡 선언자). 쯔모면 undefined */
  fromPlayerId?: string;
  /** 쏜 사람이 리치 중인가 (론일 때만 의미 있음) */
  fromRiichi?: boolean;
  /** 성립을 금지할 역 id 목록 (win.blockedYaku 규칙에서 유도) */
  blockedYaku?: string[];
  /**
   * 지금 무장해제된 증강 인스턴스 id 목록 (state의 DISARMED_SOURCES_KEY에서 유도).
   * 여기 실린 source로 등록된 커스텀 역은 성립하지 않는다.
   */
  disarmedSources?: readonly string[];
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
  /** standard: 손패 멘쯔 + 후로 멘쯔 통합 */
  sets: ScoringSet[];
  waitType: WaitType;
  isClosed: boolean;
}

/**
 * 커쯔 후로의 대표 3장. 무늬가 섞인 커쯔(동수의 결속의 2만2통2삭 펑·깡)의 **무늬 구성을
 * 보존**한다 — first를 3번 복제하면 2만2만2만처럼 보여 청일색·혼일색·삼색동각이
 * 헛성립한다. 서로 다른 kind를 앞세우고 모자라면 마지막 것으로 채운다(순수 커쯔는 종전과 동일).
 */
function tripletRepr(tiles: readonly TileKind[]): TileKind[] {
  const uniq = new Map<string, TileKind>();
  for (const t of tiles) if (!uniq.has(kindKey(t))) uniq.set(kindKey(t), t);
  const out = [...uniq.values()].slice(0, 3);
  while (out.length < 3) out.push(out[out.length - 1] as TileKind);
  return out;
}

const NUMBERED = new Set<string>([Suits.Man, Suits.Pin, Suits.Sou]);

/**
 * 양극(scoring.polarEnds)이 만든 **1·9 혼합 커쯔**인가 — 같은 수패 무늬의 1과 9만으로
 * 이뤄진 몸통(199·119·1199 깡). 랭크가 섞여 있어도 **슌쯔가 아니라 커쯔**다.
 * 랭크가 섞인 다른 깡(장사진의 4연속 1234·바람의 계보의 동남서북)은 노두패 아닌 랭크가
 * 반드시 끼거나 자패라서 이 조건에 걸리지 않는다 — 두 계열을 가르는 유일한 안전한 기준이다.
 */
function isPolarBody(tiles: readonly TileKind[]): boolean {
  const first = tiles[0] as TileKind;
  return (
    NUMBERED.has(first.suit) &&
    tiles.every(
      (t) => t.suit === first.suit && (t.rank === 1 || t.rank === 9),
    )
  );
}

function meldToSet(meld: MeldInfo): ScoringSet {
  const first = meld.tiles[0] as TileKind;
  const isKanKind =
    meld.kind !== "chi" && meld.kind !== "pon" && meld.kind !== "kokushi_pon";
  /**
   * **랭크가 서로 다른 깡**(바람의 계보의 동남서북 깡, 장사진의 4연속 깡)은
   * 커쯔가 아니라 **슌쯔성 몸통**이다. 대표 3장을 first로 복제하면 東東東 커쯔처럼 보여
   * 역패·또이또이·산안커·사희가 헛성립하고 안깡 부수(32부)까지 부당하게 붙는다.
   * 랭크 오름차순 앞 3장을 슌쯔로 내보낸다 — 깡 자체(isKan)는 유지되므로
   * 산깡쯔·스깡쯔 카운트와 영상패·새로운 도라는 그대로 동작한다.
   *
   * ⚠ 판정 기준은 **랭크**다. 예외 둘은 진짜 커쯔라 이 분기에 들면 안 된다:
   *  - 동수의 결속: 랭크가 같고 무늬만 섞인 깡(4만4통4삭4만)
   *  - 양극: 같은 무늬의 1·9만 섞인 깡(1만1만9만9만) — `isPolarBody`
   * 둘을 kind/랭크만으로 걸러 내면 또이또이·산안커가 통째로 날아간다.
   */
  if (isKanKind && meld.tiles.some((t) => t.rank !== first.rank) && !isPolarBody(meld.tiles)) {
    const sorted = [...meld.tiles].sort((a, b) => a.rank - b.rank);
    return {
      type: "run",
      tiles: sorted.slice(0, 3),
      concealed: meld.kind === "kan_closed",
      isKan: true,
    };
  }
  return {
    type: meld.kind === "chi" ? "run" : "triplet",
    tiles: meld.kind === "chi" ? meld.tiles.slice(0, 3) : tripletRepr(meld.tiles),
    concealed: meld.kind === "kan_closed",
    // kokushi_pon(울어 국사 특수 후로)은 깡이 아니다. 국사 폼은 이 set을 쓰지 않지만
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
  // 안깡·묵계(silent)는 손을 열지 않는다 — 그 외 후로가 있어야 열린 손.
  const isClosed = ctx.melds.every((m) => m.kind === "kan_closed" || m.silent === true);
  const meldSets = ctx.melds.map(meldToSet);
  const variants: ScoringVariant[] = [];
  const winKey = kindKey(ctx.winningTile);

  for (const decomp of decompose(ctx.hand, ctx.melds.length, ctx.options)) {
    if (decomp.form === "chiitoitsu") {
      variants.push({
        form: "chiitoitsu",
        pair: null,
        pairs: decomp.pairs ?? [],
        // 실제 손패 14장을 함께 실어, 이종 쌍(비대칭 치또이: 1만+1통)이 있어도
        // allKinds가 손패 전체로 무늬·노두·자패를 정확히 판정하게 한다.
        // (표준 치또이는 pairs.flatMap과 동일하므로 영향 없음)
        handKinds: [...ctx.hand],
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
    // 실제 손패가 있으면 그것을 쓴다(비대칭 치또이의 이종 쌍을 정확히 반영).
    // 없으면(구 경로) 종전대로 각 쌍을 동종 2장으로 펼친다.
    if (variant.handKinds !== undefined) return variant.handKinds;
    return (variant.pairs ?? []).flatMap((k) => [k, k]);
  }
  if (variant.form === "kokushi") {
    return variant.handKinds ?? [];
  }
  const tiles = variant.sets.flatMap((s) => s.tiles);
  return variant.pair !== null ? [...tiles, variant.pair, variant.pair] : tiles;
}
