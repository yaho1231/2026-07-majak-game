/**
 * 해저의 지배자 (haitei_lord, prism).
 *
 * 텐파이 상태로 **해저패(패산 마지막 패)** 를 쯔모하면, 대기와 무관하게
 * 그 패가 오름패로 바뀌어 무조건 해저로월로 화료한다. 그리고 +3판을 얻는다.
 *
 * 설계 결정:
 * - **텐파이만이 조건이다.** 무엇을 기다리고 있었는지는 상관없다 — 패산 마지막 패는
 *   지배자의 것이다. 국의 마지막 순간이라는 타이밍 자체가 곧 발동 제한이다.
 * - 무페널티: 실패해도 잃는 것이 없다. 텐파이가 아니면 그냥 아무 일도 일어나지 않는다.
 *
 * 구현:
 * - TILE_DRAWN 리액션에서 ①보유자의 쯔모 ②영상패가 아님 ③이 쯔모로 패산이 비었음
 *   ④보유자가 텐파이임을 확인하고, 뽑은 패의 kind를 대기패 중 하나로 바꾼다
 *   (tileKindChanged, conjured=true → 클라가 증강이 만든 패로 표시).
 * - 화료 자체는 **표준 쯔모(win)** 가 처리한다(함정 6: 커스텀 액션으로 WIN_DECLARED를
 *   내면 정산이 멈춘다). 패산이 비었고 영상 쯔모가 아니므로 엔진이 haitei 플래그를
 *   자동으로 세워 해저로월이 그대로 붙는다.
 * - 발동한 국이면 정산에 +3판 (addWinHanBonus). 국 단위 플래그라 다음 국에 남지 않는다.
 */

import {
  TILE_DRAWN,
  WALL,
  augmentDataSet,
  defineAugment,
  kindKey,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  tileKindChanged,
  winHandIdsOf,
  winningKinds,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileDrawnPayload,
  TileId,
  TileKind,
} from "@majak/core";
import { addWinHanBonus, flagOf, roundViewKey } from "../util.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "haitei_lord";
/** 발동한 국의 화료에 얹는 판수 (구 +4500점) */
const BONUS_HAN = 3;

/** 이번 국에 해저 지배가 발동했는가 */
const firedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "fired", state, h);

/**
 * **이 쯔모를 해저의 지배자가 가져가는가** — 가져간다면 그 대기패 목록.
 *
 * 아래 리액션의 조건을 그대로 담은 순수 함수다. 함수로 뽑은 이유는 `conjure_draw`가
 * **같은 한 장**에 `tileKindChanged`를 쏘기 때문이다. 둘 다 쏘면 나중에 설치된 쪽,
 * 즉 **드래프트 픽 순서**가 승패를 정했고 진 쪽은 조용히 죽었다 — 소환은 국당 1회를
 * 소진한 채 아무 패도 못 부르고, 지배자는 발동 플래그(+3판)만 세운 채 화료 못 하는
 * 손이 됐다(2026-08-23, QA synergy3 kandora 확정 2).
 *
 * 우선순위는 **해저의 지배자**다 — "패산 마지막 패는 지배자의 것"이 이 카드의 설계
 * 문장이고, 보유자에게도 그쪽이 언제나 낫다: 오름패로 바뀌면 그 자리에서 해저로월
 * 화료 + 3판이라, 소환이 부른 아무 패보다 낫다.
 *
 * "이미 다른 증강이 바꿨나"를 보는 방식으로는 못 고친다 — 그게 바로 순서 의존이다.
 * 그래서 양쪽이 **같은 술어**(이 함수)를 보고, 진 쪽이 스스로 물러난다.
 *
 * 반환값은 대기패 목록(빈 배열 = 지배자가 가져가지 않는다). 쯔모패를 뺀 13장으로
 * 계산하므로 **뽑은 한 장이 그 사이 무엇으로 바뀌었든 결과가 같다** = 순서 무관.
 */
export function haiteiLordWaits(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  drawnTileId: TileId,
): readonly TileKind[] {
  const player = state.players.find((p) => p.id === holder);
  if (player === undefined || !player.augments.includes(ID)) return [];
  if ((state.zones[WALL]?.tileIds.length ?? 0) !== 0) return [];
  if (flagOf(state, firedKey(state, holder))) return [];
  const hand13 = winHandIdsOf(state, rules, holder)
    .filter((id) => id !== drawnTileId)
    .map((id) => kindOf(state, id));
  return winningKinds(
    hand13,
    meldCountOf(state, holder),
    undefined,
    scoringOptionsOf(state, rules, holder),
  );
}

export const haiteiLord: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  complexity: 3,
  name: "해저의 지배자",
  description:
    "(상시) 텐파이 상태로 해저패(패산 마지막 패)를 쯔모하면 그 패가 오름패로 바뀐다.",
  detail:
    "패산의 마지막 한 장을 자신이 뽑을 때 텐파이였다면, 대기와 무관하게 그 패가 오름패가 되어 해저로월 쯔모로 화료하고 **+3판**이 붙는다(역만에는 미적용).\n\n영상 쯔모는 해저패가 아니라 발동하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 발동한 국의 화료에 +3판
    addWinHanBonus(ctx, (state) =>
      flagOf(state, firedKey(state, holder)) ? BONUS_HAN : 0,
    );

    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || p.rinshan === true) return;
      const state = rc.state;
      // 해저패인가 · 이미 발동했나 · 텐파이인가 — 조건은 `haiteiLordWaits` 하나에
      // 모아 두었다. `conjure_draw`가 같은 술어를 읽고 스스로 물러난다(위 주석).
      const waits = haiteiLordWaits(state, engine.rules, holder, p.tileId);
      if (waits.length === 0) return; // 텐파이가 아니면 아무 일도 없다

      const drawnKey = kindKey(kindOf(state, p.tileId));
      const already = waits.some((w) => kindKey(w) === drawnKey);
      const target = waits[0] as TileKind;

      // 이미 오름패면 굳이 바꾸지 않는다 — 그대로 해저로월이다
      if (!already) {
        rc.emit(
          tileKindChanged([
            { tileId: p.tileId, kind: target, attrs: { conjured: true } },
          ]),
        );
      }
      rc.emit(augmentDataSet(firedKey(state, holder), true));
      // 전원 공개 — 마지막 패가 무엇으로 바뀌었는지가 이 증강의 구경거리다
      rc.emit(
        augmentDataSet(
          roundViewKey("*", `${ID}:${holder}`),
          already ? drawnKey : kindKey(target),
        ),
      );
    });
  },
});
