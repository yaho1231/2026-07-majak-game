/**
 * 붉은 손길 (red_five_touch) — 게임당 1회, 자기 턴에 **숫자 하나를 지정해**
 * 손패의 그 숫자를 전부 적도라로 만든다.
 *
 * 52차 개편: "손패의 5를 전부 적도라"였던 고정 대상을 **1~9 아무 숫자나 지정**으로
 * 넓혔다. 5가 없으면 아무것도 못 하던 증강이, 손패를 보고 가장 많이 쥔 숫자를
 * 골라 한 번에 물들이는 선택형 액티브가 된다.
 *
 * 구현:
 * - 액션 payload가 `{}` → `{ rank }`(1~9)로 바뀌었다. ⚠ 클라이언트는 이 액션을
 *   전용 모달(숫자 선택)로 보여줘야 한다.
 * - `holderTurnOptions`는 **손패에 실제로 있는 랭크만** 후보로 낸다 — 없는 숫자를
 *   고르는 빈 옵션이 뜨지 않는다. (FlowController.submit은 제시 옵션과 JSON 완전일치를
 *   요구하므로 후보는 오름차순 랭크로 안정 정렬해 낸다.)
 * - 게임당 1회·자기 턴 조건은 그대로.
 *
 * # 버프 (2026-07-31 사용자 지시) — 스냅샷에서 **상시 각인**으로
 *
 * 예전에는 발동 순간 손에 있던 그 패들만 물들였다. 그 패를 버리거나 후로로 흘리면
 * 효과가 그대로 사라지고, 이후 같은 숫자를 새로 쯔모해도 평범한 패였다 — 실버 티어
 * 치고도 남는 게 없었다. 이제 **지정한 숫자는 게임이 끝날 때까지 나에게 적도라**다:
 * 국이 새로 시작될 때(배패)와 내가 새 패를 뽑을 때마다 그 숫자에 다시 각인을 새긴다.
 * 지정 자체는 여전히 게임당 1회다.
 *
 * (매 국 tiles가 원본으로 리셋되므로 각인은 반드시 ROUND_STARTED에서 다시 새겨야 한다 —
 *  안 그러면 첫 국에만 효과가 있고 다음 국부터 조용히 사라진다.)
 *
 * 55차(사용자 피드백: "증강으로 생성한 도라는 나만 사용가능하게"):
 * 물들인 패의 attrs에 `redFor: <보유자 id>`를 함께 새긴다. 예전엔 `{ red: true }`만
 * 붙어서, 그 패를 버려 상대가 펑·치로 가져가면 **상대가 내 적도라로 이득을 봤다**.
 * 이제 소유자가 패에 각인되고, `redFor`가 자기 것이 아닌 적도라를 채점에서 세지 않는
 * 처리는 코어 채점부가 담당한다 — 이 파일은 각인만 정확히 한다.
 */

import {
  CALL_MADE,
  ROUND_STARTED,
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  isNumberSuit,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  TileDrawnPayload,
  TileKindChangedPayload,
} from "@majak/core";
import { flagOf, publishUsesLeft, viewKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "red_five_touch";
const ACTION = "red_touch";
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;
/** 지정한 숫자 (게임 내내 유지 — 각인을 다시 새길 때 읽는다) */
const rankKey = (player: PlayerId): string => `${ID}:rank:${player}`;
/**
 * 전원 공개: 이 사람이 어떤 숫자를 물들였는가.
 *
 * 각인은 손패 attrs에만 남아 **테이블에서 보이지 않았다**(Rule #2). 더 나쁜 것은
 * 오해다 — 각인된 적도라를 버려 상대가 펑·치로 가져가면 상대 화면에는 빨간 5가
 * 서 있는데 채점에는 안 들어간다. 지정 숫자를 공개해 두면 "저 사람의 5는 내 것이
 * 아니다"가 처음부터 보인다. 각인은 게임 끝까지 유지되므로 국 스코프가 아니다.
 */
const markViewKey = (player: PlayerId): string => viewKey("*", `${ID}:${player}`);

/** 이 사람이 지정해 둔 숫자 (아직 안 썼으면 null) */
function markedRank(state: GameState, player: PlayerId): number | null {
  const v = state.augmentData[rankKey(player)];
  return typeof v === "number" && v >= 1 && v <= 9 ? v : null;
}

/**
 * 손패의 그 숫자 중 **아직 각인되지 않은** 패에 적도라를 새기는 변경 목록.
 *
 * ⚠ **패산에서 나온 진짜 적도라(`red`는 있고 `redFor`는 없는 패)는 건드리지 않는다.**
 * `redFor` 각인은 "이 적도라는 이 사람 것"이라 각인된 패는 **다른 사람에게는 적도라로
 * 세지 않는다**(helpers의 redCount). 자연 적5에 도장을 찍으면 그 패가 손을 떠났을 때
 * (버림 후 펑·손 교환) 새 주인이 원래 있던 적도라 값을 잃는다 — 남의 적도라를 무력화하는
 * 셈이다(docs/25 국면 #13). 보유자가 얻는 것은 없다: 각인이 없어도 자연 적도라는
 * 이미 자기에게 그대로 붙는다.
 */
function engraveChanges(
  state: GameState,
  player: PlayerId,
  rank: number,
): TileKindChangedPayload["changes"] {
  return rankIdsOf(state, player, rank)
    .filter((tileId) => {
      const attrs = state.tiles[tileId]?.attrs;
      if (attrs?.redFor === player) return false; // 이미 내 각인
      if (attrs?.red === true && attrs.redFor === undefined) return false; // 자연 적도라
      return true;
    })
    .map((tileId) => ({ tileId, attrs: { red: true, redFor: player } }));
}

/** 손패에서 지정 숫자에 해당하는 수패 id 목록 */
function rankIdsOf(
  state: GameState,
  player: PlayerId,
  rank: number,
): number[] {
  return handIdsOf(state, player).filter((id) => {
    const kind = kindOf(state, id);
    return isNumberSuit(kind) && kind.rank === rank;
  });
}

/** 손패에 실제로 존재하는 수패 랭크 목록 (오름차순) */
function ranksInHand(state: GameState, player: PlayerId): number[] {
  const set = new Set<number>();
  for (const id of handIdsOf(state, player)) {
    const kind = kindOf(state, id);
    if (isNumberSuit(kind)) set.add(kind.rank);
  }
  return [...set].sort((a, b) => a - b);
}

const redTouchAction: ActionDef<{ rank: number }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no red_five_touch augment";
    if (state.augmentData[usedKey(req.player)] === true) {
      return "red_touch already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 리치 중에는 손이 잠긴다 — 다른 손패 변형 증강(giant_god·peek_riichi_waits 등)과
    // 같은 규약. 리치 후에도 무비용으로 판수를 늘릴 수 있던 사각지대를 막는다.
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    const rank = req.payload.rank;
    if (!Number.isInteger(rank) || rank < 1 || rank > 9) {
      return "rank must be 1..9";
    }
    if (rankIdsOf(state, req.player, rank).length === 0) {
      return "no tiles of that rank in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    // 각인 규칙의 단일 진실은 engraveChanges다 — 여기서 따로 map하면 자연 적도라
    // 제외 같은 규칙이 한쪽에만 반영된다(실제로 그랬다).
    // redFor = 이 적도라의 주인(= 발동한 보유자). 이 패를 버려서 상대가 펑·치로
    // 가져가도 상대의 채점에는 적도라로 세어지지 않는다 (채점 쪽 처리는 코어 담당).
    const changes: TileKindChangedPayload["changes"] = engraveChanges(
      state,
      req.player,
      req.payload.rank,
    );
    return [
      tileKindChanged(changes),
      augmentDataSet(usedKey(req.player), true),
      // 지정 숫자를 남겨 둔다 — 이후 뽑는 패·다음 국 배패에도 같은 각인을 다시 새긴다
      augmentDataSet(rankKey(req.player), req.payload.rank),
      // 전원 공개 — 누가 어떤 숫자를 물들였는지. 그 사람의 적도라는 그 사람만 쓴다.
      augmentDataSet(markViewKey(req.player), `${req.payload.rank} 각인 (본인 전용 적도라)`),
    ];
  },
};

export const redFiveTouch: AugmentDef = defineAugment({
  id: ID,
  tier: "silver",
  category: "hand",
  complexity: 2,
  name: "붉은 손길",
  description:
    "(게임 내 1회 · 리치 중에는 쓸 수 없다) 자기 순에 숫자 하나(1~9)를 지정하면, 그 뒤로 내 손에 들어오는 그 숫자가 게임이 끝날 때까지 전부 적도라가 된다. 이 적도라는 나만 쓸 수 있고, 어떤 숫자를 지정했는지는 전원에게 공개된다.",
  detail:
    "(게임 내 1회) 자기 순에 발동하면서 1부터 9까지 중 숫자 하나를 고르면, 그 숫자의 수패(만·통·삭)가 내 손에 들어올 때마다 적도라가 된다 — 발동 시점의 손패는 물론, 이후 뽑는 패와 다음 국 배패까지 게임이 끝날 때까지 계속 적용된다. 이 적도라에는 소유자가 각인되어, 버린 패를 상대가 후로로 가져가도 상대의 점수로는 계산되지 않는다 — 그래서 지정한 숫자는 발동 즉시 전원에게 공개된다(상대가 '내 것이 아닌 적도라'를 세지 않도록). 각인은 **손패에 들어올 때만** 붙는다 — 울어서 가져온 패에는 붙지 않는다. 손에 없는 숫자는 고를 수 없고, 리치를 건 뒤에는 손이 잠겨 발동할 수 없다.",
  // 봇: 텐파이일 때, 손패에 가장 많은 랭크를 골라 발동한다 —
  //     그 시점 손에 쥔 패가 그대로 남아 적도라가 될 확률이 높다.
  //     (해당 랭크가 손에 없으면 애초에 후보로 뜨지 않는다.)
  bot: plan({
    intent: "score",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, tenpai, view, holder }) => {
      if (!tenpai) return null;
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const counts = new Map<number, number>();
      for (const id of view.zones[handZone(holder)]?.tileIds ?? []) {
        const kind = view.tiles[id]?.kind;
        if (kind === undefined || !isNumberSuit(kind)) continue;
        counts.set(kind.rank, (counts.get(kind.rank) ?? 0) + 1);
      }
      let best = mine[0] ?? null;
      let bestCount = -1;
      for (const o of mine) {
        const rank = (o.payload as { rank?: number }).rank;
        const c = rank === undefined ? 0 : (counts.get(rank) ?? 0);
        if (c > bestCount) {
          bestCount = c;
          best = o;
        }
      }
      return best;
    },
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // 각인 뒤에는 '숫자 각인' 뱃지가 대신 서므로, 이 뱃지가 보이는 것은 각인 전뿐이다.
    publishUsesLeft(ctx, (state) => ({
      left: flagOf(state, usedKey(holder)) ? 0 : 1,
      total: 1,
    }));

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(redTouchAction);
    }

    /** 지금 손에 있는 지정 숫자에 각인을 다시 새긴다 (이미 새겨진 패는 건너뛴다) */
    const engrave = (state: GameState, emit: (e: ProposedEvent) => void): void => {
      const rank = markedRank(state, holder);
      if (rank === null) return;
      const changes = engraveChanges(state, holder, rank);
      if (changes.length > 0) emit(tileKindChanged(changes));
    };

    // 새 국 배패 — setupRound가 tiles를 원본으로 되돌리므로 각인을 다시 새긴다
    ctx.reaction(ROUND_STARTED, (_event, rc) => engrave(rc.state, rc.emit));
    // 내가 새로 뽑은 패 — 지정 숫자면 그 자리에서 적도라가 된다
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      if ((event.payload as TileDrawnPayload).player !== holder) return;
      engrave(rc.state, rc.emit);
    });
    // 울어서 손이 바뀐 순간도 포함 (후로로 남은 손패가 정리된 뒤 각인 유지)
    ctx.reaction(CALL_MADE, (_event, rc) => engrave(rc.state, rc.emit));

    // 손패에 실제로 있는 랭크만 후보로 — 빈 옵션이 뜨지 않는다
    ctx.holderTurnOptions((state) =>
      ranksInHand(state, holder).map((rank) => ({
        type: ACTION,
        payload: { rank },
      })),
    );
  },
});
