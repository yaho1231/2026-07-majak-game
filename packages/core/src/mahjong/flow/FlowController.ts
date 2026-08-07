/**
 * FlowController — 국 진행의 동기 상태 기계.
 *
 * 자동 페이즈(sys.*)를 진행하다가 플레이어 결정이 필요하면 멈추고
 * 프롬프트를 돌려준다. 프롬프트는 ActionDef.validate에서 유도된다 —
 * 합법인 선택지만 나열되고, submit 시 다시 검증된다 (Server Authority).
 *
 * reaction 해소 우선순위: 론(들) > 펑 > 치 > 패스. 트리플론은 유산국.
 *
 * 설계: docs/11_GAME_FLOW.md §2
 */

import type { GameEngine } from "../../engine/GameEngine.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import { WALL, discardsZone } from "../../engine/zones/Zone.js";
import { sameKind, kindKey } from "../tiles/Tile.js";
import type { TileId, TileKind } from "../tiles/Tile.js";
import { winningKinds } from "../scoring/waits.js";
import { DEFAULT_SEQUENCE_SUITS, honorMaxRank } from "../scoring/decompose.js";
import { ROUND_SETTLED, KAN_DECLARED } from "./flowEvents.js";
import type { RoundSettledPayload, KanDeclaredPayload } from "./flowEvents.js";
import type { SettleWinRequest } from "./standardActions.js";
import {
  SYSTEM_PLAYER,
  handIdsOf,
  winHandKindsOf,
  kindOf,
  meldCountOf,
  nextSeat,
  playerAtSeat,
  playerOf,
  furitenOptionsOf,
  scoringOptionsOf,
  sameCallKind,
  mixedTripletsFor,
  polarEndsFor,
  honorRunsFor,
  snakeKanFor,
} from "./helpers.js";

export interface ActionOption {
  type: string;
  payload: unknown;
}

export interface DecisionPrompt {
  player: PlayerId;
  options: ActionOption[];
  /**
   * 물어볼 것이 없는 강제 수 — 리치로 손이 잠겨 쯔모기리 외에는 둘 수 있는 수가
   * 하나도 없을 때만 붙는다(안깡·쯔모·리치 취소 같은 증강 선택지가 하나라도
   * 있으면 붙지 않는다). 진행부(HanchanController)는 이 프롬프트를 에이전트에게
   * 묻지 않고 그대로 둔다 — 사람은 매 순 같은 패를 다시 클릭하지 않아도 된다.
   *
   * 규칙 판정은 그대로다: options에는 유일한 합법 수가 들어 있고, 이 프롬프트를
   * 무시하고 직접 submit해도 결과는 같다 (테스트·리플레이는 영향 없음).
   */
  auto?: true;
}

export type FlowStatus =
  | { kind: "awaiting"; prompts: DecisionPrompt[] }
  | { kind: "roundOver"; outcome: "win" | "draw" | "abort" };

const PASS: ActionOption = { type: "pass", payload: {} };

/**
 * 리액션(버림패에 대한 선언)의 **우선순위**. 클수록 세다: 론 > 펑·대명깡 > 치 > 패스.
 * `resolve()`가 실제로 해소하는 순서와 같은 서열이며, 진행부(HanchanController)가
 * "이미 확정된 선언보다 약한 프롬프트는 더 기다릴 필요가 없다"를 판정하는 데 쓴다.
 *
 * 모르는 타입(증강이 붙인 커스텀 리액션)은 **최상위로 본다** — 무엇을 하는지 모르는
 * 선언을 임의로 접으면 증강이 조용히 죽는다. 접지 않고 물어보는 쪽이 안전하다.
 */
export function reactionPriority(type: string): number {
  switch (type) {
    case "pass":
      return 0;
    case "chi":
      return 1;
    case "pon":
    case "minkan":
      return 2;
    default:
      return 3;
  }
}

export class FlowController {
  private pending = new Map<PlayerId, ActionOption[]>();
  private decisions = new Map<PlayerId, ActionOption>();

  constructor(private readonly engine: GameEngine) {}

  /** setup부터 자동 진행. 첫 결정 지점(또는 즉시 종국)을 돌려준다 */
  begin(): FlowStatus {
    return this.runAuto();
  }

  isPending(player: PlayerId): boolean {
    return this.pending.has(player) && !this.decisions.has(player);
  }

  submit(player: PlayerId, option: ActionOption): FlowStatus {
    const offered = this.pending.get(player);
    if (offered === undefined) throw new Error(`No pending decision for ${player}`);
    if (this.decisions.has(player)) throw new Error(`${player} already decided`);
    const key = JSON.stringify(option);
    if (!offered.some((o) => JSON.stringify(o) === key)) {
      throw new Error(`Option was not offered to ${player}: ${key}`);
    }
    this.decisions.set(player, option);
    if (this.decisions.size < this.pending.size) {
      return {
        kind: "awaiting",
        prompts: [...this.pending.entries()]
          .filter(([id]) => !this.decisions.has(id))
          .map(([id, options]) => ({ player: id, options })),
      };
    }
    return this.resolve();
  }

  // ─────────────────────────── 내부 ───────────────────────────

  private sys(type: string, payload: unknown = {}): void {
    const result = this.engine.submit({ player: SYSTEM_PLAYER, type, payload });
    if (!result.ok) {
      throw new Error(`System action ${type} failed: ${result.reason}`);
    }
  }

  private validateOk(player: PlayerId, type: string, payload: unknown): boolean {
    const def = this.engine.actions.get(type);
    if (def === undefined) return false;
    return (
      def.validate(
        { player, type, payload },
        { state: this.engine.state, rules: this.engine.rules },
      ) === null
    );
  }

  private runAuto(): FlowStatus {
    for (;;) {
      const state = this.engine.state;
      const phase = state.round.phase;

      // 도중유국 자동판정 — 반드시 turn.draw 페이즈에서만 검사한다.
      // (1) 표준 룰 타이밍: 사깡산료·사풍연타는 해당 버림이 론 없이 통과한 뒤 성립
      //     (4번째 깡의 창깡·영상개화 기회, 4번째 풍패의 론 기회를 보존)
      // (2) round.over 페이즈에서 재발동해 settleAbort가 무한 반복되는 것을 방지
      if (
        phase === "turn.draw" &&
        state.round.kanCount === 4 &&
        new Set(state.round.kanCallers).size >= 2
      ) {
        this.sys("sys.settleAbort", { reason: "fourKan" }); // 사깡산료
        continue;
      }

      if (phase === "turn.draw" && state.round.firstTurn && this.isFourWindAbort()) {
        this.sys("sys.settleAbort", { reason: "fourWind" }); // 사풍연타
        continue;
      }

      let riichiCount = 0;
      for (const p of state.players) {
        if (state.round.byPlayer[p.id]?.riichi != null) riichiCount++;
      }
      if (riichiCount === 4 && phase === "turn.draw") {
        this.sys("sys.settleAbort", { reason: "fourRiichi" }); // 사가리치
        continue;
      }

      if (phase === "setup") {
        this.sys("sys.startRound");
        continue;
      }
      if (phase === "turn.draw") {
        if ((state.zones[WALL]?.tileIds.length ?? 0) === 0) {
          this.sys("sys.settleDraw");
        } else {
          this.sys("sys.draw");
        }
        continue;
      }
      if (phase === "turn.act") {
        return this.awaitDecisions([this.turnPrompt()]);
      }
      if (phase === "reaction") {
        const prompts = this.reactionPrompts();
        if (prompts.length === 0) {
          // 프롬프트 없이 지나가도 대기패가 흘러간 플레이어는 일시 후리텐
          // (역 없음·후리텐 등으로 론 옵션이 제시되지 않은 경우 포함 — 표준 룰)
          this.markPassFuriten();
          if (state.round.chankan !== null) {
            this.flipKanDoraBeforeRinshan();
            this.sys("sys.drawRinshan");
          } else {
            this.sys("sys.advanceTurn"); // 전원 자동 패스
          }
          continue;
        }
        return this.awaitDecisions(prompts);
      }
      if (phase === "round.over") {
        return { kind: "roundOver", outcome: this.lastOutcome() };
      }
      throw new Error(`FlowController: unhandled phase "${phase}"`);
    }
  }

  private awaitDecisions(prompts: DecisionPrompt[]): FlowStatus {
    this.pending = new Map(prompts.map((p) => [p.player, p.options]));
    this.decisions = new Map();
    return { kind: "awaiting", prompts };
  }

  private lastOutcome(): "win" | "draw" | "abort" {
    for (let i = this.engine.eventLog.length - 1; i >= 0; i--) {
      const event = this.engine.eventLog[i];
      if (event?.type === ROUND_SETTLED) {
        return (event.payload as RoundSettledPayload).outcome;
      }
    }
    throw new Error("round.over without RoundSettled event");
  }

  private turnPrompt(): DecisionPrompt {
    const state = this.engine.state;
    const player = playerAtSeat(state, state.round.turnSeat).id;
    const options: ActionOption[] = [];
    // 같은 종류 4장 안깡은 손패 4장을 각각 순회하며 4번 밀어넣히던 중복을 종류당 1개로 막는다
    const ankanKindsSeen = new Set<string>();
    for (const tileId of handIdsOf(state, player)) {
      if (this.validateOk(player, "discard", { tileId })) {
        options.push({ type: "discard", payload: { tileId } });
      }
      if (this.validateOk(player, "riichi", { tileId })) {
        options.push({ type: "riichi", payload: { tileId } });
      }

      const hand = handIdsOf(state, player);

      // 안깡 (ankan) — 같은 종류는 한 번만 제시 (서로 다른 종류의 안깡 2개는 각각 유지).
      // 무너진 국경이면 무늬가 섞인 4장(랭크만 같음)도 안깡이 된다.
      const mixedTri = mixedTripletsFor(state, this.engine.rules, player);
      const sameTiles = hand
        .filter((t) => sameCallKind(kindOf(state, t), kindOf(state, tileId), mixedTri))
        .slice(0, 4);
      if (sameTiles.length === 4) {
        const k = kindOf(state, tileId);
        // 혼색 안깡은 무늬가 달라도 한 묶음이므로 랭크로 중복을 막는다
        const key = mixedTri ? `rank:${k.suit === "wind" || k.suit === "dragon" ? kindKey(k) : k.rank}` : kindKey(k);
        if (!ankanKindsSeen.has(key) && this.validateOk(player, "ankan", { tileIds: sameTiles })) {
          ankanKindsSeen.add(key);
          options.push({ type: "ankan", payload: { tileIds: sameTiles } });
        }
      }

      // 동남서북 안깡 (바람의 계보) — 네 바람 각 1장이면 한 깡으로 (종류당 한 번만 제시)
      if (
        !ankanKindsSeen.has("fourwinds") &&
        honorRunsFor(state, this.engine.rules, player)
      ) {
        const windIds = [1, 2, 3, 4].map((r) =>
          hand.find((t) => {
            const kk = kindOf(state, t);
            return kk.suit === "wind" && kk.rank === r;
          }),
        );
        if (windIds.every((x): x is number => x !== undefined)) {
          const quad = windIds as [number, number, number, number];
          if (this.validateOk(player, "ankan", { tileIds: quad })) {
            ankanKindsSeen.add("fourwinds");
            options.push({ type: "ankan", payload: { tileIds: quad } });
          }
        }
      }
      
      // 4연속 안깡 (장사진) — 같은 무늬 연속 4장을 한 깡으로 (시작 랭크당 한 번만 제시)
      if (snakeKanFor(state, this.engine.rules, player)) {
        for (const suit of DEFAULT_SEQUENCE_SUITS) {
          for (let start = 1; start + 3 <= 9; start++) {
            const seenKey = `snake:${suit}${start}`;
            if (ankanKindsSeen.has(seenKey)) continue;
            const ids = [0, 1, 2, 3].map((d) =>
              hand.find((t) => {
                const kk = kindOf(state, t);
                return kk.suit === suit && kk.rank === start + d;
              }),
            );
            if (!ids.every((x): x is number => x !== undefined)) continue;
            const quad = ids as [number, number, number, number];
            if (this.validateOk(player, "ankan", { tileIds: quad })) {
              ankanKindsSeen.add(seenKey);
              options.push({ type: "ankan", payload: { tileIds: quad } });
            }
          }
        }
      }

      // 소대명깡 (shouminkan)
      for (const m of state.round.byPlayer[player]?.melds ?? []) {
        if (m.kind === "pon" && m.tileIds.length === 3) {
          const tk = kindOf(state, m.tileIds[0]!);
          if (sameCallKind(kindOf(state, tileId), tk, mixedTri)) {
             if (this.validateOk(player, "shouminkan", { tileId, targetMeldTileId: m.tileIds[0]! })) {
               options.push({ type: "shouminkan", payload: { tileId, targetMeldTileId: m.tileIds[0]! } });
             }
          }
        }
      }
    }
    if (this.validateOk(player, "win", {})) {
      options.push({ type: "win", payload: {} });
    }
    if (this.validateOk(player, "kyushuKyuhai", {})) {
      options.push({ type: "kyushuKyuhai", payload: {} });
    }
    // 증강이 등록한 추가 턴 액션 (validate로 다시 걸러 합법인 것만 제시)
    for (const provider of this.engine.turnOptionProviders) {
      for (const cand of provider(state, player)) {
        if (this.validateOk(player, cand.type, cand.payload)) {
          options.push({ type: cand.type, payload: cand.payload });
        }
      }
    }
    if (options.length === 0) {
      throw new Error(`Turn player ${player} has no legal actions`);
    }
    // 리치 중 강제 쯔모기리 — 손패가 잠겨 버릴 패를 고를 수 없고, 위에서 모은
    // 선택지(안깡·쯔모·증강 액션)도 하나도 없다면 물어볼 것이 남지 않는다.
    if (
      state.round.byPlayer[player]?.riichi != null &&
      options.length === 1 &&
      options[0]?.type === "discard"
    ) {
      return { player, options, auto: true };
    }
    return { player, options };
  }

  private reactionPrompts(): DecisionPrompt[] {
    const state = this.engine.state;
    const last = state.round.lastDiscard;
    const prompts: DecisionPrompt[] = [];

    if (last === null && state.round.chankan !== null) {
      for (const p of state.players) {
        if (p.id === state.round.chankan.player) continue;
        if (this.validateOk(p.id, "win", {})) {
          prompts.push({ player: p.id, options: [{ type: "win", payload: {} }, PASS] });
        }
      }
      return prompts;
    }
    if (last === null) return prompts;

    const discardKind = kindOf(state, last.tileId);

    for (const p of state.players) {
      if (p.id === last.player) continue;
      const options: ActionOption[] = [];

      if (this.validateOk(p.id, "win", {})) {
        options.push({ type: "win", payload: {} });
      }

      // 무너진 국경이면 무늬를 안 가리고 랭크만, 양극이면 같은 무늬 1·9를 같은 패로 본다.
      // (양극은 퐁만 — 깡 재료로는 쓰지 않으므로 minkan은 아래에서 pure/mixed로만 판정된다)
      const mixedTri = mixedTripletsFor(state, this.engine.rules, p.id);
      const polar = polarEndsFor(state, this.engine.rules, p.id);
      const matching = handIdsOf(state, p.id).filter((t) =>
        sameCallKind(kindOf(state, t), discardKind, mixedTri, polar),
      );
      if (matching.length >= 2) {
        // 적도라 사용 여부가 다른 조합을 각각 제시한다 (적5를 손에 남길 선택권)
        const isRed = (t: TileId): boolean => state.tiles[t]?.attrs.red === true;
        const norms = matching.filter((t) => !isRed(t));
        const reds = matching.filter(isRed);
        const combos: [TileId, TileId][] = [];
        if (norms.length >= 2) combos.push([norms[0]!, norms[1]!]);
        if (norms.length >= 1 && reds.length >= 1) combos.push([norms[0]!, reds[0]!]);
        if (reds.length >= 2) combos.push([reds[0]!, reds[1]!]);
        for (const tileIds of combos) {
          const payload = { tileIds };
          if (this.validateOk(p.id, "pon", payload)) {
            options.push({ type: "pon", payload });
          }
        }
      }
      if (matching.length >= 3) {
        const payload = { tileIds: [matching[0]!, matching[1]!, matching[2]!] as [TileId, TileId, TileId] };
        if (this.validateOk(p.id, "minkan", payload)) {
          options.push({ type: "minkan", payload });
        }
      }

      for (const payload of this.chiCandidates(p.id, discardKind)) {
        if (this.validateOk(p.id, "chi", payload)) {
          options.push({ type: "chi", payload });
        }
      }

      // 증강이 등록한 리액션 확장 후보 (울어 국사 등) — validate로 합법인 것만
      for (const provider of this.engine.reactionOptionProviders) {
        for (const cand of provider(state, p.id, last)) {
          if (this.validateOk(p.id, cand.type, cand.payload)) {
            options.push({ type: cand.type, payload: cand.payload });
          }
        }
      }

      if (options.length > 0) {
        options.push(PASS);
        prompts.push({ player: p.id, options });
      }
    }
    return prompts;
  }

  private chiCandidates(
    player: PlayerId,
    called: TileKind,
  ): { tileIds: [TileId, TileId] }[] {
    const state = this.engine.state;
    const opts = scoringOptionsOf(state, this.engine.rules, player);
    // 바람의 계보(honorRuns) — 자패도 슌쯔가 된다(동남서·남서북·백발중).
    // 자패엔 무늬 혼합·순환이 없고 rank 상한만 다르다(바람 4 / 삼원 3).
    const isHonorCall = !DEFAULT_SEQUENCE_SUITS.has(called.suit);
    const honorRun = isHonorCall && opts.honorRuns === true;
    if (isHonorCall && !honorRun) return [];
    const maxRank = honorRun ? honorMaxRank(called.suit) : 9;
    const wrap = !honorRun && opts.wrapRuns === true;
    // 무너진 국경(mixedRuns)이면 슌쯔 재료의 무늬가 달라도 된다 —
    // 후보 생성도 세 무늬를 전부 훑어야 실제로 칠 수 있다.
    const mixedRun = !honorRun && opts.mixedRuns === true;
    const suits: TileKind["suit"][] = mixedRun
      ? ["man", "pin", "sou"]
      : [called.suit];
    const norm = (r: number): number =>
      wrap ? ((((r - 1) % 9) + 9) % 9) + 1 : r;
    // 같은 kind라도 적도라 여부가 다르면 별개 후보로 제시 (적5 온존 선택권)
    const isRed = (t: TileId): boolean => state.tiles[t]?.attrs.red === true;
    const findIds = (kind: TileKind, exclude?: TileId): TileId[] => {
      const ids = handIdsOf(state, player).filter(
        (t) => t !== exclude && sameKind(kindOf(state, t), kind),
      );
      const normal = ids.find((t) => !isRed(t));
      const red = ids.find(isRed);
      return [
        ...(normal !== undefined ? [normal] : []),
        ...(red !== undefined ? [red] : []),
      ];
    };
    const shapes: [number, number][] = [
      [norm(called.rank - 2), norm(called.rank - 1)],
      [norm(called.rank - 1), norm(called.rank + 1)],
      [norm(called.rank + 1), norm(called.rank + 2)],
    ];
    const out: { tileIds: [TileId, TileId] }[] = [];
    const seen = new Set<string>();
    for (const [r1, r2] of shapes) {
      if (r1 < 1 || r2 > maxRank) continue;
      for (const s1 of suits) {
        for (const s2 of suits) {
          const key = `${s1}${r1}:${s2}${r2}`;
          if (seen.has(key)) continue;
          seen.add(key);
          for (const a of findIds({ suit: s1, rank: r1 })) {
            for (const b of findIds({ suit: s2, rank: r2 }, a)) {
              out.push({ tileIds: [a, b] });
            }
          }
        }
      }
    }
    return out;
  }

  private resolve(): FlowStatus {
    const state = this.engine.state;
    const phase = state.round.phase;
    const decisions = new Map(this.decisions);
    this.pending = new Map();
    this.decisions = new Map();

    if (phase === "turn.act") {
      const [entry] = decisions;
      if (entry === undefined) throw new Error("No decision to resolve");
      const [player, option] = entry;
      if (option.type === "win") {
        const tileId = state.round.lastDrawnTile as TileId;
        this.submitPlayer(player, option);
        const wins: SettleWinRequest = {
          wins: [{ winner: player, from: null, tileId, winType: "tsumo" }],
        };
        this.sys("sys.settleWin", wins);
      } else if (option.type === "kyushuKyuhai") {
        this.submitPlayer(player, option);
        this.sys("sys.settleAbort", { reason: "kyushuKyuhai" }); // 구종구패
      } else {
        this.submitPlayer(player, option);
        if (option.type === "discard" || option.type === "riichi") {
          this.flipPendingDoraAfterDiscard();
        }
      }
      return this.runAuto();
    }

    // reaction: 론(들) > 펑/깡 > 치 > 패스
    const last = state.round.lastDiscard;
    let targetPlayer: PlayerId;
    let targetTileId: TileId;
    let isShouminkan = false;

    if (last === null) {
      isShouminkan = true;
      targetPlayer = state.round.chankan!.player;
      targetTileId = state.round.chankan!.tileId;
    } else {
      targetPlayer = last.player;
      targetTileId = last.tileId;
    }

    const discarderSeat = playerOf(state, targetPlayer).seat;
    const n = state.players.length;
    const direction = this.engine.rules.resolve<number>("turn.direction", {
      state,
    });
    const seatDist = (id: PlayerId): number =>
      (((playerOf(state, id).seat - discarderSeat) * direction) % n + n) % n;

    const winners = [...decisions.entries()]
      .filter(([, o]) => o.type === "win")
      .map(([id]) => id)
      .sort((a, b) => seatDist(a) - seatDist(b));

    // 아무도 화료하지 않았다면, 이 패가 대기패였던 전원에게 일시 후리텐
    // (리치 중이면 영구). 프롬프트를 받지 못한 사람도 포함한다 — 표준 룰.
    if (winners.length === 0) this.markPassFuriten();

    if (winners.length >= 3) {
      this.sys("sys.settleAbort", { reason: "tripleRon" }); // 삼가화 (Sanchaho)
      return this.runAuto();
    }
    if (winners.length > 0) {
      for (const winner of winners) {
        this.submitPlayer(winner, { type: "win", payload: {} });
      }
      const wins: SettleWinRequest = {
        wins: winners.map((winner) => ({
          winner,
          from: targetPlayer,
          tileId: targetTileId,
          winType: "ron" as const,
        })),
      };
      this.sys("sys.settleWin", wins);
      return this.runAuto();
    }

    // 후로 우선순위: 깡/펑 > 원격 치(call.chi.fromAnyone 보유자) > 일반 치
    //
    // 같은 종류의 콜이 둘 이상이면 **버린 사람에게 가까운 자리**가 이긴다(표준 룰의
    // 상가 우선). 예전에는 `decisions`(Map)의 삽입 순서 — 즉 **누가 먼저 소켓 응답을
    // 보냈는지** — 로 갈렸다. 같은 입력이 다른 결과를 내 리플레이·재개가 어긋나고,
    // 사람 대 봇에서는 봇이 항상 먼저 답해 이겼다(docs/25 방해 #4).
    const fromSeat = playerOf(state, targetPlayer).seat;
    const seatCount = state.players.length;
    const byNearestSeat = (
      a: [PlayerId, ActionOption],
      b: [PlayerId, ActionOption],
    ): number => {
      const dist = (id: PlayerId): number =>
        (playerOf(state, id).seat - fromSeat + seatCount) % seatCount;
      return dist(a[0]) - dist(b[0]);
    };
    const ordered = [...decisions.entries()].sort(byNearestSeat);
    const chis = ordered.filter(([, o]) => o.type === "chi");
    const remoteChi = chis.find(([id]) =>
      this.engine.rules.resolve<boolean>("call.chi.fromAnyone", {
        playerId: id,
        state,
      }),
    );
    // 증강이 등록한 커스텀 리액션 콜(울어 국사 등) — 표준 타입이 아닌 것.
    // 엔진은 특정 액션명을 알 필요 없이 펑과 치 사이 우선순위로 처리한다.
    const STANDARD_REACTIONS = new Set(["win", "pass", "chi", "pon", "minkan"]);
    const customCall = ordered.find(([, o]) => !STANDARD_REACTIONS.has(o.type));
    const call =
      ordered.find(([, o]) => o.type === "minkan") ??
      ordered.find(([, o]) => o.type === "pon") ??
      customCall ??
      remoteChi ??
      chis[0];
    
    if (call !== undefined) {
      const before = this.engine.eventLog.length;
      this.submitPlayer(call[0], call[1]);
      // 대명깡을 선언한 콜은 영상패를 뽑아야 한다. 표준 minkan뿐 아니라
      // 리액션에서 KAN_DECLARED(kan_open)를 내는 커스텀 콜(증강)도 포함한다 —
      // 그렇지 않으면 일반 패를 뽑아 영상개화가 성립하지 않는다.
      const declaredOpenKan = this.engine.eventLog
        .slice(before)
        .some(
          (e) =>
            e.type === KAN_DECLARED &&
            (e.payload as KanDeclaredPayload).kanKind === "kan_open",
        );
      if (declaredOpenKan) {
        this.flipKanDoraBeforeRinshan();
        this.sys("sys.drawRinshan");
      }
      return this.runAuto();
    }

    if (isShouminkan) {
      // 창깡 실패 -> 영상 쯔모로 넘어감
      this.flipKanDoraBeforeRinshan();
      this.sys("sys.drawRinshan");
    } else {
      this.sys("sys.advanceTurn");
    }
    
    return this.runAuto();
  }

  /**
   * 사풍연타 — 네 명의 **첫 버림**이 모두 같은 바람인가.
   *
   * ⚠ 바닥의 현재 장수(`ids.length === 1`)로 세면 안 된다. 첫 바퀴에 개입하는 증강
   * 하나만 있어도 판정이 조용히 무너진다(docs/25 방해 #9):
   *  - 날치기(pond_snatch)가 남의 바닥에서 한 장을 가져가면 그 바닥이 0장이 되어
   *    **성립해야 할 도중유국이 안 난다.**
   *  - 시간 정지(time_stop)로 한 사람이 두 번 버리면 그 바닥이 2장이 되어 역시 안 난다.
   *
   * 버림 **이력의 첫 장**을 보면 바닥을 어떻게 헤집어도 판정이 흔들리지 않는다.
   * (누명 frame_up은 이력 자체를 남에게 돌리므로 첫 바퀴 발동이 따로 막혀 있다 —
   *  `frame_up.ts`의 `inFirstGoAround` 가드.)
   */
  private isFourWindAbort(): boolean {
    const state = this.engine.state;
    const firstDiscards = state.players.map(
      (p) => state.round.byPlayer[p.id]?.discardedKinds[0] ?? null,
    );
    const first = firstDiscards[0];
    if (first === null || first === undefined) return false;
    if (!first.startsWith("wind")) return false;
    return firstDiscards.every((k) => k === first);
  }

  private submitPlayer(player: PlayerId, option: ActionOption): void {
    const result = this.engine.submit({
      player,
      type: option.type,
      payload: option.payload,
    });
    if (!result.ok) {
      throw new Error(
        `Accepted decision failed in engine: ${option.type} by ${player} — ${result.reason}`,
      );
    }
  }

  private kanDoraTiming(): "beforeRinshan" | "afterDiscard" {
    return this.engine.rules.resolve<"beforeRinshan" | "afterDiscard">(
      "dora.kanTiming",
    );
  }

  private flipKanDoraBeforeRinshan(): void {
    if (this.kanDoraTiming() === "beforeRinshan") {
      this.sys("sys.flipDora");
    }
  }

  private flipPendingDoraAfterDiscard(): void {
    if (this.kanDoraTiming() !== "afterDiscard") return;
    while (this.engine.state.round.pendingDora > 0) {
      this.sys("sys.flipDora");
    }
  }

  /**
   * 지금 지나가는 패(버림 또는 가깡패)가 대기패였던 모든 플레이어를
   * 일시 후리텐(리치 중이면 영구)으로 마킹한다. 론 옵션이 제시되지 않았던
   * 사람(역 없음·이미 후리텐)도 포함한다 — 표준 룰의 동순내 후리텐.
   *
   * 단 **누구도 론할 수 없었던 패**는 예외다. 후리텐은 "화료를 넘겼다"는
   * 사실에 붙는 벌인데, 규칙이 론 자체를 막았다면 넘긴 것이 없다.
   * 천하무적·불가침 조약(win.ronImmune)이 그렇다 — 예전에는 이 경우에도
   * 마킹이 돌아, 리치자가 **그 국 내내 아무에게서도 론할 수 없게** 됐다.
   * 설명에 없는 "리치자 전원 무력화"가 숨어 있던 셈이다(docs/25 최우선#4).
   */
  private markPassFuriten(): void {
    const state = this.engine.state;
    const target = state.round.lastDiscard ?? state.round.chankan;
    if (target === null) return;
    // 이 사람의 패는 론당하지 않는다 → 아무도 화료를 넘긴 것이 아니다
    if (
      this.engine.rules.resolve<boolean>("win.ronImmune", {
        playerId: target.player,
        state,
      })
    ) {
      return;
    }
    const targetKind = kindOf(state, target.tileId);
    for (const p of state.players) {
      if (p.id === target.player) continue;
      // 조커가 넓힌 대기는 후리텐을 만들지 않는다 — 그 대기를 넘긴 것은 "화료를
      // 넘긴 것"으로 세지 않는다(helpers.furitenOptionsOf와 같은 기준).
      const waits = winningKinds(
        winHandKindsOf(state, this.engine.rules, p.id),
        meldCountOf(state, p.id),
        undefined,
        furitenOptionsOf(state, this.engine.rules, p.id),
      );
      if (!waits.some((w) => sameKind(w, targetKind))) continue;
      this.sys("sys.markFuriten", {
        player: p.id,
        permanent: state.round.byPlayer[p.id]?.riichi != null,
      });
    }
  }
}

/** 다음 자리 계산이 필요할 때를 위한 재수출 (서버·봇 편의) */
export { nextSeat };
