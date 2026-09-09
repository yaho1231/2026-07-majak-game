/**
 * 박무 (brief_fog, prism) — hidden_river의 "순간 집중형 6순 한정" 형제.
 *
 * 동풍전 2국에 1회·반장전 3국에 1회, 자기 턴에 선언하면 그 순간부터 **6순 동안** 테이블의 모든 바닥에
 * 안개가 낀다. 6순이 지나면 안개는 저절로 걷히고 모든 바닥이 다시 정상으로 보인다.
 * `hidden_river`(선언하면 게임이 끝날 때까지)의 시간 제한판 — 짧고 굵게,
 * 결정적인 한 판의 몇 순 동안만 상대의 현물 읽기를 통째로 지운다.
 *
 * hidden_river와의 유일한 차이는 지속 시간이다:
 * - hidden_river: 선언 플래그가 게임 내내 켜져 있다.
 * - brief_fog:    선언 시점의 turnCount를 저장하고, `turnCount < declaredTurn + 6`
 *                 인 동안에만 안개가 유효하다. 창이 지나면 visibility 모디파이어가
 *                 그냥 원래 값(cur)을 돌려주므로 별도의 "안개 해제" 처리가 필요 없다.
 * - 재사용은 **국 단위 쿨다운**이다 — 동풍전 2국에 1회·반장전 3국에 1회
 *   (2026-08-27 사용자 지시. 예전에는 매치당 횟수였다). 쿨다운 기준점은 게임 단위
 *   키(`brief_fog:usedSeq:`)에 남고, 안개가 지금 유효한지는 그와 별개의 '시간 계산'이다.
 *
 * 안개 중에도 각 플레이어의 마지막 버림패 한 장은 전원에게 보인다 —
 * 론·후로 판정과 최소한의 현물 수비가 죽지 않도록 hidden_river와 똑같이 유지한다.
 *
 * 구현:
 * - 액션 `declare_brief_fog {}` — turn.act·자기 턴·쿨다운(동풍전 2국·반장전 3국).
 * - `visibility.discards`를 `rules.addModifier`로 걸어 **안개가 지금 유효할 때만**
 *   (선언됨 && 6순 창 이내) 비보유자에게 count_only를 돌려준다(state undefined 방어).
 * - 각자의 마지막 버림패 맵을 전원 공개 뷰 채널 + `revealTiles:fog` 코어 채널에 실어
 *   클라이언트가 '진짜 패'로 그리게 한다(안개 유효 중에만 갱신).
 *
 * ⚠ 키 접두는 `brief_fog:`로 hidden_river(`hidden_river:`)와 절대 겹치지 않게 한다.
 */

import {
  ROUND_SETTLED,
  ROUND_STARTED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  discardsZone,
  playerAtSeat,
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
  cooldownReady,
  cooldownUse,
  roundViewKey,
  scaledCooldown,
  trackRoundSeq,
} from "../util.js";
import { clearViewOnDisarm } from "./disarmBanner.js";
import {
  BRIEF_FOG_TURNS,
  briefFogActive,
  briefFogTurnKey,
  fogCasterNow,
} from "./fogScope.js";
import { plan } from "./botPlan.js";

const ID = "brief_fog";
const ACTION = "declare_brief_fog";
/** 안개가 유효한 순 수 — 선언한 순부터 이 수만큼 (turnCount는 오야가 뽑을 때만 +1 = 진짜 순) */
const FOG_TURNS = BRIEF_FOG_TURNS;

/**
 * 다시 열릴 때까지의 국 수 — **동풍전 2국 / 반장전 3국** (2026-08-27 사용자 지시).
 *
 * 예전에는 매치당 사용 횟수(`matchUses`, 동풍전 1·반장전 2회)였다. 매치 예산이라
 * 승부처에 몰아 태울 수 있었고, "짧고 굵게 몇 순"이라는 설계와 달리 매치의 특정
 * 구간만 통째로 흐려졌다. 국 단위 쿨다운은 같은 총량을 매치 전체에 고르게 편다.
 */
const cooldownRounds = (state: GameState): number => scaledCooldown(state, 2);
const cooldownOpen = (state: GameState, holder: PlayerId): boolean =>
  cooldownReady(state, ID, holder, cooldownRounds(state));
/** 선언 순(6순 창의 기준점) 키 — 국 스코프. 정의는 fogScope가 소유한다. */
const turnKey = briefFogTurnKey;
/** 선언 사실을 전원에게 알리는 공개 뷰 채널 */
const noticeKey = (holder: PlayerId): string => roundViewKey("*", `${ID}:${holder}`);
/** 각 플레이어의 마지막 버림패 맵 { playerId: tileId } — 전원 공개 */
const lastMapKey = (holder: PlayerId): string =>
  roundViewKey("*", `${ID}:last:${holder}`);
/**
 * 위 맵의 tileId를 '진짜 패'로 그리게 하는 코어 공개 채널.
 *
 * ⚠ **보유자별로 갈라야 한다.** 예전에는 `revealTiles:fog` 하나를 숨은 강(hidden_river)과
 * 공유해, 한쪽이 선언하면 다른 쪽의 공개 목록을 통째로 덮어썼다(2026-07-29 감사).
 */
const revealKey = (holder: PlayerId): string =>
  roundViewKey("*", `revealTiles:fog:${holder}`);

/** 지금 이 순간 안개가 유효한가 — 이번 국에 선언했고, 그 뒤 6순 이내 (fogScope 소유) */
const fogActive = briefFogActive;

/** 지금 안개가 몇 순 더 가는가 (걷혔으면 0) */
function fogTurnsLeft(state: GameState, holder: PlayerId): number {
  const declaredTurn = state.augmentData[turnKey(state, holder)];
  if (typeof declaredTurn !== "number") return 0;
  return Math.max(0, FOG_TURNS - (state.round.turnCount - declaredTurn));
}

/** 이름표에 붙는 표식 문구 (걷혔으면 빈 문자열 = 표식 없음) */
function fogNotice(state: GameState, holder: PlayerId): string {
  const left = fogTurnsLeft(state, holder);
  return left > 0 ? `안개 (${left}순 남음)` : "";
}

/** 네 사람 각자의 마지막 버림패 { playerId: tileId } */
function lastDiscardMap(state: GameState): Record<PlayerId, TileId> {
  const out: Record<PlayerId, TileId> = {};
  for (const p of state.players) {
    const last = state.zones[discardsZone(p.id)]?.tileIds.at(-1);
    if (last !== undefined) out[p.id] = last;
  }
  return out;
}

const declareBriefFogAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no brief_fog augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!cooldownOpen(state, req.player)) return "brief_fog on cooldown";
    if (fogActive(state, req.player)) return "fog still active";
    return null;
  },
  toEvents: (req, { state }) => {
    const map = lastDiscardMap(state);
    return [
      ...cooldownUse(state, ID, req.player, cooldownRounds(state)),
      augmentDataSet(turnKey(state, req.player), state.round.turnCount),
      // 선언 시점의 state에는 아직 uses·turnKey가 반영되지 않았다 — 방금 건 안개이므로
      // 남은 순은 정의상 FOG_TURNS다. 이후 갱신은 TILE_DISCARDED 틱이 맡는다.
      augmentDataSet(noticeKey(req.player), `안개 (${FOG_TURNS}순 남음)`),
      augmentDataSet(lastMapKey(req.player), map),
      augmentDataSet(revealKey(req.player), Object.values(map)),
    ];
  },
};

export const briefFog: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 1,
  name: "박무",
  description:
    "(동풍전 2국에 1회 · 반장전 3국에 1회) 선언하면 6순 동안 네 사람의 버림패가 가려지고, 나만 네 사람의 바닥을 그대로 볼 수 있다.",
  detail:
    "선언하면 6순 동안 네 사람의 버림패가 가려지고 나만 그대로 본다.\n\n선언하면 6순 동안 네 사람의 버림패가 가려지고 나만 그대로 볼 수 있다.\n\n각자의 마지막 버림패 한 장은 계속 공개되므로 론과 후로는 평소대로 할 수 있다. 안개가 걷히기 전에는 다시 선언할 수 없다.",
  // 봇: 자해 위험이 전혀 없다 — 옵션이 뜨면 곧바로 선언한다.
  /*
   * 봇: 6순짜리 안개를 정보가 거의 없는 첫 순에 태우지 않는다 — 상대가 리치를 걸었거나
   * 어느 정도 순이 지나 현물이 쌓였을 때 걸어야 방해 가치가 산다(2026-07-29 감사).
   */
  // 예전에는 `!someoneRiichi && turnCount < N → null`을 이 파일이 직접 들고 있었다.
  // 같은 조건문이 안개·위험 감지·무적에 복붙돼 있었고, 증강이 늘면 복붙도 늘어난다.
  // 지금은 planner의 `disrupt` 적기가 한 곳에서 답한다.
  bot: plan({
    intent: "disrupt",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 쿨다운 기준 — 국이 시작될 때마다 +1, 잔량은 보유자 pill에 그려진다
    trackRoundSeq(ctx, ID, cooldownRounds);

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(declareBriefFogAction);
    }

    // 안개가 지금 유효할 때만(선언됨 && 6순 창 이내) count_only를 돌려준다.
    // 창이 지나면 그냥 cur을 돌려주므로 별도의 '안개 해제' 처리가 필요 없다.
    engine.rules.addModifier<VisibilityRule>("visibility.discards", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!fogActive(state, holder)) return cur;
        /*
         * 지금 **안개를 걸어 둔 사람**은 어느 바닥이든 그대로 읽는다.
         *
         * ⚠ 예전에는 `rctx.playerId === holder`, 즉 **이 인스턴스의 보유자만** 면제했다.
         * 그래서 박무 둘이 각자 선언하면 서로의 모디파이어에 걸려 **양쪽 보유자가 모두**
         * 장수만 보게 됐고(0장 — 아무것도 안 든 것보다 못하다), 안개 덮인 바닥과
         * 겹쳐도 같은 일이 났다. 카드가 약속한 "나만 네 개의 바닥을 그대로 본다"의
         * 정반대다(2026-08-23 QA synergy3 disrupt 확정 2·3). 안개 덮인 바닥 쪽은 같은
         * 결함을 이미 한 번 고쳤는데(qa-lab text 확정 5) 이쪽에는 옮겨지지 않았다 —
         * 이제 판정이 `fogScope` 한 곳에 있어 다시 갈라질 수 없다.
         */
        const viewer = rctx.playerId;
        if (viewer !== undefined && fogCasterNow(state, viewer)) return cur;
        return "count_only";
      },
    });

    /*
     * 버림마다 한 틱: 안개가 살아 있으면 "각자의 마지막 버림패" 맵과 남은 순 표식을
     * 갱신하고, 이미 걷혔으면 그 흔적을 걷어낸다.
     *
     * ⚠ 예전에는 안개가 유효할 때만 돌고 표식(noticeKey)은 선언 시 한 번만 세웠다.
     * 표식은 국 스코프라 **6순이 지나 안개가 실제로 걷힌 뒤에도 국이 끝날 때까지
     * "안개"가 떠 있었다**(docs/25 정보 계열 #4). 화면이 실제 상태와 어긋나면
     * 상대는 걷힌 안개를 피해 계속 수비하게 된다.
     */
    ctx.reaction(TILE_DISCARDED, (_event, rc) => {
      const notice = fogNotice(rc.state, holder);
      if (rc.state.augmentData[noticeKey(holder)] !== notice) {
        rc.emit(augmentDataSet(noticeKey(holder), notice));
      }
      if (notice === "") {
        // 안개가 걷혔다 — 바닥은 다시 전부 공개되므로 "마지막 한 장" 공개도 필요 없다.
        // 남겨 두면 지난 순의 tileId가 계속 실물 공개된 채로 떠 있는다.
        const revealed = rc.state.augmentData[revealKey(holder)];
        if (Array.isArray(revealed) && revealed.length > 0) {
          rc.emit(augmentDataSet(lastMapKey(holder), {}));
          rc.emit(augmentDataSet(revealKey(holder), []));
        }
        return;
      }
      const map = lastDiscardMap(rc.state);
      rc.emit(augmentDataSet(lastMapKey(holder), map));
      rc.emit(augmentDataSet(revealKey(holder), Object.values(map)));
    });

    /*
     * 국이 끝나면 그 자리에서 안개를 걷는다 — **결과 화면에 배지가 남지 않게**.
     *
     * 효과 자체는 정산과 함께 정확히 끝난다(`turnKey`가 국 스코프라 다음 국 값이
     * 쓰이는 순간 만료). 그런데 배지를 내리는 유일한 지점이 `TILE_DISCARDED`였고
     * 정산 뒤에는 버림이 없다 — 6순이 다 가기 전에 국이 끝나면 "안개 (N순 남음)"이
     * 결과 화면 내내 서 있었다(2026-08-22 QA aug-1 의심 5). detail의
     * "6순이 다 가기 전에 국이 끝나면 함께 걷힌다"와 화면이 어긋난다.
     * `blind_ron`이 같은 증상을 같은 방식으로 고쳤다.
     */
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      if (rc.state.augmentData[noticeKey(holder)] !== "") {
        rc.emit(augmentDataSet(noticeKey(holder), ""));
      }
      const revealed = rc.state.augmentData[revealKey(holder)];
      if (Array.isArray(revealed) && revealed.length > 0) {
        rc.emit(augmentDataSet(lastMapKey(holder), {}));
        rc.emit(augmentDataSet(revealKey(holder), []));
      }
    });


    /*
     * 무장해제로 잠기면 «안개 (N순 남음)» 배너와 마지막 버림 실물 공개를 함께 내린다 (2026-08-23 QA synergy3 disrupt 확정 4).
     * 효과는 게이트가 막는데 배너만 남아 있으면 화면이 정확히 반대를 말한다 —
     * 눈먼 총알·초읽기와 같은 규약이다(disarmBanner.ts).
     */
    clearViewOnDisarm(ctx, () => [
      noticeKey(holder),
      lastMapKey(holder),
      revealKey(holder),
    ]);

    // 국이 바뀌면 바닥이 비므로 지난 국 tileId가 새지 않게 맵을 비운다
    // (쿨다운 기준점은 게임 단위라 그대로 유지된다 — 동풍전 2국·반장전 3국).
    // 국 시작에는 **조건 없이** 비운다. 안개 활성 여부로 게이트를 걸면, 안개가 이미
    // 만료된 국에서는 정리가 건너뛰어져 지난 국의 tileId가 전원에게 계속 실물 공개된다.
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const map = rc.state.augmentData[lastMapKey(holder)];
      const revealed = rc.state.augmentData[revealKey(holder)];
      if (map !== undefined && Object.keys(map as object).length > 0) {
        rc.emit(augmentDataSet(lastMapKey(holder), {}));
      }
      if (Array.isArray(revealed) && revealed.length > 0) {
        rc.emit(augmentDataSet(revealKey(holder), []));
      }
      // 표식도 함께 — 국 스코프 키라 자동으로 지워지지만, 재구성 경로에서 지난 국의
      // 문구가 남는 경우가 있어 명시적으로 비운다.
      if (rc.state.augmentData[noticeKey(holder)] !== undefined) {
        rc.emit(augmentDataSet(noticeKey(holder), ""));
      }
    });

    // 쿨다운이 풀렸고 안개가 활성 중이 아니면 보유자 턴에 선언 후보를 낸다
    ctx.holderTurnOptions((state) =>
      cooldownOpen(state, holder) && !fogActive(state, holder)
        ? [{ type: ACTION, payload: {} }]
        : [],
    );
  },
});
