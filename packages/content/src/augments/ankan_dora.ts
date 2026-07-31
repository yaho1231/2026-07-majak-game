/**
 * 밀실의 도라 (ankan_dora, prism) — "내가 깡친 패가 곧 나만의 도라다".
 *
 * 안깡을 하면 그 **패 종류가 보유자만의 개인 새로운 도라**가 된다. 표시패를 뒤집지도 않고,
 * 화료 시 내 손패·후로에 있는 그 종류의 패가 전부 도라로 값한다(장당 +1판). 안깡을 여럿
 * 하면 각각의 종류가 전부 개인 도라가 된다.
 *
 * 55차까지는 "리치 중 안깡 1묶음당 +4판"이었다 — 정산에서야 보이는 순수 판 보너스라
 * §17 3.2 노잼 위험군(도파민 6)이었다. 이제 **깡치는 순간 그 패가 내 도라로 점등**되어
 * (전원 공개) 발동이 눈에 보이고, 리치 조건도 없앴다.
 *
 * 구현:
 * - `KAN_DECLARED`(kan_closed) 리액션: 보유자의 안깡 종류 전부를 개인 도라 집합으로
 *   기록(국 단위 — roundKey)하고 전원 공개 채널에 실어 클라가 도라 뱃지를 그리게 한다.
 * - `score.extraHan` Modifier: 정산 시 보유자의 손패+후로에서 개인 도라 종류와 일치하는
 *   장수를 세어 그만큼 판을 더한다(역만에는 엔진이 extraHan을 적용하지 않는다 — 의도된 동작).
 * - 개인 도라라 상대 손에는 안 붙어 화력 상한이 있고, 안깡 자체가 공개라 상대는 그 종류를
 *   흘리지 않는다(대응 가능).
 */

import {
  KAN_DECLARED,
  augmentDataSet,
  defineAugment,
  handZone,
  kindKey,
  kindOf,
  meldInfosOf,
  meldsZone,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  KanDeclaredPayload,
  PlayerId,
  TileId,
} from "@majak/core";
import { roundKey, roundViewKey } from "../util.js";

const ID = "ankan_dora";

/** 전원 공개 채널 — 값 = { round, kinds } */
const publicKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);

/** 보유자의 안깡(kan_closed) 종류 = 개인 도라 종류 (kindKey 문자열, 중복 제거) */
function ankanKinds(state: GameState, h: PlayerId): string[] {
  const out = new Set<string>();
  for (const m of meldInfosOf(state, h)) {
    if (m.kind !== "kan_closed") continue;
    const first = m.tiles[0];
    if (first !== undefined) out.add(kindKey(first));
  }
  return [...out];
}

/** 보유자의 손패+후로에서 개인 도라(=안깡 종류)와 일치하는 장수 */
function personalDoraHan(state: GameState, h: PlayerId): number {
  const kinds = new Set(ankanKinds(state, h));
  if (kinds.size === 0) return 0;
  const ids: TileId[] = [
    ...(state.zones[handZone(h)]?.tileIds ?? []),
    ...(state.zones[meldsZone(h)]?.tileIds ?? []),
  ];
  let han = 0;
  for (const id of ids) {
    if (kinds.has(kindKey(kindOf(state, id)))) han++;
  }
  return han;
}

export const ankanDora: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "밀실의 도라",
  description:
    "(상시) 안깡을 할 때마다 그 패 종류가 나만의 새로운 도라가 된다 — 표시패도 뒤집지 않고, 내 손패·후로에 있는 그 패가 전부 도라(장당 1판)로 값한다.",
  detail:
    "(상시) 안깡을 하는 순간 그 패 종류가 자신에게만 도라로 점등된다. 표준 깡도라 표시패는 평소대로 뒤집히고, 그와 별개로, 화료 시 손패와 후로에 있는 그 종류의 패가 전부 도라로 값한다(장당 1판). 안깡을 여럿 하면 각 종류가 모두 개인 도라가 된다. 다만 상대 손에는 적용되지 않고, 역만 손에는 추가 판을 얻지 않는다.",
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

    // 안깡을 하는 순간 — 깡친 종류가 개인 도라가 됐음을 전원 공개(연출·뱃지용).
    // 개인 도라 판 계산은 위 Modifier가 정산 시점 후로에서 직접 하므로 별도 저장은 없다.
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
