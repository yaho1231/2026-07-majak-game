/**
 * 재장전 (reload, prism) — "그거 또 있어?!"
 *
 * 동풍전 1·반장전 2회, 자기 턴에 **사용 횟수를 쓴 내 다른 증강 하나를 지목해 1회 복구**한다.
 * 이미 한 번 본 재앙(통째로 바꾸기·소용돌이 등)이 "재장전"과 함께 다시 장전되는 순간
 * 전원이 "소진됐다고 안심했는데?!" — '게임당 1회'라는 절대 한도가 무너진다.
 *
 * 구현: 순수 콘텐츠(augmentData 카운터 조작). 대상 증강의 사용 카운터
 * `<augmentId>:uses:<holder>`(matchUses 규약)를 1 감소시키면 그 증강의 validate/후보 노출이
 * 다시 열려 한 번 더 쓸 수 있게 된다. 규약을 따르는(=`:uses:` 카운터를 쓰는) 증강만 대상이며,
 * 최소 1회 소진한 것만 후보로 낸다. 재장전 자신은 대상에서 제외한다.
 *
 * ⚠ 이 증강은 다른 증강의 사용 규약(`<id>:uses:<holder>`)에 의존한다 — 그 규약을 따르지 않는
 * (usedKey 불리언·쿨다운 등) 증강은 복구 대상이 아니다.
 */

import { augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import {
  counterOf,
  flagOf,
  matchUses,
  preArmInstalled,
  preArmRestoreEvents,
  preArmSpent,
  publishUsesLeft,
  roundViewKey,
  usesViewKey,
} from "../util.js";
import { plan } from "./botPlan.js";

const ID = "reload";
const ACTION = "reload_use";

/** 재장전 자신의 사용 카운터 (matchUses) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/**
 * 대상 증강의 사용 카운터 키 후보.
 *
 * 대부분은 `<id>:uses:<holder>`(matchUses 규약)를 쓰지만, 매치 스코프 카운터를
 * `<id>:used:<holder>`로 이름 붙인 증강도 넷 있다(연금술사·등가교환·연못 강탈·역만 방어술).
 * 예전에는 `uses`만 봐서 그 넷은 **재장전이 광고하는 "소진 복구"의 사각지대**였다
 * (2026-07-29 감사). 키를 옮기면 기존 상태·테스트가 깨지므로 여기서 둘 다 인정한다.
 *
 * `<id>:keeps:<holder>` — **만년 오야(eternal_dealer)** 하나가 쓰는 이름이다. 「남은
 * 연장 횟수」라 뜻이 `uses`와 같고 `publishUsesLeft`로 같은 잔량 채널까지 내는데,
 * 이름만 규약 밖이라 재장전이 **유일하게 못 되살리는 횟수형**이었다(2026-08-31 QA
 * synergy4 C-1). 카운터 이름을 옮기는 쪽은 저장된 상태·리플레이·기존 테스트가
 * 함께 깨지므로, `used:` 때와 같은 판단으로 **여기서 인정**한다.
 */
const targetUsesKeys = (augId: string, h: PlayerId): string[] => [
  `${augId}:uses:${h}`,
  `${augId}:used:${h}`,
  `${augId}:keeps:${h}`,
];

/**
 * 이 증강이 실제로 소진 이력을 남긴 카운터 키 (없으면 null).
 *
 * `:used:` 키는 숫자 카운터(예: pond_snatch)뿐 아니라 **불리언 플래그**로 소진을
 * 기록하는 증강도 있다(예: red_five_touch — `augmentDataSet(usedKey, true)`).
 * `counterOf`는 숫자가 아니면 0을 반환하므로 불리언 소진은 `flagOf`로도 함께 봐야
 * 사각지대가 생기지 않는다(2026-08 감사).
 */
function spentKeyOf(
  state: GameState,
  augId: string,
  holder: PlayerId,
): string | null {
  return (
    targetUsesKeys(augId, holder).find(
      (k) =>
        !isCooldownReference(state, augId, holder, k) &&
        (counterOf(state, k) > 0 || flagOf(state, k)),
    ) ?? null
  );
}

/**
 * 이 키가 **소진 카운터가 아니라 국 단위 쿨다운의 기준점**인가.
 *
 * `discard_lock`(봉인술사)만 공용 쿨다운 규약(`<id>:usedSeq:`)에서 벗어나
 * `discard_lock:used:{holder}`에 **마지막 발동 국의 순번**을 담는다 — 이름이 위
 * `targetUsesKeys`의 `:used:`와 겹쳐 소진 카운터로 오인됐다. 그래서 detail의 ⚠
 * ("국 단위 쿨다운 증강은 후보에 뜨지 않는다")과 정반대로 후보에 떴고, 복구하면
 * 기준점이 3→2로 되감겨 **쿨다운이 그 자리에서 풀렸다**(같은 국에 두 번 봉인,
 * QA text 확정 34).
 *
 * 판정은 이름이 아니라 **함께 쓰는 국 진행 카운터**(`<id>:seq:{holder}`, 공용
 * `roundSeqKey` 규약)의 존재로 한다 — 국 수를 세고 있다는 것은 그 증강이 국 단위
 * 쿨다운으로 돈다는 뜻이고, 그러면 `:used:`는 소진 횟수가 아니라 국 번호다.
 * 매치 카운터를 쓰는 증강(`:uses:`)은 이 검사에 걸리지 않는다.
 */
function isCooldownReference(
  state: GameState,
  augId: string,
  holder: PlayerId,
  key: string,
): boolean {
  if (key !== `${augId}:used:${holder}`) return false;
  return typeof state.augmentData[`${augId}:seq:${holder}`] === "number";
}

/**
 * 이 증강이 **어떤 방식으로** 소진돼 있는가 (아니면 null).
 *
 * 두 종류다.
 *  - `counter` — 사용 횟수 규약(`<id>:uses:` · `<id>:used:`)을 쓰는 액티브.
 *  - `preArm`  — 뽑은 직후 국에 자동으로 터지고 끝나는 선발동형(눈먼 총알·초읽기·반전).
 *    예전에는 이쪽이 통째로 사각지대였다. 소진 표식이 사용 카운터가 아니라 "켜졌던
 *    국"이라 `spentKeyOf`가 못 봤고, 그래서 **한 번 터지면 게임 내내 죽은 칸**이었다
 *    (2026-08-19 사용자 요청). 재장전이 다시 장전하면 다음 국에 한 번 더 터진다.
 *
 * ⚠ 지금 켜져 **있는** 국에는 후보가 아니다(`preArmSpent`가 false) — 타는 중인 것을
 * 되살릴 수는 없다. 그 국이 지나간 뒤부터 후보에 든다.
 */
function spentModeOf(
  state: GameState,
  augId: string,
  holder: PlayerId,
): "counter" | "preArm" | null {
  if (spentKeyOf(state, augId, holder) !== null) return "counter";
  return preArmSpent(state, augId, holder) ? "preArm" : null;
}

/** 복구 가능한(=소진 이력이 있는) 홀더의 다른 증강 id 목록 */
function reloadable(state: GameState, holder: PlayerId): string[] {
  const player = state.players.find((p) => p.id === holder);
  if (player === undefined) return [];
  return player.augments.filter(
    (augId) => augId !== ID && spentModeOf(state, augId, holder) !== null,
  );
}

/**
 * 이 증강이 **재장전이 되살릴 수 있는 종류**인가 (아직 소진하지 않았어도).
 *
 * `spentModeOf`는 «지금 소진돼 있는가»를 보므로 드래프트 시점에는 전부 null이다.
 * 여기서 보는 것은 «앞으로 소진될 수 있는가» — 두 종류다.
 *  - 횟수형: 공용 잔량 채널(`view:{보유자}:uses:{id}`)을 내고 있다(`publishUsesLeft`).
 *  - 선발동형: `armOnNextRound` 표식이 서 있다.
 * 둘 다 install 시점 이후 상태에 흔적이 남으므로, 카탈로그를 뒤지지 않고 상태만 읽어
 * 판정할 수 있다(드래프트 후보는 결정적이어야 한다).
 */
function restorableType(state: GameState, augId: string, holder: PlayerId): boolean {
  if (state.augmentData[usesViewKey(holder, augId)] !== undefined) return true;
  return preArmInstalled(state, augId, holder);
}

/**
 * 재장전에 **되살릴 대상이 하나라도 있는가** — 드래프트 후보 가드(`draftRequires`).
 *
 * 액티브만 들고 있는데(=횟수형·선발동형이 하나도 없는데) 재장전이 3지선다에 떠서
 * 한 칸이 통째로 죽어 있었다(2026-08-25 사용자 보고). `draftStages`로 스테이지를
 * 늦춰 둔 것만으로는 «그때쯤엔 뭔가 소진했겠지»라는 추정에 지나지 않는다.
 */
function hasRestorableAugment(state: GameState, player: PlayerId): boolean {
  const held = state.players.find((p) => p.id === player)?.augments ?? [];
  return held.some((augId) => augId !== ID && restorableType(state, augId, player));
}

const reloadAction: ActionDef<{ augmentId: string }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no reload augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    if (req.payload.augmentId === ID) return "cannot reload itself";
    if (!player.augments.includes(req.payload.augmentId)) {
      return "you do not have that augment";
    }
    if (spentModeOf(state, req.payload.augmentId, req.player) === null) {
      return "that augment has no spent use to restore";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    // validate가 존재를 보장한다
    const mode = spentModeOf(state, req.payload.augmentId, req.player);
    const restore =
      mode === "preArm"
        ? // 선발동형 — 표식을 지우면 다음 국에 다시 켜진다
          preArmRestoreEvents(req.payload.augmentId, req.player)
        : (() => {
            const key = spentKeyOf(state, req.payload.augmentId, req.player) as string;
            // 불리언 소진 플래그는 false로, 숫자 카운터는 1 감소로 되돌린다
            return [augmentDataSet(key, flagOf(state, key) ? false : counterOf(state, key) - 1)];
          })();
    return [
      // 대상 증강의 사용 기록을 되돌린다 (한 번 더 쓸 수 있게)
      ...restore,
      // 재장전 자신을 1 소진
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      // 전원 공개 — 소진됐다고 믿던 증강이 되살아났음을 알린다
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), req.payload.augmentId),
    ];
  },
};

export const reload: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "etc",
  complexity: 1,
  name: "재장전",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 사용 횟수를 이미 쓴 내 다른 증강 하나를 지목해 1회 복구한다.",
  /**
   * 첫 드래프트(동1국 진입)에서는 제시하지 않는다.
   *
   * 이 증강은 **이미 소진한 내 다른 증강**이 있어야 값이 선다. 첫 스테이지에는 손에
   * 아무것도 없으므로 그 자리에서 집으면 3지선다 한 칸을 빈손으로 쓰는 셈이다.
   * 두 번째 스테이지부터는 최소 한 장을 쳐 봤으므로 그때부터 나온다.
   */
  draftStages: ["eastThird", "eastFourth", "southEntry", "southThird"],
  /**
   * **되살릴 것이 하나도 없으면 후보로도 뜨지 않는다** (2026-08-25 사용자 지시).
   *
   * 위 `draftStages`는 "첫 스테이지에는 손이 비어 있다"까지만 막는다. 그런데 두 번째
   * 스테이지 이후에도 손에 **횟수형·선발동형이 하나도 없을 수** 있고(전부 상시·쿨다운
   * 액티브인 경우), 그때 재장전을 집으면 게임이 끝날 때까지 누를 수 없는 카드가 된다.
   */
  draftRequires: (state, player) => hasRestorableAugment(state, player),
  detail:
    "자기 순에 소진한 내 증강 하나를 지목해 그 사용 횟수를 한 번 되돌린다. 복구는 전원에게 공개된다.\n\n대상은 게임 단위 횟수를 쓰는 내 증강이다 — **'게임 내 1회'도 되돌릴 수 있다.** 국 단위 쿨다운으로 도는 증강과 재장전 자신은 고를 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(reloadAction);
    }

    // 사용 횟수가 남았고 복구할 증강이 있으면 보유자 턴에 후보를 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      return reloadable(state, holder).map((augId) => ({
        type: ACTION,
        payload: { augmentId: augId },
      }));
    });
  },
  // 봇: 복구할 증강이 있으면 곧바로 되살린다 — 자원 회복은 언제나 이득(자해 없음).
  bot: plan({
    intent: "setup",
    // 재장전은 자기 순이면 언제든 된다 — 회수할 국이 남아 있을 때만 값이 있다
    // (올라스에 복구해 봐야 쓸 자리가 없다). 그 판단이 setup 적기다.
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
