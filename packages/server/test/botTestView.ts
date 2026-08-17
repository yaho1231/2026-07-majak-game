/**
 * 봇 판단 테스트용 PlayerView 조립기.
 *
 * BotAgent는 뷰 하나만 보고 결정하므로, 엔진을 돌리지 않고 원하는 장면(손패·상대
 * 버림패·리치·도라·패산 잔량)을 손으로 세워 판단만 떼어 검증할 수 있다.
 */

import type { PlayerView, TileId, TileKind } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";

/** "123m45p6s11z" → TileKind[] (z: 1~4=풍, 5~7=삼원) */
export function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

export const PLAYERS = ["p0", "p1", "p2", "p3"] as const;

export interface BotViewOptions {
  /** 홀더(p0)의 손패 */
  hand: string;
  /** 홀더의 후로 (각 3장 스펙). "kan_closed:5555z"처럼 종류를 앞에 붙일 수 있다 */
  melds?: string[];
  /** 플레이어별 버림패 */
  discards?: Partial<Record<string, string>>;
  /** 리치를 선언한 플레이어 */
  riichi?: string[];
  /** 도라 표시패 */
  doraIndicator?: string;
  /** 적도라로 표시할 손패 인덱스 */
  redAt?: number[];
  turnCount?: number;
  /** 패산 잔량 (기본 60) */
  wallLeft?: number;
  /** 홀더가 후리텐인가 */
  furiten?: boolean;
  /** 홀더가 리치 중인가 */
  myRiichi?: boolean;
  /** 리액션 장면 — 누가 무엇을 버렸는가 */
  lastDiscard?: { player: string; spec: string };
  /** 역없음 대기 (다마텐 판단용) */
  noYakuWaits?: string[];
  /**
   * 플레이어별 점수 (기본 전원 25000). 순위 판단(bot/match.ts)을 세우는 데 쓴다 —
   * 같은 손이라도 올라스 선두와 꼴찌는 다르게 쳐야 한다.
   */
  scores?: Partial<Record<string, number>>;
  /** 장풍 1=동 2=남 (기본 동) */
  prevalentWind?: number;
  /** 몇 국인가 (기본 1국). 남4국 = 반장전 올라스 */
  roundNumber?: number;
  /** 공탁 (리치봉) */
  riichiPot?: number;
  /** 본장 */
  honba?: number;
  /**
   * 상대가 눕힌 후로 (각 3장 스펙). 상대 위협 읽기(bot/danger.ts)를 세우는 데 쓴다 —
   * "저 사람이 울었다"는 봇이 보는 공개 정보다.
   */
  oppMelds?: Partial<Record<string, string[]>>;
  /** 리치 선언패가 그 사람 바닥의 몇 번째인가 (= 몇 순에 걸었는가) */
  riichiTileIndex?: Partial<Record<string, number>>;
  /**
   * **쯔모기리로 버린 패**가 그 사람 바닥의 몇 번째인가 (인덱스 목록).
   * 여기 없는 자리는 手出し(손에서 뺀 것)로 읽힌다 — 봇의 손동작 읽기가 보는 값이다.
   */
  tsumogiriAt?: Partial<Record<string, number[]>>;
  /**
   * 플레이어별 보유 증강 id. 뷰의 `PlayerInfo.augments`는 **전원 공개**라
   * (정보 비대칭을 깨지 않는다) 봇의 위협·값어치 계산이 그대로 읽는다.
   */
  augments?: Partial<Record<string, string[]>>;
  /**
   * 증강 **공개 채널**(`view.augmentView`). 개벽이 터졌다·단색 세계가 어느 색을
   * 골랐다처럼 화면에 배너로 뜨는 사건이 여기로 온다 — 봇의 "무엇을 모으는가"
   * 읽기(`bot/collect.ts`)가 그대로 읽는다.
   */
  augmentView?: Record<string, unknown>;
  /** 증강이 넓힌 화료형 옵션 (`view.scoringOptions`) */
  scoringOptions?: PlayerView["scoringOptions"];
}

export interface BotScene {
  view: PlayerView;
  /** 손패 kind로 tileId 찾기 ("5p" 같은 스펙 한 장) */
  idOf(spec: string): TileId;
  /** 손패 전체를 버림 후보로 (내 차례 버림 프롬프트) */
  discardOptions(): ActionOption[];
  /** 손패 전체를 리치 선언패 후보로 */
  riichiOptions(): ActionOption[];
}

/** 원하는 장면의 뷰를 만든다 (홀더는 항상 p0, 좌석 0 = 오야) */
export function botScene(opts: BotViewOptions): BotScene {
  const me = "p0";
  const tiles: PlayerView["tiles"] = {};
  const zones: PlayerView["zones"] = {};
  let nextId = 1;
  const add = (kind: TileKind, red = false): TileId => {
    const id = nextId++;
    tiles[id] = { id, kind, attrs: red ? { red: true } : {} };
    return id;
  };
  const zoneOf = (id: string, kind: string, tileIds: TileId[], owner?: string): void => {
    zones[id] = {
      id,
      kind,
      ...(owner !== undefined ? { owner } : {}),
      tileIds,
      hiddenCount: 0,
    };
  };

  const redAt = new Set(opts.redAt ?? []);
  const handIds = h(opts.hand).map((k, i) => add(k, redAt.has(i)));
  zoneOf(`hand:${me}`, "hand", handIds, me);

  const meldTiles: TileId[] = [];
  // "555z"는 펑, "kan_closed:5555z"처럼 앞에 붙이면 그 종류로 (안깡 등)
  const melds = (opts.melds ?? []).map((spec) => {
    const at = spec.indexOf(":");
    const kind = at < 0 ? "pon" : spec.slice(0, at);
    const ids = h(at < 0 ? spec : spec.slice(at + 1)).map((k) => add(k));
    meldTiles.push(...ids);
    return { kind: kind as "pon", tileIds: ids };
  });
  zoneOf(`melds:${me}`, "melds", meldTiles, me);

  const discardIdsByPlayer: Record<string, TileId[]> = {};
  const oppMeldViews: Record<string, { kind: "pon"; tileIds: TileId[] }[]> = {};
  for (const p of PLAYERS) {
    if (p !== me) {
      const ids: TileId[] = [];
      oppMeldViews[p] = (opts.oppMelds?.[p] ?? []).map((spec) => {
        const mine2 = h(spec).map((k) => add(k));
        ids.push(...mine2);
        return { kind: "pon" as const, tileIds: mine2 };
      });
      zoneOf(`melds:${p}`, "melds", ids, p);
    }
    const discardIds = h(opts.discards?.[p] ?? "").map((k) => add(k));
    discardIdsByPlayer[p] = discardIds;
    zoneOf(`discards:${p}`, "discards", discardIds, p);
  }

  const doraIndicators = opts.doraIndicator === undefined
    ? []
    : h(opts.doraIndicator).map((k) => add(k));

  // 패산은 내용이 보이지 않는다 (장수만)
  zones["wall"] = { id: "wall", kind: "wall", tileIds: [], hiddenCount: opts.wallLeft ?? 60 };

  const byPlayer: PlayerView["round"]["byPlayer"] = {};
  for (const p of PLAYERS) {
    byPlayer[p] = {
      riichiDeclared: p === me ? opts.myRiichi === true : (opts.riichi ?? []).includes(p),
      doubleRiichi: false,
      meldCount: p === me ? melds.length : (oppMeldViews[p]?.length ?? 0),
      melds: p === me ? melds : (oppMeldViews[p] ?? []),
      ...(opts.riichiTileIndex?.[p] !== undefined
        ? { riichiTileIndex: opts.riichiTileIndex[p] }
        : {}),
      tsumogiriIds: (opts.tsumogiriAt?.[p] ?? [])
        .map((i) => discardIdsByPlayer[p]?.[i])
        .filter((id): id is TileId => id !== undefined),
      ...(p === me
        ? {
            furiten: opts.furiten === true,
            furitenReasons: [],
            ...(opts.noYakuWaits !== undefined ? { noYakuWaits: opts.noYakuWaits } : {}),
          }
        : {}),
    };
  }

  let lastDiscard: PlayerView["round"]["lastDiscard"] = null;
  if (opts.lastDiscard !== undefined) {
    const kind = h(opts.lastDiscard.spec)[0];
    if (kind === undefined) throw new Error("lastDiscard spec is empty");
    const id = add(kind);
    const zone = zones[`discards:${opts.lastDiscard.player}`];
    if (zone !== undefined) zone.tileIds = [...zone.tileIds, id];
    lastDiscard = { player: opts.lastDiscard.player, tileId: id };
  }

  const view: PlayerView = {
    playerId: me,
    tiles,
    zones,
    players: PLAYERS.map((id, seat) => ({
      id,
      seat,
      score: opts.scores?.[id] ?? 25000,
      augments: opts.augments?.[id] ?? [],
      nickname: id,
      isBot: true,
    })),
    round: {
      prevalentWind: opts.prevalentWind ?? 1,
      roundNumber: opts.roundNumber ?? 1,
      honba: opts.honba ?? 0,
      riichiPot: opts.riichiPot ?? 0,
      dealerSeat: 0,
      turnSeat: 0,
      turnCount: opts.turnCount ?? 6,
      phase: "turn.act",
      direction: 1,
      doraIndicators,
      lastDiscard,
      myDrawnTile: handIds[handIds.length - 1] ?? null,
      uraDoraIndicators: null,
      byPlayer,
    },
    augmentView: opts.augmentView ?? {},
    scoringOptions: opts.scoringOptions ?? {},
  };

  const idOf = (spec: string): TileId => {
    const want = h(spec)[0];
    if (want === undefined) throw new Error(`bad spec: ${spec}`);
    for (const id of handIds) {
      const k = tiles[id]?.kind;
      if (k !== undefined && k.suit === want.suit && k.rank === want.rank) return id;
    }
    throw new Error(`${spec} not in hand`);
  };

  return {
    view,
    idOf,
    discardOptions: () => handIds.map((tileId) => ({ type: "discard", payload: { tileId } })),
    riichiOptions: () => handIds.map((tileId) => ({ type: "riichi", payload: { tileId } })),
  };
}
