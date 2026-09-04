/**
 * 밑장빼기 (bottom_deal, prism) — "패산 밑이 내 것이다". 2026-07-26 신설.
 *
 * 폐기된 도박사의 손(rinshan_gamble)의 자리를 대신한다. 저쪽은 왕패 14장을 상시 열람하고
 * 게임 3회 교환하는 카드였는데, 왕패의 주인(dead_wall_master)과 **무대·열람이 완전히 겹쳐**
 * 한쪽이 다른 쪽의 하위호환처럼 읽혔다(docs/17 §개편 후보). 이쪽은 무대를 **패산**으로 옮긴다.
 *
 * ① 열람(상시): 패산 **맨 밑 3장**이 보유자에게만 보인다.
 * ② 액티브(2순에 1회 — 2026-08-27 밸런스, 아래 COOLDOWN_TURNS 참고): 자기 순에 선언하면 **다음 쯔모를 패산 위가 아니라 맨 밑에서** 빼온다.
 *    3장 중에서 고르는 게 아니다 — 늘 맨 아래 한 장이다. 열람 3장은 "밑장을 세 번 빼면
 *    무엇이 순서대로 나오는가"를 알려 주는 예고편이고, 그래서 미리 대기를 설계할 수 있다.
 *
 * 왜 강한가: 패산 맨 밑은 **유국 직전까지 아무도 손대지 않는 자리**다. 국 시작에 본 3장이
 * 그 자리에 그대로 있으니, 그중 하나를 오름패로 만들어 놓고 밑장빼기로 빼오면 확정 화료다.
 * 왕패는 깡이 나면 앞이 빠지고 표시패가 열려 계속 변하는데, 패산 밑은 **불변**이다 —
 * 이 성질이 왕패의 주인에는 없다.
 *
 * 구현 지점:
 * - visibility.wall Modifier: 보유자에게 `{mode:"peek",count:3,pick:"back"}`.
 *   **스냅샷을 만들지 않는다.** 뷰는 매번 상태에서 다시 계산되므로, 미래를 보는 자
 *   (future_sight)처럼 패산 밑으로 패를 밀어 넣는 증강이 끼어들면 창이 그대로 따라 밀린다.
 *   밑이 ABC였다가 D가 들어오면 BCD가 보이고, 밑장을 빼서 D가 나가면 다시 ABC가 보인다
 *   (사용자 확정 2026-07-26). `pick:"back"`은 이 증강을 위해 PeekVisibility에 추가했다.
 * - `bottom_deal` 액션: 상태를 바꾸지 않고 **예약(arm)만** 한다. 실제 바꿔치기는 인터셉터가
 *   다음 쯔모 때 한다 — 그래서 "다음 순은 위에서 뽑지 않는다"가 규칙 그대로 성립한다.
 * - TILE_DRAWN 인터셉터: 예약된 보유자의 **일반 쯔모**에 한해 payload.tileId를 패산 최후미
 *   패로 갈아 끼운다. moveTiles는 tileId로 지우므로(Zone.ts) 패산이 **밑에서** 한 장 줄고,
 *   위에서 뽑는 것과 장수 변화가 같아 **유국 타이밍이 바뀌지 않는다**.
 *   영상패 쯔모(rinshan)는 건드리지 않는다 — 영상패는 왕패 소관이고 밑장이 아니다.
 * - 예약 소비는 리듀서가 아니라 reaction이 한다(인터셉터는 이벤트를 emit할 수 없다).
 *   조건이 인터셉터와 동일하므로 "바꿔치기했으면 소비된다"가 어긋나지 않는다.
 * - 예약 플래그는 roundKey 스코프 — 국이 바뀌면 저절로 풀린다.
 * - 선언 사실은 **전원 공개**(viewKey("*")), 무엇이 보이는지는 **보유자만**.
 *   Rule #4(대응 가능)의 전제이고, 정보 공개는 페널티가 아니다(docs/10 §0).
 * - **리치 중에도 쓸 수 있다.** 뽑는 자리만 바꾸므로 손이 잠긴 것과 충돌하지 않는다.
 *   인위적 금지는 무페널티 원칙이 막는다(docs/10 §0 — "리치 중 사용 불가" ❌).
 * - 억제는 "자기 순에 한 번, 다음 쯔모 한 장"이라는 창과 **2순 쿨다운**이다.
 */

import {
  ROUND_STARTED,
  TILE_DRAWN,
  WALL,
  augmentDataSet,
  defineAugment,
  kindKey,
  playerAtSeat,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  VisibilityRule,
} from "@majak/core";
import {
  cooldownTurnsViewKey,
  flagOf,
  roundViewKey,
  widenPeek,
} from "../util.js";
import { handKindsExcept, handKindsOf, usefulIn } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "bottom_deal";
const ACTION = "bottom_deal";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const BOTTOM_DEAL_ARMED = "BottomDealArmed";
/** 보유자에게 보여 주는 패산 밑 장수 */
const PEEK = 3;

/**
 * 쿨다운 간격 — 마지막 **선언** 이후 이만큼 내 턴이 지나야 다시 예약할 수 있다.
 *
 * ⚠ 밸런스 2026-08-27: 예전에는 쿨다운이 아예 없었다. `canArm`이 "이미 예약됐는가"만
 * 보므로, 예약 → 다음 쯔모에 소비 → **그 턴에 곧바로 재예약**이 성립해 국이 끝날 때까지
 * 매 순 밑장을 빼왔다. 열람 3장이 "밑장을 세 번 빼면 무엇이 나오는가"의 예고편인데,
 * 무제한이면 그 3장을 순서대로 전부 가져가는 카드가 된다. 2순에 1회면 세 장을 다
 * 챙기는 데 여섯 순이 들고, 그동안 다른 사람의 깡·미래시가 밑장을 밀어 놓을 수 있다.
 *
 * "순"의 기준은 무르기(take_back)와 같다 — **내가 버린 수** = 내 턴 번호다.
 */
const COOLDOWN_TURNS = 2;

/** 다음 쯔모를 밑장으로 예약했는가 (roundKey 스코프 — 국이 바뀌면 자동으로 풀린다) */
const armedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "armed", state, h);
/** 마지막으로 선언한 턴 번호(국 스코프 — 국이 바뀌면 키가 사라져 자동 해제) */
const lastUsedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "last", state, h);

/**
 * 이 국에서 보유자의 현재 턴 번호 (= 내가 버린 수).
 * 누명(frame_up)이 `discardedKinds`를 남의 이력으로 돌리므로 실제 버림 횟수로 센다
 * (docs/25 P5 — take_back과 같은 기준).
 */
function turnNo(state: GameState, h: PlayerId): number {
  return state.round.byPlayer[h]?.discardCount ?? 0;
}

/** 쿨다운 중인가 (마지막 선언 이후 아직 2턴이 지나지 않았다) */
function onCooldown(state: GameState, h: PlayerId): boolean {
  const last = state.augmentData[lastUsedKey(state, h)];
  if (typeof last !== "number") return false; // 이 국에 아직 안 썼다
  return turnNo(state, h) - last < COOLDOWN_TURNS;
}
/** 보유자 뷰 전용 채널 — 지금 예약 상태인지 UI에 노출한다 */
const viewArmedKey = (h: PlayerId): string => roundViewKey(h, `${ID}:armed:${h}`);
/** 전원 공개 마커 — 누가 밑장빼기를 선언했는지는 모두가 안다 (내용은 아니다) */
const noticeKey = (h: PlayerId): string => roundViewKey("*", `${ID}:armed:${h}`);

/**
 * **이 좌석의 다음 쯔모가 패산 밑에서 나오는가** — 예약이 걸려 있는가.
 *
 * 밖으로 여는 이유: 패산 앞을 좌석 순서로 헤아려 미래를 예고하는 증강
 * (`triple_peek`)이 이 예약을 모르면 예고가 통째로 어긋난다. 밑장빼기는 앞을
 * 소모하지 않고 뒤를 뽑으므로 뒤따르는 좌석들의 몫이 한 칸씩 밀린다 —
 * "지금 기준으로 다시 계산돼 어긋나지 않는다"고 적힌 카드가 4/4 틀렸다
 * (2026-08-23, QA synergy3 kandora 확정 3).
 *
 * 정보 누설이 아니다: 선언 사실은 `noticeKey`로 이미 **전원 공개**다(무엇이 밑장인지는
 * 아니다). 예고를 읽는 쪽도 "그 좌석이 뒤에서 뽑는다"만 쓰고 밑장의 종류는 안 본다.
 */
export function bottomDealArmed(state: GameState, player: PlayerId): boolean {
  return flagOf(state, armedKey(state, player));
}

/** 패산 맨 밑장 (다음 밑장빼기로 나올 패). 패산이 비면 undefined */
function bottomTile(state: GameState): TileId | undefined {
  const wall = state.zones[WALL]?.tileIds ?? [];
  return wall[wall.length - 1];
}

/**
 * 지금 예약할 수 있는가 — 자기 순(turn.act)이고, 아직 예약이 안 걸렸고, 쿨다운이 풀렸고,
 * 패산이 남았을 때.
 */
function canArm(state: GameState, h: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== h) return false;
  if (flagOf(state, armedKey(state, h))) return false;
  if (onCooldown(state, h)) return false;
  return bottomTile(state) !== undefined;
}

interface BottomDealArmedPayload {
  player: PlayerId;
  /** 선언한 턴 번호 (쿨다운 기준점) */
  turnNo: number;
}

const armAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no bottom_deal augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, armedKey(state, req.player))) {
      return "bottom deal already armed";
    }
    if (onCooldown(state, req.player)) return "bottom deal is on cooldown";
    if (bottomTile(state) === undefined) return "wall is empty";
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: BOTTOM_DEAL_ARMED,
      payload: {
        player: req.player,
        turnNo: turnNo(state, req.player),
      } satisfies BottomDealArmedPayload,
    },
  ],
};

export const bottomDeal: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 2,
  name: "밑장빼기",
  description:
    "(상시 열람 · 2순에 1회) 패산 맨 밑 3장을 항상 볼 수 있고, 쓰면 다음 순의 쯔모를 패산 위가 아니라 맨 밑에서 뽑는다.",
  detail:
    "보이는 3장은 오른쪽 끝이 맨 밑장이고, 밑장을 뺄 때마다 그 옆의 패가 새 밑장이 된다.\n\n남은 쿨다운은 이름표에 표시되고, 국이 바뀌면 즉시 초기화된다. 쿨다운은 선언한 순간부터 세므로 예약해 두고 미뤄도 늦춰지지 않는다.\n\n선언한 사실은 전원에게 공개되지만 **무엇이 보이는지는 나만 안다.** 깡의 영상패는 밑장이 아니며, 리치 중에도 쓸 수 있다.",
  // 봇: ① 텐파이면 밑장이 오름패일 때 예약해 그 자리에서 화료하고,
  //     ② 아니면 밑장이 손에 쓸모 있을 때만 예약한다. 확실한 개선만 고른다.
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
      const arm = options.find((o) => o.type === ACTION);
      if (arm === undefined) return null;
      // 열람 덕에 패산 밑 3장이 뷰에 들어온다 — 맨 뒤가 다음에 빼올 밑장이다
      const wall = view.zones[WALL]?.tileIds ?? [];
      const bottomId = wall[wall.length - 1];
      if (bottomId === undefined) return null;
      const bottomKind = view.tiles[bottomId]?.kind;
      if (bottomKind === undefined) return null;
      // 쯔모패는 이번 순에 버려질 패다 — 다음 쯔모를 평가할 손은 그것을 뺀 쪽이다
      const drawn = view.round.myDrawnTile;
      const handKinds =
        drawn === null
          ? handKindsOf(view, holder)
          : handKindsExcept(view, holder, drawn);
      // 1) 텐파이면 밑장이 오름패일 때만 — 빼오는 순간 쯔모 화료다
      if (tenpai) {
        const meldCount = view.round.byPlayer[holder]?.meldCount ?? 0;
        // 화료형 변형(진짜 용 5멘쯔 등)을 그대로 반영한다 — 표준 4멘쯔로 굳히면
        // 진짜 용 보유자의 대기를 못 읽어 밑장을 엉뚱하게 예약한다(60차).
        const waits = new Set(
          winningKinds(handKinds, meldCount, undefined, view.scoringOptions).map(kindKey),
        );
        if (waits.has(kindKey(bottomKind))) return arm;
      }
      // 2) 아니면 손이 진전되는 밑장일 때만 예약한다
      return usefulIn(handKinds, bottomKind) ? arm : null;
    },
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    /*
     * 남은 쿨다운(순)을 이름표 pill에 상시로 낸다 — 무르기(take_back)와 같은 규약.
     * 채널이 없으면 다시 쓸 수 없다는 걸 **버튼이 사라진 것으로만** 알 수 있다.
     * 값이 같으면 아무것도 내지 않으므로 반응 연쇄는 한 겹에서 멈춘다.
     */
    ctx.reaction("*", (_event, rc) => {
      const last = rc.state.augmentData[lastUsedKey(rc.state, holder)];
      const left =
        typeof last === "number"
          ? Math.max(0, COOLDOWN_TURNS - (turnNo(rc.state, holder) - last))
          : 0;
      if (rc.state.augmentData[cooldownTurnsViewKey(ID, holder)] !== left) {
        rc.emit(augmentDataSet(cooldownTurnsViewKey(ID, holder), left));
      }
    });

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(BOTTOM_DEAL_ARMED)) {
      engine.reducers.register(BOTTOM_DEAL_ARMED, (state, event) => {
        const p = event.payload as BottomDealArmedPayload;
        return {
          ...state,
          augmentData: {
            ...state.augmentData,
            [armedKey(state, p.player)]: true,
            // 쿨다운은 **선언 시점**부터 센다 (소비 시점이 아니다 — 예약해 놓고
            // 국이 끝날 때까지 안 뽑는 식으로 쿨다운을 미룰 수 없게)
            [lastUsedKey(state, p.player)]: p.turnNo,
            [viewArmedKey(p.player)]: true,
            [noticeKey(p.player)]: true,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(armAction);
    }

    // 예약된 일반 쯔모를 패산 **최후미**에서 뽑도록 갈아 끼운다.
    // (moveTiles가 tileId로 지우므로 패산은 밑에서 한 장 줄고 장수 변화는 위에서 뽑는 것과 같다)
    ctx.interceptor(TILE_DRAWN, (event, ic) => {
      const state = ic.state;
      const p = event.payload as {
        player: PlayerId;
        tileId: TileId;
        rinshan: boolean;
      };
      if (p.player !== holder) return event;
      if (p.rinshan) return event;
      if (!flagOf(state, armedKey(state, holder))) return event;
      const bottom = bottomTile(state);
      if (bottom === undefined) return event;
      // 패산이 한 장뿐이면 위와 밑이 같은 패다 — 바꿀 것이 없다
      if (bottom === p.tileId) return event;
      return { type: event.type, payload: { ...p, tileId: bottom } };
    });

    /*
     * 예약 소비 — 인터셉터는 emit할 수 없으므로 적용 후에 플래그를 내린다.
     *
     * ⚠ 인터셉터가 **실제로 바꿔치기한 경우에만** 소비해야 한다. 예전 주석은
     * "조건이 인터셉터와 같다"고 했지만 실은 달랐다 — 인터셉터는 패산이 한 장뿐이라
     * 위와 밑이 같은 패면(`bottom === p.tileId`) 그냥 지나가는데, 여기서는 그 경우에도
     * 플래그를 내려 **국당 1회 예약이 아무 일 없이 날아갔다**(docs/25 벽패/왕패/깡 #11).
     * 뽑기 전 패산이 2장 이상이었어야 바꿀 것이 있었다 = 뽑은 뒤 1장 이상 남았어야 한다.
     */
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as { player: PlayerId; rinshan: boolean };
      if (p.player !== holder) return;
      if (p.rinshan) return;
      if (!flagOf(rc.state, armedKey(rc.state, holder))) return;
      if ((rc.state.zones[WALL]?.tileIds.length ?? 0) === 0) return;
      rc.emit(augmentDataSet(armedKey(rc.state, holder), false));
      rc.emit(augmentDataSet(viewArmedKey(holder), false));
      rc.emit(augmentDataSet(noticeKey(holder), false));
    });

    /*
     * 국이 바뀌면 예약 표시를 끈다.
     *
     * armedKey는 roundKey 스코프라 저절로 만료되지만, 공개 표시 두 채널(viewArmedKey·
     * noticeKey)은 고정 키다. 예약을 소비하기 전에 국이 끝나면(남의 론·유국) 표시만
     * 남아 다음 국 내내 전원에게 "밑장 예약 중"이라는 **거짓 정보**를 보여 줬다
     * (2026-07-29 감사). 실제 예약과 표시의 수명을 맞춘다.
     */
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (rc.state.augmentData[viewArmedKey(holder)] === true) {
        rc.emit(augmentDataSet(viewArmedKey(holder), false));
      }
      if (rc.state.augmentData[noticeKey(holder)] === true) {
        rc.emit(augmentDataSet(noticeKey(holder), false));
      }
    });

    // 보유자에게 패산 맨 밑 3장 공개 — 스냅샷이 아니라 매번 상태에서 계산된다
    engine.rules.addModifier<VisibilityRule>("visibility.wall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        // widenPeek 필수 — 지금은 visibility.wall 모디파이어가 이것 하나뿐이라
        // 결과가 같지만, 패산을 여는 증강이 하나만 더 생기면 cur를 덮는 순간
        // 최종 열람 범위가 드래프트 픽 순서로 갈린다(docs/25 P7).
        return widenPeek(cur, { mode: "peek", count: PEEK, pick: "back" });
      },
    });

    // 보유자 턴 후보: 예약 버튼 하나 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) =>
      canArm(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
});
