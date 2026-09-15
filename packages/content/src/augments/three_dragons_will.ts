/**
 * 삼원의 의지 (three_dragons_will, prism) — "한 장으로 대삼원?!"
 *
 * 백·발·중 중 **두 종류를 커쯔로 만들면**, 자기 턴에 발동해 **나머지 한 종류를 커쯔로
 * 세운다** — 삼원패 9장을 모아야 하는 대삼원이 6장에서 선다.
 *
 * ⚠ 2026-08-27 사용자 지시로 **발동 조건을 완화**했다. 예전에는 나머지 종류를 1~2장
 * 쥐고 있어야 했는데("의지"), 0장이어도 3장 전부를 물질화해 커쯔를 세운다. 커쯔를
 * 세워 줄 뿐 **화료를 보장하지는 않는다** — 남은 몸통과 머리는 스스로 맞춰야 한다.
 *
 * 구현: 손패 장수 불변식을 지키는 유일한 길로 **재료 소모형 생성**을 쓴다(허장성세 `bluff_pretense`·
 * 분열 `tile_split`과 같은 계열). 엔진은 실물 없는 새 tileId를 만들 수 없으므로, 손패의 잡패를
 * 부족한 만큼(한~세 장) 삼원패로 변환(`tileKindChanged`, conjured)해 커쯔를 채운다. 재료는
 * «바꾼 뒤의 손이 가장 좋아지는 장»이고 도라·적도라는 뺀다 — 판정은 형제 둘과 같은
 * `spareTile.pickSpareTiles` 하나를 쓴다.
 *
 * docs/16 §2의 "conjured 2장 보충" 노트를 그대로 따른 것이며, 결과적으로 **코어 변경이 없다** —
 * 세 삼원 커쯔가 실제로 손에 서므로 대삼원·소삼원·부수가 표준 채점에서 자연히 따라온다
 * (분해 단계를 건드렸다면 부수·역 판정 전반을 함께 손봐야 했다).
 *
 * ⚠ 재료로 쓸 잡패가 모자라면(전부 몸통에 묶여 있으면) 발동할 수 없다 — 0장에서 세우려면
 * 잡패 3장이 필요하다. 리치 중에도 발동 불가.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  playerAtSeat,
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
} from "@majak/core";
import { counterOf, matchUses, publishUsesLeft, roundViewKey } from "../util.js";
import { handIsPoor } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { handAlteredKey } from "./handAltered.js";
import { hasSpareTile, pickSpareTiles } from "./spareTile.js";

const ID = "three_dragons_will";
const ACTION = "dragons_will";
/** 삼원패 랭크: 1=백, 2=발, 3=중 */
const DRAGON_RANKS = [1, 2, 3] as const;

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

const inRiichi = (state: GameState, h: PlayerId): boolean =>
  state.round.byPlayer[h]?.riichi != null;

const isDragon = (k: TileKind): boolean => k.suit === "dragon";

/**
 * 삼원패 랭크별 장수 — **손패와 후로를 함께** 센다.
 *
 * 예전에는 손패만 봐서, 백백백을 펑하고 발발발을 쥔 채 中 한 장인 손이
 * "완성 두 종류"로 잡히지 않아 발동할 수 없었다 — 설명("두 종류를 커쯔로
 * 만들고")과 어긋난다(docs/25 역/점수 #14). 대삼원은 후로해도 성립하는 역이라
 * 후로한 커쯔를 세지 않을 이유가 없다.
 */
function dragonCounts(state: GameState, holder: PlayerId): Map<number, number> {
  const counts = new Map<number, number>(DRAGON_RANKS.map((r) => [r, 0]));
  const bump = (id: TileId): void => {
    const k = kindOf(state, id);
    if (isDragon(k)) counts.set(k.rank, (counts.get(k.rank) ?? 0) + 1);
  };
  for (const id of handIdsOf(state, holder)) bump(id);
  for (const meld of state.round.byPlayer[holder]?.melds ?? []) {
    for (const id of meld.tileIds) bump(id);
  }
  return counts;
}

/**
 * 발동 조건을 만족하면 채워야 할 삼원패 종류와 필요 장수를 돌려준다.
 * - 삼원패 두 종류가 각각 3장 이상(커쯔)
 * - 나머지 한 종류가 0~2장 (2026-08-27: 0장이어도 3장 전부를 세운다)
 * 반환: { kind, need } — need는 3장을 채우기 위해 생성할 장수(1~3).
 */
function pendingDragon(
  state: GameState,
  holder: PlayerId,
): { kind: TileKind; need: number } | null {
  const counts = dragonCounts(state, holder);
  const complete = DRAGON_RANKS.filter((r) => (counts.get(r) ?? 0) >= 3);
  if (complete.length !== 2) return null;
  const rest = DRAGON_RANKS.find((r) => !complete.includes(r));
  if (rest === undefined) return null;
  const have = counts.get(rest) ?? 0;
  if (have >= 3) return null;
  return { kind: { suit: "dragon", rank: rest }, need: 3 - have };
}

/**
 * 재료로 쓸 잡패 n장 — **바꾼 뒤의 손이 가장 좋아지는 장부터.**
 *
 * 삼원패는 후보에서 뺀다(그건 이미 몸통이다). 예전에는 "이웃이 가장 적은 패"만 봤는데,
 * 그 계산은 손을 모양으로 읽지 않아 이미 완성된 몸통 한쪽이 재료로 타 버렸다
 * (2026-09-04 사용자 보고, #467). 이제 판정은 분열·허장성세와 같은
 * `spareTile.pickSpareTiles` 한 곳이고, 후보마다 "그 패가 삼원패로 바뀐 뒤의 손"을
 * 그대로 만들어 샹텐을 재 가장 낮은 것부터 고른다(여러 장이면 탐욕적으로 한 장씩).
 * 동점이면 수용 폭 → 예전 고립도 순서다. 도라·적도라는 마지막에 태운다(2026-08-22
 * QA round2 의심 1 — 태울 것이 도라뿐이면 그때만 도라가 재료가 된다).
 *
 * 미리보기(`materialPreview`)와 발동(`validate`·`toEvents`)이 **같은 이 함수**를 부른다.
 */
function pickMaterials(
  state: GameState,
  rules: RuleRegistry | undefined,
  holder: PlayerId,
  n: number,
  dragon: TileKind,
): TileId[] | null {
  return pickSpareTiles(state, rules, holder, {
    count: n,
    usable: (id) => !isDragon(kindOf(state, id)),
    resultKinds: (picked): TileKind[] =>
      handIdsOf(state, holder).map((id) =>
        picked.includes(id) ? dragon : kindOf(state, id),
      ),
  });
}

/**
 * **지금 발동을 누르면 재료로 사라지는 손패** — 버튼의 미리보기.
 *
 * 카드는 "잡패가 재료로 쓰인다"고만 말하고 **어느 패인지는 말하지 않아서**, 누르고
 * 나서야 무엇을 잃었는지 알 수 있었다(2026-09-08 사용자 보고). 재료 선택에는 무작위가
 * 하나도 없으므로(`pickMaterials`) 미리 보여 주는 것이 정보 누설이 아니다 — 이미
 * 결정돼 있는 것을 말해 줄 뿐이다. 허장성세·분열이 쓰는 것과 같은 규약이다.
 *
 * 게이트는 손 쪽 조건(횟수·리치·삼원 두 커쯔·재료 유무)까지다 — «내 순인가»는 넣지
 * 않는다(분열 `tile_split`과 같다). 화면은 발동 버튼에 손을 올렸을 때만 이 값을 읽는데
 * 그 버튼 자체가 자기 순에만 뜨고, 순 조건까지 걸면 채널이 남의 순마다 지워졌다 켜져
 * 이벤트만 늘어난다. 계산은 발동 경로와 **같은 `pickMaterials` 하나**를 쓴다
 * (두 벌로 갈리면 짚는 패와 실제로 타는 패가 조용히 어긋난다).
 */
function materialPreview(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): TileId[] | null {
  if (!hasUsesLeft(state, holder)) return null;
  if (inRiichi(state, holder)) return null;
  const pending = pendingDragon(state, holder);
  if (pending === null) return null;
  return pickMaterials(state, rules, holder, pending.need, pending.kind);
}

const willAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no three_dragons_will augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    if (inRiichi(state, req.player)) return "cannot invoke during riichi";
    const pending = pendingDragon(state, req.player);
    if (pending === null) return "need exactly two dragon triplets";
    if (pickMaterials(state, rules, req.player, pending.need, pending.kind) === null) {
      return "not enough spare tiles to conjure";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const pending = pendingDragon(state, req.player) as { kind: TileKind; need: number };
    const materials = pickMaterials(
      state,
      rules,
      req.player,
      pending.need,
      pending.kind,
    ) as TileId[];
    return [
      tileKindChanged(
        materials.map((tileId) => ({
          tileId,
          kind: pending.kind,
          attrs: { conjured: true },
        })),
      ),
      // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
      augmentDataSet(handAlteredKey(state, req.player), true),
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      // 전원 공개 — 대삼원이 섰다는 것은 테이블 전체의 사건이다
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), kindKey(pending.kind)),
    ];
  },
};

export const threeDragonsWill: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 3,
  name: "삼원의 의지",
  description:
    "(동풍전 1회 · 반장전 2회) 백·발·중 가운데 둘이 커쯔이면 잡패를 재료로 남은 한 종류를 커쯔로 만든다.",
  detail:
    "동풍전 1회, 반장전 2회. 삼원패(백·발·중) 중 둘이 커쯔일 때 발동하면 손패의 잡패가 남은 한 종류로 바뀌어 커쯔가 완성된다. 손패 장수는 변하지 않는다.\n\n재료는 바꾼 뒤의 손이 가장 좋아지도록 자동으로 뽑혀 이미 완성된 몸통·머리는 건드리지 않고, 도라·적도라는 되도록 재료로 고르지 않는다. 커쯔만 완성될 뿐 화료를 보장하지는 않는다. 재료가 모자라거나 리치 중이면 사용할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(willAction);
    }

    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (inRiichi(state, holder)) return [];
      const pending = pendingDragon(state, holder);
      if (pending === null) return [];
      // 버튼 노출은 «재료가 있기는 한가»만 본다 — 순위 계산은 미리보기·발동에서만 돈다.
      if (
        !hasSpareTile(state, holder, {
          count: pending.need,
          usable: (id) => !isDragon(kindOf(state, id)),
        })
      ) {
        return [];
      }
      return [{ type: ACTION, payload: {} }];
    });

    // 재료 미리보기를 보유자 채널로 실어 준다 (위 materialPreview 주석).
    const materialKey = roundViewKey(holder, `${ID}:material`);
    ctx.reaction("*", (_event, rc) => {
      const next = materialPreview(rc.state, engine.rules, holder);
      const cur = (rc.state.augmentData[materialKey] ?? null) as TileId[] | null;
      if (JSON.stringify(cur) === JSON.stringify(next)) return;
      rc.emit(augmentDataSet(materialKey, next));
    });
  },
  // 봇: 조건이 서면 곧바로 발동한다 — 역만이 걸리는 순수 이득이고 자해 위험이 없다.
  bot: plan({
    intent: "score",
    // 조건이 서면 그 자리에서 커쯔가 완성된다 — 미룰 이유가 없다.
    fleeting: true,
    pick: (ctx) => {
      // 재료는 이제 «바꾼 뒤의 손이 가장 좋아지는 장»으로 뽑혀 완성 몸통을 깨지 않지만
      // (spareTile.ts), 잡패가 모자라면 몸통 끝이 타는 것까지 막지는 못한다. 손이 아직
      // 멀 때만 지른다 — 대삼원을 노릴 값어치가 있는 국면이면 어차피 손이 좋지 않고,
      // 그 자리에서는 무엇을 태우든 손해가 작다(docs/25 역/점수 #14).
      if (!handIsPoor(ctx)) return null;
      return ctx.options.find((o) => o.type === ACTION) ?? null;
    },
  }),
});
