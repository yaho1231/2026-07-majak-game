/**
 * 분열 (tile_split, prism) — "한 장이 두 장으로 갈라진다".
 *
 * 매 국 1회, 자기 턴에 손패의 **수패 1장을 두 숫자로 쪼갠다** — 두 숫자의 합이
 * 원래 숫자가 되고 무늬는 그대로다(예: 9통 → 4통 + 5통). 애물단지 끝패 한 장이 급소 두 장으로
 * 다시 태어난다.
 *
 * 구현: 허장성세(`bluff_pretense`)의 생성 기법을 그대로 쓴다. **엔진은 실물 없는 새 tileId를
 * 만들 수 없으므로**, 쪼갠 두 번째 조각은 손패의 **잡패 1장**(쪼갠 뒤의 손이 가장 좋아지는
 * 장 — `spareTile.ts`)을 재료로 삼아 그 자리에 물질화한다(`tileKindChanged`, conjured).
 * 결과적으로 손패 장수는 그대로다 —
 * 원안의 "직후 1장 버림"은 재료 소모로 대체되어 필요 없다(손패 불변식 보존).
 *
 * - 대상: 수패(만·통·삭) 중 **랭크 2 이상**(1은 두 양수로 쪼갤 수 없다).
 * - 분할: a + b = r, 1 ≤ a ≤ b. 중복 후보를 막으려 a ≤ r/2만 제시한다(9 → 1+8·2+7·3+6·4+5).
 * - 무작위 없음(결정적) — 무엇을 어떻게 쪼갤지는 전부 플레이어가 고른다(§0 무작위→선택 원칙).
 * - 리치 중에는 오름패가 고정돼 손패 변형과 충돌하므로 발동 불가(even_world·genesis와 동일).
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
  kindKey,
  kindOf,
  meldCountOf,
  playerAtSeat,
  scoringOptionsOf,
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
import { flagOf, publishUsesLeft, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { handIdsOfView, handKindsOf, shantenIfChanged } from "./botHelpers.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredKey } from "./handAltered.js";
import { pickSpareTile, hasSpareTile } from "./spareTile.js";

const ID = "tile_split";
const ACTION = "split_tile";

/** 국당 1회 — 국이 바뀌면 다시 쓸 수 있다 */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  !flagOf(state, usedKey(state, h));

/** 리치 중인가 (손패 변형 금지) */
const inRiichi = (state: GameState, h: PlayerId): boolean =>
  state.round.byPlayer[h]?.riichi != null;

/** 쪼갤 수 있는 분할 a 목록 — a + b = r, 1 ≤ a ≤ b (중복을 막으려 a ≤ r/2만) */
function splitsOf(rank: number): number[] {
  const out: number[] = [];
  for (let a = 1; a * 2 <= rank; a++) out.push(a);
  return out;
}

/**
 * 재료로 쓸 잡패 하나 — **쪼갠 뒤의 손이 가장 좋아지는 장**을 고른다.
 *
 * 판정은 `spareTile.pickSpareTiles` 한 곳에 있다. 예전에는 "이웃이 가장 적은 패"만
 * 봤는데(`botHelpers.isolatedIndex`), 그 계산은 손을 모양으로 읽지 않아 **이미 완성된
 * 몸통·머리를 재료로 태우는** 일이 있었다 — 123m 456m 789m 中中 5s 에서 유일한 머리
 * 中中이 탔다(2026-09-04 사용자 보고, #467). 이제는 후보마다 "쪼갠 뒤의 손"(대상 → a,
 * 재료 → b)을 그대로 만들어 샹텐을 재고 가장 낮은 것을 고른다 — 몸통을 깨는 선택은
 * 그 자리에서 샹텐이 올라가므로 뽑히지 않는다. 동점이면 수용 폭 → 예전 고립도 순서다.
 *
 * **재료는 대상마다 하나다 — «어떻게 쪼갤지(a)»에 따라 달라지지 않는다.** 화면은
 * 대상을 고르기 전에 «대상 → 재료» 표(`materialPreview`)를 짚고 그 뒤에 a를 고르므로,
 * a마다 재료가 달라지면 짚어 준 패와 실제로 타는 패가 갈린다(#490의 미리보기 계약).
 * 그래서 후보는 가능한 모든 분할(a)의 결과 손 중 **가장 좋은 갈래**로 평가한다
 * (`resultVariants`) — 어떤 a를 고르든 재료가 같고, 갈래 중 최선은 그 재료로 이룰 수
 * 있는 손이다.
 *
 * 도라·적도라는 여전히 마지막에 태운다(`isPreciousMaterial`, 2026-08-20 QA text 확정 14).
 * 조커(백)는 태우면 샹텐이 올라가므로 이 계산이 알아서 남긴다.
 */
function pickMaterial(
  state: GameState,
  rules: RuleRegistry | undefined,
  holder: PlayerId,
  targetId: TileId,
): TileId | undefined {
  const target = kindOf(state, targetId);
  const ids = handIdsOf(state, holder);
  if (ids.length <= 1) return undefined;
  const splits = splitsOf(target.rank);
  return pickSpareTile(state, rules, holder, {
    usable: (id) => id !== targetId,
    ignoreForIsolation: targetId,
    resultVariants: (picked): TileKind[][] =>
      splits.map((a) =>
        ids.map((id): TileKind => {
          if (id === targetId) return { suit: target.suit, rank: a };
          if (picked.includes(id)) return { suit: target.suit, rank: target.rank - a };
          return kindOf(state, id);
        }),
      ),
  });
}

/**
 * **쪼갤 패마다, 그때 재료로 사라지는 패** — 발동 버튼의 미리보기 재료.
 *
 * 화면이 "잡패 1장이 사라진다"고만 말하고 **어느 패인지는 말하지 않아서**,
 * 누르기 전에는 무엇을 잃는지 알 수 없었다(2026-09-07 사용자 요청). 재료 선택에는
 * 무작위가 하나도 없으므로(`pickMaterial`) 미리 보여 주는 것이 정보 누설이 아니다 —
 * 이미 결정돼 있는 것을 말해 줄 뿐이다.
 *
 * 재료는 **쪼갤 대상에 따라 달라질 수 있다**(대상 자신은 후보에서 빠진다). 그래서 값 하나가
 * 아니라 «대상 → 재료» 표를 싣는다. 화면은 버튼 위에서 표의 값 전부를, 대상을 고른
 * 뒤에는 그 하나만 짚는다. 계산은 발동 경로와 **같은 `pickMaterial` 하나**를 쓴다.
 *
 * 순위 계산(샹텐·수용 폭)은 값이 싸지 않고(쪼갤 패 × 재료 후보 × 분할 갈래만큼
 * 샹텐을 센다 — 손이 바뀔 때마다 수 ms) 이 반응은 **매 이벤트**마다 돈다. 그래서
 * ① **자기 순(turn.act)에만** 센다 — 발동 버튼이 뜨는 자리가 거기뿐이라 남의 순의 값은
 *    아무도 읽지 않는다(삼원의 의지는 «두 커쯔» 조건이 이미 드물어 순 조건 없이 둔다).
 * ② 답이 달라질 수 있는 재료(손패·후로 수·도라·채점 옵션)를 서명으로 묶어, 같으면
 *    지난 표를 그대로 돌려준다(`memo`) — 한 순에 수십 번 오는 augmentData 이벤트마다
 *    손 전체를 다시 세지 않는다.
 */
interface PreviewMemo {
  sig: string;
  table: Record<string, TileId> | null;
}

function materialPreview(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  memo: PreviewMemo,
): Record<string, TileId> | null {
  if (!hasUsesLeft(state, holder)) return null;
  if (inRiichi(state, holder)) return null;
  if (state.round.phase !== "turn.act") return null;
  if (playerAtSeat(state, state.round.turnSeat).id !== holder) return null;
  const ids = handIdsOf(state, holder);
  const red = (id: TileId): string => (state.tiles[id]?.attrs.red === true ? "!" : "");
  const sig =
    ids.map((id) => `${id}:${kindKey(kindOf(state, id))}${red(id)}`).join(",") +
    `|m${meldCountOf(state, holder)}` +
    `|d${state.round.doraIndicators.map((t) => kindKey(kindOf(state, t))).join(",")}` +
    `|o${JSON.stringify(scoringOptionsOf(state, rules, holder))}`;
  if (memo.sig === sig) return memo.table;
  const out: Record<string, TileId> = {};
  for (const id of ids) {
    if (!splittable(state, id)) continue;
    const material = pickMaterial(state, rules, holder, id);
    if (material !== undefined) out[String(id)] = material;
  }
  memo.sig = sig;
  memo.table = Object.keys(out).length > 0 ? out : null;
  return memo.table;
}

/** 쪼갤 수 있는 손패인가 — 수패이면서 랭크 2 이상 */
function splittable(state: GameState, id: TileId): boolean {
  const k = kindOf(state, id);
  return isNumberSuit(k) && k.rank >= 2;
}

const splitAction: ActionDef<{ tileId: TileId; a: number }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no tile_split augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "already used this round";
    if (inRiichi(state, req.player)) return "cannot split during riichi";
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (!splittable(state, req.payload.tileId)) {
      return "only number tiles of rank 2+ can be split";
    }
    const r = kindOf(state, req.payload.tileId).rank;
    const a = req.payload.a;
    if (!Number.isInteger(a) || a < 1 || a * 2 > r) return "invalid split";
    if (pickMaterial(state, rules, req.player, req.payload.tileId) === undefined) {
      return "no material tile to split into";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const target = kindOf(state, req.payload.tileId);
    const a = req.payload.a;
    const b = target.rank - a;
    const material = pickMaterial(state, rules, req.player, req.payload.tileId) as TileId;
    return [
      // 대상은 작은 조각(a)으로, 재료 잡패는 나머지 조각(b)으로 — 둘 다 원래 무늬·conjured
      tileKindChanged([
        {
          tileId: req.payload.tileId,
          kind: { suit: target.suit, rank: a },
          attrs: { conjured: true },
        },
        {
          tileId: material,
          kind: { suit: target.suit, rank: b },
          attrs: { conjured: true },
        },
      ]),
      // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
      augmentDataSet(handAlteredKey(state, req.player), true),
      augmentDataSet(usedKey(state, req.player), true),
      // 전원 공개 — 무엇이 무엇으로 갈라졌는지 보인다
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
        from: kindKey(target),
        to: [
          kindKey({ suit: target.suit, rank: a }),
          kindKey({ suit: target.suit, rank: b }),
        ],
      }),
    ];
  },
};

export const tileSplit: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "분열",
  description:
    "(매 국 1회) 자기 순에 손패의 수패 1장을 합이 같은 두 숫자로 쪼갠다(예: 9통을 4통과 5통으로).",
  detail:
    "손패의 수패 1장을 합이 같은 두 숫자로 쪼갠다(예: 9통을 4통과 5통으로). 두 번째 패는 잡패 한 장이 바뀌어 생긴다 — 재료는 쪼갠 뒤의 손이 가장 좋아지도록 자동으로 뽑히므로 이미 완성된 몸통·머리는 건드리지 않는다.\n\n2 이상의 수패만 쪼갤 수 있고 무늬는 바뀌지 않는다. 재료로 도라·적도라는 되도록 피한다. 리치 중에는 사용할 수 없다.",
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
      engine.actions.register(splitAction);
    }

    // 쪼갤 수 있는 손패마다, 가능한 분할(a ≤ r/2)을 후보로 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (inRiichi(state, holder)) return [];
      const opts: { type: string; payload: unknown }[] = [];
      for (const id of handIdsOf(state, holder)) {
        if (!splittable(state, id)) continue;
        // 버튼 노출은 «재료가 있기는 한가»만 본다 — 순위 계산은 미리보기·발동에서만 돈다.
        if (!hasSpareTile(state, holder, { usable: (m) => m !== id })) continue;
        for (const a of splitsOf(kindOf(state, id).rank)) {
          opts.push({ type: ACTION, payload: { tileId: id, a } });
        }
      }
      return opts;
    });

    // 재료 미리보기를 보유자 채널로 실어 준다 (위 materialPreview 주석).
    const materialKey = roundViewKey(holder, `${ID}:material`);
    const memo: PreviewMemo = { sig: "", table: null };
    ctx.reaction("*", (_event, rc) => {
      const next = materialPreview(rc.state, engine.rules, holder, memo);
      const cur = (rc.state.augmentData[materialKey] ?? null) as Record<string, TileId> | null;
      if (JSON.stringify(cur) === JSON.stringify(next)) return;
      rc.emit(augmentDataSet(materialKey, next));
    });
  },
  /**
   * 봇 — **쪼갠 뒤의 샹텐을 직접 세어 본다.**
   *
   * "손패 가치 추정이 필요해서 판단할 수 없다"고 두었던 자리인데, 실은 셀 수 있다.
   * 이 발동에는 무작위가 하나도 없기 때문이다 — 어느 패가 재료로 사라지는지까지
   * 규칙이 결정한다(`pickMaterial`). 그래서 후보마다 "그 뒤의 손"을 그대로 만들어
   * 샹텐을 세고, **실제로 나아지는 후보가 있을 때만** 발동한다.
   *
   * 재료는 봇이 따로 계산하지 않는다 — 규칙이 보유자 채널에 실어 준 미리보기
   * (`tile_split:material`, 발동과 같은 `pickMaterial`)를 그대로 읽는다. 예전에는
   * `botHelpers.isolatedIndex`를 한 벌 더 돌렸는데, 규칙이 두 벌이면 어긋난다.
   * 채널이 아직 없으면(뷰가 반응보다 먼저 만들어진 드문 경우) 후보 전부 중 최소
   * 샹텐으로 근사한다 — 발동 여부의 판단 재료일 뿐, 실제 재료는 규칙이 정한다.
   */
  bot: plan({
    intent: "advance",
    oneShot: true, // 국에 한 번뿐이다 — 어중간한 자리에서 태우지 않는다
    pick: (ctx) => {
      const { options, view, holder } = ctx;
      const ids = handIdsOfView(view, holder);
      const kinds = handKindsOf(view, holder);
      const base = shantenIfChanged(view, holder, [], []);
      let best: { type: string; payload: unknown } | null = null;
      let bestShanten = base;
      // 테스트의 손수 만든 뷰에는 augmentView가 없을 수 있다 — 채널이 없으면 아래 근사로 간다.
      const preview = (view.augmentView as Record<string, unknown> | undefined)?.[`${ID}:material`];
      const table =
        preview !== null && typeof preview === "object"
          ? (preview as Record<string, unknown>)
          : null;
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const p = o.payload as { tileId?: number; a?: number };
        if (p.tileId === undefined || p.a === undefined) continue;
        const targetIdx = ids.indexOf(p.tileId);
        const target = kinds[targetIdx];
        if (targetIdx < 0 || target === undefined) continue;
        const pieces: TileKind[] = [
          { suit: target.suit, rank: p.a },
          { suit: target.suit, rank: target.rank - p.a },
        ];
        const promised = table?.[String(p.tileId)];
        const materialIdx = typeof promised === "number" ? ids.indexOf(promised) : -1;
        let after: number;
        if (materialIdx >= 0) {
          after = shantenIfChanged(view, holder, [targetIdx, materialIdx], pieces);
        } else {
          after = Number.POSITIVE_INFINITY;
          for (let m = 0; m < kinds.length; m++) {
            if (m === targetIdx) continue;
            after = Math.min(after, shantenIfChanged(view, holder, [targetIdx, m], pieces));
          }
        }
        if (after < bestShanten) {
          bestShanten = after;
          best = o;
        }
      }
      return best;
    },
  }),
});
