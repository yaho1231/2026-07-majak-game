/**
 * DraftController — 개인별 3지선다 드래프트의 진행.
 *
 * 선택지는 (게임 시드, 스테이지, 플레이어)에서 파생된 별도 PRNG로 뽑는다 —
 * 게임 진행용 PRNG를 소비하지 않으며, 언제든 재계산 가능하다.
 * 상태를 바꾸는 것은 오직 픽(AugmentDrafted)이다.
 *
 * **다양성(2026-07-26)**: 한 게임에 증강이 최대한 골고루 나오게 두 겹을 건다.
 * ① 스테이지마다 제시 가능한 풀을 좌석별 **서로 소인 후보 칸**으로 갈라 —
 *    같은 스테이지에 두 사람에게 같은 증강이 제시되지 않는다(`cellFor`).
 * ② 누가 이미 보유한 증강은 아무에게도 다시 제시하지 않는다 —
 *    한 게임에 같은 증강을 둘이 갖는 일이 없다(`heldByOthers`).
 * 두 장치 모두 **결정적**이며, 스테이지 도중 남이 픽해도 내 후보가 흔들리지 않는다
 * (근거는 `cellFor` 주석 — `pick`의 "제시된 것인가" 검증이 여기에 의존한다).
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §3~4
 */

import { Prng } from "../engine/random/Prng.js";
import type { GameEngine } from "../engine/GameEngine.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import { installAugment } from "./Augment.js";
import type { AugmentDef, AugmentExtras } from "./Augment.js";
import { AugmentRegistry } from "./AugmentRegistry.js";

/**
 * 드래프트 스테이지.
 * - gameStart: 게임 시작(동1국 진입) — 두 모드 공통.
 * - southEntry: 남장 진입(남1국) — 반장전 전용.
 * - eastThird: 동3국 진입 — 동풍전 전용.
 */
export type DraftStage = "gameStart" | "southEntry" | "eastThird";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class DraftController {
  constructor(
    private readonly engine: GameEngine,
    private readonly catalog: AugmentRegistry,
    private readonly extras: AugmentExtras = {},
  ) {}

  /** 현재 게임 모드 (없으면 반장전 폴백) */
  private mode(): import("../engine/state/GameState.js").GameMode {
    return this.engine.state.config.mode ?? "hanchan";
  }

  /** 이 증강이 현재 스테이지·모드에서 제시 가능한지 (보유 여부와 무관) */
  private offerable(def: AugmentDef, stage: DraftStage): boolean {
    if (def.draftStages !== undefined && !def.draftStages.includes(stage)) {
      return false;
    }
    if (def.modes !== undefined && !def.modes.includes(this.mode())) {
      return false;
    }
    return true;
  }

  /**
   * 이 스테이지·플레이어에게 제외할 증강 id
   * (보유 ∪ 스테이지/모드 부적합 ∪ 보유 증강과 상호 배제(conflicts) 관계).
   */
  private excludeFor(stage: DraftStage, player: PlayerId): Set<string> {
    const state = this.engine.state;
    const held = state.players.find((p) => p.id === player)?.augments ?? [];
    const heldSet = new Set(held);
    const exclude = new Set<string>(held);

    // 보유 증강이 금지하는 상대 id (H.conflicts) — 상호 배제의 한 방향.
    const forbiddenByHeld = new Set<string>();
    for (const id of held) {
      for (const c of this.catalog.get(id)?.conflicts ?? []) {
        forbiddenByHeld.add(c);
      }
    }

    for (const def of this.catalog.all()) {
      if (!this.offerable(def, stage)) {
        exclude.add(def.id);
        continue;
      }
      // 상호 배제: 보유 증강이 def를 금지하거나(H.conflicts ∋ def),
      // def가 보유 증강을 금지하면(def.conflicts ∩ 보유) 둘 다 제외한다 — 관계는 대칭.
      if (
        forbiddenByHeld.has(def.id) ||
        (def.conflicts ?? []).some((c) => heldSet.has(c))
      ) {
        exclude.add(def.id);
      }
    }
    return exclude;
  }

  /** 다른 플레이어가 이미 보유한 증강 id (한 게임에 같은 증강이 둘 있지 않게) */
  private heldByOthers(player: PlayerId): Set<string> {
    const out = new Set<string>();
    for (const p of this.engine.state.players) {
      if (p.id === player) continue;
      for (const id of p.augments) out.add(id);
    }
    return out;
  }

  /**
   * 이 스테이지의 **좌석별 후보 칸(cell)** — 좌석마다 서로 겹치지 않는 후보 묶음.
   *
   * 한 게임에서 증강이 최대한 다양하게 나오도록, 스테이지가 열릴 때 제시 가능한 풀을
   * (시드 ⊕ 스테이지)로 섞어 좌석 순서대로 **서로 소인 구간**으로 나눠 준다. 각 좌석은
   * 자기 칸에서만 뽑으므로 **같은 스테이지에 두 사람에게 같은 증강이 제시되는 일이 없다.**
   *
   * 결정성·안정성이 이 설계의 핵심이다:
   * - 칸 계산에 쓰는 것은 `offerable`(draftStages·modes)뿐이다 — **국 중에 변하지 않는다.**
   *   보유 증강 같은 가변 상태를 칸 계산에 넣으면, 스테이지 도중 누가 픽할 때마다 남의
   *   후보가 흔들려 `pick`의 "제시된 것인가" 검증이 깨진다.
   * - 칸이 서로 소이므로 **다른 사람이 이번 스테이지에 픽한 증강은 내 칸에 애초에 없다.**
   *   그래서 `heldByOthers` 제외를 칸에 적용해도 내 후보는 흔들리지 않는다.
   *
   * 카탈로그가 좌석 수를 감당할 만큼 크지 않으면 `null`을 돌려 **기존 전역 균등 추첨**으로
   * 돌아간다(작은 테스트 카탈로그·극단적 모드 필터). 그때는 겹침을 보장하지 못한다.
   */
  private cellFor(stage: DraftStage, player: PlayerId): AugmentDef[] | null {
    const state = this.engine.state;
    const seats = state.players.length;
    const seatIdx = state.players.findIndex((p) => p.id === player);
    if (seatIdx < 0 || seats <= 1) return null;

    const count = this.engine.rules.resolve<number>("augment.draft.choices");
    // 칸 크기는 제시 수의 4배(최소 12) — 보유·상호 배제로 몇 개가 빠져도 3개를 못 채울 일이
    // 없을 만큼의 여유다. 칸 밖에는 보충용 나머지가 최소 count개 남아야 한다.
    const cellSize = Math.max(count * 4, 12);
    const pool = this.catalog.all().filter((d) => this.offerable(d, stage));
    if (pool.length < seats * cellSize + count) return null; // 카탈로그가 작다 → 기존 방식

    // (시드 ⊕ 스테이지)로 결정적 셔플 — 플레이어에 의존하지 않는다(칸 경계가 흔들리면 안 된다).
    const prng = new Prng(
      (state.config.seed ^ hashString(`cells:${stage}`)) >>> 0,
    );
    for (let i = pool.length - 1; i > 0; i--) {
      const j = prng.int(i + 1);
      [pool[i], pool[j]] = [pool[j] as AugmentDef, pool[i] as AugmentDef];
    }
    return pool.slice(seatIdx * cellSize, (seatIdx + 1) * cellSize);
  }

  /**
   * 이 플레이어에게 제시할 3개. 결정적이므로 몇 번 호출해도 같은 결과.
   *
   * 2026-07-22 (52차) 등급 폐기: 등급 통일·가중치를 걷어내고 **균등 비복원**으로 단순화했다.
   *
   * 2026-07-26 다양성: 좌석별 후보 칸(`cellFor`)에서 뽑아 **같은 스테이지에 다른 사람과
   * 겹치지 않게** 하고, 이미 **누가 보유한 증강은 아무에게도 다시 제시하지 않는다**
   * (한 게임에 같은 증강이 둘 있지 않게).
   */
  roll(stage: DraftStage, player: PlayerId): AugmentDef[] {
    const state = this.engine.state;
    const exclude = this.excludeFor(stage, player);
    const seed = (state.config.seed ^ hashString(`${stage}:${player}`)) >>> 0;
    const prng = new Prng(seed);
    const count = this.engine.rules.resolve<number>("augment.draft.choices");

    const cell = this.cellFor(stage, player);
    if (cell === null) return this.catalog.rollUniform(prng, count, exclude);

    // 내 칸에서 뽑는다 — 기존 제외 + 남이 이미 가진 것(게임 내 중복 금지).
    const banned = new Set([...exclude, ...this.heldByOthers(player)]);
    const chosen = this.catalog.rollFromCell(prng, count, cell, banned);
    if (chosen.length >= count) return chosen;

    // 칸이 말라붙은 극단적 경우에만 칸 밖에서 보충한다. 여기서는 **남의 보유분을 제외하지
    // 않는다** — 남이 이번 스테이지에 픽할 때마다 결과가 바뀌면 pick 검증이 깨지기 때문이다.
    const picked = new Set(chosen.map((d) => d.id));
    const rest = this.catalog
      .all()
      .filter((d) => !exclude.has(d.id) && !picked.has(d.id));
    return [
      ...chosen,
      ...this.catalog.rollFromCell(prng, count - chosen.length, rest),
    ];
  }

  /**
   * 제시(오퍼)를 로그에 기록한다 — 픽률·등급 분포 통계 전용(상태 불변).
   * 픽보다 먼저, 고정 순서로 호출해야 리플레이 이벤트 순서가 결정적이다.
   */
  recordOffer(_stage: DraftStage, player: PlayerId, offered: AugmentDef[]): void {
    const result = this.engine.submit({
      player,
      type: "draftOffer",
      payload: { player, augmentIds: offered.map((d) => d.id) },
    });
    if (!result.ok) throw new Error(`draftOffer failed: ${result.reason}`);
  }

  /** 픽 확정: 제시된 것 중 하나여야 하며, 상태 갱신 후 설치까지 한다 */
  pick(stage: DraftStage, player: PlayerId, augmentId: string): void {
    const offered = this.roll(stage, player).map((d) => d.id);
    if (!offered.includes(augmentId)) {
      throw new Error(`Augment ${augmentId} was not offered to ${player}`);
    }
    const def = this.catalog.get(augmentId);
    if (def === undefined) throw new Error(`Unknown augment: ${augmentId}`);

    // 정식 픽 — 스테이지 완료 플래그도 함께 기록(도박사가 2개를 줘도 진행 추적이 견고)
    const result = this.engine.submit({
      player,
      type: "draftPick",
      payload: { augmentId, markStage: stage },
    });
    if (!result.ok) throw new Error(`draftPick failed: ${result.reason}`);

    installAugment(this.engine, def, player, this.extras);
  }

}

/** 게임 재구성·리플레이용: state.augments에 있는 모든 증강을 재설치한다 */
export function rebuildAugments(
  engine: GameEngine,
  catalog: AugmentRegistry,
  extras: AugmentExtras = {},
): void {
  // 설치 순서를 **원본 드래프트와 같은 모양**으로 맞춘다.
  //
  // 원본은 스테이지마다 자리 순으로 한 장씩 돌아간다(p0 gameStart, p1 gameStart, …,
  // p0 southEntry, …). 예전 재구성은 플레이어별로 몰아서(p0의 전부 → p1의 전부)
  // 설치해 등록 순서(seq)가 달라졌고, seq에 기대는 동률 훅의 결과가 뒤집혔다 —
  // 즉 **이어하기·리플레이가 원본과 다른 점수를 낼 수 있었다**(docs/25 P6).
  // player.augments는 픽 순서로 쌓이므로 인덱스가 곧 드래프트 스테이지에 대응한다.
  const maxCount = Math.max(0, ...engine.state.players.map((p) => p.augments.length));
  for (let i = 0; i < maxCount; i++) {
    for (const player of engine.state.players) {
      const augmentId = player.augments[i];
      if (augmentId === undefined) continue;
      const def = catalog.get(augmentId);
      if (def === undefined) {
        throw new Error(`Cannot rebuild unknown augment: ${augmentId}`);
      }
      installAugment(engine, def, player.id, extras);
    }
  }
}
