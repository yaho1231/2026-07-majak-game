/**
 * full_hand_swap (통째로 바꾸기) — 동풍전 2회·반장전 3회, **보유자 자신의 첫 순**(아직
 * 아무것도 버리지 않은 자기 턴)에 상대의 손패를 **통째로 강탈**한다.
 *
 * 2026-07-22 (48차 재설계, 사용자 확정): 맞교환 → **일방적 강탈**.
 *   ① 상대의 손패 전체가 내 손으로 온다.
 *   ② 내 손패(쯔모패 제외)는 상대가 아니라 **패산 맨 밑으로** 들어간다.
 *   ③ 상대는 패산 위에서 같은 장수를 새로 받는다.
 * 예전 맞교환은 내 배패가 상대에게 넘어가 **상대를 강화**할 수 있었다 —
 * 무페널티 원칙(10_AUGMENT_SYSTEM §0)에 어긋나므로 그 경로를 끊었다.
 *
 * 2026-08-27 (사용자 지시) 버프: 선택 화면에서 **내 손보다 샹텐이 빠른 상대에게만
 * 「빠름」 표식**이 붙는다. 샹텐 숫자도 손패 내용도 나가지 않는다 — 블라인드 성격을
 * 절반만 남기는 것이 목적이다. 자세한 규약은 아래 `fasterOpponents` 주석.
 *
 * 패 수지: 내 13장이 패산에 들어가고 상대가 패산에서 13장을 받으므로 패산 총량은 불변.
 * 내 패는 배열 끝(맨 밑)에 들어가고 상대는 앞에서 받으므로, 상대가 방금 빼앗긴
 * 자기 패를 그대로 돌려받는 일은 없다.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  meldCountOf,
  moveTiles,
  playerAtSeat,
  scoringOptionsOf,
  shantenOf,
  winHandKindsOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
  TileKind,
} from "@majak/core";
import { counterOf, publishUsesLeft, roundViewKey, sameHandSize, scaledUses } from "../util.js";
import { handAlteredMark } from "./handAltered.js";
import { clearedHandMarks } from "./handMarkChannels.js";
import {
  breakStealthRiichiEvents,
  ensureStealthBreakReducer,
  riichiBlocksSwap,
} from "./stealthBreak.js";
import { handIsPoor } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "full_hand_swap";
const ACTION = "hand_swap";
/** 게임당 사용 가능 횟수 */
/**
 * **동풍전 기준** 사용 횟수 — 반장전은 `scaledUses`가 1.5배(올림)로 늘린다
 * (동풍전 2회 · 반장전 3회, 2026-08-23 사용자 지시).
 * 매치 예산은 원래 동풍전(4국)을 기준으로 잡혀 있어서, 국이 두 배 도는 반장전에서
 * 같은 카드가 국당 절반 값이 됐다.
 */
const TONPUU_USES = 2;
/** 이 매치에서 쓸 수 있는 총 횟수 (동풍전 2 · 반장전 3) */
const maxUses = (state: GameState): number => scaledUses(state, TONPUU_USES);
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const FULL_HAND_SWAP_PERFORMED = "FullHandSwapPerformed";
/** 게임 단위 사용 횟수 카운터 키 */
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;

interface FullHandSwapPayload {
  holder: PlayerId;
  target: PlayerId;
  /** 보유자 → 패산 맨 밑으로 들어가는 손패 (쯔모패 제외) */
  toWall: TileId[];
  /** 상대 → 보유자에게 통째로 넘어오는 손패 */
  steal: TileId[];
  /** 패산 위에서 상대에게 새로 지급되는 패 (steal과 같은 장수) */
  refill: TileId[];
}

// 배패 장수(deal.handSize)가 다른 상대는 강탈할 수 없다 — 진짜 용(16장) 등.
// 판정은 util.sameHandSize 한 곳으로 통일한다(사본이 갈라져 가드가 빠지는 것을 방지).

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

/**
 * ── 「빠름」 표식 (2026-08-27 사용자 지시) ──────────────────────────────
 *
 * 원문: *"내 손패보다 샹텐이 빠를것으로 추정되는 패에 표시해주기"*.
 *
 * 이 카드는 «상대 손을 못 보고 지른다»가 본질이었고 그래서 실측 기대 이득이 거의 0이었다
 * (docs/17 과약 판정). 그렇다고 손패를 보여 주면 블라인드 성격이 통째로 사라지므로,
 * **정확한 샹텐을 계산하되 노출은 이진(빠름 / 표식 없음)으로만** 한다 — 사용자 확정.
 * 샹텐 숫자도, 패 내용도, «얼마나» 빠른지도 나가지 않는다.
 *
 * 계산 규약:
 * - 상대는 13장(후로하면 그만큼 짧다)이라 `shantenOf(kinds, meldCountOf)` 그대로.
 * - 나는 쯔모패까지 14장이라 그대로 재면 상대보다 한 걸음 유리하게 나온다. 그래서
 *   **한 장 버린 뒤의 최소 샹텐**으로 재어 같은 잣대에 올린다.
 * - 손 kinds는 `winHandKindsOf`로 뽑는다 — 손패를 갈아치우는 증강의 override까지
 *   따라간다(천리안과 같은 계보).
 * - 분해 옵션은 **그 사람 기준** `scoringOptionsOf`다 — 상대가 무너진 국경·동수의
 *   결속을 켰으면 그 사람의 샹텐이 실제로 달라진다.
 */
const fasterKey = (holder: PlayerId): string => roundViewKey(holder, `${ID}:faster`);

/** 14장 손을 «한 장 버린 뒤»의 최소 샹텐으로 잰다 (13장 손과 같은 잣대) */
function bestDiscardShanten(
  kinds: readonly TileKind[],
  meldCount: number,
  opts: ReturnType<typeof scoringOptionsOf>,
): number {
  let out = shantenOf(kinds, meldCount, opts);
  for (let i = 0; i < kinds.length; i++) {
    out = Math.min(
      out,
      shantenOf(
        kinds.filter((_k, j) => j !== i),
        meldCount,
        opts,
      ),
    );
  }
  return out;
}

/** 지금 나보다 샹텐이 낮은(=더 빠른) 상대들의 id */
function fasterOpponents(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): PlayerId[] {
  const mine = bestDiscardShanten(
    winHandKindsOf(state, rules, holder),
    meldCountOf(state, holder),
    scoringOptionsOf(state, rules, holder),
  );
  return state.players
    .filter((p) => p.id !== holder)
    .filter(
      (p) =>
        shantenOf(
          winHandKindsOf(state, rules, p.id),
          meldCountOf(state, p.id),
          scoringOptionsOf(state, rules, p.id),
        ) < mine,
    )
    .map((p) => p.id);
}

const handSwapAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no full_hand_swap augment";
    if (counterOf(state, usedKey(req.player)) >= maxUses(state)) {
      return "hand_swap already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    /*
     * **내 첫 순**이면 된다 — 「국의 첫 바퀴」가 아니다 (2026-08-25 사용자 보고).
     *
     * 예전 조건은 `state.round.turnCount > 1`이었다. `turnCount`는 **친의 쯔모**에만
     * 오르는데, 내 순이 오기 전에 누가 울면 내 자리는 통째로 건너뛰어진다. 그 뒤 친이
     * 다시 쯔모하면 turnCount가 2가 되고, 그러면 **내가 이 국에 아직 한 장도 안 버렸는데
     * 발동 창이 이미 닫혀 있었다** — 상대의 후로 한 번으로 「국의 첫 순」 증강이
     * 무력화됐다.
     *
     * 그래서 큰손·일확천금·왕패 지배자와 같은 규약(`discardCount === 0`)으로 맞춘다:
     * 내가 아직 아무것도 버리지 않은 내 순이면 그게 내 첫 순이다. 내가 직접 울었다면
     * 그 순은 쯔모패가 없어 바로 아래 `lastDrawnTile` 검사가 잡는다.
     */
    if ((state.round.byPlayer[req.player]?.discardCount ?? 0) > 0) {
      return "only on your first turn";
    }
    // 보유자 자신이 리치 중이면 손패가 동결된다 — 대상의 리치만 보고 자기 리치를
    // 빠뜨리면 리치를 세워 둔 채 손 13장을 통째로 갈아치울 수 있었다
    // (2026-08-20 QA riichi 확정 7). `hand_swap3.commonReject`와 같은 규약.
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    // 쯔모를 마친 순이어야 한다. 치·펑 직후에도 turn.act이지만 그때는 lastDrawnTile이
    // null이고, 교환 로직이 "보유자는 쯔모패 한 장을 더 들고 있다"를 전제하므로
    // **손패가 한 장 모자란 채로 남아 그 국 내내 벽돌**이 된다(docs/25 손패 #1).
    if (state.round.lastDrawnTile === null) return "no drawn tile";
    const target = state.players.find((p) => p.id === req.payload.target);
    if (target === undefined) return "unknown target";
    if (target.id === req.player) return "cannot target yourself";
    // 보이는 리치만 막는다 — 숨은 리치(스텔스)를 여기서 빼면 후보 목록의 빈자리가
    // 곧 "저 사람 리치다"가 된다. 숨은 리치는 대상으로 삼되 아래에서 해제한다.
    if (riichiBlocksSwap(rules, state, target.id)) {
      return "target is in riichi";
    }
    if (!sameHandSize(rules, state, req.player, target.id)) {
      return "hand sizes differ";
    }
    // 상대에게 지급할 보충패가 패산에 있어야 한다
    if (wallLen(state) < handIdsOf(state, target.id).length) {
      return "not enough wall tiles";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const drawn = state.round.lastDrawnTile;
    const steal = [...handIdsOf(state, req.payload.target)];
    const payload: FullHandSwapPayload = {
      holder: req.player,
      target: req.payload.target,
      toWall: handIdsOf(state, req.player).filter((id) => id !== drawn),
      steal,
      // 내 패는 배열 끝에 붙으므로 앞쪽 N장은 그대로다 (validate가 길이를 보장)
      refill: (state.zones[WALL]?.tileIds ?? []).slice(0, steal.length),
    };
    return [
      { type: FULL_HAND_SWAP_PERFORMED, payload },
      // 손을 통째로 뺏겼으면 그 손에 걸려 있던 숨은 리치는 풀린다 (당사자에게만 통보)
      ...breakStealthRiichiEvents(rules, state, req.payload.target, req.player),
    ];
  },
};

export const fullHandSwap: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "통째로 바꾸기",
  description:
    "(동풍전 2회 · 반장전 3회) 내 첫 순에 상대를 지정해 그 손패를 통째로 강탈한다. 고를 때 내 손보다 완성이 빠른 상대에게 표식이 붙는다. 내 손패는 패산 맨 밑으로 들어가고, 상대는 패산에서 새로 받는다. 리치를 선언한 상대에게는 쓸 수 없다.",
  detail:
    "고르는 화면에서 **내 손보다 샹텐이 빠른 상대에게만 「빠름」 표식**이 붙는다 — 나에게만 보이고, 얼마나 빠른지도 무슨 패인지도 알 수 없다. 표식은 고르는 그 순간에만 계산되고 순이 넘어가면 사라진다.\n\n발동 창은 **내가 아직 한 장도 버리지 않은 내 순**이다. 빼앗긴 상대는 패산 위에서 같은 장수를 새로 받고, 내가 들고 있던 손패는 패산 가장 밑에 깔린다 — 교환이 아니라 강탈이라 내 배패가 상대 손에 들어가지는 않는다.\n\n리치를 걸어 둔 상대는 후보에서 빠지지만, 숨은 리치는 그대로 지정할 수 있고, 손을 뺏기는 순간 풀린다. 손패 장수가 다른 상대는 지정할 수 없고, 직전에 울어 쯔모패가 없는 순에는 발동하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, maxUses(state) - counterOf(state, usedKey(holder))),
      total: maxUses(state),
    }));

    /*
     * 「빠름」 표식을 **선택 창이 열려 있는 동안에만** 보유자 채널에 싣는다.
     *
     * 정보 노출이 늘어난 만큼 새는 곳이 없어야 한다:
     * - 채널은 `roundViewKey(holder, …)` — 보유자 시점에만 실린다.
     * - 창이 닫히면(내가 한 장이라도 버렸다·소진했다·내 순이 아니다) **즉시 지운다**.
     *   국 내내 남겨 두면 «지금도 저 사람이 빠르다»는 갱신되지 않는 거짓말이 된다.
     * - 값이 같으면 아무것도 내지 않아 반응 연쇄는 한 겹에서 멈춘다.
     */
    ctx.reaction("*", (_event, rc) => {
      const state = rc.state;
      const open =
        counterOf(state, usedKey(holder)) < maxUses(state) &&
        state.round.phase === "turn.act" &&
        playerAtSeat(state, state.round.turnSeat).id === holder &&
        (state.round.byPlayer[holder]?.discardCount ?? 0) === 0 &&
        state.round.byPlayer[holder]?.riichi == null &&
        state.round.lastDrawnTile !== null;
      const cur = state.augmentData[fasterKey(holder)];
      if (!open && cur === undefined) return; // 아직 한 번도 열린 적 없다 — 쓸 것도 없다
      const next = open ? fasterOpponents(state, engine.rules, holder) : [];
      const same =
        Array.isArray(cur) &&
        cur.length === next.length &&
        next.every((id, i) => (cur as unknown[])[i] === id);
      if (!same) rc.emit(augmentDataSet(fasterKey(holder), next));
    });

    // 숨은 리치 해제 리듀서 (손을 바꾸는 증강 공용 — 등록은 멱등)
    ensureStealthBreakReducer(engine);

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(FULL_HAND_SWAP_PERFORMED)) {
      engine.reducers.register(FULL_HAND_SWAP_PERFORMED, (state, event) => {
        const p = event.payload as FullHandSwapPayload;
        // ① 내 손패를 패산 맨 밑(배열 끝)으로 — 상대에게 넘어가지 않는다
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, p.toWall);
        // ② 상대 손패를 통째로 내 손으로
        zones = moveTiles(zones, handZone(p.target), handZone(p.holder), p.steal);
        // ③ 상대는 패산 위에서 같은 장수를 새로 받는다 (①에서 넣은 내 패는 맨 밑이라 안 걸린다)
        zones = moveTiles(zones, WALL, handZone(p.target), p.refill);
        const next: GameState = {
          ...state,
          zones,
          augmentData: {
            ...state.augmentData,
            [usedKey(p.holder)]: counterOf(state, usedKey(p.holder)) + 1,
            // 누구를 털었는지 전원 공개 (Rule #4 대응의 전제)
            [roundViewKey("*", `${ID}:${p.holder}`)]: p.target,
            // 천화·지화 게이트를 닫는다 — 발동 창(turnCount<=1)이 천화 창과 정확히
            // 겹치므로, 표식이 없으면 "상대 배패가 완성형이면 강탈해서 천화"가
            // 확률이 아니라 **선택**이 된다(2026-08-22 QA aug-2 확정 2, 48,000점 실측).
            // 손이 바뀐 것은 강탈자만이 아니다 — 대상도 패산에서 새 손을 받으므로
            // **양쪽 모두** 배패가 아닌 손이 된다.
            ...handAlteredMark(state, p.holder),
            ...handAlteredMark(state, p.target),
            /*
             * 손을 따라가지 못하는 **공개 표식**을 걷는다.
             *
             * 손패의 실물 흔적(생성패·`conjured`·적도라)은 이미 패를 따라간다.
             * 그런데 "누가 무슨 색으로 통일했다" 같은 국 스코프 채널은 원주인 자리에
             * 남아, 화면이 **엉뚱한 좌석을 가리키는 거짓말**이 됐다 — 세 좌석이 전부
             * 잘못된 대상에게 베타오리했다 (QA synergy3 handedit 확정 7, 2026-08-23).
             * 양쪽 다 지운다: 대상은 손을 빼앗겼고, 강탈자도 자기 손을 패산에 넘겼다.
             */
            ...clearedHandMarks(state, p.holder, p.target),
          },
        };
        return next;
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(handSwapAction);
    }

    // 보유자 턴에 상대마다 후보 노출 — 합법성은 validate가 최종 판정.
    // 배패 장수가 다른 상대(진짜 용 등)는 애초에 후보에서 제외한다.
    ctx.holderTurnOptions((state) =>
      state.round.byPlayer[holder]?.riichi != null
        ? []
        : state.players
        .filter(
          (p) =>
            p.id !== holder &&
            sameHandSize(engine.rules, state, holder, p.id),
        )
        .map((p) => ({ type: ACTION, payload: { target: p.id } })),
    );
  },
  // 내 손이 명백히 나쁠 때만 상대 손을 통째로 강탈한다. 상대 손 속은 볼 수 없으므로
  // 대상은 무작위로 고른다(누구를 뺏어도 내 쓰레기 손보다는 기대값이 높다).
  // 나쁜 손이 곧 발동 조건 — planner의 `advance` 적기와 방향이 반대다(위 개벽 참고)
  bot: plan({
    // 상대 손패를 통째로 강탈한다 — 갈아엎기다
    intent: "rewrite",
    fleeting: true,
    pick: (ctx) => {
      if (!handIsPoor(ctx)) return null;
      const mine = ctx.options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      /*
       * 「빠름」 표식(2026-08-27)이 생겼으니 봇도 그 표식을 본다 — 사람이 보는 정보와
       * 봇이 보는 정보가 같아야 한다(봇 정책 공용 규약). 표식이 붙은 상대가 있으면
       * 그중에서, 없으면 예전처럼 무작위로 고른다.
       */
      const raw = ctx.view.augmentView[`${ID}:faster`];
      const faster = new Set(Array.isArray(raw) ? (raw as string[]) : []);
      const pool =
        mine.filter((o) => faster.has(String((o.payload as { target?: unknown }).target)))
          .length > 0
          ? mine.filter((o) =>
              faster.has(String((o.payload as { target?: unknown }).target)),
            )
          : mine;
      return pool[ctx.rng.int(pool.length)] ?? pool[0] ?? null;
    },
  }),
});
