/**
 * 카피 (copy, prism) — 상대 한 명의 액티브 증강 하나를 무작위로 가져와 이번 국 동안 한 번 쓴다.
 *
 * (동풍전 1회 · 반장전 2회) 자기 순에 상대 한 명을 지목하면, 그 사람의 액티브 증강 중
 * 하나가 무작위로 내 것이 된다. 가져온 증강은 이번 국이 끝나면 사라지고, 그 버튼은
 * 한 번만 누를 수 있다. 원래 주인의 증강은 그대로다. 무엇을 가져왔는지는 전원 공개
 * (2026-09-24 사용자 확정 — 후보는 액티브만, 결과는 전원 공개).
 *
 * ## 구현
 * 코어의 «빌린 증강»(`augment/borrow.ts`)을 쓴다. 이 증강은 `AUGMENT_BORROWED` 하나를
 * 낼 뿐이고, 목록에 얹기·설치·1회 소진·국 끝 회수는 전부 코어가 한다.
 *  - 빌린 증강은 내 보유 목록에 잠깐 얹힌다 → 그 증강의 validate·봇 정책·이름표가 그대로 돈다.
 *  - 그 증강의 사용 횟수·쿨다운은 **내 좌석 기준**으로 새로 센다(원래 주인과 무관).
 *    그래서 «1회»는 그 증강의 한도가 아니라 코어의 소진 표시로 지킨다.
 *  - 한 번 쓴 뒤에도 이미 켜 둔 효과(투시·천하무적처럼 이번 국 동안 가는 것)는 국 끝까지 산다.
 *
 * ## 복사할 수 없는 것
 * 후보는 `COPYABLE`에 적힌 액티브뿐이다 — 새 증강이 저절로 복사 대상이 되지 않게
 * 허용 목록으로 둔다. 빠진 것과 이유는 `NOT_COPYABLE`에 적는다(커버리지 테스트가 둘 중
 * 하나에 반드시 들어 있는지 본다). 대표적으로:
 *  - 한 번 누름으로 끝나지 않는 다단계(등가교환·미래를 보는 자), 한 번 쓰면 그 국이
 *    묶이는 것(우는 국사무쌍) — 1회로 자르면 손이 벽돌이 된다.
 *  - 효과가 국 밖으로 새는 것(귀환·붉은 손길·재장전) — «이번 국 동안»을 못 지킨다.
 *  - 게임 내내 쌓은 게이지·진행도가 있어야 누를 수 있는 것(카르마·편식·거신병).
 *  - 선발동형 재장전·형태 선언(패시브의 부속 버튼) — 액티브가 본체가 아니다.
 */

import {
  AUGMENT_BORROWED,
  Prng,
  augmentDataSet,
  borrowedOf,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentContext, AugmentDef, GameState, PlayerId } from "@majak/core";
import { counterOf, matchUses, publishUsesLeft, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "copy";
const ACTION = "copy_take";

/**
 * 복사할 수 있는 액티브 증강. 한 번 누르면 쓰임이 끝나고, 효과가 이번 국 안에서 닫히는 것들.
 * «국의 첫 순에만» 같은 원래 사용 조건은 그대로 적용된다(가져와도 못 쓰는 때가 있다).
 */
export const COPYABLE: ReadonlySet<string> = new Set([
  "alchemist",
  "all_or_nothing",
  "big_hand",
  "blood_contract",
  "bluff_pretense",
  "bottom_deal",
  "brief_fog",
  "call_seal",
  "cliff_bloom",
  "conjure_draw",
  "danger_sense",
  "dead_wall_master",
  "discard_lock",
  "disarm",
  "dora_afterimage",
  "even_world",
  "foresight",
  "frame_up",
  "free_riichi_discard",
  "full_hand_swap",
  "genesis",
  "grave_rob",
  "hidden_river",
  "invincible",
  "jackpot",
  "joker",
  "last_stand",
  "meld_dissolve",
  "no_retreat",
  "north_trader",
  "open_riichi_reveal",
  "palm_flip",
  "parasite",
  "peek_riichi_waits",
  "pond_snatch",
  "pruning",
  "pseudo_dealer",
  "push_riichi",
  "rank_gate",
  "rinshan_preview",
  "scapegoat",
  "seat_swap",
  "silent_pact",
  "silent_swap",
  "soul_strike",
  "spy",
  "stealth_riichi",
  "suit_unify",
  "table_flip",
  "take_back",
  "tenpai_scan",
  "three_dragons_will",
  "tile_dyeing",
  "tile_split",
  "time_stop",
  "triple_peek",
  "ura_peek",
  "xray_hand",
  "yggdrasil",
]);

/** 버튼이 있지만 복사할 수 없는 증강과 그 이유 (커버리지 테스트가 읽는다) */
export const NOT_COPYABLE: Readonly<Record<string, string>> = {
  copy: "자기 자신",
  reload: "내 다른 증강의 횟수를 되살린다 — 빌린 쪽이 남의 것을 복구하게 된다",
  honor_return: "효과가 다음 국 배패에 난다",
  red_five_touch: "효과가 게임 끝까지 간다",
  karma: "게임 내내 쌓은 게이지가 있어야 누를 수 있다",
  picky_eater: "그 국에 한 무늬를 12장 버린 진행도가 있어야 누를 수 있다",
  giant_god: "국사무쌍 13종을 직접 버린 뒤에야 누를 수 있다",
  hand_swap3: "지정 → 넘길 3장 → 가져올 3장의 다단계라 첫 단계에서 끊긴다",
  future_sight: "장전 → 교환의 다단계라 첫 단계에서 끊긴다",
  open_kokushi: "한 번 쓰면 그 국은 국사무쌍으로만 화료할 수 있는데 나머지 퐁을 못 한다",
  blind_ron: "선발동형 — 버튼은 반장전 재장전일 뿐이다",
  time_pressure: "선발동형 — 버튼은 반장전 재장전일 뿐이다",
  sign_flip: "선발동형 — 버튼은 반장전 재장전일 뿐이다",
  mixed_triplet: "형태 증강의 선언 버튼 — 본체는 패시브다",
  broken_border: "형태 증강의 선언 버튼 — 본체는 패시브다",
  async_chiitoi: "형태 증강의 선언 버튼 — 본체는 패시브다",
};

/** 사용 횟수 (동풍전 1 · 반장전 2 — 게임 단위) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

type Catalog = NonNullable<AugmentContext["catalog"]>;

/** 이 상대에게서 내가 가져올 수 있는 증강 id (보유 순서 그대로) */
export function copyCandidates(
  state: GameState,
  holder: PlayerId,
  target: PlayerId,
  catalog: Catalog | undefined,
): string[] {
  const mine = state.players.find((p) => p.id === holder)?.augments ?? [];
  const theirs = state.players.find((p) => p.id === target)?.augments ?? [];
  const clashes = (id: string): boolean => {
    if (catalog === undefined) return false;
    const def = catalog.get(id);
    return mine.some(
      (m) =>
        (def?.conflicts ?? []).includes(m) || (catalog.get(m)?.conflicts ?? []).includes(id),
    );
  };
  return theirs.filter(
    (id) =>
      COPYABLE.has(id) &&
      // 원래 주인이 빌려 든 것은 그의 증강이 아니다 (연쇄 카피 방지)
      borrowedOf(state, target)?.augmentId !== id &&
      !mine.includes(id) &&
      !clashes(id),
  );
}

/** 지금 쓸 수 있는가 (null = 가능) — 대상과 무관한 조건 */
function reject(state: GameState, holder: PlayerId): string | null {
  const me = state.players.find((p) => p.id === holder);
  if (me === undefined || !me.augments.includes(ID)) return "no copy augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return "not your turn";
  if (!hasUsesLeft(state, holder)) return "no uses left this game";
  // 한 국에 하나만 빌려 든다
  if (borrowedOf(state, holder) !== null) return "already copied this round";
  return null;
}

/** 무작위 선택 — 게임 진행용 PRNG를 건드리지 않는 독립 시드 (리플레이·재개에서 같은 결과) */
function pickIndex(state: GameState, holder: PlayerId, size: number): number {
  let h = 2166136261;
  for (const ch of `${ID}:${holder}:${state.lastEventSeq}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return new Prng((state.config.seed ^ h) >>> 0).int(size);
}

function makeAction(catalog: Catalog | undefined): ActionDef<{ target: PlayerId }> {
  return {
    type: ACTION,
    validate: (req, { state }) => {
      const common = reject(state, req.player);
      if (common !== null) return common;
      if (req.payload.target === req.player) return "cannot copy yourself";
      if (!state.players.some((p) => p.id === req.payload.target)) return "unknown target";
      if (copyCandidates(state, req.player, req.payload.target, catalog).length === 0) {
        return "target has no copyable augment";
      }
      return null;
    },
    toEvents: (req, { state }) => {
      const pool = copyCandidates(state, req.player, req.payload.target, catalog);
      const augmentId = pool[pickIndex(state, req.player, pool.length)]!;
      return [
        {
          type: AUGMENT_BORROWED,
          payload: { player: req.player, from: req.payload.target, augmentId },
        },
        augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
        // 전원 공개 — 누가 누구의 무엇을 가져갔는가
        augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
          target: req.payload.target,
          augmentId,
        }),
      ];
    },
  };
}

export const copy: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 1,
  name: "카피",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대 한 명을 지목해 그 사람의 액티브 증강 하나를 무작위로 가져온다. 이번 국 동안 한 번 쓸 수 있다.",
  detail:
    "가져온 증강은 내 증강처럼 쓰되 버튼은 한 번만 누를 수 있고, 국이 끝나면 사라진다. 원래 주인의 증강은 그대로 남는다. 무엇을 가져왔는지는 모두에게 공개된다.\n\n가져온 증강의 원래 사용 조건(국의 첫 순 등)은 그대로 적용된다. 여러 단계로 쓰는 증강, 효과가 다음 국까지 이어지는 증강, 쌓아 둔 게이지가 필요한 증강은 가져올 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    if (!engine.actions.has(ACTION)) engine.actions.register(makeAction(ctx.catalog));

    // 가져올 것이 있는 상대만 후보로 낸다
    ctx.holderTurnOptions((state) => {
      if (reject(state, holder) !== null) return [];
      return state.players
        .filter(
          (p) =>
            p.id !== holder && copyCandidates(state, holder, p.id, ctx.catalog).length > 0,
        )
        .map((p) => ({ type: ACTION, payload: { target: p.id } }));
    });
  },
  /**
   * 봇 — 가져올 카드가 가장 많은 상대를 고른다(무작위 한 장이 쓸 만할 확률이 높다).
   * 국 초반에 쓸수록 가져온 증강을 쓸 시간이 남는다.
   */
  bot: plan({
    intent: "setup",
    oneShot: true,
    pick: ({ options, view }) => {
      const mine = options.filter((o) => o.type === ACTION);
      let best = null as (typeof mine)[number] | null;
      let bestCount = -1;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        const held = view.players.find((p) => p.id === target)?.augments ?? [];
        const count = held.filter((id) => COPYABLE.has(id)).length;
        if (count > bestCount) {
          bestCount = count;
          best = o;
        }
      }
      return best;
    },
  }),
});
