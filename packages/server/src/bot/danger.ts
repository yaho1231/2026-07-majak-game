/**
 * danger — "지금 이 패를 버리면 쏘이는가"를 읽는다 (베타오리의 근거).
 *
 * 2026-07-29 이전의 봇에는 **수비 개념이 아예 없었다.** 상대가 리치를 걸든 말든 자기
 * 효율만 보고 버려서, 사람 눈에는 "생각 없이 밀어대는 기계"로 보였다. 사람이 실제로
 * 쓰는 근거는 대개 셋이고, 전부 공개 정보(버림패·후로·도라 표시패)만으로 계산된다.
 *
 *  1. **현물(現物)** — 그 사람이 이미 버린 패는 론이 안 된다(후리텐). 100% 안전.
 *  2. **스지(筋)** — 4가 버려졌으면 1·7의 량면 대기가 없다. 완전 안전은 아니고 확률이 준다.
 *  3. **노찬스** — 량면 대기의 재료가 이미 다 보이면 그 대기는 존재할 수 없다.
 *
 * 여기에 "이 상대가 얼마나 위험한가"(리치 · 후로 수 · 진행 순목)를 곱해 0~1 위험도를 낸다.
 * 정확한 대기 추정이 아니라 **사람이 한눈에 쓰는 근거의 근사**다 — 그게 목적이다.
 */

import { discardsZone, handZone, kindKey, meldsZone } from "@majak/core";
import type { PlayerId, PlayerView, TileId, TileKind } from "@majak/core";

const NUMBER_SUITS = new Set(["man", "pin", "sou"]);
const isNumber = (k: TileKind): boolean => NUMBER_SUITS.has(k.suit);

/** 한 상대의 위협 상태 */
export interface Threat {
  player: PlayerId;
  /** 0(무해) ~ 1(리치). 텐파이 확률의 어림값 */
  level: number;
  /** 이 사람에게 100% 안전한 패 (그가 버린 패 = 현물) */
  genbutsu: Set<string>;
  /** 이 사람이 버린 수패의 rank 집합 (스지 계산용) */
  discardRanks: Map<string, Set<number>>;
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
export function readThreats(view: PlayerView, me: PlayerId): Threat[] {
  const out: Threat[] = [];
  const turn = view.round.turnCount;
  for (const p of view.players) {
    if (p.id === me) continue;
    const rs = view.round.byPlayer[p.id];
    const genbutsu = new Set<string>();
    const discardRanks = new Map<string, Set<number>>();
    for (const id of view.zones[discardsZone(p.id)]?.tileIds ?? []) {
      const kind = view.tiles[id]?.kind;
      if (kind === undefined) continue;
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

    let level = 0;
    if (rs?.riichiDeclared === true) {
      level = 1;
    } else {
      const melds = rs?.meldCount ?? 0;
      if (melds > 0) {
        // 후로 손은 텐파이 여부가 안 보인다 — 후로 수와 순목으로 어림한다.
        // 역패 후로가 섞여 있으면 싸구려라도 확실히 화료를 향해 간다는 신호다.
        level = Math.min(0.75, 0.18 * melds + (turn >= 10 ? 0.2 : 0.08));
        if (hasYakuhaiMeld(view, p.id)) level += 0.1;
      } else if (turn >= 12) {
        // 멘젠 무후로라도 종반이면 누구나 텐파이일 수 있다 (약한 상시 경계)
        level = 0.15;
      }
    }
    out.push({ player: p.id, level: Math.min(1, level), genbutsu, discardRanks });
  }
  return out.sort((a, b) => b.level - a.level);
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
 * 한 상대에 대한 이 패의 위험도(0~1, 위협도 곱하기 전의 순수 패 위험).
 * 현물 0 → 스지·노찬스로 감액 → 자패는 남은 장수로, 수패는 중장패일수록 위험.
 */
function tileRisk(
  kind: TileKind,
  threat: Threat,
  remainingOf: (k: TileKind) => number,
): number {
  if (threat.genbutsu.has(kindKey(kind))) return 0;

  if (!isNumber(kind)) {
    // 자패: 남은 장수가 곧 위험. 1장 남았으면 샤보/단기밖에 안 되니 거의 안전하다.
    const left = remainingOf(kind);
    if (left <= 1) return 0.04;
    if (left === 2) return 0.14;
    return 0.3;
  }

  const r = kind.rank;
  // 중장패일수록 량면·칸짱 대기에 두루 걸린다 (사람의 체감 순서 그대로)
  let risk = r === 1 || r === 9 ? 0.3 : r === 2 || r === 8 ? 0.42 : r === 3 || r === 7 ? 0.5 : 0.58;

  const discarded = threat.discardRanks.get(kind.suit) ?? new Set<number>();
  const lowSuji = r > 3 && discarded.has(r - 3);
  const highSuji = r < 7 && discarded.has(r + 3);
  if (r >= 4 && r <= 6) {
    // 양쪽 스지가 다 서면 량면 대기가 사라진다 (칸짱·샤보·단기만 남는다)
    if (lowSuji && highSuji) risk *= 0.4;
    else if (lowSuji || highSuji) risk *= 0.75;
  } else if (lowSuji || highSuji) {
    // 1~3·7~9는 한쪽 스지만으로 량면이 끊긴다
    risk *= 0.45;
  }

  // 노찬스 — 량면의 재료가 세상에 안 남아 있으면 그 대기는 존재할 수 없다
  if (noChance(kind, remainingOf)) risk *= 0.35;

  return Math.min(1, risk);
}

/**
 * 이 패로 완성되는 량면 대기의 재료가 전부 소진됐는가.
 * 예: 4삭을 버릴 때 그 4삭이 걸릴 량면은 (2·3삭)과 (5·6삭)뿐이다. 3삭이 4장 다
 * 보이고 5삭도 4장 다 보이면 4삭은 량면에 걸리지 않는다(칸짱·단기만 남는다).
 */
function noChance(kind: TileKind, remainingOf: (k: TileKind) => number): boolean {
  const r = kind.rank;
  const suit = kind.suit;
  const alive = (rank: number): boolean =>
    rank >= 1 && rank <= 9 && remainingOf({ suit, rank }) > 0;
  const lowSide = r >= 3 && alive(r - 1) && alive(r - 2);
  const highSide = r <= 7 && alive(r + 1) && alive(r + 2);
  return !lowSide && !highSide;
}

/**
 * 이 패를 지금 버릴 때의 **안전도** 0(위험) ~ 1(완전 안전).
 * 모든 상대 중 가장 위험한 값으로 잡는다 — 한 명한테만 쏘여도 실점이다.
 */
export function safetyOf(
  kind: TileKind,
  threats: readonly Threat[],
  remainingOf: (k: TileKind) => number,
): number {
  let worst = 0;
  for (const t of threats) {
    if (t.level <= 0) continue;
    const risk = t.level * tileRisk(kind, t, remainingOf);
    if (risk > worst) worst = risk;
  }
  return 1 - Math.min(1, worst);
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
