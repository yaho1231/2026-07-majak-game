/**
 * 파혼 (meld_dissolve, prism) — "이미 맺은 후로를 없던 일로 되돌린다".
 *
 * 국당 1회, 자기 턴에 자신의 후로(치·펑) 하나를 해체해 손으로 되돌린다.
 * "한 번 운 패는 못 무른다"는 상식을 정면으로 부순다 — 성급하게 펑·치한 손을
 * 되감아 다시 멘젠으로 세운다.
 *
 * 부수는 상식: 후로는 되돌릴 수 없는 확정 — 파혼은 그 계약을 파기한다.
 *
 * 도파민 순간: 바닥에 깔려 있던 후로 세 장이 흩어진다. 두 장이 손으로 돌아오고
 * 남이 버렸던 한 장은 그 사람의 무덤(버림패)으로 되돌아간다. 후로가 하나뿐이었다면
 * 그 순간 손은 다시 멘젠 — 리치가 열린다.
 *
 * 타일 정합(설계의 핵심):
 * - 후로의 3장 = 손에서 낸 2장 + 남의 버림에서 가져온 1장(calledTileId).
 * - 손에서 낸 2장(tileIds − calledTileId) → 보유자의 손패로 복귀(+2).
 * - 가져온 1장(calledTileId) → 원래 버린 사람(calledFrom)의 버림패 더미로 복귀.
 * - 후로는 meldsZone과 round.byPlayer[holder].melds 양쪽에서 제거된다.
 * - **패산 보충(핵심 수정 2026-07-25)**: 후로 3장 중 가져온 1장이 강으로 나가므로,
 *   해체하면 보유자의 순 손패가 자기 턴 기준 14→13으로 한 장 모자라 버림을 못 한다.
 *   그래서 해체 직후 **패산 앞 1장을 보충 쯔모**(lastDrawnTile로 세팅)해 14장을 회복한다.
 *   결정적(난수 미사용)이라 리플레이 안전. 패산이 비면 발동을 막는다(validate).
 * - 순 결과: 손패 복귀 +2, 후로 소멸, 패산에서 +1 보충. 멘젠 여부는 melds에서 파생되므로
 *   마지막 후로가 사라지면 멘젠이 자연 복구된다. 강으로 나간 1장 + 패산에서 온 1장이
 *   상쇄돼 게임 전체 타일 수는 불변이다.
 * - 깡(kan_*)은 대상 외 — 깡 정합(가깡·안깡·도라 표시)은 이 증강의 범위를 벗어난다.
 *
 * 구현: zones와 byPlayer.melds를 동시에 재구성해야 하므로 augmentDataSet만으로는
 * 안 되고 커스텀 이벤트 + 리듀서를 쓴다(CALL_MADE를 역으로 되감는다). 결정적이라
 * 리플레이 안전(prng 불필요). 리미트는 국당 1회(roundKey 스코프), 페널티 없음.
 * 해체 사실은 전원에게 공개된다 — 상대는 후리텐·안전패 판정을 다시 해야 한다
 * (되돌아온 손패로 대기가 바뀌고, 무덤으로 돌아간 패가 다시 위험패가 될 수 있다).
 *
 * 테스트 하네스 주의: craft의 melds는 calledTileId/calledFrom를 채우지 않는다.
 * 그래서 toEvents는 calledTileId가 없으면 tileIds의 마지막 장을 가져온 패로 보고,
 * calledFrom이 없으면 보유자가 아닌 첫 상대의 강으로 되돌린다(정합만 맞으면 무해).
 * 실제 게임의 후로는 CALL_MADE가 둘 다 채우므로 이 폴백은 테스트 편의일 뿐이다.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  discardsZone,
  handZone,
  kindKey,
  kindOf,
  meldsZone,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  Meld,
  PlayerId,
  TileId,
} from "@majak/core";
import {
  flagOf,
  publishUsesLeft,
  replaceDrawnTile,
  roundViewKey,
} from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "meld_dissolve";
const ACTION = "dissolve_meld";
const EVENT = "MeldDissolved";

/** 국당 1회 사용 플래그 (roundKey 스코프) */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

/**
 * "이 사람의 버림패는 이미 한 번 울려 나갔다" 표식 (roundKey 스코프).
 *
 * 표준 유국만관은 **강 장수 === 버림 이력 길이**로 "한 장도 울려 나가지 않았다"를
 * 판정한다(`standardActions.nagashiManganSeats`). 파혼이 가져왔던 1장을 강으로
 * 되돌리면 그 등식이 **다시 성립**해, 이미 울려 나가 자격을 잃었던 사람의 유국만관이
 * 되살아났다(QA defcall 확정 1 — 실측 8,000점 오차). 파혼의 설명 어디에도 남의 역·정산
 * 자격을 바꾼다는 말은 없다.
 *
 * 그래서 되돌리는 순간 이 표식을 남기고, `draw.nagashiMangan` 모디파이어가 그 사람의
 * 유국만관만 꺼 둔다 — 코어 판정은 그대로 두고 **파혼 쪽에서** 원상태를 보존한다.
 */
const nagashiBrokenKey = (state: GameState, target: PlayerId): string =>
  roundScopedKey(ID, "nagashiBroken", state, target);

/** 치·펑(후로 3장)만 해체 대상 — 깡은 제외 */
function isDissolvable(meld: Meld | undefined): boolean {
  if (meld === undefined) return false;
  return (meld.kind === "pon" || meld.kind === "chi") && meld.tileIds.length === 3;
}

interface MeldDissolvePayload {
  holder: PlayerId;
  meldIndex: number;
  /** 손으로 되돌리는 2장 (tileIds − calledTileId) */
  handContributed: TileId[];
  /** 원래 버림에서 가져온 1장 → 버린 사람의 강으로 복귀 */
  calledTileId: TileId;
  /** calledTileId를 되돌릴 대상(원 버린 사람) */
  calledFrom: PlayerId;
}

/** 후로에서 '가져온 패'와 '손에서 낸 2장'을 해석한다(폴백 포함) */
function resolveMeld(
  state: GameState,
  holder: PlayerId,
  meld: Meld,
): { handContributed: TileId[]; calledTileId: TileId; calledFrom: PlayerId } {
  const calledTileId =
    meld.calledTileId ?? (meld.tileIds[meld.tileIds.length - 1] as TileId);
  const handContributed = meld.tileIds.filter((id) => id !== calledTileId);
  const calledFrom =
    meld.calledFrom ??
    (state.players.find((p) => p.id !== holder)?.id as PlayerId);
  return { handContributed, calledTileId, calledFrom };
}

const dissolveAction: ActionDef<{ meldIndex: number }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no meld_dissolve augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    // 리치를 걸면 손패는 동결된다 — 보유자 자신의 리치를 반드시 확인한다
    // (2026-07-29 감사: 상대 리치만 보고 자기 리치를 빠뜨려 리치 후 손을 갈아치울 수 있었다)
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: cannot dissolve";
    }
    const melds = state.round.byPlayer[req.player]?.melds ?? [];
    const meld = melds[req.payload.meldIndex];
    if (!isDissolvable(meld)) return "no dissolvable pon/chi meld at that index";
    // 해체로 손패가 한 장 비므로 패산에서 보충한다 — 패산이 비면 발동 불가
    if ((state.zones[WALL]?.tileIds.length ?? 0) === 0) {
      return "wall empty, cannot dissolve";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const meld = state.round.byPlayer[req.player]?.melds[
      req.payload.meldIndex
    ] as Meld;
    const { handContributed, calledTileId, calledFrom } = resolveMeld(
      state,
      req.player,
      meld,
    );
    return [
      {
        type: EVENT,
        payload: {
          holder: req.player,
          meldIndex: req.payload.meldIndex,
          handContributed,
          calledTileId,
          calledFrom,
        } satisfies MeldDissolvePayload,
      },
      // 강으로 되돌아간 1장이 "울려 나간 적 없음"으로 보이지 않게 못 박는다.
      augmentDataSet(nagashiBrokenKey(state, calledFrom), true),
    ];
  },
};

export const meldDissolve: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  complexity: 3,
  name: "파혼",
  description:
    "(매 국 1회) 자기 순에 자신의 후로(치·퐁) 하나를 해체한다 — 내가 냈던 2장만 손으로 돌아오고 남에게서 가져왔던 1장은 그 사람의 버림패로 되돌아가며, 빈 자리는 패산에서 1장 보충된다. 유일한 후로였다면 멘젠이 복구되어 다시 리치할 수 있다.",
  detail:
    "(매 국 1회) 자기 순에 자신의 치·퐁 하나를 골라 해체한다. 손에서 냈던 2장은 손패로 돌아오고 남에게서 가져왔던 1장은 그 사람의 버림패 더미로 되돌아가며, 부족한 한 장은 패산에서 보충되어 손패 장수가 정확히 맞는다. 후로가 하나뿐이었다면 그 순간 손이 다시 멘젠이 되어 리치를 걸 수 있다. 해체는 전원에게 공개된다. 깡은 대상이 아니고 패산이 비면 발동할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 파혼으로 강이 복원된 사람의 유국만관은 꺼 둔다 — 되돌리기 전에 이미 잃었던
    // 자격이다(위 nagashiBrokenKey 주석). 보유자 전용이 아니라 **지목된 상대**에게
    // 걸리는 규칙이라 setHolderRule이 아니라 모디파이어로 직접 단다.
    ctx.engine.rules.addModifier<boolean>("draw.nagashiMangan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (cur !== true) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || rctx.playerId === undefined) return cur;
        return flagOf(state, nagashiBrokenKey(state, rctx.playerId))
          ? false
          : cur;
      },
    });

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(dissolveAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as MeldDissolvePayload;
        // ① 손에서 냈던 2장을 손패로 복귀
        let zones = moveTiles(
          state.zones,
          meldsZone(p.holder),
          handZone(p.holder),
          p.handContributed,
        );
        // ② 가져온 1장을 원래 버린 사람의 강(버림패)으로 복귀
        zones = moveTiles(zones, meldsZone(p.holder), discardsZone(p.calledFrom), [
          p.calledTileId,
        ]);
        // ③ byPlayer[holder].melds에서 해당 후로 제거 (멘젠은 melds에서 파생 → 자연 복구)
        const byPlayer = Object.fromEntries(
          Object.entries(state.round.byPlayer).map(([id, rs]) => [
            id,
            id === p.holder
              ? { ...rs, melds: rs.melds.filter((_, i) => i !== p.meldIndex) }
              : rs,
          ]),
        );
        // ④ 멘쯔 해체로 순 손패가 한 장 비어 버림을 못 하므로 패산 앞 1장을 보충한다.
        //    (해체한 3장 중 가져온 1장이 강으로 나가 손패 총량이 하나 줄어든 것을 채운다.)
        //    결정적(난수 미사용) — 뽑은 패를 lastDrawnTile로 세워 그대로 버릴 수 있게 한다.
        const drawn = zones[WALL]?.tileIds[0];
        let lastDrawnTile = state.round.lastDrawnTile;
        if (drawn !== undefined) {
          zones = moveTiles(zones, WALL, handZone(p.holder), [drawn]);
          lastDrawnTile = drawn;
        }
        return {
          ...state,
          zones,
          // lastDrawRinshan을 반드시 끈다 — 대명깡 직후(영상 쯔모 상태)에 해체하면
          // 그 플래그가 남아 이어지는 화료에 **영상개화가 헛성립**한다(2026-07-29 감사).
          round: { ...replaceDrawnTile(state.round, lastDrawnTile), byPlayer },
          augmentData: {
            ...state.augmentData,
            [usedKey(state, p.holder)]: true,
            // 전원 공개 — 상대가 후리텐·안전패를 다시 판정하도록
            [roundViewKey("*", `${ID}:${p.holder}`)]: {
              meldIndex: p.meldIndex,
              returned: p.handContributed.map((id) => kindKey(kindOf(state, id))),
              toPond: kindKey(kindOf(state, p.calledTileId)),
              calledFrom: p.calledFrom,
            },
          },
        };
      });
    }

    // 아직 안 썼으면, 해체 가능한 치·펑 후로마다 후보 하나씩 낸다
    ctx.holderTurnOptions((state) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      const melds = state.round.byPlayer[holder]?.melds ?? [];
      const out: { type: string; payload: { meldIndex: number } }[] = [];
      melds.forEach((m, i) => {
        if (isDissolvable(m)) out.push({ type: ACTION, payload: { meldIndex: i } });
      });
      return out;
    });
  },
  /**
   * 봇 — **멘젠이 실제로 복구될 때만** 무른다.
   *
   * "템포 손해라 판단할 수 없다"고 두었던 자리인데, 갈리는 조건이 사실 하나다:
   * **이 후로가 내 유일한 후로인가.** 후로가 둘이면 하나를 물러도 여전히 후로 손이라
   * 얻는 것이 없고(=순수 손해), 하나뿐이면 리치가 통째로 돌아온다.
   *
   * 모양 손해는 생각보다 작다 — 되돌아오는 두 장은 펑이면 또이쯔, 치면 이어진 두 장이라
   * **어차피 몸통 재료로 남는다.** 실제로 잃는 것은 울어 온 그 한 장뿐이다.
   *
   * 그래서 샹텐을 정밀히 세지 않는다. 해체하면 패산에서 한 장을 보충하는데 **그 패가
   * 무엇인지 알 수 없어**, 세어 봐야 근거 없는 정밀도만 붙는다. 대신 조건을 셋으로 둔다.
   *
   *   1. 유일한 후로일 것 (멘젠 복구가 진짜로 일어난다)
   *   2. 텐파이가 아닐 것 (다 된 손을 무르지 않는다)
   *   3. 리치까지 갈 만큼 가까울 것 (2샹텐 이내)
   *
   * "언제 무를지"의 나머지 절반(회수할 순목이 남았는가)은 planner의 advance 적기가 답한다.
   */
  bot: plan({
    intent: "advance",
    oneShot: true,
    pick: (ctx) => {
      const { options, view, holder, tenpai, shanten } = ctx;
      if (tenpai || shanten > 2) return null;
      const melds = view.round.byPlayer[holder]?.melds ?? [];
      const meldCount = view.round.byPlayer[holder]?.meldCount ?? melds.length;
      if (meldCount !== 1) return null; // 물러도 여전히 후로 손이면 얻는 것이 없다
      return options.find((o) => o.type === ACTION) ?? null;
    },
  }),
});
