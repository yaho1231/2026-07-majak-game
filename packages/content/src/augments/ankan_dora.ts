/**
 * 밀실의 도라 (ankan_dora, prism) — "내가 깡친 네 장이 그대로 도라다".
 *
 * 안깡을 하면 **그 깡에 들어간 네 장이 보유자에게만 도라**가 된다. 표시패를 뒤집지 않고
 * 화료 시 안깡 1묶음당 +4판. 안깡을 여럿 하면 묶음마다 +4판씩 쌓인다.
 *
 * ⚠ **도라가 되는 것은 깡에 들어간 그 네 장뿐이다** — 손패에 같은 종류의 패가 더 있어도
 * 판이 붙지 않는다(2026-08-04 사용자 확정: "그냥 깡치면 도라 4개가 생긴다"). 예전에는
 * 깡친 **종류**를 도라로 등록하고 손패·후로에서 그 종류를 세었는데, 그러면 랭크가 섞인
 * 깡(장사진의 3-4-5-6·바람의 계보의 동남서북)은 첫 종류 하나만 잡혀 +1판이 되고, 반대로
 * 손에 남은 같은 패에는 값이 붙는 어긋남이 있었다(docs/25 벽패/왕패/깡 #10). 지금은
 * 깡 장수를 그대로 세므로 어떤 깡이든 정확히 +4판이다.
 *
 * 55차까지는 "**리치 중** 안깡 1묶음당 +4판"이었다 — 정산에서야 보이는 순수 판 보너스라
 * §17 3.2 노잼 위험군(도파민 6)이었다. 이제 **깡치는 순간 그 네 장이 도라로 점등**되어
 * (전원 공개) 발동이 눈에 보이고, 리치 조건도 없앴다.
 *
 * 구현:
 * - `KAN_DECLARED`(kan_closed) 리액션: 깡친 패의 종류를 전원 공개 채널에 실어 클라가
 *   도라 뱃지를 그리게 한다(랭크가 섞인 깡이면 네 종류가 다 실린다).
 * - `score.extraHan` Modifier: 정산 시 보유자의 안깡 장수 총합(= 묶음×4)을 판으로 더한다
 *   (역만에는 엔진이 extraHan을 적용하지 않는다 — 의도된 동작).
 * - 개인 도라라 상대 손에는 안 붙어 화력 상한이 있고, 안깡 자체가 공개라 상대도 안다.
 */

import {
  KAN_DECLARED,
  augmentDataSet,
  defineAugment,
  kindKey,
  meldInfosOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  KanDeclaredPayload,
  PlayerId,
  TileKind,
} from "@majak/core";
import { roundKey, roundViewKey } from "../util.js";

const ID = "ankan_dora";

/** 전원 공개 채널 — 값 = { round, kinds } */
const publicKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);

/** 보유자의 안깡(kan_closed) 목록 */
function ankanMelds(state: GameState, h: PlayerId): { tiles: TileKind[] }[] {
  return meldInfosOf(state, h)
    .filter((m) => m.kind === "kan_closed")
    .map((m) => ({ tiles: [...m.tiles] }));
}

/**
 * 개인 도라 판 = **깡에 들어간 장수 총합** (안깡 1묶음 = 4장 = +4판).
 * 손패는 보지 않는다 — 도라가 되는 것은 깡친 그 네 장뿐이다.
 */
function personalDoraHan(state: GameState, h: PlayerId): number {
  return ankanMelds(state, h).reduce((sum, m) => sum + m.tiles.length, 0);
}

/** 표시용 — 깡친 패의 종류. 랭크가 섞인 깡이면 네 종류가 다 나온다. */
function ankanKinds(state: GameState, h: PlayerId): string[] {
  const out = new Set<string>();
  for (const m of ankanMelds(state, h)) {
    for (const t of m.tiles) out.add(kindKey(t));
  }
  return [...out];
}

export const ankanDora: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 3,
  name: "밀실의 도라",
  description:
    "(상시) 안깡을 하면 그 깡의 네 장이 나만의 도라가 되어, 화료 시 묶음마다 +4판이 붙는다.",
  detail:
    "안깡 한 묶음마다 그 네 장이 나만의 도라가 되어 4판이 붙는다.\n\n역만에는 붙지 않는다.",
  install(ctx) {
    const { holder } = ctx;

    // 정산 시 손패·후로의 개인 도라 매칭 장수만큼 +판
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return cur + personalDoraHan(state, holder);
      },
    });

    // 안깡을 하는 순간 — 깡친 네 장이 도라가 됐음을 전원 공개(연출·뱃지용).
    // 판 계산은 위 Modifier가 정산 시점 후로에서 직접 하므로 별도 저장은 없다.
    ctx.reaction(KAN_DECLARED, (event, rc) => {
      const p = event.payload as KanDeclaredPayload;
      if (p.player !== holder || p.kanKind !== "kan_closed") return;
      const kinds = ankanKinds(rc.state, holder);
      if (kinds.length === 0) return;
      rc.emit(
        augmentDataSet(publicKey(holder), {
          round: roundKey(rc.state),
          kinds,
        }),
      );
    });
  },
});
