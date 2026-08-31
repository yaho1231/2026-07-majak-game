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

import { kindKey, winningKinds } from "@majak/core";
import { handZone } from "@majak/core";
import type { DecomposeOptions, PlayerId, PlayerView, TileKind } from "@majak/core";

/** 한 상대에 대해 «내 증강이 열어 준» 확정 정보 */
export interface OpponentIntel {
  /** 손패가 통째로 보인다 — 그 손의 정확한 대기(kindKey). 노텐이면 빈 집합 */
  exactWaits?: ReadonlySet<string>;
  /** 이 사람이 텐파이라고 «천리안»이 말했다 (스냅샷) */
  scanTenpai?: boolean;
  /** 그 스냅샷이 몇 순 기준인가 */
  scanTurn?: number;
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
  /** 하나라도 얻은 정보가 있는가 (없으면 호출부가 종전 경로 그대로 간다) */
  any: boolean;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

export const NO_INTEL: BotIntel = {
  byPlayer: new Map(),
  dangerKinds: EMPTY_KEYS,
  dangerTurn: null,
  any: false,
};

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

  return { byPlayer, dangerKinds, dangerTurn, any };
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
