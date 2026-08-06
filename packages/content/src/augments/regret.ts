/**
 * 미련 (regret, prism) — "텐파이의 손이 국경을 넘어 살아남는다".
 *
 * 유국(황패유국) 시 보유자가 **멘젠 텐파이**면, 그 손패 13장이 그대로 다음 국의 배패가 된다.
 * 다음 국 첫 쯔모에 곧바로 리치가 나올 수 있다 — "아직 두 번째 버림패도 안 나왔는데?"
 *
 * 구현:
 * - 유국 감지: `ROUND_SETTLED`(outcome="draw") 리액션에서 보유자가 멘젠(후로 0) 텐파이인지
 *   확인하고, 텐파이면 손패 13장의 kind를 게임 단위 augmentData에 보존한다(전원 공개 — 손·대기 노출).
 * - 배패 주입: 다음 `ROUND_STARTED`(setupRound가 손을 새로 돌린 뒤) 리액션에서 보존 kind가
 *   있으면 갓 받은 13장을 그 kind로 덮어쓴다(`tileKindChanged`, conjured). 적용 후 보존을 비운다.
 *   setupRound가 매 국 tiles를 원본 재생성하므로, 능력을 안 쓴 국에는 변형이 새지 않는다
 *   (tile-mutation-round-reset 교훈: 국경 넘는 변형은 반드시 재적용식으로).
 * - 후로가 있으면(열린 텐파이) 손패가 13장 미만이라 온전한 배패가 안 되므로 멘젠에 한정한다.
 *
 * ## 2026-08-02 — 상시 → **2국에 1회** (너프)
 *
 * 예전에는 유국이 이어지는 동안 매 국 손이 넘어와, 텐파이를 한 번 잡으면 그 손이
 * 국을 계속 타고 다녔다. 이제 보존이 성사된 국의 다음 국은 쿨다운이라 보존이 일어나지
 * 않는다 — 넘겨받은 손으로 싸우는 국은 순수하게 그 국의 손으로 끝난다.
 * 국 수 세기는 `trackRoundSeq`/`roundSeqOf`(배패 1회 = 1국, 본장도 한 국)를 쓴다 —
 * roundKey 산술로 세면 본장이 어긋난다(큰손·no_retreat와 같은 결함).
 */

import {
  ROUND_STARTED,
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  isTenpai,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  tileKindChanged,
  winHandKindsOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  RuleRegistry,
  TileId,
  TileKind,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  trackRoundSeq,
  viewKey,
} from "../util.js";

const ID = "regret";
/** 보존이 성사된 뒤 다시 성사되기까지 필요한 국 수 (2국에 1회) */
const COOLDOWN_ROUNDS = 2;

/** 다음 국 배패로 주입할 보존 손패 kind (게임 단위 — 국을 넘어 유지) */
const keepKey = (h: PlayerId): string => `${ID}:keep:${h}`;
/** 전원 공개 채널 (보존 손·대기 노출) */
const noticeKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/**
 * 지금 보존이 열려 있는가 — 한 번도 성사된 적 없거나, 그 뒤로 2국이 지났는가.
 * 국 순번은 trackRoundSeq가 배패마다 1씩 올린다(본장도 한 국).
 * ⚠ "미사용"은 **키의 부재**로 본다 — 0을 미사용으로 읽으면 순번 0인 국의 기록과
 * 구분되지 않는다(big_hand의 canDeclare와 같은 판정).
 */
function offCooldown(state: GameState, holder: PlayerId): boolean {
  return cooldownReady(state, ID, holder, COOLDOWN_ROUNDS);
}

/** 보유자가 멘젠(후로 0) 텐파이인가 */
function menzenTenpai(state: GameState, rules: RuleRegistry, holder: PlayerId): boolean {
  if (meldCountOf(state, holder) !== 0) return false;
  return isTenpai(
    winHandKindsOf(state, rules, holder),
    0,
    undefined,
    scoringOptionsOf(state, rules, holder),
  );
}

/** augmentData에 보존된 손패 kind 목록 */
function keptKinds(state: GameState, holder: PlayerId): TileKind[] {
  const v = state.augmentData[keepKey(holder)];
  return Array.isArray(v) ? (v as TileKind[]) : [];
}

export const regret: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "미련",
  description:
    "(2국에 1회) 황패유국 시 당신이 멘젠 텐파이면 그 손패 13장이 그대로 다음 국의 배패가 된다 — 다음 국 첫 쯔모에 곧바로 리치가 나올 수 있다.",
  detail:
    "(2국에 1회) 황패유국 시 자신이 멘젠으로 텐파이를 잡고 있었다면 그 손패 13장이 그대로 다음 국의 배패가 된다. 보존되는 손과 대기는 유국 시 전원에게 공개된다. 한 번 보존이 성사되면 2국이 지나야 다시 성사되므로, 넘겨받은 손으로 싸우는 국에서 또 유국이 나도 그 손은 이어지지 않는다(본장도 한 국으로 센다). 후로한 손은 13장이 되지 않아 멘젠 텐파이에만 적용되며, 누군가 화료해 국이 끝나면 발동하지 않는다.",
  // A급 파괴(docs/25 §conflicts): 둘 다 ROUND_STARTED에서 배패 앞자리를 자기 값으로
  // 덮어써 **뒤에 도는 쪽이 앞의 결과를 지운다**. 역할이 완전히 겹쳐 막아도 잃는 게 없다.
  conflicts: ["honor_return"],
  install(ctx) {
    const { engine, holder } = ctx;

    // "2국에 1회" 판정을 위한 국 진행 카운터
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    // 유국 + 멘젠 텐파이 → 손패 kind 보존 (전원 공개). 단 2국에 1회.
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return;
      if (!offCooldown(rc.state, holder)) return;
      if (!menzenTenpai(rc.state, engine.rules, holder)) return;
      const kinds = handIdsOf(rc.state, holder).map((id) => kindOf(rc.state, id));
      if (kinds.length === 0) return;
      rc.emit(augmentDataSet(keepKey(holder), kinds));
      rc.emit(augmentDataSet(noticeKey(holder), kinds.map((k) => ({ ...k }))));
      // 이 국을 기준으로 쿨다운 시작 — 다음 국은 보존이 열리지 않는다
      for (const e of cooldownUse(rc.state, ID, holder, COOLDOWN_ROUNDS)) rc.emit(e);
    });

    // 다음 국 시작(딜 완료 후) → 보존 손이 있으면 배패를 그 kind로 덮고 보존을 비운다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const kinds = keptKinds(rc.state, holder);
      if (kinds.length === 0) return;
      const hand: TileId[] = rc.state.zones[handZone(holder)]?.tileIds ?? [];
      const n = Math.min(hand.length, kinds.length);
      const changes = [];
      for (let i = 0; i < n; i++) {
        changes.push({
          tileId: hand[i] as TileId,
          kind: kinds[i] as TileKind,
          // honor_return과 같은 이유로 red를 끈다 — attrs 병합이라 덮어쓴 자리가
          // 적5였으면 되살린 패(예: 3만)가 적도라로 남아 화면·채점이 함께 어긋난다.
          // 보존하는 것은 kind뿐이므로 적도라 표식은 따라오지 않는 게 맞다.
          attrs: { conjured: true, red: false },
        });
      }
      // 갓 받은 배패를 보존 kind로 일괄 변경 (결정적 — prng 불필요)
      if (changes.length > 0) rc.emit(tileKindChanged(changes));
      // 보존 소진 (다음 유국에서 다시 채워진다)
      rc.emit(augmentDataSet(keepKey(holder), []));
      rc.emit(augmentDataSet(noticeKey(holder), []));
    });
  },
});
