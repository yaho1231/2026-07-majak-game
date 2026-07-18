/**
 * BotAgent — 규칙 기반 단순 봇 (역을 노리고 후로도 하는 준-실전형).
 *
 * 전략:
 * - 화료 가능하면 무조건 화료(론·쯔모).
 * - 후로(펑·치)는 "역을 만들 수 있을 때만" 한다:
 *     · 역패(백·발·중·자풍·장풍) 펑 → 그 커쯔 자체가 역이라 항상 안전.
 *     · 혼일색 지향(수패가 거의 한 색) → 그 색·자패를 펑/치.
 *     · 탕야오 지향(손패가 전부 2~8) → 심플 패를 펑/치.
 *   후로하면 그 국의 목표 역(plan)을 기억하고, 이후 버림을 그 역에 맞게 고른다.
 * - 후로하지 않으면 멘젠 유지 → 텐파이면 리치.
 * - 버림은 뷰의 패 정보로 "고립도"를 계산해 가장 쓸모없는 패부터(목표 역 반영).
 *
 * 설계: docs/00_MASTER_ARCHITECTURE.md §5.4
 */

import { Prng } from "@majak/core/engine/random/Prng.js";
import type { PlayerAgent } from "@majak/core/match/PlayerAgent.js";
import type { PlayerView } from "@majak/core/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "@majak/core/mahjong/flow/FlowController.js";
import type { AugmentDef } from "@majak/core/augment/Augment.js";
import type { DraftStage } from "@majak/core/network/protocol.js";
import type { PlayerId } from "@majak/core/engine/zones/Zone.js";
import type { TileId, TileKind } from "@majak/core/mahjong/tiles/Tile.js";

/** 플레이어 id에서 안정적 시드 파생 (결정론 유지) */
function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type NumberSuit = "man" | "pin" | "sou";
const NUMBER_SUITS = new Set<string>(["man", "pin", "sou"]);

/** 목표 역 (후로로 손을 열 때 정해진다) */
type OpenPlan =
  | { yaku: "yakuhai" }
  | { yaku: "honitsu"; suit: NumberSuit }
  | { yaku: "tanyao" }
  | null;

const isNumber = (k: TileKind): boolean => NUMBER_SUITS.has(k.suit);
const isSimple = (k: TileKind): boolean => isNumber(k) && k.rank >= 2 && k.rank <= 8;
const isTerminalOrHonor = (k: TileKind): boolean =>
  !isNumber(k) || k.rank === 1 || k.rank === 9;

/**
 * 패의 "손에 남길 가치" 점수. 낮을수록 먼저 버린다.
 * plan이 있으면 그 역에 맞지 않는 패를 크게 감점해 목표 역으로 손을 몰아간다.
 */
export function keepValue(
  kind: TileKind,
  handKinds: TileKind[],
  plan: OpenPlan = null,
): number {
  // 목표 역에 어긋나는 패는 최우선 버림
  if (plan?.yaku === "honitsu" && isNumber(kind) && kind.suit !== plan.suit) {
    return -100;
  }
  if (plan?.yaku === "tanyao" && isTerminalOrHonor(kind)) {
    return -100;
  }

  const copies = handKinds.filter(
    (k) => k.suit === kind.suit && k.rank === kind.rank,
  ).length;
  let value = (copies - 1) * 6;

  if (isNumber(kind)) {
    for (const k of handKinds) {
      if (k.suit !== kind.suit) continue;
      const d = Math.abs(k.rank - kind.rank);
      if (d === 1) value += 3;
      else if (d === 2) value += 1;
    }
    // 끝패(1·9)는 순자 확장이 한쪽뿐이라 약간 감점
    if (kind.rank === 1 || kind.rank === 9) value -= 1;
  }
  // 자패는 이웃 보너스가 없어 홀로면 0점 → 자연히 최우선 버림
  return value;
}

export class BotAgent implements PlayerAgent {
  readonly id: PlayerId;
  readonly nickname: string;
  readonly isBot = true;
  private readonly rng: Prng;
  private lastView: PlayerView | null = null;
  /** 현재 국 식별자 (바뀌면 목표 역 초기화) */
  private roundKey = "";
  /** 후로로 정한 이번 국 목표 역 */
  private plan: OpenPlan = null;

  constructor(id: PlayerId, nickname?: string, seed?: number) {
    this.id = id;
    this.nickname = nickname ?? `Bot_${id}`;
    this.rng = new Prng(seed ?? seedFromId(id));
  }

  sendView(view: PlayerView): void {
    this.lastView = view;
    const rk = `${view.round.prevalentWind}-${view.round.roundNumber}-${view.round.honba}`;
    if (rk !== this.roundKey) {
      this.roundKey = rk;
      this.plan = null; // 새 국 → 목표 역 초기화
    }
  }

  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const { options } = prompt;

    // 1. 화료는 무조건 (론·쯔모)
    const win = options.find((o) => o.type === "win");
    if (win) return win;

    // 2. 리액션 콜(펑·치): 역을 만들 수 있을 때만 후로
    const call = this.chooseCall(options);
    if (call) return call;

    // 3. 멘젠 텐파이면 리치 — 여러 선언패 후보 중 가장 쓸모없는 패로
    const riichis = options.filter((o) => o.type === "riichi");
    if (riichis.length > 0) return this.pickWorstTile(riichis);

    // 4. (콜 프롬프트에서 후로 안 하기로 함) 패스
    const pass = options.find((o) => o.type === "pass");
    if (pass) return pass;

    // 5. 내 차례 버림 — 목표 역을 반영한 고립도 휴리스틱
    const discards = options.filter((o) => o.type === "discard");
    if (discards.length > 0) return this.pickWorstTile(discards);

    // 6. 그 외(강제 선택지) 랜덤
    const idx = this.rng.int(options.length);
    return options[idx] ?? options[0]!;
  }

  // ─────────────────────────── 후로 판단 ───────────────────────────

  /**
   * 펑·치 옵션 중 "역을 만들 수 있는" 콜을 고른다. 없으면 null(패스).
   * 우선순위: 역패 펑 > 혼일색 > 탕야오.
   */
  private chooseCall(options: ActionOption[]): ActionOption | null {
    const view = this.lastView;
    if (view === null) return null;
    const pons = options.filter((o) => o.type === "pon");
    const chis = options.filter((o) => o.type === "chi");
    if (pons.length === 0 && chis.length === 0) return null;

    const ld = view.round.lastDiscard;
    if (ld === null) return null;
    const calledKind = view.tiles[ld.tileId]?.kind;
    if (calledKind === undefined) return null;

    // (a) 역패 펑 — 그 커쯔 자체가 역이라 나머지 손과 무관하게 항상 화료 가능
    if (pons.length > 0 && this.isYakuhai(view, calledKind)) {
      this.plan = { yaku: "yakuhai" };
      return pons[0]!;
    }

    // (b) 혼일색 지향 — 수패가 거의 한 색이면 그 색·자패를 부른다
    const hSuit = this.honitsuSuit(view);
    if (hSuit !== null) {
      const honor = !isNumber(calledKind);
      if (calledKind.suit === hSuit || honor) {
        this.plan = { yaku: "honitsu", suit: hSuit };
        if (honor && pons.length > 0) return pons[0]!; // 자패는 펑만
        if (pons.length > 0) return pons[0]!;
        if (chis.length > 0) return chis[0]!;
      }
    }

    // (c) 탕야오 지향 — 손패가 전부 심플이고 부르는 패도 심플일 때만
    if (this.tanyaoShaped(view) && isSimple(calledKind)) {
      this.plan = { yaku: "tanyao" };
      if (pons.length > 0) return pons[0]!;
      if (chis.length > 0) return chis[0]!;
    }

    return null;
  }

  /** 자기 손패(부로 포함)의 kind 목록 */
  private myKinds(view: PlayerView): TileKind[] {
    const out: TileKind[] = [];
    const hand = view.zones[`hand:${this.id}`]?.tileIds ?? [];
    for (const id of hand) {
      const k = view.tiles[id]?.kind;
      if (k !== undefined) out.push(k);
    }
    for (const m of view.round.byPlayer[this.id]?.melds ?? []) {
      for (const id of m.tileIds) {
        const k = view.tiles[id]?.kind;
        if (k !== undefined) out.push(k);
      }
    }
    return out;
  }

  /** 이 봇의 자풍 (1동 2남 3서 4북) */
  private seatWind(view: PlayerView): number {
    const me = view.players.find((p) => p.id === this.id);
    if (me === undefined) return 0;
    const n = view.players.length;
    const dir = view.round.direction;
    const diff = me.seat - view.round.dealerSeat;
    return ((((diff * dir) % n) + n) % n) + 1;
  }

  /** 이 패가 이 봇에게 역패인가 (삼원패 · 자풍 · 장풍) */
  private isYakuhai(view: PlayerView, kind: TileKind): boolean {
    if (kind.suit === "dragon") return true;
    if (kind.suit === "wind") {
      return kind.rank === this.seatWind(view) || kind.rank === view.round.prevalentWind;
    }
    return false;
  }

  /**
   * 혼일색으로 갈 만한 색을 돌려준다 (아니면 null).
   * 수패가 한 색에 몰려(딴 색 ≤1장) 그 색이 5장 이상일 때만 커밋한다.
   */
  private honitsuSuit(view: PlayerView): NumberSuit | null {
    const counts: Record<NumberSuit, number> = { man: 0, pin: 0, sou: 0 };
    let numberTotal = 0;
    for (const k of this.myKinds(view)) {
      if (isNumber(k)) {
        counts[k.suit as NumberSuit]++;
        numberTotal++;
      }
    }
    let best: NumberSuit | null = null;
    for (const s of ["man", "pin", "sou"] as NumberSuit[]) {
      if (best === null || counts[s] > counts[best]) best = s;
    }
    if (best === null) return null;
    const off = numberTotal - counts[best];
    return counts[best] >= 5 && off <= 1 ? best : null;
  }

  /** 손패(부로 포함)가 전부 심플(2~8)이라 탕야오로 갈 수 있는가 */
  private tanyaoShaped(view: PlayerView): boolean {
    const kinds = this.myKinds(view);
    return kinds.length > 0 && kinds.every((k) => isSimple(k));
  }

  // ─────────────────────────── 버림 선택 ───────────────────────────

  /** tileId payload를 가진 옵션 중 keepValue가 가장 낮은 패를 고른다 */
  private pickWorstTile(candidates: ActionOption[]): ActionOption {
    const view = this.lastView;
    if (view === null || candidates.length === 1) {
      return candidates[candidates.length - 1] ?? candidates[0]!;
    }
    const handKinds: TileKind[] = [];
    for (const opt of candidates) {
      const tileId = (opt.payload as { tileId?: TileId }).tileId;
      const meta = tileId !== undefined ? view.tiles[tileId] : undefined;
      if (meta !== undefined) handKinds.push(meta.kind);
    }
    let best: ActionOption | null = null;
    let bestValue = Infinity;
    for (const opt of candidates) {
      const tileId = (opt.payload as { tileId?: TileId }).tileId;
      const meta = tileId !== undefined ? view.tiles[tileId] : undefined;
      if (meta === undefined) continue;
      const value =
        keepValue(meta.kind, handKinds, this.plan) +
        (meta.attrs.red === true ? 4 : 0);
      // 동점이면 뒤쪽(쯔모패 쪽)을 버린다 — <= 로 뒤쪽 우선
      if (value <= bestValue) {
        bestValue = value;
        best = opt;
      }
    }
    return best ?? candidates[candidates.length - 1] ?? candidates[0]!;
  }

  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    // 드래프트: 시드 PRNG로 픽 (시드만으로 재현 가능 — 결정론 유지)
    const idx = this.rng.int(choices.length);
    return choices[idx]?.id ?? choices[0]!.id;
  }
}
