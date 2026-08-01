/**
 * HanchanController — 반장전 루프.
 *
 * 동장 4국 + 남장 4국(필요 시 서입 1국) 진행.
 * FlowController로 국을 돌리고, PlayerAgent에게 결정을 위임한다.
 * 도비·오야 트ップ·서입 조건 등 종료 판정을 담당한다.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §4
 */

import { FlowController, reactionPriority } from "../mahjong/flow/FlowController.js";
import type { ActionOption, DecisionPrompt, FlowStatus } from "../mahjong/flow/FlowController.js";
import {
  createStandardGame,
  createStandardGameFromState,
} from "../mahjong/flow/standardGame.js";
import type { StandardGame, StandardGameOptions } from "../mahjong/flow/standardGame.js";
import { DraftController, rebuildAugments } from "../augment/DraftController.js";
import { installAugment } from "../augment/Augment.js";
import { draftDoneKey } from "../augment/events.js";
import { RuleLayer } from "../engine/rules/RuleRegistry.js";
import {
  SPECTATOR_ID,
  arrangeHandForDisplay,
  buildPlayerView,
} from "../information/PlayerView.js";
import type { DiscardOrigin, PlayerView, PublicTileView } from "../information/PlayerView.js";
import type { GameState } from "../engine/state/GameState.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import type { TileId } from "../mahjong/tiles/Tile.js";
import { ROUND_SETTLED } from "../mahjong/flow/flowEvents.js";
import type { RoundSettledPayload } from "../mahjong/flow/flowEvents.js";
import { uraIndicatorIds, winHandIdsOf } from "../mahjong/flow/helpers.js";
import type { PlayerAgent } from "./PlayerAgent.js";
import type {
  RankingEntry,
  DraftStage,
  RevealedHand,
  RoundOverMessage,
  ServerMessage,
} from "../network/protocol.js";

// ─────────────────────────── 반장전 설정 ───────────────────────────

export interface HanchanConfig {
  /**
   * 게임 모드 (기본 hanchan=반장전). tonpuu=동풍전.
   * state.config.mode로 관통되어 증강 모드 필터에 쓰인다.
   * maxWind·westEntry·draftSchedules는 이 값과 별개로 명시해야 한다
   * (hanchanConfigForMode 헬퍼가 모드에 맞는 한 벌을 만들어 준다).
   */
  mode: import("../engine/state/GameState.js").GameMode;
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
  /**
   * 아가리야메(+텐파이야메) 허용 (기본 true, 생략 시 켜짐).
   * 최종 국(오라스)에서 오야가 연장(화료 또는 유국 텐파이)하고 단독 1위이면 그대로 종국.
   */
  agariYame?: boolean;
  /** 우마 점수 [2위에게, 1위에게] (기본 [5, 15] → 1위+15·2위+5·3위-5·4위-15) */
  uma: [number, number];
  /** 오카: 1위 보너스(k단위). 0이면 오카 없음(순수 우마 제로섬). */
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
   * 게임 시작 전에 좌석별로 미리 지급할 증강 id (증강 테스트용).
   * 첫 국 배패 전에 드래프트와 같은 경로로 설치되므로, 배패·국 시작에 개입하는
   * 증강도 1국부터 온전히 작동한다. 카탈로그에 없는 id는 무시한다.
   */
  presetAugments?: Record<PlayerId, readonly string[]>;
  /**
   * 좌석별 **강제 배패** (증강 테스트용) — kindKey 목록("man5"·"wind1").
   * 매 국 배패 직후 패산과 맞바꿔 지정한 패를 손에 쥐여 준다(총 장수·왕패 불변).
   * 지정하지 않은 자리·좌석은 평소대로 무작위 배패다.
   */
  presetHands?: Record<PlayerId, readonly string[]>;
  /**
   * 국 종료 후 다음 국 시작까지의 대기(ms). 결과 화면을 볼 시간을 준다.
   * 기본 0 (테스트·봇 게임은 지연 없음). 실서버가 사람 게임에서 설정한다.
   */
  interRoundDelayMs?: number;
  /**
   * 강제 수(리치 쯔모기리)를 대신 둘 때의 한 박자(ms). 물어볼 것이 없어 즉시
   * 둘 수 있지만, 그러면 앞 사람의 버림과 같은 프레임에 묻혀 "리치가 무엇을
   * 흘렸는지"가 화면에서 사라진다. 기본 0 (테스트·봇 게임은 지연 없음).
   */
  autoMoveDelayMs?: number;
}

export const DEFAULT_HANCHAN_CONFIG: HanchanConfig = {
  mode: "hanchan",
  startScore: 25000,
  returnScore: 30000,
  dobi: true,
  maxWind: 2,
  westEntry: true,
  agariYame: true,
  uma: [5, 15],
  oka: 0,
  draftSchedules: ["gameStart", "southEntry"],
  seed: Date.now(),
  redFivesPerSuit: 1,
  interRoundDelayMs: 0,
  autoMoveDelayMs: 0,
};

/**
 * 게임 모드에 맞는 진행 설정 한 벌(장 수·서입·드래프트 스케줄)을 만든다.
 * 호출부(서버 startGame)는 이 결과에 seed·extraAugments 등을 합쳐 넘긴다.
 * - hanchan: 동+남 2장, 남입 후 서장 서든데스, 드래프트 gameStart+southEntry.
 * - tonpuu: 동 1장, 동4국 후 남장 서든데스(남입), 드래프트 gameStart+eastThird(동3국 진입).
 *   서든데스는 maxWind+1장(반장=서장, 동풍=남장)까지: 국 정산마다 1위가 반환점 이상이면
 *   즉시 종료, 아니면 다음 국 진행, 그 장 4국까지 가면 무조건 종료 (shouldEnd 참고).
 */
export function hanchanConfigForMode(
  mode: import("../engine/state/GameState.js").GameMode,
): Pick<HanchanConfig, "mode" | "maxWind" | "westEntry" | "draftSchedules"> {
  if (mode === "tonpuu") {
    return {
      mode,
      maxWind: 1,
      westEntry: true, // 동4국 후 30000 미달이면 남장 서든데스(남입) — 반장전 서입과 대칭
      draftSchedules: ["gameStart", "eastThird"],
    };
  }
  return {
    mode,
    maxWind: 2,
    westEntry: true,
    draftSchedules: ["gameStart", "southEntry"],
  };
}

/**
 * 아가리야메(+텐파이야메) 종국 판정 (순수 함수 — 테스트 용이).
 *
 * 최종 국(오라스 — maxWind의 마지막 국: 반장=남4·동풍=동4)에서 오야가 연장(렌짱)하고
 * 단독 1위이면 true. 렌짱은 정산 후 장풍·국번이 그대로인 것(오야 유지)으로 판정하며,
 * 오야 화료(아가리야메)와 유국 오야 텐파이(텐파이야메)를 모두 포괄한다.
 *
 * @param agariYame  false면 항상 미적용. 생략/true면 적용.
 * @param maxWind    최대 장풍 수 (반장=2, 동풍=1)
 * @param played     정산 전(방금 둔 국)의 장풍·국번·오야 자리
 * @param post       정산 후 장풍·국번 + 자리별 점수
 */
export function agariYameTriggers(
  agariYame: boolean | undefined,
  maxWind: number,
  played: { wind: number; roundNumber: number; dealerSeat: number },
  post: {
    prevalentWind: number;
    roundNumber: number;
    players: { seat: number; score: number }[];
  },
): boolean {
  if (agariYame === false) return false;
  const lastRoundNumber = post.players.length; // 각 장의 마지막 국 (4인=4국)
  if (played.wind !== maxWind || played.roundNumber !== lastRoundNumber) return false;
  // 정산 후 장풍·국번이 그대로면 오야 연장(화료 또는 텐파이야메)
  const renchan =
    post.prevalentWind === played.wind && post.roundNumber === played.roundNumber;
  if (!renchan) return false;
  // 오야가 단독 1위인가
  const dealer = post.players.find((p) => p.seat === played.dealerSeat);
  if (dealer === undefined) return false;
  const top = Math.max(...post.players.map((p) => p.score));
  return dealer.score === top && post.players.filter((p) => p.score === top).length === 1;
}

/**
 * 중반 드래프트 스테이지별 진입 조건.
 * ROUND_SETTLED 리듀서가 이미 다음 국의 장풍·국 번호를 올린 뒤 검사하므로,
 * "막 다음 국으로 넘어가는 시점"의 round 상태로 판정한다.
 * - southEntry(반장전): 남1국 진입 (prevalentWind=2, roundNumber=1)
 * - eastThird(동풍전): 동3국 진입 (prevalentWind=1, roundNumber=3)
 */
const MID_DRAFT_TRIGGER: Partial<
  Record<DraftStage, (r: GameState["round"]) => boolean>
> = {
  southEntry: (r) => r.prevalentWind === 2 && r.roundNumber === 1,
  eastThird: (r) => r.prevalentWind === 1 && r.roundNumber === 3,
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

/**
 * 손패에서 한 장을 바닥에 내려놓는 액션들 — 버림 자리(lastDiscardFrom)를 재는 대상.
 * riichi는 선언과 함께 버리고, free_discard는 리치 중 자유 버림(증강)이다.
 */
const DISCARDING_ACTIONS = new Set(["discard", "riichi", "free_discard"]);

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

/**
 * 액티브 증강의 **무장(1단계) 액션** — 발동 연출을 내지 않는다.
 *
 * 2단계 증강(무장 선언 → 실제 발동)은 액션이 둘이라 그대로 두면 컷인이 **두 번** 뜬다
 * (2026-08-01 사용자 보고: "미래를 보는 자 연출 2번 나옴"). 무장은 아직 아무 일도
 * 일어나지 않은 선언이므로, 연출은 실제로 판이 움직이는 2단계에만 붙인다.
 */
const FX_SILENT_ACTION_TYPES = new Set(["future_arm"]);

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
  /**
   * 플레이어가 직접 정한 손패 배치 (왼→오른쪽). 클라이언트가 손패가 바뀔 때마다 올린다.
   * 뷰를 만들 때 그대로 실려, 관전·투시로 손패가 공개될 때 소유자가 실제로 쥔
   * 배치가 보인다. 배치가 없는 좌석(봇)은 코어가 표준 정렬로 폴백한다.
   */
  private readonly handOrder: Record<PlayerId, readonly TileId[]> = {};
  /**
   * 마지막 버림패가 손패 어느 자리에서 나왔는지. 배치를 아는 건 여기(handOrder)뿐이고
   * 패가 손을 떠난 뒤에는 자리를 복원할 수 없어 **버리기 직전**에 재어 둔다.
   */
  private lastDiscardFrom: DiscardOrigin | null = null;
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

  /**
   * 손패 배치를 갱신한다. 낡은 배치(이미 버린 패 등)는 코어가 흡수하므로
   * 여기서는 검증하지 않고 그대로 담아 둔다.
   *
   * 배치가 바뀌어도 게임 상태는 그대로다 — 즉시 뷰를 다시 뿌려, 관전자·투시
   * 보유자가 다음 게임 이벤트를 기다리지 않고 새 배치를 본다.
   */
  setHandOrder(player: PlayerId, tileIds: readonly TileId[]): void {
    const prev = this.handOrder[player];
    // 같은 배치를 다시 보내오면 아무 것도 하지 않는다 — 뷰 브로드캐스트를
    // 되풀이시키는 값싼 공격 통로를 막는다.
    if (prev !== undefined && prev.length === tileIds.length && prev.every((id, i) => id === tileIds[i])) {
      return;
    }
    this.handOrder[player] = [...tileIds];
    if (this.game !== null) this.broadcastViews(this.game);
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
      mode: this.config.mode,
      startScore: this.config.startScore,
      redFivesPerSuit: this.config.redFivesPerSuit ?? 1,
      ...(this.config.extraAugments !== undefined
        ? { extraAugments: this.config.extraAugments }
        : {}),
    };
    const game = createStandardGame(options);
    this.game = game;

    // 강제 배패 규칙 — 1국 배패(runRound의 flow.begin)보다 먼저 깔아야 첫 국부터 먹는다
    this.installPresetHands(game);

    // 초기 상태를 이벤트 로그에 기록
    this.emitInit(game.engine.state, options);

    // 증강 카탈로그 전송 (클라이언트가 id→이름·등급을 알게 되는 시점)
    this.sendCatalog(game);

    // 사전 지급 증강 (증강 테스트) — 배패 전에 설치해 1국부터 그대로 작동하게 한다
    this.installPreset(game);

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
    // 스케줄은 모드에 따라 다르므로(반장=southEntry, 동풍=eastThird) config에서 읽는다.
    const ids = [...this.agents.keys()];
    for (const stage of this.config.draftSchedules ?? []) {
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

  /** 증강 카탈로그를 전 참가자·관전자에게 보낸다 (id→이름·등급·상세) */
  private sendCatalog(game: StandardGame): void {
    this.catalogMsg = {
      type: "catalog",
      // 표시용 부가 필드(도감 상세·획득 시점·모드 제한)까지 함께 보낸다 —
      // 클라이언트 카탈로그는 이 메시지로 통째로 교체되므로, 빼면 게임 중에만
      // 도감 정보가 사라진다(증강 테스트 패널이 상세를 못 읽는 원인).
      augments: game.augments.all().map((a) => ({
        id: a.id,
        tier: a.tier,
        category: a.category,
        name: a.name,
        description: a.description,
        ...(a.detail !== undefined ? { detail: a.detail } : {}),
        ...(a.draftStages !== undefined ? { draftStages: a.draftStages } : {}),
        ...(a.modes !== undefined ? { modes: a.modes } : {}),
      })),
    };
    this.notifyAll(this.catalogMsg);
  }

  // ─────────────────────────── 증강 직접 지급 (테스트) ───────────────────────────

  /**
   * 진행 중인 게임에서 증강 1개를 즉시 획득시킨다 (증강 테스트 전용).
   * 드래프트와 같은 경로(draftPick 액션 + install)를 타므로 상태·뷰·리플레이가
   * 정상 획득과 동일하게 남는다. 다만 스테이지 완료 플래그는 찍지 않는다.
   *
   * 주의: 국 도중에 설치되면 배패·국 시작 시점에 개입하는 증강(패 변형 등)은
   * 이번 국에 이미 지난 시점을 되돌리지 못한다 — 다음 국부터 온전히 작동한다.
   */
  grantAugment(player: PlayerId, augmentId: string): { ok: boolean; reason?: string } {
    const game = this.game;
    if (game === null) return { ok: false, reason: "game not started" };
    const reason = this.applyAugment(game, player, augmentId);
    if (reason !== null) return { ok: false, reason };
    this.broadcastViews(game);
    return { ok: true };
  }

  /**
   * 강제 배패(증강 테스트)를 `deal.presetHand` 규칙으로 깐다.
   *
   * 규칙은 평소에 **정의조차 되지 않는다** — 정의됐을 때만 배패 리듀서가 강제 배패
   * 경로를 타므로, 일반 게임의 무작위 배패는 이 기능이 있어도 한 줄도 달라지지 않는다.
   * 규칙 합성은 결정적이라 같은 시드·같은 지정이면 리플레이도 그대로 재현된다.
   */
  private installPresetHands(game: StandardGame): void {
    const preset = this.config.presetHands;
    if (preset === undefined) return;
    const seats = Object.entries(preset).filter(
      ([player, ids]) => this.agents.has(player as PlayerId) && ids.length > 0,
    );
    if (seats.length === 0) return;
    const table = new Map<string, readonly string[]>(seats);
    const rules = game.engine.rules;
    if (!rules.has("deal.presetHand")) rules.define("deal.presetHand", [] as readonly string[]);
    rules.addModifier<readonly string[]>("deal.presetHand", {
      source: "__sandbox_preset_hand",
      layer: RuleLayer.System,
      apply: (current, ctx) =>
        ctx.playerId === undefined ? current : (table.get(ctx.playerId) ?? current),
    });
  }

  /** 설정된 사전 지급 증강을 설치한다. 알 수 없는 id·중복은 조용히 건너뛴다. */
  private installPreset(game: StandardGame): void {
    const preset = this.config.presetAugments;
    if (preset === undefined) return;
    for (const [player, ids] of Object.entries(preset)) {
      if (!this.agents.has(player as PlayerId)) continue;
      for (const id of ids) this.applyAugment(game, player as PlayerId, id);
    }
  }

  /** 증강 1개를 상태에 기록하고 설치한다. 성공하면 null, 실패하면 사유. */
  private applyAugment(
    game: StandardGame,
    player: PlayerId,
    augmentId: string,
  ): string | null {
    const def = game.augments.get(augmentId);
    if (def === undefined) return `unknown augment: ${augmentId}`;
    const res = game.engine.submit({
      player,
      type: "draftPick",
      payload: { augmentId },
    });
    if (!res.ok) return res.reason;
    installAugment(game.engine, def, player, { yaku: game.yaku });
    return null;
  }

  /** 국 루프 — run()과 resume()이 공유한다. 현재 상태에서 종국까지 진행. */
  private async runLoop(game: StandardGame, startRoundIndex: number): Promise<RankingEntry[]> {
    let roundIndex = startRoundIndex;
    while (true) {
      if (this.aborted) return this.finishAborted();
      this.events.onRoundStart?.(game, roundIndex);
      this.broadcastViews(game);

      // 아가리야메 판정용 — 정산 전(지금 둘 국)의 장풍·국번·오야 자리를 기억한다.
      const playedRound = {
        wind: game.engine.state.round.prevalentWind,
        roundNumber: game.engine.state.round.roundNumber,
        dealerSeat: game.engine.state.round.dealerSeat,
      };

      const outcome = await this.runRound(game);
      if (this.aborted) return this.finishAborted();
      this.flushEvents(game); // 국 진행 이벤트를 리플레이 로그로
      this.events.onRoundEnd?.(game, outcome, roundIndex);

      roundIndex++;
      // 정산 후 뷰 전송 — 화료면 뒷도라까지 공개
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

      // 중반 드래프트 진입 체크 (드래프트) — 스테이지당 1회만.
      // 반장전=남1국 진입(southEntry), 동풍전=동3국 진입(eastThird). 연장(본장)으로
      // 라운드 번호가 유지돼도 재추첨하지 않는다(draftedStages 가드).
      const round = game.engine.state.round;
      for (const stage of this.config.draftSchedules ?? []) {
        const trigger = MID_DRAFT_TRIGGER[stage];
        if (trigger !== undefined && !this.draftedStages.has(stage) && trigger(round)) {
          await this.runDraft(game, stage);
          this.flushEvents(game);
          // 드래프트 대기 중 무효가 들어오면 다음 국을 시작하지 않고 즉시 종료
          if (this.aborted) return this.finishAborted();
          break;
        }
      }

      // 종료 조건 판정 (일반 종국 또는 아가리야메)
      if (
        this.shouldEnd(game.engine.state, game.engine.rules) ||
        this.isAgariYame(game.engine.state, playedRound)
      ) {
        break;
      }

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
    const rankings = this.calcRankings(game.engine.state, game.engine.rules);
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
    // 지난 국의 손패 배치는 버린다 — tile id는 국이 바뀌어도 0~135를 그대로 재사용해
    // 남겨 두면 새 배패에 지난 국의 배치가 엉뚱하게 들러붙는다.
    for (const pid of Object.keys(this.handOrder)) delete this.handOrder[pid];
    this.lastDiscardFrom = null;
    const flow = new FlowController(game.engine);
    let status: FlowStatus = flow.begin();
    this.broadcastViews(game); // 배패 직후 — 손패가 보이는 첫 시점

    while (status.kind === "awaiting") {
      // 강제 수(리치 쯔모기리) — 고를 것이 없으니 에이전트에게 묻지 않고 그대로 둔다.
      // 사람은 프롬프트조차 받지 않아 매 순 같은 패를 다시 클릭할 일이 없다.
      // 턴 프롬프트는 언제나 한 명뿐이라 auto가 다른 사람의 리액션과 섞이지 않는다.
      const auto = status.prompts.length === 1 ? status.prompts[0] : undefined;
      if (auto?.auto === true) {
        if (await this.pauseForAutoMove()) return "abort";
        this.trackDiscardOrigin(game, auto.player, auto.options[0]!);
        status = flow.submit(auto.player, auto.options[0]!);
        this.broadcastViews(game);
        continue;
      }

      // 결정이 필요한 플레이어에게 prompt 전송하고 결과 수집 (무효 요청 시 즉시 이탈)
      //
      // 리액션은 여러 명에게 동시에 나가는데, 우선순위가 더 높은 선언(론·펑)이 들어오는
      // 순간 나머지 사람의 선택은 결과를 바꿀 수 없다. 예전에는 그래도 전원의 응답을
      // 기다려서, 봇이 이미 론을 부른 뒤에도 사람이 '치'나 '스킵'을 누를 때까지 판이
      // 멈춰 있었다(2026-07-31 사용자 보고). 이제 확정되는 즉시 남은 프롬프트를 접는다.
      const prompts = status.prompts;
      const decidedRank = new Map<PlayerId, number>();
      const bestPossible = new Map<PlayerId, number>(
        prompts.map((p) => [
          p.player,
          p.options.reduce((m, o) => Math.max(m, reactionPriority(o.type)), 0),
        ]),
      );
      /** 확정된 선언보다 약한 프롬프트를 접는다 (리액션 프롬프트가 여럿일 때만) */
      const foldOutranked = (): void => {
        if (prompts.length < 2) return;
        let best = 0;
        for (const r of decidedRank.values()) best = Math.max(best, r);
        if (best === 0) return;
        for (const p of prompts) {
          if (decidedRank.has(p.player)) continue;
          if ((bestPossible.get(p.player) ?? 0) >= best) continue;
          this.agents.get(p.player)?.cancelDecision?.();
        }
      };
      const raced = await Promise.race([
        Promise.all(
          prompts.map(async (prompt) => {
            const agent = this.agents.get(prompt.player);
            if (agent === undefined) {
              throw new Error(`No agent for player ${prompt.player}`);
            }
            const chosen = await agent.decide(prompt);
            decidedRank.set(prompt.player, reactionPriority(chosen.type));
            foldOutranked();
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
          this.trackDiscardOrigin(game, player, option);
          status = flow.submit(player, option);
          // 특수 액션(액티브 증강 등) 실행 연출 — 표준 액션이 아닌 것만.
          // 비표준 타입은 턴 프롬프트에서만 나오므로 결정 = 실행이 보장된다.
          if (
            !STANDARD_ACTION_TYPES.has(option.type) &&
            !FX_SILENT_ACTION_TYPES.has(option.type)
          ) {
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

    // 오퍼(3지선다)를 픽보다 먼저, 고정 에이전트 순서로 로그에 남긴다.
    // AUGMENT_OFFERED는 상태 불변 정보 이벤트라 픽률·등급 통계 전용이며, 시드에서
    // 결정적으로 재현되므로 리플레이·재개에서도 순서·내용이 동일하다.
    const offered = new Map<string, ReturnType<typeof draft.roll>>();
    for (const agent of pending) {
      const choices = draft.roll(stage, agent.id);
      offered.set(agent.id, choices);
      draft.recordOffer(stage, agent.id, choices);
    }

    // 전원에게 '동시에' 오퍼를 보내고 응답을 병렬로 기다린다 (순차 대기 X). runRound과 동일하게
    // abortSignal과 레이스 — 드래프트 대기 중 무효 투표가 와도 30초 타임아웃까지 멈추지 않게 한다.
    const raced = await Promise.race([
      Promise.all(
        pending.map(async (agent) => {
          const choices = offered.get(agent.id) ?? draft.roll(stage, agent.id);
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
   * 강제 수를 대신 두기 전 한 박자 — 봇의 생각 시간과 같은 자리다. 이게 없으면
   * 리치의 쯔모기리가 앞 사람의 버림과 한 프레임에 붙어 나가 무엇을 흘렸는지
   * 보이지 않는다. 무효 요청이 오면 즉시 깨어나 true(=중단)를 돌려준다.
   */
  private async pauseForAutoMove(): Promise<boolean> {
    const ms = this.config.autoMoveDelayMs ?? 0;
    if (ms <= 0) return this.aborted;
    const raced = await Promise.race([
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      this.abortSignal,
    ]);
    return raced !== null;
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

  /**
   * 버리기 **직전**에 그 패가 배치의 몇 번째 자리였는지 재어 둔다.
   *
   * 실제 탁자에서 남의 손이 어느 자리에서 열렸는지는 전원이 보는 정보다. 배치를
   * 서버가 알고 있으므로(handOrder) 패 내용을 밝히지 않고 자리만 공개할 수 있다.
   *
   * **버림 외의 액션에서는 손대지 않는다.** 표식은 바닥에 놓인 그 버림패가 살아 있는
   * 동안 계속 보여야 한다 — 실제 탁자에서도 다음 사람이 버릴 때까지 벌어진 자리가
   * 남아 있다. (패스에서 지웠더니 내 차례가 오는 순간 앞사람 자리가 사라졌다.)
   * 낡은 표식은 buildPlayerView가 `round.lastDiscard`와 대조해 걸러내므로
   * — 후로가 그 패를 가져가면 CALL_MADE가 lastDiscard를 비운다 — 여기서는 안전하다.
   */
  private trackDiscardOrigin(
    game: StandardGame,
    player: PlayerId,
    option: { type: string; payload: unknown },
  ): void {
    // 손패에서 한 장을 바닥에 내려놓는 액션 전부.
    // riichi = 선언과 함께 버림, free_discard = 리치 중 자유 버림(증강).
    if (!DISCARDING_ACTIONS.has(option.type)) return;
    const tileId = (option.payload as { tileId?: unknown })?.tileId;
    if (typeof tileId !== "number") {
      this.lastDiscardFrom = null;
      return;
    }
    const state = game.engine.state;
    const arranged = arrangeHandForDisplay(state, player, this.handOrder[player]);
    const index = arranged.indexOf(tileId);
    if (index < 0) {
      this.lastDiscardFrom = null;
      return;
    }
    this.lastDiscardFrom = {
      player,
      tileId,
      index,
      handSize: arranged.length,
      tsumogiri: state.round.lastDrawnTile === tileId,
    };
  }

  // ─────────────────────────── 뷰 브로드캐스트 ───────────────────────────

  private broadcastViews(game: StandardGame, uraDoraIndicators?: TileId[]): void {
    const state = game.engine.state;
    const rules = game.engine.rules;
    const viewOpt = {
      yaku: game.yaku, // 본인 뷰 형식텐파이(역없음) 계산용
      handOrder: this.handOrder, // 손패 배치 — 전원이 같은 순서를 본다
      lastDiscardFrom: this.lastDiscardFrom, // 마지막 버림이 나온 자리
      ...(uraDoraIndicators !== undefined && uraDoraIndicators.length > 0
        ? { uraDoraIndicators }
        : {}),
    };
    for (const agent of this.agents.values()) {
      // 증강 테스트 시점 전환: override가 있으면 그 좌석 시점으로 뷰를 만든다.
      // 형식텐파이(noYaku) 등 '본인 뷰' 정보는 관찰 대상 좌석 기준으로 채워져,
      // 그 좌석이 실제로 보는 화면을 그대로 재현한다.
      const viewerId = agent.viewSeatOverride?.() ?? agent.id;
      agent.sendView(buildPlayerView(state, viewerId, rules, viewOpt));
    }
    // 관전자 — 전체 공개 시점 (한 번만 만들어 공유). 형식텐파이는 본인 뷰 전용이라 불필요.
    if (this.spectators.size > 0) {
      const specView = buildPlayerView(state, SPECTATOR_ID, rules, viewOpt);
      for (const s of this.spectators.values()) s.sendView(specView);
    }
  }

  /**
   * 한 에이전트에게 현재 상태의 뷰를 즉시 다시 보낸다 (증강 테스트 시점 전환용).
   * viewSeatOverride를 방금 바꾼 직후, 다음 상태 변화를 기다리지 않고 새 시점을
   * 바로 반영하기 위해 RoomManager가 호출한다. 게임이 없으면 아무 것도 하지 않는다.
   */
  resendViewTo(agentId: PlayerId): void {
    if (this.game === null) return;
    const agent = this.agents.get(agentId);
    if (agent === undefined) return;
    const state = this.game.engine.state;
    const rules = this.game.engine.rules;
    const viewerId = agent.viewSeatOverride?.() ?? agent.id;
    agent.sendView(
      buildPlayerView(state, viewerId, rules, {
        yaku: this.game.yaku,
        handOrder: this.handOrder,
        lastDiscardFrom: this.lastDiscardFrom,
      }),
    );
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
        buildPlayerView(this.game.engine.state, SPECTATOR_ID, this.game.engine.rules, {
          handOrder: this.handOrder,
          lastDiscardFrom: this.lastDiscardFrom,
        }),
      );
    }
  }

  removeSpectator(id: string): void {
    this.spectators.delete(id);
  }

  /** 국 결과 상세(역·판·부·점수 변동·뒷도라)를 전 플레이어에게 전송 */
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

    // 화료자 손패 공개 (실제 마작처럼 결과 화면에서 오른 손을 보여준다).
    // 자유 선언이면 실제 손패가 아니라 리치 스냅샷(hand.winTileIds)을 보여준다 —
    // "화료 시 패의 모습은 첫 리치 때의 손패". 쯔모패는 스냅샷/손패에서 제외한 뒤
    // 화료패를 한 번만 얹어 쯔모·론 모두 13장+화료패 형태로 통일한다.
    const revealedHands: RoundOverMessage["revealedHands"] = {};
    const meldViewsOf = (id: PlayerId): RevealedHand["melds"] =>
      (state.round.byPlayer[id]?.melds ?? []).map((m) => ({
        kind: m.kind as string,
        tiles: m.tileIds
          .map(tileView)
          .filter((v): v is PublicTileView => v !== null),
      }));
    for (const info of settle.winInfos ?? []) {
      const concealedIds = winHandIdsOf(state, game.engine.rules, info.winner).filter(
        (id) => id !== info.winningTileId,
      );
      const hand = [
        ...concealedIds.map(tileView),
        tileView(info.winningTileId),
      ].filter((v): v is PublicTileView => v !== null);
      revealedHands[info.winner] = { hand, melds: meldViewsOf(info.winner) };
    }

    // 황패유국 — 텐파이자만 손을 공개한다 (실제 마작의 텐파이 선언). 노텐은 엎어 둔다.
    // 이게 없으면 결과 화면에 "유 국"과 ±점수만 남아 왜 주고받았는지 알 수 없다.
    // 손패는 텐파이 집계와 같은 winHandIdsOf로 뽑아야(자유 선언의 리치 스냅샷 포함)
    // 화면에 뜬 손과 텐파이 판정이 어긋나지 않는다.
    if (outcome === "draw") {
      for (const id of settle.tenpaiPlayers ?? []) {
        const hand = winHandIdsOf(state, game.engine.rules, id)
          .map(tileView)
          .filter((v): v is PublicTileView => v !== null);
        revealedHands[id] = { hand, melds: meldViewsOf(id) };
      }
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
  private shouldEnd(
    state: GameState,
    rules: import("../engine/rules/RuleRegistry.js").RuleRegistry,
  ): boolean {
    // 즉시 우승 조건 (천하통일 등) — 어떤 플레이어든 자기 문턱 점수를 넘으면
    // 남은 국과 무관하게 게임을 종료한다. 문턱은 보유자 전용 규칙(기본 0 = 비활성).
    // 정산 직후 호출되므로 점수가 문턱을 넘은 국의 끝에서 곧바로 걸린다.
    for (const p of state.players) {
      const threshold = rules.resolve<number>("match.instantWinScore", {
        playerId: p.id,
        state,
      });
      if (threshold > 0 && p.score >= threshold) return true;
    }

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

  /**
   * 아가리야메(+텐파이야메) 판정. 호출 시점: RoundSettled 적용 직후.
   *
   * 최종 국(오라스 — 반장=남4국, 동풍=동4국, 즉 maxWind의 마지막 국)에서
   * 오야가 연장(렌짱)하고 단독 1위이면 그대로 게임을 종료한다. 연장은 오야 화료
   * (아가리야메) 또는 유국 시 오야 텐파이(텐파이야메)로 발생하며, 둘 다 대상이다.
   * 오야 특권으로 게임을 끝내 무한 연장·불필요한 서입을 막는다.
   *
   * 렌짱은 정산 후 장풍·국번이 그대로인 것으로 판정한다(오야 유지 시 국이 안 넘어감).
   * 서입 연장국(wind>maxWind)은 반환점 도달로 이미 종료 판정되므로 제외한다.
   */
  private isAgariYame(
    state: GameState,
    played: { wind: number; roundNumber: number; dealerSeat: number },
  ): boolean {
    return agariYameTriggers(this.config.agariYame, this.config.maxWind, played, {
      prevalentWind: state.round.prevalentWind,
      roundNumber: state.round.roundNumber,
      players: state.players.map((p) => ({ seat: p.seat, score: p.score })),
    });
  }

  // ─────────────────────────── 최종 정산 ───────────────────────────

  private calcRankings(
    state: GameState,
    rules?: import("../engine/rules/RuleRegistry.js").RuleRegistry,
  ): RankingEntry[] {
    // 게임 종료 시 최종 점수 보정 (계약 위약금·가불 상환 등 — score.finalAdjust)
    const finalScore = (p: GameState["players"][number]): number =>
      rules === undefined
        ? p.score
        : p.score + rules.resolve<number>("score.finalAdjust", { playerId: p.id, state });

    const sorted = [...state.players].sort((a, b) => finalScore(b) - finalScore(a));
    const { uma, oka, startScore } = this.config;

    // 우마 배열: [4위 패널티, 3위 패널티, 2위 보너스, 1위 보너스]
    const umaArr = [-uma[1], -uma[0], uma[0], uma[1]];

    // 오카: 1위 보너스(k단위). 0이면 오카 없음. (01_GAME_RULES §1)
    // 주의: 제로섬 기준점은 원점(startScore)이다. 오카를 쓰려면 기준점을 반환점으로
    // 되돌리고 oka=(반환점−원점)×4/1000 로 맞춰야 총점이 제로섬을 유지한다.
    const okaScore = oka;

    // 반장 종료 시 남은 리치봉(공탁)은 1위가 획득 (01_GAME_RULES §9)
    const leftoverPot = state.round.riichiPot;

    return sorted.map((p, i) => {
      const rank = (i + 1) as 1 | 2 | 3 | 4;
      const umaValue = umaArr[3 - i] ?? 0; // 배열 역순
      const okaValue = rank === 1 ? okaScore : 0;
      const raw = finalScore(p) + (rank === 1 ? leftoverPot : 0);
      const agent = this.agents.get(p.id);
      return {
        playerId: p.id,
        nickname: agent?.nickname ?? p.id,
        isBot: agent?.isBot ?? false,
        // 최종 순위 점수 = (최종 점수 − 원점) + 우마 (+1위 오카) — 제로섬
        score: raw - startScore + umaValue * 1000 + okaValue * 1000,
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
