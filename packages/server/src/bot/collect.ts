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
  discardsZone,
  firedChannelKey,
  isHonor,
  meldsZone,
} from "@majak/core";
import type { PlayerId, PlayerView, Suit, TileKind } from "@majak/core";

/** 한 상대에 대한 "무엇을 모으는가" 읽기 */
export interface CollectRead {
  /** 이 패가 이 사람에게 몇 배 위험한가 (1 = 중립) */
  riskOf: (kind: TileKind) => number;
  /** 실점 추정에 얹을 판수 (0이면 아무것도 안 읽혔다) */
  hanBonus: number;
  /** 위협도(텐파이 확률)의 하한 — 확정 신호가 있을 때만 0보다 크다 */
  minLevel: number;
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
 * 이 사람이 무엇을 모으는지 읽는다.
 *
 * 신호가 여럿이면 배수는 곱하고 판수는 더한다 — "자패 증강을 들었고 자패를 한 장도
 * 안 버렸다"는 둘 중 하나만 있을 때보다 확실히 진한 신호다. 상한은 `RISK_CAP`.
 */
export function readCollect(view: PlayerView, player: PlayerId): CollectRead {
  const bias: Bias = { honor: 1, terminal: 1, suit: new Map(), even: 1, kinds: new Map() };
  const tags: string[] = [];
  let hanBonus = 0;
  let minLevel = 0;

  const augments = effectiveAugmentsOf(view, player);
  const av = view.augmentView;
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
    const value = av[firedChannelKey(id, fired, player)];
    let dangerSuit: string | null = null;
    let dangerKinds: string[] = [];
    if (fired.kind === "flag") {
      if (value !== true) continue;
    } else if (fired.kind === "kinds") {
      dangerKinds = kindKeysOf(value);
      if (dangerKinds.length === 0) continue; // 빈 배열 = 아직 없거나 이미 지나갔다
    } else {
      if (typeof value !== "string" || !NUMBER_SUITS.has(value)) continue;
      dangerSuit = value;
    }
    const mul = fired.riskMul ?? 1;
    switch (fired.danger) {
      case "honor":
        bias.honor *= mul;
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
    hanBonus += fired.hanBonus ?? 0;
    if (fired.minLevel !== undefined) minLevel = Math.max(minLevel, fired.minLevel);
    tags.push(dangerSuit !== null ? `${id}:${dangerSuit}` : id);
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

  const discards = discardKindsOf(view, player);
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
    minLevel = Math.max(minLevel, 0.3);
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
      return m;
    },
    hanBonus,
    minLevel,
    tags,
  };
}
