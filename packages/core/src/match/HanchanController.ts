/**
 * HanchanController — 반장전 루프.
 *
 * 동장 4국 + 남장 4국(필요 시 서입 1국) 진행.
 * FlowController로 국을 돌리고, PlayerAgent에게 결정을 위임한다.
 * 도비·오야 트ップ·서입 조건 등 종료 판정을 담당한다.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §4
 */

import { FlowController } from "../mahjong/flow/FlowController.js";
import type { ActionOption, DecisionPrompt, FlowStatus } from "../mahjong/flow/FlowController.js";
import {
  createStandardGame,
  createStandardGameFromState,
} from "../mahjong/flow/standardGame.js";
import type { StandardGame, StandardGameOptions } from "../mahjong/flow/standardGame.js";
import { DraftController, rebuildAugments } from "../augment/DraftController.js";
import { draftDoneKey } from "../augment/events.js";
import { SPECTATOR_ID, buildPlayerView } from "../information/PlayerView.js";
import type { PlayerView, PublicTileView } from "../information/PlayerView.js";
import type { GameState } from "../engine/state/GameState.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import type { TileId } from "../mahjong/tiles/Tile.js";
import { ROUND_SETTLED } from "../mahjong/flow/flowEvents.js";
import type { RoundSettledPayload } from "../mahjong/flow/flowEvents.js";
import { uraIndicatorIds } from "../mahjong/flow/helpers.js";
import type { PlayerAgent } from "./PlayerAgent.js";
import type {
  RankingEntry,
  DraftStage,
  RoundOverMessage,
  ServerMessage,
} from "../network/protocol.js";

// ─────────────────────────── 반장전 설정 ───────────────────────────

export interface HanchanConfig {
  /** 시작 점수 (기본 25000) */
  startScore: number;
  /** 반환점 (기본 30000) — 오카 계산 기준 */
  returnScore: number;
  /** 도비(0점 이하 즉시 종료) 허용 (기본 true) */
  dobi: boolean;
  /** 최대 장풍 수: 2=반장전(동+남), 3=산장전 */
  maxWind: number;
  /** 서입 허용 (기본 true) */
  westEntry: boolean;
  /** 우마 점수 [2위에게, 1위에게] (기본 [10, 20]) */
  uma: [number, number];
  /** 오카: 반환점 초과분(25000→30000 = 5000 × 4플레이어 = 20000) */
  oka: number;
  /** 드래프트 스케줄 (비어있으면 드래프트 없음) */
  draftSchedules?: DraftStage[];
  /** 시드 */
  seed: number;
  /** 적도라 수 */
  redFivesPerSuit?: number;
  /** 콘텐츠 팩 증강 카탈로그 (@majak/content 등) */
  extraAugments?: readonly import("../augment/Augment.js").AugmentDef[];
  /**
   * 국 종료 후 다음 국 시작까지의 대기(ms). 결과 화면을 볼 시간을 준다.
   * 기본 0 (테스트·봇 게임은 지연 없음). 실서버가 사람 게임에서 설정한다.
   */
  interRoundDelayMs?: number;
}

export const DEFAULT_HANCHAN_CONFIG: HanchanConfig = {
  startScore: 25000,
  returnScore: 30000,
  dobi: true,
  maxWind: 2,
  westEntry: true,
  uma: [10, 20],
  oka: 20,
  draftSchedules: ["gameStart", "southEntry"],
  seed: Date.now(),
  redFivesPerSuit: 1,
  interRoundDelayMs: 0,
};

// ─────────────────────────── 이벤트 콜백 ───────────────────────────

export interface HanchanEvents {
  /** 국 시작 — 각 플레이어에게 PlayerView 전송 전 */
  onRoundStart?: (game: StandardGame, roundIndex: number) => void;
  /** 국 종료 — RoundSettled 직후 */
  onRoundEnd?: (
    game: StandardGame,
    outcome: "win" | "draw" | "abort",
    roundIndex: number,
  ) => void;
  /** 드래프트 시작 (선택지 제공 전) */
  onDraftStart?: (stage: DraftStage) => void;
  /** 드래프트 완료 */
  onDraftEnd?: (stage: DraftStage) => void;
  /** 반장전 전체 종료 */
  onGameOver?: (rankings: RankingEntry[]) => void;
  /** 게임 이벤트 로그 — 리플레이 저장용 */
  onEvent?: (eventJson: string) => void;
  /** 전원 합의로 게임이 무효 종료됨 (requestAbort) — 정산·기록 없이 즉시 종료 */
  onGameAborted?: () => void;
}

// ─────────────────────────── 관전자 ───────────────────────────

/**
 * 관전자 수신부 — 게임에 참여하지 않고 SPECTATOR_ID 시점의 뷰와
 * 부가 메시지(catalog·roundOver·actionFx 등)만 받는다.
 */
export interface SpectatorSink {
  /** 관전자 식별자 (제거용) */
  readonly id: string;
  sendView(view: PlayerView): void;
  notify?(msg: ServerMessage): void;
}

/** 표준 액션 타입 — 이 외의 액션 실행은 actionFx로 브로드캐스트된다 */
const STANDARD_ACTION_TYPES = new Set([
  "discard",
  "riichi",
  "win",
  "pon",
  "chi",
  "ankan",
  "minkan",
  "shouminkan",
  "kyushuKyuhai",
  "pass",
]);

// ─────────────────────────── HanchanController ───────────────────────────

export class HanchanController {
  private readonly agents: Map<PlayerId, PlayerAgent>;
  private readonly config: HanchanConfig;
  private readonly events: HanchanEvents;
  /** 이미 onEvent로 흘려보낸 확정 이벤트 수 (eventLog 커서) */
  private emittedEvents = 0;
  /** 이미 진행한 드래프트 스테이지 — 스테이지당 정확히 1회만 실행한다.
   *  (남1국 연장/본장으로 라운드 번호가 유지될 때 southEntry가 반복되던 버그 방지) */
  private draftedStages = new Set<DraftStage>();
  /** 관전자 목록 — 뷰 브로드캐스트·notifyAll에 함께 포함된다 */
  private readonly spectators = new Map<string, SpectatorSink>();
  /** 진행 중인 게임 (관전자 중도 합류 시 즉시 뷰 전송용) */
  private game: StandardGame | null = null;
  /** 관전자 중도 합류 시 재전송할 증강 카탈로그 */
  private catalogMsg: ServerMessage | null = null;
  /** 전원 합의 무효 종료 요청 여부 */
  private aborted = false;
  /** 무효 요청 시 즉시 resolve되는 신호 (결정 대기를 깨우는 용도) */
  private readonly abortSignal: Promise<{ readonly abort: true }>;
  private fireAbort: () => void = () => {};

  constructor(
    agents: PlayerAgent[],
    config: Partial<HanchanConfig> = {},
    events: HanchanEvents = {},
  ) {
    this.agents = new Map(agents.map((a) => [a.id, a]));
    this.config = { ...DEFAULT_HANCHAN_CONFIG, ...config };
    this.events = events;
    this.abortSignal = new Promise((resolve) => {
      this.fireAbort = () => resolve({ abort: true });
    });
  }

  /**
   * 전원 합의로 게임을 무효 종료한다. 진행 중인 결정 대기를 즉시 깨워
   * 루프가 다음 체크 지점에서 빠져나가게 하고, onGameAborted를 호출한다.
   * 정산·순위·기록은 하지 않는다 (무효).
   */
  requestAbort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.fireAbort();
  }

  /** 반장전 전체를 실행하고 최종 순위를 반환한다 */
  async run(): Promise<RankingEntry[]> {
    const playerIds = [...this.agents.keys()];
    const playerMeta = Object.fromEntries(
      [...this.agents.values()].map((a) => [a.id, { nickname: a.nickname, isBot: a.isBot }]),
    );
    const options: StandardGameOptions = {
      seed: this.config.seed,
      playerIds,
      playerMeta,
      startScore: this.config.startScore,
      redFivesPerSuit: this.config.redFivesPerSuit ?? 1,
      ...(this.config.extraAugments !== undefined
        ? { extraAugments: this.config.extraAugments }
        : {}),
    };
    const game = createStandardGame(options);
    this.game = game;

    // 초기 상태를 이벤트 로그에 기록
    this.emitInit(game.engine.state, options);

    // 증강 카탈로그 전송 (클라이언트가 id→이름·등급을 알게 되는 시점)
    this.sendCatalog(game);

    // ── 게임 시작 드래프트 ──
    // 반드시 첫 뷰를 먼저 보낸다 — 클라이언트는 게임 테이블에 입장한 뒤
    // 드래프트 오버레이를 봐야 한다 (게임창 전에 증강이 뜨는 문제 방지).
    this.broadcastViews(game);
    if (this.config.draftSchedules?.includes("gameStart")) {
      await this.runDraft(game, "gameStart");
      this.flushEvents(game);
    }

    return this.runLoop(game, 0);
  }

  /**
   * 이어하기 — 리플레이로 재구성된 게임(최종 상태 + 증강 재설치 + 로그 시드)에서
   * 반장전을 이어 실행한다. 서버 재시작 후 진행 중이던 게임 복구용.
   *
   * FlowController가 상태 기반이라 재구성된 페이즈(중간 턴 포함)에서 그대로
   * 이어진다. 부분 드래프트 상태에서 끊겼으면 미완료 스테이지만 이어서 뽑는다.
   */
  async resume(game: StandardGame): Promise<RankingEntry[]> {
    this.game = game;
    // 재구성 로그 뒤로만 새 이벤트를 append (과거 이벤트 재기록 방지)
    this.emittedEvents = game.engine.eventLog.length;

    // 완료된 드래프트 스테이지 복원 — 스테이지 완료 플래그가 전원에게 찍혀 있으면 완료.
    // (보유 증강 수로 세면 도박사가 한 턴에 2개를 줘 잘못 판정된다.)
    const ids = [...this.agents.keys()];
    for (const stage of ["gameStart", "southEntry"] as const) {
      if (ids.every((id) => game.engine.state.augmentData[draftDoneKey(stage, id)] === true)) {
        this.draftedStages.add(stage);
      }
    }

    this.sendCatalog(game);
    this.broadcastViews(game);

    // 초기 드래프트 도중 끊겼으면(모두 뽑기 전) 이어서 완료한다.
    // runDraft가 이미 뽑은 사람은 건너뛰므로 중복 설치되지 않는다.
    if (
      this.config.draftSchedules?.includes("gameStart") &&
      !this.draftedStages.has("gameStart")
    ) {
      await this.runDraft(game, "gameStart");
      this.flushEvents(game);
    }

    return this.runLoop(game, 0);
  }

  /** 증강 카탈로그를 전 참가자·관전자에게 보낸다 (id→이름·등급) */
  private sendCatalog(game: StandardGame): void {
    this.catalogMsg = {
      type: "catalog",
      augments: game.augments.all().map((a) => ({
        id: a.id,
        tier: a.tier,
        name: a.name,
        description: a.description,
      })),
    };
    this.notifyAll(this.catalogMsg);
  }

  /** 국 루프 — run()과 resume()이 공유한다. 현재 상태에서 종국까지 진행. */
  private async runLoop(game: StandardGame, startRoundIndex: number): Promise<RankingEntry[]> {
    let roundIndex = startRoundIndex;
    while (true) {
      if (this.aborted) return this.finishAborted();
      this.events.onRoundStart?.(game, roundIndex);
      this.broadcastViews(game);

      const outcome = await this.runRound(game);
      if (this.aborted) return this.finishAborted();
      this.flushEvents(game); // 국 진행 이벤트를 리플레이 로그로
      this.events.onRoundEnd?.(game, outcome, roundIndex);

      roundIndex++;
      // 정산 후 뷰 전송 — 화료면 우라도라까지 공개
      const ura = outcome === "win" ? uraIndicatorIds(game.engine.state) : [];
      this.broadcastViews(game, ura);
      this.notifyRoundOver(game, outcome, ura);

      // 결과 화면을 볼 시간을 준다 (다음 국이 결과보다 먼저 뜨는 문제 방지)
      await this.pauseBetweenRounds();

      // 도비 체크 — 0점 '미만'이면 즉시 종국 (정확히 0점은 속행, 01_GAME_RULES §1)
      if (this.config.dobi) {
        const bankrupt = game.engine.state.players.some((p) => p.score < 0);
        if (bankrupt) break;
      }

      // 남장 진입 체크 (드래프트) — 스테이지당 1회만.
      // 남1국 연장(본장)으로 라운드 번호가 유지돼도 재추첨하지 않는다.
      const state = game.engine.state;
      if (
        state.round.prevalentWind === 2 &&
        state.round.roundNumber === 1 &&
        this.config.draftSchedules?.includes("southEntry") &&
        !this.draftedStages.has("southEntry")
      ) {
        await this.runDraft(game, "southEntry");
        this.flushEvents(game);
        // 드래프트 대기 중 무효가 들어오면 다음 국을 시작하지 않고 즉시 종료
        if (this.aborted) return this.finishAborted();
      }

      // 종료 조건 판정
      if (this.shouldEnd(game.engine.state)) break;

      // 다음 국 시작
      const res = game.engine.submit({
        player: "__system",
        type: "sys.startRound",
        payload: {},
      });
      if (!res.ok) throw new Error(`Failed to start next round: ${res.reason}`);
      this.flushEvents(game);
    }

    this.flushEvents(game); // 안전: 남은 이벤트 방출
    const rankings = this.calcRankings(game.engine.state);
    this.events.onGameOver?.(rankings);
    return rankings;
  }

  /** 무효 종료 처리 — 정산·순위·기록 없이 콜백만 부르고 빈 순위를 반환한다 */
  private finishAborted(): RankingEntry[] {
    this.events.onGameAborted?.();
    return [];
  }

  // ─────────────────────────── 국 1개 실행 ───────────────────────────

  private async runRound(game: StandardGame): Promise<"win" | "draw" | "abort"> {
    const flow = new FlowController(game.engine);
    let status: FlowStatus = flow.begin();
    this.broadcastViews(game); // 배패 직후 — 손패가 보이는 첫 시점

    while (status.kind === "awaiting") {
      // 결정이 필요한 플레이어에게 prompt 전송하고 결과 수집 (무효 요청 시 즉시 이탈)
      const raced = await Promise.race([
        Promise.all(
          status.prompts.map(async (prompt) => {
            const agent = this.agents.get(prompt.player);
            if (agent === undefined) {
              throw new Error(`No agent for player ${prompt.player}`);
            }
            const chosen = await agent.decide(prompt);
            return { player: prompt.player, option: chosen };
          }),
        ).then((decisions) => ({ decisions })),
        this.abortSignal,
      ]);
      // 무효 요청 — 반환 outcome은 runLoop이 aborted 체크로 즉시 무시한다
      if ("abort" in raced) return "abort";

      // 순서대로 submit (FlowController는 모든 결정이 모이면 resolve)
      for (const { player, option } of raced.decisions) {
        if (flow.isPending(player)) {
          status = flow.submit(player, option);
          // 특수 액션(액티브 증강 등) 실행 연출 — 표준 액션이 아닌 것만.
          // 비표준 타입은 턴 프롬프트에서만 나오므로 결정 = 실행이 보장된다.
          if (!STANDARD_ACTION_TYPES.has(option.type)) {
            this.notifyAll({ type: "actionFx", player, actionType: option.type });
          }
        }
      }

      this.broadcastViews(game); // 결정 반영 후 매 턴 뷰 갱신
    }

    return status.outcome;
  }

  // ─────────────────────────── 드래프트 ───────────────────────────

  private async runDraft(game: StandardGame, stage: DraftStage): Promise<void> {
    this.draftedStages.add(stage);
    this.events.onDraftStart?.(stage);
    const draft = new DraftController(game.engine, game.augments, {
      yaku: game.yaku,
    });

    // 아직 이 스테이지를 마치지 않은 에이전트만 대상. 재개 시 이미 뽑은 사람은 건너뛴다 —
    // 픽은 (시드·스테이지·플레이어)로 결정적·플레이어 독립적이라 건너뛰어도 남은 사람의
    // 선택지에 영향이 없다. 완료 여부는 보유 수가 아니라 스테이지 완료 플래그로 판단한다.
    const pending = [...this.agents.values()].filter(
      (agent) => game.engine.state.augmentData[draftDoneKey(stage, agent.id)] !== true,
    );

    // 전원에게 '동시에' 오퍼를 보내고 응답을 병렬로 기다린다 (순차 대기 X). roll은 아래 map이
    // 첫 await 전에 동기로 실행되므로 어떤 픽보다도 먼저 모든 오퍼가 나간다. runRound과 동일하게
    // abortSignal과 레이스 — 드래프트 대기 중 무효 투표가 와도 30초 타임아웃까지 멈추지 않게 한다.
    const raced = await Promise.race([
      Promise.all(
        pending.map(async (agent) => {
          const choices = draft.roll(stage, agent.id);
          const pickedId = await agent.decideDraft(stage, choices);
          return { player: agent.id, pickedId };
        }),
      ).then((picks) => ({ picks })),
      this.abortSignal,
    ]);

    // 무효 요청 — 픽을 하나도 적용하지 않고 즉시 반환 (일부만 적용하면 리플레이가 비결정적).
    if ("abort" in raced) return;

    // 결정론: 픽은 응답 도착 순서가 아니라 항상 고정된 에이전트 순서로 적용 → 이벤트 로그 동일.
    const pickById = new Map(raced.picks.map((p) => [p.player, p.pickedId] as const));
    for (const agent of this.agents.values()) {
      const pickedId = pickById.get(agent.id);
      if (pickedId === undefined) continue; // 이미 완료돼 건너뛴 에이전트
      draft.pick(stage, agent.id, pickedId);
    }

    this.broadcastViews(game); // 모든 픽 적용 후 한 번만 공개
    this.events.onDraftEnd?.(stage);
  }

  /**
   * 국 사이 대기 — 사람 플레이어가 모두 결과 화면을 닫으면(awaitContinue) 즉시
   * 다음 국으로 넘어가고, 아무도 안 닫아도 interRoundDelayMs 상한에서 진행한다.
   * interRoundDelayMs=0이면 즉시 반환(테스트·봇 게임은 지연 없음).
   */
  private async pauseBetweenRounds(): Promise<void> {
    const maxWait = this.config.interRoundDelayMs ?? 0;
    if (maxWait <= 0) return;
    // 봇·미구현 에이전트는 awaitContinue가 없어 즉시 통과 → 사람만 게이트한다.
    // 무효 요청이 오면 ack를 다 못 받아도 즉시 깨어난다.
    await Promise.race([
      Promise.all(
        [...this.agents.values()].map((a) =>
          a.awaitContinue ? a.awaitContinue(maxWait) : Promise.resolve(),
        ),
      ),
      this.abortSignal,
    ]);
  }

  // ─────────────────────────── 뷰 브로드캐스트 ───────────────────────────

  private broadcastViews(game: StandardGame, uraDoraIndicators?: TileId[]): void {
    const state = game.engine.state;
    const rules = game.engine.rules;
    const uraOpt =
      uraDoraIndicators !== undefined && uraDoraIndicators.length > 0
        ? { uraDoraIndicators }
        : undefined;
    for (const agent of this.agents.values()) {
      agent.sendView(buildPlayerView(state, agent.id, rules, uraOpt));
    }
    // 관전자 — 전체 공개 시점 (한 번만 만들어 공유)
    if (this.spectators.size > 0) {
      const specView = buildPlayerView(state, SPECTATOR_ID, rules, uraOpt);
      for (const s of this.spectators.values()) s.sendView(specView);
    }
  }

  private notifyAll(msg: ServerMessage): void {
    for (const agent of this.agents.values()) {
      agent.notify?.(msg);
    }
    for (const s of this.spectators.values()) s.notify?.(msg);
  }

  // ─────────────────────────── 관전자 관리 ───────────────────────────

  /**
   * 관전자를 붙인다. 게임이 이미 진행 중이면 카탈로그와 현재 관전자
   * 시점 뷰를 즉시 보내 바로 화면을 그릴 수 있게 한다.
   */
  addSpectator(sink: SpectatorSink): void {
    this.spectators.set(sink.id, sink);
    if (this.game !== null) {
      if (this.catalogMsg !== null) sink.notify?.(this.catalogMsg);
      sink.sendView(
        buildPlayerView(this.game.engine.state, SPECTATOR_ID, this.game.engine.rules),
      );
    }
  }

  removeSpectator(id: string): void {
    this.spectators.delete(id);
  }

  /** 국 결과 상세(역·판·부·점수 변동·우라도라)를 전 플레이어에게 전송 */
  private notifyRoundOver(
    game: StandardGame,
    outcome: "win" | "draw" | "abort",
    ura: TileId[],
  ): void {
    const state = game.engine.state;
    let settle: RoundSettledPayload | null = null;
    for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
      const event = game.engine.eventLog[i];
      if (event?.type === ROUND_SETTLED) {
        settle = event.payload as RoundSettledPayload;
        break;
      }
    }
    if (settle === null) return;

    const tiles: Record<TileId, PublicTileView> = {};
    const tileView = (id: TileId): PublicTileView | null => {
      const tile = state.tiles[id];
      return tile === undefined ? null : { id, kind: tile.kind, attrs: tile.attrs };
    };
    const includeTile = (id: TileId): void => {
      const v = tileView(id);
      if (v !== null) tiles[id] = v;
    };
    for (const id of ura) includeTile(id);
    for (const info of settle.winInfos ?? []) includeTile(info.winningTileId);

    // 화료자 손패 공개 (실제 마작처럼 결과 화면에서 오른 손을 보여준다)
    const revealedHands: RoundOverMessage["revealedHands"] = {};
    for (const info of settle.winInfos ?? []) {
      const handIds = state.zones[`hand:${info.winner}`]?.tileIds ?? [];
      const hand = [
        ...handIds.map(tileView),
        ...(info.winType === "ron" ? [tileView(info.winningTileId)] : []),
      ].filter((v): v is PublicTileView => v !== null);
      const melds = (state.round.byPlayer[info.winner]?.melds ?? []).map((m) => ({
        kind: m.kind as string,
        tiles: m.tileIds
          .map(tileView)
          .filter((v): v is PublicTileView => v !== null),
      }));
      revealedHands[info.winner] = { hand, melds };
    }

    const msg: RoundOverMessage = {
      type: "roundOver",
      outcome,
      settle,
      uraDoraIndicators: ura,
      tiles,
      revealedHands,
    };
    this.notifyAll(msg);
  }

  // ─────────────────────────── 종료 판정 ───────────────────────────

  /**
   * 반장전 종료 조건 판정.
   * 호출 시점: 한 국이 끝나고 RoundSettled가 적용된 직후.
   *
   * 종료:
   * - 남장(wind=2) 4국이 끝났고 트톱이 오야가 아닐 때 (또는 트톱이 returnScore 이상)
   * - 서입 불허이면 남장 4국 후 무조건 종료
   * - 서입 허용 시 남장 후 1위가 returnScore 미만이면 서장(wind=3) 1국 추가, 이후 종료
   */
  private shouldEnd(state: GameState): boolean {
    // 주의: RoundSettled reducer가 이미 다음 국의 장풍을 적용한 뒤 호출된다.
    // 남4 종료 직후 state.prevalentWind는 3(서1 예정)이다.
    const wind = state.round.prevalentWind;

    // 아직 남장(maxWind)이 끝나지 않았으면 계속
    if (wind <= this.config.maxWind) return false;

    // 남장 완료 — 서입 불허면 즉시 종료
    if (!this.config.westEntry) return true;

    // 서장 4국까지 모두 끝났으면 무조건 종료 (wind가 maxWind+1을 넘어섬)
    if (wind > this.config.maxWind + 1) return true;

    // 서입 판정: 1위가 반환점 이상이면 종료, 미만이면 서장 국을 (계속) 진행
    const topScore = Math.max(...state.players.map((p) => p.score));
    return topScore >= this.config.returnScore;
  }

  // ─────────────────────────── 최종 정산 ───────────────────────────

  private calcRankings(state: GameState): RankingEntry[] {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const { uma, oka, returnScore } = this.config;

    // 우마 배열: [4위 패널티, 3위 패널티, 2위 보너스, 1위 보너스]
    const umaArr = [-uma[1], -uma[0], uma[0], uma[1]];

    // 오카: 반환점 초과분 → 1위에게 모두 (01_GAME_RULES §1)
    const okaScore = oka;

    // 반장 종료 시 남은 리치봉(공탁)은 1위가 획득 (01_GAME_RULES §9)
    const leftoverPot = state.round.riichiPot;

    return sorted.map((p, i) => {
      const rank = (i + 1) as 1 | 2 | 3 | 4;
      const umaValue = umaArr[3 - i] ?? 0; // 배열 역순
      const okaValue = rank === 1 ? okaScore : 0;
      const raw = p.score + (rank === 1 ? leftoverPot : 0);
      const agent = this.agents.get(p.id);
      return {
        playerId: p.id,
        nickname: agent?.nickname ?? p.id,
        isBot: agent?.isBot ?? false,
        // 최종 순위 점수 = (최종 점수 − 반환점) + 우마 (+1위 오카) — 제로섬
        score: raw - returnScore + umaValue * 1000 + okaValue * 1000,
        rawScore: raw,
        uma: umaValue,
        oka: okaValue,
        rank,
      };
    });
  }

  // ─────────────────────────── 리플레이 ───────────────────────────

  /** eventLog에 새로 쌓인 확정 이벤트를 순서대로 onEvent로 흘려보낸다 (커서 전진) */
  private flushEvents(game: StandardGame): void {
    if (!this.events.onEvent) {
      this.emittedEvents = game.engine.eventLog.length;
      return;
    }
    const log = game.engine.eventLog;
    for (let i = this.emittedEvents; i < log.length; i++) {
      this.events.onEvent(JSON.stringify(log[i]));
    }
    this.emittedEvents = log.length;
  }

  private emitInit(
    state: GameState,
    options: StandardGameOptions,
  ): void {
    if (!this.events.onEvent) return;
    this.events.onEvent(
      JSON.stringify({
        type: "__init__",
        payload: {
          config: state.config,
          options: {
            startScore: options.startScore ?? 25000,
            redFivesPerSuit: options.redFivesPerSuit ?? 1,
          },
        },
      }),
    );
  }
}
