/**
 * 거울의 도라 (mirror_dora, prism) — "표시패를 거꾸로도 읽는다".
 *
 * (상시) 도라 표시패의 **앞 패**도 나에게만 도라가 된다. 표시패가 5통이면 표준 도라
 * 6통에 더해 **4통**도 내 도라다. 순환은 표준 도라의 정확한 역방향이다 —
 * 1→9, 동→북, 백→중. 깡도라 표시패에도, 뒷도라 표시패에도 똑같이 적용된다
 * (뒷도라 쪽은 평소처럼 뒷도라를 세는 손, 즉 리치한 손에만 얹힌다).
 *
 * 도라 판 폭이 통째로 두 배가 되므로, 표시패 한 장이 뒤집힐 때마다 나만 두 종류를
 * 본다 — 전원 공개라 상대는 내 도라가 무엇인지 알고 흘리지 않을 수 있다(Rule #4).
 *
 * 구현: 코어 규칙 `scoring.extraDoraKinds`·`scoring.extraUraDoraKinds`에 보유자 전용
 * Modifier를 건다. 정상 도라 계산 경로(`buildWinContext` → `countDora`)를 그대로 타므로
 * **화료패·후로·손패가 전부 포함**되고, 표시패가 겹쳐 도라가 중첩되는 것도 그대로다.
 * (`score.extraHan`으로 흉내 내면 손패 Zone에 없는 론 화료패 한 장이 조용히 샌다.)
 */

import {
  DORA_FLIPPED,
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  frontDoraKindFor,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  TileKind,
} from "@majak/core";
import { roundViewKey } from "../util.js";

const ID = "mirror_dora";

/** 전원 공개 채널 — 값 = 내 앞도라 종류(kindKey) 목록 */
const publicKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);

/** 표도라·깡도라 표시패의 앞 패 종류 */
function frontKinds(state: GameState): TileKind[] {
  return state.round.doraIndicators.map((t) => frontDoraKindFor(kindOf(state, t)));
}

export const mirrorDora: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "거울",
  description:
    "(상시) 도라 표시패의 앞 패도 나에게만 도라가 된다 — 표시패가 5통이면 6통과 함께 4통도 내 도라다. 깡도라·뒷도라 표시패에도 똑같이 적용된다.",
  detail:
    "도라 표시패의 앞 패가 보유자에게만 도라가 된다. 앞은 표준 도라의 역방향으로, 1의 앞은 9, 동의 앞은 북, 백의 앞은 중이다.\n\n표도라·깡도라 표시패에 적용되며, 뒷도라 표시패에도 적용되어 뒷도라를 세는 손에만 얹힌다. 다른 사람에게는 적용되지 않고, 무엇이 도라가 됐는지는 전원에게 공개된다.",
  install(ctx) {
    const { holder } = ctx;

    const addKinds = (rule: string): void => {
      ctx.engine.rules.addModifier<readonly TileKind[]>(rule, {
        source: ctx.instanceId,
        layer: ctx.layer,
        apply: (cur, rctx) => {
          if (rctx.playerId !== holder) return cur;
          const state = rctx.state as GameState | undefined;
          if (state === undefined) return cur;
          return [...cur, ...frontKinds(state)];
        },
      });
    };
    // 표도라·깡도라 / 뒷도라 — 뒷도라 표시패는 표도라 표시패 바로 다음 왕패라
    // 표시패 목록이 같은 길이만큼 늘어난다. 계산은 코어가 각각의 경로에서 한다.
    addKinds("scoring.extraDoraKinds");
    addKinds("scoring.extraUraDoraKinds");

    // 표시패가 뒤집힐 때마다(배패 직후·깡도라) 내 앞도라가 무엇인지 전원에게 알린다.
    // 안 보이면 상대가 대응할 수 없고(Rule #4), 나도 무엇이 내 도라인지 못 센다.
    const announce = (rc: { state: GameState; emit: (e: ProposedEvent) => void }): void => {
      const kinds = frontKinds(rc.state).map(kindKey);
      if (kinds.length === 0) return;
      rc.emit(augmentDataSet(publicKey(holder), kinds));
    };
    ctx.reaction(ROUND_STARTED, (_event, rc) => announce(rc));
    ctx.reaction(DORA_FLIPPED, (_event, rc) => announce(rc));
  },
});
