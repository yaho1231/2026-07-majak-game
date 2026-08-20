/**
 * 안개 덮인 바닥 (hidden_river, prism) — 동풍전 1·반장전 2회 선언하는 액티브.
 * 선언한 순간부터 **그 국이 끝날 때까지** 테이블의 **모든** 바닥에 안개가 낀다.
 *
 * 55차(사용자 피드백): 상시 패시브였던 것을 **자기 턴에 한 번 선언하는 액티브**로 바꿨다.
 * 선언 전에는 바닥이 정상적으로 보이고, `declare_fog`를 누른 그 순간 테이블 전체가
 * 뒷면으로 덮인다 — 발동이 눈에 보이는 사건이 된다(도파민 리트머스 ①).
 *
 * ## 2026-08-15 (사용자 지시) — "게임 내 1회, 게임 끝까지" → **동풍전 1·반장전 2회, 그 국 동안**
 *
 * 예전엔 한 번 선언하면 게임이 끝날 때까지 안개가 유지됐다(플래그가 게임 스코프).
 * 횟수가 늘어난 지금은 그 설계를 유지할 수 없다 — 첫 선언이 영구히 유지되면 두 번째
 * 사용이 아무 일도 하지 않는 죽은 횟수가 된다. 그래서 안개의 수명을 **국**으로 옮겼다:
 * 선언 플래그는 roundKey 스코프(국이 끝나면 저절로 걷힌다), 사용 횟수 카운터만
 * 게임 스코프로 남는다(`usesKey` — 박무와 같은 꼴).
 *
 * 박무(brief_fog)와의 자리 구분은 그대로다 — 박무는 **6순**, 이쪽은 **그 국 내내**이고,
 * 박무는 내용을 통째로 가리지만(count_only) 이쪽은 최근 6장을 남긴다.
 *
 * 2026-08-02(사용자 지시): 안개 속에서 보이는 범위가 "각자의 마지막 1장"에서
 * **최근 6장**으로 넓어졌다. 그 이전 버림패만 장수로 남고 내용이 가려진다 —
 * 상대는 직전 한 바퀴 정도의 현물만 읽을 수 있고, 국 초반의 버림 이력은 지워진다.
 *
 * 구현:
 * - 액션 `declare_fog {}` — turn.act·자기 턴·동풍전 1·반장전 2회(이번 국에 아직 안 걸었을 때).
 * - `visibility.discards`는 `setHolderRule`(상시 고정)이 아니라 `rules.addModifier`로
 *   걸어 **선언 플래그가 켜져 있을 때만** 비보유자에게 `{mode:"peek",count:6,pick:"back"}`을
 *   돌려준다(state undefined 방어). 코어 PlayerView가 뒤 6장만 tileIds로 주고 나머지는
 *   hiddenCount로 세므로, "최근 6장"이 후로로 바닥에서 패가 빠져도 항상 정확하다
 *   (예전의 augmentData 스냅샷 방식과 달리 갱신 누락이 원리적으로 없다).
 * - 이미 다른 안개(박무)가 더 좁게 가려 두었다면 그대로 둔다 — 가시성은 **좁은 쪽**이
 *   이겨야 설치 순서로 정보가 새지 않는다.
 */

import { augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  VisibilityRule,
} from "@majak/core";
import {
  counterOf,
  flagOf,
  matchUses,
  publishUsesLeft,
  roundKey,
  roundViewKey,
} from "../util.js";
import { plan } from "./botPlan.js";

const ID = "hidden_river";
const ACTION = "declare_fog";
/** 안개 속에서도 전원에게 보이는 최근 버림패 장수 */
const RECENT = 6;

/**
 * 안개 선언 플래그 — **국 단위**다(roundKey 스코프).
 * 국이 끝나면 저절로 걷히므로 별도의 해제 처리가 필요 없다.
 */
const fogKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:fog:${roundKey(state)}:${holder}`;
/** 매치당 사용 횟수 카운터 — **게임 단위**라 roundKey를 섞지 않는다. 동풍전 1·반장전 2회. */
const usesKey = (holder: PlayerId): string => `${ID}:uses:${holder}`;
/** 선언 사실을 전원에게 알리는 공개 뷰 채널 */
const noticeKey = (holder: PlayerId): string => roundViewKey("*", `${ID}:${holder}`);

/** 이번 국에 안개가 걸려 있는가 */
function fogDeclared(state: GameState, holder: PlayerId): boolean {
  return flagOf(state, fogKey(state, holder));
}

/** 아직 사용 횟수가 남았는가 (동풍전 1회 · 반장전 2회) */
function hasUsesLeft(state: GameState, holder: PlayerId): boolean {
  return counterOf(state, usesKey(holder)) < matchUses(state);
}

const declareFogAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no hidden_river augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "hidden_river no uses left";
    if (fogDeclared(state, req.player)) return "fog already declared this round";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(fogKey(state, req.player), true),
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
    augmentDataSet(noticeKey(req.player), "안개"),
  ],
};

export const hiddenRiver: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 2,
  name: "안개 덮인 바닥",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 선언하면 그 국이 끝날 때까지 안개가 지속된다. 모든 플레이어의 버림패는 최근 6장만 공개되며, 그 이전 버림패는 다른 플레이어에게 장수만 보이고 내용이 안개에 가려진다. 보유자는 모든 플레이어의 버림패를 정상적으로 확인할 수 있다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 선언하기 전에는 바닥이 평소대로 보이지만, 자기 순에 선언하면 그 국이 끝날 때까지 네 사람 모두의 바닥에서 최근 6장만 공개된다. 그보다 앞선 버림패는 다른 사람에게 장수만 보이고 내용이 가려진다. 보유자만 네 개의 바닥을 그대로 읽는다. 최근 6장은 전원에게 보이므로 론·후로 판정과 직전 한 바퀴의 현물 수비는 그대로 유지된다. 안개는 국이 끝나면 걷히고, 횟수가 남아 있으면 다음 국에 다시 걸 수 있다.",
  // 봇: 자해 위험이 전혀 없다 — 옵션이 뜨면 곧바로 선언한다.
  bot: plan({
    intent: "setup",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // 선언 전에는 화면에 아무 흔적이 없어, 이 증강을 들고 있다는 것 말고는
    // "아직 쓸 수 있다"를 읽을 길이 없었다.
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) engine.actions.register(declareFogAction);

    // 선언 후에만 안개가 낀다 — setHolderRule은 상시 고정이라 쓸 수 없다.
    engine.rules.addModifier<VisibilityRule>("visibility.discards", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!fogDeclared(state, holder)) return cur;
        /*
         * 안개를 **건 사람**은 어느 바닥이든 그대로 읽는다.
         *
         * ⚠ 예전에는 `rctx.playerId === holder`, 즉 **이 인스턴스의 보유자만** 면제했다.
         * 그래서 둘이 각자 안개를 걸면 서로의 모디파이어에 걸려 **양쪽 보유자가 모두**
         * 최근 6장만 보게 됐다 — 횟수를 태워 시야를 얻는 증강이 시야를 잃는,
         * 설명("보유자만 네 개의 바닥을 그대로 읽는다")과 정반대의 결과였다
         * (qa-lab text 확정 5). 지금은 "이번 국에 안개를 선언한 사람"이면 누구든 면제한다.
         */
        const viewer = rctx.playerId;
        if (viewer !== undefined && fogDeclared(state, viewer)) return cur;
        // 이미 더 좁게 가려져 있으면(박무의 count_only 등) 넓히지 않는다
        if (cur === "count_only" || cur === "hidden") return cur;
        if (typeof cur === "object") {
          return cur.count <= RECENT ? cur : { mode: "peek", count: RECENT, pick: "back" };
        }
        return { mode: "peek", count: RECENT, pick: "back" };
      },
    });

    // 표식(noticeKey)도 안개도 국 스코프라 국이 바뀌면 함께 사라진다 —
    // 예전처럼 국 시작마다 표식을 다시 걸 필요가 없다.

    // 횟수가 남았고 이번 국에 아직 안 걸었으면 보유자 턴에 선언 후보를 낸다
    // (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      hasUsesLeft(state, holder) && !fogDeclared(state, holder)
        ? [{ type: ACTION, payload: {} }]
        : [],
    );
  },
});
