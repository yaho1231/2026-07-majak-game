/**
 * 염색 (tile_dyeing, gold).
 * 게임 전체 5회, 자기 턴에 손패의 수패 1장을 같은 숫자의 다른 무늬로 바꾼다(3만→3통).
 * 변환은 전원 공개, 리치 중에도 사용할 수 있다. 혼일색·삼색 빌드의 윤활유.
 *
 * 구현: 연금술사(alchemist)와 같은 자원 구조 — 게임 단위 카운터 5회 + 한 순 1회 제한 +
 * 남은 횟수 뷰 채널. holderTurnOptions로 손패 수패×다른 무늬 후보(≤26)를 열거,
 * TileKindChanged로 변환한다.
 *
 * ⚠ **패산의 실물과 종류를 맞바꾼다 — 그 자리에서 생성(conjure)하는 것은 최후수단이다.**
 * 형제 `suit_unify`(suitUnifyCore 머리 주석)가 완전히 같은 조작에서 이미 버린 구현이
 * kind 덮어쓰기였다: 손패의 kind만 갈아 끼우면 같은 종류가 게임에 5장 이상 존재하는
 * 비정상 분포가 생기고, 남은 패를 세는 쪽(대기·안전패 계산)이 전부 틀어진다
 * (2026-08-22 QA aug-4 확정 3). 그래서 suitUnifyCore와 같은 규약을 쓴다 —
 * 패산에 목표 종류의 실물이 있으면 그 패와 종류를 서로 맞바꾸고(장수 분포 보존),
 * 없을 때만 그 자리에서 생성한다.
 * (패산 실물을 손으로 끌어오는 대신 **종류만 맞교환**하는 것은, 손패의 tileId가
 *  그대로 남아야 "그 패가 물들었다"는 카드 문구·클라이언트 표시가 유지되기 때문이다.
 *  패산은 아무에게도 안 보이므로 물리 교환과 결과가 같다.)
 *
 * ⚠ **가드는 `copiesLeftUndrawn`가 아니라 「이미 눈에 보이는 장수」로 건다.**
 * 형제들이 쓰는 `copiesLeftUndrawn`(패산+왕패)는 **상대 손패에 있는 장을 세지 않으므로
 * 보유자가 알 수 없는 값**이다. 그걸로 액티브 후보를 열고 닫으면 버튼이 뜨고 안 뜨는
 * 것만으로 "3통이 패산에 남았는가"가 새어 나간다 — 정보 증강도 아닌 카드가 패산을
 * 들여다보는 셈이다. 반면 확정 3이 말한 실제 피해("바닥에서 넉 장을 다 세고 던진
 * 안전패에 맞는다")는 **넉 장이 전부 공개돼 있을 때만** 성립한다. 그래서 공개 정보인
 * 「보이는 장수 ≥ 4」로 막는다: 피해가 정확히 그 경우에만 생기고, 판정이 공개 정보라
 * 새어 나갈 것이 없다. (자동으로 종류를 고르는 `void_kan`은 선택이 없어 정보 누출이
 *  없으므로 그쪽은 `copiesLeftUndrawn`을 그대로 쓴다.)
 */

import {
  TILE_DRAWN,
  WALL,
  augmentDataSet,
  defineAugment,
  discardsZone,
  handIdsOf,
  handZone,
  isNumberSuit,
  kindKey,
  kindOf,
  meldsZone,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import { counterOf, roundKey, roundViewKey, statePrng, viewKey } from "../util.js";
import { handAlteredKey } from "./handAltered.js";
import { handKindsOf, tileSwapImproves } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "tile_dyeing";
const ACTION = "tile_dye";
const MAX_USES = 5;
const SUITS = ["man", "pin", "sou"] as const;
type NumSuit = (typeof SUITS)[number];

/** 게임 전체 사용 횟수 (국을 넘어 누적된다) */
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 마지막으로 사용한 '턴'의 서명 (한 턴에 한 번만 쓰게 막는다) */
const turnUsedKey = (h: PlayerId): string => `${ID}:turn:${h}`;
/** 남은 횟수를 보유자 화면에 노출하는 채널 — 게임 스코프라 국 스코프 키를 쓰지 않는다. */
const leftViewKey = (h: PlayerId): string => viewKey(h, `${ID}:left`);
/**
 * 전원 공개: 이번 국에 무엇을 무엇으로 바꿨는가 ("man3→pin3").
 *
 * 설명이 "바뀐 패는 전원에게 공개되고"라고 약속하는데, 실제로는 손패 안에서 kind만
 * 갈리고(숨은 정보) 남은 횟수만 보유자에게 나갔다 — 상대는 무엇이 바뀌었는지도,
 * 바뀌었다는 사실조차도 알 수 없었다(Rule #2). 분열(tile_split)이 쓰는 것과 같은
 * 국 스코프 공개 채널로 맞춘다.
 */
const revealViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);
const usesLeft = (state: GameState, h: PlayerId): number =>
  Math.max(0, MAX_USES - counterOf(state, usedKey(h)));

/**
 * 이 국에서 보유자의 현재 턴을 식별하는 서명 (연금술사와 동일).
 * 매 턴은 정확히 버림 한 번으로 끝나므로 (국 + 버림 수)로 턴을 유일하게 식별한다.
 */
function currentTurnSig(state: GameState, h: PlayerId): string {
  const discards = state.round.byPlayer[h]?.discardCount ?? 0;
  return `${roundKey(state)}:${discards}`;
}

/** 보유자가 이번 턴에 이미 염색을 썼는가 */
function usedThisTurn(state: GameState, h: PlayerId): boolean {
  return state.augmentData[turnUsedKey(h)] === currentTurnSig(state, h);
}

/**
 * 패산에 남아 있는 목표 종류의 실물들 (교환 상대 후보).
 *
 * 적도라는 후보에서 뺀다 — 적5를 끌어오면 "적도라를 물들이면 빨간색이 사라진다"는
 * 카드의 ⚠ 문구와 반대로 **염색으로 적도라가 생기는** 길이 열린다.
 * 왕패는 보지 않는다 — 표시패·영상패 자리를 건드리면 도라가 통째로 흔들린다.
 */
function wallPartners(state: GameState, kind: TileKind): TileId[] {
  const out: TileId[] = [];
  for (const id of state.zones[WALL]?.tileIds ?? []) {
    const t = state.tiles[id];
    if (t === undefined || t.attrs.red === true) continue;
    if (t.kind.suit === kind.suit && t.kind.rank === kind.rank) out.push(id);
  }
  return out;
}

/**
 * **이미 테이블에 드러나 있는 그 종류의 장수** — 내 손패 + 전원의 버림·후로 + 도라 표시패.
 *
 * 수비자가 "이건 절대 안 맞는다"고 셀 수 있는 값이 정확히 이것이다. 4가 되면 그 종류로는
 * 물들 수 없다(파일 머리의 ⚠ 참고). 공개 정보만 세므로 후보 열거에 써도 새는 것이 없다.
 */
function visibleCopies(state: GameState, holder: PlayerId, kind: TileKind): number {
  let n = 0;
  const count = (ids: readonly TileId[] | undefined): void => {
    for (const id of ids ?? []) {
      const k = kindOf(state, id);
      if (k.suit === kind.suit && k.rank === kind.rank) n++;
    }
  };
  count(state.zones[handZone(holder)]?.tileIds);
  for (const p of state.players) {
    count(state.zones[discardsZone(p.id)]?.tileIds);
    count(state.zones[meldsZone(p.id)]?.tileIds);
  }
  count(state.round.doraIndicators);
  return n;
}

const dyeAction: ActionDef<{ tileId: TileId; suit: NumSuit }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no tile_dyeing augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 48차 무페널티: 리치 중 사용 금지 해제 — 리치 여부는 더 이상 보지 않는다.
    // (검사를 return null로 바꾸면 아래 한도·손패 검증이 통째로 건너뛰어지므로 삭제한다.)
    if (counterOf(state, usedKey(req.player)) >= MAX_USES) return "no uses left";
    if (usedThisTurn(state, req.player)) return "already used this turn";
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    const k = kindOf(state, req.payload.tileId);
    if (!isNumberSuit(k)) return "not a number tile";
    if (k.suit === req.payload.suit) return "same suit";
    // 5장째 방지: 넉 장이 이미 전부 보이는 종류로는 물들 수 없다 (머리 주석 ⚠ 참고)
    if (visibleCopies(state, req.player, { suit: req.payload.suit, rank: k.rank }) >= 4) {
      return "all four copies of that tile are already visible";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const k = kindOf(state, req.payload.tileId);
    const target: TileKind = { suit: req.payload.suit, rank: k.rank };
    // 패산에 실물이 남아 있으면 그 패와 종류를 맞바꾼다(분포 보존). 없으면 생성한다
    // — suitUnifyCore와 같은 규약이다. 교환 상대는 결정적 난수로 고른다: 패산 어느
    // 자리의 실물을 내주느냐가 이후 쯔모 순서를 바꾸므로 재현 가능해야 한다.
    const partners = wallPartners(state, target);
    const prng = statePrng(state);
    const partnerId =
      partners.length === 0 ? undefined : (partners[prng.int(partners.length)] as TileId);
    const wasRed = state.tiles[req.payload.tileId]?.attrs.red === true;
    return [
      tileKindChanged(
        [
          // 손패의 그 패가 목표 색으로 물든다 (적도라 표식은 코어가 뗀다)
          { tileId: req.payload.tileId, kind: target, attrs: { conjured: true } },
          // 패산의 실물이 그 대신 원래 종류가 된다 — 게임 전체 장수 분포 보존.
          // 물들인 패가 적5였다면 그 빨강은 패산으로 따라간다(적도라 총수도 보존).
          ...(partnerId === undefined
            ? []
            : [{ tileId: partnerId, kind: k, ...(wasRed ? { attrs: { red: true } } : {}) }]),
        ],
        prng.getState(),
      ),
      // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고).
      // 이게 없으면 오야가 첫 순에 염색으로 손을 완성시켜 48,000점을 받는다
      // (2026-08-22 QA aug-4 확정 1 — dead_wall_master 와 완전히 같은 버그).
      augmentDataSet(handAlteredKey(state, req.player), true),
      augmentDataSet(usedKey(req.player), counterOf(state, usedKey(req.player)) + 1),
      // 이번 턴에 썼음을 기록 → 같은 턴 재사용 차단 (버림으로 턴이 넘어가면 자동 해제)
      augmentDataSet(turnUsedKey(req.player), currentTurnSig(state, req.player)),
      // 남은 횟수 갱신 (위 usedKey 증가를 반영해 -1)
      augmentDataSet(leftViewKey(req.player), usesLeft(state, req.player) - 1),
      // 전원 공개 — 무엇이 무엇으로 물들었는지. 문자열이라 클라이언트 폴백이 그대로 읽는다.
      augmentDataSet(
        revealViewKey(req.player),
        `${kindKey(k)}→${kindKey({ suit: req.payload.suit, rank: k.rank })}`,
      ),
    ];
  },
};

export const tileDyeing: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "hand",
  complexity: 1,
  name: "염색",
  description:
    "(게임 내 5회) 자기 순에 한 번, 손패의 수패 1장을 같은 숫자의 다른 무늬로 바꾼다(예: 3만 → 3통). 리치 중에도 쓸 수 있다.",
  detail:
    "(게임 내 5회) 남은 횟수는 증강 표식에 상시 표시된다. 자패는 대상이 아니고, 무엇이 무엇으로 바뀌었는지는 전원에게 공개된다(그 국 동안 가장 최근 한 번).\n\n⚠ **넉 장이 이미 전부 드러난 종류로는 물들 수 없다.** 적도라(빨간 5)를 물들이면 그 빨간색은 사라진다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(dyeAction);
    }

    // 남은 횟수 채널 동기화 — 연금술사와 같은 이유로 ROUND_STARTED가 아니라 쯔모에 건다
    // (게임 시작 드래프트는 1국 배패 뒤에 설치돼 첫 국 내내 채널이 비어 버린다).
    ctx.reaction(TILE_DRAWN, (_event, rc) => {
      const left = usesLeft(rc.state, holder);
      if (rc.state.augmentData[leftViewKey(holder)] === left) return;
      rc.emit(augmentDataSet(leftViewKey(holder), left));
    });

    ctx.holderTurnOptions((state) => {
      if (counterOf(state, usedKey(holder)) >= MAX_USES) return [];
      if (usedThisTurn(state, holder)) return []; // 한 턴에 한 번만

      const opts: { type: string; payload: { tileId: TileId; suit: NumSuit } }[] = [];
      for (const id of handIdsOf(state, holder)) {
        const k = kindOf(state, id);
        if (!isNumberSuit(k)) continue;
        for (const suit of SUITS) {
          if (suit === k.suit) continue;
          // 넉 장이 이미 다 보이는 색은 후보로도 내지 않는다 (validate와 같은 기준)
          if (visibleCopies(state, holder, { suit, rank: k.rank }) >= 4) continue;
          opts.push({ type: ACTION, payload: { tileId: id, suit } });
        }
      }
      return opts;
    });
  },
  // 수패 1장의 무늬를 바꿔 고립패를 짝·슌쯔(또는 혼일·청일)에 붙인다(게임당 5회).
  // 실제로 손이 나아지는 변경이 있을 때만 발동한다.
  bot: plan({
    intent: "advance",
    // 게임 내 5회뿐이다 — 회수할 순목이 남아 있을 때만 태운다(연금술사와 같은 이유).
    pick: ({ options, view, holder }) => {
      const kinds = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const p = o.payload as { tileId?: number; suit?: string };
        if (p.tileId === undefined || p.suit === undefined) continue;
        const orig = view.tiles[p.tileId]?.kind;
        if (orig === undefined) continue;
        const next = { suit: p.suit as typeof orig.suit, rank: orig.rank };
        if (tileSwapImproves(kinds, orig, next)) return o;
      }
      return null;
    },
  }),
});
