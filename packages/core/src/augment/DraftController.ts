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
 * ② **스테이지가 열린 시점에** 누가 보유한 증강은 아무에게도 다시 제시하지 않는다 —
 *    한 게임에 같은 증강을 둘이 갖는 일이 없다(`heldByOthers`).
 * 두 장치 모두 **결정적**이며, 스테이지 도중 남이 픽해도 내 후보가 흔들리지 않는다
 * (근거는 `heldAtStageStart` 주석 — `pick`의 "제시된 것인가" 검증이 여기에 의존한다.
 * 흔들리면 게임이 예외로 끊긴다. 실제로 끊겼다).
 *
 * **시너지(2026-08-05)**: 그 위에 세 번째 겹을 얹었다 — 내가 **이미 집은 증강과 축이 겹치는**
 * 증강의 가중치를 올리고, 서로 죽는 증강의 가중치를 내린다(`synergyBiasFor` → `augment/synergy.ts`).
 * 리치를 집었으면 리치를 키우는 것이 더 자주 오되, 스텔스 리치처럼 **은닉이 존재 이유인** 증강에는
 * 리치를 드러내는 것들이 오히려 덜 온다. 근거가 내 보유 목록뿐이라 위 두 장치의 결정성을 깨지 않는다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §3~4
 */

import { Prng } from "../engine/random/Prng.js";
import type { GameEngine } from "../engine/GameEngine.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import { installAugment } from "./Augment.js";
import type { AugmentDef, AugmentExtras } from "./Augment.js";
import { AugmentRegistry } from "./AugmentRegistry.js";
import { synergyBias } from "./synergy.js";

/**
 * 드래프트 스테이지 — 각 국에 **처음 진입할 때 1회씩**만 열린다.
 * - gameStart:  게임 시작(동1국 진입) — 두 모드 공통.
 * - eastThird:  동3국 진입 — 두 모드 공통.
 * - eastFourth: 동4국 진입 — 동풍전 전용.
 * - southEntry: 남장 진입(남1국) — 반장전 전용.
 * - southThird: 남3국 진입 — 반장전 전용.
 *
 * 결과적으로 동풍전은 3개(동1·동3·동4), 반장전은 4개(동1·동3·남1·남3)를 지급한다.
 */
export type DraftStage =
  | "gameStart"
  | "eastThird"
  | "eastFourth"
  | "southEntry"
  | "southThird";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class DraftController {
  /**
   * **이 스테이지가 열린 순간의** 보유 현황 (플레이어 id → 보유 증강).
   *
   * ## 왜 스냅샷인가 — 실제로 게임이 죽었다
   *
   * `heldByOthers`가 살아 있는 상태를 읽으면 **내 후보가 남의 픽에 흔들린다.**
   * 스테이지 진행은 (전원에게 오퍼 → 전원 응답 → 고정 순서로 픽 적용)인데,
   * `pick`은 "제시된 것인가"를 **다시 뽑아서** 검증한다. 앞 사람의 픽이 이미
   * 적용된 뒤라 그 픽이 내 금지 목록에 새로 들어가고, 그러면 내 후보가 달라져
   * 내가 고른 것이 "제시된 적 없다"가 된다 — `Augment X was not offered to pY`로
   * **게임 진행이 예외로 끊긴다.**
   *
   * 칸(`cellFor`)이 서로 소라 원래는 이런 일이 없어야 하지만, 칸이 말라 **칸 밖에서
   * 보충**하면 남의 칸에 있는 증강이 새어 들어온다. 그때 둘이 같은 것을 고르면 터진다.
   * (증강 켠 아레나 60배패에서 재현됐다.)
   *
   * 스냅샷이면 스테이지 도중에는 무엇도 변하지 않는다 — "이미 누가 보유한 증강은
   * 다시 제시하지 않는다"는 뜻도 그대로 지켜진다. 이번 스테이지에 **동시에** 고른
   * 것까지 막지는 못하지만, 그건 애초에 칸이 막던 일이고 예외로 끊는 것보다 낫다.
   *
   * 스테이지별로 **처음 뽑을 때** 찍는다(생성자가 아니다) — 컨트롤러 하나로 여러
   * 스테이지를 도는 호출자가 있고, 그때도 "앞 스테이지에서 누가 가져간 것"은
   * 제외돼야 하기 때문이다.
   */
  private readonly heldAtStageStart = new Map<
    DraftStage,
    ReadonlyMap<PlayerId, readonly string[]>
  >();

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

  /**
   * 다른 플레이어가 **이 스테이지에 들어오기 전에** 보유한 증강 id
   * (한 게임에 같은 증강이 둘 있지 않게). 스냅샷을 읽는 이유는 위 필드 주석에.
   */
  private heldByOthers(stage: DraftStage, player: PlayerId): Set<string> {
    let snapshot = this.heldAtStageStart.get(stage);
    if (snapshot === undefined) {
      snapshot = new Map(
        this.engine.state.players.map((p) => [p.id, [...p.augments]] as const),
      );
      this.heldAtStageStart.set(stage, snapshot);
    }
    const out = new Set<string>();
    for (const [id, augments] of snapshot) {
      if (id === player) continue;
      for (const augId of augments) out.add(augId);
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
   *   다만 칸이 마르면 칸 밖에서 보충하는 통로가 있어 이 성질이 새어 나갔다 — 그래서
   *   금지 목록의 근거(`heldByOthers`)는 **스테이지 시작 시점 스냅샷**으로 고정한다.
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
    // 칸 크기는 제시 수의 6배(최소 18) — 스테이지가 4회(반장전)로 늘면서 마지막 스테이지에는
    // 남들이 이미 가진 것(최대 3×3=9)과 내가 가진 것(3)이 내 칸에서 빠질 수 있다. 그래도
    // 3개를 채우려면 3+9+3=15가 필요하므로 18로 잡아 여유를 둔다. 칸이 마르면 칸 밖에서
    // 보충하는데(아래 roll), 그 경로는 남의 보유분을 걸러 내지 못해 중복이 새어 나간다.
    // 칸 밖에는 보충용 나머지가 최소 count개 남아야 한다.
    const cellSize = Math.max(count * 6, 18);
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
    const bias = this.synergyBiasFor(player);

    const cell = this.cellFor(stage, player);
    if (cell === null) return this.catalog.rollUniform(prng, count, exclude, bias);

    // 내 칸에서 뽑는다 — 기존 제외 + 남이 이미 가진 것(게임 내 중복 금지).
    const banned = new Set([...exclude, ...this.heldByOthers(stage, player)]);
    const chosen = this.catalog.rollFromCell(prng, count, cell, banned, bias);
    if (chosen.length >= count) return chosen;

    // 칸이 말라붙은 극단적 경우에만 칸 밖에서 보충한다. 보충분에도 **같은 금지 목록**을
    // 건다 — 금지 목록이 스테이지 내내 고정(스냅샷)이라 pick 검증이 흔들리지 않는다.
    // (예전에는 여기서만 남의 보유분을 걸러 내지 못해 같은 증강이 둘에게 새어 나갔다.)
    const picked = new Set(chosen.map((d) => d.id));
    const rest = this.catalog
      .all()
      .filter((d) => !banned.has(d.id) && !picked.has(d.id));
    return [
      ...chosen,
      ...this.catalog.rollFromCell(prng, count - chosen.length, rest, new Set(), bias),
    ];
  }

  /**
   * 이 플레이어의 **보유 증강과의 시너지** 편향 (증강 id → 가중치 배수).
   *
   * 첫 스테이지에는 보유가 없어 빈 객체 = 완전 중립이다. 이후 스테이지에서는
   * 이미 집은 것과 축이 겹치는 증강이 더 자주, 서로 죽는 증강이 덜 뜬다
   * (표와 사유는 `augment/synergy.ts` · docs/26).
   *
   * **결정성**: 근거가 `player` 본인의 보유 목록뿐이라 `excludeFor`와 같은 안정성을
   * 가진다 — 스테이지 도중 남이 픽해도 내 후보가 흔들리지 않는다. 내 보유 목록은
   * 내가 픽하는 순간에만 바뀌고, `pick`은 제출 **전에** `roll`을 다시 계산해 검증한다.
   */
  private synergyBiasFor(player: PlayerId): Readonly<Record<string, number>> {
    const held =
      this.engine.state.players.find((p) => p.id === player)?.augments ?? [];
    return synergyBias(held);
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
