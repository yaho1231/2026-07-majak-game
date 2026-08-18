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
import type { AugmentDef } from "../augment/Augment.js";
import { draftDoneKey } from "../augment/events.js";
import { RuleLayer } from "../engine/rules/RuleRegistry.js";
import type { EffectFailure } from "../engine/effects/EventProcessor.js";
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
  GameEndReason,
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
  /**
   * 에이전트 응답을 기다리는 **최후의 상한**(ms). 생략하면 `AGENT_DECIDE_TIMEOUT_MS`(90초).
   *
   * 이 그물은 "답이 영영 안 오는 에이전트"를 위한 것이지 **오래 걸리는 에이전트**를
   * 위한 것이 아니다. 튜토리얼 방은 둘 다 정상적으로 오래 끈다 — 사람에게는 사실상
   * 시간 제한이 없고(`TUTORIAL_DECISION_TIMEOUT_MS`), 봇은 말풍선이 떠 있는 동안
   * 일부러 답을 미룬다(`TUTORIAL_HOLD_NOTE`). 90초짜리 그물을 그대로 두면 그 둘이
   * 전부 걸려서, 배우는 사람의 차례가 대신 두어지고 봇의 결정(리치 대기패 배급까지)이
   * 안전 폴백으로 갈아치워진다 — 실제로 그렇게 유국이 났다(2026-08-18 실측).
   *
   * 그래서 **끄지는 않고 늘린다.** 상한이 사라지면 방이 영원히 `playing`으로 남는
   * 소프트락이 돌아온다(BLOCKER-5). 어디까지나 에이전트 자신의 타이머가 먼저
   * 터지도록, 그보다 넉넉한 값을 방이 정해서 준다.
   */
  agentDecideTimeoutMs?: number;
  /**
   * **국과 국 사이를 더 붙들어야 하는가** — true인 동안 다음 국을 시작하지 않는다.
   * 생략하면 종전대로 `interRoundDelayMs` 상한에서 넘어간다.
   *
   * 튜토리얼이 쓴다: 마지막 말풍선("여기까지가 기본입니다")을 읽고 있는데 5초 뒤
   * 새 국이 시작되면, 다 끝난 줄 알았던 판이 저 혼자 다시 시작한다
   * (2026-08-19 사용자 보고). 결과 화면을 닫는 것은 사람이 정할 일이다.
   *
   * 여기서도 상한은 남는다 — 이 함수가 계속 true를 돌려주면 `HOLD_ROUND_MAX_MS`에서
   * 포기하고 진행한다. 신호가 끊긴 방이 영원히 국 사이에 멈춰 있지 않게.
   */
  holdBetweenRounds?: () => boolean;
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
  /**
   * 증강 훅(Interceptor·Reaction)이 던져서 격리됐을 때 호출된다 — 서버 로깅용.
   * 격리 덕분에 게임은 계속 진행되므로, 이 훅이 없으면 증강 버그가 **아무 흔적 없이**
   * 조용히 사라진다. 운영에서는 반드시 연결할 것. (docs/25 최우선#1)
   */
  onEffectError?: (failure: EffectFailure) => void;
  /**
   * 드래프트 가중치 덮어쓰기 (티어 자동 조정 결과). 서버가 AugmentStatsStore에서
   * 읽어 넘긴다. 없으면 정적 티어표를 그대로 쓴다.
   */
  augmentWeights?: Readonly<Record<string, number>>;
}

/**
 * 시드를 안 넘긴 호출자가 받는 기본 시드.
 *
 * 예전 값은 `Date.now()`였다. 모듈이 **로드될 때 한 번** 평가되므로 같은 프로세스의
 * 모든 게임이 같은 시드를 쓰고(= 서버가 시드를 빠뜨리면 판이 전부 똑같아진다),
 * 재시작하면 값이 달라져 **그 게임을 다시 재현할 수 없다**. 결정론이 전제인
 * 리플레이·resume에서 가장 나쁜 조합이다(docs/25 시스템 횡단 #15).
 *
 * 고정값으로 바꿔 "시드를 안 주면 항상 같은 판"이 되게 했다 — 조용한 비결정 대신
 * 눈에 띄는 반복이다. **실제 대국은 반드시 호출자가 시드를 넘긴다**
 * (서버는 `RoomManager`가 `randomInt`로 만들어 넘기고, 그 값이 리플레이에 남는다).
 */
export const DEFAULT_SEED = 1;

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
  draftSchedules: ["gameStart", "eastThird", "southEntry", "southThird"],
  seed: DEFAULT_SEED,
  redFivesPerSuit: 1,
  interRoundDelayMs: 0,
  autoMoveDelayMs: 0,
};

/**
 * 게임 모드에 맞는 진행 설정 한 벌(장 수·서입·드래프트 스케줄)을 만든다.
 * 호출부(서버 startGame)는 이 결과에 seed·extraAugments 등을 합쳐 넘긴다.
 * - hanchan: 동+남 2장, 남입 후 서장 서든데스, 드래프트 4회
 *   (gameStart=동1국 + eastThird=동3국 + southEntry=남1국 + southThird=남3국).
 * - tonpuu: 동 1장, 동4국 후 남장 서든데스(남입), 드래프트 3회
 *   (gameStart=동1국 + eastThird=동3국 + eastFourth=동4국).
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
      draftSchedules: ["gameStart", "eastThird", "eastFourth"],
    };
  }
  return {
    mode,
    maxWind: 2,
    westEntry: true,
    draftSchedules: ["gameStart", "eastThird", "southEntry", "southThird"],
  };
}

/**
 * 이어하기가 **파일에서 읽어야 하는** 진행 설정만 추린다 (리플레이 `__init__`용).
 *
 * 판을 다시 세울 때 반드시 원본과 같아야 하는 것은 **규칙**이다 — 몇 장까지 가는지,
 * 서입이 있는지, 우마·오카가 얼마인지, 드래프트를 언제 하는지. 이게 어긋나면
 * 재개한 판이 원본과 다른 점수로 끝난다.
 *
 * 반대로 **담지 않는 것**에도 이유가 있다:
 * - `seed` — 난수 상태는 이미 `GameState`에 있다. 여기 적힌 시드를 다시 쓰면
 *   오히려 이미 뽑은 패를 되풀이하게 된다.
 * - `extraAugments`·`onEffectError`·`interRoundDelayMs`·`autoMoveDelayMs` —
 *   판의 규칙이 아니라 **그 판을 돌리는 서버의 설정**이다. 재개하는 쪽이 정한다.
 * - `preset*` — 증강 테스트 전용이고, 그 방은 애초에 이어하기 대상이 아니다.
 */
export type ResumableHanchanConfig = Pick<
  HanchanConfig,
  "mode" | "startScore" | "returnScore" | "dobi" | "maxWind" | "westEntry" | "uma" | "oka"
> &
  Partial<Pick<HanchanConfig, "agariYame" | "draftSchedules" | "redFivesPerSuit">>;

export function resumableHanchanConfig(config: HanchanConfig): ResumableHanchanConfig {
  return {
    mode: config.mode,
    startScore: config.startScore,
    returnScore: config.returnScore,
    dobi: config.dobi,
    maxWind: config.maxWind,
    westEntry: config.westEntry,
    uma: config.uma,
    oka: config.oka,
    ...(config.agariYame !== undefined ? { agariYame: config.agariYame } : {}),
    ...(config.draftSchedules !== undefined ? { draftSchedules: config.draftSchedules } : {}),
    ...(config.redFivesPerSuit !== undefined ? { redFivesPerSuit: config.redFivesPerSuit } : {}),
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
    /** 정산 **후**의 오야 자리 — 오야를 옮기는 증강이 있으면 played와 달라진다 */
    dealerSeat: number;
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
  // 오야가 단독 1위인가 — **정산 후** 오야 자리로 본다.
  //
  // 만년 오야·찬탈자처럼 오야 자리를 옮기는 증강이 있으면 "연장한 사람"과
  // "점수를 조회하는 사람"이 서로 달라진다. 예전에는 국 시작 시점의 오야를 봐서,
  // 남4국에 p2가 연장했는데 p0의 점수로 아가리야메를 판정해 **엉뚱한 사람의
  // 1위로 게임이 끝나거나**, 반대로 끝나야 할 게임이 안 끝났다(docs/25 국면 #5).
  const dealer = post.players.find((p) => p.seat === post.dealerSeat);
  if (dealer === undefined) return false;
  const top = Math.max(...post.players.map((p) => p.score));
  return dealer.score === top && post.players.filter((p) => p.score === top).length === 1;
}

/**
 * 중반 드래프트 스테이지별 진입 조건.
 * ROUND_SETTLED 리듀서가 이미 다음 국의 장풍·국 번호를 올린 뒤 검사하므로,
 * "막 다음 국으로 넘어가는 시점"의 round 상태로 판정한다.
 * - eastThird(공통):   동3국 진입 (prevalentWind=1, roundNumber=3)
 * - eastFourth(동풍전): 동4국 진입 (prevalentWind=1, roundNumber=4)
 * - southEntry(반장전): 남1국 진입 (prevalentWind=2, roundNumber=1)
 * - southThird(반장전): 남3국 진입 (prevalentWind=2, roundNumber=3)
 *
 * 조건이 "해당 국 진입"이고 스테이지당 1회(draftedStages 가드)이므로, 본장 연장으로
 * 같은 국이 여러 번 열려도 **첫 진입 때만** 지급된다.
 */
const MID_DRAFT_TRIGGER: Partial<
  Record<DraftStage, (r: GameState["round"]) => boolean>
> = {
  eastThird: (r) => r.prevalentWind === 1 && r.roundNumber === 3,
  eastFourth: (r) => r.prevalentWind === 1 && r.roundNumber === 4,
  southEntry: (r) => r.prevalentWind === 2 && r.roundNumber === 1,
  southThird: (r) => r.prevalentWind === 2 && r.roundNumber === 3,
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
  onGameOver?: (rankings: RankingEntry[], reason: GameEndReason) => void;
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
 * 액티브 증강의 **중간 단계 액션** — 발동 연출을 내지 않는다.
 *
 * 여러 단계로 나뉜 증강(선언 → 고르기 → 실행)은 액션이 여럿이라 그대로 두면 컷인이
 * 단계 수만큼 뜬다 (2026-08-01: "미래를 보는 자 연출 2번 나옴", 2026-08-12:
 * "등가교환 알림 3번씩 뜸"). 한 번의 발동은 한 번만 알린다 — **그 증강에서 발동이라고
 * 부를 만한 단계 하나**만 남기고 나머지는 여기서 지운다.
 *
 * 어느 단계를 남길지는 증강마다 다르다.
 * - 미래를 보는 자: 무장은 아직 아무 일도 아니므로 실제 교환(future_exchange)을 남긴다.
 * - 등가교환: **대상 지정(swap3)**을 남긴다. 사용 횟수를 소비하고 상대 손패를 여는
 *   되돌릴 수 없는 순간이고, 뒤의 두 단계(넘길 3장·가져올 3장)는 상대가 리치를 걸면
 *   끝나지 않을 수도 있어 "항상 정확히 한 번"이 되지 않는다.
 *
 * 클라이언트의 중복 제거는 `{좌석}:{액션타입}` 키라 여기서 걸러야 한다 —
 * 단계마다 타입이 달라 그쪽에서는 서로 다른 발동으로 보인다.
 */
const FX_SILENT_ACTION_TYPES = new Set([
  "future_arm", // 미래를 보는 자 — 무장 (실제 교환은 future_exchange)
  "swap3_give", // 등가교환 — 넘길 3장 고르기 (알림은 지정 단계 swap3에서 한 번)
  "swap3_take", // 등가교환 — 가져올 3장 고르기
]);

/**
 * 에이전트 응답을 기다리는 **최후의** 상한(ms).
 *
 * 제한 시간을 스스로 거는 것은 HumanAgent(30초)뿐이다. 봇에는 없어서, 해결되지
 * 않는 프로미스 하나면 방이 영원히 `playing`으로 남고 좀비 스위퍼는 컨트롤러가
 * 살아 있는 방을 건너뛴다 — 재시작 없이 오래 켜 두는 운영에서 영구 소프트락이다
 * (2026-08-08 QA BLOCKER-5).
 *
 * 사람의 30초보다 넉넉하게 잡아, 정상 흐름에서는 에이전트 자신의 타이머가 항상
 * 먼저 터지게 한다. 여기까지 왔다면 그건 버그다 — 그래서 로그를 남긴다.
 */
const AGENT_DECIDE_TIMEOUT_MS = 90_000;

/** 국 사이를 더 붙들 때 다시 물어보는 간격 (`holdBetweenRounds`) */
const HOLD_ROUND_POLL_MS = 200;
/** 그렇게 붙들 수 있는 상한 — 신호가 끊겨도 판이 영원히 국 사이에 멎지 않게 */
const HOLD_ROUND_MAX_MS = 10 * 60_000;

/**
 * **발동 사실 자체가 비밀**인 액션 — 연출을 보유자(와 관전자)에게만 보낸다.
 *
 * ⚠ 2026-08-02 감사: 스텔스 리치가 여기 없어서 `actionFx`가 전원에게 나갔고,
 * 모두의 화면에 "스텔스 리치 — ○○ 증강 발동" 컷인이 떴다. 뷰 쪽은
 * `riichi.hidden`으로 riichiDeclared·더블·선언패 자리를 정확히 가리고 있었는데,
 * 연출이 증강 이름을 그대로 외쳐 **은닉이 선언보다 더 시끄러웠다** —
 * "아무도 내가 리치인 줄 모른다"는 이 증강의 존재 이유가 통째로 무너져 있었다.
 *
 * 완전 무음(FX_SILENT)으로 두지 않는 이유: 보유자에게는 발동이 먹혔다는 확인이
 * 필요하다. 관전자는 어차피 모든 정보를 보는 시점이라 함께 받는다.
 */
const FX_PRIVATE_ACTION_TYPES = new Set([
  "stealth_riichi",
  // 천리안 — detail이 "발동 사실도 밝혀진 목록도 상대에게는 공개되지 않는다"고
  // 약속하는데 컷인이 전원에게 나갔다. 상대는 "지금 내 텐파이가 읽혔다"를 알고
  // 수비를 조였다 — 스텔스 리치에서 고친 것과 같은 누설이다(docs/25 정보 #1).
  //
  // 여기 추가할 후보는 **detail이 발동 사실의 비밀을 약속하는가**로 가른다.
  // 예: spy는 "상대에게는 지정 사실만 공개된다"라 대상이 아니고, 투시·삼세 예지는
  // 결과만 비공개라 대상이 아니다. 증강 보유 자체는 어차피 전원 공개다.
  "tenpai_scan_use",
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

  /** 진행 중인 게임 상태 (통계 집계·관리 도구용. 아직 시작 전이면 null) */
  get gameState(): GameState | null {
    return this.game?.engine.state ?? null;
  }
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
  /**
   * 무효 요청을 기다리고 있는 대기자들 (결정·드래프트·강제수·국 사이 대기).
   *
   * ⚠ 예전에는 컨트롤러 하나에 **영구히 살아 있는 프로미스 하나**를 두고 매 대기마다
   * `Promise.race([일, abortSignal])`를 걸었다. 진 쪽의 핸들러는 절대 떼어지지 않으므로,
   * 그 프로미스에 리액션 핸들러가 **판을 두는 내내 계속 쌓였다** — 한 반장전이면 수천
   * 개다(교과서적인 `Promise.race` 누수). 이제 대기마다 프로미스를 새로 만들고
   * 레이스가 끝나면 곧바로 등록을 해제한다(`raceAbort`).
   */
  private readonly abortWaiters = new Set<(v: { readonly abort: true }) => void>();

  constructor(
    agents: PlayerAgent[],
    config: Partial<HanchanConfig> = {},
    events: HanchanEvents = {},
  ) {
    this.agents = new Map(agents.map((a) => [a.id, a]));
    this.config = { ...DEFAULT_HANCHAN_CONFIG, ...config };
    this.events = events;
  }

  /**
   * 어떤 대기를 무효 신호와 레이스한다. 레이스가 끝나면 **반드시** 대기자를
   * 등록 해제해, 대기 하나마다 리스너가 컨트롤러에 영구히 쌓이지 않게 한다.
   * 이미 무효가 걸린 뒤라면 일을 기다리지 않고 곧바로 중단으로 답한다.
   */
  /**
   * 한 좌석의 결정을 **절대 실패하지 않게** 감싼다 — 예외도, 무응답도 폴백으로 흡수한다.
   *
   * 예전에는 `agent.decide`를 그대로 await 했다. 컨트롤러 루프에는 try/catch가
   * 하나도 없어서, 증강 봇 정책 하나가 던지면 예외가 RoomManager까지 올라가
   * `GAME_CRASHED`와 함께 **방이 삭제**됐다 — 사람 셋의 반장전이 봇 하나의
   * 버그로 사라졌다. 게다가 `Promise.all`이 첫 거부에서 단락돼 나머지 좌석의
   * 진행 중 결정까지 함께 날아갔다(2026-08-08 QA BLOCKER-4).
   *
   * 무응답도 같은 자리에서 막는다. 제한 시간을 스스로 거는 것은 HumanAgent뿐이라,
   * 해결되지 않는 봇 프로미스 하나면 방이 영원히 `playing`으로 남고 좀비 스위퍼는
   * 그 방을 건너뛴다 — 재시작 없이 오래 켜 두는 운영에서 이건 영구 소프트락이다
   * (BLOCKER-5). 여기서 거는 시간은 에이전트 자신의 제한(사람 30초)보다 넉넉한
   * **최후의 안전망**이라, 정상 흐름에서는 절대 먼저 터지지 않는다.
   *
   * 폴백은 능동적 선언을 하지 않는다: 패스 > 마지막 버림 > 첫 옵션.
   * (HumanAgent.safeFallbackOption의 축약판이다. 이 경로는 원래 방이 죽던
   * 자리라, 여기서는 "무엇을 고르는가"보다 "판이 계속된다"가 중요하다.)
   */
  private async safeDecide(
    agent: PlayerAgent,
    prompt: DecisionPrompt,
  ): Promise<ActionOption> {
    const fallback = (): ActionOption => {
      const opts = prompt.options;
      return (
        opts.find((o) => o.type === "pass") ??
        [...opts].reverse().find((o) => o.type === "discard") ??
        opts[0]!
      );
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const limit = this.config.agentDecideTimeoutMs ?? AGENT_DECIDE_TIMEOUT_MS;
      const guard = new Promise<ActionOption>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[hanchan] ${agent.id} decide 무응답 ${limit}ms — 안전 폴백으로 진행`);
          resolve(fallback());
        }, limit);
      });
      const chosen = await Promise.race([agent.decide(prompt), guard]);
      // 목록 밖 응답도 폴백으로 되돌린다 — 그대로 submit하면 FlowController가 던진다.
      return prompt.options.includes(chosen) ? chosen : fallback();
    } catch (err) {
      console.error(`[hanchan] ${agent.id} decide 예외 — 안전 폴백으로 진행`, err);
      return fallback();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * `flow.submit()`을 감싼다 — 상태 전이가 던지면 **안전 폴백으로 한 번 더** 넣는다.
   *
   * **무엇이 문제였나** (감사 2026-08-17 §2-7): `safeDecide`는 에이전트의 예외·무응답·
   * 범위 밖 응답을 완벽히 흡수하는데, 정작 그 결정을 엔진에 넣는 **다음 한 줄**이
   * 맨몸이었다. 여기서 던지면 `run()`의 프로미스가 거부되고 방이 통째로 삭제된다 —
   * 사람 넷의 40분짜리 반장전이 점수·기록·리플레이 없이 사라진다.
   *
   * **왜 폴백 재시도인가**: 이 자리에서 현실적으로 던지는 원인은 "제시할 때는
   * 합법이었는데 넣을 때는 아니게 된 수"다(증강의 `validate`가 두 시점 사이에
   * 상태를 보고 답을 바꾸는 경우). 그 수 하나를 포기하면 판은 멀쩡히 이어진다.
   * 패스는 어떤 상황에서도 규칙이 막지 않으므로 거의 언제나 통한다.
   *
   * **폴백까지 던지면 그대로 올려 보낸다.** 엔진이 어떤 선택도 못 받는 상태라면
   * 그건 이 판이 진짜로 깨진 것이고, 억지로 이어 봐야 다음 국의 점수가 거짓이 된다.
   * 그때도 기록은 남는다 — 크래시 리플레이는 `replays/crashed/`로 보존된다(§2-6).
   */
  private submitGuarded(
    flow: FlowController,
    player: PlayerId,
    option: ActionOption,
    options: readonly ActionOption[],
  ): FlowStatus {
    try {
      return flow.submit(player, option);
    } catch (err) {
      const fallback =
        options.find((o) => o.type === "pass") ??
        [...options].reverse().find((o) => o.type === "discard");
      console.error(
        `[hanchan] ${player} submit(${option.type}) 예외 — ` +
          (fallback === undefined || fallback === option
            ? "되돌릴 수 있는 선택이 없다"
            : `${fallback.type}(으)로 다시 넣는다`),
        err,
      );
      if (fallback === undefined || fallback === option) throw err;
      return flow.submit(player, fallback);
    }
  }

  /**
   * `safeDecide`의 드래프트판 — 예외·무응답·목록 밖 id를 첫 후보로 흡수한다.
   *
   * 유효한 답은 `choices` ∪ `rerolls`다. 슬롯을 새로고침한 좌석은 화면에 없던
   * `choices[i]` 대신 `rerolls[i]`를 답하는데, 어느 슬롯을 갈았는지는 좌석만 안다.
   */
  private async safeDecideDraft(
    agent: PlayerAgent,
    stage: DraftStage,
    choices: AugmentDef[],
    rerolls: readonly AugmentDef[] = [],
  ): Promise<string> {
    const first = choices[0]?.id;
    // 후보가 비어 있으면 고를 것이 없다 — 호출부가 이 좌석을 건너뛰게 한다.
    if (first === undefined) return "";
    const valid = new Set([...choices, ...rerolls].map((d) => d.id));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const limit = this.config.agentDecideTimeoutMs ?? AGENT_DECIDE_TIMEOUT_MS;
      const guard = new Promise<string>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[hanchan] ${agent.id} decideDraft 무응답 ${limit}ms — 첫 후보로 진행`);
          resolve(first);
        }, limit);
      });
      const picked = await Promise.race([
        agent.decideDraft(stage, choices, rerolls),
        guard,
      ]);
      return valid.has(picked) ? picked : first;
    } catch (err) {
      console.error(`[hanchan] ${agent.id} decideDraft 예외 — 첫 후보로 진행`, err);
      return first;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async raceAbort<T>(work: Promise<T>): Promise<T | { readonly abort: true }> {
    if (this.aborted) {
      // 이미 무효다 — 남은 일은 기다리지 않지만, 그 거부가 처리되지 않은 채
      // 프로세스로 새 나가지 않도록 삼킨다(예전 abortSignal 레이스와 동일).
      void work.catch(() => undefined);
      return { abort: true };
    }
    let waiter!: (v: { readonly abort: true }) => void;
    const signal = new Promise<{ readonly abort: true }>((resolve) => {
      waiter = resolve;
    });
    this.abortWaiters.add(waiter);
    try {
      return await Promise.race([work, signal]);
    } finally {
      this.abortWaiters.delete(waiter);
    }
  }

  /**
   * 전원 합의로 게임을 무효 종료한다. 진행 중인 결정 대기를 즉시 깨워
   * 루프가 다음 체크 지점에서 빠져나가게 하고, onGameAborted를 호출한다.
   * 정산·순위·기록은 하지 않는다 (무효).
   */
  requestAbort(): void {
    if (this.aborted) return;
    this.aborted = true;
    // 지금 기다리고 있는 대기자만 깨우면 된다 — 이후의 대기는 raceAbort 입구에서
    // aborted를 보고 곧바로 중단으로 답한다.
    const waiters = [...this.abortWaiters];
    this.abortWaiters.clear();
    for (const w of waiters) w({ abort: true });
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
      [...this.agents.values()].map((a) => [
        a.id,
        {
          nickname: a.nickname,
          isBot: a.isBot,
          ...(a.botArchetype !== undefined ? { archetype: a.botArchetype } : {}),
        },
      ]),
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
      ...(this.config.onEffectError !== undefined
        ? { processor: { onEffectError: this.config.onEffectError } }
        : {}),
      ...(this.config.augmentWeights !== undefined
        ? { augmentWeights: this.config.augmentWeights }
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
    installAugment(game.engine, def, player, {
      yaku: game.yaku,
      catalog: game.augments,
    });
    return null;
  }

  /** 국 루프 — run()과 resume()이 공유한다. 현재 상태에서 종국까지 진행. */
  private async runLoop(game: StandardGame, startRoundIndex: number): Promise<RankingEntry[]> {
    let roundIndex = startRoundIndex;
    // 왜 끝났는지 — 결과 화면이 한 줄로 말해 준다. 루프를 빠져나오는 길목마다 채운다.
    let endReason: GameEndReason = "normal";
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
        if (bankrupt) {
          endReason = "dobi";
          break;
        }
      }

      // 중반 드래프트 진입 체크 (드래프트) — 스테이지당 1회만.
      // 반장전=동3·남1·남3국 진입, 동풍전=동3·동4국 진입. 연장(본장)으로
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
      const reason = this.endReason(game.engine.state, game.engine.rules, playedRound);
      if (reason !== null) {
        endReason = reason;
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
    this.events.onGameOver?.(rankings, endReason);
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
        status = this.submitGuarded(flow, auto.player, auto.options[0]!, auto.options);
        this.flushEvents(game);
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
      const raced = await this.raceAbort(
        Promise.all(
          prompts.map(async (prompt) => {
            const agent = this.agents.get(prompt.player);
            if (agent === undefined) {
              throw new Error(`No agent for player ${prompt.player}`);
            }
            const chosen = await this.safeDecide(agent, prompt);
            decidedRank.set(prompt.player, reactionPriority(chosen.type));
            foldOutranked();
            return { player: prompt.player, option: chosen };
          }),
        ).then((decisions) => ({ decisions })),
      );
      // 무효 요청 — 반환 outcome은 runLoop이 aborted 체크로 즉시 무시한다
      if ("abort" in raced) return "abort";

      // 순서대로 submit (FlowController는 모든 결정이 모이면 resolve)
      for (const { player, option } of raced.decisions) {
        if (flow.isPending(player)) {
          this.trackDiscardOrigin(game, player, option);
          status = this.submitGuarded(
            flow,
            player,
            option,
            prompts.find((p) => p.player === player)?.options ?? [option],
          );
          // 특수 액션(액티브 증강 등) 실행 연출 — 표준 액션이 아닌 것만.
          // 비표준 타입은 턴 프롬프트에서만 나오므로 결정 = 실행이 보장된다.
          if (
            !STANDARD_ACTION_TYPES.has(option.type) &&
            !FX_SILENT_ACTION_TYPES.has(option.type)
          ) {
            const fx: ServerMessage = {
              type: "actionFx",
              player,
              actionType: option.type,
            };
            // 비밀 발동은 보유자·관전자에게만 — 전원 방송하면 증강 이름이 그대로 새 나간다
            if (FX_PRIVATE_ACTION_TYPES.has(option.type)) {
              this.notifyPrivate(player, fx);
            } else {
              this.notifyAll(fx);
            }
          }
        }
      }

      /*
       * **매 결정마다** 확정 이벤트를 흘려보낸다 (감사 §2-10 이어하기).
       *
       * 예전에는 국이 끝나야 흘렀다. 리플레이를 나중에 보는 용도로는 그걸로
       * 충분했지만, **이어하기의 정확도가 곧 이 주기**다 — 국 중간에 서버가
       * 죽으면 그 국이 통째로 되감겼다. 사람들이 20순을 두고 리치까지 건 상태가
       * 배패 직후로 돌아가는 것은 "이어하기"라고 부를 수 없다.
       *
       * 비용은 늘지 않는다. 같은 이벤트를 같은 횟수만큼 쓰는 것이고, 자리만
       * 국 경계에서 결정 경계로 옮겼다. 리플레이 내용도 순서도 그대로다.
       */
      this.flushEvents(game);
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
      catalog: game.augments,
    });

    // 아직 이 스테이지를 마치지 않은 에이전트만 대상. 재개 시 이미 뽑은 사람은 건너뛴다 —
    // 픽은 (시드·스테이지·플레이어)로 결정적·플레이어 독립적이라 건너뛰어도 남은 사람의
    // 선택지에 영향이 없다. 완료 여부는 보유 수가 아니라 스테이지 완료 플래그로 판단한다.
    const pending = [...this.agents.values()].filter(
      (agent) => game.engine.state.augmentData[draftDoneKey(stage, agent.id)] !== true,
    );

    // 화면분 3장 + 슬롯별 새로고침 교체분 3장을 **한 추첨에서** 함께 뽑는다.
    // 교체분을 미리 확정해야 새로고침으로 갈아 낀 카드에도 좌석 간 겹침 금지가 걸린다
    // (DraftController.rollWithRerolls 주석).
    const offered = new Map<string, ReturnType<typeof draft.rollWithRerolls>>();
    for (const agent of pending) {
      offered.set(agent.id, draft.rollWithRerolls(stage, agent.id));
    }

    // 전원에게 '동시에' 오퍼를 보내고 응답을 병렬로 기다린다 (순차 대기 X). runRound과 동일하게
    // abortSignal과 레이스 — 드래프트 대기 중 무효 투표가 와도 30초 타임아웃까지 멈추지 않게 한다.
    const raced = await this.raceAbort(
      Promise.all(
        pending.map(async (agent) => {
          const pool = offered.get(agent.id) ?? draft.rollWithRerolls(stage, agent.id);
          const pickedId = await this.safeDecideDraft(
            agent,
            stage,
            pool.choices,
            pool.rerolls,
          );
          // 새로고침 여부는 **응답 직후에만** 읽을 수 있다 (좌석이 다음 스테이지에 덮어쓴다).
          const rerolled = agent.rerolledDraftSlots?.() ?? [];
          return { player: agent.id, pickedId, rerolled };
        }),
      ).then((picks) => ({ picks })),
    );

    // 무효 요청 — 픽을 하나도 적용하지 않고 즉시 반환 (일부만 적용하면 리플레이가 비결정적).
    if ("abort" in raced) return;

    const answers = new Map(raced.picks.map((p) => [p.player, p] as const));

    // 오퍼를 픽보다 먼저, 고정 에이전트 순서로 로그에 남긴다.
    // AUGMENT_OFFERED는 상태 불변 정보 이벤트라 픽률·등급 통계 전용이다.
    //
    // 기록하는 것은 **화면에 최종적으로 서 있던 3장**이다 — 새로고침으로 갈아 낸 슬롯은
    // 교체 후의 카드로 바뀐다. 6장 전부를 적으면 픽률의 기준값(1/3, tierAdjust의
    // BASELINE_PICK_RATE)이 무너지고, 갈아 내기 전 3장만 적으면 교체분을 고른 픽이
    // 분모 없는 분자가 돼 픽률이 1을 넘는다.
    //
    // 그래서 추첨이 아니라 **응답을 기다린 뒤에** 적는다. 순서는 여전히 (전원 오퍼 →
    // 전원 픽)이고 고정 에이전트 순서이므로 이벤트 로그의 결정성은 그대로다. 무효로
    // 빠지면 픽과 함께 오퍼도 남지 않는다 — 예전에는 오퍼만 남아 통계를 오염시켰다.
    for (const agent of this.agents.values()) {
      const answer = answers.get(agent.id);
      const pool = offered.get(agent.id);
      if (answer === undefined || pool === undefined) continue;
      const shown = [...pool.choices];
      for (const slot of answer.rerolled) {
        const swap = pool.rerolls[slot];
        if (swap !== undefined && slot < shown.length) shown[slot] = swap;
      }
      draft.recordOffer(stage, agent.id, shown);
    }

    // 결정론: 픽은 응답 도착 순서가 아니라 항상 고정된 에이전트 순서로 적용 → 이벤트 로그 동일.
    for (const agent of this.agents.values()) {
      const pickedId = answers.get(agent.id)?.pickedId;
      if (pickedId === undefined) continue; // 이미 완료돼 건너뛴 에이전트
      // 빈 문자열 = 제시할 후보가 없었다. 예전에는 그대로 pick에 넘겨
      // "Augment 가 제시되지 않았다"로 던졌고, 그 예외가 방을 삭제했다.
      if (pickedId === "") continue;
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    });
    const raced = await this.raceAbort(wait);
    // 무효로 먼저 깨어났으면 남은 타이머를 거둔다.
    if (timer !== undefined) clearTimeout(timer);
    return raced !== null;
  }

  /**
   * 국 사이 대기 — 사람 플레이어가 모두 결과 화면을 닫으면(awaitContinue) 즉시
   * 다음 국으로 넘어가고, 아무도 안 닫아도 interRoundDelayMs 상한에서 진행한다.
   * interRoundDelayMs=0이면 즉시 반환(테스트·봇 게임은 지연 없음).
   */
  private async pauseBetweenRounds(): Promise<void> {
    const maxWait = this.config.interRoundDelayMs ?? 0;
    if (maxWait > 0) {
      // 봇·미구현 에이전트는 awaitContinue가 없어 즉시 통과 → 사람만 게이트한다.
      // 무효 요청이 오면 ack를 다 못 받아도 즉시 깨어난다.
      await this.raceAbort(
        Promise.all(
          [...this.agents.values()].map((a) =>
            a.awaitContinue ? a.awaitContinue(maxWait) : Promise.resolve(),
          ),
        ),
      );
    }
    /*
     * 상한이 지나도 **더 붙들라는 신호**가 있으면 기다린다 (`holdBetweenRounds`).
     * 튜토리얼의 마지막 말풍선을 읽는 중에 새 국이 시작되면, 다 끝난 줄 알았던 판이
     * 저 혼자 다시 시작한다. 여기에도 상한을 둬서 신호가 끊겨도 판은 결국 이어진다.
     */
    const held = this.config.holdBetweenRounds;
    if (held === undefined) return;
    for (let waited = 0; waited < HOLD_ROUND_MAX_MS && !this.aborted && held(); waited += HOLD_ROUND_POLL_MS) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const nap = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), HOLD_ROUND_POLL_MS);
      });
      await this.raceAbort(nap);
      if (timer !== undefined) clearTimeout(timer);
    }
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
      // 한 좌석의 뷰 생성·전송이 던져도 나머지 좌석은 뷰를 받아야 한다. 예전에는
      // 여기서 예외가 나면 루프 전체가 죽고 방이 삭제됐다(2026-08-08 QA BLOCKER-4).
      try {
        const viewerId = agent.viewSeatOverride?.() ?? agent.id;
        agent.sendView(buildPlayerView(state, viewerId, rules, viewOpt));
      } catch (err) {
        console.error(`[hanchan] ${agent.id} 뷰 전송 실패 — 이 좌석만 건너뛴다`, err);
      }
    }
    // 관전자 — 전체 공개 시점 (한 번만 만들어 공유). 형식텐파이는 본인 뷰 전용이라 불필요.
    if (this.spectators.size > 0) {
      try {
        const specView = buildPlayerView(state, SPECTATOR_ID, rules, viewOpt);
        for (const s of this.spectators.values()) s.sendView(specView);
      } catch (err) {
        console.error("[hanchan] 관전 뷰 전송 실패 — 대국은 계속한다", err);
      }
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

  /**
   * **그 좌석과 관전자에게만** 보낸다 — 발동 사실이 비밀인 연출용
   * (FX_PRIVATE_ACTION_TYPES). 관전자는 이미 모든 정보를 보는 시점이라 포함한다.
   */
  private notifyPrivate(player: PlayerId, msg: ServerMessage): void {
    this.agents.get(player)?.notify?.(msg);
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
    // 표도라 표시패 — 결과 화면은 `도라 N판`만 적고 표시패는 안 보여 줬다. 그 화면이
    // 판을 완전히 덮으므로 뒤의 도라 줄을 훔쳐볼 수도 없어, 뒷도라 1장으로 설명되지
    // 않는 판수가 나와도 근거를 찾을 데가 없었다.
    const doraIndicators = [...state.round.doraIndicators];
    for (const id of doraIndicators) includeTile(id);
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
      doraIndicators,
      uraDoraIndicators: ura,
      tiles,
      revealedHands,
      // 결과 화면의 "다음 국으로" 버튼이 세는 남은 시간의 근거 — pauseBetweenRounds가
      // 실제로 쓰는 상한 그대로다. 클라이언트에 같은 숫자를 두 벌 두지 않기 위해 싣는다.
      autoContinueMs: this.config.interRoundDelayMs ?? 0,
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
  /**
   * 왜 끝났는가 — `shouldEnd`와 같은 판정을 하되 **사유까지** 돌려준다.
   *
   * 결과 화면이 "대국 종료" 한 줄만 띄우던 시절에는, 남2국에서 갑자기 순위표가 뜨면
   * (도비) 버그로 읽혔다. 특히 아가리야메는 오야가 "한 국 더 있는 줄 알고" 노린 연장이
   * 그대로 종국이 되는 경우가 있어 설명이 없으면 억울하다.
   */
  private endReason(
    state: GameState,
    rules: import("../engine/rules/RuleRegistry.js").RuleRegistry,
    played: { wind: number; roundNumber: number; dealerSeat: number },
  ): GameEndReason | null {
    if (!this.shouldEnd(state, rules)) {
      return this.isAgariYame(state, played) ? "agariYame" : null;
    }
    for (const p of state.players) {
      const threshold = rules.resolve<number>("match.instantWinScore", { playerId: p.id, state });
      if (threshold > 0 && p.score >= threshold) return "instantWin";
    }
    // 방금 친 국이 이미 서든데스 구간이었으면, 그 국이 반환점을 넘겨 끝난 것이다.
    // 정규 구간의 마지막 국에서 끝난 것은 평범한 종국이다.
    return played.wind > this.config.maxWind ? "westEntryDecided" : "normal";
  }

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
      dealerSeat: state.round.dealerSeat,
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
        archetype: agent?.botArchetype ?? null,
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
          // **이어하기가 읽는 진행 설정** (감사 §2-10).
          //
          // 예전에는 이 줄에 `HanchanConfig`가 없었고, 그게 이어하기를 켤 수 없던
          // 이유 중 하나였다 — `resume()`은 `draftSchedules`를 읽어 어느 드래프트가
          // 끝났는지 판단하는데, 그 값을 파일에서 알 길이 없었다.
          //
          // 담는 것은 **판의 규칙**만이다. 시드는 PRNG 상태가 이미 GameState에
          // 들어 있어 필요 없고, 지연 시간·`extraAugments`·`onEffectError`는
          // 판의 규칙이 아니라 그 판을 돌리는 서버의 설정이라 재개하는 쪽이 정한다.
          hanchan: resumableHanchanConfig(this.config),
        },
      }),
    );
  }
}
