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
import { DEFAULT_SEQUENCE_SUITS, decompose, honorMaxRank } from "../scoring/decompose.js";
import { ROUND_SETTLED, KAN_DECLARED } from "./flowEvents.js";
import type { AbortReason, RoundSettledPayload, KanDeclaredPayload } from "./flowEvents.js";
import type { SettleWinRequest } from "./standardActions.js";
import { WIN_BLOCKED_MIN_HAN, WIN_BLOCKED_RON_IMMUNE } from "./standardActions.js";
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
  sameCallBody,
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

/**
 * **규칙이 막아 지금은 누를 수 없는 선언** — 화면에 자물쇠로 세우기 위한 표시다.
 *
 * 왜 `options`가 아니라 따로인가: 여기 실린 것은 **고를 수 없는 것**이다. options에
 * 섞으면 봇·안전폴백·`submit`의 "제시된 것인가" 검사가 전부 이것을 고를 수 있는
 * 수로 오해한다. 별도 필드라 기존 소비자는 아무 것도 바꾸지 않아도 되고, 그리는
 * 쪽(클라이언트)만 읽는다.
 *
 * 지금 실리는 것은 화료(`win`) 하나이며, 사유는 **증강이 막은 경우로 한정**한다 —
 * 후리텐·역 없음처럼 표준 규칙이 막는 것은 예전처럼 조용히 건너뛴다.
 */
export interface LockedOption {
  /** 잠긴 선언의 액션 타입 (지금은 "win"뿐) */
  type: string;
  /** 왜 잠겼는가 — 클라이언트가 문구로 옮긴다 */
  reason: "minHan" | "ronImmune";
  /** reason="minHan"일 때 요구되는 최소 판 (격/rank_gate) */
  minHan?: number;
}

export interface DecisionPrompt {
  player: PlayerId;
  options: ActionOption[];
  /**
   * 잠긴 선언 — 있으면 화면이 자물쇠 버튼을 세운다. 규칙 판정과는 무관하며
   * (`options`에 없으므로 고를 수 없다), 없을 때는 필드 자체가 붙지 않는다.
   */
  locked?: LockedOption[];
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
  /** 대기 중인 프롬프트 — 자물쇠까지 그대로 들고 있어야 다시 내보낼 때 사라지지 않는다 */
  private pending = new Map<PlayerId, DecisionPrompt>();
  private decisions = new Map<PlayerId, ActionOption>();

  constructor(private readonly engine: GameEngine) {}

  /** setup부터 자동 진행. 첫 결정 지점(또는 즉시 종국)을 돌려준다 */
  begin(): FlowStatus {
    return this.runAuto();
  }

  /**
   * **이 국을 지금 물린다** — 도중유국으로 정산하고 다음 국으로 넘긴다.
   *
   * 규칙이 스스로 판정하는 도중유국(사깡산료·사풍연타…)과 **같은 문**으로 나간다
   * (`sys.settleAbort`). 여기서 새 정산 경로를 만들면 점수·본장·친 로테이션이
   * 규칙 쪽과 언젠가 어긋난다 — 도중유국은 「아무도 주고받지 않고 본장만 오른다」는
   * 규칙이고, 그 계산은 한 곳에만 있어야 한다.
   *
   * 기다리던 결정은 버린다. 그 결정들은 **이제 없는 국**에 대한 답이라, 남겨 두면
   * 다음 국의 첫 프롬프트와 섞인다.
   */
  abortRound(reason: AbortReason): FlowStatus {
    this.pending.clear();
    this.decisions.clear();
    this.sys("sys.settleAbort", { reason });
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
    if (!offered.options.some((o) => JSON.stringify(o) === key)) {
      throw new Error(`Option was not offered to ${player}: ${key}`);
    }
    this.decisions.set(player, option);
    if (this.decisions.size < this.pending.size) {
      return {
        kind: "awaiting",
        prompts: [...this.pending.values()].filter(
          (p) => !this.decisions.has(p.player),
        ),
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
    return this.validateReason(player, type, payload) === null;
  }

  /** validate가 돌려준 사유 (합법이면 null) */
  private validateReason(
    player: PlayerId,
    type: string,
    payload: unknown,
  ): string | null {
    const def = this.engine.actions.get(type);
    if (def === undefined) return "unknown action";
    return def.validate(
      { player, type, payload },
      { state: this.engine.state, rules: this.engine.rules },
    );
  }

  /**
   * 화료가 **증강 때문에** 막혔는가 — 막혔으면 자물쇠 표시를, 아니면 null.
   *
   * 손이 다 됐는데 남의 증강이 막은 경우만 잡는다(격의 최소 판, 천하무적·불가침
   * 조약의 론 면역). 후리텐·역 없음·애초에 화료형이 아님 같은 표준 사유는 여기서
   * null이 되어 예전처럼 조용히 지나간다 — 자물쇠가 텐파이 여부를 흘리지 않는다.
   */
  private winLock(player: PlayerId): LockedOption | null {
    const reason = this.validateReason(player, "win", {});
    if (reason === WIN_BLOCKED_RON_IMMUNE) {
      return { type: "win", reason: "ronImmune" };
    }
    if (reason === WIN_BLOCKED_MIN_HAN) {
      return {
        type: "win",
        reason: "minHan",
        minHan: this.engine.rules.resolve<number>("win.minHan", {
          playerId: player,
          state: this.engine.state,
        }),
      };
    }
    return null;
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

      /*
       * 사가리치는 **타가 셋의 화면에 리치가 넷 보일 때** 성립한다 — 숨은 리치
       * (스텔스 리치)는 세지 않는다. 세면 아무도 못 본 4번째 리치로 국이 끝나고,
       * 그 정산에서 은닉이 통째로 드러난다(2026-08-20 QA 리치 확정 5).
       */
      let riichiCount = 0;
      for (const p of state.players) {
        if (state.round.byPlayer[p.id]?.riichi == null) continue;
        const hidden =
          this.engine.rules.has("riichi.hidden") &&
          this.engine.rules.resolve<boolean>("riichi.hidden", {
            playerId: p.id,
            state,
          });
        if (!hidden) riichiCount++;
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
    this.pending = new Map(prompts.map((p) => [p.player, p]));
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
      /** 양극 — 가깡 후보 생성에서 같은 무늬의 1·9를 한 패로 본다 (안깡은 종전대로) */
      const polarKan = polarEndsFor(state, this.engine.rules, player);
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
      // 끝없는 윤회를 함께 들고 있으면 7-8-9-1·8-9-1-2·9-1-2-3까지 이어서 제시한다.
      if (snakeKanFor(state, this.engine.rules, player)) {
        const snakeWrap =
          scoringOptionsOf(state, this.engine.rules, player).wrapRuns === true;
        for (const suit of DEFAULT_SEQUENCE_SUITS) {
          for (let start = 1; start <= (snakeWrap ? 9 : 6); start++) {
            const seenKey = `snake:${suit}${start}`;
            if (ankanKindsSeen.has(seenKey)) continue;
            const ids = [0, 1, 2, 3].map((d) =>
              hand.find((t) => {
                const kk = kindOf(state, t);
                return kk.suit === suit && kk.rank === ((start - 1 + d) % 9) + 1;
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
          // 양극도 함께 본다 — 1·9 혼합 퐁 위의 가깡이 한쪽 방향으로만 뜨던 자리
          // (validate 쪽은 standardActions의 shouminkan). qa-lab text 확정 21.
          if (sameCallKind(kindOf(state, tileId), tk, mixedTri, polarKan)) {
             if (this.validateOk(player, "shouminkan", { tileId, targetMeldTileId: m.tileIds[0]! })) {
               options.push({ type: "shouminkan", payload: { tileId, targetMeldTileId: m.tileIds[0]! } });
             }
          }
        }
      }
    }
    // 쯔모 — 증강이 막았을 뿐이라면 버튼을 지우지 않고 자물쇠로 남긴다
    const locked: LockedOption[] = [];
    if (this.validateOk(player, "win", {})) {
      options.push({ type: "win", payload: {} });
    } else {
      const lock = this.winLock(player);
      if (lock !== null) locked.push(lock);
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
    //
    // 단 **자물쇠가 있으면 자동으로 넘기지 않는다.** 리치 중에 화료패를 쥐고도 격에
    // 막힌 순간이 바로 이 사람이 알아야 하는 순간인데, auto로 넘기면 화면이 그 패를
    // 소리 없이 버린다 — 잠긴 버튼을 보여 주려고 남긴 것이 통째로 안 보이게 된다.
    if (
      state.round.byPlayer[player]?.riichi != null &&
      options.length === 1 &&
      options[0]?.type === "discard" &&
      locked.length === 0
    ) {
      return { player, options, auto: true };
    }
    return locked.length > 0 ? { player, options, locked } : { player, options };
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
          continue;
        }
        // 창깡이 증강에 막혔다 — 패스만 있는 프롬프트를 세워 자물쇠를 보여 준다
        const lock = this.winLock(p.id);
        if (lock !== null) {
          prompts.push({ player: p.id, options: [PASS], locked: [lock] });
        }
      }
      return prompts;
    }
    if (last === null) return prompts;

    const discardKind = kindOf(state, last.tileId);

    for (const p of state.players) {
      if (p.id === last.player) continue;
      const options: ActionOption[] = [];
      const locked: LockedOption[] = [];

      if (this.validateOk(p.id, "win", {})) {
        options.push({ type: "win", payload: {} });
      } else {
        // 론이 증강에 막혔다 — 건너뛰지 않고 잠긴 론 버튼으로 남긴다.
        // (후리텐·역 없음처럼 표준 규칙이 막은 것은 winLock이 null을 준다)
        const lock = this.winLock(p.id);
        if (lock !== null) locked.push(lock);
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
        /*
         * 세 장이 **한 규칙 안에서** 닫히는 짝만 후보로 낸다.
         *
         * 예전에는 손패를 버림패와 1:1로만 견줘 앞에서 두 장을 집었다. 양극과 동수의
         * 결속을 함께 들면 두 장이 **서로 다른 규칙으로 하나씩** 통과해
         * `{1만, 9만, 1통}` — 어느 카드로도 몸통이 아닌 잡종 펑이 열렸다
         * (QA synergy3 shape 확정 2, 2026-08-23 — helpers.sameCallBody 주석).
         * 유효한 짝 안에서 적도라 조합 3종을 고르므로 "적5를 손에 남길 선택권"은
         * 그대로다.
         */
        const closes = (x: TileId, y: TileId): boolean =>
          sameCallBody(discardKind, kindOf(state, x), kindOf(state, y), mixedTri, polar);
        const firstPair = (
          xs: TileId[],
          ys: TileId[],
        ): [TileId, TileId] | null => {
          for (const x of xs) {
            for (const y of ys) {
              if (x !== y && closes(x, y)) return [x, y];
            }
          }
          return null;
        };
        const combos: [TileId, TileId][] = [];
        for (const pair of [
          firstPair(norms, norms),
          firstPair(norms, reds),
          firstPair(reds, reds),
        ]) {
          if (pair !== null) combos.push(pair);
        }
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
        prompts.push(
          locked.length > 0
            ? { player: p.id, options, locked }
            : { player: p.id, options },
        );
      } else if (locked.length > 0) {
        // 고를 것이 패스뿐이어도 물어본다 — 이 한 번이 "막혔다"를 알리는 유일한 자리다
        prompts.push({ player: p.id, options: [PASS], locked });
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
   *
   * **안깡**도 같은 이유로 예외다(docs/28 §2-1). KAN_DECLARED는 안깡에도
   * `chankan`을 채우지만, 안깡은 표준상 국사무쌍만 창깡할 수 있다
   * (standardActions의 "closed kan can only be robbed by kokushi").
   * 국사가 아닌 사람은 애초에 론할 수 없었으니 넘긴 화료도 없다 —
   * 여기서 마킹하면 리치자가 그 국 내내 론 불가가 된다.
   */
  private markPassFuriten(): void {
    const state = this.engine.state;
    const lastDiscard = state.round.lastDiscard;
    const chankan = state.round.chankan;
    const target = lastDiscard ?? chankan;
    if (target === null) return;
    // 지나간 것이 '안깡패'인가 (버림패가 있으면 그쪽이 우선 — target과 같은 기준)
    const closedKan = lastDiscard === null && chankan?.closedKan === true;
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
      // 안깡: 창깡할 수 있었던 사람(국사무쌍·성립하지 않는 깡 보유자)만 '넘긴' 것이다
      if (closedKan && !this.couldRobClosedKan(p.id, targetKind)) continue;
      /*
       * **격(rank_gate)의 최소 판에 막힌 사람도 넘긴 것이 없다** (QA 2차 aug-3 확정 3).
       *
       * 위의 `win.ronImmune` 예외와 같은 원칙인데 이쪽만 빠져 있었다. 다른 점은
       * **사람마다 다르다**는 것이다 — ronImmune은 버린 사람의 성질이라 통째로
       * 반환할 수 있지만, 최소 판은 지목당한 사람에게만 걸린다. 그래서 여기,
       * 마킹 루프 안에서 그 사람만 건너뛴다.
       *
       * 안 건너뛰면 격은 카드에 적힌 "5판 이상이 아니면 화료할 수 없다"에 더해
       * **손을 키워 5판을 넘긴 뒤에도 그 대기로는 영영 론할 수 없게 만드는** 두 번째
       * 벌을 몰래 얹는다. 리치를 걸어 둔 상태면 영구 후리텐이라 국이 끝날 때까지
       * 회복 수단이 없다 — 지목당한 쪽이 할 수 있는 유일한 대응(손을 키운다)이
       * 봉쇄되는 셈이다.
       *
       * 비용: 이 검사는 **오름패가 실제로 지나간 사람**에게만 돈다(바로 위에서
       * 대기 일치를 이미 걸렀다). 한 버림에 많아야 몇 번이다.
       */
      if (this.validateReason(p.id, "win", {}) === WIN_BLOCKED_MIN_HAN) continue;
      this.sys("sys.markFuriten", {
        player: p.id,
        permanent: state.round.byPlayer[p.id]?.riichi != null,
      });
    }
  }

  /**
   * 이 사람이 방금의 **안깡**을 창깡할 수 있었는가 — win 액션의 안깡 게이트와
   * 같은 기준이다(국사무쌍 형, 또는 `win.closedKanRobbable`을 여는 증강 보유).
   * 판정 근거를 한 곳에 두려고 형태(decompose)로만 본다: 역·판수 게이트에 걸려
   * 실제로 못 났더라도 "론 창구가 열려 있었다"는 사실은 같고, 그때는 표준 룰대로
   * 후리텐이 붙는다.
   */
  private couldRobClosedKan(player: PlayerId, targetKind: TileKind): boolean {
    const state = this.engine.state;
    if (
      this.engine.rules.resolve<boolean>("win.closedKanRobbable", {
        playerId: player,
        state,
      })
    ) {
      return true;
    }
    const hand = [...winHandKindsOf(state, this.engine.rules, player), targetKind];
    return decompose(
      hand,
      meldCountOf(state, player),
      scoringOptionsOf(state, this.engine.rules, player),
    ).some((d) => d.form === "kokushi");
  }
}

/** 다음 자리 계산이 필요할 때를 위한 재수출 (서버·봇 편의) */
export { nextSeat };
