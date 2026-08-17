/**
 * 성립하지 않는 깡 (void_kan, prism) — 내 앞에서 깡은 자살행위다.
 *
 * 내가 텐파이면, 타가가 **깡을 선언하는 순간 그 깡패가 오름패인지와 상관없이**
 * 창깡(챤깡)으로 화료할 수 있다. 안깡도 예외가 아니다 — 표준에서 안깡을 챤깡할 수 있는
 * 것은 국사무쌍뿐이지만, 이 증강은 그 예외까지 무력화한다.
 *
 * **단, 리치 중에는 잠긴다** (아래 리치 가드). 능력 자체가 손패 변형이라 리치와 양립할 수
 * 없다 — 이 제약은 description·detail에 명시돼 있어야 한다(예전엔 어디에도 없어서,
 * 텐파이를 리치로 굳힌 보유자가 증강이 죽은 줄도 모르고 국을 끝냈다).
 *
 * 구현 지점:
 * - win.closedKanRobbable 규칙(코어): 보유자에 한해 안깡 챤깡을 연다.
 * - KAN_DECLARED 리액션: **상대의 후로는 절대 건드리지 않는다.** 대신 내 손패 1장의
 *   kind를 바꿔(tileKindChanged, conjured) 그 깡패가 내 오름패가 되도록 손을 맞춘다.
 *   어떤 패를 어떤 종류로 바꿀지는 손패 각 장 × 표준 34종을 훑어 "바꾼 뒤의 13장에
 *   깡패를 얹으면 화료형이 되는" 첫 조합을 채택한다(국당 몇 번뿐이라 계산량은 무의미).
 *   이미 진짜 오름패면 아무것도 하지 않고, 맞출 조합이 없으면 조용히 포기한다(방어).
 * - 그 뒤는 표준 흐름이 전부 처리한다 — 코어 win validate가 챤깡 론을 후보로 제시하고
 *   정산까지 표준 경로로 간다(커스텀 화료 이벤트를 직접 내지 않는다).
 * - 추가 점수는 없다. 테이블 전원의 깡을 묶는 것만으로 충분하다(무페널티 원칙 — 대가도 없다).
 *
 * 주의: 대명깡(kan_open)은 코어상 챤깡 대상이 아니다(round.chankan이 서지 않는다).
 *       안깡·가깡에서만 발동한다.
 */

import {
  KAN_DECLARED,
  defineAugment,
  handIdsOf,
  isWinningShape,
  kindKey,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  standardKinds,
  tileKindChanged,
  augmentDataSet,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  KanDeclaredPayload,
  PlayerId,
  RuleRegistry,
  TileId,
  TileKind,
} from "@majak/core";
import { roundViewKey } from "../util.js";

const ID = "void_kan";

/**
 * 깡패 kind가 오름패가 되도록 손패 1장을 바꾸는 변경안을 찾는다.
 * 반환 null = 손댈 필요가 없거나(이미 오름패) 맞출 수 없다(방어).
 */
function forgeWait(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  target: TileKind,
): { tileId: TileId; kind: TileKind } | null {
  const handIds = handIdsOf(state, holder);
  const kinds = handIds.map((id) => kindOf(state, id));
  const melds = meldCountOf(state, holder);
  const opts = scoringOptionsOf(state, rules, holder);
  // 13장(후로분 제외)이 아니면 손대지 않는다 — 쯔모 중이거나 장수가 어긋난 상태
  if (kinds.length !== 13 - melds * 3) return null;
  // 이미 텐파이가 아니면 발동하지 않는다 (텐파이 게이트)
  let tenpai = false;
  for (const candidate of standardKinds()) {
    if (isWinningShape([...kinds, candidate], melds, opts)) {
      tenpai = true;
      break;
    }
  }
  if (!tenpai) return null;
  // 이미 그 패로 화료할 수 있으면 손댈 이유가 없다
  if (isWinningShape([...kinds, target], melds, opts)) return null;

  for (let i = 0; i < handIds.length; i++) {
    for (const candidate of standardKinds()) {
      if (kindKey(candidate) === kindKey(kinds[i] as TileKind)) continue;
      const swapped = kinds.map((k, j) => (j === i ? candidate : k));
      if (isWinningShape([...swapped, target], melds, opts)) {
        return { tileId: handIds[i] as TileId, kind: candidate };
      }
    }
  }
  return null;
}

export const voidKan: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  complexity: 3,
  name: "성립하지 않는 깡",
  description:
    "(상시 · 리치 중에는 발동하지 않는다) 리치를 걸지 않은 텐파이라면, 타가가 깡을 선언하는 순간 그 깡패가 오름패인지와 상관없이 창깡으로 화료할 수 있다. 안깡도 예외가 아니다.",
  detail:
    "(상시) 텐파이 상태에서 타가가 안깡이나 가깡을 선언하면, 그 깡패가 내 오름패가 되도록 손패 한 장이 그 자리에서 바뀌어 창깡 론이 열린다. 국사무쌍만 안깡을 창깡할 수 있다는 표준 예외도 무력화된다.\n\n**내가 리치를 걸고 있으면 발동하지 않는다** — 손패를 바꿔야 성립하는 능력인데, 리치는 '이 손을 더 안 바꾸겠다'는 선언이라 손이 잠긴다(손패 변형 증강의 공통 규약). 텐파이를 리치로 굳히면 이 증강은 그 국 내내 잠들어 있으니, 둘 중 하나를 골라야 한다.\n\n⚠ 발동하면 **론을 하든 안 하든 손패 한 장이 그 자리에서 영구히 바뀐다.** 어느 패가 바뀌는지는 고를 수 없고, 창깡 론을 넘기거나 바뀐 대기가 후리텐이면 원래 대기는 그대로 사라진다.\n\n추가 점수는 없으며, 대명깡(남의 버림패로 부르는 깡)은 원래 창깡 대상이 아니므로 걸리지 않는다.",
  install(ctx) {
    const { holder } = ctx;

    // 안깡도 챤깡 대상으로 연다 (표준은 국사만)
    ctx.setHolderRule("win.closedKanRobbable", true);

    ctx.reaction(KAN_DECLARED, (event, rc) => {
      const p = event.payload as KanDeclaredPayload;
      if (p.player === holder) return;
      const state = rc.state;
      /*
       * 리치 중에는 손이 잠긴다 — 손패 변형 증강의 공통 규약이다
       * (붉은 손길·거신병·선언 간파가 같은 가드를 둔다). 이 증강만 그 규약 밖에
       * 있어서, 리치로 굳힌 손을 **본인도 모르게** 갈아 끼웠다(docs/25 벽패 #8).
       * 리치는 "이 손을 더 안 바꾸겠다"는 선언이고 상대는 그 전제로 수비한다.
       */
      if (state.round.byPlayer[holder]?.riichi != null) return;
      /*
       * 챤깡이 성립하는 깡(안깡·가깡)에서만.
       *
       * 예전에는 `kanKind`를 안 보고 `chankan?.tileId ?? handTileIds[0]`로 폴백해서,
       * **대명깡에도 발동**했다. 대명깡은 `chankan`이 null이라(flowEvents.ts) 론 창구가
       * 아예 안 열리는데, 폴백이 깡 친 사람의 손패 1장을 집어 홀더의 대기를 그쪽으로
       * 갈아 끼웠다 — 원래 대기는 사라지고 새 대기의 패는 이미 상대 후로에 다 나가 있어
       * 그 국 화료가 불가능해졌다. detail은 정반대를 약속하고 있었다
       * ("대명깡은 원래 창깡 대상이 아니므로 걸리지 않는다", 2026-08-08 QA 2-9).
       */
      if (p.kanKind === "kan_open") return;
      // 안깡·가깡은 chankan이 서지만, 리액션이 리듀서보다 먼저 도는 경로가 있어
      // 폴백은 남겨 둔다 — 막아야 할 것은 "chankan이 없는 것"이 아니라 대명깡이다.
      const chankanTile = state.round.chankan?.tileId ?? p.handTileIds[0];
      if (chankanTile === undefined) return;
      const target = kindOf(state, chankanTile);
      const forged = forgeWait(state, rc.rules, holder, target);
      if (forged === null) return;
      rc.emit(
        tileKindChanged([
          { tileId: forged.tileId, kind: forged.kind, attrs: { conjured: true } },
        ]),
      );
      // 발동 순간을 전원에게 알린다 (클라이언트 컷인용 — 무엇이 오름패가 됐는지)
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), kindKey(target)));
    });
  },
});
