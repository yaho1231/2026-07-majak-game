/**
 * 절벽 위에 피어난 꽃 (cliff_bloom, prism) — 48차 재설계.
 *
 * 이전: 2국당 1회, "깡 후 텐파이가 될 때만" 열리는 버튼으로 확정 영상개화.
 * 지금: **횟수 제한 없음. 조건도 없다.**
 *   ① 깡을 할 때마다 영상패를 운에 맡기지 않는다 — 왕패 앞 4장을 보고 **원하는 것을 고른다**
 *      (전용 선택 모달, `bloom_pick`).
 *   ② 같은 국에서 **두 번째 깡을 완성하는 순간 손이 만개한다** — 손패가 그 자리에서
 *      완성형으로 다시 피어나 **패와 상관없이 즉시 영상개화로 화료**할 수 있다.
 *      텐파이였는지는 상관없다.
 *
 * 2026-08-06 사용자 지시: 만개형을 고정 배치에서 **지금 손과 가장 가까운 화료형**으로
 * 바꿨다. 예전에는 무엇을 들고 있었든 똑같은 손(동동 + 만123·만567 …)이 나와서 "내 손이
 * 피어난다"가 아니라 "남의 손이 배달된다"로 보였다. 이제 살릴 수 있는 패는 그대로 두고
 * (conjured가 안 붙는다) 모자란 자리만 만들어 낸다 — 대신 걸어오던 방향의 역이 그대로
 * 붙을 수 있다(고정 배치는 어떤 손에서도 역이 안 붙게 깎아 둔 것이었다).
 *
 * 리미트는 "한 국에 깡을 두 번 해야 한다"는 조건 자체다 — 페널티는 붙이지 않는다
 * (10_AUGMENT_SYSTEM §0 "리미트는 횟수로 준다").
 *
 * 구현 메모:
 * - 깡은 **표준 깡 흐름을 그대로 쓴다**(전용 깡 액션 없음). KAN_DECLARED를 세고,
 *   이어지는 영상패 TILE_DRAWN에 반응할 뿐이라 안깡·가깡·대명깡이 전부 자동 지원된다.
 * - 만개는 손패 kind를 통째로 완성형으로 덮어쓴다(tileKindChanged, conjured). 4장 한도를
 *   넘는 패가 생길 수 있다 — 프리즘의 상식 파괴.
 *   **2026-08-04 사용자 확정: 이대로 유지한다**(docs/25 P8 종결). 생성패는 화면에
 *   보라색으로 구분되어 그려지므로 상대의 패 셈을 몰래 무너뜨리지 않고, 5번째 장이
 *   바닥까지 가려면 자기가 만들어 낸 화료를 스스로 거절해야 한다. 봇만 생성패를 진짜
 *   패로 세던 것은 `bot/danger.ts`의 tileTracker에서 제외해 맞췄다.
 * - `rinshan` 플래그는 state.round.lastDrawRinshan에서 오므로, 패를 바꿔치기해도
 *   영상개화는 그대로 성립한다. 만개 국의 보상은 **그 영상개화를 4판으로 취급**하는 것
 *   하나뿐이다(BLOOM_RINSHAN_HAN) — 실제로 영상개화가 붙은 화료에만 적용된다.
 */

import {
  DEAD_WALL,
  KAN_DECLARED,
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  isWinningShape,
  kindKey,
  kindOf,
  meldCountOf,
  moveTiles,
  playerAtSeat,
  rinshanRemaining,
  scoringOptionsOf,
  tileKindChanged,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  KanDeclaredPayload,
  PlayerId,
  RuleRegistry,
  Suit,
  TileDrawnPayload,
  TileId,
  TileKind,
  TileKindChangedPayload,
  VisibilityRule,
} from "@majak/core";
import {
  counterOf,
  flagOf,
  roundViewKey,
  widenPeek,
} from "../util.js";
import { handKindsOf, hasNeighbor } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "cliff_bloom";
const ACTION_PICK = "bloom_pick";
const BLOOM_PICK_TAKEN = "BloomPickTaken";

/** 만개까지 필요한 깡 횟수 */
const KANS_TO_BLOOM = 2;
/**
 * 만개 화료의 **영상개화를 몇 판으로 취급하는가** (2026-07-26 사용자 확정).
 *
 * 표준 영상개화는 1판이다. 만개한 국의 화료에서는 그것을 **4판짜리 역으로 취급**한다 —
 * 손패가 눈앞에서 다시 피어나 그 자리에서 오르는 장면의 마감을, 정산에서도 "영상개화 4판"
 * 하나로 읽히게 하는 것이 이 증강의 보상 전부다.
 *
 * 연혁: 52차 "+3판 환산 + 6000점"(docs/16 §1c) → 2026-07-26 확정 보상 단위 통일로 합 7판 →
 * 같은 날 **영상개화 4판 취급(= +3판)**으로 정리. 판수는 만관/하네만 상한에서 비선형이라
 * 3판+4판 중복이 저판 손에서 과하게 터졌다.
 *
 * 구현: 커스텀 역은 GameState를 못 읽어 "만개했는가"를 볼 수 없으므로, 표준 영상개화 1판은
 * 그대로 두고 **차이(4 − 1 = 3판)만** 정산 보정으로 얹는다.
 *
 * ⚠ 붙는 조건: 이 증강의 하이라이트는 어디까지나 **만개**다(깡마다 영상패를 고르는 것은
 * 상시 편의 기능이라 국마다 몇 번이고 일어난다). 깡 한 번만 한 국의 평범한 화료까지
 * 붙으면 "깡하면 +3판"이라는 보이지 않는 패시브가 되어 §0에 정면으로 걸린다.
 * 따라서 **만개(bloomed)한 국 + 실제로 영상개화가 붙은 화료** 한정이다.
 */
const BLOOM_RINSHAN_HAN = 4;
/** 표준 영상개화 판수 — 정산에 얹는 것은 BLOOM_RINSHAN_HAN과의 차이뿐이다 */
const STANDARD_RINSHAN_HAN = 1;

/** 이번 국에 이 보유자가 선언한 깡 수 */
const kanCountKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "kans", state, h);
/** 이번 국에 이미 만개했는가 */
const bloomedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "bloomed", state, h);
/**
 * 지금 고를 수 있는 영상패의 대상 쯔모패 (tileId + 1, 0 = 없음).
 * "지금 쯔모패가 그 영상패일 때만 유효"하므로 플래그가 스스로 만료된다 —
 * 깡을 연달아 하거나 만개해도 지난 깡의 선택권이 남지 않는다.
 *
 * ⚠ 그래도 **국 스코프**여야 한다. tileId 비교만으로는 국이 바뀐 뒤 같은 tileId를
 * 정상 쯔모했을 때 되살아나, 깡도 없이 쯔모패를 왕패와 맞바꿀 수 있었다(2026-07-29 감사).
 */
const pickKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "pick", state, h);

/** 지금 이 플레이어가 영상패를 고를 수 있는가 */
function canPick(state: GameState, h: PlayerId): boolean {
  const drawn = state.round.lastDrawnTile;
  if (drawn === null) return false;
  return counterOf(state, pickKey(state, h)) === drawn + 1;
}

interface BloomPickPayload {
  player: PlayerId;
  index: number;
  drawnTileId: TileId;
  takenTileId: TileId;
}

/** 슌쯔를 만들 수 있는 무늬 (자패는 커쯔·머리만) */
const NUMBER_SUITS: readonly Suit[] = ["man", "pin", "sou"];

/**
 * 손패와 하나도 안 겹칠 때 쓰는 **채움 멘쯔표**. (무늬, 시작 랭크)가 전부 서로 달라야 한다 —
 * 예전에는 `suits[i % 3]` + `1 + (i % 3) * 2`라 i=0과 i=3이 똑같이 만123이 되어
 * 멘젠 만개마다 **이페코가 확정으로** 붙었다(docs/25 벽패 #5).
 *
 * 아래 배치는 세 역을 모두 피한다:
 *  · 이페코 — (무늬,시작) 5쌍이 전부 다르다
 *  · 삼색동순 — 같은 시작 랭크가 세 무늬에 걸치지 않는다 (1은 만에만, 7은 통에만)
 *  · 일기통관 — 한 무늬 안의 시작이 {1,4,7}을 이루지 않는다 (만 1·5 / 통 3·7 / 삭 6)
 * 진짜 용(5멘쯔)까지 감당하도록 5칸을 둔다.
 */
const FILLER_LAYOUT: readonly { suit: Suit; start: number }[] = [
  { suit: "man", start: 1 },
  { suit: "man", start: 5 },
  { suit: "pin", start: 3 },
  { suit: "sou", start: 6 },
  { suit: "pin", start: 7 },
];

const fillerSet = (i: number): TileKind[] => {
  const slot = FILLER_LAYOUT[i % FILLER_LAYOUT.length] as { suit: Suit; start: number };
  return [0, 1, 2].map((j) => ({ suit: slot.suit, rank: slot.start + j }));
};

/** kind 목록 → kindKey별 장수 */
function countKinds(kinds: readonly TileKind[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const k of kinds) {
    const key = kindKey(k);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** 이 멘쯔를 쓰면 손패에서 **그대로 살아남는 장수** (겹치는 만큼) */
function overlapOf(set: readonly TileKind[], remain: Map<string, number>): number {
  let gain = 0;
  for (const [key, need] of countKinds(set)) {
    gain += Math.min(remain.get(key) ?? 0, need);
  }
  return gain;
}

/** 고른 멘쯔가 먹은 만큼 남은 장수에서 뺀다 */
function consumeKinds(set: readonly TileKind[], remain: Map<string, number>): void {
  for (const k of set) {
    const key = kindKey(k);
    const left = remain.get(key) ?? 0;
    if (left > 0) remain.set(key, left - 1);
  }
}

/**
 * 손패에 **한 장이라도 걸치는** 멘쯔 후보 전부 (커쯔 + 그 패를 포함하는 슌쯔 셋).
 * 손패와 전혀 안 겹치는 멘쯔는 어차피 이득이 0이라 후보에 넣을 이유가 없다 —
 * 그 자리는 `FILLER_LAYOUT`이 결정론적으로 메운다.
 *
 * 손패 순서에서 만들어지므로 순서도 결정론적이다(리플레이 일치).
 */
function candidateSets(hand: readonly TileKind[]): TileKind[][] {
  const out: TileKind[][] = [];
  const seen = new Set<string>();
  const push = (set: TileKind[]): void => {
    const key = set.map(kindKey).join("/");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(set);
  };
  for (const k of hand) {
    push([k, k, k]);
    if (!NUMBER_SUITS.includes(k.suit)) continue;
    for (let start = Math.max(1, k.rank - 2); start <= Math.min(7, k.rank); start++) {
      push([0, 1, 2].map((j) => ({ suit: k.suit, rank: start + j })));
    }
  }
  return out;
}

/** 후보 화료형 하나 — 살아남는 장수(kept)가 클수록 원래 손과 가깝다 */
interface HandCandidate {
  kinds: TileKind[];
  kept: number;
}

/**
 * 표준형(머리 1 + 멘쯔 sets개) 중 **원래 손과 가장 많이 겹치는 것**.
 *
 * 머리 후보를 하나씩 놓고, 남은 장수에 대해 이득이 가장 큰 멘쯔를 탐욕적으로 집는다.
 * 겹침은 열화(한 번 쓴 장은 줄어든다)하므로 탐욕이 최적에 아주 가깝고, 무엇보다
 * **입력이 같으면 결과가 같다** — 리플레이·재구성이 어긋나지 않아야 한다.
 */
function bestStandardHand(hand: readonly TileKind[], sets: number): HandCandidate {
  const pairCandidates: TileKind[] = [];
  const seenPair = new Set<string>();
  for (const k of hand) {
    if (seenPair.has(kindKey(k))) continue;
    seenPair.add(kindKey(k));
    pairCandidates.push(k);
  }
  // 손이 비어 있을 리는 없지만, 후보가 없으면 예전 만개의 머리(동)를 쓴다
  if (pairCandidates.length === 0) pairCandidates.push({ suit: "wind", rank: 1 });

  const candidates = candidateSets(hand);
  let best: HandCandidate | null = null;
  for (const pair of pairCandidates) {
    const remain = countKinds(hand);
    let kept = Math.min(remain.get(kindKey(pair)) ?? 0, 2);
    consumeKinds([pair, pair], remain);
    const kinds: TileKind[] = [pair, pair];
    let filler = 0;
    for (let i = 0; i < sets; i++) {
      let pick: TileKind[] | null = null;
      let pickGain = 0;
      for (const c of candidates) {
        const gain = overlapOf(c, remain);
        if (gain > pickGain) {
          pickGain = gain;
          pick = c;
        }
      }
      // 더 살릴 패가 없으면 역이 우연히 붙지 않는 채움 멘쯔로 메운다
      if (pick === null) pick = fillerSet(filler++);
      kept += pickGain;
      consumeKinds(pick, remain);
      kinds.push(...pick);
    }
    if (best === null || kept > best.kept) best = { kinds, kept };
  }
  return best as HandCandidate;
}

/**
 * 손패를 **지금 손과 가장 가까운 완성형**으로 다시 짠다.
 *
 * 2026-08-06 사용자 지시로 고정 배치(항상 동동 + 만123·만567 …)를 걷어냈다. 예전에는
 * 무엇을 들고 있었든 똑같은 손이 나와서, 만개가 "내 손이 피어난다"가 아니라 "남의 손이
 * 배달된다"로 보였다. 이제는 **살릴 수 있는 패를 최대한 살리고** 모자란 자리만 메운다.
 *
 * ⚠ 그 대가로 손이 걸어오던 방향의 역(청일색·탕야오 등)이 그대로 붙을 수 있다.
 * 만개의 보상을 "확정 화료"로만 묶어 두던 예전 설계와 다른 지점이라, 값이 커진 만큼은
 * 의도된 것이다(고정 배치는 어떤 손에서도 역이 안 붙게 깎아 둔 것이었다).
 *
 * 바뀌지 않은 패는 **changes에 넣지 않는다** — 진짜 패는 진짜인 채로 남고,
 * `conjured`(생성패, 화면에 보라색·봇의 패 셈에서 제외)는 실제로 만들어 낸 자리에만 붙는다.
 */
function bloomChanges(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): TileKindChangedPayload["changes"] | null {
  const concealed = handIdsOf(state, holder);
  // ⚠ 멘쯔 수를 4로 하드코딩하면 안 된다 — 진짜 용(scoring.totalSets=5, 손패 16/17장)
  //    보유자는 `sets*3+2`가 영원히 안 맞아 만개가 **한 번도 일어나지 않았다**(60차 수정).
  //    화료형의 단일 진실은 scoringOptionsOf다.
  const opts = scoringOptionsOf(state, rules, holder);
  const totalSets = opts.totalSets ?? 4;
  const melds = meldCountOf(state, holder);
  const sets = totalSets - melds;
  if (sets < 0) return null;
  // 완성형은 머리 2장 + 멘쯔 3장씩 — 장수가 맞지 않으면 손대지 않는다(방어)
  if (concealed.length !== sets * 3 + 2) return null;

  const hand = concealed.map((id) => kindOf(state, id));
  // 치또이쯔는 후보로 두지 않는다 — 만개는 깡 두 번이 조건이라 이 시점의 손은
  // 반드시 후로 2개 이상이고, 멘젠 7작두는 애초에 성립하지 않는다.
  let target = bestStandardHand(hand, sets).kinds;
  // 화료형 판정 자체를 바꾸는 증강(우는 국사무쌍 등)과 겹치면 표준형이 화료가 아닐 수
  // 있다. 그럴 때는 아무것도 안 하느니 예전 고정 배치를 그대로 쓴다.
  if (!isWinningShape(target, melds, opts)) {
    const fallback: TileKind[] = [
      { suit: "wind", rank: 1 },
      { suit: "wind", rank: 1 },
    ];
    for (let i = 0; i < sets; i++) fallback.push(...fillerSet(i));
    if (!isWinningShape(fallback, melds, opts)) return null;
    target = fallback;
  }

  // 이미 그 패를 들고 있는 자리부터 채운다 — 그만큼 손대지 않아도 된다
  const need = countKinds(target);
  const untouched = new Set<TileId>();
  for (let i = 0; i < concealed.length; i++) {
    const key = kindKey(hand[i] as TileKind);
    const left = need.get(key) ?? 0;
    if (left <= 0) continue;
    need.set(key, left - 1);
    untouched.add(concealed[i] as TileId);
  }
  const leftover: TileKind[] = [];
  for (const [key, n] of need) {
    const kind = target.find((k) => kindKey(k) === key);
    if (kind === undefined) continue;
    for (let i = 0; i < n; i++) leftover.push(kind);
  }

  const changes: TileKindChangedPayload["changes"] = [];
  let next = 0;
  for (const tileId of concealed) {
    if (untouched.has(tileId)) continue;
    const kind = leftover[next++];
    if (kind === undefined) return null; // 수가 안 맞으면 손대지 않는다(방어)
    changes.push({ tileId, kind, attrs: { conjured: true } });
  }
  return changes;
}

const bloomPickAction: ActionDef<{ index: number }> = {
  type: ACTION_PICK,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no cliff_bloom augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!canPick(state, req.player)) return "no rinshan pick available";
    const idx = req.payload.index;
    // 고를 수 있는 건 **아직 남은 영상패**뿐이다. 깡으로 뽑은 자리는 보충되지 않으므로
    // 상수 4로 잡으면 이미 빈 자리를 지나 도라 표시패를 집게 된다(2026-07-26).
    if (!Number.isInteger(idx) || idx < 0 || idx >= rinshanRemaining(state)) {
      return "invalid rinshan index";
    }
    if ((state.zones[DEAD_WALL]?.tileIds ?? [])[idx] === undefined) {
      return "no tile at that index";
    }
    const drawn = state.round.lastDrawnTile;
    if (drawn === null) return "no drawn tile to trade";
    if (!handIdsOf(state, req.player).includes(drawn)) return "drawn tile not in hand";
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: BLOOM_PICK_TAKEN,
      payload: {
        player: req.player,
        index: req.payload.index,
        drawnTileId: state.round.lastDrawnTile as TileId,
        takenTileId: (state.zones[DEAD_WALL]?.tileIds ?? [])[
          req.payload.index
        ] as TileId,
      } satisfies BloomPickPayload,
    },
  ],
};

export const cliffBloom: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  complexity: 3,
  name: "절벽 위에 피어난 꽃",
  description:
    "(상시) 깡을 할 때마다 영상패를 **남아 있는 영상패 전부** 중에서 직접 고른다. 한 국에 깡을 두 번 하면 텐파이가 아니어도 손이 만개해 즉시 영상개화로 화료하며, 그 영상개화는 4판으로 취급된다.",
  detail:
    "(상시) 영상패는 국 시작 시 4장이고 누군가 깡을 칠 때마다 한 장씩 소모되어 보충되지 않으므로, 고를 수 있는 폭은 깡이 늘수록 좁아진다(네 번째 깡에서는 남은 한 장뿐이다).\n\n만개는 지금 손패에서 살릴 수 있는 패를 최대한 살린 화료형으로 재구성된다. 만개한 국이 아니면 화료에 아무것도 얹히지 않으며, 역만에는 미적용이다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION_PICK)) {
      engine.actions.register(bloomPickAction);
      engine.reducers.register(BLOOM_PICK_TAKEN, (state, event) => {
        const p = event.payload as BloomPickPayload;
        // 고른 영상패를 손으로 → 비워진 자리에 쯔모패를 밀어 넣는다 (왕패 장수 보존)
        let zones = moveTiles(state.zones, DEAD_WALL, handZone(p.player), [
          p.takenTileId,
        ]);
        zones = moveTiles(zones, handZone(p.player), DEAD_WALL, [p.drawnTileId], p.index);
        return {
          ...state,
          zones,
          // 새 쯔모패는 고른 패 — pickKey는 옛 쯔모패를 가리키므로 자동으로 만료된다
          round: { ...state.round, lastDrawnTile: p.takenTileId },
        };
      });
    }

    /*
     * 보유자에게 **남은 영상패만** 공개 — 무엇을 고를지 보고 정한다.
     * 상수 4로 두면 깡으로 영상패가 줄어든 뒤 그 뒤의 도라 표시패까지 새어 보인다.
     *
     * ⚠ 열람은 **고를 차례가 열려 있을 때만** 열린다(`canPick`). 예전에는 게이트가
     * 하나도 없어서, 깡을 한 번도 치지 않은 보유자가 **배패 직후부터 유국까지**
     * 영상패를 실제 tileId로 계속 봤다(2026-08-22 QA aug-1 확정 3). 왕패는 절대
     * 나오지 않는 패라 그 4장을 아는 것은 "남은 산에 그 종류가 몇 장인지"를 아는
     * 것과 같다 — 카드가 열람 시점을 "깡할 때마다"로 못 박은 것과 정면으로 어긋나고,
     * 정보형 증강(`dead_wall_master`·`rinshan_preview`)의 값어치를 무상으로 준다.
     */
    ctx.engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !canPick(state, holder)) return cur;
        return widenPeek(cur, {
          mode: "peek",
          count: rinshanRemaining(state),
        });
      },
    });

    // 만개 국의 영상개화는 4판으로 취급한다 — 표준 1판과의 차이(+3판)만 얹는다.
    //
    // ⚠ 예전에는 이 차액을 addWinPointBonus로 **점수에만** 얹었다. 그러면 정산창에는
    //    "영상개화 1판"만 남아 4판 취급이 화면 어디에도 나타나지 않는다(2026-08-01
    //    사용자 보고: "깡 두 번 치고 화료했는데 영상개화 1판으로 취급됨").
    //    score.extraHan은 코어가 총 판수에 합산하고 WinInfo.extraHan으로도 실어 주므로
    //    정산창이 "증강 보너스 3판"으로 보여 준다 — 보이지 않던 보상이 보이게 된다.
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!flagOf(state, bloomedKey(state, holder))) return cur;
        // 영상개화의 성립 조건과 같은 판정(쯔모 + 마지막 뽑기가 영상패)을 그대로 쓴다.
        // 만개는 영상 쯔모 직후에 일어나므로, 그 화료가 아니면 아무것도 얹지 않는다.
        if (!state.round.lastDrawRinshan) return cur;
        const drawn = state.round.lastDrawnTile;
        if (drawn === null || !handIdsOf(state, holder).includes(drawn)) return cur;
        return cur + (BLOOM_RINSHAN_HAN - STANDARD_RINSHAN_HAN);
      },
    });

    // 이번 국의 깡 수를 센다 (안깡·가깡·대명깡 전부)
    ctx.reaction(KAN_DECLARED, (event, rc) => {
      const p = event.payload as KanDeclaredPayload;
      if (p.player !== holder) return;
      const key = kanCountKey(rc.state, holder);
      rc.emit(augmentDataSet(key, counterOf(rc.state, key) + 1));
    });

    // 영상패를 뽑는 순간 — 두 번째 깡이면 만개, 아니면 선택 모달을 연다
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || !p.rinshan) return;
      const state = rc.state;
      const kans = counterOf(state, kanCountKey(state, holder));

      if (kans >= KANS_TO_BLOOM && !flagOf(state, bloomedKey(state, holder))) {
        const changes = bloomChanges(state, rc.rules, holder);
        if (changes !== null) {
          rc.emit(tileKindChanged(changes));
          rc.emit(augmentDataSet(bloomedKey(state, holder), true));
          rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), "만개"));
          return; // 만개했으면 영상패를 고를 이유가 없다
        }
      }
      rc.emit(augmentDataSet(pickKey(rc.state, holder), p.tileId + 1));
    });

    // 선택 모달용 후보 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!canPick(state, holder)) return [];
      return Array.from({ length: rinshanRemaining(state) }, (_v, index) => ({
        type: ACTION_PICK,
        payload: { index },
      }));
    });
  },
  // 깡의 영상패를 왕패 앞 4장에서 고른다(홀더에겐 공개). 오름패가 있으면 그걸 골라
  // 영상개화로 화료하고, 없으면 짝·슌쯔가 되는 패를, 그래도 없으면 첫 후보를 고른다
  // (아무거나 고르는 편이 무작위 영상패보다 낫다).
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
      const picks = options.filter((o) => o.type === ACTION_PICK);
      if (picks.length === 0) return null;
      const dead = view.zones[DEAD_WALL]?.tileIds ?? [];
      const kinds = handKindsOf(view, holder);
      const meldCount = view.round.byPlayer[holder]?.meldCount ?? 0;
      const wins = new Set(
        winningKinds(kinds, meldCount, undefined, view.scoringOptions).map(kindKey),
      );
      const kindAt = (o: (typeof picks)[number]): TileKind | undefined => {
        const idx = (o.payload as { index?: number }).index;
        const id = idx !== undefined ? dead[idx] : undefined;
        return id !== undefined ? view.tiles[id]?.kind : undefined;
      };
      // 1) 오름패면 즉시 화료
      for (const o of picks) {
        const k = kindAt(o);
        if (k !== undefined && wins.has(kindKey(k))) return o;
      }
      // 2) 손을 진전시키는 패(짝·이웃)
      for (const o of picks) {
        const k = kindAt(o);
        if (k === undefined) continue;
        if (kinds.some((x) => x.suit === k.suit && x.rank === k.rank) || hasNeighbor(kinds, k)) {
          return o;
        }
      }
      // 3) 아무거나 (무작위 영상패보다 나음)
      return picks[0] ?? null;
    },
  }),
});
