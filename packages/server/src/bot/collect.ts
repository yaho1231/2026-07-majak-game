/**
 * collect — **이 사람은 무엇을 모으고 있는가.**
 *
 * ## 무엇이 비어 있었나
 *
 * 봇의 수비는 여태 `level × tileRisk × value` 였고, 그 안에서 상대 증강이 들어가는
 * 자리는 **`value`에 곱하는 스칼라 하나**뿐이었다(`augmentThreatMultiplier`). 스칼라는
 * "이 사람에게 쏘면 얼마나 비싼가"만 말한다. 정작 필요한 것은 **어느 패가 비싼가**다.
 *
 * 2026-08-18 사용자 보고가 그 구멍을 정확히 찔렀다 — 사람이 **개벽**을 쓰자 손패가
 * 통째로 자패가 됐는데, 봇 셋은 아무 일 없다는 듯 東·南·白을 계속 흘려 **자일색 +
 * 대사희(더블 역만)** 를 헌납했다. 봇이 본 것은 "리치도 후로도 없는 조용한 상대"였고,
 * 자패는 원래 안전패 취급을 받는 패다. 사람이라면 손패가 전부 자패로 바뀌는 것을
 * 눈앞에서 보고 그 뒤로는 자패를 절대 안 흘린다.
 *
 * ## 무엇을 보는가 — 전부 공개 정보다
 *
 * 정보 비대칭은 건드리지 않는다. 여기서 읽는 것은 넷이 다 볼 수 있는 것뿐이다.
 *
 *  1. **증강 공개 채널**(`view.augmentView`) — 개벽이 터졌다, 단색 세계가 어느 색을
 *     골랐다, 거신병이 국사를 손에 넣었다. 전부 화면에 배너로 뜨는 사건이다.
 *  2. **보유 증강**(`PlayerInfo.augments`) — 표(`AUGMENT_PLAY.collect`)에 "이걸 든
 *     사람은 이 분류를 모은다"고 적힌 것들. 국사 계열·삼원의 의지.
 *  3. **버림패와 후로** — 자패를 한 장도 안 흘린다, 후로가 전부 자패다. 증강이 없어도
 *     성립하는 순수 마작 쪽 읽기다(혼일색의 '안 버리는 색' 읽기와 같은 종류).
 *
 * ## 무엇을 내놓는가
 *
 * 셋이다. **어느 패가 몇 배 위험한가**(`riskOf`), **얼마나 비싼 손인가**(`hanBonus`),
 * 그리고 **위협도의 하한**(`minLevel`). 셋을 나눠 놓은 이유는 각각 다른 축이기 때문이다 —
 * 배수를 `level`에 곱하면 있지도 않은 텐파이를 만들어 내고, 판수를 `tileRisk`에 곱하면
 * 안전패까지 무서워진다(`danger.ts`가 오래 지켜 온 규율).
 *
 * `minLevel`이 필요한 이유: 개벽을 쓴 사람은 리치도 후로도 없어 `level`이 다마텐
 * 어림값(0.1 남짓)에 머문다. 배수를 아무리 키워도 0.1을 곱하면 기대 실점이 작아
 * 봇은 그냥 민다. **손패가 통째로 자패가 된 것을 봤다**는 것 자체가 텐파이 확률에
 * 대한 정보이므로 하한을 올린다.
 */

import {
  augmentCollectHints,
  augmentFiredReads,
  augmentFuritenBreakReads,
  augmentRonImmuneReads,
  augmentTableRuleReads,
  augmentTargetingReads,
  augmentWideWaits,
  discardsZone,
  firedChannelKey,
  isHonor,
  meldsZone,
} from "@majak/core";
import type { AugmentFired, PlayerId, PlayerView, Suit, TileKind } from "@majak/core";

/** 한 상대에 대한 "무엇을 모으는가" 읽기 */
export interface CollectRead {
  /** 이 패가 이 사람에게 몇 배 위험한가 (1 = 중립) */
  riskOf: (kind: TileKind) => number;
  /** 실점 추정에 얹을 판수 (0이면 아무것도 안 읽혔다) */
  hanBonus: number;
  /** 위협도(텐파이 확률)의 하한 — 확정 신호가 있을 때만 0보다 크다 */
  minLevel: number;
  /**
   * **그 사람이 텐파이라면 이 패가 오름패일 확률** — 발동이 대기의 범위를 못 박은
   * 분류에만 있다(개벽 = 자패, 거신병 = 요구패). 없으면 undefined.
   *
   * 봇의 방총 확률은 `tileRisk × DEAL_IN_SCALE(0.11)`이고, 그 눈금은 리치의 무스지
   * 중장패(6%)에 맞춰져 있다. 자패는 상한이 1이라 아무리 배수를 얹어도 **11%**가 끝인데,
   * 열세 장이 전부 자패인 손의 대기는 자패 두어 종이라 살아 있는 자패 하나를 흘리면
   * 일곱 종 중 둘, 3할 언저리다. 그 3배 차이를 배수로는 못 메운다(상한에 막힌다) —
   * 그래서 이 분류는 상대 눈금을 거치지 않고 **확률을 직접** 준다.
   */
  dealInOf?: (kind: TileKind) => number | undefined;
  /** 무엇을 읽었는가 — 테스트와 로그가 읽는다 */
  tags: string[];
}

/** 아무것도 안 읽혔을 때 */
export const NEUTRAL_COLLECT: CollectRead = {
  riskOf: () => 1,
  hanBonus: 0,
  minLevel: 0,
  tags: [],
};

/**
 * 배수의 상한 — 신호가 겹쳐도 여기까지다.
 *
 * 자패의 기본 위험은 0.3이고 `tileRisk`가 1로 자른다. 2.8이면 남은 장수가 넉넉한
 * 자패가 0.84까지 올라 **리치의 무스지 중장패보다 위험**해진다. 그 이상은 의미가
 * 없고(어차피 잘린다) 신호가 겹칠 때 판단만 극단으로 민다.
 */
const RISK_CAP = 2.8;

/**
 * 개벽처럼 **손이 통째로 자패가 된** 사람에게 수패가 얼마나 안전한가 (수패 위험 배수).
 *
 * 0으로 두지 않는다 — 뒤집힐 때 남은 수패 두어 장으로 단기·샤보가 설 수 있고, 다른 두
 * 색을 "안전하다고 지우는 것은 언제나 더 위험하다"(단색 세계 주석). 0.5면 수패의
 * 기대 실점이 자패의 1/5 아래로 내려가 「자패 하나만 내면 그 뒤는 편하다」가 계산에
 * 잡힌다.
 */
const HONOR_HAND_NUMBER_DISCOUNT = 0.5;

const NUMBER_SUITS: ReadonlySet<string> = new Set<Suit>(["man", "pin", "sou"]);
const isTerminal = (k: TileKind): boolean =>
  isHonor(k) || (NUMBER_SUITS.has(k.suit) && (k.rank === 1 || k.rank === 9));

/** 이 사람의 버림패 (버린 순서) */
function discardKindsOf(view: PlayerView, player: PlayerId): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[discardsZone(player)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/** 이 사람이 눕힌 패 */
function meldKindsOf(view: PlayerView, player: PlayerId): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[meldsZone(player)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/** 누적기 — 분류별 배수를 곱해 모은다 */
interface Bias {
  honor: number;
  terminal: number;
  suit: Map<string, number>;
  /** 짝수 수패 (짝수의 세계) */
  even: number;
  /**
   * **수패 전체**에 곱하는 할인 (1 = 중립). 손이 통째로 자패가 된 사람(개벽)에게 수패는
   * 거의 안전하다 — 남아 있던 수패 두어 장으로만 대기가 설 수 있다. 사람은 개벽 컷인을
   * 본 뒤 수패를 거의 현물처럼 낸다. 이걸 안 깎으면 "자패 한 장만 내면 끝"인 손에서
   * 뒤에 남은 수패까지 위험패로 세어 지평(`discard.pushHorizonOf`)이 줄지 않는다.
   */
  numbers: number;
  /** **바로 그 패**들 (오픈 리치의 공개 대기, 자패의 귀환이 되받은 자패 …) */
  kinds: Map<string, number>;
}

/**
 * 공개 채널에 실린 패 목록을 `kindKey` 집합으로 읽는다.
 * 채널마다 모양이 다르다 — `kindKey` 문자열 배열(오픈 리치)일 수도, `TileKind`
 * 객체 배열(자패의 귀환·미련)일 수도 있다. 둘 다 받는다.
 * 빈 배열은 "아직/이미 없음"이므로 신호가 아니다.
 */
function kindKeysOf(value: unknown): string[] {
  // 한 종류만 싣는 채널(소환의 지목패)은 배열이 아니라 문자열 하나다
  if (typeof value === "string") return value === "" ? [] : [value];
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") out.push(entry);
    else if (entry !== null && typeof entry === "object") {
      const k = entry as { suit?: unknown; rank?: unknown };
      if (typeof k.suit === "string" && typeof k.rank === "number") {
        out.push(`${k.suit}${k.rank}`);
      }
    }
  }
  return out;
}

/**
 * 이 사람이 **지금 실제로 쓸 수 있는** 증강 목록.
 *
 * 무장해제(disarm)는 상대 증강 하나를 그 국 동안 통째로 잠근다. 그런데 잠긴 증강도
 * `PlayerInfo.augments`에는 그대로 남아 있어, 봇은 **이미 꺼진 물건을 국이 끝날 때까지
 * 무서워했다** — 만년 오야를 잠가 놓고도 그 사람 손을 1.4배로 세는 식이다.
 * 지목 관계는 전원 공개 채널(`disarm:{시전자}` = {target, augmentId})이라 그대로 읽는다.
 */
export function effectiveAugmentsOf(view: PlayerView, player: PlayerId): string[] {
  const augments = view.players.find((p) => p.id === player)?.augments ?? [];
  const locked = new Set<string>();
  for (const p of view.players) {
    const mark = view.augmentView[`disarm:${p.id}`] as
      | { target?: unknown; augmentId?: unknown }
      | undefined;
    if (mark === undefined || mark === null) continue;
    if (mark.target === player && typeof mark.augmentId === "string") {
      locked.add(mark.augmentId);
    }
  }
  return locked.size === 0 ? [...augments] : augments.filter((id) => !locked.has(id));
}

/**
 * 이 국의 **방총 지분** — 내가 쏴도 실제로 내 지갑이 열릴 몫 (1 = 표준).
 *
 * 눈먼 총알이 켜진 국에는 론의 지불자가 무작위로 다시 정해져 0.25가 된다. 나머지
 * 3/4은 내가 무엇을 버리든 똑같이 걸리는 몫이라 **버림 선택과 무관**하다 — 그래서
 * 판단에 들어가는 것은 내 몫뿐이다.
 *
 * 테이블 전체에 걸리는 규칙이라 상대별이 아니라 **판 단위**로 읽는다(누가 들었든
 * 켜져 있으면 전원에게 적용된다).
 */
export function readDealInShare(view: PlayerView): number {
  let share = 1;
  for (const p of view.players) {
    for (const { id, rule } of augmentTableRuleReads(effectiveAugmentsOf(view, p.id))) {
      if (channelOn(view, p.id, id, rule)) share = Math.min(share, rule.dealInShare);
    }
  }
  return share;
}

/**
 * **지목형 증강**이 이 사람에게 건 것 — 지목 관계는 전원 공개다.
 *
 * @param player 판정 대상(지목당했는지 볼 사람)
 * @returns 그 사람 실점 추정에 얹을 판수와, 그 사람이 **나**일 때의 위험 선호 보정
 */
export function readTargeting(
  view: PlayerView,
  player: PlayerId,
): { hanBonus: number; appetite: number; tags: string[] } {
  let hanBonus = 0;
  let appetite = 0;
  const tags: string[] = [];
  for (const caster of view.players) {
    for (const { id, targeting } of augmentTargetingReads(effectiveAugmentsOf(view, caster.id))) {
      const raw = view.augmentView[firedChannelKey(id, targeting, caster.id)];
      if (raw === undefined || raw === null) continue;
      const target =
        targeting.targetField === undefined
          ? raw
          : (raw as Record<string, unknown>)[targeting.targetField];
      if (target !== player) continue;
      hanBonus += targeting.oppHanBonus ?? 0;
      appetite += targeting.selfAppetite ?? 0;
      tags.push(`${id}:targeted`);
    }
  }
  return { hanBonus, appetite, tags };
}

/** 공개 채널 하나가 "지금 켜져 있는가" (`ronImmune`·`furitenBroken` 공용 규약) */
function channelOn(
  view: PlayerView,
  player: PlayerId,
  id: string,
  spec: { channel?: string; when: "present" | "true" },
): boolean {
  const value = view.augmentView[firedChannelKey(id, spec, player)];
  return spec.when === "true" ? value === true : value !== undefined && value !== null;
}

/**
 * 이 사람을 **지금 론할 수 없는가**(천하무적·불가침 조약).
 *
 * 그렇다면 내가 무엇을 버리든 그에게는 방총이 성립하지 않는다 — 안전패를 아껴 두는
 * 것은 순수한 낭비이고, 그 국은 밀어야 한다.
 */
export function isRonImmune(view: PlayerView, player: PlayerId): boolean {
  return augmentRonImmuneReads(effectiveAugmentsOf(view, player)).some(({ id, immune }) =>
    channelOn(view, player, id, immune),
  );
}

/**
 * 이 사람에게 **현물이 안전패가 아닌가**(만개·조커·손바닥 뒤집기).
 *
 * 봇 수비의 첫 기둥이 "그가 버린 패로는 론이 안 된다"인데, 그 가정을 부수는 증강이
 * 있다. 가정이 틀린 줄 모르면 봇은 **위험도 0으로 확신한 패**를 흘린다.
 */
export function isFuritenBroken(view: PlayerView, player: PlayerId): boolean {
  return augmentFuritenBreakReads(effectiveAugmentsOf(view, player)).some(({ id, spec }) =>
    channelOn(view, player, id, spec),
  );
}

/**
 * 발동 공개 채널 하나를 읽는다 — **지금 켜져 있는가**, 켜져 있으면 무엇이 실려 있는가.
 *
 * `readCollect`와 `OpponentMemory`(발동을 처음 본 순을 기억한다)가 **같은 판정**을 써야
 * 한다. 한쪽은 켜졌다고 보고 다른 쪽은 아니라고 보면 "본 지 몇 순인가"가 어긋난다.
 *
 * @returns 꺼져 있으면 null. 켜져 있으면 무늬(`suit`)·패 목록(`kinds`)·아무것도 안
 *   짚는 플래그(`{}`) 중 하나.
 */
export function firedSignalOf(
  view: PlayerView,
  player: PlayerId,
  id: string,
  fired: AugmentFired,
): { suit?: string; kinds?: string[] } | null {
  const value = view.augmentView[firedChannelKey(id, fired, player)];
  if (fired.kind === "flag") return value === true ? {} : null;
  if (fired.kind === "kinds") {
    const kinds = kindKeysOf(value);
    return kinds.length === 0 ? null : { kinds }; // 빈 배열 = 아직 없거나 이미 지나갔다
  }
  if (typeof value !== "string" || !NUMBER_SUITS.has(value)) return null;
  return { suit: value };
}

/**
 * **발동을 처음 본 순간**의 기록 (`OpponentMemory.firedSightOf`).
 *
 * 채널은 "켜져 있다"만 말하고 **언제부터**인지는 말하지 않는다. 그런데 사람은 그걸
 * 안다 — 개벽 컷인이 뜬 것이 방금인지 여섯 순 전인지. 방금 뒤집힌 열세 장은 뒤죽박죽이고
 * 여섯 순 다듬은 손은 텐파이 근처다. 봇도 그 차이를 알아야 한다.
 */
export interface FiredSight {
  /** 처음 본 순목 (`view.round.turnCount`) */
  turn: number;
  /** 그때 그 사람 바닥의 장수 — 그 뒤로 버린 것이 "발동 후 버림"이다 */
  riverLen: number;
}

/**
 * `readCollect`에 얹는 문맥 — 없으면 전부 기본값이라 종전과 한 글자도 다르지 않다.
 */
export interface CollectContext {
  /**
   * 0(확인된 것만 믿는다) ~ 1(신호를 액면대로 받는다) — `profile.credence`.
   * 아래 `credenceScale` 참고. 기본 0.5 = 표의 값 그대로.
   */
  credence?: number;
  /** 이 사람의 그 증강 발동을 **언제 처음 봤는가** (기억이 없으면 undefined) */
  sightOf?: (augmentId: string) => FiredSight | undefined;
}

/**
 * **신호를 얼마나 믿는가**가 텐파이 하한에 곱하는 저울 (0.7 ~ 1.3).
 *
 * 개벽이 터졌다는 것은 사실이지만 "그래서 지금 자일색 텐파이다"는 **추정**이다.
 * 사람마다 그 추정을 받는 태도가 다르다 — "그거 안 나와" 하고 자기 손을 미는 사람과
 * "역만 신호에 자패는 절대 안 낸다"는 사람.
 *
 * **확률에만 곱하고 값어치에는 안 곱한다.** 태도가 바꾸는 것은 "지금 텐파이일 것
 * 같은가"이지 "쏘이면 얼마인가"가 아니다 — 자일색은 누가 봐도 역만이다. 둘 다에
 * 곱하면 같은 태도를 두 번 세어(확률 × 실점) 수비형이 만관 텐파이까지 접는다.
 * 오픈 리치의 공개 대기처럼 **사실**인 것에는 아예 곱하지 않는다.
 *
 * 분기가 아니라 저울이다(`bot/profile.ts`의 규율). 0.5에서 정확히 1이라 균형형과
 * 문맥 없는 호출은 표의 값 그대로다.
 */
export function credenceScale(credence: number | undefined): number {
  const c = credence === undefined ? 0.5 : Math.max(0, Math.min(1, credence));
  return 0.7 + 0.6 * c;
}

/**
 * **발동 뒤 몇 순 지났는가**가 텐파이 하한에 곱하는 익음 정도 (0.4 ~ 1).
 *
 * 개벽 직후의 열세 장은 무작위 자패 더미다 — 대개 2~3샹텐이다. 그걸 다듬어 텐파이에
 * 가는 데 몇 순이 걸린다. 그래서 하한은 본 순간 바닥(0.4)에서 시작해 `RIPEN_TURNS`
 * 순에 걸쳐 표의 값까지 자란다. **기억이 없으면 1** — 언제부터인지 모르면 익었다고
 * 보는 쪽이 안전하다(덜 무서워하는 오차는 방총으로 갚는다).
 */
export function ripeness(sight: FiredSight | undefined, turn: number): number {
  if (sight === undefined) return 1;
  const age = Math.max(0, turn - sight.turn);
  return RIPE_FLOOR + (1 - RIPE_FLOOR) * Math.min(1, age / RIPEN_TURNS);
}
const RIPE_FLOOR = 0.4;
const RIPEN_TURNS = 5;

/** 보이는 모든 곳의 종류별 장수 — 내 손·전원 바닥·전원 후로·도라 표시패 */
function visibleCounts(view: PlayerView): Map<string, number> {
  const seen = new Map<string, number>();
  const bump = (id: number | undefined): void => {
    const tile = id === undefined ? undefined : view.tiles[id];
    if (tile === undefined || tile.attrs.conjured === true) return;
    const key = `${tile.kind.suit}${tile.kind.rank}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  };
  for (const zone of Object.values(view.zones)) {
    if (zone.kind === "wall" || zone.kind === "deadWall") continue;
    for (const id of zone.tileIds) bump(id);
  }
  for (const id of view.round.doraIndicators) bump(id);
  return seen;
}

const HONOR_KEYS: readonly string[] = [
  "wind1", "wind2", "wind3", "wind4", "dragon1", "dragon2", "dragon3",
];
const YAOCHU_KEYS: readonly string[] = [
  ...HONOR_KEYS,
  "man1", "man9", "pin1", "pin9", "sou1", "sou9",
];

/**
 * **그 손이 아직 성립하는가** — 발동 신호의 판수 보너스에 곱하는 실현 가능성 (0.2 ~ 1).
 *
 * 표의 판수(개벽 +8 = 자일색·대사희급)는 **최선의 경우**다. 사람은 거기서 셈을 시작해
 * 보이는 것으로 깎는다 — "東은 석 장 나왔고 저 사람이 발동 뒤 白·發을 버렸으니
 * 자일색은 물 건너갔다, 남은 건 혼일색 아니면 역패." 봇도 같은 셈을 한다.
 *
 * - **자패**(개벽): 자일색은 자패 **다섯 종**이 필요하다(몸통 넷 + 머리). 밖에 석 장
 *   이상 보이는 종류와 그 사람이 발동 뒤 버린 종류는 못 쓴다. 살아 있는 종류가 5 미만이면
 *   자일색은 없다 — 남는 것은 혼일색·소사희·역패라 0으로 두지 않는다.
 * - **요구패**(거신병 = 국사): 열세 종이 **전부** 필요하다. 어느 한 종이 밖에 넉 장 다
 *   보이면 끝이다(왕의 징표를 함께 든 사람은 예외). 발동 뒤 요구패를 둘 이상 버렸다면
 *   국사를 쥔 사람의 버림이 아니다.
 * - **한 색**(단색 세계·편식): 청일색은 그 색 열넷이 필요하다. 밖에 그 색이 스물 넘게
 *   보이면 그 사람 손에 열셋이 다 그 색일 수는 없다.
 *
 * 여기 안 걸리는 분류(짝수·특정 패)는 1이다.
 */
function feasibilityOf(
  view: PlayerView,
  player: PlayerId,
  augments: readonly string[],
  danger: AugmentFired["danger"],
  dangerSuit: string | null,
  thrownSinceFire: readonly TileKind[],
): { feas: number; live: ReadonlySet<string> } {
  const seen = visibleCounts(view);
  const count = (key: string): number => seen.get(key) ?? 0;
  const thrown = new Set(thrownSinceFire.map((k) => `${k.suit}${k.rank}`));
  switch (danger) {
    case "honor": {
      const live = new Set(HONOR_KEYS.filter((k) => count(k) <= 2 && !thrown.has(k)));
      const n = live.size;
      return { feas: n >= 5 ? 1 : n === 4 ? 0.6 : n === 3 ? 0.35 : 0.2, live };
    }
    case "terminal": {
      const royal = augments.includes("royal_kokushi");
      const live = new Set(YAOCHU_KEYS.filter((k) => count(k) < 4 && !thrown.has(k)));
      if (!royal && live.size < YAOCHU_KEYS.length) return { feas: 0.2, live };
      const thrownYaochu = thrownSinceFire.filter(
        (k) => isHonor(k) || k.rank === 1 || k.rank === 9,
      ).length;
      return { feas: thrownYaochu >= 2 ? 0.4 : 1, live };
    }
    case "channelSuit": {
      const live = new Set<string>();
      if (dangerSuit === null) return { feas: 1, live };
      let outside = 0;
      for (let r = 1; r <= 9; r++) outside += count(`${dangerSuit}${r}`);
      return { feas: outside >= 23 ? 0.2 : outside >= 19 ? 0.6 : 1, live };
    }
    default:
      return { feas: 1, live: new Set() };
  }
}

/**
 * **텐파이라면 이 패가 오름패일 확률** — 대기의 범위가 못 박힌 분류에서.
 *
 * - 자패 손(개벽): 대기는 샤보(두 종)거나 단기(한 종)라 평균 1.6종이고, 후보는 살아 있는
 *   자패 종류 전부다. → 살아 있는 종류 하나에 `1.6 / 살아 있는 종수`, 상한 0.5. 일곱 종이
 *   다 살아 있으면 0.23 — 리치 무스지(6%)의 네 배쯤이고, 그게 사람의 체감이다.
 * - 국사(거신병): 열세 종 중 한 종 대기(13면이면 전부)다. → 살아 있는 요구패 하나에 0.2.
 *
 * 밖에 다 보이거나 본인이 버린 종류는 undefined — 상대 눈금(남은 장수 셈)에 맡긴다.
 */
function pinnedDealIn(
  danger: AugmentFired["danger"],
  live: ReadonlySet<string>,
  feas: number,
): ((kind: TileKind) => number | undefined) | undefined {
  if (live.size === 0) return undefined;
  const of = (kind: TileKind): number | undefined => {
    if (!live.has(`${kind.suit}${kind.rank}`)) return undefined;
    if (danger === "honor") return Math.min(0.5, 1.6 / live.size);
    if (danger === "terminal") return 0.2 * feas;
    return undefined;
  };
  return of;
}

/**
 * 이 사람이 무엇을 모으는지 읽는다.
 *
 * 신호가 여럿이면 배수는 곱하고 판수는 더한다 — "자패 증강을 들었고 자패를 한 장도
 * 안 버렸다"는 둘 중 하나만 있을 때보다 확실히 진한 신호다. 상한은 `RISK_CAP`.
 */
export function readCollect(
  view: PlayerView,
  player: PlayerId,
  ctx: CollectContext = {},
): CollectRead {
  const bias: Bias = {
    honor: 1,
    terminal: 1,
    suit: new Map(),
    even: 1,
    kinds: new Map(),
    numbers: 1,
  };
  const tags: string[] = [];
  let hanBonus = 0;
  let minLevel = 0;
  const pinned: ((kind: TileKind) => number | undefined)[] = [];
  /**
   * 텐파이 **하한**에만 곱하는 저울 (`credenceScale`). 실점 추정(판수)에는 곱하지
   * 않고, "바로 그 패"(오픈 리치 공개 대기)처럼 사실인 것에도 곱하지 않는다.
   */
  const trust = credenceScale(ctx.credence);
  const turn = view.round.turnCount;

  const augments = effectiveAugmentsOf(view, player);
  const av = view.augmentView;
  const river = discardKindsOf(view, player);
  const suitMul = (suit: string, m: number): void => {
    bias.suit.set(suit, (bias.suit.get(suit) ?? 1) * m);
  };

  // ── 1. 증강이 실제로 터진 것 — 화면에 배너로 뜬 사건이다 ──

  /*
   * 무엇을 얼마나 무서워할지는 **코어의 표**(`AUGMENT_PLAY.fired`)가 정하고, 여기서는
   * 뷰를 읽어 적용만 한다. 예전에는 증강마다 if 블록이 하나씩 붙어 있었는데, 그 방식은
   * 종수가 늘수록 무너진다(차터 §1: 증강 1000개를 엔진 수정 없이). 지금은 새 증강이
   * 들어와도 이 함수는 그대로다 — 표에 행 하나가 는다.
   *
   * 이 판정이 '보유'가 아니라 '발동'인 것이 요점이다. 개벽을 **들고만 있는** 사람은
   * 평범한 손이라 자패를 무서워할 이유가 없고, **쓴** 사람의 손은 통째로 자패다.
   */
  for (const { id, fired } of augmentFiredReads(augments)) {
    const signal = firedSignalOf(view, player, id, fired);
    if (signal === null) continue;
    const dangerSuit = signal.suit ?? null;
    const dangerKinds = signal.kinds ?? [];
    /*
     * **언제 터졌고, 그 뒤로 어떻게 됐는가.** 표는 최선의 경우를 적어 두었고, 여기서
     * 보이는 것으로 깎는다 — 발동 직후는 아직 뒤죽박죽이고(`ripeness`), 밖에 다 나온
     * 종류와 본인이 버린 종류로는 그 손이 안 선다(`feasibilityOf`). 그래서 같은 개벽이라도
     * 3순째 본 것과 9순째 본 것, 東이 넉 장 다 보이는 판과 아닌 판의 대응이 다르다.
     * "바로 그 패"는 확정이라 깎지 않는다.
     */
    const sight = ctx.sightOf?.(id);
    const thrown = sight === undefined ? [] : river.slice(sight.riverLen);
    const exact = fired.danger === "channelKinds";
    const feasRead = feasibilityOf(view, player, augments, fired.danger, dangerSuit, thrown);
    const feas = exact ? 1 : feasRead.feas;
    const ripe = exact ? 1 : ripeness(sight, turn);
    const pin = pinnedDealIn(fired.danger, feasRead.live, feas);
    if (pin !== undefined) pinned.push(pin);
    const belief = exact ? 1 : trust;
    // 배수는 "무엇을 모으는가"라 실현 가능성만 살짝 탄다 — 자일색이 없어도 자패는 모은다
    const mul = 1 + ((fired.riskMul ?? 1) - 1) * (0.6 + 0.4 * feas);
    switch (fired.danger) {
      case "honor":
        bias.honor *= mul;
        // 손이 통째로 자패다 — 수패로는 대기가 거의 안 선다 (다른 신호가 겹치면 더 진한 쪽)
        bias.numbers = Math.min(bias.numbers, HONOR_HAND_NUMBER_DISCOUNT);
        break;
      case "terminal":
        bias.terminal *= mul;
        break;
      case "even":
        bias.even *= mul;
        break;
      case "channelSuit":
        if (dangerSuit !== null) suitMul(dangerSuit, mul);
        break;
      case "channelKinds":
        for (const key of dangerKinds) {
          bias.kinds.set(key, (bias.kinds.get(key) ?? 1) * mul);
        }
        break;
      default:
        break; // 패를 짚지 않는 신호 — 판수·하한만 얹는다
    }
    hanBonus += (fired.hanBonus ?? 0) * feas;
    if (fired.minLevel !== undefined) {
      // 자일색이 없어도 혼일색 텐파이일 수는 있다 — 하한은 실현 가능성에 반만 기댄다
      const floor = fired.minLevel * ripe * (0.5 + 0.5 * feas) * belief;
      minLevel = Math.max(minLevel, floor);
    }
    tags.push(dangerSuit !== null ? `${id}:${dangerSuit}` : id);
    if (feas < 1) tags.push(`${id}:feas:${feas.toFixed(2)}`);
    if (ripe < 1) tags.push(`${id}:ripe:${ripe.toFixed(2)}`);
  }

  /*
   * **편식의 퀘스트 예고**(picky_eater) — 발동 자체는 위 표가 읽는다(물든 색).
   * 그 **전**에도 읽을 것이 있어서 여기 따로 남는다: 12장 중 몇 장을 채웠는지가
   * 국의 절반 동안 전원에게 공개된다. 이 증강의 설계가 "대응 시간이 아주 길다"는
   * 것인데(그 파일 Rule #4) 봇은 그 예고를 한 번도 안 봤다.
   *
   * ⚠ 위험한 **패**를 짚지는 않는다 — 아직 어느 색이 될지는 본인도 안 정했다.
   * 표의 규약(채널 하나 = 값 하나)으로는 표현되지 않는 모양이라 코드로 남긴다.
   */
  if (av[`picky_eater:${player}`] === undefined) {
    const progress = av[`picky_eater:progress:${player}`] as
      | { count?: number; need?: number; failed?: boolean }
      | null
      | undefined;
    const need = progress?.need ?? 12;
    const count = progress?.count ?? 0;
    if (progress != null && progress.failed !== true && count >= need - 4) {
      hanBonus += 4;
      tags.push(`picky_quest:${count}/${need}`);
    }
  }

  /*
   * **대기가 표준보다 넓은 상대** (표: `AUGMENT_PLAY.wideWaits`).
   *
   * 스지·벽 계산은 "슌쯔는 같은 무늬 연속, 커쯔는 같은 패"라는 모양의 전제 위에 서
   * 있다. 그 전제를 넓히는 증강을 든 사람에게는 같은 스지라도 지워지는 대기가 적다 —
   * 수패 위험 전체를 조금 올려 그 미더움의 차이를 메운다.
   * (현물은 안 건드린다 — 후리텐은 그대로라 여전히 100%다.)
   */
  const wide = augmentWideWaits(augments);
  if (wide > 1) tags.push(`wide_waits:${wide.toFixed(2)}`);

  /*
   * **지목당한 상대** — 격에 걸린 사람이 이기면 그것은 반드시 만관 이상이다.
   * (지목 관계는 전원 공개라 봇이 그대로 읽는다.)
   */
  const targeted = readTargeting(view, player);
  if (targeted.hanBonus > 0) {
    hanBonus += targeted.hanBonus;
    tags.push(...targeted.tags);
  }

  // ── 2. 보유만으로도 방향이 보이는 증강 (표: AUGMENT_PLAY.collect) ──
  // 아직 안 터졌으므로 약하게 잡는다. 그래도 0은 아니다 — 국사 증강을 든 사람에게
  // 요구패를 아무 생각 없이 흘리는 것은 사람도 안 하는 일이다.
  for (const hint of augmentCollectHints(augments)) {
    if (hint === "honor") {
      bias.honor *= 1.35;
      hanBonus += 1.5;
      tags.push("aug:honor");
    } else {
      bias.terminal *= 1.35;
      hanBonus += 1.5;
      tags.push("aug:terminal");
    }
  }

  // ── 3. 버림패·후로 읽기 — 증강이 없어도 성립하는 순수 마작 쪽 ──

  const discards = river;
  const melds = meldKindsOf(view, player);

  /*
   * **자패를 한 장도 안 버린다.**
   *
   * 보통은 자패가 가장 먼저 나간다 — 슌쯔가 안 되고 역패가 아니면 쓸 데가 없다.
   * 여덟 장을 버리는 동안 자패가 한 장도 안 나왔다면 손에 쌓이고 있다고 보는 것이
   * 자연스럽다. 혼일색의 '안 버리는 색' 읽기(`danger.missingSuitRead`)와 같은 논리를
   * 자패에 적용한 것이다.
   *
   * 표본이 적으면 그냥 안 뽑혔을 뿐이라 여덟 장부터 읽고, 열두 장이면 더 세게 본다.
   */
  const honorDiscards = discards.filter(isHonor).length;
  if (honorDiscards === 0 && discards.length >= 8) {
    const thick = discards.length >= 12;
    bias.honor *= thick ? 1.8 : 1.5;
    hanBonus += thick ? 2.5 : 1.5;
    tags.push(thick ? "no-honor-discard:12" : "no-honor-discard:8");
  }

  /*
   * **눕힌 것이 전부 자패다.** 자패 커쯔 둘이면 소사희·대사희·대삼원이 눈앞이고,
   * 무엇보다 그 손은 **자패 한 장에 완성된다**. 후로가 있으니 위협도도 따로 잡힌다.
   */
  if (melds.length >= 6 && melds.every(isHonor)) {
    bias.honor *= 1.9;
    hanBonus += 3;
    minLevel = Math.max(minLevel, 0.3 * trust);
    tags.push("honor-melds");
  }

  const clamp = (m: number): number => Math.min(RISK_CAP, m);
  const honor = clamp(bias.honor);
  const terminal = clamp(bias.terminal);
  const even = clamp(bias.even);
  const suit = new Map<string, number>();
  for (const [s, m] of bias.suit) suit.set(s, clamp(m));
  const kinds = new Map<string, number>();
  for (const [k, m] of bias.kinds) kinds.set(k, clamp(m));

  if (tags.length === 0) return NEUTRAL_COLLECT;

  return {
    riskOf: (kind) => {
      // 요구패 읽기는 자패에도 걸린다 — 둘 다 걸리면 더 진한 쪽 하나만 쓴다.
      // 곱하면 국사 증강 + 자패 무버림에서 같은 자패를 두 번 무서워한다.
      let m = 1;
      if (isHonor(kind)) m = Math.max(honor, terminal);
      else if (isTerminal(kind)) m = terminal;
      const s = suit.get(kind.suit);
      if (s !== undefined) m = Math.max(m, s);
      // 홀짝 읽기도 겹치면 더 진한 쪽 하나만 쓴다 (곱하면 같은 패를 두 번 무서워한다)
      if (NUMBER_SUITS.has(kind.suit) && kind.rank % 2 === 0) m = Math.max(m, even);
      // **바로 그 패**로 지목된 것은 언제나 가장 진한 신호다 (추정이 아니라 확정)
      const exact = kinds.get(`${kind.suit}${kind.rank}`);
      if (exact !== undefined) m = Math.max(m, exact);
      // 대기가 넓은 상대에게는 수패 전체가 조금씩 더 위험하다 (곱한다 — 다른 축이다)
      if (NUMBER_SUITS.has(kind.suit)) m *= wide;
      // 손이 통째로 자패인 사람에게 수패는 거의 안전하다 — 단, 그 색·짝수를 따로 짚는
      // 신호가 겹쳐 m이 이미 1을 넘었으면 그 신호가 이긴다
      if (NUMBER_SUITS.has(kind.suit) && m <= 1) m *= bias.numbers;
      return Math.min(RISK_CAP, m);
    },
    hanBonus,
    minLevel,
    tags,
    ...(pinned.length === 0
      ? {}
      : {
          dealInOf: (kind: TileKind): number | undefined => {
            let best: number | undefined;
            for (const pin of pinned) {
              const p = pin(kind);
              if (p !== undefined && (best === undefined || p > best)) best = p;
            }
            return best;
          },
        }),
  };
}
