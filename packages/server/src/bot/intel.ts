/**
 * **봇이 자기 정보 증강으로 얻은 것을 실제로 쓴다** (QA synergy4 A-14).
 *
 * 4라운드 실측: 투시 60회·천리안 258회·지뢰 탐지 296회를 발동하고도 **30/30판 결과가
 * 완전히 동일**했다. 봇 코드 어디에도 정보 채널을 읽는 곳이 없었기 때문이다 — 티어와
 * 아레나 밸런스가 그 «정확히 0» 위에서 정보 카드를 재고 있었다.
 *
 * ## 치트 방지 경계 — 무엇을 «합법»으로 보았나
 *
 * 여기서 읽는 것은 **뷰에 실려 온 것뿐**이다. 서버 상태(`GameState`)도, 남의 뷰도,
 * 남의 `augmentData`도 보지 않는다. 근거는 뷰 생성기(`core/information/PlayerView.ts`)가
 * 이미 좌석별로 잘라 놓았다는 사실이다:
 *
 *  1. `view.tiles` — `collectVisibleTileIds`가 고른, **이 뷰어에게 공개된 패**만 들어
 *     있다. 투시(`xray_hand`)는 `visibility.hand` 모디파이어로 상대 손패를 보유자에게
 *     "public"으로 열어 주고, 그 결과가 여기 실린다. 안 열린 손패는 id는 있어도
 *     `view.tiles[id]`가 없다 — 그래서 「보이는 것만 읽는다」가 코드 수준에서 보장된다.
 *  2. `view.augmentView` — `view:{나}:*`(내 전용) 과 `view:*:*`(전원 공개) 채널만
 *     담긴다. 남의 전용 채널은 관전 뷰에만 실린다. 지뢰 탐지·천리안의 결과는 정확히
 *     내 전용 채널이므로, 그 좌석이 **자기 증강으로 산 정보**다.
 *
 * 즉 이 파일은 새 정보를 만들지 않는다 — **사람 플레이어가 자기 화면에서 이미 보고
 * 있는 것**을 봇도 보게 할 뿐이다. 남의 좌석 뷰나 상태를 참조하는 코드는 여기 없다.
 */

import { DEAD_WALL, INDICATOR_BLOCK_SIZE, kindKey, winningKinds } from "@majak/core";
import { discardsZone, doraKindFor, handZone } from "@majak/core";
import type { DecomposeOptions, PlayerId, PlayerView, TileKind } from "@majak/core";

/** 한 상대에 대해 «내 증강이 열어 준» 확정 정보 */
export interface OpponentIntel {
  /** 손패가 통째로 보인다 — 그 손의 정확한 대기(kindKey). 노텐이면 빈 집합 */
  exactWaits?: ReadonlySet<string>;
  /** 이 사람이 텐파이라고 «천리안»이 말했다 (스냅샷) */
  scanTenpai?: boolean;
  /** 그 스냅샷이 몇 순 기준인가 */
  scanTurn?: number;
  /**
   * **이 사람의 버림패가 나에게 다 보이지 않는다** (안개 덮인 바닥·박무를 이 사람이
   * 켰다). 현물·스지가 실제보다 얕게 잡히므로, 그 얕음을 «안전하다»로 읽으면 안 된다.
   */
  riverHidden?: boolean;
}

/** 이번 결정에서 쓸 수 있는 정보 증강의 산출물 전부 */
export interface BotIntel {
  byPlayer: Map<PlayerId, OpponentIntel>;
  /**
   * **지뢰 탐지**가 「지금 버리면 쏘인다」고 찍어 준 내 손패 종류(kindKey).
   * 선언 순의 스냅샷이라 나이를 함께 들고 다닌다.
   */
  dangerKinds: ReadonlySet<string>;
  dangerTurn: number | null;
  /**
   * **내 다음 쯔모** — 확정된 종류를 순서대로 (index 0 = 가장 가까운 쯔모).
   * 삼세 예지(`triple_peek`)·예지(`foresight`)가 채운다. 없으면 빈 배열.
   */
  myDraws: TileKind[];
  /**
   * 왕패가 나에게 열려 있을 때 읽는 것 (왕패의 주인·영상 정찰·이면투시 발동 중).
   * 보이지 않으면 전부 null이다.
   */
  deadWall: {
    /** 다음 깡의 영상패 (왕패 0번) */
    rinshan: TileKind | null;
    /** 다음 깡으로 뒤집힐 도라 «표시패»가 가리키는 도라 종류 */
    nextDora: TileKind | null;
  };
  /** 이면투시로 확인한 뒷도라 «종류» (표시패가 아니라 도라 자체) */
  uraDoraKinds: TileKind[];
  /** 지금 내 버림패가 상대에게 가려져 있는가 (안개 덮인 바닥·박무를 내가 켰다) */
  myRiverHidden: boolean;
  /** 하나라도 얻은 정보가 있는가 (없으면 호출부가 종전 경로 그대로 간다) */
  any: boolean;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

export const NO_INTEL: BotIntel = {
  byPlayer: new Map(),
  dangerKinds: EMPTY_KEYS,
  dangerTurn: null,
  myDraws: [],
  deadWall: { rinshan: null, nextDora: null },
  uraDoraKinds: [],
  myRiverHidden: false,
  any: false,
};

/** kindKey("man5") → TileKind. 형식이 어긋나면 null (채널은 문자열로 온다) */
export function parseKindKey(key: string): TileKind | null {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return null;
  const rank = Number(m[2]);
  if (!Number.isInteger(rank) || rank <= 0) return null;
  return { suit: m[1] as string, rank };
}

/** 채널이 문자열 배열이면 TileKind 배열로 (모양이 다르면 빈 배열) */
function kindsFromChannel(raw: unknown): TileKind[] {
  if (!Array.isArray(raw)) return [];
  const out: TileKind[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const k = parseKindKey(x);
    if (k !== null) out.push(k);
  }
  return out;
}

/**
 * 그 사람의 손패가 **내 뷰에서 전부 보이는가**, 보이면 그 종류들.
 * 한 장이라도 가려져 있으면 null(부분 정보로 대기를 추정하지 않는다).
 */
function visibleHandOf(view: PlayerView, p: PlayerId): TileKind[] | null {
  const ids = view.zones[handZone(p)]?.tileIds ?? [];
  const hidden = view.zones[handZone(p)]?.hiddenCount ?? 0;
  if (ids.length === 0 || hidden > 0) return null;
  const kinds: TileKind[] = [];
  for (const id of ids) {
    const k = view.tiles[id]?.kind;
    if (k === undefined) return null; // 가려진 패 — 부분 정보로는 읽지 않는다
    kinds.push(k);
  }
  return kinds;
}

/** 천리안(`tenpai_scan`) 결과 채널의 모양 */
interface ScanResult {
  players?: unknown;
  turn?: unknown;
}

/** 지뢰 탐지(`danger_sense`) 결과 채널의 모양 */
interface DangerResult {
  kinds?: unknown;
  turn?: unknown;
}

/**
 * 이번 뷰에서 읽을 수 있는 정보 증강 산출물을 모은다.
 *
 * 채널 이름은 증강이 발행하는 그대로다(`roundViewKey(holder, ID)` → `augmentView[ID]`).
 * 모양이 다르면 조용히 무시한다 — 정보가 없는 것과 같은 자리로 떨어질 뿐이다.
 */
export function readIntel(
  view: PlayerView,
  me: PlayerId,
  opts?: DecomposeOptions,
): BotIntel {
  const byPlayer = new Map<PlayerId, OpponentIntel>();
  let any = false;

  // ① 손패가 열린 상대 — 정확한 대기를 그대로 계산한다 (투시·염탐 등 무엇이 열었든)
  for (const p of view.players) {
    if (p.id === me) continue;
    const hand = visibleHandOf(view, p.id);
    if (hand === null) continue;
    const meldCount = view.round.byPlayer[p.id]?.meldCount ?? 0;
    const waits = winningKinds(hand, meldCount, undefined, opts);
    byPlayer.set(p.id, { exactWaits: new Set(waits.map(kindKey)) });
    any = true;
  }

  // ② 천리안 — 「누가 텐파이인가」 (대기 내용은 주지 않는다)
  const scan = view.augmentView["tenpai_scan"] as ScanResult | undefined;
  if (scan !== undefined && Array.isArray(scan.players)) {
    const listed = new Set(scan.players.filter((x): x is string => typeof x === "string"));
    const scanTurn = typeof scan.turn === "number" ? scan.turn : undefined;
    for (const p of view.players) {
      if (p.id === me) continue;
      const cur = byPlayer.get(p.id) ?? {};
      byPlayer.set(p.id, {
        ...cur,
        scanTenpai: listed.has(p.id),
        ...(scanTurn === undefined ? {} : { scanTurn }),
      });
      any = true;
    }
  }

  // ③ 지뢰 탐지 — 「내 손패 중 지금 버리면 쏘이는 것」
  let dangerKinds: ReadonlySet<string> = EMPTY_KEYS;
  let dangerTurn: number | null = null;
  const danger = view.augmentView["danger_sense"] as DangerResult | undefined;
  if (danger !== undefined && Array.isArray(danger.kinds)) {
    dangerKinds = new Set(danger.kinds.filter((x): x is string => typeof x === "string"));
    dangerTurn = typeof danger.turn === "number" ? danger.turn : null;
    if (dangerKinds.size > 0) any = true;
  }

  // ④ 선언 간파 — 리치 중인 상대의 **정확한 대기**를 사 두었다.
  //    리치 손은 얼어 있으므로 이 스냅샷은 나이를 먹지 않는다(안깡만이 예외라
  //    실효적으로 무시할 수 있다). 손패가 통째로 보이는 상대(①)가 이미 있으면
  //    그쪽이 더 새 정보이므로 덮지 않는다.
  for (const [ch, raw] of Object.entries(view.augmentView)) {
    if (!ch.startsWith("waits:")) continue;
    const target = ch.slice("waits:".length) as PlayerId;
    if (target === me || !Array.isArray(raw)) continue;
    if (view.players.find((p) => p.id === target) === undefined) continue;
    const cur = byPlayer.get(target) ?? {};
    if (cur.exactWaits !== undefined) continue;
    byPlayer.set(target, {
      ...cur,
      exactWaits: new Set(raw.filter((x): x is string => typeof x === "string")),
    });
    any = true;
  }

  // ⑤ 상대의 바닥이 나에게 가려져 있는가 — 안개 계열의 **반대 방향**.
  //    현물·스지가 실제보다 얕게 잡히는 자리라, 그 얕음을 안전으로 읽으면 안 된다.
  for (const p of view.players) {
    if (p.id === me) continue;
    if ((view.zones[discardsZone(p.id)]?.hiddenCount ?? 0) <= 0) continue;
    byPlayer.set(p.id, { ...(byPlayer.get(p.id) ?? {}), riverHidden: true });
    any = true;
  }

  // ⑥ 내 다음 쯔모 — 삼세 예지가 이미 «내 몫»으로 잘라 준다(후로·밑장빼기 보정 포함).
  let myDraws = kindsFromChannel(view.augmentView["triple_peek"]);
  // 예지는 «패산 앞 4장»이라 좌석 배분이 안 돼 있다 — 내 몫만 골라낸다.
  const foresight = kindsFromChannel(view.augmentView["foresight_peek"]);
  if (foresight.length > 0) {
    const mineOnly = foresightMine(view, me, foresight);
    if (mineOnly.length > myDraws.length) myDraws = mineOnly;
  }
  if (myDraws.length > 0) any = true;

  // ⑦ 왕패가 열려 있으면 — 다음 영상패와 다음 도라를 그대로 읽는다.
  const deadWall = readDeadWall(view);
  if (deadWall.rinshan !== null || deadWall.nextDora !== null) any = true;

  // ⑧ 이면투시 — 뒷도라 «표시패»를 봤다. 도라 자체로 옮겨 둔다.
  const uraDoraKinds = kindsFromChannel(view.augmentView["ura"]).map(doraKindFor);
  if (uraDoraKinds.length > 0) any = true;

  // ⑨ 내가 내 바닥을 가렸는가 — 상대가 내 버림을 못 읽는다(발동 사실은 전원 공개 채널).
  const myRiverHidden =
    isFogNotice(view.augmentView[`hidden_river:${me}`]) ||
    isFogNotice(view.augmentView[`brief_fog:${me}`]);
  if (myRiverHidden) any = true;

  return {
    byPlayer,
    dangerKinds,
    dangerTurn,
    myDraws,
    deadWall,
    uraDoraKinds,
    myRiverHidden,
    any,
  };
}

/** 안개 계열의 전원 공개 마커 — 비어 있지 않은 문자열이면 «지금 안개 중» */
function isFogNotice(raw: unknown): boolean {
  return typeof raw === "string" && raw !== "";
}

/**
 * 예지(`foresight`)가 연 **패산 앞 N장** 중 내 몫만 고른다.
 *
 * 패산 index 0을 가져가는 자리는 삼세 예지가 쓰는 규칙과 같다 — `turn.draw`면 지금
 * 자리 자신, 그 밖이면 다음 자리(현재 자리는 이미 뽑았거나 후로로 안 뽑는다).
 * 거기서 `direction`으로 한 칸씩 돌린다.
 *
 * **밑장빼기가 예약된 좌석이 하나라도 있으면 통째로 포기한다.** 그 좌석은 앞을
 * 소모하지 않고 최후미를 뽑으므로 뒤따르는 배분이 한 칸씩 밀린다 — 그 자리에서
 * 예고를 우기면 봇이 «틀린 정보를 확신 있게» 쓰게 된다(카드 자신이 같은 함정을
 * 2026-08-23에 밟았다). 예약 사실은 전원 공개 채널이라 읽는 것 자체는 합법이다.
 */
function foresightMine(
  view: PlayerView,
  me: PlayerId,
  front: readonly TileKind[],
): TileKind[] {
  for (const p of view.players) {
    if (view.augmentView[`bottom_deal:armed:${p.id}`] === true) return [];
  }
  const n = view.players.length;
  if (n === 0) return [];
  const dir = view.round.direction === -1 ? -1 : 1;
  const mySeat = view.players.find((p) => p.id === me)?.seat;
  if (mySeat === undefined) return [];
  const firstSeat =
    view.round.phase === "turn.draw"
      ? view.round.turnSeat
      : (((view.round.turnSeat + dir) % n) + n) % n;
  const out: TileKind[] = [];
  for (let i = 0; i < front.length; i++) {
    const seat = (((firstSeat + i * dir) % n) + n) % n;
    const kind = front[i];
    if (seat === mySeat && kind !== undefined) out.push(kind);
  }
  return out;
}

/**
 * 왕패가 나에게 열려 있을 때 읽는 것 (왕패의 주인·영상 정찰·이면투시 발동 중).
 *
 * 왕패 배열의 뜻은 코어가 정한 그대로다 — **0번이 다음 영상패**이고, k번째 도라
 * 표시패는 `길이 − 10 + 2k`다(`doraIndicatorIndex`). 다음 깡이 뒤집을 표시패는
 * 지금 표시패 수 k의 자리이므로 그 한 장만 본다.
 *
 * 안 열려 있으면 `view.tiles`에 그 id가 없어 전부 null로 떨어진다 — 가려진 도라
 * (`dora_conceal`)에 걸린 표시패는 뷰가 아예 **자리표**로 바꿔 두므로 여기서도 null이다.
 */
function readDeadWall(view: PlayerView): { rinshan: TileKind | null; nextDora: TileKind | null } {
  const ids = view.zones[DEAD_WALL]?.tileIds ?? [];
  if (ids.length === 0) return { rinshan: null, nextDora: null };
  const rinshanId = ids[0];
  const rinshan = rinshanId === undefined ? null : (view.tiles[rinshanId]?.kind ?? null);
  const k = view.round.doraIndicators.length;
  const idx = ids.length - INDICATOR_BLOCK_SIZE + k * 2;
  const indicatorId = idx >= 0 && idx < ids.length ? ids[idx] : undefined;
  const indicator = indicatorId === undefined ? undefined : view.tiles[indicatorId]?.kind;
  return {
    rinshan,
    nextDora: indicator === undefined ? null : doraKindFor(indicator),
  };
}

/**
 * 스냅샷 정보의 **나이**. 몇 순 지나면 조용히 틀린 정보가 되므로(상대가 새로
 * 텐파이한다) 오래된 스캔은 약하게만 믿는다. 카드 설명이 사람에게 「N순 기준」이라고
 * 밝히는 것과 같은 취급이다.
 */
export function snapshotTrust(turn: number, snapTurn: number | undefined): number {
  if (snapTurn === undefined) return 0.6;
  const age = Math.max(0, turn - snapTurn);
  if (age <= 1) return 1;
  if (age <= 3) return 0.75;
  if (age <= 6) return 0.5;
  return 0.3;
}
