/**
 * DraftController — 개인별 3지선다 드래프트의 진행.
 *
 * 선택지는 (게임 시드, 스테이지, 플레이어)에서 파생된 별도 PRNG로 뽑는다 —
 * 게임 진행용 PRNG를 소비하지 않으며, 언제든 재계산 가능하다.
 * 상태를 바꾸는 것은 오직 픽(AugmentDrafted)이다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §3~4
 */

import { Prng } from "../engine/random/Prng.js";
import type { GameEngine } from "../engine/GameEngine.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import { installAugment } from "./Augment.js";
import type { AugmentDef, AugmentExtras, AugmentTier } from "./Augment.js";
import { AugmentRegistry } from "./AugmentRegistry.js";
import type { TierWeights } from "./AugmentRegistry.js";

const TIER_ORDER: AugmentTier[] = ["silver", "gold", "prism"];

/** 드래프트 스테이지 (게임 시작 / 남장 진입) */
export type DraftStage = "gameStart" | "southEntry";

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

  private weights(): TierWeights {
    return {
      silver: this.engine.rules.resolve<number>("augment.draft.weight.silver"),
      gold: this.engine.rules.resolve<number>("augment.draft.weight.gold"),
      prism: this.engine.rules.resolve<number>("augment.draft.weight.prism"),
    };
  }

  /**
   * 이 증강턴에 (전원 공통으로) 제시할 등급을 확률로 하나 고른다.
   * 시드에 player를 넣지 않아 모든 플레이어가 같은 등급을 받고, 리플레이에서도 재현된다.
   */
  tierForStage(stage: DraftStage): AugmentTier {
    const w = this.weights();
    const candidates = TIER_ORDER.filter(
      (t) => w[t] > 0 && this.catalog.byTier(t).length > 0,
    );
    if (candidates.length === 0) return "silver";
    const seed = (this.engine.state.config.seed ^ hashString(`tier:${stage}`)) >>> 0;
    const prng = new Prng(seed);
    const total = candidates.reduce((s, t) => s + w[t], 0);
    let roll = prng.next() * total;
    for (const t of candidates) {
      roll -= w[t];
      if (roll < 0) return t;
    }
    return candidates[candidates.length - 1] as AugmentTier;
  }

  /** 이 스테이지·플레이어에게 제외할 증강 id (보유 ∪ 스테이지 부적합) */
  private excludeFor(stage: DraftStage, player: PlayerId): Set<string> {
    const state = this.engine.state;
    const exclude = new Set(
      state.players.find((p) => p.id === player)?.augments ?? [],
    );
    for (const def of this.catalog.all()) {
      if (def.draftStages !== undefined && !def.draftStages.includes(stage)) {
        exclude.add(def.id);
      }
    }
    return exclude;
  }

  /**
   * 이 플레이어에게 제시할 3개. 결정적이므로 몇 번 호출해도 같은 결과.
   * 등급은 이 증강턴 공통(tierForStage)이고, 그 등급 안에서 플레이어별로 다른 카드를 뽑는다.
   */
  roll(stage: DraftStage, player: PlayerId): AugmentDef[] {
    const state = this.engine.state;
    const exclude = this.excludeFor(stage, player);
    const tier = this.tierForStage(stage);
    const seed = (state.config.seed ^ hashString(`${stage}:${player}`)) >>> 0;
    const prng = new Prng(seed);
    const count = this.engine.rules.resolve<number>("augment.draft.choices");
    return this.catalog.rollFromTier(prng, tier, count, exclude);
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
    this.grantChain(stage, player, def, this.ownedIds(player));
  }

  private ownedIds(player: PlayerId): Set<string> {
    return new Set(
      this.engine.state.players.find((p) => p.id === player)?.augments ?? [],
    );
  }

  /**
   * 도박사 계열 지급 — def.grantsRandomTier가 있으면 그 등급의 무작위 증강 1개를
   * 추가로 지급(픽·설치)한다. 지급된 증강이 또 지급 속성을 가지면 연쇄한다.
   * 지급은 markStage 없이 기록되어 스테이지 완료 플래그를 건드리지 않는다.
   */
  private grantChain(
    stage: DraftStage,
    player: PlayerId,
    def: AugmentDef,
    owned: Set<string>,
  ): void {
    const tier = def.grantsRandomTier;
    if (tier === undefined) return;
    const exclude = new Set(owned);
    for (const d of this.catalog.all()) {
      if (d.draftStages !== undefined && !d.draftStages.includes(stage)) {
        exclude.add(d.id);
      }
    }
    const seed =
      (this.engine.state.config.seed ^ hashString(`grant:${stage}:${player}:${def.id}`)) >>> 0;
    const rolled = this.catalog.rollFromTier(new Prng(seed), tier, 1, exclude)[0];
    if (rolled === undefined) return; // 풀 고갈 — 아무것도 지급하지 않음
    const result = this.engine.submit({
      player,
      type: "draftPick",
      payload: { augmentId: rolled.id },
    });
    if (!result.ok) throw new Error(`grant draftPick failed: ${result.reason}`);
    installAugment(this.engine, rolled, player, this.extras);
    owned.add(rolled.id);
    this.grantChain(stage, player, rolled, owned);
  }
}

/** 게임 재구성·리플레이용: state.augments에 있는 모든 증강을 재설치한다 */
export function rebuildAugments(
  engine: GameEngine,
  catalog: AugmentRegistry,
  extras: AugmentExtras = {},
): void {
  for (const player of engine.state.players) {
    for (const augmentId of player.augments) {
      const def = catalog.get(augmentId);
      if (def === undefined) {
        throw new Error(`Cannot rebuild unknown augment: ${augmentId}`);
      }
      installAugment(engine, def, player.id, extras);
    }
  }
}
