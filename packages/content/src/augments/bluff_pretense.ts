/**
 * 허장성세 (bluff_pretense, prism) — 국당 1회, 손에 같은 패가 1장뿐이어도 펑!
 * 부족한 세 번째 장은 손패의 잡패 하나를 그 패로 바꿔(conjured) 채운다.
 *
 * 부수는 상식: 펑은 손에 같은 패 2장이 있어야 한다 — 부족한 한 장이 생성패로 소환된다.
 *
 * 도파민 순간: 白을 1장만 쥔 홀더가 '펑!'을 외치자 세 번째 白이 물질화 — "너 그거
 * 한 장이었잖아?!" 이제 홀더 앞에서는 패 셈 자체가 안 통한다.
 *
 * 대응: 전원 공개라 역패·중장패를 한 단계 더 아껴 쥔다. 국당 1회이니 싼 패로 발동을
 * 유도해 소진시켜라. (생성패는 conjured 표식 — 밸런스상 도라 제외는 추후 조정 여지)
 *
 * 구현: 엔진은 실물 없는 새 tileId를 만들 수 없다 → **손패의 잡패 1장을 목표패로 변환**
 * (`tileKindChanged`, conjured)한 뒤 **표준 펑**(meldKind:"pon")을 낸다. 손 2장 소비(진짜 1 +
 * 잡패 1) + 버림 1장 = 커쯔 3장이라 손패 산술·화료 분해가 정확히 맞는다. 희생할 잡패는
 * 「펑한 뒤의 손이 가장 좋아지는 장」을 자동 선택한다(`spareTile.ts`).
 * open_kokushi식 커스텀 리액션 콜(펑과 치 사이 우선순위).
 */

import {
  CALL_MADE,
  augmentDataSet,
  belowMinHan,
  buildWinContext,
  evaluateWin,
  augmentInstanceId,
  defineAugment,
  handIdsOf,
  isSourceDisarmed,
  kindKey,
  kindOf,
  mixedTripletsFor,
  polarEndsFor,
  sameCallBody,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
  TileKind,
  YakuRegistry,
} from "@majak/core";
import { flagOf, publishUsesLeft, replaceDrawnTile, roundViewKey } from "../util.js";
import { isYakuhaiFor, lastDiscardKind } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";
import { hasSpareTile, isPreciousMaterial, pickSpareTile } from "./spareTile.js";

/**
 * 도라·적도라 판정은 `spareTile.ts`로 옮겼다(2026-09-16, 순환 import 제거). 예전
 * 호출처(`void_kan` 등)가 여기서 가져가므로 그대로 다시 내보낸다.
 */
export { isPreciousMaterial };

const ID = "bluff_pretense";
const ACTION = "bluff_pon";

const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

const wallLen = (state: GameState): number =>
  state.zones["wall"]?.tileIds.length ?? 0;

/**
 * 손패에서 목표패(버림패)와 **같은 패로 통하는** tileId 목록.
 *
 * 예전에는 `kindKey` 완전 일치로만 셌다. 그런데 표준 펑은 `sameCallKind`를 타서 동수의
 * 결속(무늬 무시)·양극을 존중하므로, 결속을 함께 든 사람이 1만 한 장을 들고 1삭 버림에
 * 허장성세를 부를 수 없었다 — "같은 패가 1장뿐이어도 퐁"이라는 문구가 그 조합에서만
 * 거짓이었다(QA synergy3 relax 확정 5, 2026-08-23).
 */
function matchingIds(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  target: TileKind,
): TileId[] {
  const mixedTri = mixedTripletsFor(state, rules, holder);
  const polar = polarEndsFor(state, rules, holder);
  // 세 번째 장은 잡패가 목표패로 **변신해서** 채운다 — 그래서 "이 손패 + 목표패 2장"이
  // 한 규칙 안에서 몸통이 되는지를 본다(1:1 비교가 아니라 세 장 기준: shape 확정 2).
  return handIdsOf(state, holder).filter((id) =>
    sameCallBody(target, kindOf(state, id), target, mixedTri, polar),
  );
}

/**
 * 희생할 잡패 하나를 고른다 — **펑을 만든 뒤의 손이 가장 좋아지는 장.**
 *
 * 진짜 매칭 패(realId)와 화료패 kind는 후보에서 뺀다. 예전에는 "이웃이 가장 적은 패"만
 * 봤는데, 그 계산은 손을 모양으로 읽지 않아 이미 완성된 몸통 한쪽이 재료로 타 버렸다
 * (2026-09-04 사용자 보고, #467). 이제 판정은 분열·삼원의 의지와 같은
 * `spareTile.pickSpareTiles` 한 곳이고, 후보마다 "펑을 하고 난 뒤의 손"(진짜 1장과
 * 재료 1장이 빠지고 후로가 하나 늘어난 손)을 그대로 만들어 샹텐을 재 가장 낮은 것을
 * 고른다. 동점이면 수용 폭 → 예전 고립도 순서다. 도라·적도라는 마지막에 태운다.
 *
 * 미리보기(`sacrificePreview`)와 발동(`validate`·`toEvents`)이 **같은 이 함수**를 부른다.
 */
function pickSacrifice(
  state: GameState,
  rules: RuleRegistry | undefined,
  holder: PlayerId,
  realId: TileId,
  targetKey: string,
): TileId | undefined {
  return pickSpareTile(state, rules, holder, {
    usable: (id) => id !== realId && kindKey(kindOf(state, id)) !== targetKey,
    meldDelta: 1,
    resultKinds: (picked): TileKind[] =>
      handIdsOf(state, holder)
        .filter((id) => id !== realId && !picked.includes(id))
        .map((id) => kindOf(state, id)),
  });
}

/**
 * **지금 허장성세 퐁을 누르면 사라지는 패** — 발동 버튼의 미리보기 재료.
 *
 * 카드는 "손패의 잡패 하나가 그 패로 바뀐다"고만 말하고 **어느 패인지는 말하지 않아서**,
 * 누르기 전에는 무엇을 잃는지 알 수 없었다(2026-09-07 사용자 요청). 희생패 선택에는
 * 무작위가 하나도 없으므로(`pickSacrifice`) 미리 보여 주는 것이 정보 누설이 아니다.
 * 계산은 발동 경로와 **같은 `pickSacrifice` 하나**다 — 두 벌이면 짚는 패와 타는 패가 갈린다.
 *
 * 게이트는 `holderReactionOptions`와 **같은 조건**이다 — 버튼이 뜨지 않는 자리에서
 * 미리보기만 떠 있으면 화면이 있지도 않은 선택지를 말하게 된다.
 */
function sacrificePreview(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): TileId | null {
  if (state.round.phase !== "reaction") return null;
  if (flagOf(state, usedKey(state, holder))) return null;
  if (state.round.byPlayer[holder]?.riichi != null) return null;
  const last = state.round.lastDiscard;
  if (last === null || last.player === holder) return null;
  if (wallLen(state) === 0) return null;
  const targetKind = kindOf(state, last.tileId);
  const matches = matchingIds(state, rules, holder, targetKind);
  if (matches.length !== 1) return null;
  return pickSacrifice(state, rules, holder, matches[0] as TileId, kindKey(targetKind)) ?? null;
}

/**
 * **퐁 하나로 손이 끝났을 때** 화료패로 삼을 손패 한 장 (없으면 undefined).
 *
 * ## 왜 필요한가 (2026-09-08 사용자 보고)
 *
 * 허장성세는 잡패 한 장을 목표패로 바꿔 커쯔를 채운다. 그래서 **퐁이 손을 완성시키는**
 * 자리가 생긴다 — 남은 열한 장이 이미 3멘쯔 + 머리면 커쯔가 서는 순간 4멘쯔 + 머리다.
 * 그런데 표준 화료 액션은 자기 순(`turn.act`)에서 `lastDrawnTile`을 요구하고 그 값은
 * 콜 직후 null이라, 완성된 손을 눈앞에 두고도 **화료 버튼이 뜨지 않았다.** 사람은
 * 이길 수 없는 손을 들고 타패를 강요당했다.
 *
 * 여기서 하는 일은 «그 화료패가 무엇인가»를 정하는 것뿐이고, 정산은 표준 파이프라인이
 * 그대로 한다(`무덤 도굴`과 같은 규약 — FlowController는 `win` 액션에서만 sys.settleWin을
 * 부른다). **지불은 쯔모 취급**이다: 버린 사람은 «펑당했을 뿐»이고 그 패로 쏘인 것이
 * 아니라(그 패 하나로는 손이 안 섰다) 방총 책임을 혼자 지우는 것이 부당하다.
 *
 * 어느 손패를 화료패로 보든 **손의 구성은 한 장도 달라지지 않는다**(빼서 다시 얹는
 * 자리라 종류 다발이 같다). 갈리는 것은 대기 모양이 정하는 부수뿐이라, 역이 서는
 * 첫 장을 결정론적으로 쓴다.
 */
function completedWinTile(
  state: GameState,
  holder: PlayerId,
  rules: RuleRegistry,
  yaku: YakuRegistry,
): TileId | undefined {
  const needYaku = rules.resolve<boolean>("win.requiresYaku", { playerId: holder, state });
  for (const id of handIdsOf(state, holder)) {
    const ev = evaluateWin(buildWinContext(state, holder, "tsumo", id, { rules }), yaku);
    if (ev === null) continue;
    if (needYaku && !ev.ok) continue;
    if (belowMinHan(ev, state, rules, holder)) continue;
    return id;
  }
  return undefined;
}

/** 완성된 손의 화료패를 «방금 뽑은 패» 자리에 앉힌다 (표준 화료 액션의 문을 연다) */
const BLUFF_WIN_READY = "BluffPretenseWinReady";

const bluffPonAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no bluff_pretense augment";
    }
    if (state.round.phase !== "reaction") return "not in reaction phase";
    // 무장해제된 증강의 콜은 성립하지 않는다 (버튼은 holderReactionOptions가 이미 가리지만,
    // 제출 경로에서도 최종 차단한다).
    if (isSourceDisarmed(state, augmentInstanceId(req.player, ID))) {
      return "augment is disarmed";
    }
    // 후로 봉인(함구령 등)을 우회하지 않는다 — 커스텀 콜도 표준 펑과 같은 규칙을 탄다.
    if (rules.resolve<boolean>("call.blocked", { playerId: req.player, state })) {
      return "calls are sealed";
    }
    if (!rules.resolve<boolean>("call.pon.enabled", { playerId: req.player, state })) {
      return "pon is disabled";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    const last = state.round.lastDiscard;
    if (last === null) return "nothing to call";
    if (last.player === req.player) return "cannot call own discard";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    if (wallLen(state) === 0) return "no calls on the last discard";
    const targetKind = kindOf(state, last.tileId);
    const targetKey = kindKey(targetKind);
    const matches = matchingIds(state, rules, req.player, targetKind);
    // 허장성세는 "1장뿐일 때"만 — 2장 이상이면 표준 펑을 쓰면 된다
    if (matches.length !== 1) return "bluff pon needs exactly one matching tile";
    if (matches[0] !== req.payload.tileId) return "tile is not the matching one";
    if (pickSacrifice(state, rules, req.player, req.payload.tileId, targetKey) === undefined) {
      return "no tile to sacrifice";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const last = state.round.lastDiscard as { player: PlayerId; tileId: TileId };
    const targetKind = kindOf(state, last.tileId);
    const targetKey = kindKey(targetKind);
    const sacrifice = pickSacrifice(
      state,
      rules,
      req.player,
      req.payload.tileId,
      targetKey,
    ) as TileId;
    return [
      // ① 잡패를 목표패로 변환(conjured) — 세 번째 장 생성
      tileKindChanged([
        { tileId: sacrifice, kind: targetKind, attrs: { conjured: true } },
      ]),
      // ② 변환된 잡패 + 진짜 1장 + 버림 1장으로 표준 펑
      {
        type: CALL_MADE,
        payload: {
          caller: req.player,
          from: last.player,
          meldKind: "pon",
          handTileIds: [req.payload.tileId, sacrifice],
          calledTileId: last.tileId,
        },
      },
      // ③ 국당 1회 소진 + 전원 공개
      augmentDataSet(usedKey(state, req.player), true),
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
    ];
  },
};

export const bluffPretense: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  complexity: 1,
  name: "허장성세",
  description:
    "(매 국 1회) 상대가 버린 패와 같은 패가 손에 1장뿐이어도 퐁을 선언할 수 있다.",
  detail:
    "손에 같은 패가 1장뿐이어도 퐁할 수 있다. 모자란 한 장은 손패의 잡패 하나가 그 패로 바뀌어 채운다 — 재료는 퐁한 뒤의 손이 가장 좋아지도록 자동으로 뽑혀 이미 완성된 몸통·머리는 건드리지 않는다. 도라와 적도라는 바뀌지 않는다.\n\n이 퐁으로 손이 완성되면 그대로 화료한다(지불은 쯔모 취급).\n\n리치 중, 후로 봉인 중, 패산이 다 떨어진 뒤의 마지막 버림에는 사용할 수 없다.",
  /**
   * 봇: 잡패 한 장을 태워 커쯔를 만드는 콜이라, **역패**(그 커쯔 자체가 역)일 때만 쓴다.
   * 수패로 부르면 손만 열리고 역이 안 서는 일이 잦다.
   */
  bot: plan({
    intent: "disrupt",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      const kind = lastDiscardKind(view);
      if (kind === undefined || !isYakuhaiFor(view, holder, kind)) return null;
      return opt;
    },
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(bluffPonAction);
    }

    if (!engine.reducers.has(BLUFF_WIN_READY)) {
      engine.reducers.register(BLUFF_WIN_READY, (state, event) => {
        const p = event.payload as { tileId: TileId };
        return { ...state, round: replaceDrawnTile(state.round, p.tileId) };
      });
    }

    /*
     * **퐁으로 손이 완성됐으면 화료할 수 있어야 한다** (위 `completedWinTile` 주석).
     *
     * 이 콜에서만 연다 — 표준 펑은 열지 않는다. 표준 펑으로 손이 완성되는 자리는
     * 애초에 그 패로 **론**이 되는 자리라(후리텐이면 못 하는 것이 규칙이다), 여기서
     * 문을 열면 후리텐을 우회하는 뒷문이 된다. 그래서 «방금 눕힌 몸통에 생성패가
     * 섞여 있는가»로 이 증강의 콜만 골라낸다.
     */
    ctx.reaction(CALL_MADE, (event, rc) => {
      const called = event.payload as { caller: PlayerId };
      if (called.caller !== holder) return;
      const state = rc.state;
      if (state.round.lastDrawnTile !== null) return;
      const melds = state.round.byPlayer[holder]?.melds ?? [];
      const made = melds[melds.length - 1];
      if (made === undefined) return;
      if (!made.tileIds.some((id) => state.tiles[id]?.attrs.conjured === true)) return;
      if (ctx.yaku === undefined) return;
      const winTile = completedWinTile(state, holder, engine.rules, ctx.yaku);
      if (winTile === undefined) return;
      rc.emit({ type: BLUFF_WIN_READY, payload: { tileId: winTile } });
    });

    // 리액션 프롬프트에 bluff_pon 후보를 노출(합법성은 validate가 최종 판정).
    // 표준 펑/치 사이 우선순위로 처리되는 커스텀 콜(24차).
    ctx.holderReactionOptions((state, discard) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      const targetKind = kindOf(state, discard.tileId);
      const targetKey = kindKey(targetKind);
      const matches = matchingIds(state, ctx.engine.rules, holder, targetKind);
      if (matches.length !== 1) return []; // 정확히 1장일 때만
      // 버튼 노출은 «재료가 있기는 한가»만 본다 — 순위 계산은 미리보기·발동에서만 돈다.
      if (
        !hasSpareTile(state, holder, {
          usable: (id) => id !== matches[0] && kindKey(kindOf(state, id)) !== targetKey,
        })
      ) {
        return [];
      }
      return [{ type: ACTION, payload: { tileId: matches[0] as TileId } }];
    });

    // 희생패 미리보기를 보유자 채널로 실어 준다 (위 sacrificePreview 주석).
    const materialKey = roundViewKey(holder, `${ID}:material`);
    ctx.reaction("*", (_event, rc) => {
      const next = sacrificePreview(rc.state, ctx.engine.rules, holder);
      const cur = (rc.state.augmentData[materialKey] ?? null) as TileId | null;
      if (cur === next) return;
      rc.emit(augmentDataSet(materialKey, next));
    });
  },
});
