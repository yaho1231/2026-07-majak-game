/**
 * 삼세 예지 (triple_peek, prism) — "내 앞에 놓일 세 장을 미리 읽는다".
 *
 * **매 국 1회**, 자기 턴(turn.act)에 선언하면 **내 다음 쯔모 세 장의 종류**가
 * 나에게만 공개된다. 실제 타일이 아니라 '종류(kind)'만 — 패산은 뒷면이라
 * 클라이언트가 tileId를 그릴 수 없으므로, kindKey 문자열 세 개를 보유자 전용
 * 채널에 실어 미니 패로 렌더한다. 예지(foresight)가 '한 바퀴(네 자리)'를 재배열해
 * 판을 설계한다면, 삼세 예지는 오직 **내 몫의 다음 세 쯔모**만 조용히 들여다본다.
 *
 * 설계 결정:
 * - 액션 `triple_peek_use {}` 하나. turn.act·자기 턴·이번 국 미사용·패산이 충분할 때만.
 * - 다음 쯔모 순서는 패산(state.zones[WALL].tileIds)을 index 0=바로 다음 뽑을 패로 보고,
 *   **현재 턴 플레이어의 다음 자리**부터 자리를 turn.direction 방향으로 돌리며 정한다
 *   (이번 턴 플레이어는 이미 뽑았으므로, 다음에 뽑는 사람은 그 다음 자리다).
 *   그 순서를 훑으며 보유자에게 배정되는 패의 kind를 세 개 모은다.
 * - **발동 시점의 스냅샷**만 저장한다. 그 뒤 후로(펑·치·깡)로 쯔모 순서가 밀리면
 *   예지가 어긋날 수 있다 — 그건 의도된 리스크다(스냅샷을 갱신하지 않는다).
 * - 저장은 kindKey **문자열 3개 배열**. tileId가 아니다(패산은 숨겨져 있어 클라가
 *   tileId를 못 그린다). 종류만 알면 미니 패로 표시할 수 있다.
 * - 무엇을 봤는지는 **보유자만** 안다(viewKey(holder,...)). 발동 사실 자체는
 *   전원 공개 마커로 알린다(상대는 예지가 일어났다는 것만 안다, 내용은 모른다).
 * - 사용 플래그는 **국 단위**다(`triple_peek:uses:<roundKey>:<holder>`) — 2026-08-01
 *   사용자 버프로 "동풍전 1·반장전 2회(매치 전체)"에서 **매 국 1회**가 됐다.
 *   국이 바뀌면 키가 달라져 자동으로 다시 채워진다(별도 리셋 불필요).
 */

import {
  TILE_DRAWN,
  WALL,
  augmentDataSet,
  defineAugment,
  kindKey,
  kindOf,
  nextSeat,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileDrawnPayload,
} from "@majak/core";
import { counterOf, roundKey, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "triple_peek";
const ACTION = "triple_peek_use";
/** 미리 읽는 다음 쯔모 장수 */
const PEEK = 3;

/** 국당 사용 횟수 (매 국 1회 — roundKey가 섞여 국이 바뀌면 자동으로 다시 찬다) */
const USES_PER_ROUND = 1;
const usesKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:uses:${roundKey(state)}:${holder}`;
/** 이번 국에 아직 사용 횟수가 남았는가 */
const hasUsesLeft = (state: GameState, holder: PlayerId): boolean =>
  counterOf(state, usesKey(state, holder)) < USES_PER_ROUND;
/** 예지 결과(kindKey 3개)를 담는 보유자 전용 채널 */
const resultKey = (holder: PlayerId): string => roundViewKey(holder, ID);
/** 아직 오지 않은 예지 결과 (쯔모할 때마다 앞에서 한 장씩 지워진다) */
function peekedKinds(state: GameState, holder: PlayerId): string[] {
  const v = state.augmentData[resultKey(holder)];
  return Array.isArray(v) ? (v as string[]) : [];
}

/** 발동 사실만 알리는 전원 공개 마커 (내용 없음) */
const noticeKey = (holder: PlayerId): string =>
  roundViewKey("*", `${ID}:${holder}`);

/** turn.direction 규칙 해석 (기본 1=시계) */
function turnDirection(state: GameState, rules: RuleRegistry): number {
  return rules.has("turn.direction")
    ? rules.resolve<number>("turn.direction", { state })
    : 1;
}

/**
 * 패산을 훑어 보유자의 다음 쯔모 PEEK장의 **kind**를 순서대로 모은다.
 * index 0 = 바로 다음 뽑는 패, 그 소유자는 현재 턴 플레이어의 다음 자리부터 시작.
 * (스냅샷 — 이후 후로로 순서가 밀리면 어긋날 수 있다.)
 */
function peekMyDrawKinds(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): string[] {
  const wall = state.zones[WALL]?.tileIds ?? [];
  const dir = turnDirection(state, rules);
  let seat = nextSeat(state, state.round.turnSeat, dir);
  const kinds: string[] = [];
  for (let i = 0; i < wall.length && kinds.length < PEEK; i++) {
    const tileId = wall[i];
    if (tileId !== undefined && playerAtSeat(state, seat).id === holder) {
      kinds.push(kindKey(kindOf(state, tileId)));
    }
    seat = nextSeat(state, seat, dir);
  }
  return kinds;
}

const peekAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no triple_peek augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this round";
    // 다음 세 쯔모를 온전히 읽을 수 없으면(패산이 얕음) 발동 불가
    if (peekMyDrawKinds(state, rules, req.player).length < PEEK) {
      return "not enough wall tiles";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const kinds = peekMyDrawKinds(state, rules, req.player);
    return [
      augmentDataSet(
        usesKey(state, req.player),
        counterOf(state, usesKey(state, req.player)) + 1,
      ),
      // 내용(kind 3개)은 보유자만 본다
      augmentDataSet(resultKey(req.player), kinds),
      // 발동 사실만 전원에게 (내용 없는 마커)
      augmentDataSet(noticeKey(req.player), {
        round: `${state.round.prevalentWind}-${state.round.roundNumber}-${state.round.honba}`,
        turnCount: state.round.turnCount,
      }),
    ];
  },
};

export const triplePeek: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "info",
  complexity: 1,
  name: "삼세 예지",
  description:
    "(매 국 1회) 자기 순에 선언하면 액티브 버튼을 누른 그 시점의 패산 기준으로 내 다음 쯔모 세 장의 종류가 나에게만 공개된다.",
  detail:
    "(매 국 1회) 자기 순에 선언하면 앞으로 내게 배정될 다음 쯔모 세 장의 '종류'가 나에게만 공개된다 — 실제 패가 아니라 무엇이 올지 그 종류만 안다. **액티브 버튼을 누른 그 시점의 정보**만 보여 주는 스냅샷이라, 그 사이 누군가 후로(펑·치·깡)를 하면 쯔모 차례가 밀려 예지가 어긋날 수 있다. 예지한 패는 내가 한 장 뽑을 때마다 하나씩 지워지고, 세 번을 다 뽑으면 스트립이 사라진다(이미 다 온 정보라 더 볼 것이 없다). 무엇을 봤는지는 나만 알고 상대에게는 발동 사실만 공개되며, 사용 횟수는 국이 바뀌면 다시 채워진다.\n\n내 몫의 쯔모가 3장 남지 않았으면 발동할 수 없다.",
  // 봇: 자해 위험이 전혀 없다 — 옵션이 뜨면 곧바로 선언한다.
  bot: plan({
    intent: "inform",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) engine.actions.register(peekAction);

    // 예지한 패가 실제로 손에 들어오면 그 한 장은 목록에서 지운다 — 세 장을 다 뽑으면
    // 목록이 비어 스트립이 사라진다. "이미 온 패"를 계속 띄워 두면 다음 쯔모를 가리키는
    // 정보로 오독된다(2026-08-01 사용자 보고).
    // 영상패(깡)는 왕패에서 오므로 예지한 패산 순서를 소모하지 않는다 — 세지 않는다.
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || p.rinshan) return;
      const rest = peekedKinds(rc.state, holder);
      if (rest.length === 0) return;
      rc.emit(augmentDataSet(resultKey(holder), rest.slice(1)));
    });

    // 아직 안 썼으면 보유자 턴에 선언 후보를 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      hasUsesLeft(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
});
