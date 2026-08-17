/**
 * flowEvents — 국 진행의 표준 이벤트와 Reducer.
 * 페이즈 전이는 전부 여기(데이터)에 있다 (Issue 003 해결).
 *
 * 설계: docs/11_GAME_FLOW.md §3
 */

import type { ReducerRegistry } from "../../engine/reducers/ReducerRegistry.js";
import { identityReducer } from "../../engine/reducers/ReducerRegistry.js";
import { setupRound } from "../../engine/state/GameState.js";
import type { GameState, Meld, PlayerRoundState } from "../../engine/state/GameState.js";
import type { RuleRegistry } from "../../engine/rules/RuleRegistry.js";
import {
  DEAD_WALL,
  WALL,
  discardsZone,
  handZone,
  meldsZone,
  moveTiles,
} from "../../engine/zones/Zone.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import { kindKey } from "../tiles/Tile.js";
import type { TileId } from "../tiles/Tile.js";
import { playerAtSeat } from "./helpers.js";

/**
 * 후로가 가져갈 패가 **실제로 놓여 있는 바닥 존**.
 *
 * 보통은 `discardsZone(버린 사람)`이지만, 누명(frame_up)처럼 `TileDiscardedPayload.creditTo`로
 * **패가 놓이는 바닥과 방총 책임을 분리**하는 증강이 있다. 그때 `lastDiscard.player`(=책임자)와
 * 패가 실제로 있는 존이 갈라지므로, `discardsZone(from)`을 그대로 쓰면 moveTiles가
 * "Tile N is not in zone discards:X"로 던져 **국이 통째로 죽는다**.
 *
 * 그래서 존을 이름이 아니라 **실물 위치로** 찾는다. 타일은 항상 정확히 한 존에만 있으므로
 * 결과는 유일하고, players 순회 순서는 고정이라 결정적이다. 못 찾으면 기존 동작(=책임자의
 * 바닥)으로 폴백해 기존 호출자와 완전히 호환된다.
 */
function discardZoneHolding(
  state: GameState,
  tileId: TileId,
  fallback: PlayerId,
): string {
  for (const p of state.players) {
    const zone = discardsZone(p.id);
    if (state.zones[zone]?.tileIds.includes(tileId) === true) return zone;
  }
  return discardsZone(fallback);
}

export const ROUND_STARTED = "RoundStarted";
export const TILE_DRAWN = "TileDrawn";
export const TILE_DISCARDED = "TileDiscarded";
export const CALL_MADE = "CallMade";
export const KAN_DECLARED = "KanDeclared";
export const DORA_FLIPPED = "DoraFlipped";
export const FURITEN_MARKED = "FuritenMarked";
export const TURN_PASSED = "TurnPassed";
export const WIN_DECLARED = "WinDeclared";
export const ROUND_SETTLED = "RoundSettled";

export interface TileDrawnPayload {
  player: PlayerId;
  tileId: TileId;
  rinshan: boolean;
}

export interface TileDiscardedPayload {
  player: PlayerId;
  tileId: TileId;
  riichi: boolean;
  /** 리치일 때 공탁 비용 (Rule은 액션 시점에 읽어 payload에 고정 — Reducer 순수성) */
  riichiCost: number;
  /**
   * 더블리치 강제 플래그 (증강용). 지정하면 "첫 버림" 판정 대신 이 값을 쓴다.
   * Interceptor가 payload를 바꿔 리치를 더블리치로 승격시킬 수 있다.
   */
  riichiDouble?: boolean;
  /**
   * 이 리치를 **본인이 아니라 남이 걸게 만들었는가** — 그 증강 보유자의 id (등 떠밀기).
   *
   * 리듀서는 이 값을 보지 않는다. 순수하게 "누가 시킨 리치인가"를 남기는 표식으로,
   * 인터셉터가 `riichi`를 켜면서 함께 실어 준다. 이게 없으면 리치가 성립한 뒤에는
   * 강제와 자발을 구별할 방법이 없어서, 낙인 대상이 **스스로** 건 리치에도 "등 떠밀기
   * 발동" 연출이 터진다(2026-08-17).
   */
  riichiForced?: PlayerId;
  /**
   * 버림 '명의'를 다른 사람에게 돌린다 (누명). 지정하면 패가 그 사람의 바닥으로 가고
   * 후리텐 근거인 `discardedKinds`도 그 사람에게 기록된다. 손패 출처·방총 책임
   * (`lastDiscard.player`)·턴 진행은 실제로 버린 `player` 그대로다.
   * 미지정(기본)이면 종전과 완전히 동일하게 동작한다.
   */
  creditTo?: PlayerId;
}

export interface CallMadePayload {
  caller: PlayerId;
  from: PlayerId;
  /** kokushi_pon = 울어 국사 전용 특수 후로(서로 다른 요구패 3장) */
  meldKind: "pon" | "chi" | "kokushi_pon";
  /** 손에서 내는 패 */
  handTileIds: TileId[];
  calledTileId: TileId;
  /** 멘젠 유지 후로 (묵계) — 생성되는 후로에 silent 플래그를 단다 */
  silent?: boolean;
}

export interface KanDeclaredPayload {
  player: PlayerId;
  kanKind: "kan_closed" | "kan_open" | "kan_added";
  handTileIds: TileId[];
  calledFrom?: PlayerId;
  calledTileId?: TileId;
  /** 소대명깡(shouminkan)의 경우 기존 pon 후로의 tileId */
  targetMeldTileId?: TileId;
}

export interface DoraFlippedPayload {
  tileId: TileId;
}

export interface FuritenMarkedPayload {
  player: PlayerId;
  permanent: boolean;
}

export interface TurnPassedPayload {
  nextSeat: number;
}

export interface WinDeclaredPayload {
  winner: PlayerId;
  /** null = 쯔모 */
  from: PlayerId | null;
  tileId: TileId;
  winType: "tsumo" | "ron";
}

/** 화료 1건의 채점 상세 — 클라이언트 결과 화면·증강 Interceptor 공용 */
export interface WinInfo {
  winner: PlayerId;
  /** null = 쯔모 */
  from: PlayerId | null;
  winType: "tsumo" | "ron";
  winningTileId: TileId;
  han: number;
  fu: number;
  yakumanCount: number;
  /** score.extraHan 규칙으로 더해진 판 (han에 이미 포함) */
  extraHan: number;
  yaku: { id: string; name: string; han: number }[];
  doraHan: number;
  uraHan: number;
  redHan: number;
  /**
   * 실역 0개로 성립한 화료인가 (무형화료 계열이 `win.requiresYaku`를 껐다).
   *
   * "역 목록이 비었는가"로는 이제 판별할 수 없다 — 이런 손도 도라·보조역으로
   * 판을 세므로 목록에 줄이 설 수 있다. 정산 보상(무형화료 2판)과 결과 화면의
   * "왜 역 없이 화료가 됐는가" 표시가 이 값을 본다.
   */
  yakuless?: boolean;
  /** 화료자 총 획득점 (본장·공탁 제외) */
  points: number;
  /**
   * 본장 가산분 — 이 화료로 더 받는 점수(본장 수 × 본장 단가).
   *
   * `points`가 본장·공탁을 빼고 세는 값이라, 결과 화면의 큰 숫자와 바로 아래 증감표가
   * 서로 다른 숫자를 말했다(2본장·리치봉 1개면 `8,000점` 뒤에 `+9,600`). 단가는
   * `score.honbaPerStick` 규칙이라 본장 사냥꾼이 바꾸므로 300을 가정하면 안 된다.
   */
  honbaBonus?: number;
  /** 이 화료로 회수한 리치봉(공탁) 총액. 더블론이면 첫 화료자만 가져간다. */
  riichiPotGain?: number;
  /**
   * 지불 분담 — 쯔모의 "친 3,900 / 자 2,000씩"이 화면 어디에도 없었다. 증감표는
   * 본장·공탁·증강 이동이 뒤섞인 순증감 하나뿐이라 표준 분담을 되짚을 수 없다.
   */
  payments?: {
    /** 론 — 쏜 사람이 무는 금액 */
    discarder?: number;
    /** 쯔모 — 친이 무는 금액 */
    dealer?: number;
    /** 쯔모 — 자가 각각 무는 금액 */
    others?: number;
  };
  limit: string | null;
  /**
   * 책임지불(파오, 01 §9) — 대삼원·대사희를 확정시킨 후로를 내준 사람이 있으면 그 정보.
   * 없으면 필드 자체가 없다.
   */
  pao?: {
    /** 책임을 진 사람 */
    responsible: PlayerId;
    /** 책임 대상 역 id (daisangen | daisuushii) */
    yakuId: string;
    /** 그 사람이 실제로 문 금액 (본장·공탁 제외) */
    points: number;
  };
}

/**
 * 도중유국(outcome="abort")이 성립한 사유. 결과 화면이 "도중 유국"만 띄우면
 * 왜 국이 끊겼는지 알 수 없어, 사유를 정산 payload에 실어 그대로 보여 준다.
 */
export type AbortReason =
  /** 구종구패 — 배패에 요구패·자패가 9종 이상이라 첫 순에 유국 선언 */
  | "kyushuKyuhai"
  /** 사깡산료 — 서로 다른 두 사람 이상이 깡을 4개 만들었다 */
  | "fourKan"
  /** 사풍연타 — 첫 순에 네 명이 같은 풍패를 버렸다 */
  | "fourWind"
  /** 사가리치 — 네 명이 모두 리치를 걸었다 */
  | "fourRiichi"
  /** 삼가화 — 한 버림패에 세 명이 동시에 론했다 */
  | "tripleRon";

export interface RoundSettledPayload {
  outcome: "win" | "draw" | "abort";
  deltas: Record<PlayerId, number>;
  dealerSeat: number;
  /**
   * 다음 국의 **로테이션 기준 자리** (RoundState.rotationSeat 참조).
   * 생략하면 `dealerSeat`로 폴백한다 — 이 필드가 없던 시절의 리플레이 로그를 위한
   * 호환 경로이므로, 새로 만드는 정산은 세 갈래(화료·유국·도중유국) 모두 명시한다.
   */
  rotationSeat?: number;
  honba: number;
  riichiPot: number;
  roundNumber: number;
  prevalentWind: number;
  /** outcome=win일 때 화료 상세 (트리플론 제외 최대 2건) */
  winInfos?: WinInfo[];
  /**
   * 친이 그대로 이어지는가(연장). `dealerSeat`은 **다음 국**의 친이라, 결과 화면이
   * 이 값만으로는 연장인지 친이 넘어갔는지 되짚을 수 없다 — 판정한 쪽이 실어 준다.
   */
  dealerContinues?: boolean;
  /** outcome=abort일 때 중단 사유 */
  abortReason?: AbortReason;
  /**
   * outcome=draw일 때 **텐파이로 집계된 플레이어** (승승장구의 draw.treatAsTenpai 포함).
   *
   * 이걸 payload에 실어 주지 않으면 유국 정산에 개입하는 증강이 "누가 노텐인가"를
   * `deltas[id] < 0`으로 **추정**해야 한다. 그러면 다른 유국 증강(유국역만 등)이
   * 먼저 돌아 음수를 만들어 놓은 순간 텐파이인 사람까지 노텐으로 오판한다 —
   * 승승장구가 실제로 그랬다(60차 수정).
   */
  tenpaiPlayers?: PlayerId[];
  /**
   * 증강이 정산에서 **점수를 직접 얹거나 뺀 내역** (표시 전용 — deltas에는 이미 반영돼 있다).
   *
   * 정산 인터셉터는 `deltas`만 고치고 지나가므로, 결과 화면에는 "왜 이 숫자가 됐는지"가
   * 아무 데도 남지 않았다 — 뚫린 천장이 화료점을 몇 배로 불려도 화면에는 표준 점수만
   * 떴다(2026-08-02 사용자 보고: "뚫린 천장이 어떤 역할을 하는지 안 보인다").
   * 각 증강이 자기 몫을 한 줄씩 남겨 결과 화면이 그대로 읽어 준다.
   */
  augPoints?: AugPointNote[];
}

/** 증강이 정산에 얹은 점수 한 줄 (결과 화면 표시용) */
export interface AugPointNote {
  /** 이 점수가 오간 사람 (보통 화료자) */
  player: PlayerId;
  /** 증강 id — 화면이 카탈로그에서 이름을 찾는다 */
  augId: string;
  /** 이 증강이 더한 점수 (음수면 뺀 것). 결과 화면의 최종 획득점 합산에 쓴다 */
  points: number;
  /**
   * 화면에 **판으로** 적을 값 (없으면 점수 그대로 적는다).
   *
   * 결과 화면의 역 목록은 전부 "N판" 단위라, 점수로만 적힌 줄은 혼자 튄다.
   * 판으로 말할 수 있는 증강(뚫린 천장 = 만관 위로 인정된 판)은 이 값을 싣는다.
   */
  han?: number;
}

function withPlayerRound(
  state: GameState,
  player: PlayerId,
  patch: (rs: PlayerRoundState) => PlayerRoundState,
): GameState {
  const rs = state.round.byPlayer[player];
  if (rs === undefined) throw new Error(`Unknown player round state: ${player}`);
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: { ...state.round.byPlayer, [player]: patch(rs) },
    },
  };
}

/**
 * @param rules 넘기면 deal.handSize 규칙이 배패 장수에 반영된다 (진짜 용 등).
 *              규칙 합성은 결정적이므로 리플레이에서도 같은 결과가 나온다.
 */
export function registerFlowReducers(
  reducers: ReducerRegistry,
  rules?: RuleRegistry,
): void {
  reducers.register(ROUND_STARTED, (state) =>
    setupRound(state, {
      ...(rules !== undefined && rules.has("deal.handSize")
        ? {
            handSizeFor: (playerId: PlayerId) =>
              rules.resolve<number>("deal.handSize", { playerId, state }),
          }
        : {}),
      // 강제 배패(증강 테스트) — 규칙이 정의돼 있을 때만. 평소에는 없는 규칙이라
      // 무작위 배패 경로가 그대로 유지된다.
      ...(rules !== undefined && rules.has("deal.presetHand")
        ? {
            presetHandFor: (playerId: PlayerId) =>
              rules.resolve<readonly string[]>("deal.presetHand", { playerId, state }),
          }
        : {}),
    }),
  );

  reducers.register(TILE_DRAWN, (state, event) => {
    const p = event.payload as TileDrawnPayload;
    const isDealer = playerAtSeat(state, state.round.dealerSeat).id === p.player;
    const sourceZone = p.rinshan ? DEAD_WALL : WALL;
    let zones = moveTiles(state.zones, sourceZone, handZone(p.player), [p.tileId]);

    // 영상패는 **소모된다** — 패산 최후미에서 보충하지 않는다 (2026-07-26 사용자 확정).
    // 깡 한 번에 왕패 앞이 한 자리씩 비고, 왕패는 14 → 13 → … → 10장으로 줄어든다.
    // 표시패는 밀리지 않는다: 도라·뒷도라 블록은 언제나 왕패의 **마지막 10장**이라
    // 앞이 비어도 같은 물리 패가 그대로 표시패다(인덱스만 당겨진다).
    // 그래서 표시패 자리는 상수(4·6·8…)가 아니라 doraIndicatorIndex()로 구한다.
    // (북풍 상인의 북빼기만은 뽑은 자리를 패산 최후미로 되채운다 — 그쪽 리듀서 참고.)

    // 이번에 뽑는 플레이어가 이미 버림 이력이 있으면 첫 바퀴 종료
    const drawerDiscarded =
      (state.round.byPlayer[p.player]?.discardedKinds.length ?? 0) > 0;

    // 깡이 실제로 완성되는 시점(영상 쯔모)에 전원 일발 소멸 —
    // 선언 시점에 끄면 창깡(가깡 론)의 일발이 부당하게 사라진다 (표준 룰)
    const byPlayer = p.rinshan
      ? Object.fromEntries(
          Object.entries(state.round.byPlayer).map(([id, rs]) => [
            id,
            {
              ...rs,
              riichi: rs.riichi === null ? null : { ...rs.riichi, ippatsu: false },
              temporaryFuriten: id === p.player ? false : rs.temporaryFuriten,
            },
          ]),
        )
      : {
          ...state.round.byPlayer,
          [p.player]: {
            ...state.round.byPlayer[p.player]!,
            temporaryFuriten: false,
          },
        };

    return {
      ...state,
      zones,
      round: {
        ...state.round,
        phase: "turn.act",
        lastDrawnTile: p.tileId,
        lastDrawRinshan: p.rinshan,
        chankan: null,
        turnCount: state.round.turnCount + (isDealer ? 1 : 0),
        firstTurn: state.round.firstTurn && !drawerDiscarded,
        byPlayer,
      },
    };
  });

  reducers.register(TILE_DISCARDED, (state, event) => {
    const p = event.payload as TileDiscardedPayload;
    const discardsBefore =
      state.zones[discardsZone(p.player)]?.tileIds.length ?? 0;
    const discardedKind = state.tiles[p.tileId]?.kind;
    // 누명(creditTo): 패가 놓이는 바닥과 후리텐 이력만 다른 사람 명의로 간다.
    // 손패 출처·방총 책임(lastDiscard.player)·턴 진행은 실제 버린 사람 그대로다.
    const credited = p.creditTo ?? p.player;
    // 쯔모기리 — 방금 쯔모한 패를 손에 넣지 않고 그대로 버렸는가.
    // 판정은 **버리기 직전** 상태로 해야 한다(lastDrawnTile을 아래에서 비우므로).
    const tsumogiri = state.round.lastDrawnTile === p.tileId;
    let next: GameState = {
      ...state,
      zones: moveTiles(state.zones, handZone(p.player), discardsZone(credited), [
        p.tileId,
      ]),
      round: {
        ...state.round,
        phase: "reaction",
        lastDiscard: { player: p.player, tileId: p.tileId },
        lastDrawRinshan: false,
        chankan: null,
        /**
         * 쯔모패는 버리는 순간 "따로 쥔 한 장"이 아니게 된다 — 손버림이었다면
         * 남은 쯔모패가 그대로 손에 섞이고, 쯔모기리였다면 아예 손을 떠난다.
         *
         * 예전에는 여기서 비우지 않아 다음 쯔모까지 값이 살아 있었고, 그 탓에
         * 손버림한 뒤에도 화면에서 쯔모패가 계속 옆으로 떨어져 있다가 **다음 내 차례에야**
         * 손패로 정리됐다 (2026-08-01 사용자 보고).
         *
         * 이 값을 읽는 규칙(리치 쯔모기리 강제·쯔모 화료·깡 가능 여부·쯔모패 교환)은
         * 전부 turn.act에서, 즉 **버리기 전에** 본다. 후로 직후 turn.act에서 이미
         * null인 경우를 다루고 있으므로(standardActions "must draw before calling a kan")
         * 버림 이후 null도 같은 의미로 안전하다.
         */
        lastDrawnTile: null,
      },
    };
    if (tsumogiri) {
      next = withPlayerRound(next, p.player, (rs) => ({
        ...rs,
        tsumogiriIds: [...rs.tsumogiriIds, p.tileId],
      }));
    }
    // 버림 이력 기록 (후로로 바닥에서 사라져도 후리텐 판정에 남는다).
    // 누명이면 지목당한 사람의 이력에 새겨져 그 사람이 후리텐에 걸린다.
    if (discardedKind !== undefined) {
      next = withPlayerRound(next, credited, (rs) => ({
        ...rs,
        discardedKinds: [...rs.discardedKinds, kindKey(discardedKind)],
      }));
    }
    /*
     * 실제 버림 횟수는 **버린 사람**에게 센다 (`credited`가 아니다).
     *
     * "내 몇 번째 순인가"를 `discardedKinds.length`로 세던 증강들이 누명과 만나면
     * 그 값이 0에 고정돼 10순에도 "첫 순"으로 인정됐다(docs/25 P5). 후리텐 이력과
     * 턴 카운터는 애초에 다른 것이라 필드를 나눈다.
     */
    next = withPlayerRound(next, p.player, (rs) => ({
      ...rs,
      discardCount: rs.discardCount + 1,
    }));
    if (p.riichi) {
      next = withPlayerRound(next, p.player, (rs) => ({
        ...rs,
        riichi: {
          double:
            p.riichiDouble ?? (discardsBefore === 0 && !state.round.goAroundBroken),
          ippatsu: true,
          discardIndex: discardsBefore,
          // 자리가 아니라 **그 패**가 표식의 단일 진실이다 — 바닥 중간에서 패를
          // 빼 가는 증강이 지나가도 표식이 따라간다(docs/25 손패 조작 #4).
          discardTileId: p.tileId,
          // 환급 상한의 근거 — 규칙값이 아니라 이번에 실제로 낸 금액이다
          cost: p.riichiCost,
        },
      }));
      next = {
        ...next,
        players: next.players.map((pl) =>
          pl.id === p.player ? { ...pl, score: pl.score - p.riichiCost } : pl,
        ),
        round: { ...next.round, riichiPot: next.round.riichiPot + p.riichiCost },
      };
    } else if (state.round.byPlayer[p.player]?.riichi != null) {
      // 리치자가 화료 없이 다시 버림 → 일발 소멸
      next = withPlayerRound(next, p.player, (rs) => ({
        ...rs,
        riichi: rs.riichi === null ? null : { ...rs.riichi, ippatsu: false },
      }));
    }
    return next;
  });

  reducers.register(CALL_MADE, (state, event) => {
    const p = event.payload as CallMadePayload;
    let zones = moveTiles(
      state.zones,
      // 누명(creditTo)으로 남의 바닥에 심긴 패도 울 수 있어야 한다 — 존을 실물로 찾는다
      discardZoneHolding(state, p.calledTileId, p.from),
      meldsZone(p.caller),
      [p.calledTileId],
    );
    zones = moveTiles(zones, handZone(p.caller), meldsZone(p.caller), p.handTileIds);
    const meld: Meld = {
      kind: p.meldKind,
      tileIds: [...p.handTileIds, p.calledTileId],
      calledFrom: p.from,
      calledTileId: p.calledTileId,
      ...(p.silent === true ? { silent: true } : {}),
    };
    // 후로 발생 → 첫 바퀴 종료, 전원 일발 소멸.
    // 후로한 사람은 자기 수순이 온 것이므로 일시 후리텐 해소 (EMA 통용 룰)
    const byPlayer = Object.fromEntries(
      Object.entries(state.round.byPlayer).map(([id, rs]) => [
        id,
        {
          ...rs,
          riichi: rs.riichi === null ? null : { ...rs.riichi, ippatsu: false },
          melds: id === p.caller ? [...rs.melds, meld] : rs.melds,
          temporaryFuriten: id === p.caller ? false : rs.temporaryFuriten,
        },
      ]),
    );
    return {
      ...state,
      zones,
      round: {
        ...state.round,
        phase: "turn.act",
        turnSeat: state.players.find((x) => x.id === p.caller)?.seat ?? 0,
        goAroundBroken: true,
        firstTurn: false,
        lastDiscard: null,
        lastDrawnTile: null,
        lastDrawRinshan: false,
        chankan: null,
        byPlayer,
      },
    };
  });

  reducers.register(KAN_DECLARED, (state, event) => {
    const p = event.payload as KanDeclaredPayload;
    let zones = state.zones;
    let melds = [...(state.round.byPlayer[p.player]?.melds ?? [])];

    if (p.kanKind === "kan_closed") {
      zones = moveTiles(zones, handZone(p.player), meldsZone(p.player), p.handTileIds);
      melds.push({ kind: "kan_closed", tileIds: p.handTileIds });
    } else if (p.kanKind === "kan_open") {
      // CALL_MADE와 같은 이유로 존을 실물로 찾는다 (누명으로 심긴 패의 대명깡)
      zones = moveTiles(
        zones,
        discardZoneHolding(state, p.calledTileId!, p.calledFrom!),
        meldsZone(p.player),
        [p.calledTileId!],
      );
      zones = moveTiles(zones, handZone(p.player), meldsZone(p.player), p.handTileIds);
      melds.push({
        kind: "kan_open",
        tileIds: [...p.handTileIds, p.calledTileId!],
        calledFrom: p.calledFrom as PlayerId,
        calledTileId: p.calledTileId as TileId,
      });
    } else if (p.kanKind === "kan_added") {
      zones = moveTiles(zones, handZone(p.player), meldsZone(p.player), p.handTileIds);
      const mIdx = melds.findIndex(m => m.kind === "pon" && m.tileIds.includes(p.targetMeldTileId!));
      if (mIdx >= 0) {
        melds[mIdx] = {
          ...melds[mIdx]!,
          kind: "kan_added",
          tileIds: [...melds[mIdx]!.tileIds, ...p.handTileIds],
        };
      }
    }

    const kanCallers = [...state.round.kanCallers, p.player];

    // 일발은 여기서 끄지 않는다 — 깡이 '완성'되는 영상 쯔모(TILE_DRAWN rinshan)
    // 시점에 끈다. 창깡(가깡 론)은 깡 무효이므로 로버의 일발이 유지되어야 한다.
    const byPlayer = Object.fromEntries(
      Object.entries(state.round.byPlayer).map(([id, rs]) => [
        id,
        {
          ...rs,
          melds: id === p.player ? melds : rs.melds,
        },
      ]),
    );

    return {
      ...state,
      zones,
      round: {
        ...state.round,
        phase:
          p.kanKind === "kan_added" || p.kanKind === "kan_closed"
            ? "reaction"
            : "turn.draw",
        turnSeat: state.players.find((x) => x.id === p.player)?.seat ?? 0,
        goAroundBroken: true,
        firstTurn: false,
        lastDiscard: null,
        chankan:
          p.kanKind === "kan_added" || p.kanKind === "kan_closed"
            ? {
                player: p.player,
                tileId: p.handTileIds[0] as TileId,
                closedKan: p.kanKind === "kan_closed",
              }
            : null,
        kanCount: state.round.kanCount + 1,
        kanCallers,
        pendingDora: state.round.pendingDora + 1,
        byPlayer,
      },
    };
  });

  reducers.register(DORA_FLIPPED, (state, event) => {
    const p = event.payload as DoraFlippedPayload;
    return {
      ...state,
      round: {
        ...state.round,
        doraIndicators: [...state.round.doraIndicators, p.tileId],
        pendingDora: Math.max(0, state.round.pendingDora - 1),
      },
    };
  });

  reducers.register(FURITEN_MARKED, (state, event) => {
    const p = event.payload as FuritenMarkedPayload;
    return withPlayerRound(state, p.player, (rs) => ({
      ...rs,
      temporaryFuriten: true,
      riichiFuriten: p.permanent ? true : rs.riichiFuriten,
    }));
  });

  reducers.register(TURN_PASSED, (state, event) => {
    const p = event.payload as TurnPassedPayload;
    return {
      ...state,
      round: {
        ...state.round,
        phase: "turn.draw",
        turnSeat: p.nextSeat,
        lastDrawnTile: null,
        lastDrawRinshan: false,
        chankan: null,
      },
    };
  });

  reducers.register(WIN_DECLARED, identityReducer);

  reducers.register(ROUND_SETTLED, (state, event) => {
    const p = event.payload as RoundSettledPayload;
    return {
      ...state,
      players: state.players.map((pl) => ({
        ...pl,
        score: pl.score + (p.deltas[pl.id] ?? 0),
      })),
      round: {
        ...state.round,
        phase: "round.over",
        dealerSeat: p.dealerSeat,
        rotationSeat: p.rotationSeat ?? p.dealerSeat,
        honba: p.honba,
        riichiPot: p.riichiPot,
        roundNumber: p.roundNumber,
        prevalentWind: p.prevalentWind,
      },
    };
  });
}
