/**
 * danger — "지금 이 패를 버리면 쏘이는가"를 읽는다 (베타오리의 근거).
 *
 * 2026-07-29 이전의 봇에는 **수비 개념이 아예 없었다.** 상대가 리치를 걸든 말든 자기
 * 효율만 보고 버려서, 사람 눈에는 "생각 없이 밀어대는 기계"로 보였다. 사람이 실제로
 * 쓰는 근거는 전부 공개 정보(버림패·후로·도라 표시패)만으로 계산되고, 안전한 순서대로
 * 늘어놓으면 이렇게 된다.
 *
 *  1. **현물(現物)** — 그 사람이 이미 버린 패는 론이 안 된다(후리텐). 100% 안전.
 *  2. **통과패** — 리치 이후 남이 버렸는데 그 사람이 론하지 않은 패. 역시 100%다.
 *  3. **스지(筋)** — 4가 버려졌으면 1·7의 량면 대기가 없다. **량면만** 지워진다.
 *  4. **벽(카베)** — 량면·간짱의 재료가 이미 다 보이면 그 대기는 존재할 수 없다.
 *  5. **무스지** — 아무것도 못 지운 패.
 *  6. **도라 근처** — 스지라도 상대가 붙들고 있을 이유가 있는 자리다.
 *
 * 3~4를 **상수 곱셈이 아니라 대기형별 셈**으로 하는 것이 요점이다(`bot/suji.ts`) —
 * 스지가 지우는 것도 량면이고 벽이 지우는 것도 량면이라, 곱해 버리면 같은 것을 두 번
 * 지운다. 지금은 량면 자리 하나하나를 세워 놓고 지워진 자리만 뺀다. 그래서 샤보·간짱·
 * 단기 몫이 언제나 남고, **스지 하나로 안전을 단정하는 일이 구조적으로 일어나지 않는다.**
 *
 * 여기에 "이 상대가 얼마나 위험한가"(리치 · 후로 수 · 진행 순목)를 곱해 0~1 위험도를 낸다.
 * 정확한 대기 추정이 아니라 **사람이 한눈에 쓰는 근거의 근사**다 — 그게 목적이다.
 */

import { discardsZone, handZone, kindKey, meldsZone } from "@majak/core";
import type { PlayerId, PlayerView, TileId, TileKind } from "@majak/core";
import { pointsForHan } from "./value.js";
import { NEUTRAL_TRAITS } from "./opponents.js";
import type { OpponentTraits } from "./opponents.js";
import { KABE_CREDIT, pairWaitFactor, sujiConfidence, waitFactor } from "./suji.js";

const NUMBER_SUITS = new Set(["man", "pin", "sou"]);
const isNumber = (k: TileKind): boolean => NUMBER_SUITS.has(k.suit);

/** 한 상대의 위협 상태 */
export interface Threat {
  player: PlayerId;
  /** 0(무해) ~ 1(리치). 텐파이 확률의 어림값 */
  level: number;
  /**
   * 이 사람에게 100% 안전한 패 — **현물과 통과패**.
   *
   * 현물은 그가 버린 패(후리텐)다. 통과패는 그가 리치를 선언한 **뒤에** 남이 버렸는데
   * 그가 론하지 않은 패다. 리치 중에는 대기를 바꿀 수 없고 론을 놓치면 그 국 내내
   * 후리텐이 되므로, 통과한 패는 현물과 정확히 같은 값의 안전패다.
   *
   * 이 통과패를 예전에는 세지 않았다. 그래서 봇은 **리치자 본인의 바닥만** 안전패로
   * 봤고, 다섯 순쯤 지나 안전패가 열 장 넘게 널려 있는 판에서도 접을 패가 없다고
   * 판단해 무스지를 흘렸다 — 사람이라면 절대 하지 않을 실수다.
   */
  genbutsu: Set<string>;
  /**
   * 이 사람이 **직접 버린** 수패의 rank 집합 (스지 계산용).
   *
   * 통과패는 여기에 들어오지 않는다 — 남이 버린 패는 이 사람의 후리텐을 만들지 않아
   * 스지를 세우지 못한다. 그 패 자신이 안전할 뿐이다.
   */
  discardRanks: Map<string, Set<number>>;
  /** 이 사람이 리치를 선언했는가 — 스지 신뢰도가 여기서 갈린다 */
  riichi: boolean;
  /**
   * 이 사람에게 쏘였을 때 잃을 것으로 보이는 점수.
   *
   * 예전에는 이 값이 없어서 **모든 방총을 똑같이 취급했다.** 자패 펑 하나 걸린
   * 1000점짜리 손과 오야 리치가 봇에게는 구분이 안 됐고, 그래서 값싼 후로에 과하게
   * 접고 오야 리치에 태연히 밀었다. 사람이 실제로 재는 것은 확률이 아니라
   * **확률 × 실점**이다.
   */
  value: number;
  /** 이 사람이 오야인가 (실점이 1.5배가 된다) */
  isDealer: boolean;
}

/**
 * 보이는 모든 곳(내 손패·전원 버림패·전원 후로·도라 표시패)을 세어
 * "이 종류가 아직 몇 장 남았나"를 돌려주는 추적기를 만든다.
 *
 * 사람은 이걸 "장 세기"라고 부른다 — 받을 패가 이미 다 나간 형태를 남기지 않고,
 * 자패가 3장 보이면 그 패를 안전패로 쓴다. 봇도 같은 정보를 쓴다.
 *
 * ⚠ **증강이 만들어 낸 패(`attrs.conjured`)는 세지 않는다.** 증강은 "없던 패를 준다"를
 * 기존 타일의 kind를 덮어쓰는 방식으로 구현하므로 같은 종류가 5장 이상 존재할 수 있다
 * (docs/25 P8 — 프리즘의 의도된 상식 파괴). 사람은 생성패가 화면에 보라색으로 구분되어
 * 그려지니 셈에서 뺄 수 있는데, 봇은 kind만 보고 **진짜 패로 착각**했다 — 실제로는
 * 아직 1장 남았는데 "다 나갔다"고 판단해 그 대기를 죽은 것으로 보거나 남은 장수 기반
 * 안전도를 잘못 매긴다. 사람과 봇이 같은 정보를 보게 맞춘다.
 *
 * (한계: 덮어쓰기 전 종류는 복원할 수 없어, 그 원래 종류는 실제보다 한 장 더 남은 것으로
 * 센다. 생성패를 빼는 것만으로도 방향은 맞다 — 없는 패를 있다고 세는 쪽이 더 나쁘다.)
 *
 * 현물(現物)·스지 판정은 여기가 아니라 `readThreats`가 따로 한다. 생성패라도 바닥에
 * 놓인 이상 그 사람은 그 종류로 론할 수 없으므로(후리텐) 거기서는 그대로 세는 것이 맞다.
 */
export function tileTracker(view: PlayerView): (kind: TileKind) => number {
  const seen = new Map<string, number>();
  const bump = (id: TileId | undefined): void => {
    const tile = id === undefined ? undefined : view.tiles[id];
    if (tile === undefined) return;
    if (tile.attrs.conjured === true) return; // 증강 생성패 — 진짜 장수가 아니다
    const key = kindKey(tile.kind);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  };
  const countZone = (zoneId: string): void => {
    for (const id of view.zones[zoneId]?.tileIds ?? []) bump(id);
  };
  countZone(handZone(view.playerId));
  for (const p of view.players) {
    countZone(discardsZone(p.id));
    countZone(meldsZone(p.id));
  }
  for (const id of view.round.doraIndicators) bump(id);

  return (kind) => Math.max(0, 4 - (seen.get(kindKey(kind)) ?? 0));
}

/** 상대들의 위협도를 읽는다 (자기 자신은 제외). 위험한 순으로 정렬 */
export function readThreats(
  view: PlayerView,
  me: PlayerId,
  /** 이 국의 도라 종류 — 상대 후로에 보이는 도라를 세어 실점 추정을 올린다 */
  doraKinds: readonly TileKind[] = [],
  /** 지금까지 읽어 낸 이 사람의 성향 (없으면 '보통 사람') */
  traitsOf: (p: PlayerId) => OpponentTraits = () => NEUTRAL_TRAITS,
  /** 실험 스위치 (2:2 정책 대전 전용) */
  flags?: ReadonlySet<string>,
): Threat[] {
  const out: Threat[] = [];
  const turn = view.round.turnCount;
  const doraSet = new Set(doraKinds.map(kindKey));
  const ponds = pondsOf(view);
  for (const p of view.players) {
    if (p.id === me) continue;
    const rs = view.round.byPlayer[p.id];
    const discards = discardKindsOf(view, p.id);
    const genbutsu = new Set<string>();
    const discardRanks = new Map<string, Set<number>>();
    for (const kind of discards) {
      genbutsu.add(kindKey(kind));
      if (isNumber(kind)) {
        let set = discardRanks.get(kind.suit);
        if (set === undefined) {
          set = new Set<number>();
          discardRanks.set(kind.suit, set);
        }
        set.add(kind.rank);
      }
    }

    const riichi = rs?.riichiDeclared === true;
    // 리치 이후 남의 바닥을 지나간 패는 이 사람이 론을 놓친 것이다 — 현물과 같다
    if (riichi) {
      for (const kind of passedSinceRiichi(view, p.id, rs?.riichiTileIndex)) {
        genbutsu.add(kindKey(kind));
      }
    }
    const melds = rs?.meldCount ?? 0;
    const yakuhaiMeld = hasYakuhaiMeld(view, p.id);
    const traits = traitsOf(p.id);
    let level = 0;
    if (riichi) {
      level = 1;
    } else if (melds > 0) {
      // 후로 손은 텐파이 여부가 안 보인다 — 후로 수와 순목으로 어림한다.
      // 역패 후로가 섞여 있으면 싸구려라도 확실히 화료를 향해 간다는 신호다.
      level = Math.min(0.75, 0.18 * melds + (turn >= 10 ? 0.2 : 0.08));
      if (yakuhaiMeld) level += 0.1;
      /**
       * **누가 울었는가.** 여태 한 번도 안 운 사람의 펑과, 매 국 우는 사람의 펑은
       * 같은 후로가 아니다. 전자는 "이 손은 울 만하다"는 판단이 섰다는 뜻이고,
       * 후자는 그냥 늘 하던 일이다. 사람이 실제로 하는 읽기를 그대로 옮긴다.
       */
      level *= 1 + (NEUTRAL_TRAITS.callRate - traits.callRate) * 0.6;
      // 종반에 중장패를 흘리는 열린 손은 손이 완성됐다는 신호다
      if (turn >= 9 && recentMiddleDiscards(discards) >= 2) level += 0.12;
    } else if (turn >= 12) {
      // 멘젠 무후로라도 종반이면 누구나 텐파이일 수 있다 (약한 상시 경계)
      level = 0.15;
    }

    /**
     * **손이 움직였는가.** 쯔모기리와 手出し를 나눠 보는 읽기 — 사람이 탁에서
     * 늘 하는 것인데 봇은 여태 한 번도 안 봤다(`tsumogiriIds`가 뷰에 있는데도).
     * 멘젠 손에는 이게 거의 유일한 단서라, 후로 손보다 여기서 더 값을 한다.
     */
    if (flags?.has("read2") === true) {
      level += motionBoost(readHandMotion(view, p.id), turn, riichi);
    }

    /**
     * **접은 사람은 위험하지 않다.** 남의 리치에 현물만 골라 내고 있는 사람은
     * 이미 화료를 포기한 것이다. 예전 봇은 후로 둘을 눕힌 채 접은 사람을 끝까지
     * 무서워해서, 아무도 노리지 않는 패를 못 버리고 자기 손만 망쳤다.
     */
    if (!riichi && isFolding(view, p.id, discards, ponds)) level *= 0.25;

    const isDealer =
      view.players.find((x) => x.id === p.id)?.seat === view.round.dealerSeat;

    out.push({
      player: p.id,
      level: Math.min(1, level),
      genbutsu,
      discardRanks,
      riichi,
      isDealer,
      value: estimateThreatValue(view, p.id, {
        riichi,
        melds,
        yakuhaiMeld,
        isDealer,
        doraSet,
        discards,
        riichiTurn: rs?.riichiTileIndex,
        traits,
        doubleRiichi: rs?.doubleRiichi === true,
        /**
         * 일발권 유도 — 리치 선언패가 아직 그 사람 바닥의 **마지막 장**이면
         * 선언 뒤로 한 번도 버리지 않았다는 뜻이다(공개 정보만으로 안다).
         */
        ippatsu:
          riichi &&
          rs?.riichiTileIndex !== undefined &&
          rs.riichiTileIndex === discards.length - 1,
        extended: flags?.has("read2") === true,
      }),
    });
  }
  return out.sort((a, b) => b.level * b.value - a.level * a.value);
}

/** 이 사람이 바닥에 버린 패들 (버린 순서) */
function discardKindsOf(view: PlayerView, player: PlayerId): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[discardsZone(player)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/**
 * **통과패** — 이 리치자가 리치를 건 뒤에 남들이 버렸는데 론하지 않은 패들.
 *
 * 리치 중에는 대기를 바꿀 수 없고, 자기 대기패를 그냥 지나치면 그 국 내내 후리텐이
 * 된다. 그러니 리치 이후에 한 번이라도 지나간 패는 **현물과 같은 값의 안전패**다.
 * 사람은 이걸 세지 않고는 리치에 접을 수조차 없다 — 리치자 본인의 바닥만으로는
 * 안전패가 늘 모자란다.
 *
 * 순서는 바닥의 **자리 번호**로 어림한다. 뷰에는 전원의 버림을 한 줄로 세운 시계가
 * 없고, 대신 리치 선언패가 그 사람 바닥의 몇 번째인지(`riichiTileIndex`)는 공개다.
 * 넷이 돌아가며 한 장씩 놓으므로 다른 사람의 같은 번호는 대체로 같은 순이다. 좌석
 * 순서 때문에 반 순씩 어긋날 수 있어 **선언 번호보다 뒤인 것만** 센다 — 틀리는 쪽이
 * 위험하므로 한쪽으로만 틀리게 둔다. 선언 번호를 모르면(리치가 숨겨진 뷰) 아무것도
 * 세지 않는다.
 */
function passedSinceRiichi(
  view: PlayerView,
  riichiPlayer: PlayerId,
  riichiTileIndex: number | undefined,
): TileKind[] {
  if (riichiTileIndex === undefined) return [];
  const out: TileKind[] = [];
  for (const other of view.players) {
    if (other.id === riichiPlayer) continue;
    const pond = discardKindsOf(view, other.id);
    for (let i = riichiTileIndex + 1; i < pond.length; i++) {
      const k = pond[i];
      if (k !== undefined) out.push(k);
    }
  }
  return out;
}

/** 전원의 바닥을 합친 집합 — "이건 이미 누군가 버린 패다"의 판정에 쓴다 */
function pondsOf(view: PlayerView): Map<PlayerId, Set<string>> {
  const m = new Map<PlayerId, Set<string>>();
  for (const p of view.players) {
    m.set(p.id, new Set(discardKindsOf(view, p.id).map(kindKey)));
  }
  return m;
}

/** 최근 3장 중 중장패(3~7) 개수 — 열린 손의 완성 신호 */
function recentMiddleDiscards(discards: readonly TileKind[]): number {
  let n = 0;
  for (const k of discards.slice(-3)) {
    if (isNumber(k) && k.rank >= 3 && k.rank <= 7) n++;
  }
  return n;
}

// ─────────────────────── 손동작 읽기 (쯔모기리 / 手出し) ───────────────────────

/**
 * 버림패 하나하나가 **쯔모기리인가 手出し인가**.
 *
 * 실제 탁에서 가장 강한 읽기 중 하나인데 봇은 이걸 한 번도 안 봤다. 뷰에는
 * `tsumogiriIds`가 국 내내 실려 있고(전원 공개 정보다 — 실제 탁에서도 손이
 * 움직였는지는 모두가 본다), 클라이언트는 바닥에 표식까지 그리는데 봇만 몰랐다.
 *
 * 두 신호가 나온다.
 *
 *  - **手出し**(손에서 뺐다) = 그 순간 손 모양이 바뀌었다. 종반의 중장패 手出し는
 *    "방금 무언가를 맞췄다"는 뜻이라 텐파이가 가깝다는 강한 신호다.
 *  - **연속 쯔모기리** = 손이 굳었다. 뽑는 족족 그대로 흘리는 사람은 이미 텐파이라
 *    바꿀 것이 없거나, 접고 있다. 접기는 `isFolding`이 따로 잡으므로 남는 것은 전자다.
 *
 * 예전 `recentMiddleDiscards`는 이 둘을 구별하지 않았다. 그래서 쯔모로 흘러들어온
 * 중장패(아무 뜻도 없는 우연)와 손에서 꺼낸 중장패(의미 있는 변화)를 같은 신호로
 * 셌다 — 노이즈가 절반쯤 섞인 읽기였다.
 */
interface HandMotion {
  /** 최근 3장 중 **手出し로 나온** 중장패 수 */
  recentMiddleTedashi: number;
  /** 마지막으로 손이 움직인 뒤로 몇 장을 그대로 흘렸는가 */
  tsumogiriStreak: number;
}

function readHandMotion(view: PlayerView, player: PlayerId): HandMotion {
  const ids = view.zones[discardsZone(player)]?.tileIds ?? [];
  const tsumogiri = new Set(view.round.byPlayer[player]?.tsumogiriIds ?? []);

  let recentMiddleTedashi = 0;
  for (const id of ids.slice(-3)) {
    if (tsumogiri.has(id)) continue;
    const k = view.tiles[id]?.kind;
    if (k !== undefined && isNumber(k) && k.rank >= 3 && k.rank <= 7) recentMiddleTedashi++;
  }

  let tsumogiriStreak = 0;
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i];
    if (id === undefined || !tsumogiri.has(id)) break;
    tsumogiriStreak++;
  }

  return { recentMiddleTedashi, tsumogiriStreak };
}

/**
 * 손동작이 위협도에 얹는 몫.
 *
 * 크기를 작게 잡은 것이 요점이다. 이건 **어림의 보정**이지 텐파이 판정이 아니다 —
 * 뷰가 쯔모기리를 안 실어 주는 경로(리플레이 재구성 등)에서는 조용히 0이 되어야 한다.
 */
function motionBoost(motion: HandMotion, turn: number, riichi: boolean): number {
  // 리치는 선언 뒤 전부 쯔모기리라 신호가 아니다 (이미 위협도 1이다)
  if (riichi) return 0;
  let boost = 0;
  // 종반의 중장패 手出し — 손이 방금 바뀌었다
  if (turn >= 9) boost += Math.min(2, motion.recentMiddleTedashi) * 0.07;
  // 손이 굳었다 — 오래 흘릴수록 세지되 상한을 둔다
  if (turn >= 8 && motion.tsumogiriStreak >= 3) {
    boost += Math.min(0.12, (motion.tsumogiriStreak - 2) * 0.04);
  }
  return boost;
}

/**
 * 이 사람이 **접고 있는가**.
 *
 * 판단 근거는 사람이 쓰는 것과 같다: 남이 리치를 걸어 놓았는데, 이 사람의 최근
 * 버림이 전부 **그 리치의 현물**이면 화료를 포기하고 안전패만 내는 중이다.
 * (자기 손을 진행시키는 사람은 현물만 골라 낼 수가 없다.)
 */
function isFolding(
  view: PlayerView,
  player: PlayerId,
  discards: readonly TileKind[],
  ponds: ReadonlyMap<PlayerId, Set<string>>,
): boolean {
  const recent = discards.slice(-3);
  if (recent.length < 3) return false;
  for (const other of view.players) {
    if (other.id === player) continue;
    if (view.round.byPlayer[other.id]?.riichiDeclared !== true) continue;
    const pond = ponds.get(other.id);
    if (pond === undefined) continue;
    if (recent.every((k) => pond.has(kindKey(k)))) return true;
  }
  return false;
}

/**
 * 이 상대에게 쏘였을 때의 예상 실점.
 *
 * 공개 정보만으로 상대의 판수를 어림하고 코어 점수표에 넣는다 — 봇이 손으로 만든
 * 점수표를 들고 있으면 규칙이 바뀔 때 조용히 어긋나기 때문이다.
 *
 * 세는 것:
 *   - 리치 → 리치·일발·우라·쯔모의 기대 판수(2.2)
 *   - 역패 후로 → 확정 1판(대신 싸다)
 *   - 후로에 **보이는** 도라 → 확정 판수
 *   - 감춰진 손패의 도라 기대값 → 약 1판 (도라 표시 1장당 손패 13장에 0.9장꼴)
 *   - 혼일색 읽기 → 후로가 한 색+자패로만 이루어져 있거나, **버림패에 한 색이 통째로
 *     빠져 있으면** +2판 (사람이 "저 색을 안 버린다"로 읽는 그것)
 *   - 리치 순목 → 이른 리치는 좋은 손이라는 신호
 *   - 그 사람의 성향 → 리치를 아끼는 사람의 리치는 비싸다
 */
function estimateThreatValue(
  view: PlayerView,
  player: PlayerId,
  info: {
    riichi: boolean;
    melds: number;
    yakuhaiMeld: boolean;
    isDealer: boolean;
    doraSet: ReadonlySet<string>;
    discards: readonly TileKind[];
    /** 리치 선언패가 바닥 몇 번째인가 (= 몇 순에 걸었는가) */
    riichiTurn: number | undefined;
    traits: OpponentTraits;
    /** 더블리치인가 (공개 정보) — 리치보다 한 판 비싸다 */
    doubleRiichi: boolean;
    /** 지금이 이 사람의 **일발권**인가 (아래 유도 참고) */
    ippatsu: boolean;
    /** 새 읽기를 켤 것인가 (2:2 대전용 스위치) */
    extended: boolean;
  },
): number {
  const meldKinds: TileKind[] = [];
  for (const id of view.zones[meldsZone(player)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) meldKinds.push(k);
  }

  let han = 0;
  if (info.riichi) han += 2.2;
  else if (info.yakuhaiMeld) han += 1;
  else han += 1.2; // 무언가 역은 있다 (탕야오·핑후·역패 …)

  // 감춰진 손패의 도라 기대값 — 도라 표시패 1장당 손에 0.9장꼴로 들어 있다
  han += Math.min(2, view.round.doraIndicators.length * 0.9);
  // 후로에 눕혀 보이는 도라는 확정이다
  for (const k of meldKinds) if (info.doraSet.has(kindKey(k))) han += 1;

  // 혼일색 읽기 — 눕힌 패가 한 색(+자패)으로만 이루어져 있다
  if (info.melds > 0 && isOneSuitOrHonors(meldKinds)) han += 2;
  // 눕힌 것이 없어도 **안 버리는 색**으로 읽힌다. 다른 두 색을 실컷 버리면서 한 색만
  // 한 장도 안 흘리는 사람은 그 색을 모으는 중이다 — 사람이 늘 쓰는 읽기다.
  else if (missingSuitRead(info.discards)) han += 2;

  /**
   * **언제 걸었는가.** 3~6순의 리치는 배패부터 좋았다는 뜻이라 도라도 역도 더
   * 붙어 있기 쉽다. 반대로 12순이 넘어 건 리치는 겨우 텐파이가 된 손이 많다.
   */
  if (info.riichi && info.riichiTurn !== undefined) {
    han += info.riichiTurn <= 5 ? 0.5 : info.riichiTurn >= 12 ? -0.3 : 0;
  }

  if (info.extended) {
    /**
     * **더블리치**는 리치보다 한 판 더 붙는다. 공개 정보인데(`doubleRiichi`가 타인
     * 뷰에도 실린다) 봇은 여태 한 번도 안 봤다 — 배패부터 텐파이였던 손이라 값도
     * 대개 더 나간다.
     */
    if (info.doubleRiichi) han += 1;
    /**
     * **일발권**에 쏘면 한 판이 더 붙는다.
     *
     * 리치의 기본값 2.2판에는 일발이 **평균치로**(약 0.25판) 이미 섞여 있다. 하지만
     * 지금 이 순간이 일발권이라면 그건 평균이 아니라 확정 1판이라, 그 차이만큼만 얹는다.
     *
     * 뷰의 `ippatsu`는 본인 뷰 전용이라 못 쓴다(정보 비대칭은 지켜야 한다). 대신
     * **공개 정보로 유도한다** — 리치를 선언한 그 패가 아직 그 사람 바닥의 마지막
     * 장이면, 그 사람은 선언 뒤로 한 번도 버리지 않았다는 뜻이다. 후로가 끼면 일발이
     * 깨지는데 그건 여기서 알 수 없으므로, 확정 1판이 아니라 그보다 낮게 잡는다.
     */
    if (info.ippatsu) han += 0.7;
  }

  /**
   * **누가 걸었는가.** 리치를 아껴 두는 사람이 걸었다면 고를 만한 손이었다는 뜻이고,
   * 아무 손에나 거는 사람의 리치는 액면 그대로다. 관측이 쌓이기 전에는
   * traits가 사전값이라 이 항이 0이 된다 — 첫 국에는 아무 영향이 없다.
   */
  if (info.riichi) {
    han += (NEUTRAL_TRAITS.riichiRate - info.traits.riichiRate) * 3;
  }

  // 손 값어치와 **같은 눈금**을 쓴다 — 기대 판수를 반올림하지 않고 보간한다.
  // 눈금이 어긋나면 "밀기가 이득인가"의 뺄셈이 조용히 한쪽으로 기운다.
  return pointsForHan(han, 30, info.isDealer);
}

/**
 * 버림패에 **한 색이 통째로 빠져 있는가** — 그 색을 모으고 있다는 신호.
 *
 * 다른 두 색을 각각 3장 이상 버렸는데 한 색은 한 장도 안 버렸다면, 그 색이 손에
 * 쌓이고 있다고 보는 것이 자연스럽다. 표본이 적으면 그냥 안 뽑혔을 뿐이라
 * 버림패가 8장은 쌓인 뒤에만 읽는다.
 */
function missingSuitRead(discards: readonly TileKind[]): boolean {
  if (discards.length < 8) return false;
  const bySuit = new Map<string, number>();
  for (const k of discards) {
    if (isNumber(k)) bySuit.set(k.suit, (bySuit.get(k.suit) ?? 0) + 1);
  }
  let missing = 0;
  let thick = 0;
  for (const suit of NUMBER_SUITS) {
    const n = bySuit.get(suit) ?? 0;
    if (n === 0) missing++;
    else if (n >= 3) thick++;
  }
  return missing === 1 && thick === 2;
}

/** 눕힌 패가 한 색 + 자패로만 이루어져 있는가 (혼일색·청일색 신호) */
function isOneSuitOrHonors(kinds: readonly TileKind[]): boolean {
  let suit: string | null = null;
  for (const k of kinds) {
    if (!isNumber(k)) continue;
    if (suit === null) suit = k.suit;
    else if (suit !== k.suit) return false;
  }
  return suit !== null;
}

/** 그 사람의 후로에 역패(삼원패·풍패) 커쯔가 있는가 — 값싼 확정 역의 신호 */
function hasYakuhaiMeld(view: PlayerView, player: PlayerId): boolean {
  for (const id of view.zones[meldsZone(player)]?.tileIds ?? []) {
    const kind = view.tiles[id]?.kind;
    if (kind === undefined) continue;
    if (kind.suit === "dragon") return true;
    if (kind.suit === "wind" && kind.rank === view.round.prevalentWind) return true;
  }
  return false;
}

/**
 * 수비 판단에 딸려 오는, 뷰 바깥에서 오는 것들.
 *
 * 스지를 얼마나 믿는지는 **성격**이고(`profile.sujiTrust`), 도라가 무엇인지와 지금이
 * 몇 순인지는 **국면**이다. 위협 읽기(`readThreats`)는 상대만 보므로 이 셋은 따로 온다.
 */
export interface DefenseContext {
  /** 지금 순목 — 종반일수록 스지가 지울 량면 자체가 적어진다 */
  turn: number;
  /** 이 국의 도라 종류 — 스지라도 도라 근처는 더 세게 잡는다 */
  doraKinds: readonly TileKind[];
  /** 0(현물주의) ~ 1(스지면 민다). `profile.sujiTrust` */
  sujiTrust: number;
}

/** 성격도 도라도 모를 때 쓰는 값 — 교과서적인 중립 수비 */
export const NEUTRAL_DEFENSE: DefenseContext = {
  turn: 8,
  doraKinds: [],
  sujiTrust: 0.6,
};

/** rank별 **기본 위험** — 아무것도 못 지웠을 때의 값 (사람의 체감 순서 그대로) */
function baseRisk(kind: TileKind): number {
  if (!isNumber(kind)) return 0.3;
  const r = kind.rank;
  return r === 1 || r === 9 ? 0.3 : r === 2 || r === 8 ? 0.42 : r === 3 || r === 7 ? 0.5 : 0.58;
}

/**
 * **도라 근처인가** — 위험을 되올리는 배율.
 *
 * 도라는 상대가 끝까지 붙들고 있는 패라 그 언저리에 대기가 몰린다. 이론이 마지막에
 * 못 박는 것도 이것이다 — **스지라도 도라 근처면 세게 잡는다.** 그래서 이 배율은
 * 스지·벽으로 깎은 **뒤에** 곱해진다(깎기 전에 곱하면 스지가 그 경고를 도로 지운다).
 */
function doraProximity(kind: TileKind, doraSet: ReadonlySet<string>): number {
  if (doraSet.has(kindKey(kind))) return 1.35;
  if (!isNumber(kind)) return 1;
  for (const d of [kind.rank - 1, kind.rank + 1]) {
    if (d >= 1 && d <= 9 && doraSet.has(kindKey({ suit: kind.suit, rank: d }))) return 1.12;
  }
  return 1;
}

/**
 * 한 상대에 대한 이 패의 위험도(0~1, 위협도 곱하기 전의 순수 패 위험).
 *
 * 현물·통과패는 0, 나머지는 **기본 위험 × 남은 대기형 비율 × 도라 근처**다. 가운데
 * 항이 `bot/suji.ts`의 대기형 셈이고, 스지·벽·장수 셈이 전부 그 안에서 합쳐진다.
 *
 * **0이 되는 것은 현물뿐이다.** 스지가 아무리 겹쳐도 샤보·간짱·단기 몫이 남으므로
 * 이 함수는 양수를 돌려준다 — "스지 하나 보고 안전하다고 하지 말라"가 규칙이 아니라
 * 계산의 성질이 되게 만든 것이다.
 */
function tileRisk(
  kind: TileKind,
  threat: Threat,
  remainingOf: (k: TileKind) => number,
  defense: DefenseContext,
  doraSet: ReadonlySet<string>,
): number {
  if (threat.genbutsu.has(kindKey(kind))) return 0;

  const sujiCredit = isNumber(kind)
    ? Math.max(0, Math.min(1, defense.sujiTrust)) *
      sujiConfidence(defense.turn, threat.riichi)
    : 0;

  const factor = isNumber(kind)
    ? waitFactor(kind.rank, {
        discarded: threat.discardRanks.get(kind.suit) ?? EMPTY_RANKS,
        aliveAt: (rank) =>
          rank >= 1 && rank <= 9 ? remainingOf({ suit: kind.suit, rank }) : 0,
        remaining: remainingOf(kind),
        sujiCredit,
        kabeCredit: KABE_CREDIT,
      })
    : // 자패는 량면·간짱·변짱이 없다 — 샤보·단기뿐이라 남은 장수가 곧 위험이다
      pairWaitFactor(remainingOf(kind));

  return Math.min(1, baseRisk(kind) * factor * doraProximity(kind, doraSet));
}

const EMPTY_RANKS: ReadonlySet<number> = new Set<number>();

/**
 * 도라 종류 집합. `safetyOf`·`expectedLoss`는 한 번의 결정에서 수백 번 불리는데
 * 문맥은 결정당 하나뿐이라, 문맥에 매달아 두고 한 번만 만든다.
 */
const DORA_SETS = new WeakMap<DefenseContext, ReadonlySet<string>>();
function doraSetOf(defense: DefenseContext): ReadonlySet<string> {
  const cached = DORA_SETS.get(defense);
  if (cached !== undefined) return cached;
  const set: ReadonlySet<string> = new Set(defense.doraKinds.map(kindKey));
  DORA_SETS.set(defense, set);
  return set;
}

/**
 * 이 패를 지금 버릴 때의 **안전도** 0(위험) ~ 1(완전 안전).
 * 모든 상대 중 가장 위험한 값으로 잡는다 — 한 명한테만 쏘여도 실점이다.
 *
 * 상대가 여럿 리치를 걸었다면 **각자 따로** 센다. 스지는 그 사람이 버린 패로만
 * 서는 것이라, 남의 바닥으로 선 스지를 이 사람에게 쓰면 그냥 무스지를 내는 것이다.
 */
export function safetyOf(
  kind: TileKind,
  threats: readonly Threat[],
  remainingOf: (k: TileKind) => number,
  defense: DefenseContext = NEUTRAL_DEFENSE,
): number {
  const doraSet = doraSetOf(defense);
  let worst = 0;
  for (const t of threats) {
    if (t.level <= 0) continue;
    const risk = t.level * tileRisk(kind, t, remainingOf, defense, doraSet);
    if (risk > worst) worst = risk;
  }
  return 1 - Math.min(1, worst);
}

/**
 * `tileRisk`(0~1의 상대적 위험)를 **실제 방총 확률**로 옮기는 배율.
 *
 * 리치에 대한 무스지 중장패의 실측 방총률이 약 6%다. tileRisk가 그런 패에 0.58을
 * 주므로 0.11을 곱하면 6.4%가 된다 — 이 상수 하나로 `tileRisk`의 상대 눈금이 전부
 * 확률 축에 올라간다. 눈금이 확률이 되면 실점(점수)과 곱해 **기대 실점**이 나오고,
 * 그때부터 수비는 공격(`value.ts`의 기대 획득)과 같은 단위로 비교된다.
 */
const DEAL_IN_SCALE = 0.11;

/**
 * 이 패를 지금 버릴 때 **잃을 것으로 기대되는 점수**.
 *
 * Σ(상대별 방총 확률 × 그 상대의 예상 실점). 한 장이 여러 상대에게 동시에 걸릴 수는
 * 없지만 어느 쪽에 걸릴지 모르므로 기대값은 합이 맞다.
 *
 * `safetyOf`(0~1)와 달리 이 값은 **점수 단위**라, "이 패를 밀어서 얻는 기대 획득"과
 * 직접 뺄셈이 된다. 봇의 밀기/접기는 이제 그 뺄셈 하나로 결정된다.
 */
export function expectedLossOf(
  kind: TileKind,
  threats: readonly Threat[],
  remainingOf: (k: TileKind) => number,
  defense: DefenseContext = NEUTRAL_DEFENSE,
): number {
  const doraSet = doraSetOf(defense);
  let loss = 0;
  for (const t of threats) {
    if (t.level <= 0) continue;
    loss += t.level * tileRisk(kind, t, remainingOf, defense, doraSet) * DEAL_IN_SCALE * t.value;
  }
  return loss;
}

/** 가장 높은 위협도 (0~1) — "지금 판이 위험한가"의 한 줄 요약 */
export function maxThreat(threats: readonly Threat[]): number {
  return threats.reduce((m, t) => Math.max(m, t.level), 0);
}

/** 패산에 남은 장수 (뽑을 수 있는 패). 뷰에 없으면 넉넉한 값으로 폴백 */
export function wallLeftOf(view: PlayerView): number {
  const wall = view.zones["wall"];
  if (wall === undefined) return 70;
  return wall.tileIds.length + wall.hiddenCount;
}
