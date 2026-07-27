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
 * - 깡(안깡·가깡·역패 대명깡)은 "손을 망치지 않을 때만" — 텐파이면 깡 뒤에도 텐파이가
 *   유지될 때, 노텐이면 그 4장이 슌쯔로 쓰일 여지가 없을 때.
 * - 후로하지 않으면 멘젠 유지 → 텐파이면 리치.
 * - 버림은 뷰의 패 정보로 "고립도"를 계산해 가장 쓸모없는 패부터(목표 역 반영).
 * - 액티브 증강은 각 증강 파일의 `bot` 정책(AugmentDef.bot)에 판단을 위임한다.
 *   드래프트에서는 그 판단을 할 수 없는 증강(BOT_UNUSABLE_AUGMENTS)을 후순위로 민다.
 *
 * 설계: docs/00_MASTER_ARCHITECTURE.md §5.4
 */

import { BOT_UNUSABLE_AUGMENTS } from "@majak/content";
import { Prng } from "@majak/core/engine/random/Prng.js";
import { isTenpai, winningKinds } from "@majak/core/mahjong/scoring/waits.js";
import type { PlayerAgent } from "@majak/core/match/PlayerAgent.js";
import type { PlayerView } from "@majak/core/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "@majak/core/mahjong/flow/FlowController.js";
import type {
  AugmentDef,
  BotDecisionContext,
  BotRng,
} from "@majak/core/augment/Augment.js";
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

/** kinds에서 remove의 각 패를 한 장씩 뺀 새 목록 (깡 뒤 손패 계산용) */
function removeKinds(kinds: TileKind[], remove: TileKind[]): TileKind[] {
  const out = [...kinds];
  for (const r of remove) {
    const i = out.findIndex((k) => k.suit === r.suit && k.rank === r.rank);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

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
    // 끝패(1·9)는 슌쯔 확장이 한쪽뿐이라 약간 감점
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
  /** 증강 정책이 쓰는 결정론 난수 어댑터 (같은 rng를 공유) */
  private readonly botRng: BotRng;
  /** 증강 id → 정의 (액티브 증강 정책 조회용). 없으면 봇은 증강을 발동하지 않는다 */
  private readonly catalog: ReadonlyMap<string, AugmentDef>;
  private lastView: PlayerView | null = null;
  /** 현재 국 식별자 (바뀌면 목표 역 초기화) */
  private roundKey = "";
  /** 후로로 정한 이번 국 목표 역 */
  private plan: OpenPlan = null;

  constructor(
    id: PlayerId,
    nickname?: string,
    seed?: number,
    catalog?: Iterable<AugmentDef>,
    /** 행동 전 생각 시간(ms). 0이면 즉시 결정(테스트 기본) */
    private readonly thinkMs = 0,
  ) {
    this.id = id;
    this.nickname = nickname ?? `Bot_${id}`;
    this.rng = new Prng(seed ?? seedFromId(id));
    this.botRng = {
      int: (n) => this.rng.int(n),
      float: () => this.rng.next(),
    };
    const map = new Map<string, AugmentDef>();
    for (const def of catalog ?? []) map.set(def.id, def);
    this.catalog = map;
  }

  sendView(view: PlayerView): void {
    this.lastView = view;
    const rk = `${view.round.prevalentWind}-${view.round.roundNumber}-${view.round.honba}`;
    if (rk !== this.roundKey) {
      this.roundKey = rk;
      this.plan = null; // 새 국 → 목표 역 초기화
    }
  }

  /**
   * 결정 자체는 즉시 나오지만, 사람이 보기에 자연스럽도록 생각 시간을 둔다.
   * 패스(리액션 거절)는 화면에 아무 변화도 없으므로 지연 없이 즉시 넘긴다.
   */
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const chosen = this.decideNow(prompt);
    if (this.thinkMs > 0 && chosen.type !== "pass") {
      await new Promise((resolve) => setTimeout(resolve, this.thinkMs));
    }
    return chosen;
  }

  private decideNow(prompt: DecisionPrompt): ActionOption {
    const { options } = prompt;

    // 1. 화료는 무조건 (론·쯔모)
    const win = options.find((o) => o.type === "win");
    if (win) return win;

    // 2. 액티브 증강 발동 — 상황에 맞으면(증강 정책이 판단) 발동한다.
    //    증강 액션은 버림을 소비하지 않는 '추가 행동'이라, 발동 후 봇은 다시
    //    프롬프트를 받아 리치·버림을 이어간다. 그래서 콜·리치·버림보다 먼저 본다.
    const augment = this.chooseAugment(options);
    if (augment) return augment;

    // 3. 깡(안깡·가깡) — 손을 망치지 않을 때만. 깡은 버림을 소비하지 않는
    //    추가 행동이라(영상패를 뽑고 다시 프롬프트가 온다) 콜·리치보다 먼저 본다.
    const kan = this.chooseKan(options);
    if (kan) return kan;

    // 4. 리액션 콜(펑·치·대명깡): 역을 만들 수 있을 때만 후로
    const call = this.chooseCall(options);
    if (call) return call;

    // 5. 멘젠 텐파이면 리치 — 여러 선언패 후보 중 가장 쓸모없는 패로
    const riichis = options.filter((o) => o.type === "riichi");
    if (riichis.length > 0) return this.pickWorstTile(riichis);

    // 6. (콜 프롬프트에서 후로 안 하기로 함) 패스
    const pass = options.find((o) => o.type === "pass");
    if (pass) return pass;

    // 7. 내 차례 버림 — 목표 역을 반영한 고립도 휴리스틱
    const discards = options.filter((o) => o.type === "discard");
    if (discards.length > 0) return this.pickWorstTile(discards);

    // 8. 그 외(강제 선택지) 랜덤
    const idx = this.rng.int(options.length);
    return options[idx] ?? options[0]!;
  }

  // ─────────────────────────── 액티브 증강 발동 ───────────────────────────

  /**
   * 보유 액티브 증강의 봇 정책을 순회하며 발동할 옵션을 고른다. 없으면 null.
   * 각 증강 정책(AugmentDef.bot)은 자기 소유 옵션만 골라야 하고, 여기서는
   * 정책이 돌려준 옵션이 실제로 이번 프롬프트에 제시됐는지 한 번 더 확인한다
   * (제시되지 않은 옵션을 제출하면 FlowController가 throw).
   */
  private chooseAugment(options: ActionOption[]): ActionOption | null {
    const view = this.lastView;
    if (view === null) return null;
    const me = view.players.find((p) => p.id === this.id);
    if (me === undefined || me.augments.length === 0) return null;

    const ctx: BotDecisionContext = {
      view,
      options,
      holder: this.id,
      rng: this.botRng,
      tenpai: this.isTenpai(view),
    };
    // 보유 증강 순서대로 — 먼저 발동을 원하는 증강을 채택 (결정론적)
    for (const augId of me.augments) {
      const policy = this.catalog.get(augId)?.bot;
      if (policy === undefined) continue;
      const picked = policy.choose(ctx);
      if (picked === null) continue;
      const key = JSON.stringify(picked);
      const match = options.find((o) => JSON.stringify(o) === key);
      if (match !== undefined) return match;
    }
    return null;
  }

  /**
   * 봇이 텐파이(1장만 더 오면 화료)인지 — 증강 발동 타이밍 판단용.
   * 손패가 13장(대기형)이면 바로, 14장(쯔모 직후 act)이면 한 장씩 빼 보며 판정한다.
   */
  private isTenpai(view: PlayerView): boolean {
    const hand = view.zones[`hand:${this.id}`]?.tileIds ?? [];
    const kinds: TileKind[] = [];
    for (const id of hand) {
      const k = view.tiles[id]?.kind;
      if (k !== undefined) kinds.push(k);
    }
    if (kinds.length === 0) return false;
    const meldCount = view.round.byPlayer[this.id]?.meldCount ?? 0;
    if (isTenpai(kinds, meldCount)) return true;
    // 14장(쯔모 후): 한 장을 버려 대기형이 되는지
    for (let i = 0; i < kinds.length; i++) {
      const rest = kinds.slice(0, i).concat(kinds.slice(i + 1));
      if (isTenpai(rest, meldCount)) return true;
    }
    return false;
  }

  // ─────────────────────────── 깡 판단 ───────────────────────────

  /**
   * 안깡·가깡을 할지 고른다. 없으면 null.
   *
   * 깡은 새로운 도라·영상패·부수를 공짜로 주지만 손패 구조를 하나 고정시킨다. 그래서
   * "손을 망치지 않는 깡"만 한다 — 텐파이면 **깡 뒤에도 텐파이가 유지될 때만**,
   * 텐파이가 아니면 그 4장이 슌쯔로 쓰일 여지가 없을 때만(자패이거나 이웃 없음).
   *
   * 배경(2026-07-26): 봇은 여태 깡을 **한 번도** 하지 않았다(제시 166회·발동 0회).
   * 그래서 깡을 전제로 하는 증강(절벽 위에 피어난 꽃·밀실의 도라·장사진·바람의
   * 계보·영상 정찰)이 봇 손에서는 통째로 죽어 있었다.
   *
   * 서로 다른 패로 이루어진 깡(장사진·동남서북)은 이득 계산이 손패 가치에 달려
   * 있어 여기서 판단하지 않는다 — 그 증강의 `bot` 정책이 직접 고른다.
   */
  private chooseKan(options: ActionOption[]): ActionOption | null {
    const view = this.lastView;
    if (view === null) return null;
    const handKinds = this.concealedKinds(view);
    const meldCount = view.round.byPlayer[this.id]?.meldCount ?? 0;
    const tenpaiNow = this.isTenpai(view);

    // 가깡 — 이미 펑한 묶음의 4번째. 손패에서 1장을 뺄 뿐이라 거의 언제나 이득이다.
    for (const o of options) {
      if (o.type !== "shouminkan") continue;
      const tileId = (o.payload as { tileId?: TileId }).tileId;
      const kind = tileId !== undefined ? view.tiles[tileId]?.kind : undefined;
      if (kind === undefined) continue;
      const rest = removeKinds(handKinds, [kind]);
      if (tenpaiNow && !isTenpai(rest, meldCount)) continue; // 대기를 깨는 가깡은 안 한다
      return o;
    }

    // 안깡 — 같은 종류 4장만 여기서 판단한다.
    for (const o of options) {
      if (o.type !== "ankan") continue;
      const ids = (o.payload as { tileIds?: TileId[] }).tileIds ?? [];
      const kinds: TileKind[] = [];
      for (const id of ids) {
        const k = view.tiles[id]?.kind;
        if (k !== undefined) kinds.push(k);
      }
      if (kinds.length !== 4) continue;
      const head = kinds[0]!;
      const sameKind = kinds.every((k) => k.suit === head.suit && k.rank === head.rank);
      if (!sameKind) continue; // 장사진·동남서북 깡 → 증강 정책 담당
      const rest = removeKinds(handKinds, kinds);
      if (tenpaiNow) {
        // 깡 뒤에도 텐파이여야 하고, 그 대기가 **깡친 패 자체만**이어서는 안 된다
        // (4장을 다 눕혔으니 그 패는 한 장도 안 남는다 = 죽은 대기).
        if (!isTenpai(rest, meldCount + 1)) continue;
        const waits = winningKinds(rest, meldCount + 1);
        const alive = waits.some((w) => !(w.suit === head.suit && w.rank === head.rank));
        if (alive) return o;
        continue;
      }
      // 노텐: 같은 패 4장은 커쯔 하나로 굳는 게 보통이라 기본적으로 깡한다.
      // 다만 남은 손에 이웃(±1·±2 같은 색)이 둘 이상이면 슌쯔로 쓸 여지가 실제로
      // 있으므로 그때만 참는다.
      if (!isNumber(head)) return o;
      const neighbors = rest.filter(
        (k) => k.suit === head.suit && Math.abs(k.rank - head.rank) <= 2,
      ).length;
      if (neighbors < 2) return o;
    }
    return null;
  }

  /** 감춰진 손패(후로 제외)의 kind 목록 */
  private concealedKinds(view: PlayerView): TileKind[] {
    const out: TileKind[] = [];
    for (const id of view.zones[`hand:${this.id}`]?.tileIds ?? []) {
      const k = view.tiles[id]?.kind;
      if (k !== undefined) out.push(k);
    }
    return out;
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

    // (a) 역패 펑 — 그 커쯔 자체가 역이라 나머지 손과 무관하게 항상 화료 가능.
    //     같은 패로 대명깡까지 가능하면 깡이 상위 호환이다(역은 그대로, 새로운 도라·영상패
    //     ·부수가 얹힌다). 자패는 슌쯔로 쓸 일이 없어 4장째를 손에 남길 이유가 없다.
    if (pons.length > 0 && this.isYakuhai(view, calledKind)) {
      this.plan = { yaku: "yakuhai" };
      const minkan = options.find((o) => o.type === "minkan");
      if (minkan !== undefined && !isNumber(calledKind)) return minkan;
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

  /** 자기 손패(후로 포함)의 kind 목록 */
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

  /** 손패(후로 포함)가 전부 심플(2~8)이라 탕야오로 갈 수 있는가 */
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
    // 봇이 발동 판단을 할 수 없는 액티브 증강(폴드·다단계 교환류)은 뽑아 봐야
    // 게임 내내 놀린다 → 나머지 선택지가 있으면 그쪽을 먼저 고른다.
    // (패시브 증강은 발동이 필요 없으므로 여기서 걸리지 않는다.)
    const usable = choices.filter((c) => !BOT_UNUSABLE_AUGMENTS.includes(c.id));
    const pool = usable.length > 0 ? usable : choices;
    // 같은 후보군 안에서는 시드 PRNG로 픽 (시드만으로 재현 가능 — 결정론 유지)
    const idx = this.rng.int(pool.length);
    return pool[idx]?.id ?? pool[0]!.id;
  }
}
