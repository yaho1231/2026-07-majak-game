/**
 * 마작의 거신병 (giant_god, prism) — **국당 1회**. 내 바닥에 잠든 국사무쌍 13종을
 * 통째로 손으로 끌어올려 국사무쌍 텐파이를 완성하고, **다음 순에 반드시 화료한다**.
 *
 * 사양은 한 줄이다 (2026-08-20 사용자 확정):
 *   **국사무쌍 13종을 전부 버려 두면, 그 다음 순에 국사무쌍 13면으로 화료할 수 있다.**
 * 아래의 스왑·예약·후리텐 처리는 전부 그 한 줄을 성립시키기 위한 배관이며,
 * 배관 사정으로 그 한 줄이 깨지면(쯔모패 분실·후리텐 잔류) 그건 버그다.
 *
 * 부수는 상식: "버린 패는 죽은 패". 이 증강은 내 강(버림패 더미)에 흩어져 쌓인
 * 1m9m·1p9p·1s9s·동남서북·백발중 **13종이 한 장씩 전부** 깔리는 순간, 그 13장을
 * 손으로 소환하고 지금 손패를 그 자리(바닥)로 내던진다. 12순 동안 무심코 버려 온
 * 요구패들이 거신병처럼 일어나 손패가 된다.
 *
 * 발동 조건: 보유자 **자기 바닥**이 국사 13종을 모두(각 1장 이상) 포함할 때 액티브가 켜진다.
 *
 * 스왑 규칙 (손패 장수 불변):
 * - 바닥의 13종에서 **종류당 첫 매칭 타일 1장씩**(결정적)을 골라 손으로 올린다 → 정확히 13장 IN.
 * - 손패에서 **쯔모패를 뺀** 13장(handIdsOf 순서, 결정적)을 바닥으로 내린다 → 정확히 13장 OUT.
 * - 손패 13장(배패 상태·후로 직후, 쯔모패 없음)이면 스왑 후 **순수 국사 13면 대기**가 된다.
 * - 손패 14장(막 쯔모)이면 쯔모패가 남아 14장(국사 13종+쯔모패 1장)이 된다.
 *   어느 쪽이든 "13 OUT / 13 IN"이라 손패 총량은 그대로다.
 *
 * ⚠ **쯔모패는 절대 내보내지 않는다** (2026-08-20 수정). 예전에는 `slice(0, 13)` —
 * "배열 앞 13장"이라 쯔모패가 배열 끝이 아니면(개벽처럼 손패를 재배열하는 증강 뒤)
 * 쯔모패가 바닥으로 나갔다. 그러면 `round.lastDrawnTile`이 손 밖을 가리켜
 * `buildWinContext`의 채점 손패가 15장이 되고, **완성된 국사무쌍인데 화료 버튼이 뜨지
 * 않았다**(리치 중이었다면 쯔모기리 강제 경로가 막혀 소프트락). 밥상 뒤엎기가
 * `replaceDrawnTile`로 막는 것과 같은 함정이다 — 여기서는 후보에서 쯔모패를 제외한다.
 *
 * **다음 순의 화료 예약** (2026-08-12 사용자 지시): 각성한 거신병은 텐파이에서 멈추지
 * 않는다. 발동하면 `giant_god:tsumo:<국>:<보유자>` 예약이 서고, 그 국의 **다음 정상 쯔모**
 * 한 장이 요구패(오름패)로 물질화된다 — 소환(conjure_draw)과 같은 방식으로 이미 뽑은
 * 실물 패의 kind만 바꾸므로 난수도 손패 장수도 건드리지 않는다. 13면 대기 손에 오름패가
 * 오므로 그 순의 쯔모 화료(국사무쌍)가 보장된다.
 * (남이 먼저 화료하거나 유국이면 예약은 국과 함께 사라진다. 스스로 요구패를 버려
 *  손을 무너뜨린 경우에는 부를 수 있는 오름패가 없으므로 아무 일도 일어나지 않는다.)
 *
 * 설계 결정:
 * - **국당 1회** (2026-08-20). 예전에는 "발동하면 바닥의 13종이 손으로 올라가 조건이
 *   스스로 무너진다"를 리미트로 삼았는데, 이건 **거짓**이었다 — 발동은 손패와 바닥을
 *   맞바꾸는 것이라, 내려간 손패가 다시 13종을 덮으면(예: 순국사 13장을 쥔 채 발동)
 *   조건이 그대로 유지된다. 발동은 턴을 넘기지 않으므로 같은 순에 버튼이 무한히 다시
 *   떴고, 봇 정책은 조건 없이 그 버튼을 누르므로 서버 봇이 같은 순을 못 벗어났다.
 *   조건이 스스로 무너진다는 보장이 없으므로 **명시적 카운터**를 둔다
 *   (`giant_god:used:<국>:<보유자>` — 국 스코프, 매 국 초기화).
 * - 결정적(prng 없음): moveTiles 두 번 + 쯔모패 kind 변경. 리플레이·재개 안전.
 *
 * 구현: 커스텀 액션 하나 + 리듀서 하나 + 쯔모 반응 하나.
 * - moveTiles(discards→hand, 국사 13장) 후 moveTiles(hand→discards, 손패 앞 13장).
 *   국사 13장은 바닥 출신, 내보낼 13장은 손패 출신이라 타일 id가 서로 겹치지 않는다.
 * - 발동은 전원 공개(view:*:giant_god:<holder>) — 거신병 각성은 이 증강의 구경거리다.
 */

import {
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  discardsZone,
  handIdsOf,
  handZone,
  isTerminalOrHonor,
  kindKey,
  kindOf,
  meldCountOf,
  moveTiles,
  playerAtSeat,
  scoringOptionsOf,
  tileKindChanged,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDrawnPayload,
  TileId,
  TileKind,
} from "@majak/core";
import { flagOf, publishUsesLeft, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "giant_god";
const ACTION = "giant_god";
const EVENT = "GiantGodAwakened";

/**
 * "다음 정상 쯔모를 오름패로" 예약 — **국 스코프**다.
 *
 * 게임 스코프로 두면 소비 전에 국이 끝났을 때(남의 화료·유국) 예약이 다음 국의 첫
 * 쯔모를 강탈한다 — 소환(conjure_draw)이 같은 이유로 국 스코프를 쓴다.
 */
const tsumoKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "tsumo", state, h);

/**
 * **국당 1회** 소진 플래그 — 국 스코프(매 국 자동 초기화).
 *
 * 소환(conjure_draw)의 `used:` 키와 같은 규약이다.
 */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

/**
 * 각성 시점의 **유국역만 스냅샷** — 값은 "각성 직후 버림 이력의 길이"다.
 *
 * 각성은 요구패 이력을 통째로 지우고 그 자리에 내려보낸 손패(중장패)를 넣는다.
 * 후리텐을 푸는 정당한 처리지만, 그 결과 `nagashi_yakuman`의 판정("내 버림이 전부
 * 요구패·자패")이 **거짓이 되어 유국역만 48,000이 통째로 사라졌다** — 거신병의 발동
 * 조건(요구패 13종을 내가 전부 버려 뒀다)은 유국역만의 조건을 포함하는데,
 * 각성이 그것을 스스로 지운 셈이다(QA synergy3 shape 확정 3, 2026-08-23).
 *
 * 그래서 각성 직전 이력이 전부 요구패·자패였으면 표식을 남긴다. 길이를 담는 이유는
 * **각성 이후의 버림은 그대로 검사해야** 하기 때문이다 — 유국역만은 그 뒤 잡패를
 * 버리면 여전히 깨져야 한다(`nagashi_yakuman.nagashiValid`가 이 값 뒤쪽만 본다).
 */
export const giantGodNagashiBaseKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "nagashiBase", state, h);

/**
 * `discardedKinds`의 kindKey("man1"·"wind3")를 TileKind로 되돌린다 — 이력은 문자열
 * 스냅샷이라 tileId가 없다. (`nagashi_yakuman`에 같은 함수가 있다: 판정 기준을 맞춘다.)
 */
function kindFromKey(key: string): TileKind {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return { suit: "man", rank: 5 }; // 파싱 실패 = 요구패 아님으로 취급
  return { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
}

/** 국사무쌍 13종 (1·9 수패 + 동남서북 + 백발중) */
const KOKUSHI_KINDS = [
  { suit: "man", rank: 1 },
  { suit: "man", rank: 9 },
  { suit: "pin", rank: 1 },
  { suit: "pin", rank: 9 },
  { suit: "sou", rank: 1 },
  { suit: "sou", rank: 9 },
  { suit: "wind", rank: 1 },
  { suit: "wind", rank: 2 },
  { suit: "wind", rank: 3 },
  { suit: "wind", rank: 4 },
  { suit: "dragon", rank: 1 },
  { suit: "dragon", rank: 2 },
  { suit: "dragon", rank: 3 },
] as const;

const KOKUSHI_KEYS: string[] = KOKUSHI_KINDS.map(kindKey);

/**
 * 보유자 바닥에서 국사 13종을 종류당 1장씩 결정적으로 뽑는다.
 * 한 종류라도 없으면 null (아직 발동 불가).
 */
function pickKokushiIds(state: GameState, holder: PlayerId): TileId[] | null {
  const pond = state.zones[discardsZone(holder)]?.tileIds ?? [];
  const out: TileId[] = [];
  for (const key of KOKUSHI_KEYS) {
    const id = pond.find((tid) => kindKey(kindOf(state, tid)) === key);
    if (id === undefined) return null;
    out.push(id);
  }
  return out;
}

/**
 * 바닥으로 내려보낼 손패 13장 — **쯔모패는 반드시 뺀다**.
 *
 * 쯔모패를 내보내면 `round.lastDrawnTile`이 손 밖을 가리켜 화료 경로와 리치 쯔모기리가
 * 통째로 죽는다(헤더 ⚠). 13장을 채우지 못하면 null → 발동 불가.
 */
function pickHandOut(state: GameState, holder: PlayerId): TileId[] | null {
  const drawn = state.round.lastDrawnTile;
  const rest = handIdsOf(state, holder).filter((id) => id !== drawn);
  if (rest.length < 13) return null;
  return rest.slice(0, 13);
}

/** 지금 거신병을 깨울 수 있는가 (자기 턴 · 국당 1회 미소진 · 내보낼 13장 · 바닥에 국사 13종) */
function canAwaken(state: GameState, holder: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return false;
  if (flagOf(state, usedKey(state, holder))) return false;
  if (pickHandOut(state, holder) === null) return false;
  return pickKokushiIds(state, holder) !== null;
}

interface GiantGodPayload {
  holder: PlayerId;
  /** 바닥에서 손으로 올릴 국사 13장 */
  kokushiIds: TileId[];
  /** 손패에서 바닥으로 내릴 앞 13장 */
  handOut: TileId[];
}

const giantGodAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no giant_god augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 리치 중에는 손패가 동결된다 (2026-07-29 감사: 자기 리치 검사 누락)
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    if (pickHandOut(state, req.player) === null) {
      return "need at least 13 in hand besides the drawn tile";
    }
    if (pickKokushiIds(state, req.player) === null) {
      return "kokushi 13 kinds are not all in your pond";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const kokushiIds = pickKokushiIds(state, req.player);
    if (kokushiIds === null) throw new Error("giant_god: pond no longer covers kokushi");
    const handOut = pickHandOut(state, req.player);
    if (handOut === null) throw new Error("giant_god: not enough hand tiles to send down");
    return [
      {
        type: EVENT,
        payload: {
          holder: req.player,
          kokushiIds,
          handOut: [...handOut],
        } satisfies GiantGodPayload,
      },
    ];
  },
};

export const giantGod: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 3,
  name: "마작의 거신병",
  description:
    "(매 국 1회) **조건: 국사무쌍 13종을 내가 직접 전부 버려 둬야 한다.** 발동하면 그 13장을 손으로 끌어올려 13면 대기가 되고, 다음 순에 반드시 화료한다.",
  detail:
    "증강이 요구패를 깔아 주지 않는다 — 남의 바닥은 세지 않고, 13종을 전부 내가 버려 뒀을 때만 각성한다. 각성하면 요구패에 대한 내 버림 이력이 지워져 후리텐이 풀린다.\n\n**치·퐁·깡을 한 번이라도 하면 그 국에는 각성할 수 없다.** 리치 중에도 쓸 수 없다.",
  install(ctx) {

    /*
     * 각성이 갈아 끼운 버림 이력의 **기준선**을 표준 유국만관 판정에도 알린다
     * (2026-08-23 QA synergy3 shape 확정 3). 이 규칙이 없으면 각성한 국의
     * 유국만관 12,000이 통째로 사라진다 — 각성 조건 자체가 "요구패만 버렸다"라
     * 그 조합은 흔하다. 유국역만 증강 쪽은 자기 판정에서 같은 스냅샷을 읽는다.
     */
    ctx.engine.rules.addModifier<number>("draw.nagashiHistoryBase", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined || rctx.playerId !== ctx.holder) return current;
        const v = state.augmentData[giantGodNagashiBaseKey(state, ctx.holder)];
        return typeof v === "number" ? Math.max(current, v) : current;
      },
    });
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(giantGodAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as GiantGodPayload;
        // ① 바닥의 국사 13장을 손으로 (손패가 13 → 26 / 14 → 27 로 잠시 늘어난다)
        let zones = moveTiles(
          state.zones,
          discardsZone(p.holder),
          handZone(p.holder),
          p.kokushiIds,
        );
        // ② 원래 손패 앞 13장을 바닥으로 (①에서 올라온 국사와 id가 겹치지 않는다)
        zones = moveTiles(zones, handZone(p.holder), discardsZone(p.holder), p.handOut);

        // ③ 버림 **이력**을 각성에 맞춘다 — 13면 대기 전체의 후리텐을 푼다.
        //
        // 후리텐은 물리 바닥이 아니라 discardedKinds로 판정한다. 그런데 이 증강의
        // 발동 조건이 "내가 요구패 13종을 전부 버려 뒀다"이므로, 손대지 않으면 보유자는
        // **13면 대기 전부에 후리텐**이라 론이 원리적으로 불가능하다 — detail이 약속하는
        // "상대가 요구패를 버리면 론으로 먼저 끝낼 수도 있다"가 통째로 거짓이 된다.
        //
        // ⚠ **요구패 13종을 이력에서 전부(모든 중복까지) 지운다** (2026-08-20 수정).
        // 예전에는 되가져온 13장에 대해 `indexOf` → splice로 **종류당 한 장씩만** 뺐다.
        // 그런데 이 증강은 "요구패를 12순 넘게 손수 흘려서" 발동하는 카드라 같은 요구패를
        // 두 번 버리는 것이 흔하다. 한 종류라도 이력에 남으면 국사 13면은 **전체가**
        // 후리텐이 되어 론 경로가 통째로 죽었다(text.md 확정 33).
        //
        // 같은 이유로 바닥으로 내려가는 13장 중 요구패는 이력에 **다시 넣지 않는다** —
        // 넣으면 방금 푼 후리텐이 그 자리에서 되돌아온다. 요구패가 아닌 것만 더한다
        // (그쪽은 이력이 곧 바닥이라는 관계를 지켜, 상대의 "저 패는 버렸으니 안전하다"는
        // 읽기를 배신하지 않는다). 각성 사실 자체는 전원에게 공개되므로, 요구패에 한해
        // 이력이 바닥과 어긋나는 것은 상대도 알고 대응할 수 있는 정보다.
        const kokushiSet = new Set(KOKUSHI_KEYS);
        const rs = state.round.byPlayer[p.holder];
        const before = rs?.discardedKinds ?? [];
        // 각성 직전 이력이 전부 요구패·자패였는가 — 유국역만 스냅샷(위 키 주석)
        const wasAllOrphans =
          before.length > 0 && before.every((k) => isTerminalOrHonor(kindFromKey(k)));
        const history = before.filter((k) => !kokushiSet.has(k));
        history.push(
          ...p.handOut
            .map((id) => kindKey(kindOf(state, id)))
            .filter((k) => !kokushiSet.has(k)),
        );
        const byPlayer =
          rs === undefined
            ? state.round.byPlayer
            : {
                ...state.round.byPlayer,
                [p.holder]: {
                  ...rs,
                  discardedKinds: history,
                  // 대기가 통째로 갈렸다 — 예전 대기 때문에 걸린 후리텐도 함께 내린다
                  // (손바닥 뒤집기가 같은 이유로 riichiFuriten을 내린다).
                  temporaryFuriten: false,
                  furiten: false,
                },
              };

        return {
          ...state,
          zones,
          round: { ...state.round, byPlayer },
          augmentData: {
            ...state.augmentData,
            // 다음 정상 쯔모를 오름패로 — "다음 순에 반드시 화료한다"
            [tsumoKey(state, p.holder)]: true,
            // 국당 1회 소진 — 발동이 턴을 넘기지 않으므로 이게 유일한 리미트다
            [usedKey(state, p.holder)]: true,
            // 전원 공개 — 거신병 각성
            [roundViewKey("*", `${ID}:${p.holder}`)]: true,
            // 유국역만 스냅샷 — 각성이 갈아 끼운 이력의 길이까지는 "전부 요구패였다"
            ...(wasAllOrphans
              ? { [giantGodNagashiBaseKey(state, p.holder)]: history.length }
              : {}),
          },
        };
      });
    }

    /**
     * 각성 다음 순 — 정상 쯔모 한 장을 오름패로 물질화한다.
     *
     * 이미 뽑힌 실물 패의 kind만 바꾼다(소환과 같은 방식) — 난수를 소비하지 않고
     * 손패 장수도 그대로다. 오름패는 **지금 손으로 화료가 되는 요구패**만 고르므로,
     * 13면 대기든 요구패 한 장을 흘린 뒤든 그 순의 쯔모 화료가 성립한다.
     */
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder) return;
      if (p.rinshan) return; // 영상패(깡 후 쯔모)가 아니라 정상 쯔모 한 장이다
      if (!flagOf(rc.state, tsumoKey(rc.state, holder))) return;
      // 예약은 한 번뿐 — 부를 수 있는 패가 없어도 여기서 비운다
      rc.emit(augmentDataSet(tsumoKey(rc.state, holder), null));
      // 쯔모패를 뺀 손패로 화료가 되는 요구패
      const hand13 = handIdsOf(rc.state, holder)
        .filter((id) => id !== p.tileId)
        .map((id) => kindOf(rc.state, id));
      const wins = winningKinds(
        hand13,
        meldCountOf(rc.state, holder),
        KOKUSHI_KINDS,
        scoringOptionsOf(rc.state, rc.rules, holder),
      );
      const target = wins[0];
      // 스스로 요구패를 버려 손을 무너뜨렸다면 부를 패가 없다 — 아무 일도 하지 않는다
      if (target === undefined) return;
      if (kindKey(kindOf(rc.state, p.tileId)) === kindKey(target)) return; // 이미 오름패다
      rc.emit(
        tileKindChanged([{ tileId: p.tileId, kind: target, attrs: { conjured: true } }]),
      );
    });

    ctx.holderTurnOptions((state) =>
      canAwaken(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );

    // 남은 횟수를 보유자 화면에 상시 노출 (국 스코프 — 매 국 1회로 돌아온다)
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );
  },
  // 봇: 제시된다는 것 자체가 국사 텐파이 확정이므로 언제나 발동한다.
  bot: plan({
    intent: "win",
    fleeting: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
