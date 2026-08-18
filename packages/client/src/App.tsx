import {
  createContext,
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type {
  AbortVoteMessage,
  ActionOption,
  ActionMessage,
  AdminAugmentTiersMessage,
  AdminUserEntry,
  AugmentCatalogEntry,
  AugmentTierEntry,
  AugmentCategory,
  AugmentStatRaw,
  AugmentTier,
  ClientMessage,
  DecomposeOptions,
  LeaderboardEntry,
  LockedOption,
  DraftOfferMessage,
  FeedbackEntry,
  FeedbackKind,
  FeedbackStatus,
  FuritenReason,
  GameEndReason,
  GameMode,
  JoinedMessage,
  LiveRoomSummary,
  LobbyMessage,
  LobbyPlayerEntry,
  MeldView,
  PlayerInfo,
  PlayerStatsView,
  PlayerView,
  PublicTileView,
  PromptMessage,
  RankingEntry,
  ReplayDataMessage,
  RevealedHand,
  ReplayGameSummary,
  RoundOverMessage,
  SandboxMessage,
  SandboxBotRules,
  ServerInfoMessage,
  ServerMessage,
  StatsEntry,
  StatsMessage,
  TileKind,
  WinInfo,
} from "@majak/core";
import {
  AUGMENT_CATEGORIES,
  EMOTES,
  SPECTATOR_ID,
  doraKindFor,
  kindKey,
  standardKinds,
  winningKinds,
} from "@majak/core";
import { type AugmentDescVariant, type DisplayMode, briefOf, expandParas, forMode, splitLead } from "./augmentBrief.js";
import { projectedDrawSeats, relativeSeatLabel } from "./drawOrder.js";
import { GLOSSARY, GLOSSARY_GROUPS, glossaryTitle, splitTerms } from "./glossary.js";
import type { GlossaryEntry, GlossaryGroup } from "./glossary.js";
import { askConfirm, ConfirmHost } from "./confirm.js";
import { haptics, hapticsSupported, setHapticsEnabled } from "./haptics.js";
import { safeStorage } from "./storage.js";
import { LESSONS, TUTORIAL_KEY, pickLesson, pickUrgent } from "./tutorial.js";
import type { CoachCtx, Lesson } from "./tutorial.js";
import { remainingCounter } from "./waitCounts.js";
import { groupWinHand, shapeGroupLabel } from "./winShapeView.js";
import {
  backlogProdTtl,
  insertByPriority,
  PROD_PRIORITY_RIICHI,
  PROD_TTL_FLOOR_MS,
} from "./productionQueue.js";
import { LOCK_NOTICE_MS, isLockNoticeOnly } from "./lockNotice.js";
import { dueForResend, enqueueSend, isResendable } from "./resendPolicy.js";
import type { QueuedSend } from "./resendPolicy.js";
import type { RebuiltReplay } from "./replayRebuild.js";
import { sfx, setSfxEnabled, setSfxVolume, riichiBgm, bgm, resumeAudio } from "./sfx.js";
import {
  canStepUiZoom,
  getUiScale,
  getUiZoom,
  isLayoutCramped,
  layoutViewport,
  resetUiZoom,
  stepUiZoom,
  subscribeUiScale,
  toLayoutPx,
} from "./uiScale.js";

/**
 * FIXED_SURFACE_NOTE — `position: fixed` 표면은 **반드시 body 포털로 띄운다.**
 *
 * `transform`·`filter`·`backdrop-filter`·`perspective`·`will-change: transform`이
 * 걸린 조상은 그 순간부터 `position: fixed`의 **컨테이닝 블록**이 된다. 그러면
 * `inset: 0`·`top`·`right`가 화면이 아니라 **그 조상의 패딩 박스** 기준으로 풀린다.
 * 이 저장소의 게임 화면은 그런 조상 투성이라 사고가 실제로 났다:
 *
 * - `.own-area`는 `transform: translateX(-50%)`를 갖는다. 그 안에 있던 분열/염색
 *   선택 모달이 화면 아래쪽 손패 영역에 처박히고 아래가 잘렸다(2026-08-06 보고).
 * - `.game-root[data-shake] .table`은 흔들림 동안 `will-change: transform`을 켠다 —
 *   그 안의 고정 표면이 화료·리치·깡 연출마다 판과 같이 흔들렸다.
 * - `.home-nav`는 `backdrop-filter: blur(6px)`다. 홈 설정 패널은 마침 nav 원점이
 *   화면 원점과 겹쳐 티가 안 났을 뿐, 조상이 한 겹만 바뀌어도 튄다.
 *
 * 그래서 고정 표면은 렌더 위치와 무관하게 `createPortal(..., document.body)`로 붙인다.
 * React 이벤트는 여전히 JSX 트리를 따라 버블링하므로 핸들러는 그대로 동작한다.
 */
type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

/** 자동 재연결 백오프 (ms) — 0.5s부터 두 배씩, 최대 10s. 무한 재시도. */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;
/**
 * 연결 생존 확인 주기와 응답 마감.
 *
 * 10초 주기 / 8초 마감 = 죽은 소켓을 **최대 18초** 안에 알아챈다. 예전에는 서버
 * 하트비트가 끊어 줄 때까지 최대 60초였고, 그 사이 내 차례가 5초 유예로 자동
 * 진행됐다(결정 하나가 그냥 지나간다). 더 짧게 잡지 않는 이유: 지하철처럼 잠깐
 * 끊겼다 붙는 회선에서 멀쩡한 연결을 우리가 먼저 끊어 버리면 손해다.
 */
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 8_000;
type Side = "bottom" | "right" | "top" | "left";


/** 서버 WS 주소 — 배포(정적 서빙)면 same-origin, vite dev면 localhost:3001 */
function defaultServerUrl(): string {
  const loc = window.location;
  if (/^517\d$/.test(loc.port)) return "ws://localhost:3001";
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}`;
}
/**
 * 초대 링크 — `https://…/?room=7Q79FM`.
 *
 * 방 코드는 6자 영숫자다(서버 generateCode). 링크에 그대로 실어도 비밀이 새지 않는다:
 * 코드를 아는 사람은 어차피 들어올 수 있고, 그게 코드의 존재 이유다.
 */
const ROOM_PARAM = "room";
const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;

function inviteLinkFor(code: string): string {
  const u = new URL(window.location.href);
  // 검색 파라미터만 갈아 끼운다 — 해시·기타 파라미터를 지우면 다른 링크가 된다.
  u.searchParams.set(ROOM_PARAM, code);
  u.hash = "";
  return u.toString();
}

/**
 * 주소창에 실려 온 방 코드를 꺼낸다. 형식이 아니면 없는 것으로 친다 —
 * 이 값은 남이 만든 링크에서 오므로 **그대로 믿지 않는다**.
 */
function roomCodeFromUrl(): string | null {
  try {
    const raw = new URL(window.location.href).searchParams.get(ROOM_PARAM);
    if (raw === null) return null;
    const code = raw.trim().toUpperCase();
    return ROOM_CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * 주소창에서 방 코드를 지운다 — 들어간 뒤에도 남아 있으면 새로고침할 때마다
 * 그 방으로 끌려가고, 그 방이 이미 사라졌으면 매번 실패 토스트만 본다.
 */
function clearRoomFromUrl(): void {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(ROOM_PARAM)) return;
    u.searchParams.delete(ROOM_PARAM);
    window.history.replaceState(null, "", u.pathname + u.search + u.hash);
  } catch {
    /* history를 못 쓰는 환경이면 그냥 둔다 — 기능에는 지장이 없다 */
  }
}

const SERVER_OVERRIDE_KEY = "majak.serverUrl";
const SESSION_KEY = "majak.sessionToken";
/** 이 세션 토큰을 **발급한 서버 주소**. 다른 서버에는 토큰을 보내지 않는다. */
const SESSION_SERVER_KEY = "majak.sessionServer";
const LAST_ROOM_KEY = "majak.lastRoomCode";
/**
 * 끊긴 체험 대국으로 돌아오는 열쇠 (감사 §2-5).
 *
 * 세션 토큰과 달리 **발급 서버를 함께 저장하지 않는다.** 그 규칙이 있는 이유는
 * "고급 설정에 남이 부른 주소를 넣는 순간 계정이 통째로 넘어간다"였는데, 이
 * 토큰이 여는 것은 봇 셋과의 체험 판 하나뿐이다 — 넘어갈 계정이 없다. 통하지
 * 않는 서버에 보내면 `GUEST_SESSION_GONE`이 오고 그 자리에서 지운다.
 */
const GUEST_TOKEN_KEY = "majak.guestToken";

/**
 * 접속할 서버 주소 — 고급 설정의 수동 지정(있으면)을 쓰고, 없으면 same-origin.
 *
 * 수동 지정은 ws/wss만 허용한다. 저장 시점에도 막지만 여기서 한 번 더 거른다 —
 * localStorage는 확장 프로그램·이전 버전·복사한 스니펫이 쓸 수 있는 자리라,
 * 값이 이미 들어와 있다는 전제로 읽어야 한다.
 */
function serverUrlToUse(): string {
  const raw = safeStorage.getItem(SERVER_OVERRIDE_KEY);
  if (raw === null || raw.trim() === "") return defaultServerUrl();
  try {
    const u = new URL(raw.trim());
    if (u.protocol === "ws:" || u.protocol === "wss:") return u.toString();
  } catch {
    /* 형식 불량 — 기본값으로 */
  }
  safeStorage.removeItem(SERVER_OVERRIDE_KEY);
  return defaultServerUrl();
}

const WIND_CHAR = ["東", "南", "西", "北"];
const WIND_KO = ["동", "남", "서", "북"];

/**
 * 봉인된 패 안내 — **국 스코프**다. 봉인 목록은 `roundViewKey`로 저장돼(discard_lock.ts)
 * 국이 끝나면 채널과 함께 사라진다. 예전 문구가 "이 게임 동안"이라 영구 봉인으로 읽혔고,
 * 그러면 그 패를 안고 손을 다시 짤 이유가 없어져 판단이 통째로 어긋났다.
 */
const SEAL_HINT = "🔒 봉인된 패 — 이번 국 동안 버릴 수 없습니다";

/**
 * 그 모드의 마지막 장(場) — 동풍전은 동장(1), 반장전은 남장(2)까지가 정규 구간이다.
 * 이 값을 넘긴 장은 전부 서든데스(서입·남입)다: `westEntry`가 두 모드 모두 켜져 있어
 * (HanchanController `hanchanConfigForMode`) 정규 구간이 끝나도 1위가 반환점(30000)에
 * 못 미치면 장이 하나 더 붙는다. 로비가 "남4국까지"라고 단언했던 근거가 여기서 깨진다.
 */
function maxWindOf(mode: GameMode): number {
  return mode === "tonpuu" ? 1 : 2;
}

const YAKU_NAMES: Record<string, string> = {
  riichi: "리치",
  double_riichi: "더블리치",
  ippatsu: "일발",
  menzen_tsumo: "멘젠쯔모",
  pinfu: "핑후",
  tanyao: "탕야오",
  iipeiko: "이페코",
  yakuhai_haku: "역패 백",
  yakuhai_hatsu: "역패 발",
  yakuhai_chun: "역패 중",
  yakuhai_seat: "자풍패",
  yakuhai_prevalent: "장풍패",
  haitei: "해저로월",
  houtei: "하저로어",
  rinshan: "영상개화",
  chankan: "창깡",
  chiitoitsu: "치또이쯔",
  toitoi: "또이또이",
  sanankou: "산안커",
  sankantsu: "산깡쯔",
  sanshoku: "삼색동순",
  sanshoku_doukou: "삼색동각",
  shousangen: "소삼원",
  honroutou: "혼노두",
  chanta: "찬타",
  ittsuu: "일기통관",
  ryanpeiko: "량페코",
  junchan: "준찬타",
  honitsu: "혼일색",
  chinitsu: "청일색",
  kokushi: "국사무쌍",
  kokushi_13: "국사무쌍 13면 대기",
  suuankou: "스안커",
  suuankou_tanki: "스안커 단기",
  daisangen: "대삼원",
  shousuushii: "소사희",
  daisuushii: "대사희",
  tsuuiisou: "자일색",
  ryuuiisou: "녹일색",
  chinroutou: "청노두",
  chuuren: "구련보등",
  chuuren_junsei: "순정구련보등",
  suukantsu: "스깡쯔",
  tenhou: "천화",
  chihou: "지화",
  tanyao_break: "탕야오 해방",
  kokushi_open: "우는 국사무쌍",
  hidden_blade: "숨은 칼날",
};

const LIMIT_NAMES: Record<string, string> = {
  mangan: "만관",
  haneman: "하네만",
  baiman: "배만",
  sanbaiman: "삼배만",
  kazoe_yakuman: "헤아림 역만",
  yakuman: "역만",
};

/**
 * "그 방에 속해 있어야만 의미가 있는" 메시지 — 방을 뜬 뒤에 도착하면 버린다.
 *
 * 나가기 직후에도 이미 날아오던 뷰·연출이 몇 개 더 도착한다. 받아 버리면 홈 화면인
 * 채로 `view`가 되살아나 대국 BGM과 컷인 효과음만 흐른다(무엇이 소리를 내는지 화면
 * 어디에도 없다). `gameAborted`·`kicked`·`error` 같은 **정리 신호**는 여기 넣지
 * 않는다 — 나간 뒤에 오는 것이 정상이고, 그게 마지막 정리를 해 준다.
 */
const GAME_STREAM_MESSAGES: ReadonlySet<ServerMessage["type"]> = new Set([
  "view",
  "prompt",
  "promptCancel",
  "draftOffer",
  "draftAutoPicked",
  "draftRerolled",
  "roundOver",
  "gameOver",
  "abortVote",
  "actionFx",
  "lobby",
  "sandbox",
  "sandboxConfig",
]);

/** 도중유국 사유 (RoundSettledPayload.abortReason) — 결과 화면 부제 */
const ABORT_REASONS: Record<string, string> = {
  kyushuKyuhai: "구종구패 — 배패에 요구패·자패가 9종 이상이라 국을 물렸다",
  fourKan: "사깡산료 — 서로 다른 두 사람 이상이 깡을 넷 만들었다",
  fourWind: "사풍연타 — 첫 순에 네 명이 같은 풍패를 버렸다",
  fourRiichi: "사가리치 — 네 명이 모두 리치를 걸었다",
  tripleRon: "삼가화 — 한 버림패에 세 명이 동시에 론했다",
};

/**
 * 역만 배수 이름 — 2·3배는 마작에서 통용되는 **더블/트리플 역만**으로 부르고,
 * 그 위(4배 이상)는 통칭이 없으므로 숫자로 센다.
 * (대삼원+자일색처럼 역만 역이 겹치거나, 대사희·국사 13면처럼 역 하나가 2배여도
 *  yakumanCount가 그대로 배수가 된다.)
 */
function yakumanName(count: number): string {
  if (count <= 1) return "역만";
  if (count === 2) return "더블 역만";
  if (count === 3) return "트리플 역만";
  return `${count}배 역만`;
}

/** 결과창 역 한 줄의 배수 표기 — 역만 역의 판수는 13×배수로 등록돼 있다 */
function yakumanHanLabel(han: number): string {
  return yakumanName(Math.max(1, Math.round(han / 13)));
}

/**
 * 액션 버튼에 쓸 이름.
 *
 * **왜 함수로 뺐나** (감사 2026-08-17 §5-18): 예전에는 부르는 자리에서
 * `ACTION_LABEL[t] ?? catalog[t]?.name ?? t` 로 폴백을 이어 붙였다. 등록을 빠뜨리면
 * `swap3_give` 같은 **내부 id가 조용히 버튼에 찍혔고**, 타입도 테스트도 그걸 막지
 * 않았다. 실제 사용자에게는 "이게 무슨 버튼이지"로 보인다.
 *
 * 이제 폴백이 한 곳이라 개발 중에는 콘솔로 시끄럽게 알린다. 운영에서는 여전히
 * id 라도 보여 준다 — 버튼이 사라지는 것보다는 낫다.
 */
function actionLabel(type: string, catalog: Record<string, AugmentCatalogEntry>): string {
  const known = ACTION_LABEL[type] ?? catalog[type]?.name;
  if (known !== undefined) return known;
  if (import.meta.env.DEV) {
    console.warn(`[ui] 액션 "${type}" 의 한글 이름이 없습니다 — ACTION_LABEL 에 추가하세요.`);
  }
  return type;
}

const ACTION_LABEL: Record<string, string> = {
  win: "화료",
  pon: "퐁",
  chi: "치",
  bluff_pon: "허장성세 — 퐁",
  silent_pon: "묵계 — 멘젠 퐁",
  // 우는 국사무쌍의 특수 후로 — 버려진 요구패 1장 + 손패 2장(서로 다른 요구패 3종)
  kokushi_pon: "우는 국사무쌍 — 요구패 퐁",
  minkan: "깡",
  ankan: "안깡",
  shouminkan: "가깡",
  kyushuKyuhai: "구종구패",
  pass: "패스",
  recall: "회수",
  peek_waits: "선언 간파",
  swap3: "등가교환 — 대상 지정",
  swap3_give: "등가교환 — 넘길 3장",
  swap3_take: "등가교환 — 가져올 3장",
  hand_swap: "손패 강탈",
  red_touch: "붉은 손길",
  future_exchange: "미래 보기",
  bottom_deal: "밑장빼기",
  claim_dealer: "오야 찬탈",
  seat_swap: "자리 바꿈",
  cancel_riichi: "리치 취소",
  bloom_pick: "영상패 고르기",
  no_retreat_riichi: "불퇴 리치",
  declare_big_hand: "큰손 선언",
  // 2026-07-18 신규 배치
  ura_peek_reveal: "이면투시",
  take_back: "무르기",
  tile_dye: "염색",
  alchemy: "연금술",
  scapegoat_mark: "덤터기 지목",
  blood_contract_declare: "핏빛 계약",
  all_in_riichi: "올인 리치",
  pond_snatch: "날치기",
  grave_rob: "무덤 도굴",
  spy_mark: "스파이 지정",
  time_stop_use: "시간 정지",
  open_riichi: "오픈 리치",
  mono_world: "단색 세계",
  parasite_attach: "기생",
  seal_hands: "봉인",
  invincible_guard: "천하무적",
  // 2026-07-22 (52차) 신규 12종 — docs/16 §1c
  silent_take: "정적의 손",
  foresight_reveal: "예지 — 발동(공개)",
  foresight_order: "예지 — 패산 재배열",
  rank_gate_mark: "격 — 지목",
  dw_swap: "왕패의 주인",
  stealth_riichi: "스텔스 리치",
  jackpot_roll: "일확천금 — 룰렛",
  karma_burn: "카르마 — 업보 청산",
  rinshan_pull: "영상패 끌어오기",
  declare_fog: "안개 덮인 바닥 — 선언",
  genesis_flip: "개벽 — 발동",
  table_flip_do: "밥상 뒤엎기 — 발동",
  future_arm: "미래를 보는 자 — 발동",
  peek_forge: "대기패 위조",
  ura_swap: "뒷도라 바꿔치기",
  // 2026-07-25 (5차 §2b) 신규 — 액티브 선언형
  even_world_flip: "짝수의 세계 — 발동",
  declare_brief_fog: "박무 — 선언",
  giant_god: "마작의 거신병 — 각성",
  call_seal_use: "함구령 — 선언",
  conjure_tsumo: "소환 — 패 지목",
  // 배치 2
  tenpai_scan_use: "천리안 — 텐파이 감지",
  danger_sense_use: "지뢰 탐지",
  triple_peek_use: "삼세 예지",
  dissolve_meld: "파혼 — 후로 해체",
  disarm_lock: "무장해제 — 증강 봉인",
  xray_reveal: "투시 — 발동",
  push_brand: "등 떠밀기 — 낙인",
  reload_use: "재장전 — 복구",
  honor_recall: "귀환 — 자패 회수",
  split_tile: "분열 — 패 쪼개기",
  frame_discard: "누명 — 심기",
  dragons_will: "삼원의 의지 — 발동",
  flip_riichi: "손바닥 뒤집기 — 손 풀기",
  north_pull: "북풍 상인 — 북빼기",
  // 2026-08-04 (6차) 신규
  dora_recall: "도라의 잔상 — 되살리기",
  soul_strike: "영혼의 일격 — 선언",
  picky_unify: "편식 — 단색화",
  // 2026-08-07 (7차) 신규
  joker_call: "조커 — 백을 만능패로",
};

/** 액티브 액션 → 그 액션을 만들어내는 증강 id (메뉴에서 어느 증강인지 표시용). */
const ACTION_AUGMENT: Record<string, string> = {
  recall: "discard_recall",
  peek_waits: "peek_riichi_waits",
  swap3: "hand_swap3",
  swap3_give: "hand_swap3",
  swap3_take: "hand_swap3",
  hand_swap: "full_hand_swap",
  red_touch: "red_five_touch",
  future_exchange: "future_sight",
  bottom_deal: "bottom_deal",
  claim_dealer: "pseudo_dealer",
  seat_swap: "seat_swap",
  cancel_riichi: "last_stand",
  bloom_pick: "cliff_bloom",
  no_retreat_riichi: "no_retreat",
  declare_big_hand: "big_hand",
  ura_peek_reveal: "ura_peek",
  take_back: "take_back",
  tile_dye: "tile_dyeing",
  alchemy: "alchemist",
  scapegoat_mark: "scapegoat",
  blood_contract_declare: "blood_contract",
  all_in_riichi: "all_or_nothing",
  pond_snatch: "pond_snatch",
  grave_rob: "grave_rob",
  spy_mark: "spy",
  open_riichi: "open_riichi_reveal",
  time_stop_use: "time_stop",
  mono_world: "suit_unify",
  parasite_attach: "parasite",
  seal_hands: "discard_lock",
  invincible_guard: "invincible",
  // 2026-07-22 (52차) 신규
  silent_take: "silent_swap",
  foresight_reveal: "foresight",
  foresight_order: "foresight",
  rank_gate_mark: "rank_gate",
  dw_swap: "dead_wall_master",
  stealth_riichi: "stealth_riichi",
  jackpot_roll: "jackpot",
  karma_burn: "karma",
  rinshan_pull: "rinshan_preview",
  declare_fog: "hidden_river",
  genesis_flip: "genesis",
  table_flip_do: "table_flip",
  future_arm: "future_sight",
  peek_forge: "peek_riichi_waits",
  ura_swap: "ura_peek",
  // 2026-07-25 (5차 §2b) 신규
  even_world_flip: "even_world",
  declare_brief_fog: "brief_fog",
  giant_god: "giant_god",
  call_seal_use: "call_seal",
  conjure_tsumo: "conjure_draw",
  tenpai_scan_use: "tenpai_scan",
  danger_sense_use: "danger_sense",
  triple_peek_use: "triple_peek",
  dissolve_meld: "meld_dissolve",
  disarm_lock: "disarm",
  silent_pon: "silent_pact",
  bluff_pon: "bluff_pretense",
  kokushi_pon: "open_kokushi",
  xray_reveal: "xray_hand",
  push_brand: "push_riichi",
  reload_use: "reload",
  honor_recall: "honor_return",
  split_tile: "tile_split",
  frame_discard: "frame_up",
  dragons_will: "three_dragons_will",
  flip_riichi: "palm_flip",
  north_pull: "north_trader",
  // 2026-08-04 (6차) 신규
  dora_recall: "dora_afterimage",
  soul_strike: "soul_strike",
  picky_unify: "picky_eater",
  joker_call: "joker",
};

/**
 * 액티브 액션 타입 → 화면에 쓸 이름. 카탈로그(서버가 보내는 증강 정의)의 증강 이름을
 * 우선 쓰고, 매칭이 없으면 액션 라벨로 떨어진다.
 */
function augActionName(
  catalog: Record<string, AugmentCatalogEntry>,
  type: string,
): string {
  const augId = ACTION_AUGMENT[type];
  return (
    (augId !== undefined ? catalog[augId]?.name : undefined) ?? ACTION_LABEL[type] ?? type
  );
}

/** 플레이어가 버튼으로 발동하는 액티브 증강 액션 타입 (타일 클릭 액션은 제외). */
const AUGMENT_ACTION_TYPES = new Set([
  "recall",
  "peek_waits",
  "swap3",
  "swap3_give",
  "swap3_take",
  "hand_swap",
  "red_touch",
  "future_exchange",
  "bottom_deal",
  "claim_dealer",
  "seat_swap",
  "cancel_riichi",
  "bloom_pick",
  "no_retreat_riichi",
  "declare_big_hand",
  "ura_peek_reveal",
  "take_back",
  "tile_dye",
  "alchemy",
  "scapegoat_mark",
  "blood_contract_declare",
  "all_in_riichi",
  "pond_snatch",
  "grave_rob",
  "spy_mark",
  "open_riichi",
  "time_stop_use",
  "mono_world",
  "parasite_attach",
  "seal_hands",
  "invincible_guard",
  // 2026-07-22 (52차) 신규
  "silent_take",
  "foresight_reveal",
  "foresight_order",
  "rank_gate_mark",
  "dw_swap",
  "stealth_riichi",
  "jackpot_roll",
  "karma_burn",
  "rinshan_pull",
  "peek_forge",
  "ura_swap",
  "declare_fog",
  "genesis_flip",
  "table_flip_do",
  "future_arm",
  // 2026-07-25 (5차 §2b) 신규 — 선언형 액티브
  "even_world_flip",
  "declare_brief_fog",
  "giant_god",
  "call_seal_use",
  "conjure_tsumo",
  "tenpai_scan_use",
  "danger_sense_use",
  "triple_peek_use",
  "dissolve_meld",
  "disarm_lock",
  // 투시 — ACTION_LABEL·ACTION_AUGMENT에는 처음부터 있었는데 이 두 집합에만 빠져 있었다.
  // 그래서 버튼이 액티브 메뉴가 아니라 일반 액션 바로 새어 나갔다(docs/25 §397).
  "xray_reveal",
  "push_brand",
  "reload_use",
  "honor_recall",
  "split_tile",
  "frame_discard",
  "dragons_will",
  "flip_riichi",
  "north_pull",
  // 2026-08-04 (6차) 신규
  "dora_recall",
  "soul_strike",
  "picky_unify",
  // 2026-08-07 (7차) 신규
  "joker_call",
]);

/**
 * 등가교환 결과 통보 채널 — 당사자 둘에게만 실리는 `{with, gave, got, holder}`.
 * (AUG_EVENTS 표를 안 쓴다: 표에 넣으면 AUG_EVENT_AUG_IDS에 hand_swap3가 들어가
 *  **대상 지정 단계의 공개 발동 컷인**까지 함께 사라진다.)
 */
const SWAP3_NOTICE_KEY = "hand_swap3:swapped";

/**
 * 버튼으로 발동하는 액티브 증강 id — 보유 시 액티브 증강 버튼을 노출.
 * (free_riichi_discard는 타일 클릭으로 발동하므로 제외)
 */
const ACTIVE_AUGMENT_IDS = new Set([
  "discard_recall",
  "hand_swap3",
  "future_sight",
  "full_hand_swap",
  "red_five_touch",
  "bottom_deal",
  "peek_riichi_waits",
  "pseudo_dealer",
  "seat_swap",
  "last_stand",
  "cliff_bloom",
  "no_retreat",
  "big_hand",
  "ura_peek",
  "take_back",
  "tile_dyeing",
  "alchemist",
  "scapegoat",
  "blood_contract",
  "all_or_nothing",
  "pond_snatch",
  "grave_rob",
  "spy",
  "open_riichi_reveal",
  "time_stop",
  "suit_unify",
  "parasite",
  "discard_lock",
  "invincible",
  // 2026-07-22 (52차) 신규 — 액티브 발동이 있는 것만 (나머지 7종은 패시브·리액션형)
  "silent_swap",
  "foresight",
  "rank_gate",
  "dead_wall_master",
  "stealth_riichi",
  // ⑤B·⑤C 버프로 액티브가 된 것들
  "jackpot",
  "karma",
  "rinshan_preview",
  // 안개 덮인 바닥 — 52차 후속에 상시 패시브에서 선언형 액티브가 됐다
  "hidden_river",
  "genesis",
  "table_flip",
  // 2026-07-25 (5차 §2b) 신규 — 선언형 액티브
  "even_world",
  "brief_fog",
  "giant_god",
  "call_seal",
  "conjure_draw",
  "tenpai_scan",
  "danger_sense",
  "triple_peek",
  "meld_dissolve",
  "disarm",
  "xray_hand",
  "push_riichi",
  "reload",
  "honor_return",
  "tile_split",
  "frame_up",
  "three_dragons_will",
  "palm_flip",
  "north_trader",
  // 2026-08-04 (6차) 신규 — 액티브 발동이 있는 것만 (나머지 5종은 패시브·자동 발동)
  "dora_afterimage",
  "soul_strike",
  "picky_eater",
  // 2026-08-07 (7차) 신규
  "joker",
]);

/** 이 증강이 '액티브 증강' 버튼으로 직접 발동되는지 (설명카드·툴팁 뱃지용). */
function isActiveAugment(id: string): boolean {
  return ACTIVE_AUGMENT_IDS.has(id);
}

/**
 * **퀘스트형 증강** — 효과가 그냥 열려 있지 않고, 국(또는 게임) 안에서 조건을 직접
 * 쌓아 달성해야 비로소 열리는 것들. 값은 그 조건을 한 줄로 적은 목표문이다.
 *
 * "액티브"(⚡)와 배타가 아니다 — 편식은 퀘스트를 채운 **뒤에** 액티브 버튼이 열리므로
 * 두 뱃지가 함께 붙는다. 두 뱃지가 말하는 것이 서로 다르기 때문이다:
 * ⚡는 "누가 발동하는가", 🎯는 "언제부터 발동할 수 있는가".
 *
 * 기준: 발동(또는 자동 발동)에 **보유자가 쌓아 올리는 진행도**가 필요한가.
 * 단순히 "자기 턴에" · "첫 순에" 같은 타이밍 제약만 있는 것은 퀘스트가 아니다.
 */
const QUEST_GOAL: Record<string, string> = {
  picky_eater: "한 무늬(+자패)만 12장 버리기",
  karma: "잃은 점수를 업보 8,000까지 쌓기",
  cliff_bloom: "한 국에 깡 두 번 (만개)",
};

/**
 * 액티브 액션을 '클릭'으로 발동할 때 무엇을 클릭하는지(대상 종류).
 * - "hand"      : 내 손패의 패를 클릭 (payload에 tileId)
 * - "opp"       : 상대 플레이어를 클릭 (payload에 target)
 * - "own-river" : 내 바닥(버림패)의 패를 클릭 (payload에 recallTileId 또는 kind)
 * - "opp-river" : 상대 바닥의 (가장 최근) 버림패를 클릭 (payload에 snatchId/fromPlayer)
 * - "swap3"     : 상대를 클릭한 뒤 내 손패 3장을 클릭 (등가교환 전용)
 */
type ArmMode = "hand" | "opp" | "own-river" | "opp-river" | "any-river" | "swap3";

/**
 * 액티브 액션 타입 → 클릭 발동 방식. 여기 등록된 액션은 버튼이 아니라
 * 실제 손패·상대·바닥패를 클릭해서 대상을 고르고 발동한다(선언형은 등록하지 않아 버튼 유지).
 */
const ARM_MODE: Record<string, ArmMode> = {
  // 내 손패 클릭 — 어떤 패를 바꿀지 고른다
  tile_dye: "hand",
  alchemy: "hand",
  // 스파이 — 손패를 클릭해 그 종류를 비밀 지정한다
  spy_mark: "hand",
  // 올인 리치(모 아니면 도) — 리치처럼, 리치 가능한(텐파이 유지) 손패만 무장 대상
  all_in_riichi: "hand",
  // 오픈 리치 — 리치처럼, 리치 걸 손패(버릴 패)를 직접 클릭해 선언한다
  open_riichi: "hand",
  // 상대 클릭 — 대상 상대를 고른다
  hand_swap: "opp",
  scapegoat_mark: "opp",
  push_brand: "opp",
  parasite_attach: "opp",
  seat_swap: "opp",
  peek_waits: "opp",
  // 내 바닥(버림패) 클릭 — 회수할/지뢰로 지정할 버림패를 고른다
  recall: "own-river",
  // 상대 바닥 클릭 — 주울 상대의 최근 버림패를 고른다
  pond_snatch: "opp-river",
  // 상대 바닥 클릭 — 무덤에 잠든 과거의 버림패를 파낸다(바닥 전체가 대상)
  grave_rob: "opp-river",
  // 상대 클릭 → 내 손패 3장 클릭 (등가교환)
  swap3: "opp",
  // 2026-07-22 (52차) — 격: 상대를 지목한다 / 스텔스 리치: 리치처럼 버릴 패를 직접 클릭
  rank_gate_mark: "opp",
  stealth_riichi: "hand",
  // 물러설 수 없는 선언 — 스텔스 리치와 같은 꼴의 버튼형 액티브 리치(2026-08-15)
  no_retreat_riichi: "hand",
  // 선언 간파 위조 — 새 탭이 아니라 **실제 내 손패**를 클릭해 바꿀 패를 고른다.
  // 한 패에 후보(간파한 대기 종류)가 여럿이면 armSub 모달이 전→후를 보여 준다.
  peek_forge: "hand",
  // 분열 — 쪼갤 수패를 클릭 (한 패에 분할 후보가 여럿이면 armSub 모달)
  split_tile: "hand",
  // 누명 — 심을 패를 클릭 (대상 선택은 armSub 모달)
  frame_discard: "hand",
  // 소환 — 내 손패를 클릭해 다음 쯔모로 불러올 패(종류)를 지목한다
  conjure_tsumo: "hand",
  // 손바닥 뒤집기 — 리치 중, 쯔모기리 대신 버릴 손패를 클릭한다 (2026-08-15)
  flip_riichi: "hand",
  // 정적의 손 — 새 탭 없이 실제 바닥패(네 사람 전부)를 직접 클릭해 주울 패를 고른다
  silent_take: "any-river",
  // 영혼의 일격 — 리치처럼, 리치 걸 손패(버릴 패)를 직접 클릭해 선언한다
  soul_strike: "hand",
};

/** 이 액션이 클릭(무장) 방식으로 발동되는지 — 아니면 버튼으로 발동. */
function armModeOf(type: string): ArmMode | undefined {
  return ARM_MODE[type];
}

/**
 * **상대의 손패를 조작하는** 액션 — 리치를 선언한 상대는 대상이 될 수 없다.
 * 서버가 후보에서 빼므로 클릭은 애초에 막혀 있고, 화면은 그 빈자리에 이유만 적는다
 * (아무 표시가 없으면 "왜 안 눌리지?"로 보인다). 서버 쪽 같은 표는
 * `HumanAgent.HAND_MANIP_ACTION_TYPES`.
 */
const HAND_MANIP_ACTIONS = new Set(["hand_swap", "swap3", "seat_swap"]);

/** 무장 안내 문구 — 무엇을 클릭해야 하는지. */
/**
 * 무장한 뒤 **패를 버리면서** 발동하는 리치 계열 액션.
 *
 * 이 액션들은 결국 "이 패를 버리며 리치를 건다"라서, 평소 리치와 손놀림이 같아야 한다 —
 * 액티브 버튼 → 손패를 바닥으로 드래그. 클릭 발동도 그대로 남긴다(둘 다 된다).
 * (2026-08-01 사용자 요청: 오픈 리치·스텔스 리치를 드래그로도 걸 수 있게)
 * (2026-08-08 사용자 요청: 영혼의 일격도 리치 선언이라 같은 손놀림으로 — 여기 빠져 있었다)
 *
 * (2026-08-16 사용자 요청: 손바닥 뒤집기도 결국 "이 패를 버린다"라 같은 손놀림이어야 한다.
 *  리치 중에는 손패가 통째로 어두워져 있어서, 버튼을 눌러도 정말 바꿀 수 있는 건지
 *  손이 멎었다 — 드래그를 열고 액션 바에 전용 버튼을 세운다.)
 *
 * 이 집합은 곧 **증강 리치 목록**이기도 하다 — 액션 바가 평소 [리치] 버튼 옆에
 * 이 액션들을 나란히 띄운다(`ActionBar`). 예전엔 "✦ 액티브 증강" 메뉴 안에만 있어서
 * 쓸 수 있는 줄 모르고 그냥 리치를 걸어 버렸다(2026-08-08 사용자 보고).
 * 손바닥 뒤집기는 리치 중에만 뜨므로 [리치] 버튼과 자리를 다투지 않는다.
 */
const DRAG_DISCARD_ARM_TYPES = new Set([
  "open_riichi",
  "stealth_riichi",
  "all_in_riichi",
  "soul_strike",
  "no_retreat_riichi",
  // 손바닥 뒤집기 — 리치를 **거는** 것은 아니지만 "무장 → 버릴 패를 끌어 놓기"가 같다
  "flip_riichi",
]);

/**
 * 위 액션들을 내는 증강 id — 액션 바가 전담하므로 "✦ 액티브 증강" 쪽에서는
 * 목록·개수·안내에서 전부 뺀다(같은 증강이 두 군데서 뜨지 않게).
 */
const RIICHI_AUG_IDS = new Set(
  [...DRAG_DISCARD_ARM_TYPES]
    .map((t) => ACTION_AUGMENT[t])
    .filter((id): id is string => id !== undefined),
);

function armPromptText(mode: ArmMode | null, type?: string | null): string {
  if (type !== null && type !== undefined && DRAG_DISCARD_ARM_TYPES.has(type)) {
    return "버릴 패를 바닥으로 끌어 놓거나 클릭하세요";
  }
  switch (mode) {
    case "opp":
      return "대상 상대를 클릭하세요";
    case "own-river":
      return "내 버림패(바닥)를 클릭하세요";
    case "opp-river":
      return "주울 상대의 버림패를 클릭하세요";
    case "any-river":
      return "주울 버림패를 아무 바닥에서나 클릭하세요";
    case "hand":
    default:
      return "발동할 손패를 클릭하세요";
  }
}

/** 하위 호환용 — 내 손패 클릭으로 발동하는 액션들. */
const TILE_SELECT_ACTIONS = new Set(
  Object.keys(ARM_MODE).filter((t) => ARM_MODE[t] === "hand"),
);

/**
 * 액티브 증강 버튼을 눌렀을 때 드롭다운 후보 버튼이 아니라 **전용 모달**을 여는 액션.
 * docs/10 §2a-1 — "패를 고르는 증강은 전부 새 탭(모달)". 후보를 텍스트 버튼으로
 * 늘어놓지 않고 실제 패가 어떻게 되는지 눈으로 보고 고르게 한다.
 *
 * 여기 등록하지 않아도 되는 것: 무장(ARM_MODE)형은 실물 패·상대를 직접 클릭하므로
 * 이미 규약을 만족하고, `{}` payload 단일 선언형은 고를 것 자체가 없다.
 * 패가 아닌 것을 고르는 선언형(핏빛 계약의 역 지정)도 규약상 버튼이 맞다.
 */
/**
 * 정보 스캔 채널(천리안·지뢰 탐지)의 값을 읽는다 — `{ [field]: string[], turn }`.
 *
 * 이 결과들은 **갱신되지 않는 스냅샷**이라 국이 끝날 때까지 그대로 떠 있다. 몇 순
 * 기준인지 밝히지 않으면 시간이 지날수록 조용히 틀린 정보가 된다(docs/25 정보 계열).
 * 구 리플레이는 배열만 실어 보내므로 그 형태도 그대로 읽는다(순은 `null`).
 */
function readScanSnapshot(
  value: unknown,
  field: string,
): { items: string[]; turn: number | null } {
  if (Array.isArray(value)) return { items: value as string[], turn: null };
  if (typeof value === "object" && value !== null) {
    const rec = value as Record<string, unknown>;
    const raw = rec[field];
    return {
      items: Array.isArray(raw) ? (raw as string[]) : [],
      turn: typeof rec["turn"] === "number" ? rec["turn"] : null,
    };
  }
  return { items: [], turn: null };
}

/*
 * 예지(foresight) 모달의 자리 이름은 고정 배열이 아니라 `drawOrder.ts`가
 * 렌더 시점의 `turnSeat`·`direction`에서 계산한다 — 역행(turn.direction = −1)이나
 * 차례가 건너뛴 뒤에도 라벨이 실제 쯔모 순서와 어긋나지 않는다.
 */

const MODAL_PICK_TYPES = new Set<string>([
  "mono_world",
  // 2026-07-22 (52차) 신규 — 전부 "무엇을 고르는지 패로 보여야 하는" 액션이다
  // (정적의 손 silent_take는 2026-07-25 실제 바닥패 클릭[any-river]으로 전환 — 여기서 제외)
  // (예지 foresight_order는 2026-07-25 발동[reveal]→드래그 재배열 전용 흐름으로 전환 — 여기서 제외)
  "dw_swap", // 왕패 14장 ↔ 내 손패 1장
  "red_touch", // 적도라로 만들 숫자 지정 (1~9)
  "ura_swap", // 뒷도라 표시패와 맞바꿀 왕패 자리
  "picky_unify", // 편식 — 단색 세계와 같은 무늬 선택 모달
]);

// ─────────────────────────── 증강 카테고리 (분류·아이콘) ───────────────────────────

/**
 * 증강 계열은 **증강 정의(AugmentDef.category)가 단일 진실**이다 — 서버가 접속 직후
 * 보내는 정적 카탈로그로 넘어온다. 예전엔 여기에 id→계열 명시 맵 + id 관례 휴리스틱을
 * 두었는데, 신규 증강이 추가될 때마다 조용히 `etc`로 새는 문제가 있어 폐기했다
 * (docs/19 §4.1). 새 증강은 자기 파일에 category를 선언하면 여기까지 자동으로 온다.
 *
 * 아이콘·라벨은 표시 전용이라 클라이언트에 남는다(추후 이미지로 교체 예정).
 */
interface CategoryMeta {
  label: string;
  /** 임시 아이콘 (추후 이미지로 교체) */
  icon: string;
}

const CATEGORY_META: Record<AugmentCategory, CategoryMeta> = {
  scoring: { label: "점수", icon: "💰" },
  info: { label: "정보", icon: "👁" },
  hand: { label: "손패 조작", icon: "🔧" },
  shape: { label: "화료형", icon: "🧩" },
  call: { label: "후로", icon: "🀄" },
  riichi: { label: "리치", icon: "⚡" },
  defense: { label: "수비", icon: "🛡" },
  disrupt: { label: "교란", icon: "🌀" },
  etc: { label: "기타", icon: "✦" },
};

/**
 * id → 계열. 카탈로그 수신 시 채워지는 모듈 전역 룩업이다 — 계열은 서버당 고정값이라
 * 렌더 트리 어디서든(컷인·pill·드래프트 카드) props 없이 읽을 수 있어야 해서 전역에 둔다.
 * 카탈로그 도착 전(또는 알 수 없는 id)은 `etc`.
 */
const CATEGORY_BY_ID: Record<string, AugmentCategory> = {};
/** id → 이름. 계열과 같은 이유로 전역 — 카탈로그를 못 받은 곳에서도 사람 말로 쓴다. */
const NAME_BY_ID: Record<string, string> = {};

function rememberCategories(entries: readonly AugmentCatalogEntry[]): void {
  for (const e of entries) {
    CATEGORY_BY_ID[e.id] = e.category;
    NAME_BY_ID[e.id] = e.name;
  }
}

function augmentCategory(id: string): AugmentCategory {
  return CATEGORY_BY_ID[id] ?? "etc";
}

/** 증강 id → 표시 이름 (카탈로그 도착 전이면 id 그대로) */
function augmentDisplayName(id: string): string {
  return NAME_BY_ID[id] ?? id;
}

/** 증강 카테고리 아이콘 (임시 이모지). */
function AugCatIcon({ id }: { id: string }): JSX.Element {
  const cat = augmentCategory(id);
  const meta = CATEGORY_META[cat];
  return (
    <span className={`aug-cat aug-cat-${cat}`} title={`${meta.label} 계열`} aria-hidden="true">
      {meta.icon}
    </span>
  );
}

/** 직접 발동(액티브 버튼) 증강임을 알리는 뱃지 — 드래프트 카드용. */
function ActiveBadge(): JSX.Element {
  return (
    <span className="aug-active-badge" title="직접 발동하는 액티브 증강">
      ⚡ 액티브
    </span>
  );
}

/** 조건을 달성해야 열리는 퀘스트형 증강 뱃지 — 드래프트 카드용. */
function QuestBadge({ id }: { id: string }): JSX.Element | null {
  const goal = QUEST_GOAL[id];
  if (goal === undefined) return null;
  return (
    <span className="aug-quest-badge" title={`퀘스트 — ${goal}`}>
      🎯 퀘스트
    </span>
  );
}

// ─────────────────────────── 설정 (자동정렬·자동화료·후로없음) ───────────────────────────

interface Settings {
  /** 손패 자동 정렬. 끄면 드래그로 순서를 바꿀 수 있다. */
  autoSort: boolean;
  /** 자동 화료 — 텐파이에서 화료 가능하면 론/쯔모를 자동으로 누른다. */
  autoWin: boolean;
  /** 후로 없음 — 치/펑/깡 후로 기회를 자동으로 패스한다. */
  autoNoMeld: boolean;
  /** 자동 버림 — 쯔모한 패를 자동으로 버린다(쯔모기리). 화료 가능하면 먼저 화료한다. */
  autoDiscard: boolean;
  /**
   * 두 번 탭으로 버리기 — 첫 탭은 패를 들어 올리고 두 번째 탭에 나간다.
   *
   * 기본은 **터치 기기에서만 켜진다**(마우스는 정확하므로 데스크톱의 한 번 클릭
   * 감각을 바꾸지 않는다). 폰에서 패 하나는 폭 26px에 간격 2px이라 옆 패를 짚기
   * 쉬운데, 짚으면 되돌릴 수 없는 타패가 그대로 나갔다 (감사 §5-2).
   */
  tapTwiceToDiscard: boolean;
  /** 내 오름패 표시 — 텐파이면 손패 위에 항상 화료패를 보여준다. */
  showMyWaits: boolean;
  /** 우클릭 쯔모기리 — 판 어디서든 오른쪽 버튼을 누르면 쯔모한 패를 그대로 버린다. */
  rightClickTsumogiri: boolean;
  /** 도라 반짝임 — 도라인 패를 금빛(전용 도라는 보랏금)으로 반짝이게 한다. */
  doraFx: boolean;
  /** 화면 효과 — 화료·리치 때 화면 흔들림·플래시·파티클 연출. */
  screenFx: boolean;
  /**
   * 연출 속도 배수 (감사 2026-08-17 §5-15).
   *
   * 예전에는 화면 효과 on/off 뿐이라, 100판째 사람에게 매 국 같은 컷인이 통과의례가
   * 됐다. Esc 건너뛰기는 있었지만 **매번 눌러야 하는** 것이지 "항상 빠르게"가 아니다.
   * 1 = 그대로 · 0.6 = 빠르게 · 0.35 = 최소.
   */
  prodSpeed: number;
  /** 효과음 on/off. */
  sfxOn: boolean;
  /** 효과음 음량 (0~1). sfxOn 과 곱해진다 — BGM 처럼 손잡이를 연다(감사 §5-4). */
  sfxVolume: number;
  /** 진동 — 폰에서 타패·화료를 손끝으로 알린다 (감사 §5-3). */
  haptics: boolean;
  /** 용어 설명 — 증강 설명 안의 마작 용어에 밑줄을 긋고 풀이 툴팁을 띄운다. */
  glossaryTips: boolean;
  /** 리치 BGM 볼륨 (0~1). 0이면 재생하지 않음. 효과음(sfxOn)과 독립. */
  riichiBgmVolume: number;
  /** 평상시 대국 BGM 볼륨 (0~1). 0이면 재생하지 않음. 리치 BGM과 별도. */
  bgmVolume: number;
}

const SETTINGS_KEY = "majak.settings";
const DEFAULT_SETTINGS: Settings = {
  autoSort: true,
  autoWin: false,
  autoNoMeld: false,
  autoDiscard: false,
  // 터치 기기에서만 기본 켜짐 — 오타패가 실제로 일어나는 곳이 거기다.
  // (matchMedia가 없는 환경에서는 꺼진 쪽으로 — 예전 동작 그대로.)
  tapTwiceToDiscard:
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false,
  showMyWaits: true,
  // 우클릭 쯔모기리는 기본 꺼짐 — 판 전체가 대상이라 모르고 켜져 있으면 실수로 패가 나간다.
  rightClickTsumogiri: false,
  doraFx: true,
  screenFx: true,
  prodSpeed: 1,
  sfxOn: true,
  sfxVolume: 1,
  // 진동 장치가 있는 기기에서만 기본으로 켠다 — 노트북에 죽은 스위치를 보여 주지 않는다.
  haptics: true,
  glossaryTips: true,
  riichiBgmVolume: 0.5,
  bgmVolume: 0.35,
};

function loadSettings(): Settings {
  try {
    const raw = safeStorage.getItem(SETTINGS_KEY);
    if (raw !== null) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* 손상된 값은 무시하고 기본값 */
  }
  return DEFAULT_SETTINGS;
}

/**
 * 잠긴 론·쯔모 버튼에 붙는 설명.
 *
 * 손은 다 됐는데 남의 증강이 막은 순간이다 — 예전엔 버튼이 아예 안 떠서 당한 사람은
 * "왜 화료가 안 되지"만 남았다(2026-08-17 사용자 요청). 무엇이 막았는지까지 말한다.
 */
function lockedReasonText(l: LockedOption): string {
  if (l.reason === "minHan") {
    return `잠김 — 이번 국은 ${l.minHan ?? 5}판 이상이어야 화료할 수 있습니다 (격(格)에 지목당했습니다)`;
  }
  return "잠김 — 이 사람의 버림패는 지금 론당하지 않습니다 (천하무적·불가침 조약)";
}

/** 버튼 안에 한 줄로 들어가는 짧은 사유 */
function lockedReasonShort(l: LockedOption): string {
  return l.reason === "minHan" ? `${l.minHan ?? 5}판 이상` : "론 불가";
}


/** 후로없음: 치·펑·깡만 있는(론 없는) 후로 프롬프트인가. */
function isCallOnlyPrompt(opts: ActionOption[]): boolean {
  const hasWin = opts.some((o) => o.type === "win");
  const nonPass = opts.filter((o) => o.type !== "pass");
  const hasPass = opts.some((o) => o.type === "pass");
  return (
    hasPass &&
    !hasWin &&
    nonPass.length > 0 &&
    nonPass.every((o) => o.type === "pon" || o.type === "chi" || o.type === "minkan")
  );
}

/**
 * 손패에 마우스를 올렸을 때, 그 종류의 패를 강조할 대상(공개된 버림패·후로)에
 * 알려주는 컨텍스트. null이면 강조 없음.
 */

/**
 * 액티브 증강의 '클릭 발동(무장)' 상태를 게임판 전체가 공유하는 컨텍스트.
 * 액티브 버튼(내 영역)에서 무장하면, 손패(내 영역)·상대(상대 영역)·바닥(중앙)이
 * 각자 클릭 대상을 하이라이트하고, 클릭 시 대응하는 옵션을 제출한다.
 *
 * GameTable이 상태를 소유하고, OwnArea·OpponentStrip·River가 이 값을 읽는다.
 * 무장이 없을 때(관전·리플레이 포함) armedType은 null이라 아무 것도 클릭되지 않는다.
 */
interface SelectionCtx {
  /** 무장된 액션 타입 (null이면 무장 없음). */
  armedType: string | null;
  /** 무장된 액션의 클릭 방식. */
  armMode: ArmMode | null;
  /** 무장된 타입의 현재 프롬프트 옵션들. */
  armedOptions: ActionOption[];
  /** 무장 토글 — 같은 타입이면 해제, 다른 타입/null이면 교체. */
  arm: (type: string | null) => void;
  /** 옵션 제출 + 무장 해제. */
  submit: (o: ActionOption) => void;
  /** 이 상대가 지금 무장 액션의 클릭 대상인지 (opp·swap3 상대 지정 단계). */
  oppArmable: (pid: string) => boolean;
  /** 상대 클릭 — opp면 제출, swap3면 상대 지정. */
  clickOpp: (pid: string) => void;
  /**
   * 손패를 건드리는 증강을 무장한 채로, 이 상대가 **리치라서** 대상이 될 수 없는가.
   * (리치 선언은 공개 정보다 — 숨은 리치는 riichiDeclared가 false라 여기 걸리지 않는다.)
   */
  oppRiichiBlocked: (pid: string) => boolean;
  /** 이 바닥 패가 지금 무장 액션의 클릭 대상이면 그 옵션(아니면 undefined). */
  riverOptionFor: (
    ownerId: string,
    tileId: number,
    kind: TileKind | undefined,
  ) => ActionOption | undefined;
  /** swap3: 지정한 상대(없으면 null). */
  swapTarget: string | null;
  /** swap3: 넘길 내 손패 3장. */
  swapGive: number[];
  /** swap3: 상대 지정 변경(내 영역 "상대 다시"용). */
  setSwapTarget: (pid: string | null) => void;
  /** swap3: 넘길 3장 갱신. */
  setSwapGive: (ids: number[]) => void;
}

const NO_SELECTION: SelectionCtx = {
  armedType: null,
  armMode: null,
  armedOptions: [],
  arm: () => {},
  submit: () => {},
  oppArmable: () => false,
  clickOpp: () => {},
  oppRiichiBlocked: () => false,
  riverOptionFor: () => undefined,
  swapTarget: null,
  swapGive: [],
  setSwapTarget: () => {},
  setSwapGive: () => {},
};

const SelectionContext = createContext<SelectionCtx>(NO_SELECTION);

/**
 * 강조 대조용 **패 종류 키** — `data-k` 속성으로 DOM에 찍는다 (감사 §7-4).
 *
 * **왜 React가 아니라 DOM 속성인가**: 예전에는 hover한 종류를 `HighlightContext`로
 * 내려보내고, 공개패마다 그 값과 자기 종류를 비교해 클래스를 붙였다. 컨텍스트 값이
 * 바뀌면 **소비자 전부가 다시 그려진다** — 화면에 패가 150~250장인데 그게 손패 위로
 * 마우스가 지날 때마다, 즉 **매 순** 일어났다.
 *
 * 지금은 패마다 자기 종류를 속성으로 달아 두고, 강조 여부는 판 루트의 `data-hl`
 * 하나와 CSS가 짝을 맞춘다(styles.css의 "손패 hover → 공개패 강조"). React 입장에서는
 * 아무 상태도 바뀌지 않으므로 리렌더가 **0**이다.
 *
 * 적도라는 종류가 아니라 표식이라 여기 섞지 않는다 — 예전 `kindMatches`도 suit·rank만
 * 비교했으므로 강조되는 집합은 그대로다.
 */
function highlightKey(tile: PublicTileView | undefined): string | undefined {
  const k = tile?.kind;
  return k === undefined ? undefined : `${k.suit}${k.rank}`;
}

/**
 * 지금 어떤 종류가 "누구에게" 도라인지 — 도라 반짝임 연출의 근거.
 *
 * 도라는 판이 곧바로 붙는 패인데 그림만 봐서는 평범한 패와 구분되지 않아, 손에 든
 * 도라를 못 보고 흘리는 일이 잦았다. 그래서 도라인 패는 패 자체를 반짝이게 한다.
 *
 * 다만 도라가 전원 공통이 아닌 경우가 있다(곁불·도라 옹립). 그런 종류는 그 사람
 * 패에서만 반짝여야 하므로, 종류만이 아니라 "누구의 도라인지"까지 들고 다닌다.
 */
interface DoraFx {
  /** 전원에게 도라인 종류 (kindKey) — 표시패가 가리키는 도라. */
  common: Set<string>;
  /** 그 플레이어에게만 도라인 종류 — playerId → kindKey 집합. */
  personal: Record<string, Set<string>>;
}

const NO_DORA: DoraFx = { common: new Set(), personal: {} };
const DoraContext = createContext<DoraFx>(NO_DORA);

/**
 * 이 패에 붙일 도라 연출 클래스 — 전원 공통 도라는 금빛, 그 사람 전용 도라는 보랏금.
 * owner(패의 주인)를 받는 이유는 전용 도라를 남의 패에 붙이지 않기 위해서다.
 */
function doraClassOf(
  tile: { kind: TileKind; attrs?: Record<string, unknown> } | undefined,
  owner: string,
  fx: DoraFx,
): string {
  if (tile === undefined) return "";
  // 적도라는 그림이 이미 붉지만 "판이 붙는 패"라는 점은 같으므로 함께 반짝인다
  if (tile.attrs?.red === true) return " tile-dora";
  const kk = kindKey(tile.kind);
  if (fx.common.has(kk)) return " tile-dora";
  if (fx.personal[owner]?.has(kk) === true) return " tile-dora-own";
  return "";
}

type BannerTone = "riichi" | "win" | "draw" | "info" | "chi" | "pon" | "kan" | "seal";
type CutInTone =
  | "tsumo"
  | "ron"
  | "yakuman"
  | "limit"
  | "draw"
  | "augment"
  | "chi"
  | "pon"
  | "kan"
  // 무덤 도굴 — 바닥에서 파낸 패로 화료하는 전용 톤
  | "grave"
  // 스파이 — 남의 화료 점수를 통째로 가로채는 순간
  | "spy";
/** 만관 이상(역만 미만) 컷인의 세부 등급 — CSS가 data-tier로 강도를 키운다 */
type LimitTier = "mangan" | "haneman" | "baiman" | "sanbaiman";

/**
 * 화면 흔들림 스펙 — 연출이 활성화되고 delayMs(기본: 컷인 230ms / 배너 180ms,
 * 글자 슬램이 화면에 꽂히는 시점) 뒤에 발동한다. 강도는 1(미세)~4(역만).
 */
interface ImpactSpec {
  shake: 1 | 2 | 3 | 4;
  delayMs?: number;
}

/** 흔들림 강도별 지속시간(ms) — CSS keyframes 길이와 일치해야 한다 */
const SHAKE_MS: Record<number, number> = { 1: 180, 2: 300, 3: 420, 4: 620 };
const CUTIN_IMPACT_MS = 230;
const BANNER_IMPACT_MS = 180;

/** 첫 페인트를 기다리는 상한(ms) — rAF가 오지 않는 백그라운드 탭에서 큐가 멈추지 않게 받친다.
 *  앞에 보이는 탭이면 rAF가 한 프레임(≈16ms) 만에 오므로 이 타이머는 이길 일이 없다. */
const PROD_PAINT_FALLBACK_MS = 400;

/**
 * 패를 하나 버리는 액션 — 클릭 순간 바로 "탁"이 나야 하는 것들. 리치 선언도 패를 하나
 * 버리는 행위라 여기 포함된다(빠지면 클릭엔 무음, 에코 뷰에서 뒤늦게 소리가 난다).
 */
/**
 * "패를 하나 버린다"로 끝나는 액션 — 타패음·자기 버림 기억(에코 소리 억제) 대상.
 * 오픈 리치·스텔스 리치·올인 리치도 결국 그 패를 버리는 수라, 소리가 빠지면
 * 드래그로 걸었을 때만 무음이 되어 손놀림과 감각이 어긋난다.
 */
const DISCARD_LIKE = new Set([
  "discard",
  "free_discard",
  "riichi",
  "open_riichi",
  "stealth_riichi",
  "all_in_riichi",
]);

/**
 * 화면 연출 하나(배너/컷인). 여러 개가 한꺼번에 발생해도 큐에 쌓여
 * 한 번에 하나씩 순서대로 재생된다 — 겹쳐 덮어써 사라지거나(드롭)
 * 오래된 연출이 다음 국까지 남는(잔류) 문제를 막는다.
 */
interface Production {
  key: number;
  channel: "banner" | "cutin";
  text: string;
  sub?: string;
  tone: BannerTone | CutInTone;
  /** limit 컷인일 때만 — 만관/하네만/배만/삼배만 */
  tier?: LimitTier;
  /**
   * 증강 컷인일 때 그 증강(또는 액션) id — 카테고리별 색·아이콘을 뽑는 데 쓴다.
   * 증강마다 완전 수제 연출을 다 만들 수는 없으므로, **카테고리(8종)로 색과 모티프를
   * 갈라** 같은 계열끼리만 닮게 한다(10 §2b-3의 "전용 연출" 요구를 스케일 가능하게 충족).
   */
  augId?: string;
  /** 화면에 떠 있는 시간(ms) */
  ttl: number;
  /** 이 연출이 실제로 화면에 뜨는 순간 재생할 효과음 (enqueue 시점이 아니라 활성화 시점) */
  sfx?: () => void;
  /** 알림에 함께 보여줄 관련 패 (예: 리치 선언패) */
  tiles?: TileKind[];
  /**
   * `tiles`의 이 자리 **앞에** "→"를 끼운다 — 바뀌기 전과 후를 가르는 자리다.
   *
   * 연금술사·염색·분열은 "전 → 후"를 한 줄에 늘어놓는데, 그냥 붙여 놓으면 6만·7만이
   * 나란히 선 **두 장짜리 손패**로 읽힌다("6만이 7만이 됐다"가 아니라 "6만 7만을 얻었다").
   * 2026-08-12 사용자 보고가 정확히 이것이다.
   */
  tileArrowAt?: number;
  /** 화면 흔들림 (screenFx 설정이 켜져 있을 때만 발동) */
  impact?: ImpactSpec;
  /**
   * 큐에서 앞질러 나갈 수 있는 등급 — 클수록 먼저 재생된다(기본 0, 같은 등급끼리는 FIFO).
   *
   * 왜 필요한가: 큐는 한 번에 하나씩만 재생하는데 증강 컷인이 2초씩 줄줄이 서면, 그
   * 뒤에 들어온 **리치 배너가 몇 초 뒤에야** 뜬다 — 실제로는 상대가 리치를 건 지 한참
   * 지나 내가 버릴 패를 고르고 있을 때, 심하면 론 직전에 뜬다(2026-08-17 사용자 보고).
   * 리치는 "알고 나서 버려야 하는" 유일한 통지라 지연이 곧 오판이 된다.
   *
   * ⚠ 순서가 바뀌어도 **기록은 안 바뀐다** — 📜 로그는 재생 시점이 아니라 `enqueue`
   * 시점에 쌓이므로(아래 enqueueProduction) 실제로 일어난 순서 그대로 남는다.
   */
  priority?: number;
}

/**
 * 사건 기록 한 줄 — **일어난 순간 쌓이고 지워지지 않는다**.
 *
 * 왜 필요한가: 예전 📜 로그는 `augmentView`(현재 상태)를 매 렌더 훑어 만든 것이라
 * 기록이 아니라 스냅샷이었다. 채널이 걷히면 줄도 같이 사라져서, 컷인을 놓치면
 * (다른 탭·눈 깜빡임·컷인이 줄줄이 밀린 경우) 그 국 내내 무슨 일이 있었는지 알 길이 없었다.
 * 후로·리치·화료에 이르면 스크롤백 자체가 없었다.
 *
 * 어디서 채우나: 후로·리치·화료·증강 발동은 **전부 연출 큐를 지난다**(showBanner/showCutIn).
 * 그래서 enqueueProduction 한 곳에서 append하면 네 가지가 한꺼번에 들어온다 —
 * 새 알림을 붙일 때 로그를 따로 챙길 필요가 없다는 뜻이기도 하다.
 */
/** 지나간 국의 정산 한 건 — 라벨은 받을 때의 뷰에서 딴다(settle은 다음 국을 가리킨다) */
interface PastRound {
  label: string;
  result: RoundOverMessage;
}

interface LogEvent {
  key: number;
  /** 일어난 시각 (epoch ms) — 줄 앞에 시:분:초로 찍는다 */
  at: number;
  text: string;
  sub?: string;
  tone: string;
  channel: "banner" | "cutin";
  augId?: string;
  /** 이 사건이 일어난 국 ("동1국 1본장") — 국이 바뀌는 자리에 구분선을 넣는다 */
  round: string;
}

/** 기록 상한 — 한 판(동풍전 4~8국)이면 100줄 안쪽이다. 넘치면 오래된 것부터 버린다. */
const LOG_MAX = 400;
/** 기록이 없는 자리(리플레이 뷰어)용 고정 빈 배열 — 매번 새 []를 넘기면 memo가 헛돈다. */
const EMPTY_LOG: LogEvent[] = [];
const EMPTY_PAST_ROUNDS: PastRound[] = [];

/**
 * 화면 효과를 끈 사람의 연출 체류 시간 비율.
 * 파티클·섬광만 빼고 ttl은 그대로 두면 "효과 끄기"가 기다림을 전혀 줄여 주지 못한다 —
 * 정작 끄는 이유의 절반이 그 기다림이다. 밴드·글자는 남기되 스치듯 지나가게 한다.
 */
const PROD_TTL_NO_FX = 0.42;

/** 배너는 톤으로 큐 등급이 정해진다 — 호출부는 아무것도 더 넘기지 않는다 */
const BANNER_PRIORITY: Partial<Record<BannerTone, number>> = { riichi: PROD_PRIORITY_RIICHI };

/** 이 연출이 실제로 화면에 머무는 시간 (화면 효과 설정 반영). */
function effectiveProdTtl(ttl: number, screenFx: boolean, speed = 1): number {
  // 화면 효과를 끈 것과 연출을 짧게 하는 것은 **다른 요구**다 — 전자는 멀미·광과민,
  // 후자는 "이미 다 아는 연출"이다. 그래서 곱으로 겹친다.
  const base = screenFx ? ttl : Math.round(ttl * PROD_TTL_NO_FX);
  return Math.max(PROD_TTL_FLOOR_MS, Math.round(base * speed));
}

/** 지금 글자를 치고 있는 칸인가 — 단축키가 타이핑을 가로채지 않게 한다. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (el === null || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/**
 * 겉모습(함수 객체)은 절대 안 바뀌고 속은 항상 최신인 콜백.
 *
 * 왜 필요한가: GameTable에 넘기던 콜백 스무 개가 전부 그 자리에서 만든 화살표 함수라
 * 매 렌더 새 객체였다. 그러면 GameTable을 React.memo로 감싸도 **아무 효과가 없다** —
 * props가 매번 달라 보이기 때문이다. 그래서 memo를 걸기 전에 이 손질이 먼저 와야 한다.
 *
 * useCallback + 의존성 배열로 하나하나 묶지 않는 이유: 이 콜백들은 App의 지역 함수
 * (send·showToast·updateSetting…)를 부르는데, 그 함수들이 또 매 렌더 새로 만들어진다.
 * 의존성에 넣으면 도로 매번 바뀌고, 빼면 스테일 클로저가 된다. ref로 최신을 가리키고
 * 겉껍데기만 고정하면 둘 다 피한다.
 */
function useStableFn<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

/**
 * `<span>`·`<div>` 를 버튼처럼 쓸 때 필요한 것을 **한 벌로** 준다 —
 * `role` · `tabIndex` · 클릭 · **Enter/Space 키**.
 *
 * **왜** (감사 2026-08-17 §6-1): `role="button"` 과 `onClick` 만 붙은 자리가 여럿
 * 있었다. 그러면 스크린리더는 "버튼"이라고 읽어 주는데 **포커스가 가지 않아 누를
 * 수가 없다** — 아무것도 안 붙은 것보다 나쁘다. 회수·무덤 도굴·날치기 같은 지목형
 * 증강이 키보드만으로는 발동 불가였다.
 *
 * 새 자리를 만들 때 이걸 쓰면 넷 중 하나를 빠뜨릴 수 없다. `<button>` 을 쓸 수 있는
 * 곳에서는 그냥 `<button>` 을 쓴다 — 이 헬퍼는 패·이름표처럼 이미 복잡한 레이아웃
 * 안에 버튼을 넣을 수 없는 자리를 위한 것이다.
 */
function clickableProps(
  onActivate: () => void,
  label?: string,
): {
  role: "button";
  tabIndex: 0;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-label"?: string;
} {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      // Space 는 기본 동작이 스크롤이라 반드시 막는다 — 안 막으면 누를 때마다 판이 튄다.
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onActivate();
      }
    },
    ...(label === undefined ? {} : { "aria-label": label }),
  };
}

/**
 * 화면을 덮는 오버레이(도감·규칙) — **뒤의 화면을 진짜로 비활성으로 만든다.**
 *
 * **왜** (감사 2026-08-17 §6-2·6-5): 예전에는 그냥 `<div className="screen-overlay">`
 * 였다. 시각적으로만 덮여 있고 뒤의 게임판은 **탭 순서에 그대로 남아 있었다** —
 * 도감에서 Tab을 계속 누르면 보이지 않는 손패 버튼으로 넘어가고, 거기서 Enter를
 * 누르면 그대로 타패가 나갔다. 화면에 없는 것을 눌러 패를 버리는 셈이다.
 *
 * 해법은 포커스 트랩을 손으로 짜는 게 아니라 `inert` 다. 형제 요소에 걸면 그 안의
 * 모든 것이 포커스·클릭·스크린리더에서 한꺼번에 빠진다 — 트랩을 직접 구현할 때
 * 늘 생기는 구멍(shadow DOM·iframe·브라우저 UI 왕복)이 애초에 없다.
 *
 * 함께 갖춘 것: `aria-modal`(보조기술에 "뒤는 없는 셈"이라고 알린다) · Esc 로 닫기 ·
 * 닫을 때 **원래 포커스로 복귀**(안 하면 닫은 뒤 포커스가 body로 떨어져 Tab이 맨
 * 처음부터 다시 시작한다).
 */
function ScreenOverlay(props: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseStable = useStableFn(props.onClose);
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (el == null || parent == null) return;
    const restore = document.activeElement as HTMLElement | null;
    // 이미 inert 인 형제(오버레이가 겹쳐 뜬 경우)는 건드리지 않는다 — 걷을 때
    // 남의 것을 벗겨 버리면 아래 오버레이의 뒤 화면이 되살아난다.
    const covered = [...parent.children].filter(
      (c): c is HTMLElement => c !== el && c instanceof HTMLElement && !c.hasAttribute("inert"),
    );
    for (const c of covered) c.setAttribute("inert", "");
    // 오버레이 안 첫 조작점으로 포커스를 옮긴다(없으면 오버레이 자신).
    const first = el.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (first ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseStable();
    };
    el.addEventListener("keydown", onKey);
    return () => {
      for (const c of covered) c.removeAttribute("inert");
      el.removeEventListener("keydown", onKey);
      restore?.focus?.({ preventScroll: true });
    };
  }, [onCloseStable]);
  return (
    <div
      ref={ref}
      className="screen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={props.label}
      tabIndex={-1}
    >
      {props.children}
    </div>
  );
}

/**
 * 게임 위에 뜨는 **비모달** 패널(설정·기록)용 — Esc로 닫고, 열 때 포커스를 옮긴다.
 *
 * 이쪽에는 `aria-modal`도 `inert`도 걸지 않는다. 판은 뒤에서 계속 돌고 결정 타이머도
 * 흐르므로, "뒤는 없는 셈"이라고 말하면 그건 거짓이다. 대신 Esc와 포커스만 챙긴다.
 */
function useDismissablePanel(onClose: () => void): React.MutableRefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseStable = useStableFn(onClose);
  useEffect(() => {
    const el = ref.current;
    if (el == null) return;
    const restore = document.activeElement as HTMLElement | null;
    const first = el.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])');
    (first ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseStable();
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      restore?.focus?.({ preventScroll: true });
    };
  }, [onCloseStable]);
  return ref;
}

/** 시드 고정 난수 — 리렌더·StrictMode 이중 렌더에도 파티클 배치가 변하지 않는다 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 컷인 파티클 버스트 — 방사형 파편. 색은 톤 클래스의 --fx-color가 결정 */
function CutInBurst({ seed, count }: { seed: number; count: number }): JSX.Element {
  const parts = useMemo(() => {
    const rnd = mulberry32(seed * 2654435761);
    return Array.from({ length: count }, (_, i) => ({
      angle: (360 / count) * i + (rnd() - 0.5) * 22,
      dist: 16 + 12 * rnd(),
      size: 5 + Math.round(rnd() * 7),
      delay: 0.18 + rnd() * 0.07,
      dur: 0.55 + rnd() * 0.4,
    }));
  }, [seed, count]);
  return (
    <span className="px-burst" aria-hidden>
      {parts.map((p, i) => (
        <i
          key={i}
          className="px"
          style={{
            "--px-angle": `${p.angle}deg`,
            // 화면 비례 단위는 전부 가상 뷰포트 기준이다 (uiScale.ts 참고)
            "--px-dist": `${p.dist}cqmin`,
            "--px-size": `${p.size}px`,
            "--px-delay": `${p.delay}s`,
            "--px-dur": `${p.dur}s`,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** 역만 낙하 컨페티 — 금박·보라 파편이 위에서 쏟아진다 */
function YakumanConfetti({ seed, count = 40 }: { seed: number; count?: number }): JSX.Element {
  const COLORS = ["#ffd76a", "#ffffff", "#b07ef2", "#ff9a6a"];
  const parts = useMemo(() => {
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    return Array.from({ length: count }, (_, i) => ({
      x: rnd() * 100,
      delay: rnd() * 0.6,
      dur: 1.1 + rnd() * 0.9,
      size: 6 + rnd() * 8,
      spin: 240 + rnd() * 540,
      color: COLORS[i % COLORS.length]!,
    }));
  }, [seed, count]);
  return (
    <span className="cutin-confetti" aria-hidden>
      {parts.map((p, i) => (
        <i
          key={i}
          className="cf"
          style={{
            "--cf-x": `${p.x}vw`,
            "--cf-delay": `${p.delay}s`,
            "--cf-dur": `${p.dur}s`,
            "--cf-size": `${p.size}px`,
            "--cf-spin": `${p.spin}deg`,
            "--cf-color": p.color,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** 파티클 버스트가 뜨는 컷인 톤과 기본 개수 — 화료 전용 (후로의 상대 가치를 지킨다) */
const BURST_COUNT: Partial<Record<CutInTone, number>> = {
  ron: 20,
  tsumo: 16,
  limit: 24,
  yakuman: 40,
  // 도굴은 화료로 직결되는 발동이라 화료급 연출을 준다
  grave: 18,
  spy: 16,
};
const TIER_BONUS: Record<LimitTier, number> = { mangan: 0, haneman: 6, baiman: 12, sanbaiman: 18 };
/** 스피드라인(방사선)이 깔리는 컷인 톤 */
const RAYS_TONES = new Set<string>(["ron", "tsumo", "limit", "yakuman", "grave", "spy"]);
/** 충격파 링이 퍼지는 컷인 톤 */
const RING_TONES = new Set<string>(["ron", "tsumo", "limit", "yakuman", "kan", "grave", "spy"]);

/** 만관 이상 등급의 상대 순위 (헤드라인 화료 선정용) */
const LIMIT_RANK: Record<string, number> = { mangan: 1, haneman: 2, baiman: 3, sanbaiman: 4 };

/** 후로(치·펑·깡) 컷인 톤 — 컷인 연출을 좀 더 컴팩트하게 그린다 */
const CALL_CUTIN_TONES = new Set(["chi", "pon", "kan"]);

/**
 * 증강 발동 컷인 톤 (2026-07-22, 52차).
 *
 * 후로는 "쿵" 하고 패가 꽂히는 **타격** 연출이고, 증강은 그 반대 — **번개가 스치듯**
 * 짧게 번쩍이고 사라지는 초자연 연출이어야 한다(10 §2b-3). 이 집합의 톤에는
 * `.cutin-aug` 모디파이어가 붙어 대각 섬광(`.cutin-bolt`)과 스캔라인(`.cutin-scan`)이
 * 얹히고, 밴드 슬램이 얇고 빠르게 바뀐다.
 */
const AUGMENT_CUTIN_TONES = new Set(["augment", "grave", "spy"]);

interface AuthInfo {
  username: string;
  isAdmin: boolean;
  /** 계정 없는 게스트 체험 세션인가. 홈·통계·리플레이가 전부 막혀 있다. */
  guest: boolean;
}

interface Toast {
  key: number;
  text: string;
  tone: "error" | "info";
}

/**
 * 동시에 띄울 수 있는 토스트 수 (감사 2026-08-17 §5-8).
 *
 * 예전에는 **슬롯이 하나**여서 뒤에 온 것이 앞엣것을 덮었다. 하필 겹치기 쉬운 조합이
 * "시간 초과 — 패스로 자동 진행했습니다" + "지금 고를 수 있는 선택지가 아닙니다" 처럼
 * **둘 다 알아야 하는** 통지들이라, 초읽기 국에서는 무엇이 일어났는지 절반만 봤다.
 */
const TOAST_MAX = 3;

/** 자풍 인덱스 (0=東/친). 역행하는 세계(direction -1)도 반영 */
function seatWindIdx(view: PlayerView, player: PlayerInfo): number {
  const n = view.players.length;
  const dir = view.round.direction >= 0 ? 1 : -1;
  const diff = (player.seat - view.round.dealerSeat) * dir;
  return ((diff % n) + n) % n;
}

/** 자풍 글자 (東이면 친). */
function seatWindChar(view: PlayerView, player: PlayerInfo): string {
  return WIND_CHAR[seatWindIdx(view, player)] ?? "?";
}

/**
 * 봇 전략 원형의 표시 이름과 설명 (`server/bot/profile.ts`의 원형과 1:1).
 *
 * 봇 셋이 "봇1·봇2·봇3"으로만 보이면 셋 다 같은 사람으로 읽힌다 — 실제로는 미는 정도도,
 * 우는 문턱도, 타점 취향도 다르다. 이름표에 성향을 붙여 그 차이를 먼저 알려 준다.
 */
const ARCHETYPE_INFO: Record<string, { label: string; desc: string }> = {
  attacker: { label: "공격형", desc: "밀고 걸고 물러서지 않는다. 상대 리치에도 잘 포기하지 않는다." },
  defender: { label: "수비형", desc: "방총을 극히 싫어한다. 아니다 싶으면 일찍 포기한다." },
  speedster: { label: "속공형", desc: "타점이 낮아도 좋으니 빨리. 뭐든 울어서 텐파이를 잡는다." },
  valueHunter: { label: "타점형", desc: "멘젠으로 크게. 잘 울지 않고 비싸질 때까지 기다린다." },
  balanced: { label: "균형형", desc: "교과서대로 둔다. 치우친 데가 없다." },
  wildcard: { label: "변덕형", desc: "읽히지 않는다. 같은 자리에서 매번 다르게 두고 허세가 잦다." },
};

/** 선택 목록에 세우는 순서 — 공격↔수비를 양 끝에 두고 사이를 채운다 */
const ARCHETYPE_ORDER: readonly string[] = [
  "attacker",
  "speedster",
  "valueHunter",
  "balanced",
  "wildcard",
  "defender",
];

/** 원형 id → 표시 정보 (모르는 id면 null — 서버가 원형을 늘려도 화면이 깨지지 않는다) */
function archetypeInfo(archetype: string | null | undefined): { label: string; desc: string } | null {
  return archetype != null ? ARCHETYPE_INFO[archetype] ?? null : null;
}

/**
 * 봇 성향 칩 — 대기실·결과 화면처럼 전적 칩이 서는 자리에 대신 세운다.
 * 원형을 모르면(구 서버·사람 좌석) 그냥 "봇"으로 떨어진다.
 */
function BotArchetypeChip(props: { archetype: string | null | undefined }): JSX.Element {
  const info = archetypeInfo(props.archetype);
  if (info === null) return <span className="stat-chip stat-chip-empty">봇</span>;
  return (
    <span className="stat-chip stat-chip-arch" title={`${info.label} 봇 — ${info.desc}`}>
      {info.label}
    </span>
  );
}

/**
 * 봇 성향 선택 (방장 전용, 대기실) — 그 자리 봇을 고른 원형으로 다시 앉힌다.
 *
 * 성향이 시드로만 정해지던 때는 "수비형 셋과 붙어 보고 싶다" 같은 연습을 하려면
 * 원하는 조합이 나올 때까지 방을 만들었다 지웠다 해야 했다.
 */
function BotArchetypePicker(props: {
  archetype: string | null | undefined;
  onChange: (archetype: string) => void;
}): JSX.Element {
  const cur = props.archetype ?? "";
  const info = archetypeInfo(props.archetype);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  // 목록은 body 포털로 띄운다(FIXED_SURFACE_NOTE) — 좌석 줄 안에 두면 대기실 패널에
  // 잘린다. 그래서 위치는 버튼의 화면 좌표에서 직접 잡는다.
  // rect·window.inner*는 **화면 좌표**, 인라인 top/left는 **레이아웃 좌표**다 —
  // 배율이 걸린 채로 섞으면 목록이 버튼에서 떨어져 나간다 (uiScale.ts 참고).
  const place = (): void => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r === undefined) return;
    const width = Math.max(toLayoutPx(r.width), 168);
    setBox({
      top: toLayoutPx(r.bottom) + 6,
      left: Math.min(toLayoutPx(r.left), layoutViewport().w - width - 8),
      width,
    });
  };

  /**
   * 띄운 뒤 **실제 높이를 재서** 화면 안으로 끌어들인다.
   *
   * 줄 수 × 대충 잡은 높이로 미리 계산했더니 마지막 좌석(북)에서 목록 끝이 화면
   * 밖으로 나갔다 — 설명 줄이 몇 줄로 접히는지는 글꼴·폭에 따라 달라서 미리 알 수 없다.
   * 페인트 전에 고치므로 튀어 보이지 않는다.
   */
  useLayoutEffect(() => {
    const el = menuRef.current;
    const r = btnRef.current?.getBoundingClientRect();
    if (el === null || r === undefined || box === null) return;
    // offsetHeight는 이미 레이아웃 px, rect·창 크기는 화면 px — 레이아웃 쪽으로 맞춘다
    const h = el.offsetHeight;
    const vh = layoutViewport().h;
    const below = toLayoutPx(r.bottom) + 6;
    // 아래로 넘치면 버튼 위로 뒤집고, 그래도 안 들어가면 화면 안에 맞춘다
    const want = below + h > vh - 8 ? toLayoutPx(r.top) - h - 6 : below;
    const top = Math.max(8, Math.min(want, vh - h - 8));
    if (Math.abs(top - box.top) > 1) setBox({ ...box, top });
  }, [box]);

  useEffect(() => {
    if (!open) return;
    place();
    const close = (): void => setOpen(false);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    // 스크롤·리사이즈로 버튼이 움직이면 목록만 남아 떠다닌다 — 그냥 닫는다
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`seat-arch-pick${open ? " seat-arch-open" : ""}`}
        title={info !== null ? `${info.label} 봇 — ${info.desc}` : "봇 성향 선택"}
        aria-label="봇 성향"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="seat-arch-label">{info?.label ?? "성향"}</span>
        <span className="seat-arch-caret" aria-hidden="true" />
      </button>
      {open && box !== null
        ? createPortal(
            <>
              {/* 바깥을 누르면 닫힌다 — 목록보다 아래에 깔린 투명 판 */}
              <div className="arch-menu-catch" onClick={() => setOpen(false)} />
              <div
                className="arch-menu"
                ref={menuRef}
                role="listbox"
                aria-label="봇 성향"
                style={{ top: box.top, left: box.left, minWidth: box.width }}
              >
                {ARCHETYPE_ORDER.map((id) => {
                  const opt = ARCHETYPE_INFO[id];
                  const sel = id === cur;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      className={`arch-opt${sel ? " arch-opt-sel" : ""}`}
                      onClick={() => {
                        setOpen(false);
                        if (!sel) props.onChange(id);
                      }}
                    >
                      <span className="arch-opt-name">{opt?.label ?? id}</span>
                      {/* 이름만으로는 뭐가 다른지 모른다 — 고르는 자리에서 바로 읽히게 한다 */}
                      <span className="arch-opt-desc">{opt?.desc ?? ""}</span>
                    </button>
                  );
                })}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** 자리 순서 기준 봇 번호 (봇이 하나면 "봇", 여럿이면 "봇1"…) */
function botLabel(view: PlayerView, player: PlayerInfo): string {
  const bots = view.players.filter((p) => p.isBot).sort((a, b) => a.seat - b.seat);
  if (bots.length <= 1) return "봇";
  return `봇${bots.findIndex((b) => b.id === player.id) + 1}`;
}

function playerName(view: PlayerView, player: PlayerInfo): string {
  if (player.id === view.playerId) return "나";
  if (player.isBot) return botLabel(view, player);
  return player.nickname !== "" ? player.nickname : player.id;
}

/** id만 있는 곳(컷인·결과·증강 패널)에서 표시명을 얻는다. 없으면 id 폴백. */
function playerNameById(view: PlayerView, id: string): string {
  const p = view.players.find((x) => x.id === id);
  return p !== undefined ? playerName(view, p) : id;
}

/** navigator.clipboard가 없는 평문 HTTP 환경용 폴백 복사. 성공 시 true. */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ─────────────────────────── 패 정렬·표기 ───────────────────────────

const SUIT_ORDER: Record<string, number> = { man: 0, pin: 1, sou: 2, wind: 3, dragon: 4 };

/** 실물 패 없이 종류만 있을 때의 정렬 키 — 만·통·삭·풍·삼원 순, 같은 무늬면 랭크 순 */
function kindOrder(kind: TileKind): number {
  return (SUIT_ORDER[kind.suit] ?? 9) * 1000 + kind.rank * 10;
}

function tileOrder(tile: PublicTileView | undefined): number {
  if (tile === undefined) return Number.MAX_SAFE_INTEGER;
  const suit = SUIT_ORDER[tile.kind.suit] ?? 9;
  return suit * 1000 + tile.kind.rank * 10 - (tile.attrs.red === true ? 1 : 0);
}

function sortTileIds(ids: number[], tiles: PlayerView["tiles"]): number[] {
  return [...ids].sort((a, b) => {
    const ta = tiles[a];
    const tb = tiles[b];
    const oa = tileOrder(ta);
    const ob = tileOrder(tb);
    if (oa !== ob) return oa - ob;
    const sa = ta?.kind.suit ?? "";
    const sb = tb?.kind.suit ?? "";
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a - b;
  });
}

function sortTileViews(tiles: PublicTileView[]): PublicTileView[] {
  return [...tiles].sort((a, b) => tileOrder(a) - tileOrder(b));
}

/**
 * 클라이언트 대기 계산(winningKinds)에 넘길 분해 옵션 — 진짜 용은 표준형 멘쯔가
 * 5개라 기본 4멘쯔로 계산하면 텐파이/대기가 전혀 잡히지 않는다. 보유 증강에서 유도한다.
 */
function waitDecompOptions(
  player: PlayerInfo | undefined,
  view?: PlayerView,
  /** 지금 그 사람의 손패 (증강 조건이 손 모양에 걸리는 경우에만 쓴다) */
  hand?: readonly TileKind[],
): DecomposeOptions | undefined {
  if (player === undefined) return undefined;
  // 분해 규칙을 바꾸는 증강들을 누적한다 — 서버 helpers.scoringOptionsOf와 같은 옵션을
  // 만들어야 대기 표시와 실제 화료가 일치한다. (드래프트상 여러 개 동시 보유는 드물지만
  // 겹쳐도 안전하도록 조기 반환 대신 누적한다.)
  const opts: DecomposeOptions = {};
  const has = (id: string): boolean => player.augments.includes(id);
  // 진짜 용 — 5멘쯔 손이라 기본 4멘쯔 분해로는 텐파이가 잡히지 않는다
  if (has("true_dragon")) opts.totalSets = 5;
  // 무너진 국경 — 혼색 슌쯔만 허용한다(서버 broken_border.ts는 scoring.mixedRuns만
  // 킨다 — 혼색 커쯔는 mixed_triplet 전용). 예전엔 여기서 mixedTriplets까지 같이
  // 켜서 서버가 인정 안 하는 몸통을 화면이 정상으로 표시하는 desync가 있었다.
  if (has("broken_border")) opts.mixedRuns = true;
  // 동수의 결속 — 혼색 커쯔만 (슌쯔는 기존처럼)
  if (has("mixed_triplet")) opts.mixedTriplets = true;
  // 부숴진 벽 — 순환 슌쯔(8-9-1·9-1-2)
  if (has("broken_wall")) opts.wrapRuns = true;
  // 왕의 징표 — 국사 중복 허용(서버 royal_kokushi의 DUPES와 일치해야 한다)
  if (has("royal_kokushi")) opts.kokushiDupes = 1;
  // 양극 — 같은 무늬의 1·9로 이루는 커쯔 몸통(199·191·911)
  if (has("polar_ends")) opts.polarEnds = true;
  // 비대칭 치또이 — 무늬 무관 rank 쌍(1만+1통)
  if (has("async_chiitoi")) opts.chiitoiMixedPairs = true;
  // 바람의 계보 — 자패 슌쯔(동남서·남서북·백발중)
  if (has("wind_lineage")) opts.honorRuns = true;
  // 우는 국사무쌍 — 특수 퐁(kokushi_pon)을 한 순간 국사 외의 길이 닫힌다.
  if (has("open_kokushi") && view !== undefined) {
    const melds = view.round.byPlayer[player.id]?.melds ?? [];
    const kokushiMeldKinds = melds
      .filter((m) => m.kind === "kokushi_pon")
      .flatMap((m) =>
        m.tileIds
          .map((id) => view.tiles[id]?.kind)
          .filter((k): k is TileKind => k !== undefined),
      );
    if (kokushiMeldKinds.length > 0) {
      opts.kokushiMeldKinds = kokushiMeldKinds;
      opts.kokushiOnly = true;
    }
  }
  /**
   * 조커 — 발동한 국에만 백이 만능패다. 발동은 전원 공개 채널(`joker:{playerId}`)에
   * 실리므로 **남의 손 대기 표시도** 서버와 같은 규칙으로 그린다. 내 손은 아래에서
   * 서버가 실어 준 scoringOptions가 최종 진실이라 이 추론을 덮어쓴다.
   */
  if (has("joker") && view?.augmentView[`joker:${player.id}`] === true) {
    opts.wildKinds = [{ suit: "dragon", rank: 1 }];
  }
  // 뒤섞인 아홉 개의 연꽃 — 손이 구련 뼈대 위에 있을 때만 무늬를 지운다(서버와 같은 조건).
  // 이게 없으면 27종 대기가 통째로 안 보여 "텐파이인지 모르겠다"가 된다(2026-08-01 사용자 보고).
  if (has("mixed_nine_gates") && hand !== undefined && onNineGatesPath(hand)) {
    opts.mixedRuns = true;
    opts.mixedTriplets = true;
    opts.mixedPairs = true;
  }
  /**
   * 서버가 **뷰어 본인 몫**으로 실어 준 분해 옵션이 최종 진실이다 — 위 추론은 관전·상대
   * 손패용 대체물이고, 내 손은 서버가 규칙 레지스트리로 계산한 값을 그대로 쓴다.
   * (없는 옵션은 키 자체가 없으므로 덮어써도 위에서 켠 것이 꺼지지 않는다.)
   */
  const server =
    view !== undefined && player.id === view.playerId ? view.scoringOptions : undefined;
  const merged = { ...opts, ...(server ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** 구련보등 뼈대(1112345678999)의 랭크별 최소 장수 — 코어 mixed_nine_gates의 사본 */
const NINE_GATES_BASE: readonly number[] = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];

/**
 * 이 손이 "무늬만 흩어진 구련보등"으로 가는 길 위에 있는가
 * (content/mixed_nine_gates.ts의 onNineGatesPath와 같은 판정).
 *
 * 13장은 뼈대 그대로, 14장은 **한 장을 빼면 뼈대가 되는가**로 본다 — 자패를 쥔 채
 * 리치를 걸려는 순간(뼈대 13장 + 자패 1장)도 대기가 잡혀야 하기 때문이다.
 */
function onNineGatesPath(hand: readonly TileKind[]): boolean {
  const extra = (tiles: readonly TileKind[]): number | null => {
    const counts = new Array<number>(10).fill(0);
    for (const k of tiles) {
      if (k.suit !== "man" && k.suit !== "pin" && k.suit !== "sou") return null;
      if (k.rank < 1 || k.rank > 9) return null;
      counts[k.rank] = (counts[k.rank] ?? 0) + 1;
    }
    let over = 0;
    for (let r = 1; r <= 9; r++) {
      const diff = (counts[r] ?? 0) - (NINE_GATES_BASE[r] ?? 0);
      if (diff < 0) return null;
      over += diff;
    }
    return over;
  };
  if (hand.length === 13) return extra(hand) === 0;
  if (hand.length === 14) {
    return hand.some((_k, i) => extra(hand.filter((_x, j) => j !== i)) === 0);
  }
  return false;
}

/** 도라·뒷도라 표시패 블록의 장수 — 코어 INDICATOR_BLOCK_SIZE의 사본 (07 §2) */
const INDICATOR_BLOCK = 10;

/**
 * 실제 왕패 장수. 뷰에는 가시성(peek)으로 앞 N장만 실려 오므로 `tileIds.length`만 보면
 * 안 되고 가려진 장수까지 더해야 한다 — 그래야 표시패 자리를 뒤에서부터 셀 수 있다.
 */
function deadWallSizeOf(view: PlayerView): number {
  const z = view.zones["deadWall"];
  return (z?.tileIds.length ?? 0) + (z?.hiddenCount ?? 0);
}

/** 아직 남은 영상패 장수 (코어 rinshanRemaining의 클라이언트 사본) */
function rinshanLeftOf(view: PlayerView): number {
  return Math.max(0, deadWallSizeOf(view) - INDICATOR_BLOCK);
}

/** 국 시작 왕패 장수 — 코어 DEAD_WALL_SIZE의 사본 (07 §2) */
const DEAD_WALL_START = 14;

/**
 * 이미 빠져나간 영상패 장수 = 왕패에 **비어 있는 앞자리** 수.
 *
 * 깡의 영상 쯔모는 보충하지 않으므로(07 §2) 그만큼 왕패 앞이 빈다. 모달은 남은 패만
 * 촘촘히 그리면 "몇 장을 썼는지"가 안 보이고 표시패 열이 통째로 왼쪽으로 밀려 보이므로,
 * 이 수만큼 **빈 자리를 앞에 그려** 원래 14칸 배열을 유지한다.
 * (북풍 상인의 북빼기는 되채우므로 이 값이 늘지 않는다.)
 */
function rinshanSpentOf(view: PlayerView): number {
  return Math.max(0, DEAD_WALL_START - deadWallSizeOf(view));
}

/**
 * 왕패 자리의 정체 (왕패의 주인 모달 라벨용).
 *
 * 코어 규약(07 §2): 앞쪽이 영상패(0이 다음 깡의 보충패), 그 뒤 10장이 표시패 블록으로
 * 짝수째=도라 표시패(깡마다 다음 자리가 공개), 그 오른쪽=짝이 되는 뒷도라 표시패.
 *
 * ⚠ **자리 번호를 상수(4·6·8…)로 세면 안 된다.** 깡으로 영상패를 뽑으면 그 자리는
 * 보충되지 않고 사라져(2026-07-26 사용자 확정) 배열이 앞에서부터 줄어든다.
 * 표시패 블록은 언제나 **왕패의 마지막 10장**이므로 뒤에서부터 센다.
 * (북풍 상인의 북빼기만은 되채우므로 장수가 그대로다.)
 *
 * @param flipped 지금까지 공개된 도라 표시패 수 (view.round.doraIndicators.length)
 * @param size 지금 왕패에 남은 장수 (view.zones.deadWall.tileIds.length)
 */
function deadWallSlotInfo(
  idx: number,
  flipped: number,
  size: number,
): { label: string; cls: string } {
  const first = size - INDICATOR_BLOCK; // 표시패 블록 시작 = 남은 영상패 장수
  if (idx < first) {
    return { label: idx === 0 ? "다음 영상패" : `영상패 ${idx + 1}번째`, cls: "rinshan" };
  }
  const off = idx - first;
  if (off % 2 === 0) {
    const n = off / 2 + 1;
    return n <= flipped
      ? { label: `도라 표시 ${n} (공개됨)`, cls: "dora-open" }
      : { label: `도라 표시 ${n} (깡 ${n - 1}회 시)`, cls: "dora" };
  }
  const n = (off - 1) / 2 + 1;
  return { label: `뒷도라 ${n}`, cls: "ura" };
}

/**
 * "man5" 같은 kindKey → TileKind (증강 정보 패널 렌더용)
 *
 * 무늬는 **그릴 수 있는 다섯 종류**로 못 박는다. 예전에는 `[a-z]+숫자`면 무엇이든
 * 패로 봤는데, 좌석 id `p1`이 그 모양에 그대로 걸려 "p1"이라 적힌 패가 컷인에
 * 떴다(2026-08-13 사용자 보고 — 정적의 손). 못 그리는 무늬는 어차피 글자 폴백으로
 * 내부값을 노출할 뿐이라, 여기서 걸러 아예 패로 세지 않는다.
 */
const DRAWABLE_SUITS: ReadonlySet<string> = new Set(["man", "pin", "sou", "wind", "dragon"]);

function parseKindKey(key: string): TileKind | null {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return null;
  const suit = m[1] as string;
  if (!DRAWABLE_SUITS.has(suit)) return null;
  return { suit, rank: Number(m[2]) };
}

/**
 * 선언 간파(peek_waits)로 알아낸 특정 플레이어의 화료패(오름패).
 * augmentView는 보유자에게만 waits:{pid} 키를 노출하므로, 발동한 본인에게만 보인다.
 */
function peekedWaits(view: PlayerView, playerId: string): TileKind[] {
  const raw = view.augmentView[`waits:${playerId}`];
  if (!Array.isArray(raw)) return [];
  return (raw as string[]).map(parseKindKey).filter((k): k is TileKind => k !== null);
}

/**
 * 오픈 리치(open_riichi_reveal)로 전원에게 공개된 그 플레이어의 오름패(대기).
 * view:*: 채널이라 모두의 augmentView에 open_riichi_reveal:{pid}로 담긴다.
 */
function openRiichiWaits(view: PlayerView, playerId: string): TileKind[] {
  const raw = view.augmentView[`open_riichi_reveal:${playerId}`];
  if (!Array.isArray(raw)) return [];
  return (raw as string[]).map(parseKindKey).filter((k): k is TileKind => k !== null);
}

/**
 * 자유 선언(free_riichi_discard)으로 고정된 내 오름패(대기).
 * 리치 시점에 스냅샷된 손패의 대기라, 이후 물리 손패를 바꿔도 이 값이 진짜 오름패다.
 * 보유자 전용 채널(view:{holder}:free_declare_waits:{holder})이라 본인에게만 담긴다.
 */
function freeDeclareWaits(view: PlayerView, playerId: string): TileKind[] {
  const raw = view.augmentView[`free_declare_waits:${playerId}`];
  if (!Array.isArray(raw)) return [];
  return (raw as string[]).map(parseKindKey).filter((k): k is TileKind => k !== null);
}

function formatTile(tile: { kind: TileKind; attrs?: Record<string, unknown> } | undefined): string {
  if (tile === undefined) return "?";
  const rank = tile.kind.rank;
  const red = tile.attrs?.red === true ? "赤" : "";
  if (tile.kind.suit === "man") return `${red}${rank}만`;
  if (tile.kind.suit === "pin") return `${red}${rank}통`;
  if (tile.kind.suit === "sou") return `${red}${rank}삭`;
  if (tile.kind.suit === "wind") return ["", "동", "남", "서", "북"][rank] ?? `풍${rank}`;
  if (tile.kind.suit === "dragon") return ["", "백", "발", "중"][rank] ?? `삼${rank}`;
  return `${tile.kind.suit}${rank}`;
}

/**
 * 이 패를 **적도라 그림(0m·0p·0s)** 으로 그려야 하는가.
 *
 * ⚠ 적도라 그림은 **5에만 존재한다**. 붉은 손길처럼 5가 아닌 랭크에 적도라를 새기는
 * 증강이 생긴 뒤로, `red`만 보고 0번 그림을 쓰면 3만·7통이 전부 **적5로 보였다**
 * (2026-08-01 사용자 보고: "지금 들어오는 게 전부 아카5로만 보임"). 5가 아닌 적도라는
 * 원래 그림 그대로 두고 붉은 이펙트(.tile-red)만 얹는다.
 */
function usesRedArt(kind: TileKind, red: boolean): boolean {
  return red && kind.rank === 5 && (kind.suit === "man" || kind.suit === "pin" || kind.suit === "sou");
}

function tileImageSrcOf(kind: TileKind, red: boolean): string | null {
  const { suit, rank } = kind;
  if (suit === "man" || suit === "pin" || suit === "sou") {
    if (rank < 1 || rank > 9) return null;
    const face = usesRedArt(kind, red) ? 0 : rank;
    return `/tiles/${face}${suit === "man" ? "m" : suit === "pin" ? "p" : "s"}.png`;
  }
  if (suit === "wind" && rank >= 1 && rank <= 4) return `/tiles/${rank}z.png`;
  if (suit === "dragon" && rank >= 1 && rank <= 3) return `/tiles/${rank + 4}z.png`;
  return null;
}

/**
 * 모든 타일 이미지를 미리 받아 브라우저 캐시에 넣는다.
 * (안 하면 패가 처음 보일 때 png 로딩 전까지 흰 타일이 잠깐 번쩍인다.)
 *
 * **언제 부르는가가 요점이다** (감사 2026-08-17 §7-12). 예전에는 모듈 최상위에서
 * 즉시 실행했다 — 그래서 **로그인 화면 하나를 보는 데 타일 38장**을 받았다.
 * 로그인·가입만 하고 나가는 사람, 랜딩만 보고 떠나는 사람이 전부 그 비용을 냈다.
 *
 * 지금은 판에 들어갈 것이 확실해진 시점(인증 성공)에 한 번만 부른다. 그 시점부터
 * 첫 배패까지는 방을 만들고 사람을 기다리는 시간이 있어, 미리 받는 목적은 그대로
 * 달성된다. 두 번 불려도 브라우저 캐시가 받아 주므로 가드는 두지 않는다.
 */
function preloadTileImages(): void {
  if (typeof window === "undefined") return;
  const srcs: string[] = [];
  for (const suit of ["man", "pin", "sou"] as const) {
    for (let rank = 1; rank <= 9; rank++) {
      const s = tileImageSrcOf({ suit, rank }, false);
      if (s !== null) srcs.push(s);
    }
    const red = tileImageSrcOf({ suit, rank: 5 }, true);
    if (red !== null) srcs.push(red);
  }
  for (let rank = 1; rank <= 4; rank++) {
    const s = tileImageSrcOf({ suit: "wind", rank }, false);
    if (s !== null) srcs.push(s);
  }
  for (let rank = 1; rank <= 3; rank++) {
    const s = tileImageSrcOf({ suit: "dragon", rank }, false);
    if (s !== null) srcs.push(s);
  }
  for (const src of srcs) {
    const img = new Image();
    img.src = src;
  }
}


/*
 * ── 리렌더 차단막 (React.memo) ─────────────────────────────────────────
 * 한 화면에 패가 150~250장 서 있는데, App의 상태가 하나만 바뀌어도(연출 시작·종료,
 * 토스트 켜짐·꺼짐, 점수 이펙트…) 판 전체가 다시 그려졌다. 아래 넷 — 패 한 장, 바닥,
 * 상대 손패 한 자리, 이름표 — 이 그 대부분을 차지하므로 여기에만 막을 세워도 크게 줄어든다.
 *
 * ⚠ memo가 막지 못하는 것 두 가지를 알고 써야 한다.
 *  1) 컨텍스트: TileImg는 DoraContext를 읽는다 — 도라 정보가 바뀌면 전부 다시 그려진다(의도된 것).
 *  2) 매번 새로 만드는 props: `tile={{ kind }}` 처럼 즉석 객체를 넘기면 막이 서지 않는다.
 *     그런 자리(뱃지·툴팁의 종류만 보여주는 패)는 원래 몇 장 안 되므로 그대로 둔다.
 */
const TileImg = memo(function TileImg({
  tile,
  size,
  owner,
}: {
  tile: { kind: TileKind; attrs?: Record<string, unknown> } | undefined;
  size: "hand" | "mini" | "fill" | "result";
  /**
   * 이 패를 들고 있는(버린) 사람. 넘기면 도라일 때 반짝임이 붙는다.
   * 뱃지·툴팁처럼 "종류만 보여주는" 패는 주인이 없으므로 넘기지 않는다 — 연출도 없다.
   */
  owner?: string | undefined;
}): JSX.Element {
  const doraFx = useContext(DoraContext);
  const isRed = tile?.attrs?.red === true;
  const src = tile === undefined ? null : tileImageSrcOf(tile.kind, isRed);
  // 증강이 새로 만들어낸 패(색 변환 등)는 원본과 구분되게 별도 이펙트로 표시한다
  const conjured = tile?.attrs?.conjured === true ? " tile-conjured" : "";
  // 5가 아닌 적도라(붉은 손길 등)는 그림이 없다 — 원래 패 그대로 두고 붉은 기운만 얹는다
  const red = tile !== undefined && isRed && !usesRedArt(tile.kind, true) ? " tile-red" : "";
  const dora = owner === undefined ? "" : doraClassOf(tile, owner, doraFx);
  if (src === null) {
    return (
      <span className={`tile-face tile-${size} tile-text${conjured}${red}${dora}`}>
        {formatTile(tile)}
      </span>
    );
  }
  return (
    <span className={`tile-face tile-${size}${conjured}${red}${dora}`}>
      <img src={src} alt={formatTile(tile)} draggable={false} />
    </span>
  );
});

/**
 * 창이 너무 작아 자동 축소(uiScale.ts)로도 배치가 안 풀릴 때 왼쪽 위에 뜨는 안내.
 * 브라우저 확대율은 스크립트로 못 건드린다 — 여기서부터는 사람이 눌러야 한다.
 *
 * 단, 사람이 −/+ 로 **직접 키워서** 좁아진 것이라면 원인도 해법도 브라우저가 아니다.
 * 그땐 방금 누른 그 버튼을 가리킨다 (안 그러면 "줄이라"는 안내가 엉뚱한 손잡이를 가리킨다).
 */
function LayoutHint(): JSX.Element | null {
  const [cramped, setCramped] = useState(isLayoutCramped);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => subscribeUiScale(() => setCramped(isLayoutCramped())), []);
  if (!cramped || dismissed) return null;
  const zoomedByHand = getUiZoom() > 1;
  const mod = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";
  return createPortal(
    <div className="layout-hint" role="status">
      <span className="layout-hint-icon">⤢</span>
      <span>
        {zoomedByHand ? (
          <>
            화면을 키워 배치가 겹칠 수 있습니다 — 오른쪽 위 <b>−</b> 로 줄여 보세요.
          </>
        ) : (
          <>
            창이 좁아 배치가 겹칠 수 있습니다 — <b>{mod} + −</b> 로 화면을 줄여 보세요.
          </>
        )}
      </span>
      <button
        type="button"
        className="layout-hint-x"
        onClick={() => setDismissed(true)}
        aria-label="안내 닫기"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}

/**
 * 화면 확대/축소 손잡이 — 자동 맞춤(uiScale.ts) **위에 곱하는** 배수를 사람이 만진다.
 *
 * 자동은 창만 본다. 눈·모니터 거리·시력은 못 본다 — 같은 창에서도 누구는 크게,
 * 누구는 작게 보고 싶어 한다. 2026-08-07에 설정 패널의 "화면 크기"를 없앤 뒤로는
 * 그 손잡이가 아예 없었다.
 *
 * 자리는 **오른쪽 위 아이콘 줄**(설정 ⚙ · 도감 📖 · 규칙 📘)의 왼쪽 끝이다 —
 * 2026-08-12에 사용자가 "인게임 기준 설정이나 증강도감 있는 쪽"으로 지정했다.
 * 포털로 body에 붙으므로 로그인·로비·대국 어디서나 같은 자리다.
 *
 * 배율은 body의 `zoom` 하나로 화면 전체에 균일하게 걸린다(styles.css 가상 뷰포트 주석).
 * 이 손잡이도 예외가 아니다 — 확대하면 같이 커진다. 브라우저 Ctrl+ 와 같은 동작이고,
 * 옆 아이콘 버튼과 높이도 어긋나지 않는다.
 */
function ScaleControl(): JSX.Element {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeUiScale(bump), []);
  const zoom = getUiZoom();
  const pct = Math.round(zoom * 100);
  const mod = navigator.userAgent.includes("Mac") ? "⌥" : "Alt";
  return createPortal(
    <div className="ui-zoom" role="group" aria-label="화면 크기">
      <button
        type="button"
        className="ui-zoom-btn"
        onClick={() => stepUiZoom(-1)}
        disabled={!canStepUiZoom(-1)}
        aria-label="화면 축소"
        title={`화면 축소 (${mod} + −)`}
      >
        −
      </button>
      <button
        type="button"
        className="ui-zoom-now"
        onClick={() => resetUiZoom()}
        disabled={zoom === 1}
        aria-label={`화면 크기 ${pct}% — 눌러서 기본값으로`}
        title={`기본 크기로 되돌리기 (${mod} + 0)`}
      >
        {pct}%
      </button>
      <button
        type="button"
        className="ui-zoom-btn"
        onClick={() => stepUiZoom(1)}
        disabled={!canStepUiZoom(1)}
        aria-label="화면 확대"
        title={`화면 확대 (${mod} + +)`}
      >
        +
      </button>
    </div>,
    document.body,
  );
}

// ─────────────────────────── App ───────────────────────────

export function App(): JSX.Element {
  const wsRef = useRef<WebSocket | null>(null);
  const prevViewRef = useRef<PlayerView | null>(null);
  const toastSeq = useRef(0);
  const introShown = useRef(false);
  /** 최신 설정·카탈로그를 소켓 콜백(고정 클로저) 안에서 읽기 위한 ref. */
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  /** 증강 테스트 상태의 최신 값 (소켓 콜백은 마운트 시 고정된 스테일 클로저다) */
  const sandboxRef = useRef<SandboxMessage | null>(null);
  const catalogRef = useRef<Record<string, AugmentCatalogEntry>>({});
  const spectatingRef = useRef(false);
  /** 자동 재연결 상태: 예약 타이머·시도 횟수·의도적 종료 여부. */
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  /** 연결 생존 확인 — 주기 타이머와 "답을 기다리는 중인 ping"의 발신 시각. */
  const heartbeatTimerRef = useRef<number | null>(null);
  const pingSentAtRef = useRef<number | null>(null);
  /**
   * 초대 링크(`?room=CODE`)로 들어왔다 — 인증이 끝나면 이 방으로 들어간다.
   * 부팅 시 한 번만 읽는다: 그 뒤 주소창은 지워지고, 이 값은 한 번 쓰면 비워진다.
   */
  const pendingInviteRef = useRef<string | null>(roomCodeFromUrl());
  /** 끊긴 동안 밀린 재전송 대기열 (resendPolicy.ts ②). */
  const pendingSends = useRef<QueuedSend[]>([]);
  /** 이번 끊김에서 "보내지 못했다"를 이미 알렸는가 — 토스트가 연달아 쌓이지 않게. */
  const sendFailNotified = useRef(false);
  /** 재연결 후 자동 복귀 대상 — 참가 중인 방 코드 / 관전 중인 방 코드. */
  const activeRoomRef = useRef<string | null>(null);
  const activeSpectateRef = useRef<string | null>(null);
  /**
   * 지금 방에 앉아 있는가 (`joined`로 켜고, 방을 뜨면 끈다).
   *
   * `activeRoomRef`와 따로 두는 이유: 그쪽은 **재연결 자동 재입장 대상**이라
   * 게스트 체험 판에서는 처음부터 null이다(게스트는 joinRoom을 못 쓴다).
   * 그걸로 게임 스트림을 걸러 내면 손님 화면에는 아무것도 그려지지 않는다.
   */
  const inRoomRef = useRef(false);
  /** 이번 국 결과에 대해 roundContinue(다음 국 신호)를 이미 보냈는지 — 국마다 리셋 */
  const roundContinueSent = useRef(false);
  /**
   * 이번 순에 이미 컷인을 띄운 증강 발동 (`{player}:{actionType}`).
   *
   * 서버는 **액션 1개 = 발동 1회**로 받는데, 발동 한 번이 액션 여럿으로 쪼개지는
   * 증강이 있다 — 왕패의 주인은 한 번 확정에 교환 쌍만큼(최대 2개) dw_swap을
   * 연달아 보낸다. 그대로 두면 한 번 쓴 것에 컷인이 두 번 떴다
   * (2026-08-07 사용자 보고: 봇이 쓰면 알람 두 번). 순이 바뀌면 통째로 비운다.
   */
  const fxSeenRef = useRef<{ turn: string; keys: Set<string> }>({
    turn: "",
    keys: new Set(),
  });
  /**
   * 판이 바뀌면 그 기억을 비운다 — **순 서명은 판을 가리지 않는다.**
   *
   * 서명이 `東:1:0:{순}`이라 새 판의 첫 순은 지난 판의 첫 순과 글자까지 같다. 그래서
   * 판을 다시 시작하고 같은 증강을 같은 순에 쓰면 "이미 띄웠다"로 걸려 컷인이 통째로
   * 사라졌다 — 증강 테스트에서 새 판을 돌려가며 같은 증강을 눌러 보면 두 번째부터
   * 아무 알림도 안 뜬다(2026-08-12 사용자 보고: "조커 — 능력 사용했는데 알림이 안 나옴").
   */
  const resetFxSeen = (): void => {
    fxSeenRef.current = { turn: "", keys: new Set() };
  };
  /**
   * 서버가 다음 국을 그냥 시작해 버리는 시각(performance.now 기준). 결과 화면의
   * "다음 국으로" 버튼이 세는 남은 시간이다.
   *
   * 서버의 대기는 **roundOver를 보낸 순간**부터 흐르는데 결과창은 화료 컷인이 다
   * 끝난 뒤에야 열린다 — 그래서 창이 열릴 때 상한을 처음부터 다시 세면 카운트다운이
   * 컷인 길이만큼 거짓말을 한다. 메시지가 도착한 이 자리에서 절대 시각으로 굳힌다.
   */
  const roundResultDeadline = useRef<number | null>(null);
  /**
   * 연출 배너를 국 단위로 정확히 한 번만 띄우기 위한 "이미 알림한 상태" 추적.
   * detectTransitions가 중복·스테일 뷰로 같은 전환을 다시 받아도 재발동하지 않게 한다
   * (재발동이 누적되면 배너가 자기 타이머로도 안 사라지는 stuck 버그가 났었다).
   */
  const bannerShown = useRef<{
    roundKey: string;
    riichi: Set<string>;
    melds: Record<string, number>;
    /** 이미 가깡 알림한 묶음 키 `${pid}:${kindKey}` — 가깡은 melds 길이가 안 늘어 별도 추적 */
    kanAdded: Set<string>;
    /** 이미 알림한 내 봉인 패 종류 수 (봉인술사 등 — 게임 단위로 유지) */
    sealed: number;
    /** 스파이 적발 알림을 이미 띄운 홀더 (게임당 1회 지정이라 홀더별 1회) */
    spyCaught: Set<string>;
    /** 격(格) 지목 피격 컷인을 이미 띄운 `${key}:${roundKey}` (국당 1회 지목) */
    rankGate: Set<string>;
    /** 성립하지 않는 깡 컷인을 이미 띄운 `${key}:${kind}:${roundKey}` */
    voidKan: Set<string>;
    /** 숨은 리치가 풀렸다는 당사자 전용 컷인을 이미 띄운 `${key}:${roundKey}` */
    stealthBroken: Set<string>;
    /**
     * 일회성 증강 사건 컷인을 이미 띄운 서명 `${key}=${값}@${roundKey}`.
     * 채널은 국이 끝날 때까지 값을 그대로 들고 있으므로(뷰가 매 틱 다시 온다)
     * 서명으로 걸러야 같은 사건이 매 뷰마다 다시 터지지 않는다.
     */
    augEvents: Set<string>;
  }>({
    roundKey: "",
    riichi: new Set(),
    melds: {},
    kanAdded: new Set(),
    sealed: 0,
    spyCaught: new Set(),
    rankGate: new Set(),
    voidKan: new Set(),
    stealthBroken: new Set(),
    augEvents: new Set(),
  });

  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  /**
   * 서버가 연결 직후 알려 주는 정책 (가입 게이트 여부 등). 도착 전에는 null —
   * 로그인 화면은 그 동안 게이트 문구를 **추측해서 쓰지 않는다**.
   */
  const [serverInfo, setServerInfo] = useState<ServerInfoMessage | null>(null);
  /** 서버가 되돌려 준 인증 실패 사유 — 토스트가 아니라 로그인 폼 안에 남긴다. */
  const [authError, setAuthError] = useState<string | null>(null);
  /** 로그인 화면을 열 때 보여 줄 탭 — logout(nextTab)이 정한다. */
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  /**
   * 튜토리얼 코치가 켜져 있는가.
   *
   * **코치는 튜토리얼 방에서만 돈다.** 강의가 그 방의 고정분(연금술사·고정 배패·
   * 시간 제한 없음) 위에 서 있기 때문이다 — 서버의 `TUTORIAL_ROOM_NOTE` 참고.
   * 켜지는 자리는 셋: 로그인 화면의 «🎓 튜토리얼», 홈의 같은 버튼, 그리고 **갓
   * 가입한 사람**(가입 직후 튜토리얼 판으로 바로 들어간다).
   *
   * 갓 가입한 사람에게만 저장된 사실(`tutorialDone`)을 본다 — 두 번째 가입도 아닌데
   * 매번 안내가 뜨면 방해다. 반대로 버튼을 **직접 누른** 사람에게는 저장된 사실과
   * 무관하게 켠다: 그건 "다시 보고 싶다"는 뜻이다.
   */
  const [coachOn, setCoachOn] = useState(false);
  /**
   * 코치가 켜져 있는가를 **소켓 콜백에서** 읽기 위한 ref.
   * `handleServerMessage`는 마운트 시 소켓에 고정된 클로저라 state가 낡는다
   * (`tryAutoRespond`가 이 값을 본다 — 이유는 그쪽 주석).
   */
  const coachOnRef = useRef(false);
  coachOnRef.current = coachOn;
  /** 튜토리얼을 이미 마쳤는가 (저장된 사실) */
  const tutorialDone = useRef(safeStorage.getItem(TUTORIAL_KEY) === "1");
  /**
   * 방금 **가입 폼**으로 들어왔는가 — 로그인과 구별하려고 둔다.
   * 서버의 `authOk`는 둘을 구별해 주지 않는다(같은 메시지다).
   */
  const justRegistered = useRef(false);
  /** 방금 도착한 정형구들 — EMOTE_SHOW_MS 뒤 스스로 사라진다. */
  const [emotes, setEmotes] = useState<EmoteEntry[]>([]);
  /** 규칙·도움말 화면 열림 여부 (로그인 전·홈·게임 중 어디서나 열린다) */
  const [helpOpen, setHelpOpen] = useState(false);
  /** "가로로 돌리세요" 안내를 닫았는가 — 한 번 읽으면 그만이다(docs/28 §2-2) */
  const [rotateHintOff, setRotateHintOff] = useState(false);
  /**
   * 지금 인증되어 있는가 — **live ref**. handleServerMessage는 마운트 시 소켓에
   * 고정된 클로저라 auth state가 스테일하다. 서버 오류를 로그인 폼에 넣을지
   * 토스트로 띄울지는 이 ref로만 판단한다.
   */
  const authedRef = useRef(false);
  /** 지금이 게스트 세션인가 — live ref (위와 같은 이유). 계정 전용 요청을 막는다. */
  const guestRef = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** 방금 끝난 판의 리플레이 id — 결과 화면의 "이 판 다시 보기"(감사 §5-10). */
  const [lastGameId, setLastGameId] = useState<number | null>(null);
  const [joined, setJoined] = useState<JoinedMessage | null>(null);
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [stats, setStats] = useState<StatsMessage | null>(null);
  /**
   * 홈 카드의 목록들은 **`null`로 시작한다** — `[]`가 아니다 (감사 2026-08-17 §5-1).
   *
   * `[]`로 시작하면 로그인 직후 서버 왕복이 끝나기 전까지 "저장된 리플레이가
   * 없습니다" 같은 **거짓말**이 뜬다. 신규 유저는 그걸 첫인상으로 받고, 기존 유저는
   * "내 기록이 날아갔나?"로 읽는다. null은 "아직 모른다"이고 []는 "없다"이다 —
   * 화면에서 그 둘은 완전히 다른 문장이어야 한다.
   */
  const [myReplays, setMyReplays] = useState<ReplayGameSummary[] | null>(null);
  const [replayData, setReplayData] = useState<ReplayDataMessage | null>(null);
  /** 증강 도감 전체화면 페이지 열림 여부 (홈에서만 진입) */
  const [codexOpen, setCodexOpen] = useState(false);
  /** 증강 파워 티어표 전체화면 페이지 열림 여부 (관리자 전용) */
  const [tierOpen, setTierOpen] = useState(false);
  /** 서버가 카탈로그와 실시간으로 조인해 준 파워 티어표 (관리자 전용) */
  const [augmentTiers, setAugmentTiers] = useState<AdminAugmentTiersMessage | null>(null);
  const [liveRooms, setLiveRooms] = useState<LiveRoomSummary[] | null>(null);
  /** 증강 테스트(샌드박스) 게임 상태 — null이면 일반 게임. 관리자만 받는다. */
  const [sandbox, setSandbox] = useState<SandboxMessage | null>(null);
  /** 지금 내가 조종 중인 봇 좌석 (증강 테스트 · 없으면 null) — 서버가 알려 준다 */
  const [controlling, setControlling] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserEntry[] | null>(null);
  /** 제보 게시판 — 내가 볼 수 있는 글만 온다(내 글, 관리자면 전체). */
  const [feedback, setFeedback] = useState<FeedbackEntry[] | null>(null);
  const [spectating, setSpectating] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  /**
   * 중앙 인포 패널이 그리는 **국 스냅샷** — 판의 나머지(`view`)와 따로 논다.
   *
   * 중앙 패널은 "새 국의 시작점"이다. 그런데 서버의 정산 뷰(phase=`round.over`)는
   * ROUND_SETTLED가 국번호·장풍·본장·오야를 **미리 올려** 보내므로, 그대로 그리면
   * 론 컷인도 점수표도 증강 선택창도 뜨기 전에 중앙 패널만 다음 국으로 홱 바뀐다
   * (2026-08-11 사용자 보고). 그래서 `round.over` 뷰에서는 갱신하지 않고, 드래프트까지
   * 모두 끝나 **진짜 다음 국이 시작된 뷰**(phase ≠ round.over)에서만 넘어간다.
   *
   * 점수판(plate)은 이 스냅샷을 쓰지 않는다 — 정산 즉시 오르내려야 점수표와 어긋나지
   * 않는다. 여기서 얼리는 것은 국 정보(국번호·본장·공탁·도라·패산·자풍)뿐이다.
   */
  const [centerView, setCenterView] = useState<PlayerView | null>(null);
  /**
   * 응답을 기다리는 프롬프트들 — **좌석 id → 프롬프트**.
   *
   * 평소에는 내 좌석 하나뿐이다. 증강 테스트에서 봇 좌석을 조종하면 내 좌석과 그 봇
   * 좌석에 프롬프트가 동시에 뜰 수 있어, 지금 보고 있는 좌석(view.playerId)의 것을
   * 골라 그린다. 단일 슬롯이던 시절에는 나중에 온 쪽이 앞의 것을 덮어써 잃어버렸다.
   */
  const [prompts, setPrompts] = useState<Record<string, PromptMessage["prompt"]>>({});
  const [promptSeq, setPromptSeq] = useState(0);
  const [draft, setDraft] = useState<DraftOfferMessage | null>(null);
  /**
   * 이 드래프트의 **자동 선택 시각**(performance.now 기준). 오퍼가 **도착한 순간**
   * 굳힌다 — 선택창이 실제로 뜨는 시각이 아니다.
   *
   * 예전에는 창이 마운트될 때부터 30초를 다시 셌다. 그런데 오퍼는 개막 연출(2.1초)이나
   * 아직 안 닫힌 결과 화면 뒤에서 먼저 도착해 있어, 화면은 "3초 남음"인데 서버 타이머는
   * 이미 0이었다 — 남은 시간이 있는데 랜덤으로 결정돼 버리는 것처럼 보였다
   * (2026-08-17 사용자 보고). 프롬프트 마감(promptDeadline)과 같은 방식으로 맞춘다.
   */
  const draftDeadline = useRef<number | null>(null);
  /** 내가 이번 드래프트에서 이미 골랐는가 — 고른 뒤 "다른 플레이어 대기 중" 표시용 */
  const [draftPicked, setDraftPicked] = useState(false);
  // handleServerMessage는 마운트 시 고정된 스테일 클로저라 draftPicked state를
  // 못 읽는다 → 뷰 핸들러에서 "이미 골랐는가"를 판정할 ref를 따로 둔다.
  const draftPickedRef = useRef(false);
  /** 직전 대기실 스냅샷 — 설정이 무엇에서 무엇으로 바뀌었는지 알려 주려고 둔다(같은 이유로 ref) */
  const prevLobby = useRef<LobbyMessage | null>(null);
  /** 중단 투표를 이미 알렸는가 — 투표가 갱신될 때마다 토스트가 쌓이지 않게 한 번만 띄운다 */
  const abortVoteNoticed = useRef(false);
  /** 지금 화면(=보고 있는 좌석)이 답해야 할 프롬프트 */
  const prompt = view === null ? null : (prompts[view.playerId] ?? null);
  /**
   * 이 결정의 **마감 시각**(epoch ms). 서버가 모든 프롬프트에 `deadlineMs`를 실어
   * 보낸다 — 평소 30초, 초읽기(time_pressure) 국에는 그보다 짧게. 재접속 때는
   * 진짜 남은 시간이 실려 온다.
   */
  const [promptDeadline, setPromptDeadline] = useState<number | null>(null);
  /** 좌석 하나의 프롬프트만 지운다 (제출·취소) */
  const dropPrompt = (seat: string): void => {
    setPromptDeadline(null);
    setPrompts((prev) => {
      if (!(seat in prev)) return prev;
      const next = { ...prev };
      delete next[seat];
      return next;
    });
  };
  const [catalog, setCatalog] = useState<Record<string, AugmentCatalogEntry>>({});
  // 연출 큐 — 대기열(ref)과 현재 재생 중(active) 하나. 한 번에 하나씩 순서대로.
  const productionQueue = useRef<Production[]>([]);
  const prodSeq = useRef(0);
  /** 효과음을 이미 재생한 연출 key — effect 재실행(HMR 등)에도 연출당 1회 보장 */
  const prodFiredKey = useRef(0);
  /** 화면 흔들림 대상 루트 (data-shake 속성 토글용) */
  const gameRootRef = useRef<HTMLDivElement | null>(null);
  /**
   * 내가 방금 버린 패 id — 서버 에코 뷰가 같은 타패를 다시 감지해 "탁"을 두 번 내는 걸 막는다.
   * 시한(옛 600ms 창) 대신 패 id로 대조하는 이유: 회선이 느리거나 탭이 백그라운드였거나
   * 재접속 리플레이면 에코가 창을 넘겨 도착해 중복 재생이 그대로 새어나온다.
   */
  const pendingOwnDiscards = useRef(new Set<number>());

  /** 내가 낸 타패의 패 id를 기억해 둔다 — 곧 올 에코 뷰에서 소리를 한 번 더 내지 않게 */
  function rememberOwnDiscard(payload: unknown): void {
    const tid = (payload as { tileId?: unknown } | undefined)?.tileId;
    if (typeof tid === "number") pendingOwnDiscards.current.add(tid);
  }

  /**
   * 리치 BGM을 '연출(리치 배너)이 실제로 뜨는 순간'에 맞춰 시작하기 위한 무장 플래그.
   * 리치 선언 감지 시 무장하고, 배너가 큐에서 꺼내져 화면에 뜰 때(onShow)에서야 start()한다
   * → 브금이 연출보다 먼저 나오지 않는다. 배너가 뜨기 전에 국이 끝나면(빠른 론 등)
   * 무장을 풀어(fadeOut/stop 지점) 뒤늦게 브금이 켜졌다 안 꺼지는 일을 막는다. */
  const riichiBgmArmed = useRef(false);
  const [activeProd, setActiveProd] = useState<Production | null>(null);
  const [prodTick, setProdTick] = useState(0); // enqueue/변화 시 펌프 재실행 신호
  /** 📜 사건 기록 (append-only) — 후로·리치·화료·증강 발동이 일어난 순서대로 쌓인다 */
  const [logEvents, setLogEvents] = useState<LogEvent[]>([]);
  /** 이 판에서 지나간 국의 정산 (📜 기록에서 다시 열어 본다) */
  const [roundHistory, setRoundHistory] = useState<PastRound[]>([]);
  /** 지금 국의 사람 읽는 라벨 — 기록 줄에 붙는다 (뷰 전이 감지에서 갱신) */
  const roundLabelRef = useRef("");
  // 큐가 모두 빈 뒤에 열어야 하는 국 결과 (이전 국 연출이 끝난 뒤 결과창)
  const pendingResult = useRef<RoundOverMessage | null>(null);
  const [roundResult, setRoundResult] = useState<RoundOverMessage | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[] | null>(null);
  /** 판이 끝난 이유 — 결과 화면 헤더 아래 한 줄. 예전에는 "대국 종료"뿐이었다. */
  const [gameEndReason, setGameEndReason] = useState<GameEndReason>("normal");
  /** 종국 뒤에도 방이 살아 있어 같은 멤버로 한 판 더 갈 수 있는가 (결과 화면의 "이어하기") */
  const [canContinue, setCanContinue] = useState(false);
  const [abortVote, setAbortVote] = useState<AbortVoteMessage | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);
  const [intro, setIntro] = useState(false);
  const [scoreFx, setScoreFx] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings>(loadSettings);
  settingsRef.current = settings; // 매 렌더 동기화 (소켓 콜백에서 최신 설정 읽기)
  sandboxRef.current = sandbox; // 소켓 콜백에서 "내 실제 좌석"을 읽기 위한 동기화
  catalogRef.current = catalog;
  spectatingRef.current = spectating !== null;

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    /*
     * 소리·진동 설정은 **바꾸는 순간 들려 준다** (감사 2026-08-17 §5-16).
     * 예전에는 효과음을 켜도 아무 소리가 안 나서 켜졌는지 알 수 없었고,
     * 음량 슬라이더는 더더욱 — 귀로 맞추는 값인데 소리 없이 끌어야 했다.
     * (끌 때는 내지 않는다. 끄겠다는 사람에게 소리로 답하는 건 앞뒤가 안 맞는다.)
     */
    if (key === "sfxOn" && value === true) {
      setSfxEnabled(true);
      sfx.pick();
    } else if (key === "sfxVolume" && typeof value === "number") {
      setSfxVolume(value);
      if (value > 0) sfx.pick();
    } else if (key === "haptics" && value === true) {
      setHapticsEnabled(true);
      haptics.declare();
    }
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        safeStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패는 무시 (세션 내 설정은 유지) */
      }
      return next;
    });
  }

  // 연출은 큐에 쌓고 한 번에 하나씩 재생한다. 여러 알림이 한 틱에 몰려도 덮어써
  // 사라지거나(드롭) 다음 국까지 남지(잔류) 않고, 각자 제 시간만큼 뜬 뒤 다음으로 넘어간다.
  //
  // ⚠ 효과음은 여기서 내지 않는다 — **연출이 화면에 뜬 뒤 소리가 나는 순서가 의도**다
  // (유저 확정, 2026-07-22 53차). 지연을 줄이겠다고 enqueue 시점으로 앞당기면 소리가
  // 그림보다 먼저 나와 연출이 어긋난다. 재생은 activeProd 이펙트 한 곳에서만.
  function enqueueProduction(p: Omit<Production, "key">): void {
    const key = ++prodSeq.current;
    // 등급이 낮은 대기열은 앞질러 들어간다 — 같은 등급 뒤에는 그대로 붙으므로
    // 등급 안에서는 넣은 순서가 유지된다(등 떠밀기 → 리치처럼 짝지은 연출이 안 갈린다).
    insertByPriority(productionQueue.current, { ...p, key });
    // 📜 기록에도 같은 순간 남긴다 — 연출을 놓쳐도(건너뛰기·백그라운드 탭) 정보는 남는다.
    // 재생 시점이 아니라 **발생 시점**에 넣는 것이 중요하다: 큐가 밀리면 연출은 몇 초 뒤에
    // 뜨지만 사건은 이미 일어났고, 로그의 시각은 사건의 시각이어야 한다.
    setLogEvents((prev) => {
      const ev: LogEvent = {
        key,
        at: Date.now(),
        text: p.text,
        tone: p.tone,
        channel: p.channel,
        round: roundLabelRef.current,
        ...(p.sub !== undefined ? { sub: p.sub } : {}),
        ...(p.augId !== undefined ? { augId: p.augId } : {}),
      };
      const next = [...prev, ev];
      return next.length > LOG_MAX ? next.slice(next.length - LOG_MAX) : next;
    });
    setProdTick((t) => t + 1); // 펌프 재실행
  }

  function showBanner(
    text: string,
    tone: BannerTone,
    sub?: string,
    ms = 1500,
    sfxFn?: () => void,
    tiles?: TileKind[],
    impact?: ImpactSpec,
  ): void {
    enqueueProduction({
      channel: "banner",
      text,
      tone,
      ttl: ms,
      // 리치 배너는 톤만으로 등급이 정해진다 — 호출부가 따로 넘길 것이 없다
      ...(BANNER_PRIORITY[tone] !== undefined ? { priority: BANNER_PRIORITY[tone] } : {}),
      ...(sub !== undefined ? { sub } : {}),
      ...(sfxFn !== undefined ? { sfx: sfxFn } : {}),
      ...(tiles !== undefined && tiles.length > 0 ? { tiles } : {}),
      ...(impact !== undefined ? { impact } : {}),
    });
  }

  function showCutIn(
    text: string,
    tone: CutInTone,
    sub?: string,
    ms = 1300,
    opts: {
      tier?: LimitTier;
      sfx?: () => void;
      tiles?: TileKind[];
      tileArrowAt?: number;
      impact?: ImpactSpec;
      augId?: string;
      /** 큐를 앞질러 나가는 등급 (Production.priority) — 리치와 짝지은 컷인만 쓴다 */
      priority?: number;
    } = {},
  ): void {
    enqueueProduction({
      channel: "cutin",
      text,
      tone,
      ttl: ms,
      ...(opts.priority !== undefined ? { priority: opts.priority } : {}),
      ...(sub !== undefined ? { sub } : {}),
      ...(opts.tier !== undefined ? { tier: opts.tier } : {}),
      ...(opts.augId !== undefined ? { augId: opts.augId } : {}),
      ...(opts.sfx !== undefined ? { sfx: opts.sfx } : {}),
      ...(opts.tiles !== undefined && opts.tiles.length > 0 ? { tiles: opts.tiles } : {}),
      ...(opts.tileArrowAt !== undefined ? { tileArrowAt: opts.tileArrowAt } : {}),
      ...(opts.impact !== undefined ? { impact: opts.impact } : {}),
    });
  }

  /** 지금 아무 연출도 안 뜨는 상태에서 국 결과창을 예약한다 (큐가 다 빈 뒤 열림). */
  function scheduleRoundResult(msg: RoundOverMessage): void {
    pendingResult.current = msg;
    setProdTick((t) => t + 1); // 드레인 체크 재실행
  }

  // 펌프+드레인: 재생 중이 없을 때 큐에서 하나 꺼내 재생하고, 큐가 완전히 비면
  // 대기 중이던 국 결과창을 연다. shift는 setState 업데이터가 아닌 이펙트 안에서만
  // 일어나 StrictMode 이중호출에도 안전하다.
  useEffect(() => {
    if (activeProd !== null) return;
    if (productionQueue.current.length > 0) {
      const next = productionQueue.current.shift();
      // 뒤에 몇 개가 밀려 있는지는 **꺼내는 이 순간**에 정해진다 — 그 수만큼 체류를
      // 줄여 큐가 벽이 되지 않게 한다. ttl을 여기서 확정해 두면 CSS(`--prod-ttl`)와
      // 내리는 타이머가 같은 값을 본다(둘이 갈리면 연출이 끝나기 전에 사라진다).
      setActiveProd(
        next === undefined
          ? null
          : { ...next, ttl: backlogProdTtl(next.ttl, productionQueue.current.length) },
      );
      return;
    }
    if (pendingResult.current !== null) {
      setRoundResult(pendingResult.current);
      pendingResult.current = null;
    }
  }, [activeProd, prodTick]);

  /*
   * 도라 반짝임을 **한 박자로 맞춘다**.
   *
   * `dora-glow`·`dora-own-glow`·`dora-shine`은 전부 2.2초 한 주기로 같은 속도인데,
   * CSS 애니메이션은 그 요소에 클래스가 붙는 **그 순간부터** 돌기 시작한다. 손에 원래
   * 있던 도라, 방금 쯔모한 도라, 새 도라 표시패가 막 뒤집혀 도라가 된 패는 시작 시각이
   * 제각각이라 위상이 어긋나고, 나란히 놓고 보면 "패마다 반짝이는 속도가 다르다"로
   * 읽힌다(2026-08-17 사용자 보고). 주기가 같으니 **시작점만 하나로 모으면** 된다 —
   * 새로 생긴 애니메이션의 startTime을 문서 타임라인 원점(0)으로 옮겨 전부 같은 위상에
   * 세운다. 이미 0인 것은 건드리지 않으므로 도는 중인 패는 튀지 않는다.
   *
   * 뷰가 바뀔 때만 훑는다 — 도라가 새로 생기는 계기(쯔모·버림·깡·증강)는 전부 새 뷰로
   * 온다. `getAnimations`가 없는 환경에서는 조용히 넘어간다(연출만 예전대로 어긋난다).
   */
  useEffect(() => {
    if (typeof document.getAnimations !== "function") return;
    for (const anim of document.getAnimations()) {
      const name = (anim as { animationName?: unknown }).animationName;
      if (name !== "dora-glow" && name !== "dora-own-glow" && name !== "dora-shine") continue;
      if (anim.startTime === 0) continue;
      try {
        anim.startTime = 0;
      } catch {
        /* 아직 준비되지 않은 애니메이션 — 다음 뷰에서 다시 맞춘다 */
      }
    }
  }, [view]);

  /** 화면 흔들림 — game-root의 data-shake 속성만 토글, CSS가 .table을 흔든다.
   *  리렌더 없이 발동하고, 컷인·배너(형제 오버레이)는 흔들리지 않아 글자가 또렷하다. */
  function shakeTable(level: 1 | 2 | 3 | 4): void {
    const el = gameRootRef.current;
    if (el === null) return;
    el.removeAttribute("data-shake");
    void el.offsetWidth; // reflow — 같은 강도 연속 발동에도 keyframe 처음부터 재생
    el.setAttribute("data-shake", String(level));
    window.setTimeout(() => {
      if (el.getAttribute("data-shake") === String(level)) el.removeAttribute("data-shake");
    }, SHAKE_MS[level] ?? 300);
  }

  /**
   * 지금 연출을 즉시 내린다 (건너뛰기). 큐에 남은 것은 그대로 이어서 재생된다 —
   * 한 번 더 누르면 그것도 넘어간다. 큐째 버리지 않는 이유: 뒤에 오는 연출이
   * "무엇이 왜 일어났는가"의 유일한 통지인 경우가 있어서다. 놓쳐도 📜 로그에 남는다.
   */
  function skipProduction(): void {
    setActiveProd(null);
  }

  // 화면 효과를 끈 사람에게 파티클만 빼고 **기다림은 그대로** 물리는 건 말이 안 된다
  // ("효과 끄기"를 누른 이유가 대개 기다림이다). 밴드·글자는 남기되 체류를 절반 아래로 줄인다.
  const prodTtl = effectiveProdTtl(activeProd?.ttl ?? 0, settings.screenFx, settings.prodSpeed);

  // 현재 연출을 ttl 동안 띄우고, 뜨는 순간 효과음을(연출당 정확히 1회) 재생한 뒤 내린다.
  // 흔들림은 글자 슬램이 꽂히는 시점(임팩트)에 맞춰 지연 발동한다.
  //
  // ⏱ 체류 시간은 **화면에 실제로 그려진 뒤부터** 잰다 (rAF 두 번 = 첫 페인트 뒤).
  //   이펙트가 도는 시점부터 재면, 바로 뒤에 무거운 일이 한 번 끼는 순간 연출이 통째로
  //   사라진다 — 메인 스레드가 막힌 동안에는 브라우저가 그리지 못하는데 타이머만 흘러서,
  //   풀리자마자 ttl이 지난 채 지워진다. 화면에는 아무것도 안 뜬 것으로 보인다
  //   (2026-08-07 사용자 보고: 조커를 백 여러 장과 함께 켜면 발동 연출이 안 나온다 —
  //    원인이던 분해 폭발은 core에서 고쳤지만, 한 프레임만 밀려도 연출을 삼키는
  //    이 구조 자체가 남아 있었다).
  //
  //   백그라운드 탭에서는 rAF가 아예 오지 않으므로 짧은 타이머로 받쳐 준다 —
  //   안 그러면 큐가 그 자리에 멈춰 국 결과창까지 안 열린다.
  useEffect(() => {
    if (activeProd === null) return;
    const prod = activeProd;
    const timers: number[] = [];
    const rafs: number[] = [];
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      if (prodFiredKey.current !== prod.key) {
        prodFiredKey.current = prod.key; // HMR 재마운트 등 effect 재실행 시 이중 재생 방지
        prod.sfx?.();
      }
      const imp = prod.impact;
      if (imp !== undefined && settingsRef.current.screenFx) {
        const delay = imp.delayMs ?? (prod.channel === "banner" ? BANNER_IMPACT_MS : CUTIN_IMPACT_MS);
        timers.push(window.setTimeout(() => shakeTable(imp.shake), delay));
      }
      timers.push(
        window.setTimeout(
          () => setActiveProd(null),
          effectiveProdTtl(prod.ttl, settingsRef.current.screenFx, settingsRef.current.prodSpeed),
        ),
      );
    };
    rafs.push(window.requestAnimationFrame(() => rafs.push(window.requestAnimationFrame(start))));
    timers.push(window.setTimeout(start, PROD_PAINT_FALLBACK_MS));
    return () => {
      rafs.forEach((r) => window.cancelAnimationFrame(r));
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [activeProd]);

  // 건너뛰기 단축키 — Esc(관례)와 Space(가장 가까운 손). 연출 중에만 먹는다.
  // 입력 칸에 글자를 치는 중이면 가로채지 않는다.
  useEffect(() => {
    if (activeProd === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" && e.key !== " " && e.key !== "Spacebar") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      skipProduction();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeProd]);

  // 효과음 설정 → 마스터 게인 동기화 (호출부 무수정 뮤트)
  useEffect(() => {
    setSfxEnabled(settings.sfxOn);
    setSfxVolume(settings.sfxVolume);
    setHapticsEnabled(settings.haptics && hapticsSupported());
  }, [settings.sfxOn]);

  // 리치 BGM 볼륨 동기화 (효과음과 독립된 자체 볼륨)
  useEffect(() => {
    riichiBgm.setVolume(settings.riichiBgmVolume);
  }, [settings.riichiBgmVolume]);

  // 평상시 대국 BGM 볼륨 동기화
  useEffect(() => {
    bgm.setVolume(settings.bgmVolume);
  }, [settings.bgmVolume]);

  // 평상시 대국 BGM 수명 — 대국 화면에 있는 동안만 흐른다.
  // 최종 순위(rankings)가 뜨면 게임이 끝난 것이므로 멈춘다. 리치 중 덕킹은 sfx.ts가 맡는다.
  //
  // 방(joined)·관전(spectating)까지 함께 보는 것은 화면 라우팅의 `inGame`과 조건을
  // 정확히 맞추기 위해서다(그건 선언이 한참 뒤라 못 쓴다). 예전에는 `view`만 봐서,
  // 방을 뜬 뒤 뒤늦게 도착한 뷰 하나가 view를 되살리면 **홈 화면인 채로 BGM만**
  // 흘렀다 — 화면 어디에도 대국이 없으니 끌 방법이 없었다.
  const bgmShouldPlay = view !== null && rankings === null && (joined !== null || spectating !== null);
  useEffect(() => {
    if (bgmShouldPlay) bgm.start();
    else bgm.stop();
    return () => {
      bgm.stop();
    };
  }, [bgmShouldPlay]);

  // 리치 브금 선행 다운로드 — 대국에 들어와 있고 볼륨이 0이 아닐 때 한 번.
  // (평상시 BGM 이펙트와 섞지 않는다: 볼륨 슬라이더를 만질 때마다 bgm.stop()이 돌아
  //  평상시 BGM이 처음으로 되감기는 일이 없어야 한다.)
  useEffect(() => {
    if (bgmShouldPlay) riichiBgm.prepare();
  }, [bgmShouldPlay, settings.riichiBgmVolume]);

  /** 연출 큐·현재 연출·대기 결과를 모두 비운다 (리셋·관전 종료 시) */
  function clearProductions(): void {
    productionQueue.current = [];
    pendingResult.current = null;
    setActiveProd(null);
    // 기록도 여기서만 비운다 — 판이 끝나 방을 나가거나 관전을 접는 자리다.
    // 국이 바뀔 때는 비우지 않는다: 지난 국을 되짚는 것이 이 로그의 존재 이유다.
    setLogEvents([]);
    setRoundHistory([]);
    riichiBgm.stop(); // 리셋 시 리치 BGM도 확실히 정지
    riichiBgmArmed.current = false;
  }

  function showToast(text: string, tone: Toast["tone"] = "error", ms = 3200): void {
    const key = ++toastSeq.current;
    // 같은 문장이 연달아 오면 새로 쌓지 않는다 — 재연결 실패처럼 반복되는 통지가
    // 화면을 세 줄로 덮는 것을 막는다.
    setToasts((cur) =>
      cur[cur.length - 1]?.text === text ? cur : [...cur, { key, text, tone }].slice(-TOAST_MAX),
    );
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.key !== key)), ms);
  }

  /**
   * 서버로 보낸다. 소켓이 닫혀 있으면 **정책에 따라** 큐에 담거나 눈에 보이게 실패한다
   * (판정과 큐 규칙은 resendPolicy.ts). 실제로 전송했으면 true.
   *
   * 예전에는 닫혀 있으면 그냥 `return`이었다 — 누른 것이 아무 일도 일으키지 않고
   * 아무 말도 남기지 않았다. 재연결은 보통 1초 안에 끝나므로, 그 사이 누른 것이
   * 통째로 사라지는 것이 이 함수의 가장 흔한 실패였다.
   */
  function send(msg: ClientMessage): boolean {
    const ws = wsRef.current;
    if (ws !== null && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    if (!isResendable(msg.type)) {
      // 지금 이 순간에 대한 응답 — 늦게 도착하면 **다른 상황에 적용된다**. 버리고 알린다.
      // ping은 스스로 다시 오므로 조용히 버린다.
      if (msg.type !== "ping" && !sendFailNotified.current) {
        sendFailNotified.current = true;
        showToast("서버와 연결이 끊겼습니다 — 다시 연결되면 눌러 주세요");
      }
      return false;
    }
    pendingSends.current = enqueueSend(pendingSends.current, msg, Date.now());
    return false;
  }

  /** 다시 붙었다 — 큐에 남은 것을 담긴 순서대로 보낸다 (묵은 것은 resendPolicy가 걸러낸다). */
  function flushPendingSends(): void {
    const queued = pendingSends.current;
    pendingSends.current = [];
    const ws = wsRef.current;
    if (ws === null || ws.readyState !== WebSocket.OPEN) return;
    for (const msg of dueForResend(queued, Date.now())) {
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 자동화료·후로없음·자동버림 설정에 맞으면 프롬프트를 자동 처리한다(처리했으면 true).
   * 프롬프트 '도착' 시(handleServerMessage)와 설정 '토글' 시(아래 useEffect) 양쪽에서
   * 쓴다 — 론/후로 버튼이 이미 뜬 뒤 설정을 켜도 즉시 반영되도록.
   */
  function tryAutoRespond(p: PromptMessage["prompt"], auto: Settings): boolean {
    /*
     * **튜토리얼 중에는 자동응답을 걸지 않는다** (2026-08-18 실측으로 드러난 함정).
     *
     * 자동 화료·후로없음·자동버림은 저장되는 설정이다. 예전에 켜 둔 사람이 나중에
     * "튜토리얼"을 누르면, 코치가 "필요 없는 패를 눌러 버리세요"·"치·펑을 눌러
     * 보세요"·"론 버튼을 누르세요"라고 말하는 동안 **클라이언트가 먼저 답해 버린다.**
     * 배우러 온 사람에게 손을 대 볼 기회 자체가 안 오는 것이라, 튜토리얼의 절반이
     * 조용히 죽는다(실제로 이 브라우저에서 그렇게 됐다 — 첫 쯔모가 손에 닿기 전에
     * 나갔다).
     *
     * 설정 값을 건드리지 않고 **적용만 멈춘다** — 튜토리얼이 끝나면 원래 쓰던
     * 자동응답이 그대로 돌아온다. 사람의 설정을 몰래 바꿔 두는 것보다 낫다.
     */
    if (coachOnRef.current) return false;
    // 증강 테스트에서 봇 좌석을 조종하는 중이면 자동응답을 걸지 않는다 —
    // 그 좌석을 직접 두려고 들어간 것인데 자동 화료·쯔모기리가 대신 쳐 버리면 곤란하다.
    const sbx = sandboxRef.current;
    if (sbx !== null && p.player !== sbx.seat) return false;
    const opts = p.options;
    const seat = p.player;
    const win = opts.find((o) => o.type === "win");
    const pass = opts.find((o) => o.type === "pass");
    // 자동 화료 — 화료 가능하면 즉시 론·쯔모
    if (auto.autoWin && win !== undefined) {
      send({ type: "action", actionType: "win", payload: win.payload, seat });
      return true;
    }
    // 후로 없음 — 후로(치·펑·깡)만 있는 프롬프트를 즉시 패스
    if (auto.autoNoMeld && pass !== undefined && isCallOnlyPrompt(opts)) {
      send({ type: "action", actionType: "pass", payload: pass.payload, seat });
      return true;
    }
    // 자동 버림(쯔모기리) — 내 턴에 쯔모한 패를 자동으로 버린다.
    // ⚠ 화료 가능하면 **멈춘다**. 예전엔 여기서 곧바로 win을 보내, 자동화료를 꺼 둔
    //    사람이 자동버림만 켰는데도 멋대로 쯔모가 나갔다(2026-08-02 사용자 보고).
    //    화료를 자동으로 칠지는 자동화료 설정만이 정한다 — 그건 위에서 이미 봤다.
    const drawn = prevViewRef.current?.round.myDrawnTile ?? null;
    if (auto.autoDiscard && drawn !== null) {
      if (win !== undefined) return false;
      const disc = opts.find(
        (o) =>
          (o.type === "discard" || o.type === "free_discard") &&
          (o.payload as { tileId?: unknown })?.tileId === drawn,
      );
      if (disc !== undefined) {
        sfx.discard();
        haptics.discard();
        rememberOwnDiscard(disc.payload);
        send({ type: "action", actionType: disc.type, payload: disc.payload, seat });
        return true;
      }
    }
    return false;
  }

  /** 접속 (마운트 시 자동). 저장된 세션 토큰이 있으면 자동 로그인. */
  function connect(): void {
    // 예약된 재연결이 있으면 취소하고 즉시 붙는다 (수동 재시도·타이머 중복 방지)
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // 이미 연결 중/연결됨이면 새 소켓을 만들지 않는다
    const existing = wsRef.current;
    if (existing !== null && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return;
    }
    intentionalCloseRef.current = false;
    const url = serverUrlToUse();
    setConnection((c) => (c === "reconnecting" ? "reconnecting" : "connecting"));
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener("open", () => {
      setConnection("connected");
      reconnectAttemptsRef.current = 0;
      const token = safeStorage.getItem(SESSION_KEY);
      // 토큰은 **그걸 발급한 서버에만** 되돌려 보낸다.
      //
      // 고급 설정의 서버 주소는 사람이 붙여넣는 값이다 — "이 주소로 바꾸면 더
      // 빨라요" 한 마디에 바뀔 수 있는 자리에서 저장된 세션 토큰을 자동으로
      // 흘려보내면, 그 순간 계정이 통째로 넘어간다. 발급처가 다르면 어차피 그
      // 서버에서 쓸 수 없는 값이므로, 보내지 않아도 잃는 기능이 없다.
      const issuer = safeStorage.getItem(SESSION_SERVER_KEY);
      const relogin = token !== null && token !== "" && issuer === url;
      if (relogin) {
        send({ type: "tokenLogin", sessionToken: token });
      }
      // 계정이 없는 사람이 체험 판을 두다 끊겼다면 그 판으로 돌려보낸다 (§2-5).
      // 계정 로그인이 우선이다 — 둘 다 있으면 계정이 이긴다(체험 토큰은 어차피
      // 그 판이 끝나면 죽고, 계정 쪽에 잃을 것이 훨씬 많다).
      const guestToken = relogin ? null : safeStorage.getItem(GUEST_TOKEN_KEY);
      const guestResuming = guestToken !== null && guestToken !== "";
      if (guestResuming) {
        send({ type: "guestResume", token: guestToken });
      }
      sendFailNotified.current = false; // 다음 끊김에는 다시 알린다
      /*
       * 밀린 것을 언제 보내나 — **인증이 끝난 뒤**다. 큐에는 방 입장처럼 로그인해야
       * 통하는 요청이 들어 있는데, 토큰 로그인의 응답(authOk)보다 먼저 보내면
       * 서버가 미인증으로 거절한다. 토큰이 없으면 기다릴 것이 없으니 지금 보낸다
       * (그때 큐에 있을 수 있는 것은 로그인·가입·게스트 체험처럼 인증 전 메시지다).
       */
      if (!relogin && !guestResuming) flushPendingSends();
      startHeartbeat(ws);
    });
    ws.addEventListener("message", (event) => {
      // 파싱 실패를 잡는다 — 서버가 정상이면 오지 않는 프레임이지만, 중간 프록시나
      // 확장 프로그램이 끼어들면 여기서 예외가 나고 그 뒤 처리가 통째로 멈춘다.
      // 한 프레임을 버리고 다음 프레임을 계속 받는 편이 낫다 (감사 2026-08-12 §L-7).
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        console.warn("서버 메시지를 해석하지 못했습니다 — 이 프레임은 버립니다");
        return;
      }
      handleServerMessage(msg);
    });
    ws.addEventListener("close", () => {
      /*
       * **지금 쓰는 소켓이 아니면 아무 것도 하지 않는다.**
       *
       * 소켓 둘이 잠깐 겹치는 순간이 실제로 있다 — 개발 모드의 StrictMode 이중 마운트가
       * 대표적이다(마운트 → 정리 → 재마운트로 A를 닫는 사이 B가 열린다). 그때 뒤늦게
       * 도착한 A의 close가 이 자리에서 `wsRef.current = null`을 해 버리면, **살아 있는
       * B의 참조가 지워진다.** send()는 wsRef가 null이면 조용히 버리므로(2297행) 그때부터
       * 누른 것이 아무 일도 일으키지 않고, 게다가 재연결까지 예약해 소켓이 하나 더 늘었다.
       * 그 새 소켓은 로그인을 안 한 채라 서버의 미인증 회수(UNAUTH_TIMEOUT_MS)에 30초마다
       * 끊기고, 끊길 때마다 같은 일이 반복돼 **30초 주기의 무한 순환**이 된다
       * (2026-08-07 확인: 서버 로그에 30초 간격 열림/닫힘, `동시 2`).
       */
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      stopHeartbeat();
      if (intentionalCloseRef.current) {
        setConnection("closed");
        return;
      }
      scheduleReconnect(); // 예기치 않은 끊김 → 자동 재연결
    });
  }

  /*
   * ── 연결 생존 확인 (감사 2026-08-17 §2-3) ──
   *
   * 프로토콜에 ping/pong이 있고 서버도 답하는데, **클라이언트는 한 번도 보내지
   * 않았다.** 그래서 모바일 NAT 만료·경로 단절처럼 TCP가 조용히 죽는 경우
   * `close` 이벤트가 오지 않고, 화면은 `connected`인 채로 허공에 액션을 쐈다.
   * 복구는 서버 하트비트(30초 주기, 최대 60초)가 끊어 줄 때까지 기다려야 했고,
   * 그동안 내 차례는 5초 유예로 자동 진행됐다. "눌렀는데 아무 일도 안 일어남"의
   * 정체가 이것이다.
   *
   * 답이 없으면 **우리가 먼저 끊는다** — 그러면 기존 재연결 경로(지수 백오프)가
   * 그대로 이어받는다. 새 길을 내지 않는 게 요점이다.
   */
  function stopHeartbeat(): void {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    pingSentAtRef.current = null;
  }

  function startHeartbeat(ws: WebSocket): void {
    stopHeartbeat();
    heartbeatTimerRef.current = window.setInterval(() => {
      if (wsRef.current !== ws || ws.readyState !== WebSocket.OPEN) return;
      const sentAt = pingSentAtRef.current;
      if (sentAt !== null && Date.now() - sentAt > HEARTBEAT_TIMEOUT_MS) {
        // 앞선 ping이 끝내 답을 못 받았다 = 이 소켓은 죽었다.
        console.warn("[ws] 하트비트 응답 없음 — 연결을 끊고 다시 붙습니다");
        pingSentAtRef.current = null;
        ws.close();
        return;
      }
      if (sentAt === null) {
        pingSentAtRef.current = Date.now();
        // 큐를 태우지 않는다 — 재전송 정책상 ping은 "스스로 다시 오는" 메시지다.
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** 지수 백오프로 재연결을 예약한다 (무한 재시도, 최대 10초 간격). */
  function scheduleReconnect(): void {
    const attempt = reconnectAttemptsRef.current;
    reconnectAttemptsRef.current = attempt + 1;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    setConnection("reconnecting");
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }

  // 이미 떠 있는 프롬프트에 자동화료·후로없음·자동버림 설정을 소급 적용한다.
  // (설정을 프롬프트가 뜬 '뒤' 켜도 즉시 반영 — 론/후로 버튼 표시 후 토글 대응)
  useEffect(() => {
    if (prompt !== null && tryAutoRespond(prompt, settings)) dropPrompt(prompt.player);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, prompt]);

  /*
   * 잠금 통보 프롬프트 — 잠깐 보여 준 뒤 스스로 패스한다.
   *
   * 타이머를 매번 전부 걷고 다시 건다. 의존성이 바뀌는 때는 프롬프트 메시지가
   * 도착했을 때뿐이라 낭비가 없고, "취소된 프롬프트의 타이머가 살아남아 다음
   * 프롬프트에 패스를 쏘는" 사고가 구조적으로 불가능해진다.
   *
   * 봇 좌석을 조종하는 증강 테스트에서도 그 좌석의 통보는 같은 규칙으로 넘어간다 —
   * 어차피 고를 것이 없는 프롬프트다.
   */
  useEffect(() => {
    const timers: number[] = [];
    for (const [seat, p] of Object.entries(prompts)) {
      if (!isLockNoticeOnly(p)) continue;
      const pass = p.options.find((o) => o.type === "pass");
      if (pass === undefined) continue;
      timers.push(
        window.setTimeout(() => {
          send({ type: "action", actionType: "pass", payload: pass.payload, seat });
          dropPrompt(seat);
        }, LOCK_NOTICE_MS),
      );
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, promptSeq]);

  // 마운트 시 1회 자동 접속
  useEffect(() => {
    connect();
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 게임/방 관련 로컬 상태만 초기화 (연결·로그인은 유지) */
  function resetGameState(): void {
    setJoined(null);
    setLobby(null);
    prevLobby.current = null;
    abortVoteNoticed.current = false;
    setSandbox(null);
    setControlling(null);
    setView(null);
    setCenterView(null);
    setPrompts({});
    setDraft(null);
    setDraftPicked(false);
    draftPickedRef.current = false;
    setRankings(null);
    setCanContinue(false);
    setRoundResult(null);
    setAbortVote(null);
    setSpectating(null);
    clearProductions();
    setScoreFx({});
    prevViewRef.current = null;
    resetFxSeen(); // 판이 바뀌면 컷인 중복 기억도 비운다
    introShown.current = false;
    activeRoomRef.current = null;
    activeSpectateRef.current = null;
    inRoomRef.current = false;
    bannerShown.current = {
        roundKey: "",
        riichi: new Set(),
        melds: {},
        kanAdded: new Set(),
        sealed: 0,
        spyCaught: new Set(),
        rankGate: new Set(),
        stealthBroken: new Set(),
        voidKan: new Set(),
        augEvents: new Set(),
      };
  }

  /**
   * 이어하기 — 방을 나가지 않고 그대로 대기실로 돌아간다.
   *
   * 서버는 종국과 함께 방을 대기실 상태로 되돌려 두므로, 여기서는 게임 화면만 걷어내면
   * 대기실(inWaiting)이 그대로 열린다 — 다음 판은 평소처럼 전원 준비 + 방장 시작이다.
   * 증강 테스트 방은 대기실이 없으므로(관리자 1명 + 봇 3명) 곧바로 새 판을 시작한다:
   * 지금 지정된 증강·손패 설정을 그대로 넘겨, 종국이 곧 '판 초기화'가 되게 한다.
   */
  function continueInRoom(): void {
    setRankings(null);
    setCanContinue(false);
    setRoundResult(null);
    setPrompts({});
    setView(null);
    setCenterView(null);
    clearProductions();
    setScoreFx({});
    prevViewRef.current = null;
    resetFxSeen(); // 판이 바뀌면 컷인 중복 기억도 비운다
    introShown.current = false;
    bannerShown.current = {
      roundKey: "",
      riichi: new Set(),
      melds: {},
      kanAdded: new Set(),
      sealed: 0,
      spyCaught: new Set(),
      rankGate: new Set(),
      stealthBroken: new Set(),
      voidKan: new Set(),
      augEvents: new Set(),
    };
    if (sandbox !== null) {
      send({
        type: "sandboxReset",
        augments: sandbox.augments,
        hands: sandbox.hands,
        mode: sandbox.mode,
      });
    }
  }

  /**
   * 홈으로 — 게임 상태를 정리하고 홈 데이터(통계·리플레이)를 새로 고친다.
   *
   * ⚠ 방에 앉아 있었다면 **반드시** leaveRoom을 보낸다. 예전에는 `view === null`
   * (대기실)일 때만 보냈는데, 종국 결과 화면에서 홈으로 나가면 view가 아직 살아 있어
   * 서버에는 내 좌석이 그대로 남았다. 종국 뒤 방이 대기실로 되돌아오게 바뀌면서
   * 그 좌석이 유령이 되어 — 방장 화면에는 접속하지도 않은 사람이 앉아 있고, 나는
   * "이미 방에 참가 중입니다"로 새 방을 만들지 못했다(새로고침해야 풀렸다).
   * 게임 중 나가기도 마찬가지로 알려야 서버가 그 자리를 자동 진행으로 넘긴다.
   */
  function returnHome(): void {
    if (joined !== null) send({ type: "leaveRoom" });
    if (spectating !== null) send({ type: "spectateStop" });
    resetGameState();
    setReplayData(null);
    refreshHome();
  }

  function refreshHome(): void {
    // 게스트에게는 전부 막힌 요청이다 — 보내면 거절 토스트만 네 번 뜬다.
    if (guestRef.current) return;
    send({ type: "statsRequest" });
    send({ type: "replayList" });
    send({ type: "leaderboard" });
    send({ type: "feedbackList" });
  }

  /**
   * @param nextTab 로그인 화면을 어느 탭으로 열 것인가. 체험을 마치고 "계정 만들고
   *   계속하기"로 나가는 사람에게는 가입 탭을 보여 준다 — 그게 그 사람이 방금 누른
   *   버튼의 뜻이다.
   */
  /**
   * 증강 종수 — 카탈로그가 왔으면 그걸 세고, 아직이면 serverInfo가 알려 준 값을 쓴다.
   *
   * serverInfo는 **인증 전에** 오므로 랜딩에서 규칙을 펼친 사람에게도 올바른 숫자가
   * 보인다. 클라이언트가 직접 세지 않는 이유는 helpAugmentSections 위 주석 참고.
   */
  const augmentKinds = Object.keys(catalog).length > 0
    ? Object.keys(catalog).length
    : (serverInfo?.augmentKinds ?? 0);

  /** 정형구 보내기 — 목록에 있는 id만 서버가 받는다(검증은 서버 몫). */
  function sendEmote(id: string): void {
    send({ type: "emote", id });
  }

  function logout(nextTab: "login" | "register" = "login"): void {
    setAuthTab(nextTab);
    send({ type: "logout" });
    authedRef.current = false;
    guestRef.current = false;
    setAuthError(null);
    setHelpOpen(false);
    safeStorage.removeItem(SESSION_KEY);
    safeStorage.removeItem(SESSION_SERVER_KEY);
    safeStorage.removeItem(LAST_ROOM_KEY);
    // 체험을 끝내고 나가는 길(가입하러 가기 포함)도 여기를 지난다 — 열쇠를
    // 남겨 두면 다음 접속에서 이미 접힌 판으로 끌려간다.
    safeStorage.removeItem(GUEST_TOKEN_KEY);
    setAuth(null);
    resetGameState();
    setReplayData(null);
    setStats(null);
    setMyReplays(null);
    setLeaderboard(null);
    setAdminUsers(null);
    setFeedback(null);
  }

  function handleServerMessage(msg: ServerMessage): void {
    /*
     * 방을 뜬 뒤에 도착한 **게임 스트림**은 버린다.
     *
     * 나가기(leaveRoom)를 보낸 직후에도 이미 날아오던 뷰·연출이 몇 개 더 도착한다.
     * 그걸 그대로 받으면 `view`가 다시 채워지는데, 화면 라우팅은 `joined`도 함께
     * 보므로 **홈/로비 화면인 채로** 대국 BGM(`bgmShouldPlay = view !== null`)과
     * 컷인 효과음만 되살아난다 — 어디서 나는지 알 수 없는 소리가 계속 흐른다.
     * (판이 무효로 접히기까지의 짧은 틈에도 이 창이 열린다.)
     *
     * 판정은 반드시 live ref로 한다 — 이 콜백은 소켓에 고정된 클로저라 state는 낡는다.
     */
    if (GAME_STREAM_MESSAGES.has(msg.type) && !inRoomRef.current && activeSpectateRef.current === null) {
      return;
    }
    if (msg.type === "serverInfo") {
      setServerInfo(msg);
      return;
    }
    if (msg.type === "authOk") {
      setAuthError(null);
      authedRef.current = true;
      // 이제 판에 들어갈 것이 확실하다 — 타일 38장을 여기서 미리 받는다 (§7-12).
      // 예전에는 모듈 최상위에서 즉시 받아, 로그인 화면만 보고 나가는 사람까지
      // 그 비용을 냈다.
      preloadTileImages();
      // 인증이 끝났다 — 끊긴 동안 밀렸던 요청을 이제 보낸다 (SEND_RESEND_POLICY ②).
      // 아래 자동 복귀(joinRoom·statsRequest…)보다 **먼저** 보내, 사용자가 실제로
      // 누른 것이 자동 복구보다 뒤로 밀리지 않게 한다.
      flushPendingSends();
      guestRef.current = msg.guest === true;
      const guest = msg.guest === true;
      // 게스트에게는 저장할 세션이 없다 — 토큰이 빈 문자열이라 저장하면 다음 접속에
      // 빈 tokenLogin을 보내고 TOKEN_INVALID로 로그인 화면이 한 번 깜빡인다.
      if (!guest) {
        safeStorage.setItem(SESSION_KEY, msg.sessionToken);
        // 발급처를 함께 남긴다 — 다음 접속 때 같은 서버에만 되돌려 보내기 위함.
        safeStorage.setItem(SESSION_SERVER_KEY, serverUrlToUse());
        // 계정으로 들어왔으니 체험 열쇠는 버린다 — 안 그러면 로그아웃한 뒤
        // 다음 접속에서 남의(자기 옛) 체험 판으로 끌려간다.
        safeStorage.removeItem(GUEST_TOKEN_KEY);
      } else if (typeof msg.guestToken === "string" && msg.guestToken !== "") {
        // 끊겨도 이 판으로 돌아올 수 있게 열쇠를 보관한다 (감사 §2-5).
        safeStorage.setItem(GUEST_TOKEN_KEY, msg.guestToken);
      }
      setAuth({ username: msg.username, isAdmin: msg.isAdmin, guest });
      if (guest) {
        // 홈·통계·리플레이·제보는 게스트에게 전부 막혀 있다(서버 화이트리스트) —
        // 요청하면 거절 토스트만 4개 뜬다. 아예 보내지 않는다.
        return;
      }
      /*
       * 초대 링크로 들어온 사람은 그 방으로 바로 넣는다 (감사 §3-5).
       *
       * 재연결 복귀(activeRoomRef)보다 **먼저** 본다 — 링크는 방금 사람이 누른
       * 의도이고, 복귀는 이전 상태다. 둘이 다르면 방금 누른 쪽이 이긴다.
       * 코드는 한 번 쓰고 주소창에서 지운다: 남겨 두면 새로고침할 때마다 그 방으로
       * 끌려가고, 그 방이 사라진 뒤에는 매번 실패 토스트만 본다.
       */
      /*
       * **갓 가입한 사람은 홈이 아니라 판으로 보낸다** (2026-08-18 사용자 지시).
       *
       * 가입 직후의 홈은 "방 만들기 / 코드로 참가"다. 마작을 처음 보는 사람에게 그
       * 둘은 아무 뜻이 없고, 방을 만들어도 봇을 채우고 시작을 눌러야 한다 — 배우기
       * 전에 세 단계가 있다. 대신 봇 3명과의 연습 대국을 곧바로 열고, 그 판 위에
       * 코치를 얹는다(`tutorial.ts`). 기록에 남지 않는 판이라 첫 성적이 망가지지도
       * 않는다.
       *
       * 초대 링크보다 뒤에 두지 않는다 — 방금 가입한 사람의 다음 화면은 하나뿐이라
       * 초대·복귀와 겹칠 수가 없다(둘 다 있으면 아래 분기가 그대로 이긴다).
       */
      const invited = pendingInviteRef.current;
      if (
        justRegistered.current &&
        invited === null &&
        activeRoomRef.current === null &&
        !tutorialDone.current
      ) {
        justRegistered.current = false;
        setCoachOn(true);
        send({ type: "practicePlay", tutorial: true });
      } else if (invited !== null) {
        pendingInviteRef.current = null;
        clearRoomFromUrl();
        send({ type: "joinRoom", code: invited });
      } else if (activeRoomRef.current !== null) {
        // 재연결 복귀 — 끊기기 전 참가/관전 중이던 방으로 자동 재입장한다.
        // (신원 기준 재접속: 서버가 좌석의 소켓을 교체하고 뷰를 즉시 복원)
        send({ type: "joinRoom", code: activeRoomRef.current });
      } else if (activeSpectateRef.current !== null) {
        send({ type: "spectate", code: activeSpectateRef.current });
      }
      send({ type: "statsRequest" });
      send({ type: "replayList" });
      send({ type: "leaderboard" });
      send({ type: "feedbackList" });
      if (msg.isAdmin) {
        send({ type: "liveGames" });
        send({ type: "adminUsers" });
        send({ type: "adminAugmentTiers" });
      }
      return;
    }
    if (msg.type === "error") {
      // 주의: 이 콜백은 마운트 시 소켓에 고정된 클로저라 state 값(view/auth 등)은
      // 스테일하다. 판단은 반드시 live ref(activeRoomRef 등)나 setter로만 한다.
      if (msg.code === "TOKEN_INVALID") {
        // 세션 만료(자동 로그인/재연결 실패) — 로그인 화면으로 정리
        safeStorage.removeItem(SESSION_KEY);
        activeRoomRef.current = null;
        activeSpectateRef.current = null;
        authedRef.current = false;
        guestRef.current = false;
        setAuth(null);
        resetGameState();
        return;
      }
      if (msg.code === "GUEST_SESSION_GONE") {
        // 열쇠가 가리키던 체험 판이 이미 끝났다(또는 보유 시한이 지났다).
        // 조용히 버리고 첫 화면 그대로 둔다 — 이 사람은 방금 사이트를 다시 열었을
        // 뿐이고, 그 앞에 놓아야 할 것은 오류 문구가 아니라 "체험 시작" 버튼이다.
        safeStorage.removeItem(GUEST_TOKEN_KEY);
        flushPendingSends();
        return;
      }
      // 로그인·가입 실패는 **폼 안에** 남긴다. 3.2초짜리 토스트로 스쳐 보내면
      // "비밀번호에 닉네임을 포함할 수 없습니다" 같은 정정 가능한 사유를 읽기도 전에
      // 사라져, 방문자는 같은 실수를 반복하다 떠난다.
      if (!authedRef.current) {
        setAuthError(msg.message);
        return;
      }
      // 재연결 후 자동 재입장했는데 그 방이 사라졌거나(게임이 오프라인 중 종료 등)
      // 방장이 나를 내보냈으면 조용히 홈으로 돌아간다.
      // activeRoomRef가 살아 있으면 = 자동 재입장 시도였다.
      if (
        (msg.code === "ROOM_NOT_FOUND" || msg.code === "ROOM_PLAYING" || msg.code === "KICKED") &&
        activeRoomRef.current !== null
      ) {
        activeRoomRef.current = null;
        /*
         * 서버가 왜 거절했는지를 그대로 전한다.
         *
         * 예전에는 세 경우를 뭉뚱그려 "진행 중이던 게임이 **종료**되었습니다"라고
         * 했는데, `ROOM_PLAYING`은 대개 게임이 **아직 돌고 있다**는 뜻이다
         * (감사 §2-2). 끊겨서 자리를 잃은 사람이 "끝났구나" 하고 물러나게 만드는
         * 문장이었다 — 지금은 끊긴 좌석이면 다시 들어갈 수 있으므로 더더욱
         * 사실대로 말해야 한다.
         */
        showToast(
          msg.code === "KICKED"
            ? "방장이 방에서 내보냈습니다"
            : msg.code === "ROOM_NOT_FOUND"
              ? "그 방은 이미 사라졌습니다"
              : msg.message,
          "info",
        );
        resetGameState();
        refreshHome();
        return;
      }
      // 게임이 서버에서 크래시 종료 — 마지막 화면에서 멈추지 않고 홈으로 정리
      if (msg.code === "GAME_CRASHED") {
        showToast(msg.message);
        resetGameState();
        refreshHome();
        return;
      }
      showToast(msg.message);
      return;
    }
    if (msg.type === "roomCreated") {
      // 게스트 방은 재접속할 수 없다 — 기억해 두면 홈에 죽은 방의 "재접속"이 남는다.
      if (guestRef.current) return;
      safeStorage.setItem(LAST_ROOM_KEY, msg.code);
      return; // 이어서 joined·lobby가 온다
    }
    if (msg.type === "replayList") {
      setMyReplays(msg.games);
      return;
    }
    if (msg.type === "replayData") {
      setReplayData(msg);
      return;
    }
    if (msg.type === "liveGames") {
      setLiveRooms(msg.rooms);
      return;
    }
    if (msg.type === "leaderboard") {
      setLeaderboard(msg.entries);
      return;
    }
    if (msg.type === "adminUsers") {
      setAdminUsers(msg.users);
      return;
    }
    if (msg.type === "feedbackList") {
      setFeedback(msg.entries);
      return;
    }
    if (msg.type === "adminAugmentTiers") {
      setAugmentTiers(msg);
      return;
    }
    if (msg.type === "spectateStarted") {
      setSpectating(msg.code);
      activeSpectateRef.current = msg.code; // 재연결 시 관전 자동 복귀 대상
      introShown.current = true; // 관전은 개막 연출 생략
      resumeAudio(); // 관전은 이후 클릭이 없어 오디오가 잠들 수 있다 — 여기서 깨워 효과음·BGM 보장
      return;
    }
    if (msg.type === "spectateEnded") {
      showToast(`관전 종료 — ${msg.reason}`, "info");
      activeSpectateRef.current = null;
      // gameOver 모달이 떠 있으면 그대로 두고, 뷰·연출만 정리한다
      setSpectating(null);
      setView(null);
      setCenterView(null);
      clearProductions();
      prevViewRef.current = null;
      resetFxSeen(); // 판이 바뀌면 컷인 중복 기억도 비운다
      return;
    }
    if (msg.type === "actionFx") {
      const augId = ACTION_AUGMENT[msg.actionType] ?? msg.actionType;
      // 전용 사건 컷인이 있는 증강은 그쪽이 결과까지 보여준다 — 여기서 또 띄우면
      // 한 번 발동에 컷인이 두 번 뜬다(2026-08-01 사용자 보고: 소환·무르기 연출 문제).
      if (AUG_EVENT_AUG_IDS.has(augId)) return;
      // 액티브 증강 발동 연출 — **증강 이름**을 먼저 쓴다.
      //
      // 예전에는 액션 라벨이 우선이라, 화면 한가운데 큰 배너에 "미래 보기"가 뜨는데
      // 이름표·도감·모달은 전부 "미래를 보는 자"였다. 플레이어가 아는 이름은 증강
      // 이름 하나뿐이다 — 라벨은 버튼용 축약이므로 폴백으로만 둔다(2026-08-08 QA).
      const label = augActionName(catalogRef.current, msg.actionType);
      const pv = prevViewRef.current;
      // 같은 순에 같은 사람이 같은 액션을 또 보내면(왕패의 주인 2장 교환 = dw_swap 2개)
      // 컷인은 **한 번만** 띄운다 — 사용자에게는 발동 한 번이다.
      if (pv !== null) {
        const r = pv.round;
        const turn = `${r.prevalentWind}:${r.roundNumber}:${r.honba}:${r.turnCount}`;
        const seen = fxSeenRef.current;
        if (seen.turn !== turn) fxSeenRef.current = { turn, keys: new Set() };
        const key = `${msg.player}:${msg.actionType}`;
        if (fxSeenRef.current.keys.has(key)) return;
        fxSeenRef.current.keys.add(key);
      }
      const who = pv !== null ? playerNameById(pv, msg.player) : msg.player;
      // 증강 발동은 후로(타악)와 계열이 다른 "번개 스침" 사운드 — 소리만으로 구분된다
      showCutIn(label, "augment", `${who} — 증강 발동`, 1600, {
        sfx: () => sfx.augment(0),
        augId,
      });
      return;
    }
    if (msg.type === "emoteFrom") {
      const key = Date.now() + Math.random();
      setEmotes((prev) => [...prev, { key, nickname: msg.nickname, id: msg.id }].slice(-EMOTE_FEED_MAX));
      window.setTimeout(() => {
        setEmotes((prev) => prev.filter((e) => e.key !== key));
      }, EMOTE_SHOW_MS);
      return;
    }
    if (msg.type === "pong") {
      // 살아 있다는 증거. 이걸 안 지우면 다음 회차가 "답이 없다"로 판정해 **멀쩡한
      // 연결을 스스로 끊는다** — 브라우저 실측에서 정확히 그 일이 났다(20초마다
      // 끊김/재접속 반복, 서버 로그에 그대로 남았다). 하트비트를 넣는다는 것은
      // 곧 그 답을 처리한다는 뜻이다.
      pingSentAtRef.current = null;
      return;
    }
    if (msg.type === "joined") {
      setJoined(msg);
      inRoomRef.current = true;
      /*
       * 방에 (다시) 들어왔다 = **지금 화면에 떠 있는 선택지는 전부 낡았다.**
       *
       * 내 차례에 끊기면 서버는 5초 뒤 대신 진행하고 `promptCancel`을 보내는데,
       * 그 프레임은 이미 죽은 소켓으로 나가 사라진다. 재접속하면 서버는 뷰를
       * 복원하고 **지금 실제로 기다리는 것만** 다시 보낸다 — 그런데 예전에는
       * 클라가 옛 프롬프트를 지우지 않아, 이미 지나간 선택 UI가 그대로 떠 있었다.
       * 누르면 서버가 "지금 고를 수 있는 선택지가 아닙니다 — 화면을 새로 받아
       * 주세요"를 돌려주는데, **화면을 새로 받는 방법이 프로토콜에 없다.**
       * 탈출구는 새로고침뿐이었고 안내는 그 말을 하지 않았다 (감사 §2-4).
       *
       * 지우는 편이 항상 안전하다: 서버가 정말 기다리는 중이면 곧바로 다시 보낸다.
       */
      setPrompts({});
      setDraft(null);
      setDraftPicked(false);
      draftPickedRef.current = false;
      // 게스트는 재접속할 수단이 없다(세션 토큰도 joinRoom 권한도 없다) — 재연결
      // 자동 재입장 대상으로 기억하면 붙자마자 거절 토스트만 뜬다.
      activeRoomRef.current = guestRef.current ? null : msg.roomId; // 재연결 시 자동 재입장 대상
      safeStorage.setItem(LAST_ROOM_KEY, msg.roomId);
      return;
    }
    if (msg.type === "catalog") {
      const map: Record<string, AugmentCatalogEntry> = {};
      for (const a of msg.augments) map[a.id] = a;
      rememberCategories(msg.augments); // 계열 전역 룩업(컷인·pill·드래프트 카드)
      setCatalog(map);
      return;
    }
    if (msg.type === "sandbox") {
      // 증강 테스트 판이 시작/재시작됐다 — 지난 판의 잔상(프롬프트·결과·순위·연출)을
      // 모두 걷어내고 곧 도착할 새 뷰를 받을 준비를 한다.
      setSandbox(msg);
      setControlling(null);
      setPrompts({});
      setDraft(null);
      setDraftPicked(false);
      draftPickedRef.current = false;
      setRoundResult(null);
      pendingResult.current = null;
      setRankings(null);
      setAbortVote(null);
      setRiichiMode(false);
      clearProductions();
      setScoreFx({});
      riichiBgm.stop();
      riichiBgmArmed.current = false;
      prevViewRef.current = null;
      resetFxSeen(); // 판이 바뀌면 컷인 중복 기억도 비운다
      setCenterView(null); // 지난 판의 국 스냅샷이 새 판 첫 뷰까지 남지 않게
      roundContinueSent.current = false;
      // 재시작마다 개막 연출을 다시 트는 것은 방해만 되므로 건너뛴다
      introShown.current = true;
      setIntro(false);
      bannerShown.current = {
        roundKey: "",
        riichi: new Set(),
        melds: {},
        kanAdded: new Set(),
        sealed: 0,
        spyCaught: new Set(),
        rankGate: new Set(),
        stealthBroken: new Set(),
        voidKan: new Set(),
        augEvents: new Set(),
      };
      return;
    }
    if (msg.type === "sandboxConfig") {
      // 판은 그대로이고 설정만 바뀌었다 — 프롬프트·결과 화면을 건드리지 않는다.
      setSandbox((prev) =>
        prev === null ? prev : { ...prev, botRules: msg.botRules, control: msg.control },
      );
      setControlling(msg.controlling);
      return;
    }
    if (msg.type === "lobby") {
      // 방장이 바꾼 설정은 값만 조용히 갈렸다 — 동풍전으로 준비를 눌렀는데 반장전으로
      // 시작하거나, 친이던 내 자리가 자리 섞기로 바뀐 것을 모른 채 판이 열렸다.
      // (handleServerMessage는 마운트 시 고정된 클로저라 state가 아니라 ref로 비교한다.)
      const prev = prevLobby.current;
      prevLobby.current = msg;
      if (prev !== null && prev.roomId === msg.roomId) {
        if (prev.gameMode !== msg.gameMode) {
          showToast(`판 길이가 ${MODE_BADGE[msg.gameMode]?.name ?? msg.gameMode}으로 바뀌었습니다`, "info");
        }
        if (prev.botDifficulty !== msg.botDifficulty) {
          showToast(`봇 난이도: ${BOT_DIFFICULTY_LABEL[msg.botDifficulty] ?? msg.botDifficulty}`, "info");
        }
        const seatOf = (m: LobbyMessage): number | null =>
          m.players.find((p) => p.playerId === m.youId)?.seat ?? null;
        const before = seatOf(prev);
        const after = seatOf(msg);
        if (before !== null && after !== null && before !== after) {
          showToast(`자리를 다시 뽑았습니다 — 당신은 ${WIND_KO[after] ?? "?"}가입니다`, "info");
        }
        if (prev.hostId !== msg.hostId && msg.hostId === msg.youId) {
          showToast("당신이 방장이 되었습니다", "info");
        }
      }
      setLobby(msg);
      return;
    }
    if (msg.type === "stats") {
      setStats(msg);
      return;
    }
    if (msg.type === "view") {
      // 첫 뷰 = 게임 테이블 입장 — 개막 연출 후 드래프트가 뜬다
      if (!introShown.current) {
        introShown.current = true;
        setIntro(true);
        sfx.round();
        window.setTimeout(() => setIntro(false), 2100);
      }
      // 드래프트를 이미 고른 뒤 새 뷰가 오면 = 전원 선택이 끝나 게임이 재개된
      // 것이다. 자기 차례가 아닌(=prompt가 안 오는) 플레이어의 증강 선택창이
      // 계속 떠 있던 버그를 여기서 닫는다. (드래프트 중엔 게임 루프가 멈춰
      // 뷰가 안 오므로, 고른 뒤 첫 뷰 = 드래프트 종료 신호다.)
      if (draftPickedRef.current) {
        draftPickedRef.current = false;
        setDraft(null);
        setDraftPicked(false);
      }
      detectTransitions(prevViewRef.current, msg.view);
      prevViewRef.current = msg.view;
      setView(msg.view);
      // 중앙 패널은 정산 뷰를 건너뛴다 (위 centerView 주석). 첫 뷰가 정산 중이면
      // (재접속·중간 관전 합류) 얼려 둘 이전 국이 없으므로 그 뷰를 그대로 쓴다.
      if (msg.view.round.phase !== "round.over") setCenterView(msg.view);
      else setCenterView((cur) => cur ?? msg.view);
      return;
    }
    if (msg.type === "prompt") {
      const opts = msg.prompt.options;
      // 프롬프트가 왔다 = 드래프트가 끝났다 → 증강 선택창을 닫는다(자동응답 분기로
      // 빠지기 전에 처리해, 자동버림 등으로 오버레이가 남지 않게 한다).
      draftPickedRef.current = false;
      setDraft(null);
      setDraftPicked(false);
      // 액티브 증강 선언(물러설 수 없는 선언 등)은 대개 '첫 턴'에만 가능한데, 東1국
      // 첫 턴은 인트로 스플래시(z=70)가 보드를 가려 증강 메뉴(z=30)가 뒤에 깔려 눌러도
      // 안 보였다("첫시작 꼬임"). 내 프롬프트에 액티브 증강 옵션이 있으면 인트로를 즉시 닫는다.
      if (
        msg.prompt.player === prevViewRef.current?.playerId &&
        opts.some((o) => AUGMENT_ACTION_TYPES.has(o.type))
      ) {
        setIntro(false);
      }
      // 자동 화료·후로없음·자동버림 — 설정에 맞으면 프롬프트를 그리지 않고 즉시 처리한다.
      if (tryAutoRespond(msg.prompt, settingsRef.current)) {
        dropPrompt(msg.prompt.player);
        return;
      }
      // 치·펑·깡·론 버튼이 뜨는 순간의 은은한 "삑" — 내 리액션(선택지에 pass가 있는
      // 프롬프트)일 때만. 내 턴의 일반 버림 프롬프트에는 울리지 않는다.
      if (
        msg.prompt.player === prevViewRef.current?.playerId &&
        opts.some((o) => o.type === "pass") &&
        opts.some((o) => o.type !== "pass")
      ) {
        sfx.callPrompt();
      }
      setPrompts((prev) => ({ ...prev, [msg.prompt.player]: msg.prompt }));
      // 모든 프롬프트에 마감이 실려 온다 → 카운트다운을 켠다 (구 서버면 null)
      setPromptDeadline(
        msg.deadlineMs !== undefined && msg.deadlineMs > 0
          ? Date.now() + msg.deadlineMs
          : null,
      );
      setPromptSeq((s) => s + 1);
      setDraft(null);
      setDraftPicked(false);
      setRiichiMode(false);
      return;
    }
    if (msg.type === "promptCancel") {
      // 제한 시간 초과 등으로 내 차례가 서버에서 이미 지나갔다 — 떠 있는 선택 UI를 닫는다.
      // seat이 실려 오면 그 좌석 것만 접는다(봇 좌석 조종 중 내 프롬프트를 살리기 위해).
      //
      // …그리고 **왜 접혔는지 말한다.** 예전에는 말없이 닫기만 해서, 시간이 지나
      // 서버가 대신 고른 것과 상대의 선언이 우선한 것이 둘 다 "누르려던 버튼이 그냥
      // 사라졌다"로만 보였다. 초읽기 국은 5초라 상시로 일어난다.
      if (msg.reason === "timeout") {
        showToast(
          msg.chosen !== undefined
            ? `시간 초과 — ${msg.chosen}로 자동 진행했습니다`
            : "시간 초과 — 자동으로 진행했습니다",
          "error",
          3600,
        );
      } else if (msg.reason === "preempted") {
        showToast("다른 사람의 선언이 우선합니다", "info", 2600);
      }
      if (msg.seat !== undefined) dropPrompt(msg.seat);
      else setPrompts({});
      setPromptDeadline(null);
      setRiichiMode(false);
      return;
    }
    if (msg.type === "draftOffer") {
      setDraft(msg);
      // 마감은 도착 시각 기준으로 굳힌다 (draftDeadline 주석).
      draftDeadline.current =
        msg.deadlineMs !== undefined && msg.deadlineMs > 0
          ? performance.now() + msg.deadlineMs
          : null;
      setDraftPicked(false);
      draftPickedRef.current = false;
      setPrompts({});
      // 오퍼가 왔다 = 서버가 국 사이 대기를 이미 지나왔다 — 아직 떠 있는 결과 화면은
      // 선택창을 가리기만 하고, 그동안 자동 선택 타이머는 계속 흐른다. 지금 걷는다.
      setRoundResult(null);
      pendingResult.current = null;
      sfx.draft();
      return;
    }
    if (msg.type === "draftAutoPicked") {
      // 시간이 다 되어 서버가 대신 골랐다. 선택창은 곧 닫히므로(다음 뷰/프롬프트)
      // 여기서 결과를 남겨 두지 않으면 "안 고른 증강이 생겼다"로만 남는다.
      setDraft(null);
      setDraftPicked(false);
      draftPickedRef.current = false;
      showBanner("자동 선택", "info", `시간 초과 — ${msg.name} 획득`, 2200);
      return;
    }
    if (msg.type === "draftRerolled") {
      // 그 슬롯만 갈아 끼우고 새로고침을 소진 처리한다. 서버가 이미 같은 판단을
      // 하고 보낸 것이므로 여기서 다시 검사하지 않는다 — 슬롯 번호만 맞춘다.
      setDraft((cur) => {
        if (cur === null || msg.slot < 0 || msg.slot >= cur.choices.length) return cur;
        const choices = [...cur.choices];
        choices[msg.slot] = msg.choice;
        const rerollable = [...(cur.rerollable ?? choices.map(() => false))];
        rerollable[msg.slot] = false;
        return { ...cur, choices, rerollable };
      });
      sfx.draft();
      return;
    }
    if (msg.type === "roundOver") {
      handleRoundOver(msg);
      return;
    }
    if (msg.type === "gameOver") {
      riichiBgm.stop(); // 게임 종료 — 혹시 남아 있을 BGM 확실히 정지
      riichiBgmArmed.current = false;
      setRankings(msg.rankings);
      setLastGameId(msg.gameId ?? null);
      setGameEndReason(msg.reason ?? "normal");
      setCanContinue(msg.canContinue === true);
      setPrompts({});
      setDraft(null);
      setDraftPicked(false);
      setAbortVote(null);
      // 방이 남아 있으면(이어하기 가능) 재입장 대상도 그대로 둔다 —
      // 새로고침·재연결로 돌아와도 같은 대기실에 다시 앉는다.
      if (msg.canContinue !== true) {
        activeRoomRef.current = null; // 게임 종료 → 재연결 자동 재입장 안 함
        safeStorage.removeItem(LAST_ROOM_KEY);
      }
      // 체험 판이 끝났으면 그 판으로 돌아오는 열쇠도 여기서 죽는다 — 결과 화면에서
      // 새로고침했을 때 이미 없는 판으로 붙었다가 튕기는 길을 막는다.
      if (guestRef.current) safeStorage.removeItem(GUEST_TOKEN_KEY);
      return;
    }
    if (msg.type === "kicked") {
      // 방장이 대기실에서 내보냈다 — 이 방에는 다시 못 들어가므로 재입장 대상에서도 지운다
      showToast("방장이 방에서 내보냈습니다", "info", 4000);
      activeRoomRef.current = null;
      if (safeStorage.getItem(LAST_ROOM_KEY) === msg.roomId) {
        safeStorage.removeItem(LAST_ROOM_KEY);
      }
      resetGameState();
      refreshHome();
      return;
    }
    if (msg.type === "abortVote") {
      // 투표 현황은 설정 패널 맨 아래에만 있어서, 남이 판을 접자고 해도 나는 몰랐다.
      // 처음 한 번만 알린다 — 갱신마다 띄우면 잡음이 된다.
      if (msg.votes > 0 && !abortVoteNoticed.current) {
        abortVoteNoticed.current = true;
        showToast(
          `게임 무효 투표가 올라왔습니다 (${msg.votes}/${msg.needed}) — 설정 맨 아래에서 응답할 수 있습니다`,
          "info",
          5000,
        );
      }
      if (msg.votes === 0) abortVoteNoticed.current = false;
      setAbortVote(msg);
      return;
    }
    if (msg.type === "gameAborted") {
      showToast(msg.reason, "info", 4000);
      activeRoomRef.current = null;
      safeStorage.removeItem(LAST_ROOM_KEY);
      returnHome();
      return;
    }
  }

  /** 국 종료 — 화료 컷인(만관 이상은 별도 연출) → 결과 화면 순서로 연출.
   *  결과창은 연출 큐가 모두 빈 뒤에 열리므로(scheduleRoundResult) 컷인과 겹치지 않는다. */
  function handleRoundOver(msg: RoundOverMessage): void {
    /*
     * 이 국의 정산을 **기록에 쌓아 둔다** — 결과 화면은 스스로 닫히고 다시 여는 길이
     * 없어서, 서버 상한(최대 20초) 안에 못 읽으면 그 국의 역·판·부·증감이 영구히
     * 사라졌다. 📜 기록에서 지난 국을 다시 열 수 있게 한다.
     *
     * 국 이름은 **지금 뷰**에서 딴다 — `settle`의 국 번호는 이미 다음 국을 가리킨다.
     */
    const pvNow = prevViewRef.current;
    const label =
      pvNow === null
        ? "지난 국"
        : `${WIND_CHAR[pvNow.round.prevalentWind - 1] ?? "?"}${pvNow.round.roundNumber}국${
            pvNow.round.honba > 0 ? ` ${pvNow.round.honba}본장` : ""
          }`;
    setRoundHistory((prev) => [...prev, { label, result: msg }]);
    // 정산 화면은 무음 — 배경 BGM을 붙들어(되감지 않음) 새 국에서 이어서 재개한다.
    // (holdForResult가 target을 0으로 잡으므로, 아래 fadeOut의 언덕킹이 배경 BGM을
    //  다시 불러오지 못한다 — 론·쯔모 후 정산 내내 아무 BGM도 나지 않는다.)
    bgm.holdForResult(true);
    // 국이 끝났으니 리치 BGM 페이드아웃 — 론·쯔모 컷인이 뜨는 동안 서서히 빠지며 템포를 넘긴다
    riichiBgm.fadeOut();
    riichiBgmArmed.current = false; // 국 종료 — 아직 안 뜬 리치 배너가 뒤늦게 브금을 켜지 않게
    // 새 국 결과 → 다음-국 신호 가드 리셋 (결과 화면이 실제로 뜰 때 열어 준다)
    roundContinueSent.current = false;
    // 서버 상한(autoContinueMs)을 지금 시각에 얹어 굳힌다. 0·미지정이면 대기가 없다.
    const autoMs = msg.autoContinueMs ?? 0;
    roundResultDeadline.current = autoMs > 0 ? performance.now() + autoMs : null;
    const infos = (msg.settle.winInfos ?? []) as WinInfo[];
    if (msg.outcome === "win" && infos.length > 0) {
      // 더블론 대비: 역만/만관 각각 실제 최고 등급 화료를 헤드라인으로 (infos[0] 고정 X)
      const yakumanWin = infos.find((w) => w.yakumanCount > 0 || w.limit === "kazoe_yakuman");
      const isYakuman = yakumanWin !== undefined;
      const limitWin = infos
        .filter((w) => w.yakumanCount === 0 && w.limit !== null && LIMIT_RANK[w.limit] !== undefined)
        .sort((a, b) => (LIMIT_RANK[b.limit!] ?? 0) - (LIMIT_RANK[a.limit!] ?? 0))[0];
      const headline = yakumanWin ?? limitWin ?? infos[0]!;
      const pv = prevViewRef.current;
      const who = pv !== null ? playerNameById(pv, headline.winner) : headline.winner;
      const wt = headline.winType === "tsumo" ? "쯔모" : "론";

      if (isYakuman) {
        // 배수 역만은 컷인 문구가 "더블 역만"처럼 배수를 그대로 말한다 —
        // "역 만"만 뜨면 대사희·국사 13면의 2배가 정산표에서야 보인다.
        // (헤아림 역만은 yakumanCount가 0이라 배수 이름을 붙이지 않는다.)
        const ycount = yakumanWin.yakumanCount;
        const ylabel =
          ycount >= 2
            ? yakumanName(ycount)
            : ycount === 0 && yakumanWin.limit === "kazoe_yakuman"
              ? "헤아림 역만"
              : "역 만";
        // 역만은 밴드가 느리게 열리는 예열 구간이 있어 슬램(≈450ms)에 흔들림을 동기
        showCutIn(ylabel, "yakuman", who, 2600, {
          sfx: sfx.yakuman,
          impact: { shake: 4, delayMs: 450 },
        });
      } else if (limitWin !== undefined) {
        const tier = limitWin.limit as LimitTier;
        const label = LIMIT_NAMES[limitWin.limit!] ?? limitWin.limit!;
        const big = tier === "baiman" || tier === "sanbaiman";
        showCutIn(
          label,
          "limit",
          `${who} · ${wt} · ${limitWin.points.toLocaleString()}점`,
          big ? 2200 : 2000,
          {
            tier,
            sfx: () => sfx.mangan(tier),
            impact: { shake: big ? 4 : 3 },
          },
        );
      } else {
        const isTsumo = headline.winType === "tsumo";
        showCutIn(isTsumo ? "쯔모!" : "론!", isTsumo ? "tsumo" : "ron", who, isTsumo ? 1400 : 1500, {
          sfx: isTsumo ? sfx.tsumo : sfx.ron,
          impact: { shake: isTsumo ? 2 : 3 },
        });
      }
    } else {
      // 평범한 유국이 아니면 컷인부터 다르게 말한다 (유국역만 등).
      const special = msg.outcome === "draw" ? msg.settle.drawSpecial : undefined;
      if (special !== undefined) {
        showCutIn(
          special.label.split(" — ")[0] ?? special.label,
          "yakuman",
          special.holder !== undefined && prevViewRef.current !== null
            ? playerNameById(prevViewRef.current, special.holder)
            : undefined,
          2200,
          { sfx: sfx.draw, impact: { shake: 4 } },
        );
      } else {
        showCutIn(msg.outcome === "draw" ? "유 국" : "도중 유국", "draw", undefined, 1300, {
          sfx: sfx.draw,
        });
      }
    }
    // 결과창은 연출 큐가 다 빈 뒤에 연다 (이전 국 연출을 모두 마무리하고 결과 표시)
    scheduleRoundResult(msg);
  }

  /**
   * 결과 화면 닫기 — 화면을 내리고, 서버에 "다음 국으로" 신호를 보낸다(국당 1회).
   * 사람이 모두 닫으면 서버가 즉시 다음 국을 시작한다. 관전자는 게이트하지 않는다.
   */
  function closeRoundResult(): void {
    setRoundResult(null);
    if (!roundContinueSent.current) {
      roundContinueSent.current = true;
      if (!spectatingRef.current) send({ type: "roundContinue" });
    }
  }

  /** 국 식별 키 (장풍-국번호-본장) — 이 값이 바뀌면 새 국이다 */
  function roundKeyOf(v: PlayerView): string {
    return `${v.round.prevalentWind}-${v.round.roundNumber}-${v.round.honba}`;
  }

  /**
   * 뷰 전이 감지 → 연출 (리치·후로·새 국·점수 변동·타패음).
   *
   * 배너 알림(새 국·리치·후로)은 prev/next 비교가 아니라 bannerShown ref로 판단한다.
   * 서버가 같은 상태의 뷰를 중복 전송하거나(재접속 복원 등) 뷰가 스테일하게 도착해도
   * 전환당 정확히 한 번만 배너를 띄운다 — 중복 발동이 쌓여 배너가 안 사라지던 버그 방지.
   */
  function detectTransitions(prev: PlayerView | null, next: PlayerView): void {
    const rk = roundKeyOf(next);
    const shown = bannerShown.current;
    // 기록 줄에 붙일 국 이름. enqueueProduction보다 **먼저** 갱신돼야 새 국 배너부터
    // 새 국으로 찍힌다 (아래 새 국 분기가 showBanner를 부른다).
    roundLabelRef.current =
      `${WIND_CHAR[next.round.prevalentWind - 1] ?? "?"}${next.round.roundNumber}국` +
      (next.round.honba > 0 ? ` ${next.round.honba}본장` : "");

    // 첫 뷰(또는 리셋 후): 현재 국을 "이미 알림함"으로 시드만 하고 배너는 개막 연출에 맡긴다.
    // 리치·후로도 현재 상태를 시드해 재접속 중간 합류 시 헛알림을 막는다.
    if (prev === null) {
      shown.roundKey = rk;
      shown.riichi = new Set(
        next.players
          .filter((p) => next.round.byPlayer[p.id]?.riichiDeclared === true)
          .map((p) => p.id),
      );
      // 재접속·중간 합류: 이미 걸린 리치는 배너로 재알림하지 않지만(위 시드), BGM은
      // 국이 이어지는 동안 흘러야 하는 '상태'다 → 활성 리치가 있고 국이 안 끝났으면
      // 브금을 복원한다. (배너 onShow의 start()는 전이 때만 도는데 재접속엔 전이가
      //  없어, 이 시드가 없으면 리치 브금이 통째로 사라진다.)
      if (shown.riichi.size > 0 && next.round.phase !== "round.over") {
        riichiBgm.start();
      }
      shown.melds = {};
      shown.kanAdded = new Set();
      for (const p of next.players) {
        const ms = next.round.byPlayer[p.id]?.melds ?? [];
        shown.melds[p.id] = ms.length;
        // 재접속·첫 뷰: 이미 존재하는 가깡은 알림하지 않도록 시드
        for (const m of ms) {
          if (m.kind !== "kan_added") continue;
          const t0 = m.tileIds[0];
          const k = t0 !== undefined ? next.tiles[t0]?.kind : undefined;
          if (k !== undefined) shown.kanAdded.add(`${p.id}:${kindKey(k)}`);
        }
      }
      shown.sealed = next.round.byPlayer[next.playerId]?.sealedTileIds?.length ?? 0;
      // 재접속·중간 합류: 이미 벌어진 증강 사건이 한꺼번에 터지지 않게 시드한다.
      shown.augEvents = new Set();
      for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
        // 표에 없는 전용 사건(등가교환 통보)도 같은 집합을 쓰므로 함께 시드한다 —
        // 빠뜨리면 재접속할 때마다 이미 끝난 교환 컷인이 다시 터진다.
        if (
          augEventFor(key) === null &&
          key !== SWAP3_NOTICE_KEY &&
          !key.startsWith("push_riichi:fired:") &&
          RELATION_CUTINS[key.split(":")[0] ?? ""] === undefined
        ) {
          continue;
        }
        shown.augEvents.add(augEventSig(key, raw, shown.roundKey));
      }
      // 국 시작에 저절로 켜지는 증강(초읽기·눈먼 총알·반전)도 같은 집합을 쓴다.
      // 빠뜨리면 국 도중에 재접속할 때마다 이미 켜져 있던 발동 컷인이 다시 터진다.
      const armed = armedRoundNotices(next);
      for (const n of armed) {
        shown.augEvents.add(augEventSig(n.key, n.raw, shown.roundKey));
      }
      // …다만 **아무 말도 없이** 시드만 하면, 돌아온 사람은 이 국에 초읽기(5초)가
      // 걸렸다는 사실을 한 번도 못 본다 — 초읽기를 시계로만 알 수 있었던 그 문제가
      // 재접속 경로에 그대로 남아 있었다. 컷인이 아니라 요약 배너로 한 번만 알린다
      // (컷인은 "지금 터졌다"로 읽혀 오해가 된다).
      if (armed.length > 0) {
        showBanner(
          "이번 국 적용 중",
          "info",
          armed.map((n) => n.title).join(" · "),
          2000,
        );
      }
      return;
    }

    // 증강 테스트 시점 전환 — 소리도 그 좌석이 보는 화면을 따라간다. 스텔스 리치처럼
    // 새 시점에서는 보이지 않는 리치의 BGM이 계속 흘러 "타가에게도 들린다"로 오인되는
    // 것을 막는다. (실대국은 뷰의 시점이 바뀔 일이 없어 이 블록이 돌지 않는다.)
    if (prev.playerId !== next.playerId) {
      const visibleRiichi =
        next.round.phase !== "round.over" &&
        next.players.some((p) => next.round.byPlayer[p.id]?.riichiDeclared === true);
      if (!visibleRiichi) {
        // 이 시점에는 리치가 안 보인다 → 브금 정지 + 무장 해제 (평상시 BGM 복귀)
        riichiBgm.stop();
        riichiBgmArmed.current = false;
      } else if (!riichiBgm.active()) {
        // 이미 배너까지 끝난 리치만 여기서 복원한다 — 아직 안 알린 리치는 아래
        // 배너 경로(onShow)가 연출과 함께 켠다 (이중 start로 트랙이 두 번 갈리는 것 방지)
        const allAnnounced = next.players.every(
          (p) =>
            next.round.byPlayer[p.id]?.riichiDeclared !== true ||
            shown.riichi.has(p.id),
        );
        if (allAnnounced) riichiBgm.start();
      }
    }

    // 새 국 시작 — roundKey가 바뀌고 '실제로' 다음 국이 시작됐을 때만.
    // 정산 직후(round.over) 뷰는 이미 다음 국 번호를 담지만(ROUND_SETTLED가 국번호를 미리
    // 올린다) 아직 다음 국이 시작된 게 아니다. 이때 배너를 띄우면 론·점수표보다 먼저 나오고
    // 지난 국 리치·후로가 재발동한다 → phase 가드로 진짜 다음 국 뷰에서만 처리한다.
    if (rk !== shown.roundKey && next.round.phase !== "round.over") {
      shown.roundKey = rk;
      shown.riichi = new Set();
      shown.melds = {};
      shown.kanAdded = new Set();
      shown.augEvents = new Set();
      // 안전망: 리치 BGM이 국 종료 처리(fadeOut)를 어떤 이유로 놓쳐도
      // 새 국에는 절대 이월되지 않게 확실히 정지한다.
      riichiBgm.stop();
      riichiBgmArmed.current = false;
      // 정산 무음 해제 — 새 국이 실제로 시작됐으니 배경(대기) BGM을 다시 흐르게 한다.
      bgm.holdForResult(false);
      // 에코가 끝내 안 온 타패 id(접속 끊김 등)가 다음 국까지 남아 정상 타패음을 먹지 않게
      pendingOwnDiscards.current.clear();
      const label = `${WIND_CHAR[next.round.prevalentWind - 1] ?? "?"}${next.round.roundNumber}국`;
      // 부제에 "이 국이 어떤 국인가"를 싣는다. 서든데스(서입·남입)로 넘어온 것도, 지금이
      // 오라스라는 것도 예전에는 화면 어디에도 없었다 — 봇은 setGameMode로 올라스를
      // 명시적으로 받는데(RoomManager) 사람만 국 번호로 역산해야 했다.
      const maxWind = maxWindOf(next.round.mode);
      const subParts: string[] = [];
      if (next.round.prevalentWind > maxWind) {
        subParts.push("서든데스 — 30000점을 먼저 넘기면 종료");
      } else if (next.round.prevalentWind === maxWind && next.round.roundNumber === 4) {
        subParts.push("오라스");
      }
      if (next.round.honba > 0) subParts.push(`${next.round.honba}본장`);
      const sub = subParts.length > 0 ? subParts.join(" · ") : undefined;
      // 새 국 배너는 큐 뒤에 붙어, 이전 국의 연출(화료 컷인 등)이 모두 끝난 뒤에 뜬다.
      // 아직 안 열린 이전 국 결과(pendingResult)가 다음 국으로 새어 나오지 않게 함께 정리한다.
      setRoundResult(null);
      pendingResult.current = null;
      showBanner(label, "info", sub, 1600, sfx.round);
    }

    // 타패 소리 (누군가의 바닥이 늘었다) — 내 타패는 클릭 순간 이미 냈으므로, 방금 버린
    // 패 id가 그대로 올라온 에코 뷰에서는 내지 않는다. 타인 타패는 살짝 작게.
    for (const p of next.players) {
      const prevLen = prev.zones[`discards:${p.id}`]?.tileIds.length ?? 0;
      const nextLen = next.zones[`discards:${p.id}`]?.tileIds.length ?? 0;
      const prevHidden = prev.zones[`discards:${p.id}`]?.hiddenCount ?? 0;
      const nextHidden = next.zones[`discards:${p.id}`]?.hiddenCount ?? 0;
      if (nextLen + nextHidden > prevLen + prevHidden) {
        const mine = p.id === next.playerId;
        let echo = false;
        if (mine) {
          const before = new Set(prev.zones[`discards:${p.id}`]?.tileIds ?? []);
          for (const t of next.zones[`discards:${p.id}`]?.tileIds ?? []) {
            if (!before.has(t) && pendingOwnDiscards.current.delete(t)) echo = true;
          }
        }
        if (!echo) sfx.discard(mine);
        break;
      }
    }

    // 점수 변동 플로팅
    const deltas: Record<string, number> = {};
    let changed = false;
    for (const p of next.players) {
      const before = prev.players.find((x) => x.id === p.id)?.score ?? p.score;
      if (p.score !== before) {
        deltas[p.id] = p.score - before;
        changed = true;
      }
    }
    if (changed) {
      setScoreFx(deltas);
      sfx.score();
      window.setTimeout(() => setScoreFx({}), 2600);
    }

    /*
     * 자동 발동 증강 — 국이 시작하자마자 "이번 국에 걸렸다"를 크게 알린다.
     *
     * 초읽기·눈먼 총알·반전은 뽑는 순간 무장해 다음 국 하나에만 켜지는데, 화면에 남는
     * 흔적이 이름표 pill 하나뿐이라 판이 이미 굴러간 뒤에야 알아차렸다 — 5초 제한은
     * 모르고 있으면 그대로 쯔모기리로 흘러간다(2026-08-17 사용자 요청).
     *
     * 새 국 배너 바로 뒤에 붙도록 **리치·후로 감지보다 먼저** 큐에 넣는다.
     * 채널은 국 내내 값을 들고 있으므로 augEvents 서명으로 한 번만 재생한다.
     */
    for (const arm of armedRoundNotices(next)) {
      const seen = augEventSig(arm.key, arm.raw, shown.roundKey);
      if (shown.augEvents.has(seen)) continue;
      shown.augEvents.add(seen);
      showCutIn(arm.title, "augment", arm.line, arm.ms, {
        sfx: () => sfx.augment(1),
        augId: arm.augId,
        impact: { shake: 2 },
      });
    }

    /*
     * 등 떠밀기가 터졌다 — **리치 연출보다 먼저** 발동 컷인을 세운다.
     *
     * 강제 리치는 화면상 평범한 리치와 구별이 없어서, 당한 쪽도 보는 쪽도 "왜 갑자기
     * 리치가 걸렸는지"를 읽을 수 없었다(2026-08-17 사용자 요청). 채널(`fired`)은 콘텐츠가
     * **강제일 때만** 쏘므로 자발적 리치에는 뜨지 않는다. 아래 리치 배너와 같은 뷰에서
     * 감지되니, 여기서 먼저 큐에 넣으면 "등 떠밀기 → 리치" 순으로 재생된다.
     */
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      if (!key.startsWith("push_riichi:fired:")) continue;
      if (typeof raw !== "string" || raw === "") continue;
      const seen = augEventSig(key, raw, shown.roundKey);
      if (shown.augEvents.has(seen)) continue;
      shown.augEvents.add(seen);
      const by = key.slice("push_riichi:fired:".length);
      showCutIn(
        "등 떠밀기",
        "augment",
        `${playerNameById(next, by)} — ${playerNameById(next, raw)}는 숨을 수 없다`,
        2000,
        {
          sfx: () => sfx.augment(1),
          augId: "push_riichi",
          impact: { shake: 3 },
          // 바로 뒤 리치 배너와 **같은 등급**이라야 짝이 안 갈린다 — 리치만 앞질러
          // 나가면 "리치 → (뒤늦게) 등 떠밀기"가 되어 인과가 뒤집힌다.
          priority: PROD_PRIORITY_RIICHI,
        },
      );
    }

    // 이 패스에서 누군가의 리치가 풀렸는가 (BGM 정리를 그때만 한다)
    let riichiWasCancelled = false;
    for (const p of next.players) {
      const sub = p.id === next.playerId ? undefined : playerNameById(next, p.id);

      // 리치 선언 — 이 국에서 이 플레이어를 아직 알림하지 않았을 때만
      const nowRiichi = next.round.byPlayer[p.id]?.riichiDeclared === true;
      if (nowRiichi && !shown.riichi.has(p.id)) {
        /*
         * 이미 이 국에 **다른 사람의 리치가 서 있으면** 이번은 "추격 리치" — 기세를
         * 빼앗아오는 연출이다. (BGM도 이 시점의 start()에서 다른 트랙으로 갈아끼운다.)
         *
         * ⚠ 근거는 지금 이 뷰의 판 상태(`riichiDeclared`)다. 예전에는 "이 국에 리치를
         * 몇 개 알렸는가"(`shown.riichi.size`)를 봤는데, 그 집합은 연출 이력이라 판과
         * 어긋나는 자리가 여럿이었다 — ① 아래 스텔스 리치도 (알림은 안 하면서) 집합에는
         * 들어가므로, 아무 리치도 보이지 않는 화면에서 다음 리치가 "추격"으로 떴고
         * ② 국이 끝나고 다음 국 첫 뷰가 오기 전(phase가 round.over인 동안)에는 집합이
         * 비워지지 않아 지난 국의 리치가 그대로 셈에 남았다. 판 상태에서 바로 읽으면
         * 취소된 리치·숨은 리치가 저절로 빠진다(남의 스텔스 리치는 내 뷰에서 false다).
         */
        const isChase = next.players.some(
          (o) => o.id !== p.id && next.round.byPlayer[o.id]?.riichiDeclared === true,
        );
        shown.riichi.add(p.id);
        /*
         * 스텔스 리치 — 이 리치는 타가에게 보이지 않는다(본인 뷰에만 riichiHidden이 온다).
         * 그런데 연출은 "리 치"·"더블리치" 대형 컷인 + 리치 BGM이라, 여러 좌석을 함께 보는
         * 화면(증강 테스트의 시점 전환)에서는 리치가, 더블까지 붙으면 그 사실까지 공개된
         * 것처럼 보인다(2026-08-01 사용자 보고: 스텔스로 걸었는데 더블리치가 공개됨).
         * 은닉 리치는 컷인·BGM 없이 나에게만 조용한 토스트로 알린다.
         */
        if (next.round.byPlayer[p.id]?.riichiHidden === true) {
          riichiBgmArmed.current = false;
          showToast(
            next.round.byPlayer[p.id]?.doubleRiichi === true
              ? "스텔스 리치 — 더블리치로 성립했습니다 (타가에게는 보이지 않습니다)"
              : "스텔스 리치 — 성립했습니다 (타가에게는 보이지 않습니다)",
            "info",
            2600,
          );
          continue;
        }
        // 리치 BGM은 여기서 바로 켜지 않고 '무장'만 한다. 실제 start()는 아래 리치 배너가
        // 화면에 뜨는 순간(showBanner의 onShow)에 실행돼, 브금이 연출보다 먼저 나오지 않는다.
        // (이미 끝나는 국의 스테일 뷰에서는 무장하지 않는다. 국이 끝나면 fadeOut/stop이
        //  무장을 풀어, 배너가 뒤늦게 떠도 브금이 켜졌다 안 꺼지는 일이 없다.)
        if (next.round.phase !== "round.over") riichiBgmArmed.current = true;
        // 리치패(바닥에서 눕힌 패)를 알림에 함께 보여준다.
        const discards = next.zones[`discards:${p.id}`]?.tileIds ?? [];
        const ri = next.round.byPlayer[p.id]?.riichiTileIndex;
        const riichiId = ri !== undefined ? discards[ri] : discards[discards.length - 1];
        const riichiKind = riichiId !== undefined ? next.tiles[riichiId]?.kind : undefined;
        // 더블/트리플은 "리치"보다 먼저 읽혀야 한다 — 정산에서야 2판·4판을 발견하는 일이 없게.
        // (트리플은 이중 선언 증강이 뷰 채널로 알려 준다. 스텔스 리치면 본인에게만 온다.)
        const isTriple = next.augmentView?.[`riichi_upgrade:triple:${p.id}`] === true;
        const isDouble = next.round.byPlayer[p.id]?.doubleRiichi === true;
        const label = isTriple
          ? "트리플리치"
          : isDouble
            ? "더블리치"
            : isChase
              ? "추격 리치"
              : "리 치";
        // 더블/트리플이 문구를 차지하면 "추격"은 부제로 남긴다 — 둘 다 알아야 하는 정보다.
        const bannerSub =
          isChase && (isDouble || isTriple)
            ? sub !== undefined
              ? `${sub} · 추격`
              : "추격"
            : sub;
        showBanner(
          label,
          "riichi",
          bannerSub,
          1500,
          () => {
            // 연출(리치 배너)이 화면에 뜨는 이 순간에 브금을 시작한다 — 연출 → 브금 순서.
            sfx.riichi();
            haptics.declare();
            if (riichiBgmArmed.current) riichiBgm.start();
          },
          riichiKind !== undefined ? [riichiKind] : undefined,
          // 추격·트리플은 기세를 강조해 컷인을 더 세게 흔든다
          { shake: isTriple ? 4 : isChase ? 3 : 2 },
        );
      }

      /*
       * 리치가 **풀렸다** — 승부수(last_stand)·손바닥 뒤집기가 리치를 물릴 수 있다.
       *
       * 예전에는 이 경우를 아무도 정리하지 않았다. 그래서 ① 리치 BGM이 국이 끝날
       * 때까지 계속 흘렀고(stop은 국 종료·새 국에만 있다) ② `shown.riichi`에 좌석이
       * 남아, **같은 국에 다시 리치를 걸면 컷인도 BGM도 아예 안 나왔다**.
       */
      if (!nowRiichi && shown.riichi.has(p.id)) {
        shown.riichi.delete(p.id);
        riichiWasCancelled = true;
        showBanner(
          "리치 해제",
          "info",
          p.id === next.playerId ? "리치를 물렀다 — 리치봉이 돌아온다" : `${playerNameById(next, p.id)} — 리치를 물렀다`,
          1400,
        );
      }

      // 후로 (치/펑/깡) — 후로 수가 이전 알림보다 늘었을 때만. 화료·리치처럼 컷인 연출.
      const nextMelds = next.round.byPlayer[p.id]?.melds ?? [];
      const shownCount = shown.melds[p.id] ?? 0;
      if (nextMelds.length > shownCount) {
        shown.melds[p.id] = nextMelds.length;
        const m = nextMelds[nextMelds.length - 1];
        if (m !== undefined) {
          const isKan =
            m.kind === "kan_open" || m.kind === "kan_closed" || m.kind === "kan_added";
          const label =
            m.kind === "chi" ? "치" : isKan ? "깡" : m.kind === "kokushi_pon" ? "국사 퐁" : "퐁";
          const tone = m.kind === "chi" ? "chi" : isKan ? "kan" : "pon";
          const who = playerNameById(next, p.id);
          // 부른 패(없으면 후로 첫 패)를 컷인에 함께 보여준다
          const calledId = m.calledTileId ?? m.tileIds[0];
          const calledKind = calledId !== undefined ? next.tiles[calledId]?.kind : undefined;
          // 후로별 차등: 치(잦음)는 가볍고 짧게, 깡(희귀·묵직)은 흔들림까지
          const callSfx = m.kind === "chi" ? sfx.callChi : isKan ? sfx.callKan : sfx.callPon;
          showCutIn(label, tone, who, isKan ? 1200 : 1050, {
            sfx: callSfx,
            ...(calledKind !== undefined ? { tiles: [calledKind] } : {}),
            ...(isKan ? { impact: { shake: 2 as const } } : m.kind === "pon" ? { impact: { shake: 1 as const } } : {}),
          });
        }
      }

      // 가깡(가깡) — 기존 펑 묶음이 제자리에서 깡으로 승격되므로 melds 길이가 늘지 않아
      // 위 길이 기반 블록이 놓친다. 묶음별로 별도 추적해 최초 1회만 컷인.
      for (const m of nextMelds) {
        if (m.kind !== "kan_added") continue;
        const t0 = m.tileIds[0];
        const k0 = t0 !== undefined ? next.tiles[t0]?.kind : undefined;
        if (k0 === undefined) continue;
        const key = `${p.id}:${kindKey(k0)}`;
        if (shown.kanAdded.has(key)) continue;
        shown.kanAdded.add(key);
        const who = playerNameById(next, p.id);
        // 더한 패(마지막 패, 없으면 부른 패)를 컷인에 함께 보여준다
        const addedId = m.tileIds[m.tileIds.length - 1] ?? m.calledTileId;
        const addedKind = addedId !== undefined ? next.tiles[addedId]?.kind : undefined;
        showCutIn("깡", "kan", who, 1200, {
          sfx: sfx.callKan,
          ...(addedKind !== undefined ? { tiles: [addedKind] } : {}),
          impact: { shake: 2 },
        });
      }
    }

    /*
     * 살아 있는 리치가 하나도 없으면 리치 BGM을 끈다.
     *
     * 예전에는 `riichiBgm.stop()`이 국 종료·새 국·게임 종료에만 있었다. 그래서
     * 승부수·손바닥 뒤집기로 리치를 물러도 브금이 국이 끝날 때까지 계속 흘렀다 —
     * 무엇이 소리를 내는지 화면 어디에도 없는 상태로.
     */
    if (riichiWasCancelled && shown.riichi.size === 0) {
      riichiBgm.stop();
      riichiBgmArmed.current = false;
    }

    // 패 봉인 (봉인술사 등) — 내 봉인 패 수가 이전 알림보다 늘었을 때만.
    // 봉인은 국이 끝나면 풀리므로 다음 국에 다시 걸리면 알림도 다시 뜬다.
    const sealedNow = next.round.byPlayer[next.playerId]?.sealedTileIds?.length ?? 0;
    // 봉인이 풀리면(국 경계·소진) 기준선을 내려 다음 봉인에도 배너가 다시 뜨게 한다
    if (sealedNow < shown.sealed) shown.sealed = sealedNow;
    if (sealedNow > shown.sealed) {
      shown.sealed = sealedNow;
      showBanner(
        "봉 인",
        "seal",
        `누군가 내 패 ${sealedNow}장을 봉인했습니다 — 🔒 이 패는 버릴 수 없음`,
        2400,
        sfx.augmentSoft,
        undefined,
        { shake: 1 },
      );
    }

    // 스파이 적발 — 찍힌 패로 누군가 화료해 점수가 통째로 흘러간 순간(전원 공개).
    // 지정은 게임당 1회라 홀더별로 한 번만 알린다.
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      if (!key.startsWith("spy:caught:")) continue;
      if (shown.spyCaught.has(key)) continue;
      shown.spyCaught.add(key);
      const holder = key.slice("spy:caught:".length);
      const kind = typeof raw === "string" ? parseKindKey(raw) : null;
      showCutIn("스파이", "spy", `${playerNameById(next, holder)} — 화료 점수를 통째로 가져갔다`, 2200, {
        sfx: () => sfx.augment(1),
        ...(kind !== null ? { tiles: [kind] } : {}),
        impact: { shake: 3 },
      });
    }

    // 성립하지 않는 깡 — 깡을 지른 순간 그 깡이 무력화됐음을 전원에게 알린다.
    // (깡 선언자에게는 "지금 지른 게 자살이었다"는 통보이자, 보유자에겐 론 신호다.)
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      if (!key.startsWith("void_kan:")) continue;
      if (typeof raw !== "string" || raw === "") continue;
      // ⚠ 국 키는 **shown.roundKey**(마지막으로 실제 시작된 국)를 쓴다 — 아래 augEvents와
      //   같은 이유다. 정산 뷰의 국 번호는 이미 다음 국을 가리켜 서명이 통째로 갈린다.
      const seen = `${key}:${raw}:${shown.roundKey}`;
      if (shown.voidKan.has(seen)) continue;
      shown.voidKan.add(seen);
      const holder = key.slice("void_kan:".length);
      const kind = parseKindKey(raw);
      showCutIn("성립하지 않는 깡", "augment", `${playerNameById(next, holder)} — 그 깡, 창깡으로 잡힌다`, 2200, {
        sfx: () => sfx.augment(1),
        augId: "void_kan",
        ...(kind !== null ? { tiles: [kind] } : {}),
        impact: { shake: 2 },
      });
    }

    // 일회성 증강 사건 — 터지는 순간 한 번 크게 보여주고 끝낸다(AUG_EVENTS 표).
    // 채널은 국이 끝날 때까지 값을 들고 있으므로 서명으로 걸러 매 뷰마다 재발동하지 않게 한다.
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      const def = augEventFor(key);
      if (def === null) continue;
      // 껐다 켜는 플래그형(밑장빼기 무장 해제 등)은 켜졌을 때만 알린다
      if (raw === false || raw === null || raw === undefined || raw === "") continue;
      // ⚠ 꼬리가 **좌석 id인 채널만** 사건이다. AUG_EVENTS는 접두로 맞추는데, 같은 증강이
      //   접두를 공유하는 다른 채널을 함께 쓰는 경우가 있다 — 염색·연금술사의 남은 횟수
      //   `tile_dyeing:left`·`alchemist:left`가 그렇다. 거르지 않으면 횟수가 줄 때마다
      //   컷인이 터지고, 컷인 문구의 사람 이름 자리에는 "left"가 앉는다.
      const tail = key.slice(def.prefix.length + 1);
      if (!(next.players ?? []).some((p) => p.id === tail)) continue;
      const seen = augEventSig(key, raw, shown.roundKey);
      if (shown.augEvents.has(seen)) continue;
      shown.augEvents.add(seen);
      const who = playerNameById(next, tail);
      const tiles = augEventTiles(raw);
      // "전 → 후"를 한 줄에 늘어놓는 사건(염색·연금술사·분열)은 가운데를 화살표로 가른다.
      const arrowAt = augEventArrowAt(raw);
      showCutIn(def.title, def.tone ?? "augment", `${who !== "" ? `${who} — ` : ""}${def.sub}`, def.ms ?? 2000, {
        sfx: () => sfx.augment(1),
        augId: def.augId,
        ...(tiles.length > 0 ? { tiles } : {}),
        ...(arrowAt !== undefined && arrowAt < tiles.length ? { tileArrowAt: arrowAt } : {}),
        impact: { shake: def.shake ?? 2 },
      });
    }

    /*
     * 숨은 리치가 풀렸다 — **당사자에게만** 알린다.
     *
     * 손을 바꾸는 증강(통째로 바꾸기·손패 3장 교환·자리 바꿈)에게 손을 뺏히면
     * 스텔스 리치가 해제된다. 채널이 당사자 전용이라 이 루프는 그 사람 화면에서만
     * 돈다 — 전원 공개로 알리면 "저 사람이 리치였구나"가 뒤늦게 새어, 막으려던
     * 누설이 한 박자 늦게 그대로 일어난다(2026-08-02).
     */
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      if (!key.startsWith("stealth_riichi:broken:")) continue;
      const mark = raw as { by?: string } | null;
      if (mark === null || typeof mark !== "object") continue;
      const seen = `${key}:${shown.roundKey}`;
      if (shown.stealthBroken.has(seen)) continue;
      shown.stealthBroken.add(seen);
      showCutIn(
        "리치 해제",
        "augment",
        `${playerNameById(next, mark.by ?? "")}에게 손을 빼앗겨 숨은 리치가 풀렸다`,
        2400,
        { sfx: () => sfx.augment(1), augId: "stealth_riichi", impact: { shake: 2 } },
      );
    }

    /*
     * 등가교환이 성사됐다 — **당사자 둘에게만** 무엇이 오갔는지 보여준다.
     *
     * 3장이 소리 없이 갈리는데 화면에 아무 말도 안 나와, 지정당한 쪽은 손패가 언제
     * 어떻게 바뀌었는지 알 수 없었다(2026-08-12 사용자 지적). 준 3장 → 받은 3장을
     * 화살표로 갈라 한 줄에 띄운다. 제3자에게는 여전히 새지 않는다(당사자 전용 채널).
     */
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      if (key !== SWAP3_NOTICE_KEY) continue;
      const n = raw as {
        with?: string;
        gave?: TileKind[];
        got?: TileKind[];
        holder?: boolean;
      } | null;
      if (n === null || typeof n !== "object") continue;
      const gave = Array.isArray(n.gave) ? n.gave : [];
      const got = Array.isArray(n.got) ? n.got : [];
      if (gave.length === 0 && got.length === 0) continue;
      const seen = augEventSig(key, raw, shown.roundKey);
      if (shown.augEvents.has(seen)) continue;
      shown.augEvents.add(seen);
      const who = playerNameById(next, n.with ?? "");
      showCutIn(
        "등가교환",
        "augment",
        n.holder === true
          ? `${who}와 3장을 맞바꿨다 — 넘긴 패 → 받은 패`
          : `${who}에게 3장을 빼앗겼다 — 넘어간 패 → 받은 패`,
        3200, // 6장을 훑을 시간
        {
          sfx: () => sfx.augment(1),
          augId: "hand_swap3",
          tiles: [...gave, ...got],
          tileArrowAt: gave.length,
          impact: { shake: 2 },
        },
      );
    }

    /*
     * 당사자 전용 컷인 — 손패를 통째로 빼앗기거나, 일발이 지워지거나, 내가 버리지도
     * 않은 패가 내 바닥에 심어지는 순간. 제3자에게는 이름표 관계 표식이 그대로 남는다.
     */
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      const head = key.split(":")[0] ?? "";
      const def = RELATION_CUTINS[head];
      if (def === undefined) continue;
      const holderId = key.slice(head.length + 1);
      const targetId = typeof raw === "string" ? raw : "";
      if (targetId === "" || holderId === "" || holderId === targetId) continue;
      const iAmHolder = next.playerId === holderId;
      const iAmTarget = next.playerId === targetId;
      if (!iAmHolder && !iAmTarget) continue;
      if (!next.players.some((p) => p.id === holderId)) continue;
      if (!next.players.some((p) => p.id === targetId)) continue;
      const seen = augEventSig(key, raw, shown.roundKey);
      if (shown.augEvents.has(seen)) continue;
      shown.augEvents.add(seen);
      const other = playerNameById(next, iAmHolder ? targetId : holderId);
      showCutIn(
        def.title,
        "augment",
        iAmHolder ? def.holder(other) : def.target(other),
        def.ms ?? 2400,
        {
          sfx: () => sfx.augment(1),
          augId: head,
          ...(def.shake !== undefined ? { impact: { shake: def.shake } } : {}),
        },
      );
    }

    // 격(格) 지목 — 지목당한 사람에게만 전면 컷인 (지목형 공통 연출 규칙, docs/16 §2).
    // 지목은 국당 1회이고 국이 바뀌면 서버가 뷰를 null로 지우므로, 국 단위 키로 한 번만 알린다.
    for (const [key, raw] of Object.entries(next.augmentView ?? {})) {
      if (!key.startsWith("rank_gate:")) continue;
      const mark = raw as { round?: string; by?: string; target?: string; minHan?: number } | null;
      if (mark === null || typeof mark !== "object") continue;
      if (mark.target !== next.playerId) continue; // 피격자 전용 연출
      const seen = `${key}:${mark.round ?? ""}`;
      if (shown.rankGate.has(seen)) continue;
      shown.rankGate.add(seen);
      showCutIn("격(格)", "augment", `${playerNameById(next, mark.by ?? "")}에게 지목당했다 — 이번 국은 ${mark.minHan ?? 5}판 미만으로 화료할 수 없다`, 2400, {
        sfx: () => sfx.augment(1),
        augId: "rank_gate",
        impact: { shake: 2 },
      });
    }
  }

  function submitOption(option: ActionOption): void {
    // 소리를 가장 먼저 — 직렬화·전송·리렌더가 클릭과 소리 사이에 끼면 그만큼 늦게 들린다.
    if (DISCARD_LIKE.has(option.type)) {
      sfx.discard();
      // 진동은 소리와 **짝이 아니라 별개다** — 폰에서 소리를 끄고 하는 사람에게
      // 타패가 나갔다는 신호가 화면 말고 하나도 없었다(감사 §5-3).
      haptics.discard();
      rememberOwnDiscard(option.payload);
    }
    // 어느 좌석의 결정인가 — 봇 좌석을 조종 중이면 그 좌석(view.playerId)으로 답한다.
    const seat = view?.playerId;
    // 전송에 실패했으면(소켓이 닫혀 있었으면) **프롬프트를 그대로 둔다** — action은
    // VOLATILE이라 큐에 담기지 않고 버려진다(resendPolicy ①). 여기서 프롬프트를 내리면
    // 액티브 증강 발동이나 론/치·펑이 아무 흔적 없이 사라지고 다시 누를 수도 없다.
    // send()가 토스트로 알렸으니, 다시 붙은 뒤 같은 버튼을 누르면 된다.
    const sent = send({
      type: "action",
      actionType: option.type,
      payload: option.payload,
      ...(seat !== undefined ? { seat } : {}),
    } as ActionMessage);
    if (!sent) return;
    if (seat !== undefined) dropPrompt(seat);
    setRiichiMode(false);
  }

  function pickDraft(augmentId: string): void {
    if (draft === null || draftPicked) return;
    // draftPick도 VOLATILE이다 — 전송에 실패했는데 잠가 버리면 카드가
    // pointer-events:none 으로 굳은 채 "✓ 선택 완료"만 뜨고, 정작 서버는 아무것도
    // 받지 못해 타임아웃으로 대신 골라 준다. 실패하면 잠그지 않고 다시 누르게 둔다.
    if (!send({ type: "draftPick", stage: draft.stage, augmentId })) return;
    // 오버레이는 닫지 않고 "다른 플레이어 대기 중"으로 전환 — 전원 선택이 끝나면
    // 서버가 다음 프롬프트/뷰를 보내 오버레이가 닫힌다(뷰 핸들러가 draftPickedRef로 감지).
    setDraftPicked(true);
    draftPickedRef.current = true;
    sfx.pick();
  }

  /**
   * 슬롯 하나 새로고침 — 마음에 안 드는 카드 한 장을 갈아 끼운다 (슬롯당 1회).
   *
   * 버튼을 여기서 잠그지 않는다. 잠그는 것은 **서버가 새 카드를 보내 줬을 때**다
   * (`draftRerolled` 핸들러) — 전송이 실패했는데 미리 잠그면 이 슬롯의 한 번뿐인
   * 기회가 아무 일도 없이 사라진다. 연타는 서버가 슬롯당 1회로 막는다.
   */
  function rerollDraft(slot: number): void {
    if (draft === null || draftPicked) return;
    if (draft.rerollable?.[slot] !== true) return;
    if (!send({ type: "draftReroll", stage: draft.stage, slot })) return;
    sfx.pick();
  }

  /** 게임 무효(중단) 투표 — 전원 동의 시 서버가 게임을 무효 처리한다 */
  function voteAbort(vote: "agree" | "withdraw" | "reject"): void {
    send({ type: "voteAbort", vote });
    sfx.pick();
  }

  // ── 대기실 액션 ──
  function setReady(ready: boolean): void {
    send({ type: "ready", ready });
    sfx.pick();
  }
  function addBot(): void {
    send({ type: "addBot" });
    sfx.pick();
  }
  function removeBot(playerId: string): void {
    send({ type: "removeBot", playerId: playerId as LobbyPlayerEntry["playerId"] });
  }
  /** 봇 성향 지정 (방장 전용) — 그 자리의 봇을 지정한 원형으로 다시 앉힌다 */
  function setBotArchetype(playerId: string, archetype: string): void {
    send({
      type: "setBotArchetype",
      playerId: playerId as LobbyPlayerEntry["playerId"],
      archetype,
    });
    sfx.pick();
  }
  /** 강퇴 (방장 전용) — 내보낸 사람은 이 방에 다시 들어올 수 없다 */
  function kickPlayer(playerId: string): void {
    send({ type: "kickPlayer", playerId: playerId as LobbyPlayerEntry["playerId"] });
  }
  function startGame(): void {
    send({ type: "startGame" });
    sfx.round();
  }
  function setGameMode(mode: GameMode): void {
    send({ type: "setGameMode", mode });
    sfx.pick();
  }
  function setBotDifficulty(difficulty: string): void {
    send({ type: "setBotDifficulty", difficulty });
    sfx.pick();
  }
  /** 자리 섞기 (방장) — 서버가 동남서북을 다시 뽑아 대기실에 그대로 반영한다 */
  function shuffleSeats(): void {
    send({ type: "shuffleSeats" });
    sfx.pick();
  }

  /*
   * GameTable에 넘기는 콜백 — 여기서 한 번만 만든다 (useStableFn).
   * 예전에는 JSX 안에서 매 렌더 새 화살표 함수를 스무 개 만들었고, 그래서 App의 상태가
   * 하나만 바뀌어도(연출 시작/끝 두 번, 토스트 켜짐/꺼짐, 점수 이펙트, prodTick…)
   * 판 전체가 다시 그려졌다. 이제 GameTable은 memo 뒤에 있고, 판이 실제로 바뀔 때만 돈다.
   */
  const cbSandboxGrant = useStableFn((augmentId: string, target: string) =>
    send({ type: "sandboxGrant", augmentId, target }),
  );
  const cbSandboxReset = useStableFn(
    (augments: Record<string, string[]>, hands?: Record<string, string[]>) =>
      send({ type: "sandboxReset", augments, ...(hands !== undefined ? { hands } : {}) }),
  );
  const cbSandboxViewAs = useStableFn((seat: string) => send({ type: "sandboxViewAs", seat }));
  const cbSandboxBotRules = useStableFn((rules: SandboxBotRules) =>
    send({ type: "sandboxBotRules", rules }),
  );
  const cbSandboxControl = useStableFn((enabled: boolean) =>
    send({ type: "sandboxControl", enabled }),
  );
  const cbHandOrder = useStableFn((tileIds: number[]) => send({ type: "handOrder", tileIds }));
  const cbSetting = useStableFn(updateSetting);
  const cbSubmit = useStableFn(submitOption);
  const cbLeave = useStableFn(returnHome);
  // 사람이 나뿐인 판에서 나가기 = 무효 처리. 동의를 **먼저** 보내야 한다 —
  // 같은 소켓이라 서버가 순서대로 읽고, 내 동의로 정족수가 차 그 자리에서 판이 끝난다.
  // 반대로 leaveRoom이 먼저 가면 내 좌석이 자동 진행으로 넘어가 게임이 계속 돌아간다.
  const cbAbortLeave = useStableFn(() => {
    send({ type: "voteAbort", vote: "agree" });
    returnHome();
  });
  const cbVoteAbort = useStableFn(voteAbort);
  /**
   * 도감을 연다 — **카탈로그가 없으면 그때 요청한다** (감사 2026-08-17 §3-7).
   *
   * 예전에는 서버가 인증 뒤에만 카탈로그를 보냈다. 그런데 랜딩 → 규칙 → "증강이란"
   * 탭의 `📖 증강 도감 열기` 버튼은 인증과 무관하게 렌더돼서, 로그인 전에 누르면
   * **"0/0종 · 증강이 없습니다"**가 떴다 — 이 게임의 유일한 차별점을 보러 온
   * 사람에게 가장 나쁜 대답이다.
   *
   * 열 때 요청하는 이유: 카탈로그는 상세 설명까지 수십 KB다. `serverInfo`에 얹어
   * 모든 연결에 자동으로 보내면 도감을 안 여는 사람까지 그 비용을 낸다.
   */
  const openCodex = useStableFn(() => {
    if (Object.keys(catalog).length === 0) send({ type: "catalogRequest" });
    setCodexOpen(true);
  });
  const cbOpenCodex = openCodex;
  const cbOpenHelp = useStableFn(() => setHelpOpen(true));
  const cbGameToast = useStableFn((t: string) => showToast(t, "info"));

  // ── 화면 라우팅 ──
  const isSpectator = spectating !== null;
  const inGame = (joined !== null || isSpectator) && view !== null;
  const inWaiting = joined !== null && view === null && rankings === null && !isSpectator;
  const draftVisible = inGame && draft !== null && !intro && roundResult === null && !isSpectator;
  /*
   * 첫 판 코치가 보는 것 — 지금 고를 수 있는 선택지의 **종류**뿐이다.
   * (`prompt`가 바뀔 때만 다시 만든다: 코치는 매 프레임 이걸 훑는다.)
   */
  const promptOptionTypes = useMemo(
    () => new Set((prompt?.options ?? []).map((o) => o.type)),
    [prompt],
  );
  /** 그중 액티브 증강 발동이 있는가 — 액션 바의 색 판정(`act-aug`)과 같은 기준 */
  const promptHasAugment = useMemo(
    () =>
      (prompt?.options ?? []).some(
        (o) => ACTION_LABEL[o.type] === undefined || AUGMENT_ACTION_TYPES.has(o.type),
      ),
    [prompt],
  );
  const lastRoomCode = safeStorage.getItem(LAST_ROOM_KEY);

  return (
    <GlossaryTipsContext.Provider value={settings.glossaryTips}>
    {/* 판이 돌고 있을 때만 모드를 내려 준다 — 증강 설명의 "동풍전 N회 · 반장전 M회"가
        그 판의 숫자 하나로 줄어든다. 홈·도감에서는 null이라 둘 다 그대로 보인다. */}
    <GameModeContext.Provider value={view?.round.mode ?? null}>
    <div className="game-root" ref={gameRootRef}>
      <LayoutHint />
      <ScaleControl />
      {/* 기기를 돌려 달라는 안내. LayoutHint 는 '브라우저 확대'를 말하는 것이라
          터치 기기에서는 뜨지 않는다(맞는 판단이다) — 폰 세로에는 그래서 아무 안내도
          없었다. 뜨는 조건은 전부 CSS 미디어쿼리라 여기에 상태가 없었는데, **닫을 수가
          없어서** 한 번 읽고 나면 계속 자리를 차지했다(docs/28 §2-2). 닫기만 상태로 둔다 —
          어디에 뜰지는 여전히 CSS가 정한다. */}
      {rotateHintOff ? null : (
        <div className="rotate-hint" role="status">
          <span aria-hidden="true">⟳</span>
          <span>가로로 돌리면 네 자리가 다 보입니다.</span>
          <button
            type="button"
            className="rotate-hint-close"
            aria-label="안내 닫기"
            onClick={() => setRotateHintOff(true)}
          >
            ✕
          </button>
        </div>
      )}
      <EmoteFeed entries={emotes} />
      {/* 되묻는 창 — window.confirm 과 달리 메인 스레드를 멈추지 않는다(감사 §5-9) */}
      <ConfirmHost />
      {connection === "reconnecting" ? (
        <div className="reconnect-bar">
          <span className="reconnect-spin">⟳</span> 서버와 재연결 중…
        </div>
      ) : null}
      {auth === null ? (
        <AuthScreen
          connection={connection}
          serverInfo={serverInfo}
          serverError={authError}
          initialTab={authTab}
          invitedCode={pendingInviteRef.current}
          onGuest={() => {
            setAuthError(null);
            /*
             * 체험에는 **코치를 얹지 않는다** (2026-08-18).
             *
             * 예전에는 처음 온 손님에게 자동으로 코치를 붙였다 — 안내로 가는 문이
             * 이것 하나뿐이었기 때문이다. 이제 옆에 튜토리얼 버튼이 따로 있고,
             * 랜딩이 "체험은 설명 없이 바로 한 판"이라고 적어 놓았다. 적어 놓은 것과
             * 실제가 달라지면 안 된다.
             *
             * 기술적인 이유도 있다: 코치의 증강 강의(⚡ 버튼·발광·보라 생성패)는
             * 튜토리얼 방이 **연금술사를 고정 지급한다**는 사실 위에 서 있다
             * (`TUTORIAL_ROOM_NOTE`). 무작위 판에서는 그 강의들이 성립하지 않거나
             * 없는 증강 이름을 부른다.
             */
            send({ type: "guestPlay" });
          }}
          onTutorial={() => {
            setAuthError(null);
            // **일부러 누른 사람**이다 — 저장된 "이미 봤다"와 무관하게 코치를 켠다.
            setCoachOn(true);
            send({ type: "guestPlay", tutorial: true });
          }}
          onOpenHelp={() => setHelpOpen(true)}
          onLogin={(u, p) => send({ type: "login", username: u, password: p })}
          onRegister={(u, p, code, signup) => {
            // authOk는 가입과 로그인을 구별해 주지 않는다 — 여기서 표시해 둔다.
            justRegistered.current = true;
            send({
              type: "register",
              username: u,
              password: p,
              ...(code !== "" ? { adminCode: code } : {}),
              ...(signup !== "" ? { signupCode: signup } : {}),
            });
          }}
          onRetryConnect={connect}
        />
      ) : replayData !== null ? (
        <ReplayViewer
          data={replayData}
          settings={settings}
          onSetting={updateSetting}
          onClose={() => setReplayData(null)}
        />
      ) : inGame && view !== null ? (
        <GameTable
          view={view}
          {...(isSpectator ? {} : { onEmote: sendEmote })}
          roundView={centerView ?? view}
          prompt={prompt}
          promptSeq={promptSeq}
          promptDeadline={promptDeadline}
          riichiMode={riichiMode}
          catalog={catalog}
          scoreFx={scoreFx}
          settings={settings}
          spectator={isSpectator}
          spectateCode={spectating}
          logEvents={logEvents}
          botDifficulty={isSpectator ? null : (lobby?.botDifficulty ?? null)}
          pastRounds={roundHistory}
          abortVote={abortVote}
          onVoteAbort={cbVoteAbort}
          sandbox={sandbox}
          controlling={controlling}
          selfPending={sandbox !== null && prompts[sandbox.seat] !== undefined}
          onSandboxGrant={cbSandboxGrant}
          onSandboxReset={cbSandboxReset}
          onSandboxViewAs={cbSandboxViewAs}
          onSandboxBotRules={cbSandboxBotRules}
          onSandboxControl={cbSandboxControl}
          {...(isSpectator ? {} : { onHandOrder: cbHandOrder })}
          onSetting={cbSetting}
          onRiichiMode={setRiichiMode}
          onSubmit={cbSubmit}
          onLeave={cbLeave}
          onAbortLeave={cbAbortLeave}
          onOpenCodex={cbOpenCodex}
          onOpenHelp={cbOpenHelp}
          onToast={cbGameToast}
        />
      ) : inWaiting ? (
        <WaitingRoom
          lobby={lobby}
          roomId={joined?.roomId ?? ""}
          settings={settings}
          onSetting={updateSetting}
          onReady={setReady}
          onAddBot={addBot}
          onRemoveBot={removeBot}
          onSetBotArchetype={setBotArchetype}
          onKick={kickPlayer}
          onStart={startGame}
          onSetGameMode={setGameMode}
          onSetBotDifficulty={setBotDifficulty}
          onShuffleSeats={shuffleSeats}
          onLeave={returnHome}
          onToast={(t) => showToast(t, "info")}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenCodex={openCodex}
          onEmote={sendEmote}
        />
      ) : tierOpen ? (
        <TierScreen
          data={augmentTiers}
          onRefresh={() => send({ type: "adminAugmentTiers" })}
          onClose={() => setTierOpen(false)}
        />
      ) : auth.guest ? (
        // 게스트는 홈이 없다 — 홈의 카드는 전부 계정 기능이라 서버가 거절한다.
        // 체험이 끝난 자리에서 다음 한 걸음(한 판 더 / 계정 만들기)만 제시한다.
        <GuestOutro
          username={auth.username}
          onPlayAgain={() => send({ type: "guestPlay" })}
          onOpenCodex={openCodex}
          onOpenHelp={() => setHelpOpen(true)}
          onSignUp={() => logout("register")}
        />
      ) : (
        <HomeScreen
          auth={auth}
          stats={stats}
          replays={myReplays}
          liveRooms={liveRooms}
          leaderboard={leaderboard}
          catalog={catalog}
          adminUsers={adminUsers}
          feedback={feedback}
          onSubmitFeedback={(kind, title, body) =>
            send({ type: "feedbackSubmit", kind, title, body })
          }
          onRefreshFeedback={() => send({ type: "feedbackList" })}
          onUpdateFeedback={(id, patch) => send({ type: "feedbackUpdate", id, ...patch })}
          onDeleteFeedback={(id) => {
            void askConfirm({
              title: "이 제보를 삭제할까요?",
              body: "되돌릴 수 없습니다.",
              confirmLabel: "삭제",
              danger: true,
            }).then((ok) => {
              if (ok) send({ type: "feedbackDelete", id });
            });
          }}
          lastRoomCode={lastRoomCode}
          settings={settings}
          onSetting={updateSetting}
          onCreateRoom={() => send({ type: "createRoom" })}
          onJoinRoom={(code) => send({ type: "joinRoom", code })}
          onOpenReplay={(gameId) => send({ type: "replayGet", gameId })}
          onOpenCodex={() => { openCodex(); refreshHome(); }}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenTiers={() => { setTierOpen(true); send({ type: "adminAugmentTiers" }); }}
          augmentTiers={augmentTiers}
          onRefreshLive={() => send({ type: "liveGames" })}
          onSpectate={(code) => send({ type: "spectate", code })}
          onRefreshUsers={() => send({ type: "adminUsers" })}
          onStartSandbox={(mode) => send({ type: "sandboxStart", mode })}
          onPractice={(tutorial) => {
            // 튜토리얼을 **직접 누른** 사람은 다시 배우고 싶다는 뜻이다 — 저장된
            // "이미 봤다"와 무관하게 코치를 켠다. 연습 대국 쪽은 안내를 붙이지
            // 않는다(그 버튼의 약속이 "안내 없음"이다).
            setCoachOn(tutorial);
            send({ type: "practicePlay", ...(tutorial ? { tutorial: true } : {}) });
          }}
          onDeleteUser={(userId, username) => {
            void askConfirm({
              title: `'${username}' 계정을 삭제할까요?`,
              body: "계정과 누적 전적이 함께 지워집니다. 되돌릴 수 없습니다.",
              confirmLabel: "계정 삭제",
              danger: true,
            }).then((ok) => {
              if (ok) send({ type: "adminDeleteUser", userId });
            });
          }}
          onRefresh={refreshHome}
          onLogout={logout}
        />
      )}

      {/* 도감·규칙은 **어느 화면 위에도** 뜨는 오버레이다.
          예전에는 도감이 홈 라우팅 분기에 있어, 정작 필요한 순간 — 상대가 방금 공개한
          증강이 무엇인지 궁금한 드래프트·대국 중 — 에 열 수 없었다. 아래 화면은 그대로
          살아 있으므로 게임 상태도 결정 타이머도 건드리지 않는다. */}
      {/* 도움말이 도감보다 **먼저** 그려진다 — 도움말의 "증강이란"에서 도감을 열면
          도감이 그 위에 얹히고, 닫으면 읽던 자리로 그대로 돌아온다. */}
      {helpOpen ? (
        <ScreenOverlay label="규칙 · 도움말" onClose={() => setHelpOpen(false)}>
          <HelpScreen
            augmentKinds={augmentKinds}
            backLabel={auth === null ? "← 로그인으로" : "← 닫기"}
            onOpenCodex={openCodex}
            onClose={() => setHelpOpen(false)}
          />
        </ScreenOverlay>
      ) : null}
      {codexOpen ? (
        <ScreenOverlay label="증강 도감" onClose={() => setCodexOpen(false)}>
          <CodexScreen
            catalog={catalog}
            career={stats?.career.find((e) => e.nickname === auth?.username)?.stats ?? null}
            leaderboard={leaderboard}
            backLabel={helpOpen || inGame || inWaiting || auth?.guest === true ? "← 닫기" : "← 홈으로"}
            onRefresh={() => { if (auth?.guest !== true) refreshHome(); }}
            onClose={() => setCodexOpen(false)}
          />
        </ScreenOverlay>
      ) : null}

      {inGame && intro && !isSpectator ? <IntroOverlay view={view!} /> : null}
      {/* 첫 판 코치 — 개막 연출 중에는 비켜 둔다(그 3초는 판을 보라고 있는 시간이다) */}
      {coachOn && inGame && !intro && !isSpectator ? (
        <TutorialCoach
          ctx={{
            view,
            optionTypes: promptOptionTypes,
            draftOpen: draftVisible,
            augmentReady: promptHasAugment,
            overlay: helpOpen ? "help" : codexOpen ? "codex" : null,
          }}
          // 도감·규칙이 판을 덮는 동안은 그림만 걷는다 (컴포넌트 주석 참고)
          hidden={helpOpen || codexOpen}
          onFinish={() => {
            setCoachOn(false);
            tutorialDone.current = true;
            safeStorage.setItem(TUTORIAL_KEY, "1");
          }}
        />
      ) : null}
      {draftVisible && draft !== null ? (
        <DraftOverlay
          draft={draft}
          deadlineAt={draftDeadline.current}
          onPick={pickDraft}
          onReroll={rerollDraft}
          picked={draftPicked}
          owned={view?.players.find((p) => p.id === view.playerId)?.augments ?? []}
          catalog={catalog}
        />
      ) : null}
      {activeProd !== null && activeProd.channel === "banner" && activeProd.tone === "riichi" ? (
        // 리치 전용 풀 연출 — 비네트 암전 + 붉은 밴드 + 천점봉 슬라이드-인 + 금속성 글자
        <div
          key={activeProd.key}
          className="riichi-stage"
          style={{ "--prod-ttl": `${prodTtl}ms` } as CSSProperties}
        >
          <div className="riichi-vignette" />
          <div className="riichi-band">
            <div className="riichi-stick"><i className="riichi-stick-dot" /></div>
            <div className="riichi-body">
              <span className="riichi-text">{activeProd.text}</span>
              {activeProd.sub !== undefined ? <span className="riichi-sub">{activeProd.sub}</span> : null}
              {activeProd.tiles !== undefined ? (
                <span className="banner-tiles">
                  {activeProd.tiles.map((kind, i) => <TileImg key={i} tile={{ kind }} size="result" />)}
                </span>
              ) : null}
            </div>
          </div>
          {settings.screenFx ? <div className="riichi-flash" /> : null}
        </div>
      ) : activeProd !== null && activeProd.channel === "banner" ? (
        <div key={activeProd.key} className={`banner banner-${activeProd.tone}`}>
          <span className="banner-text">{activeProd.text}</span>
          {activeProd.sub !== undefined ? <span className="banner-sub">{activeProd.sub}</span> : null}
          {activeProd.tiles !== undefined ? (
            <span className="banner-tiles">
              {activeProd.tiles.map((kind, i) => <TileImg key={i} tile={{ kind }} size="result" />)}
            </span>
          ) : null}
        </div>
      ) : null}
      {activeProd !== null && activeProd.channel === "cutin" ? (
        <div
          key={activeProd.key}
          className={
            `cutin cutin-${activeProd.tone}` +
            (CALL_CUTIN_TONES.has(activeProd.tone) ? " cutin-call" : "") +
            (AUGMENT_CUTIN_TONES.has(activeProd.tone) ? " cutin-aug" : "")
          }
          {...(activeProd.tier !== undefined ? { "data-tier": activeProd.tier } : {})}
          {...(activeProd.augId !== undefined
            ? { "data-aug-cat": augmentCategory(activeProd.augId) }
            : {})}
          style={{ "--prod-ttl": `${prodTtl}ms` } as CSSProperties}
        >
          {settings.screenFx && AUGMENT_CUTIN_TONES.has(activeProd.tone) ? (
            <>
              <div className="cutin-bolt" />
              <div className="cutin-bolt cutin-bolt-2" />
              <div className="cutin-scan" />
            </>
          ) : null}
          {settings.screenFx && RAYS_TONES.has(activeProd.tone) ? <div className="cutin-rays" /> : null}
          {settings.screenFx && RING_TONES.has(activeProd.tone) ? <div className="cutin-ring" /> : null}
          {settings.screenFx && activeProd.tone === "yakuman" ? (
            <div className="cutin-ring cutin-ring-2" />
          ) : null}
          <div className="cutin-band" />
          <div className="cutin-body">
            {activeProd.augId !== undefined ? (
              <span className="cutin-aug-icon" aria-hidden="true">
                {CATEGORY_META[augmentCategory(activeProd.augId)].icon}
              </span>
            ) : null}
            {/* 배수 역만("더블 역만" 등)은 글자가 길다 — 자간 큰 컷인이 밴드를 넘지 않게 CSS에 알린다 */}
            <span className="cutin-text" data-long={activeProd.text.replace(/\s/g, "").length >= 4 ? "1" : undefined}>
              {activeProd.text}
            </span>
            {activeProd.sub !== undefined ? <span className="cutin-sub">{activeProd.sub}</span> : null}
            {activeProd.tiles !== undefined ? (
              <span className="cutin-tiles">
                {activeProd.tiles.map((kind, i) => (
                  <Fragment key={i}>
                    {/* 바뀌기 전 ↔ 후를 가르는 화살표. 없으면 그냥 늘어놓는다. */}
                    {i === activeProd.tileArrowAt ? (
                      <span className="cutin-tiles-arrow" aria-hidden="true">→</span>
                    ) : null}
                    <TileImg tile={{ kind }} size="result" />
                  </Fragment>
                ))}
              </span>
            ) : null}
          </div>
          {settings.screenFx && BURST_COUNT[activeProd.tone as CutInTone] !== undefined ? (
            <CutInBurst
              seed={activeProd.key}
              count={(BURST_COUNT[activeProd.tone as CutInTone] ?? 0)
                + (activeProd.tier !== undefined ? TIER_BONUS[activeProd.tier] : 0)}
            />
          ) : null}
          {settings.screenFx && activeProd.tone === "yakuman" ? (
            <YakumanConfetti seed={activeProd.key} />
          ) : null}
          {settings.screenFx && RAYS_TONES.has(activeProd.tone) ? <div className="cutin-flash" /> : null}
          {settings.screenFx && activeProd.tone === "yakuman" ? (
            <div className="cutin-flash cutin-flash-2" />
          ) : null}
        </div>
      ) : null}
      {/* 연출 건너뛰기 — 연출 자체는 pointer-events:none 이라 클릭을 안 받는다(판을 가리면 안 되므로).
          손잡이를 이 버튼 하나로 따로 세운다. 뒤에 쌓인 개수도 같이 보여 준다 —
          증강이 몰린 국에서는 컷인이 줄줄이 서서, 몇 번을 더 눌러야 하는지가 정보다. */}
      {activeProd !== null ? (
        <button
          type="button"
          className="prod-skip"
          onClick={skipProduction}
          title="연출 건너뛰기 (Esc · Space)"
        >
          건너뛰기
          {productionQueue.current.length > 0 ? (
            <span className="prod-skip-more">+{productionQueue.current.length}</span>
          ) : null}
          <span className="prod-skip-key" aria-hidden="true">Esc</span>
        </button>
      ) : null}
      {/* 연출 텍스트를 보조기술에 읽어 주는 유일한 통로. 리치·후로·화료·증강 발동이
          전부 이 큐를 지나므로, 여기 한 곳만 live로 열어 두면 게임 사건 전체가 들린다. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {activeProd !== null
          ? `${activeProd.text}${activeProd.sub !== undefined ? ` — ${activeProd.sub}` : ""}`
          : ""}
      </div>
      {roundResult !== null && view !== null ? (
        <RoundResultPanel
          result={roundResult}
          view={view}
          catalog={catalog}
          deadlineAt={roundResultDeadline.current}
          onClose={closeRoundResult}
        />
      ) : null}
      {rankings !== null ? (
        <GameOverModal
          {...(lastGameId === null
            ? {}
            : { onOpenReplay: () => send({ type: "replayGet", gameId: lastGameId }) })}
          rankings={rankings}
          endReason={gameEndReason}
          stats={stats}
          onClose={returnHome}
          {...(canContinue && !isSpectator
            ? { onContinue: continueInRoom, sandbox: sandbox !== null }
            : {})}
        />
      ) : null}
      {/*
        `role="status"`(= aria-live polite)로 연다 (감사 §5-8). 예전에는 아무 역할도
        없어서, "시간 초과 — 패스로 자동 진행했습니다" 같은 **가장 중요한 통보**가
        보조기술에 전혀 가지 않았다. 연출 텍스트는 sr-only live region으로 제대로
        열어 뒀는데 정작 토스트만 빠져 있었다.
      */}
      {toasts.length > 0 ? (
        <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <div key={t.key} className={`toast toast-${t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>
      ) : null}
      <PeekButton />
    </div>
    </GameModeContext.Provider>
    </GlossaryTipsContext.Provider>
  );
}

// ─────────────────── 잠깐 보기 (가려진 게임판 훔쳐보기) ───────────────────

/** 잠깐 보기 버튼이 따라붙는 창들 — 이게 떠 있을 때만 버튼이 나온다 */
const PEEK_OVERLAY_SEL = ".overlay-peekable, .rinshan-pick-overlay";
/** 버튼을 바로 아래에 붙일 패널 (창의 실제 내용 상자) */
const PEEK_PANEL_SEL = ".draft-panel, .rinshan-pick-panel, .result-panel";
/** 패널과 버튼 사이 간격 (px) */
const PEEK_GAP = 10;

/**
 * 증강 선택창·증강 사용 모달이 게임판을 통째로 덮을 때, **누르고 있는 동안만**
 * 그 창을 투명하게 만들어 밑에 뭐가 있었는지 확인시켜 주는 버튼.
 *
 * 보기 전용이다 — 훔쳐보는 동안에도 덮개(오버레이 루트)는 그대로 화면을 덮고 있어
 * 클릭이 게임판까지 내려가지 않는다(styles.css의 `body.peeking` 규칙).
 *
 * 위치는 **떠 있는 창 패널 바로 아래**다. 화면 맨 아래에 두었더니 눈길이 가 있는
 * 증강 카드에서 너무 멀어 있는 줄도 몰랐다(2026-08-05 사용자 피드백). 패널 높이는
 * 내용에 따라 제각각이라 CSS로는 못 맞춘다 — 창이 떠 있는 동안만 패널을 재서 따라간다.
 * 아래에 자리가 없으면(패널이 화면을 거의 채우면) 화면 아래 끝으로 물러난다.
 */
function PeekButton(): JSX.Element | null {
  const [peeking, setPeeking] = useState(false);
  // null = 붙을 창이 없다(=버튼을 그리지 않는다)
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  /*
   * 붙을 창이 떠 있는가.
   *
   * 예전에는 아래 측정 인터벌이 **세션 내내, 로비에서까지** 10Hz로 돌았다. 창이 없을 때도
   * querySelectorAll이 돌고, 창이 하나라도 뜨면 getBoundingClientRect가 초당 열 번
   * 동기 레이아웃을 강제한다 — 패 200여 장이 같이 서 있는 화면에서 공짜가 아니다.
   * 창이 뜨고 지는 것은 DOM 변화이므로 MutationObserver로 잡고, 인터벌은 **창이 떠 있는
   * 동안만** 돈다(그때는 패널이 커지는 것을 따라가야 해서 감시가 아니라 추적이 필요하다).
   */
  const [hasPanel, setHasPanel] = useState(false);
  useEffect(() => {
    const check = (): void => {
      setHasPanel(document.querySelector(PEEK_OVERLAY_SEL) !== null);
    };
    check();
    // 오버레이는 전부 body 직속 포털이다(FIXED_SURFACE_NOTE) — subtree까지 볼 필요가 없다.
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    if (!hasPanel) {
      setSpot((cur) => (cur === null ? cur : null));
      return;
    }
    const measure = (): void => {
      const panels = document.querySelectorAll(PEEK_PANEL_SEL);
      // 창이 겹쳐 뜨면 맨 나중 것이 위에 있다 (모달들은 body 끝으로 포탈된다)
      const panel = panels[panels.length - 1];
      if (document.querySelector(PEEK_OVERLAY_SEL) === null || panel === undefined) {
        setSpot((cur) => (cur === null ? cur : null));
        return;
      }
      const r = panel.getBoundingClientRect();
      const h = btnRef.current?.offsetHeight ?? 34;
      // rect는 화면 좌표, 인라인 top/left는 레이아웃 좌표다 (uiScale.ts 참고)
      const v = layoutViewport();
      const top = Math.max(8, Math.min(toLayoutPx(r.bottom) + PEEK_GAP, v.h - h - 8));
      const left = toLayoutPx((r.left + r.right) / 2);
      setSpot((cur) =>
        cur !== null && Math.abs(cur.top - top) < 0.5 && Math.abs(cur.left - left) < 0.5
          ? cur
          : { top, left },
      );
    };
    measure();
    // 패널이 내용에 따라 커지는 것을 따라가야 해서 주기적으로 잰다. 창이 떠 있는 동안만이다.
    // 10Hz면 눈에 띄지 않고(위치는 CSS transition으로 이어 붙인다) 이 짧은 구간에서는 값싸다.
    const timer = window.setInterval(measure, 100);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [hasPanel]);
  useEffect(() => {
    document.body.classList.toggle("peeking", peeking);
    return () => document.body.classList.remove("peeking");
  }, [peeking]);
  // 버튼 밖에서(창 밖에서도) 손을 떼거나 창이 포커스를 잃으면 반드시 원래대로 돌아온다 —
  // 안 그러면 오버레이가 투명한 채로 굳어 아무것도 고를 수 없게 된다.
  useEffect(() => {
    if (!peeking) return;
    const off = (): void => setPeeking(false);
    window.addEventListener("pointerup", off);
    window.addEventListener("pointercancel", off);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("pointerup", off);
      window.removeEventListener("pointercancel", off);
      window.removeEventListener("blur", off);
    };
  }, [peeking]);
  if (spot === null) return null;
  return createPortal(
    <button
      ref={btnRef}
      type="button"
      className={`peek-btn${peeking ? " peek-btn-on" : ""}`}
      style={{ top: `${spot.top}px`, left: `${spot.left}px` }}
      aria-label="누르고 있는 동안 게임판 보기"
      onPointerDown={(e) => {
        e.preventDefault();
        setPeeking(true);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") setPeeking(true);
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") setPeeking(false);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="peek-btn-icon" aria-hidden="true">👁</span>
      <span className="peek-btn-text">{peeking ? "떼면 다시 덮임" : "누른 채로 게임판 보기"}</span>
    </button>,
    document.body,
  );
}

// ─────────────────────────── 개막 연출 ───────────────────────────

function IntroOverlay({ view }: { view: PlayerView }): JSX.Element {
  const r = view.round;
  const me = view.players.find((p) => p.id === view.playerId);
  const windKo = me !== undefined ? (WIND_KO[seatWindIdx(view, me)] ?? "?") : "?";
  return (
    <div className="intro-overlay">
      <div className="intro-line" />
      <div className="intro-title">대 국 시 작</div>
      <div className="intro-round">
        {WIND_KO[r.prevalentWind - 1] ?? "동"}
        {r.roundNumber}국
      </div>
      <div className="intro-seat">내 자리 — {windKo}</div>
      <div className="intro-line" />
    </div>
  );
}

// ─────────────────────────── 첫 판 코치 (튜토리얼) ───────────────────────────

/**
 * 진행 중인 판 위에 얹히는 안내 — 강조 링 + 말풍선.
 *
 * 무엇을 언제 말할지는 전부 `tutorial.ts`가 정한다. 이 컴포넌트가 하는 일은 셋뿐이다:
 * 지금 꺼낼 강의를 붙들고, 그 강의가 가리키는 요소를 화면에서 찾아 링을 씌우고,
 * 사용자가 그 조작을 마치면(`done`) 다음으로 넘긴다.
 *
 * **판을 가리지도, 막지도 않는다.** 오버레이 전체가 `pointer-events: none`이고
 * 말풍선의 버튼만 클릭을 받는다 — "이 패를 누르세요"라고 해 놓고 그 패를 못 누르게
 * 만드는 것만큼 나쁜 안내가 없다.
 *
 * 좌표는 `toLayoutPx`로 되돌린다. `getBoundingClientRect()`는 UI 배율이 곱해진 화면
 * 좌표인데 인라인 `left/top`은 레이아웃 좌표라, 안 되돌리면 배율이 1이 아닌 화면에서
 * 링이 엉뚱한 데로 간다 (`uiScale.ts` 참고).
 */
function TutorialCoach(props: {
  ctx: Omit<CoachCtx, "seen" | "hit">;
  /**
   * 판 위에 전체 화면(도감·규칙)이 떠 있다 — 말풍선을 **그리지 않는다**.
   *
   * 언마운트가 아니라 숨김인 것이 요점이다. `ScreenOverlay`가 형제 요소에 `inert`를
   * 걸므로 코치는 z-index로는 위에 있으면서 클릭은 안 받는 유령이 된다. 그렇다고
   * 통째로 언마운트하면 여태 본 강의(`seen`)가 통째로 날아가 튜토리얼이 처음부터
   * 다시 시작한다. 상태 기계는 계속 돌리고 그림만 걷는다 — 그래야 "도감을 열었다"가
   * 완료로 잡히고, 닫는 순간 다음 강의가 이어진다.
   */
  hidden: boolean;
  /** 끝까지 봤거나 사용자가 그만 보기를 눌렀다 */
  onFinish: () => void;
}): JSX.Element | null {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ring, setRing] = useState<{ top: number; left: number; w: number; h: number } | null>(null);

  /*
   * 화면에 그 요소가 지금 떠 있는가 — 강의의 성립/완료 판정에 쓰는 유일한 통로.
   *
   * `tick`으로 일부러 다시 만든다. `hit`은 DOM을 읽는 함수라 값이 변해도 리액트는
   * 알 길이 없다 — 예전처럼 매 렌더 판정만 하면, 설명을 고정하거나 액티브 버튼에
   * 손을 올려도 **리렌더가 없으면** 코치가 그걸 영영 모른다. 강의가 떠 있는 동안만
   * 도는 짧은 주기 하나로 링 측정과 같은 리듬을 맞춘다.
   */
  const [, setTick] = useState(0);
  const hit = useStableFn((selector: string): boolean => {
    const el = document.querySelector(selector);
    if (el === null) return false;
    // `display:none`으로 숨긴 것은 "떠 있다"가 아니다 (반응형에서 통째로 꺼지는 줄이 있다)
    return (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0;
  });

  const ctx: CoachCtx = { ...props.ctx, seen, hit };
  const active: Lesson | null =
    activeId === null ? null : (LESSONS.find((l) => l.id === activeId) ?? null);

  // 다음 강의를 집는다 — 붙들고 있는 것이 없을 때만.
  // 가려져 있는 동안(도감·규칙)에는 집지 않는다: 안 보이는 채로 강의가 흘러가면
  // 닫고 돌아왔을 때 이미 몇 개가 지나가 있다.
  useEffect(() => {
    if (activeId !== null || props.hidden) return;
    const next = pickLesson(ctx);
    if (next !== null) setActiveId(next.id);
  });

  const retire = useStableFn((id: string) => {
    setSeen((prev) => new Set(prev).add(id));
    setActiveId(null);
    if (id === "outro") props.onFinish();
  });

  // 사용자가 그 조작을 실제로 마쳤으면 저절로 넘어간다
  useEffect(() => {
    if (active?.done?.(ctx) === true) retire(active.id);
  });

  /*
   * 읽던 강의를 밀어내고 끼어드는 강의 — 지금 화면에서 벌어지는 일이 먼저다.
   *
   * 밀려난 강의는 **`seen`에 넣지 않는다.** 기회가 지나가면 픽커가 다시 집어
   * 준다 — 끼어들기로 잃는 내용이 없다는 것이 이 방식의 요점이다.
   */
  useEffect(() => {
    if (props.hidden || active === null || active.urgent === true) return;
    const cut = pickUrgent(ctx);
    if (cut !== null) setActiveId(cut.id);
  });

  /*
   * DOM만 봐서 알 수 있는 조작(고정·발광·생성패…)을 놓치지 않게 짧은 주기로 깨운다.
   * 강의를 붙들고 있을 때만 돈다 — 튜토리얼이 끝나면 아무것도 안 돈다.
   */
  const watching = activeId !== null;
  useEffect(() => {
    if (!watching) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 200);
    return () => window.clearInterval(timer);
  }, [watching]);

  /*
   * 강조 링의 자리. 손패 레일도 액션 바도 애니메이션으로 움직이므로 한 번 재고 마는
   * 것으로는 곧 어긋난다 — 강의가 떠 있는 동안만 짧은 주기로 다시 잰다(리스너를
   * 늘리는 것보다 이쪽이 단순하고, 안 뜰 때는 아무것도 안 돈다).
   */
  const anchor = props.hidden ? undefined : active?.anchor;
  useEffect(() => {
    if (anchor === undefined) {
      setRing(null);
      return;
    }
    const measure = (): void => {
      const el = document.querySelector(anchor);
      if (el === null) return setRing(null);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return setRing(null);
      const pad = 6;
      setRing({
        top: toLayoutPx(r.top) - pad,
        left: toLayoutPx(r.left) - pad,
        w: toLayoutPx(r.width) + pad * 2,
        h: toLayoutPx(r.height) + pad * 2,
      });
    };
    measure();
    const timer = window.setInterval(measure, 160);
    return () => window.clearInterval(timer);
  }, [anchor]);

  if (active === null || props.hidden) return null;

  /*
   * 말풍선은 강조한 자리의 **반대쪽 끝**에 붙인다 — 바로 옆이 아니라.
   *
   * 처음에는 링 바로 위/아래에 뒀는데, 강조가 손패일 때 말풍선이 정확히 **액션 바
   * 자리**에 앉았다(2026-08-18 실측). 치·퐁·리치 버튼이 뜨는 그 줄이 판에서 가장
   * 중요한 자리라, 하필 안내가 그걸 가린다. 화면 끝으로 밀면 링과 조금 떨어지지만
   * 링이 금색으로 맥동하고 있어 무엇을 가리키는지는 잃지 않는다.
   */
  const v = layoutViewport();
  /*
   * 말풍선은 **언제나 위쪽 띠**에 있는다. 아래쪽 절반에는 손패와 액션 바(치·퐁·
   * 리치·론)가 있고, 그 줄은 판에서 가장 중요한 자리라 잠깐도 가리면 안 된다.
   * 위쪽은 이름표와 패산이라 잠시 덮여도 잃는 것이 없다.
   *
   * 예전에는 강조가 화면 맨 위에 붙어 있으면 말풍선을 **아래로** 내렸다. 오른쪽 위
   * 아이콘 줄(⚙ 📖 📘)을 가리키는 강의가 생기면서 그 예외가 정확히 하지 말자던 일을
   * 했다 — 손패와 액션 바를 통째로 덮었다(2026-08-18 실측). 이제 그런 경우에는
   * 아래로 가는 대신 **강조 바로 밑**에 붙는다. 여전히 위쪽 띠 안이고, 가리키는
   * 것과 설명이 붙어 있어 오히려 읽기 쉽다.
   */
  const topBandRing = ring !== null && ring.top + ring.h < v.h * 0.28;
  const bubble: CSSProperties = topBandRing
    ? { top: ring.top + ring.h + 10, left: "50%", transform: "translateX(-50%)" }
    : { top: 12, left: "50%", transform: "translateX(-50%)" };

  return (
    <div className="coach-layer" role="dialog" aria-live="polite" aria-label="튜토리얼 안내">
      {ring !== null ? (
        <div
          className="coach-ring"
          style={{ top: ring.top, left: ring.left, width: ring.w, height: ring.h }}
        />
      ) : null}
      <div className="coach-bubble" style={bubble}>
        {/* 장(章) 이름 — "지금 무슨 이야기 중인지"를 한 낱말로 준다.
            진행률 막대는 일부러 안 쓴다: 안 오는 기회(후로·화료)는 그냥 안 나오므로
            분모가 거짓말이 되고, 100%에 못 닿는 막대는 안 끝난 것처럼 보인다. */}
        <p className="coach-chapter">{active.chapter}</p>
        <p className="coach-title">{active.title}</p>
        <p className="coach-body">{active.body}</p>
        {/* 직접 해 보라는 줄 — 읽고 넘기는 강의와 눈으로 갈린다 */}
        {active.todo !== undefined ? (
          <p className="coach-todo">
            <span className="coach-todo-tag" aria-hidden="true">해 보세요</span>
            {active.todo}
          </p>
        ) : null}
        <div className="coach-actions">
          {/* `done`이 있는 강의는 조작을 마치면 저절로 넘어간다 — 그래도 버튼을 둔다.
              읽기만 하고 넘어가고 싶은 사람에게 출구가 없으면 안내가 감옥이 된다.
              대신 글자를 갈아 끼운다: 해 보라고 해 놓고 "알겠어요"라고 적으면
              누른 사람은 자기가 그걸 했다고 오해한다. */}
          <button
            className={active.todo === undefined ? "coach-next" : "coach-next coach-skip"}
            onClick={() => retire(active.id)}
          >
            {active.todo === undefined ? "알겠어요" : "건너뛰기"}
          </button>
          <button className="coach-quit" onClick={props.onFinish}>
            그만 보기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 로비 ───────────────────────────

/**
 * 로그인 전 첫 화면 — **랜딩 + 인증 폼**.
 *
 * 예전에는 여기가 로그인 폼과 여섯 글자짜리 태그라인이 전부였다. 처음 온 사람은
 * 이게 무슨 게임인지, 왜 가입해야 하는지 알 도리가 없었고, 가입 게이트가 켜진
 * 공개 서버에서는 폼을 다 채운 뒤에야 3.2초짜리 토스트로 거절당했다.
 * 지금은 (1) 무엇인지 먼저 말하고, (2) 계정 없이 바로 한 판을 주고,
 * (3) 가입이 초대제인지 서버가 알려 준 사실대로 적는다.
 */
/**
 * 랜딩에서 보여 줄 증강 셋 — **실제로 구현된 것**만 쓴다.
 *
 * 여기 적힌 이름·효과는 `packages/content` 의 것을 그대로 옮긴 것이다. 광고용으로
 * 없는 기능을 지어내면 첫 판에서 바로 들통난다. 셋을 고른 기준은 "한 줄로 이해되고,
 * 마작을 알든 모르든 규칙이 흔들린다는 게 보이는가"다.
 *
 * 패 그림은 도움말과 같은 컴포넌트(HelpTileGroups)·같은 에셋을 쓴다.
 *
 * # 왜 **바뀌기 전 → 바뀐 뒤** 인가 (2026-08-18)
 *
 * 예전에는 증강마다 패 세 장을 그냥 늘어놓았다(사방치기 456m · 단색 세계 123p ·
 * 함구령 777s). 그 패들은 효과와 아무 상관이 없어서, 보는 사람에게는 **무엇을
 * 설명하는 그림인지 알 수 없는 장식**이었다 — "사진이 빈약해서 오히려 별로다,
 * 뭘 설명하는 건지 모르게 됐다"(사용자 지적).
 *
 * 규칙이 바뀐다는 것은 정지 화면으로는 보여 줄 수 없다. **무엇이 무엇으로 바뀌는지**
 * 두 상태를 나란히 놓아야 비로소 그림이 말을 한다. 그래서 셋을 전부 "이랬던 것이
 * 이렇게 된다"로 세웠고, 그 형태에 맞는 증강만 골랐다 — 셋 다 실제 구현된 것이다.
 */
const LANDING_SHOWCASE: {
  name: string;
  kind: string;
  /** 바뀌기 전 */
  before: string;
  /** 바뀐 뒤 */
  after: string;
  /** 그림 밑에 붙는 한 줄 — 그림이 무엇을 보여 준 것인지 못 박는다 */
  cap: string;
  desc: string;
}[] = [
  {
    name: "사방치기",
    kind: "상시",
    before: "46m",
    after: "456m",
    cap: "누가 버린 5만이든 치",
    desc: "치는 원래 왼쪽(상가) 사람의 버림패로만 됩니다.",
  },
  {
    name: "단색 세계",
    kind: "액티브",
    before: "1m 5p 9s",
    after: "159p",
    cap: "숫자는 그대로, 색만 통일",
    desc: "손패의 수패가 원하는 한 색으로 물듭니다.",
  },
  {
    name: "개벽",
    kind: "액티브",
    before: "3m 7p 2s",
    after: "123z",
    cap: "수패가 통째로 자패로",
    desc: "손패의 수패는 자패로, 자패는 수패로 뒤집힙니다.",
  },
];

function AuthScreen(props: {
  connection: ConnectionState;
  /** 초대 링크(`?room=…`)로 들어왔다면 그 코드 — 로그인하면 바로 그 방으로 간다. */
  invitedCode: string | null;
  /** 서버 정책 (가입 게이트·게스트 허용). 아직 안 왔으면 null — 추측해서 쓰지 않는다. */
  serverInfo: ServerInfoMessage | null;
  /** 서버가 되돌려 준 인증 실패 사유 (폼 안에 남는다) */
  serverError: string | null;
  /** 어느 탭으로 열 것인가. 체험 뒤 "계정 만들고 계속하기"로 오면 가입 탭이다. */
  initialTab?: "login" | "register";
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string, adminCode: string, signupCode: string) => void;
  onGuest: () => void;
  /** 튜토리얼 판으로 들어간다 — 게스트 체험과 같은 문이지만 판이 고정돼 있다 */
  onTutorial: () => void;
  onOpenHelp: () => void;
  onRetryConnect: () => void;
}): JSX.Element {
  // 어느 탭으로 열리는가는 **여기 오기까지 무엇을 눌렀는지**가 정한다.
  // 예전에는 무조건 로그인 탭이었다: 체험 뒤 "계정 만들고 계속하기"를 누른 사람이
  // 로그인 폼을 보고 다시 "회원가입"을 눌러야 했다 — 전환 퍼널의 마지막 한 클릭을
  // 스스로 버리고 있었다 (감사 §3-8).
  const [tab, setTab] = useState<"login" | "register">(props.initialTab ?? "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [serverUrl, setServerUrl] = useState(
    safeStorage.getItem(SERVER_OVERRIDE_KEY) ?? "",
  );
  const [localError, setLocalError] = useState<string | null>(null);
  /**
   * 보내 놓고 답을 기다리는 중인가 (감사 §5-7).
   *
   * 로그인·가입은 서버 왕복이 있는데 버튼이 계속 눌렸다 — 느린 회선에서 두 번 누르면
   * 인증 레이트리밋(연결당 12회/분)만 먹는다. 서버가 답하면(authOk 로 화면이 바뀌거나
   * serverError 가 들어오거나) 풀린다.
   */
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (props.serverError !== null) setSending(false);
  }, [props.serverError]);
  const disconnected = props.connection === "closed";

  function submit(): void {
    if (sending) return;
    setLocalError(null);
    if (username.trim().length < 2) return setLocalError("닉네임은 2자 이상이어야 합니다");
    if (password.length < 1) return setLocalError("비밀번호를 입력하세요");
    // 신규 가입만 강화된 정책 — 로그인은 기존 계정의 짧은 비밀번호를 막지 않는다.
    // 여기 규칙은 서버(SiteDb.register)와 같은 것을 미리 걸러 주는 것이다. 서버가
    // 진짜 판정자이므로 이쪽이 느슨해도 뚫리지 않지만, 어긋나면 사용자는 통과한 줄
    // 알고 보냈다가 거절당한다 — 셋 다 맞춰 둔다.
    if (tab === "register") {
      const name = username.trim();
      if (password.length < 8) return setLocalError("비밀번호는 8자 이상이어야 합니다");
      if (/^\d+$/.test(password)) {
        return setLocalError("숫자로만 이루어진 비밀번호는 사용할 수 없습니다");
      }
      if (name.length >= 4 && password.toLowerCase().includes(name.toLowerCase())) {
        return setLocalError("비밀번호에 닉네임을 포함할 수 없습니다");
      }
      if (password !== password2) {
        return setLocalError("비밀번호 확인이 일치하지 않습니다");
      }
    }
    setSending(true);
    if (tab === "login") props.onLogin(username.trim(), password);
    else props.onRegister(username.trim(), password, adminCode.trim(), signupCode.trim());
  }

  function saveServer(): void {
    const v = serverUrl.trim();
    if (v === "") {
      safeStorage.removeItem(SERVER_OVERRIDE_KEY);
    } else {
      // ws/wss만 받는다 — http(s)·javascript: 등 다른 스킴은 여기서 거른다.
      let ok = false;
      try {
        const u = new URL(v);
        ok = u.protocol === "ws:" || u.protocol === "wss:";
      } catch {
        ok = false;
      }
      if (!ok) {
        setLocalError("서버 주소는 ws:// 또는 wss:// 로 시작해야 합니다");
        return;
      }
      safeStorage.setItem(SERVER_OVERRIDE_KEY, v);
    }
    window.location.reload();
  }

  const gateOn = props.serverInfo?.signupGate === true;
  const guestOk = props.serverInfo?.guestPlay !== false && props.connection === "connected";

  return (
    <div className="lobby lobby-landing">
      {/* 방문자에게 필요한 것은 딱 둘이다 — 이게 무엇인지 한 줄, 그리고 시작 버튼.
          나머지는 게임이 말한다. 자세한 설명이 필요한 사람은 규칙 화면으로 간다. */}
      <section className="landing">
        <h1 className="landing-title">이능마작</h1>
        <p className="landing-lead">기존의 리치마작을 뒤바꾸는 다양한 증강을 즐겨보세요.</p>

        {props.invitedCode !== null ? (
          <p className="landing-invite">
            <b>{props.invitedCode}</b> 방에 초대받았습니다 — 로그인하면 바로 들어갑니다.
          </p>
        ) : null}

        <div className="landing-cta">
          {/*
            **튜토리얼이 첫 버튼이다** (2026-08-18 사용자 지시: "튜토리얼을 언제든
            다시 할 수 있게 로그인창에 튜토리얼 전용 버튼").

            체험과 나란히 두되 앞에 세운 이유: 마작을 아는 사람은 어차피 오른쪽
            버튼을 찾아 누르지만, 처음 온 사람은 "체험"이 무엇을 뜻하는지 모른 채
            눌렀다가 아무 설명 없는 판 한가운데 떨어진다. 예전에는 안내가 **처음
            온 사람에게 딱 한 번만** 따라붙어서(localStorage), 한 번 닫고 나면
            다시 볼 길이 아예 없었다.
          */}
          <button
            className="landing-tutorial"
            onClick={props.onTutorial}
            disabled={!guestOk}
            title="화면 보는 법부터 증강 쓰는 법까지 — 판 위에서 순서대로 (5~10분)"
          >
            🎓 튜토리얼 (5~10분)
          </button>
          <button
            className="landing-guest"
            onClick={props.onGuest}
            disabled={!guestOk}
            title="계정 없이 봇 3명과 한 판 — 기록은 남지 않습니다"
          >
            ▶ 게스트로 바로 체험
          </button>
          <button className="landing-help" onClick={props.onOpenHelp}>
            📘 규칙 · 증강 설명
          </button>
        </div>
        <p className="landing-guest-note">
          <b>튜토리얼</b>은 손패와 증강을 고정해 두고 화면 조작을 하나씩 짚어 줍니다 —
          시간 제한이 없어 천천히 봐도 됩니다. <b>체험</b>은 설명 없이 바로 한 판입니다.
          둘 다 가입이 필요 없고, 기록·순위에는 남지 않습니다.
        </p>

        {/*
          이 게임의 유일한 차별점은 "규칙을 바꾸는 증강"인데, 예전에는 그것이
          **클릭하기 전에는 한 문장으로만** 전달됐다 (감사 §3-4). 시작 버튼을 누를지
          말지가 여기서 갈리므로, 말 대신 실제 패로 보여 준다.

          쓰는 것은 도움말과 **같은 컴포넌트·같은 에셋**이다 — 광고용 그림을 따로
          만들면 화면과 다른 것을 약속하게 된다.
        */}
        <div className="landing-show">
          <p className="landing-show-head">증강은 규칙 자체를 바꿉니다</p>
          <ul className="landing-show-list">
            {LANDING_SHOWCASE.map((s) => (
              <li key={s.name} className="landing-show-item">
                <div className="landing-show-top">
                  <span className="landing-show-name">{s.name}</span>
                  <span className="landing-show-kind">{s.kind}</span>
                </div>
                <div className="landing-show-fig">
                  <span className="landing-show-before">
                    <HelpTileGroups tiles={s.before} />
                  </span>
                  {/* 화살표 글자는 CSS가 넣는다 — 칸이 좁으면 세로(↓), 넓으면 가로(→)로
                      쌓이는데 방향이 어긋나면 그림이 거짓말을 한다 */}
                  <span className="landing-show-arrow" aria-hidden="true" />
                  <span className="landing-show-after">
                    <HelpTileGroups tiles={s.after} />
                  </span>
                </div>
                <p className="landing-show-cap">{s.cap}</p>
                <p className="landing-show-desc">{s.desc}</p>
              </li>
            ))}
          </ul>
          <p className="landing-show-foot">
            매 국 시작에 세 장 중 하나를 고릅니다.
          </p>
        </div>
      </section>

      <div className="lobby-card auth-card">
        <div className="auth-tabs">
          <button className={tab === "login" ? "auth-tab active" : "auth-tab"} onClick={() => setTab("login")}>
            로그인
          </button>
          <button className={tab === "register" ? "auth-tab active" : "auth-tab"} onClick={() => setTab("register")}>
            회원가입
          </button>
        </div>

        <label>
          닉네임
          {/*
            autoFocus 는 **일부러 뺐다**. 브라우저는 포커스된 칸을 화면 안으로
            끌어오는데, 랜딩이 한 화면보다 길어지면서 그 동작이 **제목과 시작
            버튼을 위로 밀어냈다**(2026-08-18 실측: 열자마자 scrollTop 142).
            처음 온 사람이 가장 먼저 봐야 할 것은 로그인 칸이 아니다.
          */}
          <input
            value={username}
            maxLength={12}
            placeholder="게임에서 표시되는 이름"
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
        {tab === "register" ? (
          <>
            <p className="auth-rule">
              비밀번호 규칙 — <b>8자 이상</b>, 숫자로만 이루어질 수 없고, 닉네임을 포함할 수 없습니다.
            </p>
            <label>
              비밀번호 확인
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
            {gateOn ? (
              <label>
                가입 코드 <span className="auth-required">(필수)</span>
                <input
                  value={signupCode}
                  placeholder="초대받은 가입 코드"
                  onChange={(e) => setSignupCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </label>
            ) : props.serverInfo === null ? (
              // 서버 정책이 아직 안 왔다 — 있는지 없는지 모르는 칸을 그리지 않는다.
              null
            ) : null}
            <label>
              관리자 코드 <span className="auth-optional">(선택)</span>
              <input
                value={adminCode}
                placeholder="일반 가입은 비워두세요"
                onChange={(e) => setAdminCode(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {/* 클라이언트 검증(localError)과 서버 판정(serverError)이 같은 자리에 뜬다 —
            예전에는 서버 쪽만 3.2초 토스트라 읽기 전에 사라졌다. */}
        {localError ?? props.serverError ? (
          <p className="auth-error">{localError ?? props.serverError}</p>
        ) : null}

        {disconnected ? (
          <button className="lobby-join auth-reconnect" onClick={props.onRetryConnect}>
            서버에 다시 연결
          </button>
        ) : (
          <button
            className="lobby-join"
            onClick={submit}
            disabled={props.connection !== "connected" || sending}
          >
            {props.connection !== "connected"
              ? props.connection === "reconnecting"
                ? "재연결 중…"
                : "서버 연결 중…"
              : sending
                ? "확인 중…"
                : tab === "login"
                  ? "로그인"
                  : "가입하고 시작"}
          </button>
        )}

        {gateOn && tab === "register" ? (
          <p className="auth-gate-note">
            지금 이 서버는 <b>초대제</b>입니다 — 가입 코드가 있어야 계정을 만들 수 있습니다.
            코드가 없다면 위의 <b>게스트로 바로 체험</b>으로 지금 바로 플레이할 수 있습니다.
          </p>
        ) : null}

        <button className="auth-advanced-toggle" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? "▴ 고급 설정 닫기" : "▾ 고급 설정"}
        </button>
        {advanced ? (
          <div className="auth-advanced">
            <label>
              서버 주소 (비우면 자동)
              <input
                value={serverUrl}
                placeholder={defaultServerUrl()}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </label>
            <button className="wr-btn wr-bot" onClick={saveServer}>저장 후 새로고침</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────── 홈 (로그인 후) ───────────────────────────

// ══════════════════════════ 증강 통계 ══════════════════════════

type AugCatalog = Record<string, AugmentCatalogEntry>;
// 2026-07-22 (52차) 등급 폐기 — 모든 증강이 같은 프리즘급이라 화면에 등급을 표시하지 않는다.
// (AugmentDef.tier는 규칙 합성 우선순위로만 남아 있고 UI에는 노출되지 않는다.)

interface AugRow {
  id: string;
  name: string;
  tier: AugmentTier;
  offered: number;
  picked: number;
  games: number;
  top: number;
  pickRate: number;
  avgPlacement: number;
  topRate: number;
}

/** 증강 원시 통계 맵 → 표시용 행 배열 (파생 비율 계산). */
function toAugRows(augments: Record<string, AugmentStatRaw> | undefined, catalog: AugCatalog): AugRow[] {
  const out: AugRow[] = [];
  for (const [id, s] of Object.entries(augments ?? {})) {
    const cat = catalog[id];
    const top = s.placements[0] ?? 0;
    out.push({
      id,
      name: cat?.name ?? id,
      tier: cat?.tier ?? "silver",
      offered: s.offered,
      picked: s.picked,
      games: s.games,
      top,
      pickRate: s.offered > 0 ? s.picked / s.offered : 0,
      avgPlacement: s.games > 0 ? s.placementSum / s.games : 0,
      topRate: s.games > 0 ? top / s.games : 0,
    });
  }
  return out;
}

/** 여러 플레이어의 증강 통계를 id별로 합산하고, 증강별 '장인'(최고 평균순위 닉네임)을 찾는다. */
function aggregateAugments(
  entries: { nickname: string; stats: PlayerStatsView }[],
  catalog: AugCatalog,
): { rows: AugRow[]; masters: Map<string, { nickname: string; avg: number; games: number }> } {
  const merged = new Map<string, AugmentStatRaw>();
  const masters = new Map<string, { nickname: string; avg: number; games: number }>();
  for (const e of entries) {
    for (const [id, s] of Object.entries(e.stats.augments ?? {})) {
      const m = merged.get(id) ?? { offered: 0, picked: 0, games: 0, placements: [0, 0, 0, 0], placementSum: 0 };
      m.offered += s.offered;
      m.picked += s.picked;
      m.games += s.games;
      m.placementSum += s.placementSum;
      m.placements = [
        m.placements[0] + (s.placements[0] ?? 0),
        m.placements[1] + (s.placements[1] ?? 0),
        m.placements[2] + (s.placements[2] ?? 0),
        m.placements[3] + (s.placements[3] ?? 0),
      ];
      merged.set(id, m);
      // 장인 후보: 이 증강을 3판 이상 보유한 플레이어 중 평균순위 최상.
      // 비관리자에게는 서버가 닉네임을 지워 보내므로(익명) 장인은 표시하지 않는다.
      if (s.games >= 3 && e.nickname !== "") {
        const avg = s.placementSum / s.games;
        const cur = masters.get(id);
        if (cur === undefined || avg < cur.avg) masters.set(id, { nickname: e.nickname, avg, games: s.games });
      }
    }
  }
  const map: Record<string, AugmentStatRaw> = {};
  for (const [id, s] of merged) map[id] = s;
  return { rows: toAugRows(map, catalog), masters };
}

/** 평균순위 색: 낮을수록(좋을수록) 초록, 높을수록 빨강. */
function avgRankClass(avg: number): string {
  if (avg <= 0) return "";
  if (avg < 2.35) return "aug-good";
  if (avg > 2.65) return "aug-bad";
  return "aug-mid";
}

/** 홈 "내 증강 통계" — 시그니처·등급분포·성적표·함정 경고·도감. */
function PersonalAugmentStats({ stats, catalog }: { stats: PlayerStatsView | null; catalog: AugCatalog }): JSX.Element {
  const rows = useMemo(() => toAugRows(stats?.augments, catalog), [stats, catalog]);
  const catalogSize = useMemo(() => Object.keys(catalog).length, [catalog]);
  if (stats === null || rows.length === 0) {
    return <p className="home-empty">아직 증강 기록이 없습니다. 증강 드래프트가 있는 대국을 완주해 보세요!</p>;
  }

  const held = rows.filter((r) => r.games > 0);
  const overallAvg = stats.games > 0 ? stats.placementSum / stats.games : 0;
  const signature = [...rows].filter((r) => r.picked > 0).sort((a, b) => b.picked - a.picked).slice(0, 3);
  const bySkill = [...held].sort((a, b) => a.avgPlacement - b.avgPlacement);
  const traps = held
    .filter((r) => r.picked >= 3 && overallAvg > 0 && r.avgPlacement > overallAvg + 0.3)
    .sort((a, b) => b.avgPlacement - a.avgPlacement);
  const collected = rows.filter((r) => r.picked > 0 || r.games > 0).length;

  return (
    <div className="aug-stats">
      {signature.length > 0 ? (
        <div className="aug-block">
          <div className="aug-block-title">시그니처 증강</div>
          <div className="aug-sig-row">
            {signature.map((r) => (
              <div key={r.id} className="aug-sig">
                <span className="aug-sig-name">{r.name}</span>
                <span className="aug-sig-meta">
                  {r.picked}회 · 평균 <b className={avgRankClass(r.avgPlacement)}>{r.avgPlacement.toFixed(2)}</b>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}


      {traps.length > 0 ? (
        <div className="aug-block">
          <div className="aug-block-title aug-trap-title">⚠️ 함정 주의 (자주 고르지만 성적 저조)</div>
          <div className="aug-trap-row">
            {traps.slice(0, 4).map((r) => (
              <span key={r.id} className="aug-trap">
                {r.name} <b className="aug-bad">{r.avgPlacement.toFixed(2)}</b>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="aug-block">
        <div className="aug-block-title">
          증강별 성적 · 도감 <span className="aug-collect">{collected}/{catalogSize || "?"}종 수집</span>
        </div>
        <div className="lb-scroll aug-table-scroll">
          <table className="lb-table aug-table">
            <thead>
              <tr>
                <th className="aug-name-h">증강</th>
                <th>판</th>
                <th>평균순위</th>
                <th>1위율</th>
                <th>픽률</th>
              </tr>
            </thead>
            <tbody>
              {bySkill.map((r) => (
                <tr key={r.id}>
                  <td className="aug-name">
                    {r.name}
                  </td>
                  <td>{r.games}</td>
                  <td className={avgRankClass(r.avgPlacement)}>{r.avgPlacement.toFixed(2)}</td>
                  <td>{pct(r.topRate)}</td>
                  <td>{r.offered > 0 ? pct(r.pickRate) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** 홈 "증강 메타" — 전체 플레이어 합산 픽률·평균순위 + 증강 장인. */
function AugmentMeta({
  leaderboard,
  catalog,
}: {
  /** null = 아직 못 받았다. 그때는 "없다"가 아니라 "불러오는 중"이라고 말해야 한다. */
  leaderboard: LeaderboardEntry[] | null;
  catalog: AugCatalog;
}): JSX.Element {
  const { rows, masters } = useMemo(
    () => aggregateAugments(leaderboard ?? [], catalog),
    [leaderboard, catalog],
  );
  const MIN_GAMES = 5;
  const ranked = rows.filter((r) => r.games >= MIN_GAMES).sort((a, b) => a.avgPlacement - b.avgPlacement);

  if (leaderboard === null) {
    return <p className="home-empty home-loading">불러오는 중…</p>;
  }
  if (ranked.length === 0) {
    return <p className="home-empty">증강 메타를 집계할 표본이 아직 부족합니다 (증강별 {MIN_GAMES}판 이상 필요).</p>;
  }

  const masterList = ranked
    .map((r) => ({ row: r, master: masters.get(r.id) }))
    .filter((x): x is { row: AugRow; master: { nickname: string; avg: number; games: number } } => x.master !== undefined)
    .sort((a, b) => a.master.avg - b.master.avg)
    .slice(0, 6);

  return (
    <div className="aug-stats">
      <div className="aug-block">
        <div className="aug-block-title">증강 티어 (평균순위 · {MIN_GAMES}판+ 표본)</div>
        <div className="lb-scroll aug-table-scroll">
          <table className="lb-table aug-table">
            <thead>
              <tr>
                <th className="aug-rank-h">#</th>
                <th className="aug-name-h">증강</th>
                <th>표본</th>
                <th>평균순위</th>
                <th>1위율</th>
                <th>픽률</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.id}>
                  <td className="lb-rank">{i + 1}</td>
                  <td className="aug-name">
                    {r.name}
                  </td>
                  <td>{r.games}</td>
                  <td className={avgRankClass(r.avgPlacement)}>{r.avgPlacement.toFixed(2)}</td>
                  <td>{pct(r.topRate)}</td>
                  <td>{r.offered > 0 ? pct(r.pickRate) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {masterList.length > 0 ? (
        <div className="aug-block">
          <div className="aug-block-title">증강 장인 (증강별 최고 평균순위 · 3판+)</div>
          <div className="aug-master-row">
            {masterList.map(({ row, master }) => (
              <div key={row.id} className="aug-master">
                <div className="aug-master-aug">
                  {row.name}
                </div>
                <div className="aug-master-who">
                  👑 {master.nickname} <b className={avgRankClass(master.avg)}>{master.avg.toFixed(2)}</b>
                  <span className="aug-master-g">({master.games}판)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════ 증강 설명 (요약 · 자세히 · 마작 용어 풀이) ═══════════════
//
// 화면에 뜨는 증강 설명은 세 겹이다.
//   1) 요약  — augmentBrief.ts의 한 문장. **기본으로 보이는 것은 이것뿐**이다.
//   2) 설명  — AugmentDef.description 원문. 조건·예외까지 담은 정식 문장.
//   3) 상세  — AugmentDef.detail. 작동 원리·전략·주의점.
//
// 펼쳤을 때 (2)가 오는지 (3)이 오는지는 **화면마다 다르고, 호출부가 정한다**
// (`AugmentDescVariant` — augmentBrief.ts의 표를 보라).
//   · "draft" (드래프트 카드·이름표 툴팁) → 1 + 2. 판 중에 몇 초로 고르는 자리라 3은 길다.
//   · "codex" (도감 상세·샌드박스 상세)   → 1 + 3. 목록에 이미 요약이 있고 2는 3과 겹친다.
//
// 원래는 (2)가 곧바로 드래프트 카드와 이름표 툴팁에 박혀 있었다. 조건·예외까지 담은
// 문장이라 좁은 카드에서 열 줄 가까이 흘렀고, 고르는 3초 동안 읽을 수 있는 분량이
// 아니었다. 그래서 (1)을 새로 앞에 세우고 (2)를 한 번 더 누르는 자리로 물렸다.
//
// 그리고 어느 층이든 "슌쯔·커쯔·오름패" 같은 말은 그냥 나온다 — TermText가 glossary.ts에
// 등록된 표기에 밑줄을 긋고, 잠시 올려 두면 초보자용 한 줄이 뜬다.

/**
 * 용어 설명(설정)이 켜져 있는가. 기본 true — Provider 밖(스토리북·테스트)에서도
 * 평소대로 동작하게 두고, 끄는 쪽만 App이 명시적으로 내려 준다.
 */
const GlossaryTipsContext = createContext(true);

/**
 * 지금 도는 판의 모드. **인게임에서만** 값이 있고 그 밖(도감·샌드박스·테스트)은 null이다.
 *
 * "동풍전 1회 · 반장전 2회"처럼 두 모드를 나란히 적은 횟수를, 판 중에는 그 판의 숫자
 * 하나("게임 2회")로 줄이는 데 쓴다(`forMode`). 도감은 모드를 가리지 않고 읽는 자리라
 * 둘 다 그대로 둔다.
 */
const GameModeContext = createContext<DisplayMode | null>(null);

/** 용어에 마우스를 올리고 툴팁이 뜰 때까지 (ms) — "길게 올려 두면" */
const TERM_HOVER_MS = 450;

/**
 * Shift를 누르고 있는가 — 증강 설명의 "자세히"를 여는 전역 스위치.
 *
 * 창이 포커스를 잃으면(alt-tab) keyup을 못 받아 눌린 채로 굳으므로 blur에서 푼다.
 */
function useShiftHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent): void => { if (e.key === "Shift") setHeld(true); };
    const up = (e: KeyboardEvent): void => { if (e.key === "Shift") setHeld(false); };
    const clear = (): void => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);
  return held;
}

/**
 * 밑줄 그인 마작 용어 한 개.
 *
 * 툴팁은 `position: fixed` + 포털이다 — 증강 툴팁·드래프트 카드 모두 `overflow`가
 * 걸린 상자 안에 있어서, 그 안에 두면 잘린다.
 */
function GlossaryTerm({ text, entry }: { text: string; entry: GlossaryEntry }): JSX.Element {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<number | null>(null);

  const disarm = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const open = (): void => {
    const r = ref.current?.getBoundingClientRect();
    if (r === undefined) return;
    // 화면 밖으로 새지 않게 가로 위치를 여백 안쪽으로 접는다
    // (rect는 화면 좌표, 인라인 left/top은 레이아웃 좌표 — uiScale.ts 참고)
    const v = layoutViewport();
    const half = Math.min(150, v.w / 2 - 8);
    const cx = toLayoutPx(r.left + r.width / 2);
    setAt({ left: Math.min(Math.max(cx, half + 8), v.w - half - 8), top: toLayoutPx(r.top) });
  };
  const close = (): void => { disarm(); setAt(null); };

  useEffect(() => disarm, []);
  // 터치·클릭으로 연 툴팁은 다음 탭에서 닫는다 (같은 클릭으로 바로 닫히지 않게 캡처는 다음 틱)
  useEffect(() => {
    if (at === null) return;
    const t = window.setTimeout(() => window.addEventListener("pointerdown", close), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", close);
    };
  }, [at !== null]);

  return (
    <>
      <span
        ref={ref}
        className="gterm"
        onMouseEnter={() => { disarm(); timer.current = window.setTimeout(open, TERM_HOVER_MS); }}
        onMouseLeave={close}
        // 드래프트 카드는 통째로 버튼이다 — 용어를 눌렀다고 그 증강이 뽑히면 안 된다
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (at === null) open(); else close(); }}
      >
        {text}
      </span>
      {at !== null
        ? createPortal(
            <span className="gterm-tip" style={{ left: at.left, top: at.top }}>
              <b className="gterm-tip-name">{entry.label}</b>
              <span className="gterm-tip-body">{entry.short}</span>
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

/** 한 덩어리 문장을 용어 조각과 일반 조각으로 갈라 렌더 */
function termNodes(text: string, seed: string, tips: boolean): JSX.Element[] {
  if (!tips) return [<span key={seed}>{text}</span>];
  return splitTerms(text).map((c, i) =>
    c.kind === "term" ? (
      <GlossaryTerm key={`${seed}:${i}`} text={c.text} entry={c.entry} />
    ) : (
      <span key={`${seed}:${i}`}>{c.text}</span>
    ),
  );
}

/**
 * 마작 용어에 밑줄을 그어 주는 본문. `**강조**`도 함께 처리한다.
 *
 * 설정에서 "용어 설명"을 끄면 밑줄도 툴팁도 없이 맨 글자로 흘린다 — 용어를 이미
 * 아는 사람에게는 밑줄이 글을 읽는 데 방해가 되기 때문이다. `**강조**` 처리는 남는다.
 */
function TermText({ text }: { text: string }): JSX.Element {
  const tips = useContext(GlossaryTipsContext);
  const parts = useMemo(() => text.split(/\*\*(.+?)\*\*/g), [text]);
  return (
    <>
      {parts.map((p, i) =>
        // split의 홀수 조각이 ** ** 안쪽이다
        i % 2 === 1
          ? <strong key={i}>{termNodes(p, String(i), tips)}</strong>
          : <span key={i}>{termNodes(p, String(i), tips)}</span>,
      )}
    </>
  );
}

/**
 * 증강 설명 본문 — 기본은 요약 한 줄, `expanded`면 그 아래 층을 편다.
 *
 * 펼쳐서 **무엇이** 나오는지는 `variant`가 정한다(호출부가 명시한다).
 * 이 컴포넌트가 자기가 어디에 서 있는지 추측하지 않는다.
 *
 * `use`(사용 빈도)는 원문 머리말 `(상시)` `(매 국 1회)`를 배지로 떼어낸 것이라
 * 요약 본문은 순수하게 효과만 말한다. 그 덕에 좁은 카드에서도 다섯 줄을 넘지 않는다.
 */
function AugDesc({
  id,
  description,
  detail,
  variant,
  expanded,
  useOverride,
}: {
  id: string;
  description: string | undefined;
  detail?: string | undefined;
  variant: AugmentDescVariant;
  expanded: boolean;
  /**
   * 사용 빈도 배지를 대신할 글. 효과가 이미 끝난 선발동형("이번 국만")처럼 **배지가
   * 지금은 거짓말이 되는** 자리에서만 넘긴다 — 그대로 두면 지나간 국의 효과가 아직
   * 걸려 있는 것으로 읽힌다(2026-08-13 사용자 보고).
   */
  useOverride?: string | undefined;
}): JSX.Element {
  // 판 중이면 "동풍전 1회 · 반장전 2회"를 그 판의 숫자 하나로 줄인다(도감은 둘 다 둔다).
  // 도감 변형은 판 안에서 열어도 모드를 가리지 않는 자리라 null로 못 박는다.
  const ctxMode = useContext(GameModeContext);
  const mode = variant === "draft" ? ctxMode : null;
  const raw = briefOf(id, description);
  const brief = { use: forMode(raw.use, mode), text: forMode(raw.text, mode) };
  const lead = splitLead(forMode(description ?? "", mode));
  const paras = expandParas(variant, description, detail).map((p) => forMode(p, mode));
  const showFull = expanded && paras.length > 0;
  // 원문 설명을 펼칠 때는 배지도 원문 머리말로 바꿔 단다 — 요약의 use보다 조건이 자세할
  // 때가 많고, 본문에 머리말을 남겨 두면 같은 말이 배지와 두 번 나온다. 상세(detail)에는
  // 그런 머리말이 없으므로 요약 배지를 그대로 둔다.
  const use =
    useOverride !== undefined && useOverride !== ""
      ? useOverride
      : showFull && variant === "draft" && lead.use !== "" ? lead.use : brief.use;
  return (
    <span className="augdesc">
      {use !== "" ? (
        <span className={`augdesc-use${useOverride !== undefined && useOverride !== "" ? " augdesc-use-spent" : ""}`}>
          {use}
        </span>
      ) : null}
      <span className={`augdesc-body${showFull ? " augdesc-body-full" : ""}`}>
        {showFull
          ? paras.map((p, i) => (
              <span key={i} className="augdesc-para"><TermText text={p} /></span>
            ))
          : <TermText text={brief.text} />}
      </span>
    </span>
  );
}

/** "자세히 ▾ / 간단히 ▴" 토글 — Shift가 없는 터치 기기의 통로 */
function MoreToggle({ open, onToggle }: { open: boolean; onToggle: () => void }): JSX.Element {
  return (
    <span
      className={`augdesc-more${open ? " augdesc-more-on" : ""}`}
      {...clickableProps(onToggle, open ? "간단히 보기" : "자세히 보기")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
    >
      {open ? "간단히 ▴" : "자세히 ▾"}
      <span className="augdesc-more-key">Shift</span>
    </span>
  );
}

// ══════════════════════════ 증강 도감 (Codex) ══════════════════════════

/**
 * 드래프트 스테이지 — 각 국 첫 진입 때 1회씩.
 * 동풍전 3회(동1·동3·동4) · 반장전 4회(동1·동3·남1·남3).
 */
const DRAFT_STAGE_ORDER = [
  "gameStart",
  "eastThird",
  "eastFourth",
  "southEntry",
  "southThird",
] as const;

const CODEX_STAGE_LABEL: Record<string, string> = {
  gameStart: "게임 시작 시",
  eastThird: "동3국 진입 시",
  eastFourth: "동4국 진입 시",
  southEntry: "남장 진입 시",
  southThird: "남3국 진입 시",
};

/** 드래프트 오버레이 부제 — 지금 어느 국에 들어서며 받는 증강인가. */
const DRAFT_STAGE_HEADLINE: Record<string, string> = {
  gameStart: "대국 개시 — 동1국",
  eastThird: "동3국 돌입",
  eastFourth: "동4국 돌입",
  southEntry: "남장 돌입 — 남1국",
  southThird: "남3국 돌입",
};
const CODEX_MODE_LABEL: Record<string, string> = { hanchan: "반장전", tonpuu: "동풍전" };

/** 카탈로그 항목의 등장/모드/지급 제한을 사람이 읽는 배지 문자열로. */
function codexBadges(c: AugmentCatalogEntry): string[] {
  const out: string[] = [];
  if (
    c.draftStages !== undefined &&
    c.draftStages.length > 0 &&
    c.draftStages.length < DRAFT_STAGE_ORDER.length
  ) {
    out.push("등장: " + c.draftStages.map((s) => CODEX_STAGE_LABEL[s] ?? s).join(" · "));
  }
  if (c.modes !== undefined && c.modes.length === 1) {
    out.push((CODEX_MODE_LABEL[c.modes[0]!] ?? c.modes[0]!) + " 전용");
  }
  return out;
}

type CodexTab = "codex" | "stats";
type CodexSortKey = "name" | "myGames" | "myAvg" | "srvGames" | "srvPick" | "srvAvg" | "srvTop";

interface CodexMerged {
  cat: AugmentCatalogEntry;
  mine: AugRow | undefined;
  srv: AugRow | undefined;
  master: { nickname: string; avg: number; games: number } | undefined;
  collected: boolean;
}

/** 통계 값 렌더 도우미 — 표본 없으면 대시. */
function statCell(v: number | undefined, kind: "avg" | "pct" | "num"): JSX.Element {
  if (v === undefined) return <span className="codex-dim">-</span>;
  if (kind === "avg") return v > 0 ? <b className={avgRankClass(v)}>{v.toFixed(2)}</b> : <span className="codex-dim">-</span>;
  if (kind === "pct") return <>{pct(v)}</>;
  return <>{v}</>;
}

/** 증강 도감 전체화면 — 도감 그리드 + 상세 오버레이 + 전체 정렬 통계표. */
/**
 * TierScreen — 증강 파워 티어표 (관리자 전용 전체화면).
 *
 * 데이터는 서버가 **살아 있는 카탈로그 × `powerTier.ts`** 를 매 요청마다 조인해 준다.
 * 그래서 증강을 추가하고 티어를 안 매기면 여기에 "미분류"로 바로 뜬다 — 표가 코드보다
 * 뒤처지지 않는다. 티어의 목적은 **드롭 확률 조정**이라 도감의 재미 등급과는 별개다.
 */
function TierScreen(props: {
  data: AdminAugmentTiersMessage | null;
  onRefresh: () => void;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [flat, setFlat] = useState(false);

  const entries = props.data?.entries ?? [];
  const order = props.data?.order ?? [];
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q === ""
        ? entries
        : entries.filter(
            (e) =>
              e.name.toLowerCase().includes(q) ||
              e.id.toLowerCase().includes(q) ||
              e.note.toLowerCase().includes(q) ||
              e.description.toLowerCase().includes(q),
          ),
    [entries, q],
  );

  /** 티어 → 그 티어의 행들 (미분류는 null 키로 맨 뒤) */
  const groups = useMemo(() => {
    const out: { tier: string | null; rows: AugmentTierEntry[] }[] = [];
    for (const t of order) {
      const rows = filtered.filter((e) => e.tier === t);
      if (rows.length > 0) out.push({ tier: t, rows });
    }
    const none = filtered.filter((e) => e.tier === null);
    if (none.length > 0) out.push({ tier: null, rows: none });
    return out;
  }, [filtered, order]);

  const tierClass = (t: string | null): string =>
    t === null ? "tier-none" : `tier-${t.replace(/\+/g, "p")}`;

  const row = (e: AugmentTierEntry): JSX.Element => (
    <tr key={e.id} className={e.tier === null ? "tier-row-none" : undefined}>
      <td className="tier-td-name">
        <b>{e.name}</b>
        <span className="tier-td-id">{e.id}</span>
      </td>
      <td>
        <span className={`tier-chip ${tierClass(e.tier)}`}>{e.tier ?? "미분류"}</span>
        {e.rare ? <span className="tier-rare" title="조건이 드물어 한 단계 낮춤">희귀</span> : null}
      </td>
      <td className="tier-num">{e.p ?? "-"}</td>
      <td className="tier-num">{e.s ?? "-"}</td>
      <td className="tier-num">{e.u ?? "-"}</td>
      <td className="tier-num">{e.f ?? "-"}</td>
      <td className="tier-num tier-score">{e.score ?? "-"}</td>
      <td className="tier-num">{e.weight === null ? "-" : `×${e.weight.toFixed(2)}`}</td>
      <td className="tier-td-note">{e.note === "" ? e.description : e.note}</td>
    </tr>
  );

  const head = (
    <thead>
      <tr>
        <th>증강</th>
        <th>티어</th>
        <th className="tier-num" title="타점 — 화료 1회당 점수가 얼마나 뛰는가">타점</th>
        <th className="tier-num" title="속도 — 화료가 얼마나 쉬워지는가">속도</th>
        <th className="tier-num" title="무대응 — 상대가 알고도 못 막는가">무대응</th>
        <th className="tier-num" title="빈도 — 실제로 몇 번 작동하는가">빈도</th>
        <th className="tier-num" title="타점×3 + 속도×3 + 무대응×2 + 빈도×2">총점</th>
        <th className="tier-num" title="드래프트 가중치 (1.00 = 균등)">가중치</th>
        <th>사유</th>
      </tr>
    </thead>
  );

  return (
    <div className="codex">
      <header className="home-nav codex-nav">
        <button className="codex-back" onClick={props.onClose}>← 홈으로</button>
        <span className="home-logo">증강 파워 티어표</span>
        <span className="home-admin-badge">관리자</span>
        <span className="codex-collect-badge">{entries.length}종</span>
        <span className="home-spacer" />
        <div className="codex-tabs">
          <button className={!flat ? "codex-tab codex-tab-on" : "codex-tab"} onClick={() => setFlat(false)}>티어별</button>
          <button className={flat ? "codex-tab codex-tab-on" : "codex-tab"} onClick={() => setFlat(true)}>전체 표</button>
        </div>
        <RefreshButton onRefresh={props.onRefresh} title="새로 고침" />
      </header>

      <div className="codex-toolbar">
        <input
          className="codex-search"
          value={query}
          placeholder="증강 이름·id·사유 검색"
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="tier-axis-help">
          총점 = 타점×3 + 속도×3 + 무대응×2 + 빈도×2 (각 축 1~5, 최대 50)
        </span>
      </div>

      <main className="codex-main">
        {props.data === null ? (
          <p className="home-empty">티어표를 불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="home-empty">조건에 맞는 증강이 없습니다.</p>
        ) : flat ? (
          <div className="tier-table-wrap">
            <table className="lb-table tier-table">
              {head}
              <tbody>{filtered.map(row)}</tbody>
            </table>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.tier ?? "none"} className="tier-group">
              <div className="tier-group-head">
                <span className={`tier-chip tier-chip-lg ${tierClass(g.tier)}`}>
                  {g.tier ?? "미분류"}
                </span>
                <b className="tier-group-count">{g.rows.length}종</b>
                {g.tier !== null ? (
                  <span className="tier-group-weight">
                    드롭 가중치 ×{props.data?.weights[g.tier]?.toFixed(2) ?? "1.00"}
                  </span>
                ) : (
                  <span className="tier-group-weight tier-warn">
                    powerTier.ts에 아직 등재되지 않았습니다 — 균등 확률로 나옵니다
                  </span>
                )}
                <span className="tier-group-label">
                  {g.tier === null ? "" : props.data?.labels[g.tier] ?? ""}
                </span>
              </div>
              <div className="tier-table-wrap">
                <table className="lb-table tier-table">
                  {head}
                  <tbody>{g.rows.map(row)}</tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function CodexScreen(props: {
  /** 왼쪽 위 되돌아가기 버튼 문구. 게임 중 오버레이로 열면 "← 닫기"다. */
  backLabel?: string;
  catalog: AugCatalog;
  career: PlayerStatsView | null;
  leaderboard: LeaderboardEntry[] | null;
  onRefresh: () => void;
  onClose: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<CodexTab>("codex");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyCollected, setOnlyCollected] = useState(false);
  /** 계열 필터. null이면 전체 — 104종을 한 화면에서 훑기는 어려워 계열로 좁힌다. */
  const [category, setCategory] = useState<AugmentCategory | null>(null);
  const [sortKey, setSortKey] = useState<CodexSortKey>("srvAvg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const myMap = useMemo(() => {
    const m = new Map<string, AugRow>();
    for (const r of toAugRows(props.career?.augments, props.catalog)) m.set(r.id, r);
    return m;
  }, [props.career, props.catalog]);

  const { srvMap, masters } = useMemo(() => {
    const agg = aggregateAugments(props.leaderboard ?? [], props.catalog);
    const m = new Map<string, AugRow>();
    for (const r of agg.rows) m.set(r.id, r);
    return { srvMap: m, masters: agg.masters };
  }, [props.leaderboard, props.catalog]);

  const merged = useMemo<CodexMerged[]>(() => {
    return Object.values(props.catalog).map((cat) => {
      const mine = myMap.get(cat.id);
      return {
        cat,
        mine,
        srv: srvMap.get(cat.id),
        master: masters.get(cat.id),
        collected: mine !== undefined && (mine.picked > 0 || mine.games > 0),
      };
    });
  }, [props.catalog, myMap, srvMap, masters]);

  const total = merged.length;
  const collectedCount = merged.filter((m) => m.collected).length;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return merged.filter((m) => {
      if (onlyCollected && !m.collected) return false;
      if (category !== null && m.cat.category !== category) return false;
      if (q !== "" && !m.cat.name.toLowerCase().includes(q) && !m.cat.id.includes(q)
        && !(m.cat.detail ?? "").toLowerCase().includes(q)
        && !m.cat.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [merged, onlyCollected, category, q]);

  /** 계열 칩에 붙일 개수 — 계열 필터를 뺀 나머지 조건(수집·검색)까지 반영한 수다. */
  const catCounts = useMemo(() => {
    const counts = new Map<AugmentCategory, number>();
    for (const m of merged) {
      if (onlyCollected && !m.collected) continue;
      if (q !== "" && !m.cat.name.toLowerCase().includes(q) && !m.cat.id.includes(q)
        && !(m.cat.detail ?? "").toLowerCase().includes(q)
        && !m.cat.description.toLowerCase().includes(q)) continue;
      counts.set(m.cat.category, (counts.get(m.cat.category) ?? 0) + 1);
    }
    return counts;
  }, [merged, onlyCollected, q]);
  const catTotal = useMemo(() => {
    let n = 0;
    for (const v of catCounts.values()) n += v;
    return n;
  }, [catCounts]);

  // 도감 그리드: 등급이 없어졌으므로 이름 가나다순 한 덩어리
  const cards = useMemo(
    () => [...filtered].sort((a, b) => a.cat.name.localeCompare(b.cat.name, "ko")),
    [filtered],
  );

  // 통계표: 정렬키로 정렬 (표본 없는 값은 항상 뒤로)
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (m: CodexMerged): number | string | undefined => {
      switch (sortKey) {
        case "name": return m.cat.name;
        case "myGames": return m.mine?.games;
        case "myAvg": return m.mine && m.mine.games > 0 ? m.mine.avgPlacement : undefined;
        case "srvGames": return m.srv?.games;
        case "srvPick": return m.srv && m.srv.offered > 0 ? m.srv.pickRate : undefined;
        case "srvAvg": return m.srv && m.srv.games > 0 ? m.srv.avgPlacement : undefined;
        case "srvTop": return m.srv && m.srv.games > 0 ? m.srv.topRate : undefined;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === undefined && vb === undefined) return a.cat.name.localeCompare(b.cat.name, "ko");
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "ko") * dir;
      }
      if (va === vb) return a.cat.name.localeCompare(b.cat.name, "ko");
      return (va - vb) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: CodexSortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 평균순위는 낮을수록 좋으므로 오름차순, 그 외는 내림차순이 기본
      setSortDir(key === "srvAvg" || key === "myAvg" || key === "name" ? "asc" : "desc");
    }
  }
  const sortArrow = (key: CodexSortKey): string => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const sel = selected !== null ? props.catalog[selected] : undefined;
  const selMine = selected !== null ? myMap.get(selected) : undefined;
  const selSrv = selected !== null ? srvMap.get(selected) : undefined;
  const selMaster = selected !== null ? masters.get(selected) : undefined;
  const selBadges = sel !== undefined ? codexBadges(sel) : [];
  // 도감 상세는 요약(리드) → **상세** 두 겹이다. 원문 설명은 넣지 않는다 — 카드/표에
  // 이미 요약이 서 있고, 설명은 상세와 말이 겹쳐 같은 얘기를 두 번 읽히게 했다.
  // 상세가 아직 없는 증강만 설명이 그 자리를 대신한다(`expandParas`).
  const selBrief = sel !== undefined ? briefOf(sel.id, sel.description) : null;
  const selParas = expandParas("codex", sel?.description, sel?.detail);

  return (
    <div className="codex">
      <header className="home-nav codex-nav">
        <button className="codex-back" onClick={props.onClose}>{props.backLabel ?? "← 홈으로"}</button>
        <span className="home-logo">증강 도감</span>
        <span className="codex-collect-badge">{collectedCount}/{total}종 수집</span>
        <span className="home-spacer" />
        <div className="codex-tabs">
          <button className={tab === "codex" ? "codex-tab codex-tab-on" : "codex-tab"} onClick={() => setTab("codex")}>도감</button>
          <button className={tab === "stats" ? "codex-tab codex-tab-on" : "codex-tab"} onClick={() => setTab("stats")}>전체 통계</button>
        </div>
        <RefreshButton onRefresh={props.onRefresh} title="통계 새로 고침" />
      </header>

      <div className="codex-toolbar">
        <label className="codex-only">
          <input type="checkbox" checked={onlyCollected} onChange={(e) => setOnlyCollected(e.target.checked)} />
          수집한 것만
        </label>
        <input
          className="codex-search"
          value={query}
          placeholder="증강 이름·설명 검색"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* 계열 필터 — 아이콘·라벨은 인게임 pill과 같은 CATEGORY_META를 쓴다.
          지금 조건에서 하나도 없는 계열은 칩 자체를 감춘다(누를 이유가 없다). */}
      <div className="codex-cats" role="group" aria-label="계열 필터">
        <button
          className={category === null ? "codex-cat codex-cat-on" : "codex-cat"}
          onClick={() => setCategory(null)}
        >
          전체 <span className="codex-cat-n">{catTotal}</span>
        </button>
        {AUGMENT_CATEGORIES.filter((c) => (catCounts.get(c) ?? 0) > 0 || c === category).map((c) => (
          <button
            key={c}
            className={`codex-cat aug-cat-${c}${category === c ? " codex-cat-on" : ""}`}
            onClick={() => setCategory(category === c ? null : c)}
          >
            <span className="codex-cat-ico" aria-hidden="true">{CATEGORY_META[c].icon}</span>
            {CATEGORY_META[c].label}
            <span className="codex-cat-n">{catCounts.get(c) ?? 0}</span>
          </button>
        ))}
      </div>

      <main className="codex-main">
        {filtered.length === 0 ? (
          <p className="home-empty">조건에 맞는 증강이 없습니다.</p>
        ) : tab === "codex" ? (
          <div className="codex-grid">
            {cards.map((m) => (
              <button
                key={m.cat.id}
                // 계열 색을 입힌다. 예전엔 모든 카드에 codex-card-prism 이 무조건 붙어
                // --rarity 가 사실상 상수였다 — 폐기된 등급 체계(docs/18 §4.1)의 잔재라
                // 색이 아무것도 말하지 않았다. 지금은 그 자리에 실제로 있는 정보(계열)를 넣는다.
                className={`codex-card codex-card-cat aug-cat-${augmentCategory(m.cat.id)}${m.collected ? "" : " codex-card-locked"}`}
                onClick={() => setSelected(m.cat.id)}
              >
                <div className="codex-card-top">
                  {m.collected ? <span className="codex-check">✓</span> : null}
                </div>
                <div className="codex-card-name">{m.cat.name}</div>
                {/* 카드는 요약만 — 원문과 상세는 카드를 눌러 여는 상세 오버레이에 있다 */}
                <div className="codex-card-desc">
                  <AugDesc id={m.cat.id} description={m.cat.description} variant="codex" expanded={false} />
                </div>
                {m.srv !== undefined && m.srv.games > 0 ? (
                  <div className="codex-card-foot">
                    서버 평균 <b className={avgRankClass(m.srv.avgPlacement)}>{m.srv.avgPlacement.toFixed(2)}</b>
                    <span className="codex-card-sample">· {m.srv.games}판</span>
                  </div>
                ) : (
                  <div className="codex-card-foot codex-dim">서버 표본 없음</div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="lb-scroll codex-table-scroll">
            <table className="lb-table aug-table codex-table">
              <thead>
                <tr>
                  <th className="aug-name-h codex-sort" onClick={() => toggleSort("name")}>증강{sortArrow("name")}</th>
                  <th className="codex-sort" onClick={() => toggleSort("myGames")}>내 판{sortArrow("myGames")}</th>
                  <th className="codex-sort" onClick={() => toggleSort("myAvg")}>내 평균{sortArrow("myAvg")}</th>
                  <th className="codex-sort" onClick={() => toggleSort("srvGames")}>서버 표본{sortArrow("srvGames")}</th>
                  <th className="codex-sort" onClick={() => toggleSort("srvPick")}>서버 픽률{sortArrow("srvPick")}</th>
                  <th className="codex-sort" onClick={() => toggleSort("srvAvg")}>서버 평균순위{sortArrow("srvAvg")}</th>
                  <th className="codex-sort" onClick={() => toggleSort("srvTop")}>서버 1위율{sortArrow("srvTop")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.cat.id} className="codex-row" onClick={() => setSelected(m.cat.id)}>
                    <td className="aug-name">
                      {m.cat.name}
                      {m.collected ? <span className="codex-check codex-check-sm">✓</span> : null}
                    </td>
                    <td>{statCell(m.mine?.games, "num")}</td>
                    <td>{statCell(m.mine && m.mine.games > 0 ? m.mine.avgPlacement : undefined, "avg")}</td>
                    <td>{statCell(m.srv?.games, "num")}</td>
                    <td>{statCell(m.srv && m.srv.offered > 0 ? m.srv.pickRate : undefined, "pct")}</td>
                    <td>{statCell(m.srv && m.srv.games > 0 ? m.srv.avgPlacement : undefined, "avg")}</td>
                    <td>{statCell(m.srv && m.srv.games > 0 ? m.srv.topRate : undefined, "pct")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {sel !== undefined ? (
        <div className="codex-overlay" onClick={() => setSelected(null)}>
          <div className="codex-detail" onClick={(e) => e.stopPropagation()}>
            <button className="codex-detail-close" onClick={() => setSelected(null)}>✕</button>
            <div className="codex-detail-head">
              <h2 className="codex-detail-name">{sel.name}</h2>
              {selMine !== undefined && (selMine.picked > 0 || selMine.games > 0) ? (
                <span className="codex-detail-owned">✓ 수집</span>
              ) : (
                <span className="codex-detail-owned codex-dim">미수집</span>
              )}
            </div>

            {selBadges.length > 0 ? (
              <div className="codex-detail-badges">
                {selBadges.map((b, i) => <span key={i} className="codex-badge">{b}</span>)}
              </div>
            ) : null}

            <div className="codex-detail-body">
              {selBrief !== null ? (
                <p className="codex-lead">
                  {selBrief.use !== "" ? <span className="augdesc-use">{selBrief.use}</span> : null}
                  <TermText text={selBrief.text} />
                </p>
              ) : null}
              {selParas.map((para, i) => (
                <p key={i} className="codex-para"><TermText text={para} /></p>
              ))}
            </div>

            <div className="codex-detail-stats">
              <div className="codex-stat-col">
                <div className="codex-stat-title">내 통계</div>
                {selMine !== undefined && (selMine.picked > 0 || selMine.games > 0) ? (
                  <ul className="codex-stat-list">
                    <li>제시 <b>{selMine.offered}</b>회 · 선택 <b>{selMine.picked}</b>회
                      {selMine.offered > 0 ? <span className="codex-dim"> (픽률 {pct(selMine.pickRate)})</span> : null}</li>
                    <li>보유 <b>{selMine.games}</b>판 · 평균순위 {statCell(selMine.games > 0 ? selMine.avgPlacement : undefined, "avg")}</li>
                    <li>1위율 <b>{selMine.games > 0 ? pct(selMine.topRate) : "-"}</b></li>
                  </ul>
                ) : (
                  <p className="codex-dim codex-stat-empty">아직 이 증강 기록이 없습니다.</p>
                )}
              </div>
              <div className="codex-stat-col">
                <div className="codex-stat-title">서버 전체</div>
                {selSrv !== undefined && (selSrv.games > 0 || selSrv.offered > 0) ? (
                  <ul className="codex-stat-list">
                    <li>제시 <b>{selSrv.offered}</b>회 · 선택 <b>{selSrv.picked}</b>회
                      {selSrv.offered > 0 ? <span className="codex-dim"> (픽률 {pct(selSrv.pickRate)})</span> : null}</li>
                    <li>표본 <b>{selSrv.games}</b>판 · 평균순위 {statCell(selSrv.games > 0 ? selSrv.avgPlacement : undefined, "avg")}</li>
                    <li>1위율 <b>{selSrv.games > 0 ? pct(selSrv.topRate) : "-"}</b></li>
                    {selMaster !== undefined ? (
                      <li>증강 장인 👑 <b>{selMaster.nickname}</b> <b className={avgRankClass(selMaster.avg)}>{selMaster.avg.toFixed(2)}</b>
                        <span className="codex-dim"> ({selMaster.games}판)</span></li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="codex-dim codex-stat-empty">서버 집계 표본이 아직 없습니다.</p>
                )}
              </div>
            </div>
            <div className="codex-detail-id">{sel.id}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────── 게스트 체험 마무리 ───────────────────────────

/**
 * 게스트가 게임 밖에 있을 때 보는 유일한 화면.
 *
 * 게스트에게 홈을 보여 줄 수는 없다 — 홈의 카드는 전부 계정 기능(통계·리플레이·
 * 리더보드·제보)이라 서버가 하나하나 거절한다. 대신 지금 할 수 있는 것만 놓는다:
 * 한 판 더, 도감, 규칙, 그리고 **계정 만들기**.
 *
 * 가입 게이트는 여기서도 열리지 않는다 — "계정 만들기"는 로그인 화면으로 돌려보낼
 * 뿐이고, 코드가 필요한 서버에서는 여전히 코드가 필요하다.
 */
function GuestOutro(props: {
  username: string;
  onPlayAgain: () => void;
  onOpenCodex: () => void;
  onOpenHelp: () => void;
  onSignUp: () => void;
}): JSX.Element {
  return (
    <div className="lobby">
      <div className="lobby-card auth-card">
        <h1 className="lobby-title">이능마작</h1>
        <p className="lobby-tag">게스트 체험 — {props.username}</p>
        <p className="guest-note">
          체험 게임은 <b>기록에 남지 않습니다</b> — 리플레이·누적 통계·리더보드 어디에도
          올라가지 않고, 창을 닫으면 이 손님 이름도 사라집니다.
        </p>
        <button className="lobby-join" onClick={props.onPlayAgain}>▶ 한 판 더 체험</button>
        <div className="guest-actions">
          <button className="wr-btn wr-bot" onClick={props.onOpenHelp}>📘 규칙 · 도움말</button>
          <button className="wr-btn wr-bot" onClick={props.onOpenCodex}>📖 증강 도감</button>
        </div>
        <p className="guest-note">
          계정을 만들면 친구와 방 코드로 함께 두고, 전적·리플레이·리더보드가 쌓이고,
          제보 게시판으로 증강 아이디어를 낼 수 있습니다.
        </p>
        <button className="home-create" onClick={props.onSignUp}>계정 만들고 계속하기</button>
      </div>
    </div>
  );
}

// ─────────────────────────── 규칙 · 도움말 ───────────────────────────

/**
 * 처음 온 사람을 위한 규칙 화면 — **로그인 전·홈·게임 중** 어디서나 열린다.
 *
 * 이 제품에는 이런 화면이 아예 없었다. 리치마작은 배우기 어렵기로 유명한데,
 * 여기에 규칙을 다시 쓰는 증강 113종이 얹혀 있고, "증강이 무엇이고 언제 뽑는가"를
 * 설명하는 자리는 대기실 팁 한 줄이 전부였다.
 *
 * 목표는 규칙서가 아니라 **길을 잃지 않을 만큼**이다. 각 항목의 더 깊은 설명은
 * 게임 안 용어 풀이(glossary)와 증강 도감이 이어받는다.
 *
 * 탭마다 독자가 다르다 — basics는 리치마작을 모르는 사람, terms는 읽다가 모르는 말에
 * 걸린 사람(툴팁은 그 말을 마주쳐야 뜬다 — 나중에 되찾을 자리가 여기다), yaku는 "모양은 알겠는데
 * 뭘 만들어야 하나" 하는 사람, augment는 마작을 **아는 사람**이다.
 * augment 탭에서 멘젠·텐파이·후리텐을 풀어 쓰지 않는 것은 의도다.
 *
 * 화면은 도감(`CodexScreen`)의 뼈대(.codex 계열)를 그대로 쓴다 — 새 디자인 언어를
 * 만들지 않는다.
 */
type HelpTab = "basics" | "yaku" | "terms" | "augment";

/**
 * 그림 한 줄 — 실제 패 그림으로 보여 주는 예시.
 *
 * 글로만 적힌 "같은 종류의 연속 3장"은 마작을 모르는 사람에게 아무 그림도 그려 주지
 * 못한다. 여기서 쓰는 패는 게임판과 **같은 이미지**(`/tiles/*.png`, TileImg)다 —
 * 규칙 화면에서 본 그림이 게임 안에서 그대로 다시 나온다.
 */
interface HelpFigRow {
  /** 왼쪽 라벨 (예: "슌쯔", "대기", "표시패") */
  label?: string;
  /** 패 표기 — 묶음은 공백으로 나눈다. `234m 55p 1z` (z: 1~4 동남서북, 5~7 백발중) */
  tiles: string;
  /** `→` 뒤에 붙는 결과 묶음 (표시패→도라, 들고 있는 패→울어서 만든 묶음) */
  then?: string;
  /** 줄 아래 설명 한 줄 (용어 풀이 링크가 걸린다) */
  note?: string;
  /** 되는 예(○) / 안 되는 예(✕) 표식 */
  mark?: "ok" | "no";
}

/** 한 절(제목 + 문단들 + 그림). 문단에는 용어 풀이 링크(TermText)가 걸린다. */
interface HelpSection {
  title: string;
  paras: string[];
  /** 문단 아래에 붙는 패 그림 */
  figure?: HelpFigRow[];
  /** 그림 대신(또는 함께) 붙는 화면 조각 — 게임 UI를 그대로 재현한 견본 */
  mock?: "action-bar";
}

/**
 * `234m` `55p` `1z` 같은 표기를 패 종류로 푼다. 표준 마작 표기와 같다 —
 * 숫자들 뒤에 무늬 한 글자(m 만 · p 통 · s 삭 · z 자패)가 붙는다.
 * 알아볼 수 없는 조각은 조용히 버린다(문안 오타가 화면을 깨지 않게).
 */
function parseHelpTiles(group: string): TileKind[] {
  const out: TileKind[] = [];
  const m = /^([0-9]+)([mpsz])$/.exec(group.trim());
  if (m === null) return out;
  const [, digits, suit] = m as unknown as [string, string, string];
  for (const ch of digits) {
    const n = Number(ch);
    if (suit === "z") {
      if (n >= 1 && n <= 4) out.push({ suit: "wind", rank: n });
      else if (n >= 5 && n <= 7) out.push({ suit: "dragon", rank: n - 4 });
      continue;
    }
    if (n < 1 || n > 9) continue;
    out.push({ suit: suit === "m" ? "man" : suit === "p" ? "pin" : "sou", rank: n });
  }
  return out;
}

/** 공백으로 나뉜 묶음들을 그린다 — 묶음 사이는 눈에 보이게 벌린다. */
function HelpTileGroups({ tiles }: { tiles: string }): JSX.Element {
  return (
    <span className="help-fig-groups">
      {tiles.split(/\s+/).filter((g) => g !== "").map((g, gi) => (
        <span key={gi} className="help-fig-group">
          {parseHelpTiles(g).map((kind, i) => (
            <TileImg key={i} tile={{ kind }} size="mini" />
          ))}
        </span>
      ))}
    </span>
  );
}

function HelpFigure({ rows }: { rows: HelpFigRow[] }): JSX.Element {
  return (
    <div className="help-fig">
      {rows.map((row, i) => (
        <div key={i} className={row.mark === undefined ? "help-fig-row" : `help-fig-row help-fig-${row.mark}`}>
          <div className="help-fig-line">
            {/* 표식은 줄 맨 앞 — 뒤에 두면 좁은 화면에서 패 줄에 밀려 혼자 다음 줄로 떨어졌다 */}
            {row.mark !== undefined ? (
              <span className="help-fig-mark">{row.mark === "ok" ? "○" : "✕"}</span>
            ) : null}
            {row.label !== undefined ? <span className="help-fig-label">{row.label}</span> : null}
            <HelpTileGroups tiles={row.tiles} />
            {row.then !== undefined ? (
              <>
                <span className="help-fig-arrow">→</span>
                <HelpTileGroups tiles={row.then} />
              </>
            ) : null}
          </div>
          {row.note !== undefined ? (
            <p className="help-fig-note"><TermText text={row.note} /></p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const HELP_BASICS: HelpSection[] = [
  {
    title: "무엇을 하는 게임인가",
    paras: [
      "네 사람이 각자 손에 패 13장을 쥐고, 차례마다 한 장을 가져와 한 장을 버립니다. 목표는 남보다 먼저 손패를 완성해 화료하는 것입니다.",
      "완성형은 언제나 같습니다 — 3장짜리 묶음 4개 + 같은 패 2장(머리) 1개. 묶음은 같은 패 3장(커쯔) 또는 같은 종류의 연속 3장(슌쯔)입니다.",
    ],
    figure: [
      { label: "슌쯔", tiles: "456p", note: "같은 무늬의 연속 3장." },
      { label: "커쯔", tiles: "777s", note: "같은 패 3장. 자패로도 됩니다." },
      { label: "머리", tiles: "55m", note: "같은 패 2장. 한 손에 하나뿐입니다." },
      {
        label: "완성형",
        tiles: "234m 678m 345p 111s 99p",
        note: "**묶음 4개 + 머리 1개 = 14장.** 어떤 화료형이든 결국 이 모양입니다.",
      },
    ],
  },
  {
    title: "역이 없으면 화료할 수 없다",
    paras: [
      "모양만 맞춘다고 끝이 아닙니다. 손패가 미리 정해진 조건(역) 중 하나 이상을 만족해야 화료를 선언할 수 있습니다. 리치·탕야오·핑후·역패 같은 것들입니다.",
      "모양을 완성하고도 역이 없으면 화료하지 못합니다.",
    ],
    figure: [
      {
        mark: "ok",
        tiles: "234m 678m 345p 567s 55p",
        note: "1·9와 자패가 하나도 없습니다 — **탕야오**. 역이 있으니 화료할 수 있습니다.",
      },
      {
        mark: "no",
        tiles: "111m 678m 345p 567s 55p",
        note: "모양은 똑같이 완성입니다. 그런데 1만이 섞여 탕야오가 아니고, 커쯔가 있어 핑후도 아닙니다 — 리치를 걸지 않았다면 **화료할 수 없습니다.**",
      },
    ],
  },
  {
    title: "리치",
    paras: [
      "손패를 남에게 하나도 보이지 않은 채(멘젠) 한 장만 더 오면 완성인 상태(텐파이)가 되면, 1000점을 걸고 리치를 선언할 수 있습니다.",
      "리치를 걸면 그 뒤로는 손패를 바꿀 수 없습니다 — 가져온 패를 그대로 버립니다. 대신 역이 확정되고, 도라를 한 겹 더 받고(우라도라), 타점이 크게 뜁니다.",
      "화면에 뜨는 오름패에는 작은 숫자가 붙습니다 — 그 패가 **아직 보이지 않은 장수**입니다. 기본 4장에서 버림패·울음·도라 표시패·내 손패에 이미 나온 만큼을 뺀 값이고(증강이 만들어 낸 패는 세지 않습니다), **0이면 그 패는 다 나가서 그것으로는 날 수 없습니다.**",
    ],
    figure: [
      {
        label: "텐파이",
        tiles: "234m 678m 345p 55p 78s",
        note: "13장. 78삭 자리만 채우면 완성입니다.",
      },
      {
        label: "대기",
        tiles: "6s 9s",
        note: "이 둘 중 하나가 오면 화료. 이 상태에서 **리치**를 선언할 수 있습니다.",
      },
    ],
  },
  {
    title: "도라 — 보너스 패",
    paras: [
      "판마다 표시패 한 장이 공개되고, 그 다음 패가 도라가 됩니다. 도라를 몇 장 쥐고 있느냐가 그대로 타점이 됩니다.",
      "도라는 역이 아닙니다. 도라만 잔뜩 있어도 역이 없으면 화료할 수 없습니다.",
    ],
    figure: [
      { label: "표시패", tiles: "5p", then: "6p", note: "표시패의 **다음** 패가 도라입니다." },
      { label: "표시패", tiles: "9s", then: "1s", note: "9 다음은 1로 돌아옵니다." },
      { label: "표시패", tiles: "4z", then: "1z", note: "바람은 동→남→서→북→동, 삼원패는 백→발→중→백 순으로 돕니다." },
    ],
  },
  {
    title: "울기 — 치 · 퐁 · 깡",
    paras: [
      "남이 버린 패를 가져와 묶음을 완성할 수 있습니다. 연속 두 장을 들고 있으면 바로 위(상가)에게서만 치, 같은 패 2장을 들고 있으면 누구에게서든 퐁입니다. 같은 패 4장은 깡입니다.",
      "울면 그 묶음이 공개되고 멘젠이 깨집니다 — 리치를 걸 수 없고 쓸 수 있는 역이 줄어듭니다.",
    ],
    figure: [
      { label: "치", tiles: "34m", then: "234m", note: "연속 두 장을 들고 있을 때, **왼쪽 사람(상가)** 이 버린 2만이나 5만만 가져올 수 있습니다." },
      { label: "퐁", tiles: "77p", then: "777p", note: "같은 패 두 장. 이쪽은 **누가 버려도** 가져옵니다." },
      { label: "깡", tiles: "777s", then: "7777s", note: "같은 패 넷. 도라 표시패가 한 장 늘고 패를 한 장 더 가져옵니다." },
    ],
  },
  {
    title: "후리텐 — 내가 버린 패로는 못 난다",
    paras: [
      "내 대기(화료할 수 있는 패) 중 하나라도 내 버림패에 있으면, 남이 버린 패로는 화료할 수 없습니다. 이것이 후리텐입니다.",
      "이때도 스스로 가져와서 나는 것(쯔모)은 됩니다. 리치 뒤에 후리텐이 되면 그 국 내내 풀리지 않습니다.",
    ],
    figure: [
      { label: "내 대기", tiles: "3s 6s", note: "이 손패는 3삭·6삭으로 화료할 수 있습니다." },
      {
        label: "내 버림패",
        tiles: "1p 9m 6s 2z",
        mark: "no",
        note: "대기 중 하나(6삭)가 내 버림패에 있습니다 — 이러면 3삭이 나와도 **론할 수 없습니다.** 쯔모는 그대로 됩니다.",
      },
    ],
  },
  {
    title: "점수는 대략 이렇게 정해진다",
    paras: [
      "판(역과 도라의 개수)과 부(손패 모양)로 점수가 정해집니다. 판이 커질수록 점수는 계단처럼 뜁니다 — 만관·하네만·배만·역만.",
      "남이 버린 패로 나면 그 사람만 냅니다(론). 스스로 가져와서 나면 나머지 셋이 나눠 냅니다(쯔모). 친(동가)은 더 받고 더 냅니다.",
    ],
  },
  {
    title: "판은 언제 끝나는가",
    paras: [
      "동1국부터 시작합니다. 반장전은 남4국까지, 동풍전은 동4국까지 갑니다. 친이 화료하거나 텐파이로 유국하면 그 자리가 이어집니다(연장).",
      "마지막 국이 끝나면 점수 순으로 1~4위가 정해집니다. 성적은 순위로 남습니다.",
    ],
  },
  {
    title: "조작",
    paras: [
      "지금 할 수 있는 행동은 화면 아래에 버튼으로 뜹니다. 처음 보는 용어에는 밑줄이 있어 누르면 풀이가 나옵니다.",
      "손패는 끌어서 순서를 바꿀 수 있습니다. 자동 정렬·대기 표시 같은 것은 설정(⚙)에서 켜고 끕니다.",
    ],
  },
];

// 이 탭은 리치마작을 아는 사람이 읽는다고 가정한다 — 멘젠·텐파이·후리텐·역만을
// 풀어 쓰지 않는다. 규칙 설명은 basics 탭이 맡는다.
//
// 수치를 문장에 박아 두지 않는다 — 예전 문안이 "총 2개"·"104종"에 멈춰 있었다.
// 종수는 **서버가 보내 준 카탈로그에서** 센다. 예전에는 `contentAugments.length`로
// 셌는데, 그 한 줄 때문에 증강 구현 117개(1.2MB)와 그 전이 의존(HanchanController·
// standardActions 등 **서버 전용 엔진**)이 통째로 클라이언트 번들에 딸려 들어왔다.
// 트리셰이킹도 안 됐다 — defineAugment가 검증 실패 시 throw 하는 부수효과 함수라
// 롤업이 각 모듈을 순수로 판정하지 못한다 (감사 2026-08-17 §7-1).
//
// 획득 시점은 HanchanController의 draftSchedules(반장전 gameStart·eastThird·
// southEntry·southThird / 동풍전 gameStart·eastThird·eastFourth)와 같은 값을 쓴다.
function helpAugmentSections(kinds: number): HelpSection[] {
  return [
  {
    title: "증강",
    paras: [
      "타점 보너스가 아니라 규칙을 바꾸는 카드입니다. 후리텐인 채로 론하고, 백을 만능패로 쓰고, 남의 버림패를 손으로 가져오고, 리치를 건 뒤에 손패를 바꿉니다.",
      `${kinds}종이 점수·손패 조작·화료형·정보·리치·수비·후로·교란 계열로 나뉩니다.`,
    ],
    figure: [
      {
        label: "예 · 백은 만능패",
        tiles: "23m 5z",
        then: "234m",
        note: "백 한 장이 없는 4만 자리를 그대로 메웁니다. 타점이 아니라 **규칙**이 바뀐 것입니다.",
      },
    ],
  },
  {
    title: "언제 몇 개",
    paras: [
      "반장전은 네 번 — 동1국 개시, 동3국, 남1국, 남3국. 동풍전은 세 번 — 동1국 개시, 동3국, 동4국.",
      "그 국에 들어서는 순간 네 명이 동시에 각자 후보를 받아 하나씩 고릅니다. 후보는 자리마다 다르고, 한 게임에 같은 증강이 두 번 나오지 않습니다.",
    ],
  },
  {
    title: "상시형과 액티브형",
    paras: [
      "상시형은 가진 것만으로 적용됩니다. 규칙이 이미 바뀐 상태라 따로 쓸 것이 없습니다.",
      "액티브형은 조건이 맞는 순간 행동 버튼 줄에 그 증강의 버튼이 뜹니다. 누를지 말지, 언제 누를지가 선택입니다. 패를 고르는 증강은 선택창이 열리고 바뀔 결과를 먼저 보여 줍니다.",
      "증강 버튼은 **보랏빛**이라 론·퐁·패스와 한눈에 구분됩니다.",
    ],
    mock: "action-bar",
  },
  {
    title: "제한 — 이름표에 다 뜬다",
    paras: [
      "제한은 증강마다 다르고, 지금 상태는 이름표 옆 증강 칸에 표시됩니다.",
      "🕐N국 쿨다운 · 게이지는 퀘스트 진행도(조건을 채워야 열립니다) · 🔒 는 상대의 무장해제로 잠긴 것 · ♻ 는 재장전으로 되살린 것 · 🎲 는 주사위로 얻은 것. 사용 횟수는 각 증강 설명에 적혀 있습니다.",
      "발동에 점수를 지불하지 않습니다. 제한은 횟수와 조건으로만 걸립니다.",
    ],
  },
  {
    title: "상대의 증강은 전부 공개된다",
    paras: [
      "누가 무엇을 들고 있는지 이름표 옆에 그대로 보입니다. 감춰지는 정보가 아닙니다.",
      `게임 중 아무 때나 📖 도감에서 ${kinds}종 전체를 찾아볼 수 있습니다.`,
    ],
  },
  ];
}

/**
 * 액션 바 견본 — 게임 화면 아래에 뜨는 버튼 줄을 **같은 클래스로** 그대로 그린다.
 *
 * 그림 파일을 따로 두지 않는 이유: 버튼 색과 모양이 바뀌면 스크린샷은 그 자리에서
 * 낡는다. `.action-bar`/`.act`를 그대로 쓰면 게임이 바뀔 때 이 견본도 같이 바뀐다.
 * (`.help-actbar`가 크기만 줄인다. 등장 애니메이션도 여기서 끈다.)
 */
function HelpActionBarMock(): JSX.Element {
  return (
    <div className="help-actbar" aria-hidden="true">
      <div className="action-bar">
        <button className="act act-win" type="button">론</button>
        <button className="act act-call" type="button">퐁</button>
        {/* 실제로 있는 액티브 증강 이름을 쓴다 (ACTION_LABEL.bottom_deal) — 지어낸 이름을
            보여 주면 게임 안에서 찾을 수 없다 */}
        <button className="act act-aug" type="button">밑장빼기</button>
        <button className="act act-pass" type="button">패스</button>
      </div>
    </div>
  );
}

/**
 * 역 한 줄. `tiles`가 없는 역은 손 모양이 아니라 **상황**으로 성립하는 것들이다
 * (리치·일발·해저로월…) — 억지로 손패를 그려 봐야 아무것도 설명하지 못한다.
 */
interface YakuEntry {
  name: string;
  /** 판수 표기 — 멘젠/후로가 다르면 그것까지 (예: "2판 · 울면 1판") */
  han: string;
  note: string;
  /** 예시 손패 (`234m 55p` 표기, 묶음은 공백) */
  tiles?: string;
}

interface YakuGroup {
  title: string;
  items: YakuEntry[];
}

/*
 * 이 표는 서버가 실제로 판정하는 역(core의 standardYakuList)과 **같은 목록**이다.
 * 이름과 판수를 바꾸려면 그쪽부터 본다 — 여기만 고치면 화면과 정산이 어긋난다.
 * (증강이 역을 더 얹거나 조건을 바꾸는 경우가 있는데, 그건 도감이 맡는다.)
 */
const HELP_YAKU: YakuGroup[] = [
  {
    title: "1판",
    items: [
      { name: "리치", han: "1판 · 멘젠", note: "멘젠 텐파이에서 1000점을 걸고 선언. 이후 손패를 바꿀 수 없습니다." },
      { name: "일발", han: "1판 · 멘젠", note: "리치를 걸고 한 바퀴가 돌기 전에 화료. 중간에 울음이 들어가면 사라집니다." },
      { name: "멘젠쯔모", han: "1판 · 멘젠", note: "한 번도 울지 않은 손으로 스스로 뽑아 화료." },
      {
        name: "핑후",
        han: "1판 · 멘젠",
        tiles: "234m 567m 345p 678s 99p",
        note: "슌쯔 4개 + 역패가 아닌 머리, 그리고 양쪽으로 기다리는 대기. 커쯔가 하나라도 있으면 아닙니다.",
      },
      {
        name: "탕야오",
        han: "1판",
        tiles: "234m 678m 345p 567s 55p",
        note: "1·9와 자패가 하나도 없는 손. 울어도 됩니다.",
      },
      {
        name: "이페코",
        han: "1판 · 멘젠",
        tiles: "234m 234m 678p 345s 99s",
        note: "똑같은 슌쯔 두 벌.",
      },
      {
        name: "역패 — 백 · 발 · 중",
        han: "1판",
        tiles: "555z 234m 678p 345s 99s",
        note: "삼원패(백·발·중) 커쯔. 세 종류 각각이 1판이라 두 종류를 모으면 2판입니다.",
      },
      {
        name: "역패 — 자풍 · 장풍",
        han: "1판",
        tiles: "111z 234m 678p 345s 99s",
        note: "내 자리 바람(자풍) 또는 그 판의 바람(장풍) 커쯔. 동장의 동가라면 동 커쯔 하나가 2판입니다.",
      },
      { name: "해저로월 · 하저로어", han: "1판", note: "마지막 패로 쯔모(해저) 하거나, 마지막 버림패로 론(하저)." },
      { name: "영상개화", han: "1판", note: "깡을 하고 가져온 영상패로 그대로 화료." },
      { name: "창깡", han: "1판", note: "남이 가깡하려는 패로 론." },
    ],
  },
  {
    title: "2판",
    items: [
      { name: "더블리치", han: "2판 · 멘젠", note: "첫 순번에, 아무도 울지 않은 채 건 리치." },
      {
        name: "치또이쯔",
        han: "2판 · 멘젠",
        tiles: "11m 44m 77m 22p 99p 33s 55z",
        note: "같은 패 2장씩 일곱 쌍. 이것만 묶음 4개+머리 규칙에서 벗어납니다.",
      },
      {
        name: "또이또이",
        han: "2판",
        tiles: "111m 444p 777s 333z 22m",
        note: "묶음이 전부 커쯔. 슌쯔가 하나도 없습니다.",
      },
      {
        name: "산안커",
        han: "2판",
        tiles: "111m 444p 777s 234s 99m",
        note: "울지 않고 만든 커쯔 3개. 퐁으로 만든 커쯔는 세지 않습니다.",
      },
      {
        name: "삼색동순",
        han: "2판 · 울면 1판",
        tiles: "234m 234p 234s 678m 99s",
        note: "만·통·삭 세 무늬로 같은 숫자의 슌쯔.",
      },
      {
        name: "삼색동각",
        han: "2판",
        tiles: "333m 333p 333s 678m 99s",
        note: "세 무늬로 같은 숫자의 커쯔.",
      },
      {
        name: "일기통관",
        han: "2판 · 울면 1판",
        tiles: "123m 456m 789m 234p 55s",
        note: "한 무늬로 1~9를 쭉 잇습니다.",
      },
      {
        name: "찬타",
        han: "2판 · 울면 1판",
        tiles: "123m 789p 123s 111z 99s",
        note: "모든 묶음과 머리에 1·9나 자패가 하나씩 들어 있습니다.",
      },
      {
        name: "소삼원",
        han: "2판",
        tiles: "555z 666z 77z 234m 678p",
        note: "삼원패 중 둘은 커쯔, 하나는 머리. 역패 2판이 같이 붙어 실제로는 4판부터 시작합니다.",
      },
      {
        name: "혼노두",
        han: "2판",
        tiles: "111m 999p 111z 555z 99s",
        note: "1·9와 자패만으로 이뤄진 손. 또이또이가 거의 항상 함께 붙습니다.",
      },
      { name: "산깡쯔", han: "2판", tiles: "1111m 4444p 7777s 234s 99m", note: "깡 3개." },
    ],
  },
  {
    title: "3판 이상",
    items: [
      {
        name: "량페코",
        han: "3판 · 멘젠",
        tiles: "234m 234m 567p 567p 99s",
        note: "이페코 두 벌. 멘젠이어야 합니다.",
      },
      {
        name: "준찬타",
        han: "3판 · 울면 2판",
        tiles: "123m 789m 123p 789s 99s",
        note: "모든 묶음과 머리에 1·9가 들어가되 자패는 하나도 없습니다.",
      },
      {
        name: "혼일색",
        han: "3판 · 울면 2판",
        tiles: "123m 456m 789m 111z 55z",
        note: "한 무늬 + 자패만.",
      },
      {
        name: "청일색",
        han: "6판 · 울면 5판",
        tiles: "123m 456m 789m 234m 55m",
        note: "자패 없이 한 무늬로만. 이것 하나로 하네만 이상입니다.",
      },
    ],
  },
  {
    title: "역만",
    items: [
      {
        name: "국사무쌍",
        han: "역만 · 멘젠",
        tiles: "19m 19p 19s 1234z 567z 1m",
        note: "1·9와 자패 13종류를 한 장씩, 그중 하나만 두 장. 13종 아무 패로나 기다리면 2배역만.",
      },
      {
        name: "스안커",
        han: "역만 · 멘젠",
        tiles: "111m 444p 777s 333z 99m",
        note: "울지 않고 만든 커쯔 4개. 머리로 기다려서 나면 2배역만(단기).",
      },
      { name: "대삼원", han: "역만", tiles: "555z 666z 777z 234m 99p", note: "백·발·중 커쯔 셋." },
      {
        name: "소사희 · 대사희",
        han: "역만 / 2배역만",
        tiles: "111z 222z 333z 44z 234m",
        note: "바람 넷 중 셋이 커쯔 + 나머지가 머리면 소사희, 넷 다 커쯔면 대사희(2배역만).",
      },
      { name: "자일색", han: "역만", tiles: "111z 333z 555z 777z 22z", note: "자패만으로." },
      { name: "녹일색", han: "역만", tiles: "234s 234s 666s 888s 66z", note: "초록만 있는 패(2·3·4·6·8삭과 발)로만." },
      { name: "청노두", han: "역만", tiles: "111m 999m 111p 999s 99p", note: "1과 9만으로. 자패도 안 됩니다." },
      {
        name: "구련보등",
        han: "역만 · 멘젠",
        tiles: "1112345678999m 5m",
        note: "한 무늬로 1112345678999. 이 모양은 그 무늬 아무 패로나 화료합니다.",
      },
      {
        name: "순정구련보등",
        han: "2배역만 · 멘젠",
        tiles: "1112345678999m 5m",
        note: "뼈대 1112345678999를 그대로 세운 채 그 무늬 9종 전부로 기다린 것. 다른 대기로 완성한 구련은 역만 하나입니다.",
      },
      { name: "스깡쯔", han: "역만", tiles: "1111m 4444p 7777s 2222z 99m", note: "깡 4개." },
      { name: "천화 · 지화", han: "역만 · 멘젠", note: "친이 배패 그대로 화료하면 천화, 자식이 첫 쯔모로 화료하면 지화." },
      { name: "국사무쌍 13면 · 스안커 단기", han: "2배역만", note: "위 두 역의 가장 어려운 대기 형태. 점수가 두 배가 됩니다." },
    ],
  },
];

function YakuTab(): JSX.Element {
  return (
    <>
      {HELP_YAKU.map((group) => (
        <section key={group.title} className="help-section">
          <h2 className="help-section-title">{group.title}</h2>
          <div className="yaku-list">
            {group.items.map((y) => (
              <div key={y.name} className="yaku-row">
                <div className="yaku-head">
                  <span className="yaku-name">{y.name}</span>
                  <span className="yaku-han">{y.han}</span>
                </div>
                {y.tiles !== undefined ? (
                  <div className="help-fig-line yaku-tiles">
                    <HelpTileGroups tiles={y.tiles} />
                  </div>
                ) : null}
                <p className="help-fig-note"><TermText text={y.note} /></p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** 탭마다 맨 위에 서는 한 줄 — 여기 읽는 사람이 누구인지 먼저 말한다. */
const HELP_LEAD: Record<HelpTab, string> = {
  basics:
    "리치마작을 한 번도 해 본 적 없어도 길을 잃지 않을 만큼만 적었습니다. 게임 안에서는 처음 나오는 용어에 밑줄이 그어져 있어 누르면 풀이가 뜹니다.",
  yaku: "모양을 완성해도 이 중 하나는 있어야 화료할 수 있습니다. 자주 나오는 것부터, 예시 손패와 함께.",
  terms:
    "게임 안에서 밑줄 그어진 말에 마우스를 올리면 뜨는 풀이를 한자리에 모았습니다. 검색하거나 분류로 좁혀 찾으세요.",
  augment: "증강이 무엇이고, 언제 뽑고, 어떻게 작동하는지.",
};

/**
 * 용어 설명집 — `glossary.ts`를 **그대로** 읽어 분류별로 늘어놓는다.
 *
 * 본문에서 용어에 마우스를 올리면 한 줄 풀이가 뜨지만, 그건 그 말을 **마주쳤을 때**만
 * 열린다. "후리텐이 뭐였더라"를 나중에 다시 찾아볼 자리가 없었다 — 여기가 그 자리다.
 *
 * 문안은 여기 한 줄도 적지 않는다. 툴팁과 설명집이 같은 표를 읽으므로 갈릴 수 없다.
 * 툴팁은 언제나 `short`(판을 가리면 안 되니까), 설명집은 `long`이 있으면 그쪽이다.
 */
/** 매칭 표기 가운데 정규식이 아닌 것 — 화면에 "다른 표기"로 보여 주고 검색어로도 받는다 */
function plainAliases(entry: GlossaryEntry): string[] {
  return (entry.match ?? []).filter((m) => /^[가-힣A-Za-z0-9·]+$/.test(m) && m !== entry.label);
}

function TermsTab(): JSX.Element {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GlossaryGroup | null>(null);

  const needle = query.trim().toLowerCase();
  // 검색은 표기(별칭 포함)와 풀이 본문 전부를 훑는다 — "1000점"으로 리치를 찾을 수 있어야 한다
  const matched = useMemo(
    () =>
      needle === ""
        ? GLOSSARY
        : GLOSSARY.filter((e) =>
            [e.label, ...plainAliases(e), e.short, e.long ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(needle),
          ),
    [needle],
  );
  const counts = useMemo(() => {
    const m = new Map<GlossaryGroup, number>();
    for (const e of matched) m.set(e.group, (m.get(e.group) ?? 0) + 1);
    return m;
  }, [matched]);
  const shown = group === null ? matched : matched.filter((e) => e.group === group);

  return (
    <>
      <div className="terms-bar">
        <input
          className="codex-search terms-search"
          value={query}
          placeholder="용어 검색 (예: 후리텐, 1000점)"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="codex-cats terms-cats" role="group" aria-label="분류 필터">
          <button
            className={group === null ? "codex-cat codex-cat-on" : "codex-cat"}
            onClick={() => setGroup(null)}
          >
            전체 <span className="codex-cat-n">{matched.length}</span>
          </button>
          {/* 지금 조건에서 하나도 없는 분류는 칩을 감춘다 — 누를 이유가 없다 (도감과 같은 규칙) */}
          {GLOSSARY_GROUPS.filter((g) => (counts.get(g.id) ?? 0) > 0 || g.id === group).map((g) => (
            <button
              key={g.id}
              className={group === g.id ? "codex-cat codex-cat-on" : "codex-cat"}
              onClick={() => setGroup(group === g.id ? null : g.id)}
            >
              {g.label} <span className="codex-cat-n">{counts.get(g.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="home-empty">찾는 용어가 없습니다.</p>
      ) : (
        GLOSSARY_GROUPS.map((g) => {
          const rows = shown.filter((e) => e.group === g.id);
          if (rows.length === 0) return null;
          return (
            <section key={g.id} className="help-section">
              <h2 className="help-section-title">{g.label}</h2>
              <div className="term-list">
                {rows.map((e) => {
                  const alias = plainAliases(e);
                  return (
                    <div key={e.key} className="term-row">
                      <div className="term-head">
                        <span className="term-name">{e.label}</span>
                        {alias.length > 0 ? (
                          <span className="term-alias">{alias.join(" · ")}</span>
                        ) : null}
                      </div>
                      <p className="term-body"><TermText text={e.long ?? e.short} /></p>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function HelpScreen(props: {
  /**
   * 증강 종수 — **서버 카탈로그에서 센 값**을 받는다.
   * 여기서 직접 세지 않는 이유는 helpAugmentSections 위 주석 참고(번들 §7-1).
   */
  augmentKinds: number;
  /** 왼쪽 위 되돌아가기 버튼 문구 (기본 "← 닫기"). */
  backLabel?: string;
  /** "증강이란" 탭에서 도감으로 건너가기. 도감은 이 화면 **위에** 뜨고, 닫으면 여기로 돌아온다. */
  onOpenCodex?: () => void;
  onClose: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<HelpTab>("basics");
  const augSections = useMemo(() => helpAugmentSections(props.augmentKinds), [props.augmentKinds]);
  const sections = tab === "basics" ? HELP_BASICS : augSections;
  const lead = HELP_LEAD[tab];

  return (
    <div className="codex help-screen">
      <header className="home-nav codex-nav">
        <button className="codex-back" onClick={props.onClose}>{props.backLabel ?? "← 닫기"}</button>
        <span className="home-logo">규칙 · 도움말</span>
        <span className="home-spacer" />
        <div className="codex-tabs">
          <button
            className={tab === "basics" ? "codex-tab codex-tab-on" : "codex-tab"}
            onClick={() => setTab("basics")}
          >
            리치마작 기본
          </button>
          <button
            className={tab === "yaku" ? "codex-tab codex-tab-on" : "codex-tab"}
            onClick={() => setTab("yaku")}
          >
            역 목록
          </button>
          <button
            className={tab === "terms" ? "codex-tab codex-tab-on" : "codex-tab"}
            onClick={() => setTab("terms")}
          >
            용어 설명집
          </button>
          <button
            className={tab === "augment" ? "codex-tab codex-tab-on" : "codex-tab"}
            onClick={() => setTab("augment")}
          >
            증강이란
          </button>
        </div>
      </header>

      <main className="codex-main help-main">
        <p className="codex-lead">{lead}</p>
        {tab === "yaku" ? (
          <YakuTab />
        ) : tab === "terms" ? (
          <TermsTab />
        ) : (
          sections.map((sec) => (
            <section key={sec.title} className="help-section">
              <h2 className="help-section-title">{sec.title}</h2>
              {sec.paras.map((para, i) => (
                <p key={i} className="codex-para"><TermText text={para} /></p>
              ))}
              {sec.figure !== undefined ? <HelpFigure rows={sec.figure} /> : null}
              {sec.mock === "action-bar" ? <HelpActionBarMock /> : null}
            </section>
          ))
        )}
        {/* "증강이란"을 다 읽은 사람이 다음에 궁금해하는 것은 **어떤 증강이 있는지**다.
            여기서 도감으로 바로 건너뛴다 — 홈까지 나갔다 다시 들어올 이유가 없다. */}
        {tab === "augment" && props.onOpenCodex !== undefined ? (
          <button className="home-codex-cta" onClick={props.onOpenCodex}>
            📖 증강 도감 열기 — {props.augmentKinds}종 전체 상세 설명
          </button>
        ) : null}
      </main>
    </div>
  );
}

// ─────────────────────────── 제보 게시판 ───────────────────────────

const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "🐞 버그 제보",
  idea: "💡 증강 아이디어",
};

const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "접수",
  reviewing: "검토 중",
  done: "반영 완료",
  rejected: "반려",
};

const FEEDBACK_STATUSES: FeedbackStatus[] = ["open", "reviewing", "done", "rejected"];

/** 제보 본문·답변은 작성자가 친 줄바꿈이 곧 의미다 — pre-wrap으로 그대로 보인다. */
const FEEDBACK_TEXT_STYLE: CSSProperties = { whiteSpace: "pre-wrap" };

/**
 * 제보 게시판 — 버그 제보 / 증강 아이디어를 받는다.
 *
 * **공개 범위**: 내가 쓴 글과 관리자만 본다. 서버가 조회 단계에서 걸러 보내므로
 * 목록에는 애초에 남의 글이 실리지 않는다(관리자는 전체 + 작성자 표시).
 */
function FeedbackBoard(props: {
  auth: AuthInfo;
  /** null = 아직 못 받았다 (ListCard가 '불러오는 중'을 낸다) */
  entries: FeedbackEntry[] | null;
  onSubmit: (kind: FeedbackKind, title: string, body: string) => void;
  onRefresh: () => void;
  onUpdate: (id: number, patch: { status?: FeedbackStatus; reply?: string }) => void;
  onDelete: (id: number) => void;
}): JSX.Element {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  /** 펼쳐 본 글 id — 목록은 제목만 보여 주고, 누르면 본문·답변이 열린다. */
  const [openId, setOpenId] = useState<number | null>(null);
  /** 관리자 답변 편집 중인 글 id → 입력값 */
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  /** 방금 제출했는가 — 목록이 갱신돼 오면 입력창을 비운다 */
  const submittedRef = useRef<string | null>(null);

  // 서버가 갱신된 목록을 되돌려주면 = 등록 성공. 그때만 입력창을 비운다
  // (실패 시에는 error 토스트만 오므로 쓴 글이 날아가지 않는다).
  useEffect(() => {
    if (submittedRef.current === null) return;
    if (props.entries?.some((e) => e.title === submittedRef.current && e.mine) === true) {
      submittedRef.current = null;
      setTitle("");
      setBody("");
    }
  }, [props.entries]);

  /*
   * 제출 중에는 다시 눌리지 않는다 (감사 2026-08-17 §5-7).
   *
   * 액션 제출은 "전송에 성공했을 때만 프롬프트를 내린다"는 규율을 지키는데,
   * **로비·인증·제보에는 그 규율이 오지 않았다.** 목록이 돌아올 때까지 몇 백 ms가
   * 비어 있고 버튼은 그대로 눌려서, 느린 회선에서 같은 제보가 두 번 올라갔다.
   * `submittedRef` 가 이미 "성공하면 비운다"를 알고 있으므로 그 값을 그대로 쓴다.
   */
  const sending = submittedRef.current !== null;
  const canSubmit = title.trim() !== "" && body.trim() !== "" && !sending;

  function submit(): void {
    if (!canSubmit) return;
    submittedRef.current = title.trim();
    props.onSubmit(kind, title.trim(), body.trim());
  }

  return (
    <section className="home-card home-feedback">
      <div className="home-card-head">
        <h2>📮 제보 게시판</h2>
        <RefreshButton onRefresh={props.onRefresh} title="새로 고침" />
      </div>
      <p className="home-hint">
        버그를 발견했거나 새 증강 아이디어가 떠올랐다면 남겨 주세요.
        {props.auth.isAdmin
          ? " 관리자는 모든 제보를 보고 상태·답변을 남길 수 있습니다."
          : " 내가 쓴 글은 나와 관리자에게만 보입니다."}
      </p>

      <div className="fb-form">
        <div className="fb-kind-pick">
          {(["bug", "idea"] as FeedbackKind[]).map((k) => (
            <button
              key={k}
              className={kind === k ? "fb-kind on" : "fb-kind"}
              onClick={() => setKind(k)}
            >
              {FEEDBACK_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <input
          className="fb-title"
          value={title}
          maxLength={80}
          placeholder="제목 (예: 리치 후 쯔모가 두 번 들어옵니다)"
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="fb-body"
          value={body}
          maxLength={4000}
          rows={5}
          placeholder={
            kind === "bug"
              ? "무엇을 했고, 무엇을 기대했고, 실제로 무슨 일이 일어났는지 적어 주세요. 방 코드·증강 이름이 있으면 큰 도움이 됩니다."
              : "어떤 증강인가요? 발동 조건과 효과, 그리고 왜 재미있을지 적어 주세요."
          }
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="fb-form-foot">
          <span className="codex-dim">{body.length} / 4000</span>
          <button className="home-create fb-submit" disabled={!canSubmit} onClick={submit}>
            {sending ? "올리는 중…" : "제출"}
          </button>
        </div>
      </div>

      <ListCard
        items={props.entries}
        empty="아직 등록된 제보가 없습니다."
        emptyHint="증강 아이디어나 버그를 적어 주세요 — 위 칸에 쓰면 바로 올라갑니다."
      >
        {(rows) => (
        <ul className="fb-list">
          {rows.map((e) => {
            const open = openId === e.id;
            const canDelete = e.mine || props.auth.isAdmin;
            return (
              <li key={e.id} className={`fb-row fb-${e.kind}`}>
                <button className="fb-head" onClick={() => setOpenId(open ? null : e.id)}>
                  <span className={`fb-kind-tag fb-kind-${e.kind}`}>
                    {e.kind === "bug" ? "🐞 버그" : "💡 아이디어"}
                  </span>
                  <span className="fb-row-title">{e.title}</span>
                  <span className={`fb-status fb-status-${e.status}`}>
                    {FEEDBACK_STATUS_LABEL[e.status]}
                  </span>
                  <span className="fb-row-meta">
                    {props.auth.isAdmin ? (
                      <span className="fb-author">
                        {e.author}
                        {e.mine ? <span className="seat-you"> (나)</span> : null}
                      </span>
                    ) : null}
                    <span className="fb-date">{new Date(e.createdAt).toLocaleDateString()}</span>
                  </span>
                </button>
                {open ? (
                  <div className="fb-detail">
                    <p className="fb-body-text selectable" style={FEEDBACK_TEXT_STYLE}>{e.body}</p>
                    {e.reply !== "" ? (
                      <div className="fb-reply">
                        <b>관리자 답변</b>
                        {e.repliedAt !== null ? (
                          <span className="fb-date"> {new Date(e.repliedAt).toLocaleDateString()}</span>
                        ) : null}
                        <p className="selectable" style={FEEDBACK_TEXT_STYLE}>{e.reply}</p>
                      </div>
                    ) : null}
                    {props.auth.isAdmin ? (
                      <div className="fb-admin">
                        <div className="fb-status-pick">
                          {FEEDBACK_STATUSES.map((s) => (
                            <button
                              key={s}
                              className={e.status === s ? "fb-status-btn on" : "fb-status-btn"}
                              onClick={() => props.onUpdate(e.id, { status: s })}
                            >
                              {FEEDBACK_STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="fb-reply-input"
                          rows={3}
                          maxLength={4000}
                          placeholder="작성자에게 보일 답변"
                          value={replyDraft[e.id] ?? e.reply}
                          onChange={(ev) =>
                            setReplyDraft((d) => ({ ...d, [e.id]: ev.target.value }))
                          }
                        />
                        <button
                          className="fb-reply-save"
                          onClick={() =>
                            props.onUpdate(e.id, { reply: replyDraft[e.id] ?? e.reply })
                          }
                        >
                          답변 저장
                        </button>
                      </div>
                    ) : null}
                    {canDelete ? (
                      <button className="user-delete fb-delete" onClick={() => props.onDelete(e.id)}>
                        삭제
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        )}
      </ListCard>
    </section>
  );
}

/**
 * 목록 카드의 세 가지 상태를 한 곳에서 정한다 — **아직 모른다 / 비었다 / 있다**.
 *
 * 예전에는 목록이 `[]`로 시작해서 두 번째와 첫 번째가 구분되지 않았다. 로그인 직후
 * 서버 왕복이 끝나기 전까지 "저장된 리플레이가 없습니다"가 떴고, 잠시 뒤 목록이
 * 갑자기 채워졌다. 사용자에게 그건 로딩이 아니라 **거짓말 한 번**이다
 * (감사 2026-08-17 §5-1). 관리자 티어표만 유일하게 이 구분을 하고 있었다 —
 * 패턴은 이미 있었고 나머지에 적용만 안 됐다.
 */
/**
 * 새로 고침 단추 — 누른 것이 **눌렸다는 표시**를 준다 (감사 2026-08-17 §5-6).
 *
 * 예전에는 아무 상태도 없었다. `refreshHome()` 은 한 번에 네 요청을 보내는데 화면은
 * 그대로라, 사람들이 반응이 없다고 여겨 계속 눌렀다 — 그 사이 요청만 배로 늘었다.
 *
 * ⚠ 이 회전은 **"완료"가 아니라 "접수"의 표시다.** 요청별 완료 신호를 버튼까지
 * 끌어오려면 아홉 자리에 각각 배선을 해야 하는데, 그 복잡도가 얻는 것보다 크다.
 * 대신 짧게 돌고 그동안 다시 눌리지 않게 잠근다 — 연타를 막는 것이 실제 목적이다.
 */
function RefreshButton(props: { onRefresh: () => void; title?: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);
  return (
    <button
      className={busy ? "home-refresh home-refresh-busy" : "home-refresh"}
      disabled={busy}
      onClick={() => {
        props.onRefresh();
        setBusy(true);
        timer.current = window.setTimeout(() => setBusy(false), 900);
      }}
      title={props.title ?? "새로 고침"}
      aria-label={props.title ?? "새로 고침"}
    >
      ↻
    </button>
  );
}

function ListCard<T>(props: {
  items: T[] | null;
  /** 정말로 비었을 때의 문장 */
  empty: string;
  /** 비어 있을 때 다음 행동을 제시한다(있으면). 신규 유저의 홈이 "없습니다"로만
   *  덮이지 않게 하려는 것이다. */
  emptyHint?: string;
  children: (rows: T[]) => JSX.Element;
}): JSX.Element {
  if (props.items === null) return <p className="home-empty home-loading">불러오는 중…</p>;
  if (props.items.length === 0) {
    return (
      <p className="home-empty">
        {props.empty}
        {props.emptyHint !== undefined ? <span className="home-empty-hint">{props.emptyHint}</span> : null}
      </p>
    );
  }
  return props.children(props.items);
}

function HomeScreen(props: {
  auth: AuthInfo;
  stats: StatsMessage | null;
  /** null = 아직 서버 응답을 못 받았다. [] = 정말 없다. 화면에서 둘은 다른 문장이다. */
  replays: ReplayGameSummary[] | null;
  liveRooms: LiveRoomSummary[] | null;
  leaderboard: LeaderboardEntry[] | null;
  catalog: Record<string, AugmentCatalogEntry>;
  adminUsers: AdminUserEntry[] | null;
  /** 제보 게시판 — 내 글(관리자면 전체) */
  feedback: FeedbackEntry[] | null;
  onSubmitFeedback: (kind: FeedbackKind, title: string, body: string) => void;
  onRefreshFeedback: () => void;
  onUpdateFeedback: (id: number, patch: { status?: FeedbackStatus; reply?: string }) => void;
  onDeleteFeedback: (id: number) => void;
  /** 관리자 전용 파워 티어표 (요약 배지용) */
  augmentTiers: AdminAugmentTiersMessage | null;
  lastRoomCode: string | null;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onOpenReplay: (gameId: number) => void;
  onOpenCodex: () => void;
  /** 규칙·도움말 화면 열기 */
  onOpenHelp: () => void;
  onOpenTiers: () => void;
  onRefreshLive: () => void;
  onSpectate: (code: string) => void;
  onRefreshUsers: () => void;
  onStartSandbox: (mode: GameMode) => void;
  /**
   * 연습 대국 — 봇 3명과 곧바로 한 판(기록에 안 남는다). 첫 판 코치가 함께 뜬다.
   * 가입 직후 자동으로 한 번 열리지만, 나중에 다시 익히고 싶은 사람에게도 문이 있어야 한다.
   */
  /** 봇 3명과 바로 한 판. `tutorial`이면 판을 고정하고 코치를 얹는다. */
  onPractice: (tutorial: boolean) => void;
  onDeleteUser: (userId: number, username: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
}): JSX.Element {
  const [code, setCode] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 방 기본값과 같은 쪽으로 맞춘다 — 동풍전 (RoomManager.newRoom 참고)
  const [sandboxMode, setSandboxMode] = useState<GameMode>("tonpuu");
  const career = props.stats?.career.find((e) => e.nickname === props.auth.username) ?? null;

  function joinByCode(): void {
    const c = code.trim().toUpperCase();
    if (c.length >= 4) props.onJoinRoom(c);
  }

  /* 리플레이 카드: 일반 유저는 왼쪽 열(증강 카드와 높이 맞춤),
     관리자는 섹션이 많고 목록도 길어 하단 전체 폭에 따로 둔다. */
  const replaysCard = (
    <section className="home-card home-replays">
      <div className="home-card-head">
        <h2>{props.auth.isAdmin ? "모든 리플레이" : "내 리플레이"}
          {props.auth.isAdmin ? <span className="home-admin-badge">관리자</span> : null}
        </h2>
        <RefreshButton onRefresh={props.onRefresh} title="새로 고침" />
      </div>
      <ListCard
        items={props.replays}
        empty="저장된 리플레이가 없습니다."
        emptyHint="한 판 두고 나면 여기에 쌓입니다 — 끝난 판은 처음부터 다시 볼 수 있습니다."
      >
        {(rows) => (
        <ul className="replay-list">
          {rows.map((g) => {
            const me = g.players.find((p) => p.nickname === props.auth.username);
            const date = new Date(g.endedAt);
            return (
              <li key={g.gameId} className="replay-row">
                <span className={`replay-rank replay-rank-${me?.rank ?? 0}`}>
                  {me !== undefined ? `${me.rank}위` : "-"}
                </span>
                <span className="replay-meta">
                  <span className="replay-date">
                    {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="replay-players">
                    {g.players.map((p) => p.nickname).join(" · ")}
                  </span>
                </span>
                <button className="replay-open" onClick={() => props.onOpenReplay(g.gameId)}>
                  ▶ 보기
                </button>
              </li>
            );
          })}
        </ul>
        )}
      </ListCard>
    </section>
  );

  return (
    <div className="home">
      <header className="home-nav">
        <span className="home-logo">이능마작</span>
        <span className="home-tagline">증강 리치마작</span>
        <span className="home-spacer" />
        {/* 게시판은 첫 화면 아래에 있어 있는 줄도 모르고 지나친다 — 상단에서 바로 간다. */}
        <button
          className="home-logout home-feedback-jump"
          onClick={() =>
            // 즉시 이동(behavior 생략) — 홈은 .home이 스크롤 컨테이너라 smooth가
            // 중간에 멈추는 환경이 있었다. 목적지는 확실히 도착하는 편이 낫다.
            document.querySelector(".home-feedback")?.scrollIntoView({ block: "start" })
          }
          title="버그 제보 · 증강 아이디어"
        >
          📮 제보
        </button>
        <span className="home-user">
          {props.auth.username}
          {props.auth.isAdmin ? <span className="home-admin-badge">관리자</span> : null}
        </span>
        <div className="home-settings">
          <button className="home-logout home-gear" onClick={() => setSettingsOpen((v) => !v)} title="설정">⚙</button>
          {settingsOpen ? (
            <SettingsPanel
              settings={props.settings}
              onSetting={props.onSetting}
              onClose={() => setSettingsOpen(false)}
            />
          ) : null}
        </div>
        <button className="home-logout" onClick={props.onLogout}>로그아웃</button>
      </header>

      <main className="home-main">
        <div className="home-top">
          <div className={`home-top-left${props.auth.isAdmin ? " home-top-left-admin" : ""}`}>
        <section className="home-card home-play">
          <h2>대국</h2>
          <button className="home-create" onClick={props.onCreateRoom}>
            ＋ 방 만들기
          </button>
          <div className="home-join">
            <input
              value={code}
              placeholder="방 코드 입력 (예: AB3XK7)"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinByCode()}
            />
            <button onClick={joinByCode} disabled={code.trim().length < 4}>참가</button>
          </div>
          {props.lastRoomCode !== null ? (
            <button className="home-rejoin" onClick={() => props.onJoinRoom(props.lastRoomCode!)}>
              ↻ 진행하던 방으로 재접속 ({props.lastRoomCode})
            </button>
          ) : null}
          <p className="home-hint">
            방을 만들면 6자리 코드가 발급됩니다. 친구에게 코드를 알려주고, 모두
            준비되면 방장이 시작하세요. 빈 자리는 봇으로 채울 수 있습니다.
          </p>
          {/* 혼자 익히는 두 문 — 둘 다 대기실을 거치지 않고 봇 3명과 바로 시작하고,
              리플레이·통계·순위 어디에도 남지 않는다.

              예전에는 이 둘이 버튼 하나에 "🎓 튜토리얼 · 연습 대국"으로 묶여 있었다.
              누르는 사람 입장에서는 전혀 다른 두 가지다 — 하나는 **배우러** 오는
              것이고(판이 고정되고 안내가 붙는다), 하나는 그냥 **한 판 두러** 오는
              것이다(무작위 실전). 한 버튼에 묶여 있으면 안내를 다시 보고 싶은 사람도,
              안내 없이 두고 싶은 사람도 원하는 것을 못 고른다. */}
          <button className="home-practice" onClick={() => props.onPractice(true)}>
            🎓 튜토리얼 (화면 조작 안내 · 5~10분)
          </button>
          <button className="home-practice home-practice-plain" onClick={() => props.onPractice(false)}>
            연습 대국 (봇 3명 · 안내 없음 · 기록 안 남음)
          </button>
        </section>

        <section className="home-card">
          <div className="home-card-head">
            <h2>내 통계</h2>
            <RefreshButton onRefresh={props.onRefresh} title="새로 고침" />
          </div>
          {career !== null ? (
            <StatsGrid s={career.stats} />
          ) : (
            /* 빈 상태에는 **누를 것**을 준다 (감사 §3-12). "첫 대국을 시작해 보세요!"는
               서술이지 다음 걸음이 아니다 — 방을 만들지 코드를 받을지 연습을 할지를
               다시 사람이 정해야 했다. 여기서 갈 곳은 하나뿐이다: 봇과 한 판. */
            <p className="home-empty">
              아직 완료한 대국이 없습니다.
              <span className="home-empty-hint">한 판 두고 나면 승률·평균 순위가 여기에 쌓입니다.</span>
              {/* 전적이 0인 사람 = 아직 한 판도 안 끝낸 사람이다. 두 문(튜토리얼·
                  연습 대국) 중 여기서 권할 것은 **안내가 붙는 쪽**이다. */}
              <button className="home-empty-cta" onClick={() => props.onPractice(true)}>
                🎓 튜토리얼로 한 판
              </button>
            </p>
          )}
        </section>

          {props.auth.isAdmin ? (
            <section className="home-card home-sandbox">
              <div className="home-card-head">
                <h2>🧪 증강 테스트<span className="home-admin-badge">관리자</span></h2>
              </div>
              <p className="home-hint">
                봇 3명과 함께 드래프트 없이 바로 시작합니다. 게임 안의 테스트 패널에서
                구현된 증강을 골라 즉시 획득하고, 언제든 초기화할 수 있습니다.
                이 게임은 리플레이·통계·도감 기록에 남지 않습니다.
              </p>
              <div className="sandbox-mode-pick">
                {(["hanchan", "tonpuu"] as GameMode[]).map((m) => (
                  <button
                    key={m}
                    className={sandboxMode === m ? "sandbox-mode on" : "sandbox-mode"}
                    onClick={() => setSandboxMode(m)}
                  >
                    {m === "hanchan" ? "반장전" : "동풍전"}
                  </button>
                ))}
              </div>
              <button className="home-create" onClick={() => props.onStartSandbox(sandboxMode)}>
                🧪 증강 테스트 시작
              </button>
            </section>
          ) : (
            replaysCard
          )}
          </div>

        <section className="home-card home-augment">
          <div className="home-card-head">
            <h2>내 증강 통계</h2>
            <div className="home-head-actions">
              <button className="home-codex-btn" onClick={props.onOpenHelp}>
                📘 규칙 · 도움말
              </button>
              <button className="home-codex-btn" onClick={props.onOpenCodex}>
                📖 증강 도감
              </button>
              <RefreshButton onRefresh={props.onRefresh} title="새로 고침" />
            </div>
          </div>
          <PersonalAugmentStats stats={career?.stats ?? null} catalog={props.catalog} />
          <button className="home-codex-cta" onClick={props.onOpenCodex}>
            📖 증강 도감 전체 보기 — {Object.keys(props.catalog).length || "?"}종 상세 설명 · 서버 전체 통계
          </button>
        </section>
        </div>

        {/* 제보 게시판은 상단 바로 아래 — 맨 아래에 두면 일반 유저는 증강 메타 카드를
            두 화면 넘게 지나야 만나서, 게시판이 있는 줄도 모른다. */}
        <FeedbackBoard
          auth={props.auth}
          entries={props.feedback}
          onSubmit={props.onSubmitFeedback}
          onRefresh={props.onRefreshFeedback}
          onUpdate={props.onUpdateFeedback}
          onDelete={props.onDeleteFeedback}
        />

        {/* 닉네임별 성적표는 관리자 전용 (서버도 비관리자에겐 닉네임을 지워 보낸다) */}
        {props.auth.isAdmin ? (
        <section className="home-card home-leaderboard">
          <div className="home-card-head">
            <h2>전체 플레이어 통계<span className="home-admin-badge">관리자</span></h2>
            <RefreshButton onRefresh={props.onRefresh} title="새로 고침" />
          </div>
          <ListCard items={props.leaderboard} empty="아직 집계된 플레이어가 없습니다.">
            {(rows) => (
            <div className="lb-scroll">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th className="lb-rank-h">#</th>
                    <th className="lb-name-h">플레이어</th>
                    <th>판수</th>
                    <th>평균순위</th>
                    <th>1위율</th>
                    <th>화료율</th>
                    <th>방총률</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const me = e.nickname === props.auth.username;
                    return (
                      <tr key={e.nickname} className={me ? "lb-me" : ""}>
                        <td className="lb-rank">{i + 1}</td>
                        <td className="lb-name">
                          {e.nickname}
                          {me ? <span className="seat-you"> (나)</span> : null}
                        </td>
                        <td>{e.stats.games}</td>
                        <td>{e.stats.games > 0 ? e.stats.avgPlacement.toFixed(2) : "-"}</td>
                        <td>{e.stats.games > 0 ? pct(e.stats.topRate) : "-"}</td>
                        <td>{e.stats.roundsPlayed > 0 ? pct(e.stats.winRate) : "-"}</td>
                        <td>{e.stats.roundsPlayed > 0 ? pct(e.stats.dealInRate) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </ListCard>
        </section>
        ) : null}

        <section className="home-card home-leaderboard">
          <div className="home-card-head">
            <h2>증강 메타</h2>
            <RefreshButton onRefresh={props.onRefresh} title="새로 고침" />
          </div>
          <AugmentMeta leaderboard={props.leaderboard} catalog={props.catalog} />
        </section>

        {props.auth.isAdmin ? replaysCard : null}


        {props.auth.isAdmin ? (
          <section className="home-card home-admin">
            <div className="home-card-head">
              <h2>진행 중인 게임 <span className="home-admin-badge">관리자</span></h2>
              <RefreshButton onRefresh={props.onRefreshLive} title="새로 고침" />
            </div>
            <ListCard items={props.liveRooms} empty="지금 진행 중인 게임이 없습니다.">
              {(rows) => (
              <ul className="replay-list">
                {rows.map((r) => (
                  <li key={r.code} className="replay-row">
                    <span className="live-code">{r.code}</span>
                    <span className="replay-meta">
                      <span className="replay-players">
                        {r.players.map((p) => p.nickname).join(" · ")}
                      </span>
                    </span>
                    <button className="replay-open" onClick={() => props.onSpectate(r.code)}>
                      👁 관전
                    </button>
                  </li>
                ))}
              </ul>
              )}
            </ListCard>
          </section>
        ) : null}

        {props.auth.isAdmin ? (
          <section className="home-card home-admin home-tiers">
            <div className="home-card-head">
              <h2>📊 증강 파워 티어표 <span className="home-admin-badge">관리자</span></h2>
              <button className="home-refresh" onClick={props.onOpenTiers} title="티어표 열기">↗</button>
            </div>
            <p className="home-hint">
              드롭 확률 조정용 <b>순수 파워</b> 티어(타점·속도·무대응·빈도). 도감의 재미 등급과 다릅니다.
              서버가 <b>살아 있는 카탈로그와 실시간으로 대조</b>하므로, 새로 추가했는데 티어를 안 매긴 증강은
              "미분류"로 바로 드러납니다.
            </p>
            {props.augmentTiers === null ? (
              <p className="home-empty">티어표를 불러오는 중…</p>
            ) : (
              <div className="tier-summary">
                {props.augmentTiers.order.map((t) => {
                  const n = props.augmentTiers?.entries.filter((e) => e.tier === t).length ?? 0;
                  if (n === 0) return null;
                  return (
                    <span key={t} className={`tier-chip tier-${t.replace(/\+/g, "p")}`}>
                      {t} <b>{n}</b>
                      <span className="tier-chip-w">×{props.augmentTiers?.weights[t]?.toFixed(2)}</span>
                    </span>
                  );
                })}
                {props.augmentTiers.entries.some((e) => e.tier === null) ? (
                  <span className="tier-chip tier-none">
                    미분류 <b>{props.augmentTiers.entries.filter((e) => e.tier === null).length}</b>
                  </span>
                ) : null}
              </div>
            )}
            <button className="home-codex-cta" onClick={props.onOpenTiers}>
              📊 티어표 전체 보기 — {props.augmentTiers?.entries.length ?? "?"}종 · 축별 점수 · 권장 가중치
            </button>
          </section>
        ) : null}

        {props.auth.isAdmin ? (
          <section className="home-card home-admin home-users">
            <div className="home-card-head">
              <h2>플레이어 관리 <span className="home-admin-badge">관리자</span></h2>
              <RefreshButton onRefresh={props.onRefreshUsers} title="새로 고침" />
            </div>
            <ListCard items={props.adminUsers} empty="등록된 계정이 없습니다.">
              {(rows) => (
              <ul className="user-list">
                {rows.map((u) => {
                  const isMe = u.username === props.auth.username;
                  return (
                    <li key={u.id} className="user-row">
                      <span className="user-name">
                        {u.username}
                        {u.isAdmin ? <span className="home-admin-badge">관리자</span> : null}
                        {isMe ? <span className="seat-you"> (나)</span> : null}
                      </span>
                      <span className="user-meta">
                        <span className="user-games">{u.games}판</span>
                        <span className="user-date">{new Date(u.createdAt).toLocaleDateString()}</span>
                      </span>
                      <button
                        className="user-delete"
                        disabled={isMe}
                        onClick={() => props.onDeleteUser(u.id, u.username)}
                        title={isMe ? "본인 계정은 삭제할 수 없습니다" : "계정 삭제"}
                      >
                        삭제
                      </button>
                    </li>
                  );
                })}
              </ul>
              )}
            </ListCard>
          </section>
        ) : null}
      </main>
    </div>
  );
}

// ─────────────────────────── 통계 표기 헬퍼 ───────────────────────────

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** 통계 요약 칩 (리치·후로·방총·화료율). 대기실 카드에서 한 줄로 표시. */
function StatsChips({ s }: { s: PlayerStatsView }): JSX.Element {
  if (s.roundsPlayed === 0) {
    return <span className="stat-chip stat-chip-empty">전적 없음</span>;
  }
  return (
    <span className="stat-chips">
      <span className="stat-chip" title="화료율">화료 {pct(s.winRate)}</span>
      <span className="stat-chip" title="방총률">방총 {pct(s.dealInRate)}</span>
      <span className="stat-chip" title="리치율">리치 {pct(s.riichiRate)}</span>
      <span className="stat-chip" title="후로율">후로 {pct(s.callRate)}</span>
      {s.games > 0 ? (
        <span className="stat-chip" title="평균 순위">평순 {s.avgPlacement.toFixed(2)}</span>
      ) : null}
    </span>
  );
}

/**
 * 통계 상세 그리드 (게임 종료 화면·홈 내 통계).
 *
 * 첫 칸의 표본 크기는 보는 맥락에 맞춘다 — 누적 전적에서 알고 싶은 건 "몇 판 했나"이고,
 * 방금 끝난 한 판에서 판수는 항상 1이라 의미가 없으므로 그때만 국수를 쓴다.
 */
function StatsGrid({ s, scope = "career" }: { s: PlayerStatsView; scope?: "career" | "game" }): JSX.Element {
  const rows: [string, string][] = [
    scope === "career" ? ["판수", `${s.games}`] : ["국수", `${s.roundsPlayed}`],
    ["화료율", pct(s.winRate)],
    ["방총률", pct(s.dealInRate)],
    ["리치율", pct(s.riichiRate)],
    ["후로율", pct(s.callRate)],
    ["쯔모율", pct(s.tsumoRate)],
    ["평균화료", s.avgWinPoints > 0 ? Math.round(s.avgWinPoints).toLocaleString() : "-"],
    ["평균방총", s.avgDealInPoints > 0 ? Math.round(s.avgDealInPoints).toLocaleString() : "-"],
    ["평균순위", s.games > 0 ? s.avgPlacement.toFixed(2) : "-"],
    ["1위율", s.games > 0 ? pct(s.topRate) : "-"],
  ];
  return (
    <div className="stats-grid">
      {rows.map(([k, v]) => (
        <div key={k} className="stats-cell">
          <span className="stats-k">{k}</span>
          <span className="stats-v">{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── 대기실 ───────────────────────────

/**
 * 대기실에서 10초마다 한 줄씩 돌려 보여 주는 조작 꿀팁.
 *
 * 게임 화면에만 있는 표시 규칙(쯔모기리 점·도라 반짝임 등)은 판이 시작되면 물어볼 데가
 * 없어서, 기다리는 동안 눈에 익혀 두라고 여기에 둔다.
 */
const WAITROOM_TIPS: readonly string[] = [
  "패 오른쪽 아래에 동그라미 표시가 있는 건 쯔모기리(뽑아서 바로 버린) 패입니다.",
  "동풍전은 동1·3·4국에서 증강을 총 3번, 반장전은 동1·3국과 남1·3국에서 총 4번 획득합니다.",
  "증강의 상세 설명은 Shift 키를 누르고 있는 동안 볼 수 있습니다.",
  "증강을 클릭해 두면 증강 설명창을 고정해 둘 수 있습니다.",
  "용어의 상세 설명은 마우스를 잠시 올려 두면 볼 수 있습니다.",
  "용어 설명을 볼지 말지는 설정에서 켜고 끌 수 있습니다.",
  "노란색으로 계속 반짝이는 패는 도라입니다.",
  "보라색으로 계속 반짝이는 패는 원래의 4개 패가 아니라 증강 등으로 새로 만들어진 패입니다.",
  "상대가 타패한 뒤 점선 표시를 보면 그 패를 어디서 냈는지 알 수 있습니다.",
  "게임 무효 투표는 설정 맨 아래에 있습니다.",
  "⚡ 액티브 표시가 붙은 증강은 저절로 터지지 않습니다. 조건이 되면 버튼이 사용 가능해지니 직접 눌러 발동하세요.",
  "🎯 퀘스트 증강은 게이지가 조건 진행도입니다 — 퀘스트를 달성해야 능력을 사용할 수 있습니다.",
  "이름표의 증강에 🔒이 걸리면 상대의 무장해제로 이번 국만 잠긴 것, 🕐N국은 쿨다운, ♻는 재장전, 🎲는 주사위로 얻은 증강입니다.",
  "화면 배치가 겹치거나 어색하면 오른쪽 위 +/− 버튼이나 Ctrl + −(+)로 크기를 맞춰 보세요.",
];

const WAITROOM_TIP_MS = 10_000;

/** 꿀팁 한 줄을 10초마다 교체한다. 시작 팁은 매번 무작위 — 같은 팁만 보고 나가지 않게. */
function WaitroomTips(): JSX.Element {
  const [i, setI] = useState(() => Math.floor(Math.random() * WAITROOM_TIPS.length));
  useEffect(() => {
    const t = window.setInterval(
      () => setI((v) => (v + 1) % WAITROOM_TIPS.length),
      WAITROOM_TIP_MS,
    );
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="waitroom-tip" aria-live="polite">
      <span className="waitroom-tip-label">💡 꿀팁</span>
      {/* key를 바꿔 페이드 인 애니메이션을 매번 다시 태운다 */}
      <span key={i} className="waitroom-tip-text">{WAITROOM_TIPS[i]}</span>
    </div>
  );
}

function WaitingRoom(props: {
  lobby: LobbyMessage | null;
  roomId: string;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onReady: (ready: boolean) => void;
  onAddBot: () => void;
  onRemoveBot: (playerId: string) => void;
  onSetBotArchetype: (playerId: string, archetype: string) => void;
  /** 플레이어 강퇴 (방장 전용) */
  onKick: (playerId: string) => void;
  onStart: () => void;
  onSetGameMode: (mode: GameMode) => void;
  onSetBotDifficulty: (difficulty: string) => void;
  onShuffleSeats: () => void;
  onLeave: () => void;
  onToast?: (text: string) => void;
  /**
   * 규칙·도감 — 랜딩·홈·게임 중·게스트 종료 화면에는 전부 있는데 **대기실에만
   * 없었다** (감사 §3-9). 친구를 기다리는 이 시간이 규칙을 읽기 가장 좋은 시간이다.
   */
  onOpenHelp?: () => void;
  onOpenCodex?: () => void;
  /** 정형구 — 사람을 기다리는 자리에서도 인사는 오간다 */
  onEmote?: (id: string) => void;
}): JSX.Element {
  const { lobby } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);

  function copyCode(): void {
    const code = props.roomId;
    /*
     * 복사되는 것은 **코드가 아니라 링크**다 (감사 §3-5).
     *
     * 예전에는 여섯 글자만 복사됐다. 받은 사람은 사이트를 찾아 들어가서, 방 코드
     * 칸을 찾고, 여섯 글자를 옮겨 적어야 했다 — 친구를 부르는 일이 세 단계였다.
     * 링크를 누르면 그 방으로 바로 들어간다.
     *
     * 코드 자체가 필요한 사람(음성으로 불러 주는 경우)을 위해 링크 안에 코드가
     * 그대로 보이게 둔다: …/?room=7Q79FM
     */
    const link = inviteLinkFor(code);
    const ok = (): void =>
      props.onToast?.("초대 링크가 복사되었습니다 — 친구에게 보내면 바로 들어옵니다!");
    const fail = (): void => props.onToast?.(`방 코드: ${code}`);
    // navigator.clipboard는 보안 컨텍스트(HTTPS·localhost)에서만 존재한다.
    // 평문 HTTP(LAN·gol.n-e.kr:포트) 배포에서는 undefined라 무반응이었다 → execCommand로 폴백.
    if (navigator.clipboard?.writeText !== undefined) {
      void navigator.clipboard
        .writeText(link)
        .then(ok)
        .catch(() => {
          if (!legacyCopy(link)) fail();
          else ok();
        });
      return;
    }
    if (legacyCopy(link)) ok();
    else fail();
  }

  if (lobby === null) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1 className="lobby-title">대기실</h1>
          <p className="lobby-tag">입장 중…</p>
        </div>
      </div>
    );
  }

  const me = lobby.players.find((p) => p.playerId === lobby.youId) ?? null;
  const isHost = lobby.youId === lobby.hostId;
  const iAmReady = me?.ready === true;
  /**
   * 자리 줄 세우기 — 동(0)·남(1)·서(2)·북(3).
   *
   * 기준은 서버가 준 `seat`(좌석 배열 순서)다. playerId 번호가 아니다 — 자리를 섞으면
   * p2가 동가일 수 있고, 예전에 id 번호로 줄을 세웠을 때는 대기실이 보여 주는 방위와
   * 실제 게임 방위가 서로 달랐다.
   */
  const slots: (LobbyPlayerEntry | null)[] = [0, 1, 2, 3].map(
    (i) => lobby.players.find((p) => p.seat === i) ?? null,
  );
  const readyCount = lobby.players.filter((p) => !p.isHost && p.ready).length;
  const needReady = lobby.players.filter((p) => !p.isHost && !p.isBot).length;

  return (
    <div className="waitroom">
      <div className="waitroom-card">
        <button className="icon-btn settings-btn" onClick={() => setSettingsOpen((v) => !v)} title="설정">⚙</button>
        <button className="icon-btn leave-btn" onClick={props.onLeave} title="나가기">✕</button>
        {props.onOpenCodex !== undefined ? (
          <button className="icon-btn codex-btn" onClick={props.onOpenCodex} title="증강 도감">📖</button>
        ) : null}
        {props.onEmote !== undefined ? <EmoteBar onSend={props.onEmote} /> : null}
        {props.onOpenHelp !== undefined ? (
          <button className="icon-btn help-btn" onClick={props.onOpenHelp} title="규칙 · 도움말">📘</button>
        ) : null}
        {settingsOpen ? (
          <SettingsPanel
            settings={props.settings}
            onSetting={props.onSetting}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
        <h1 className="waitroom-title">대기실</h1>
        <div className="waitroom-code" onClick={copyCode} title="클릭해서 복사">
          <span className="waitroom-code-label">방 코드</span>
          <span className="waitroom-code-value">{props.roomId}</span>
          <span className="waitroom-code-copy">📋 복사</span>
        </div>
        <p className="waitroom-room">코드를 친구에게 알려주세요 · {lobby.players.length}/4</p>

        {/* 줄이 둘인데 둘 다 라벨이 없어, 아래 줄이 무엇을 정하는지 알 수 없었다
            (2026-08-08 사용자 지적) — 각 줄에 무엇을 고르는 자리인지 붙인다. */}
        <div className="lobby-group-label">판 길이</div>
        <div className="mode-select" role="radiogroup" aria-label="게임 모드">
          {([
            // 서든데스를 적어 둔다 — westEntry가 두 모드 모두 켜져 있어(maxWindOf 주석)
            // "남4국까지"는 거짓이었다. 오라스라 믿고 짠 순위 계산이 통째로 틀어진다.
            ["hanchan", "반장전", "동+남 · 남4국 뒤 1위가 30000 미만이면 서장"],
            ["tonpuu", "동풍전", "동장만 · 동4국 뒤 1위가 30000 미만이면 남장"],
          ] as const).map(([mode, label, sub]) => {
            const active = lobby.gameMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                className={`mode-btn ${active ? "mode-active" : ""}`}
                disabled={!isHost}
                onClick={() => isHost && !active && props.onSetGameMode(mode)}
                title={isHost ? `${label}으로 변경` : "방장만 변경할 수 있습니다"}
              >
                <span className="mode-name">{label}</span>
                <span className="mode-sub">{sub}</span>
              </button>
            );
          })}
        </div>

        {/* 봇 난이도 — 성향(원형)이 "어떻게 두는가"라면 이쪽은 "얼마나 잘 두는가"다.
            기본 어려움이 종전 봇 그대로이고, 그 위로는 열지 않는다. */}
        <div className="lobby-group-label">
          🤖 봇 난이도
        </div>
        <div className="mode-select" role="radiogroup" aria-label="봇 난이도">
          {BOT_DIFFICULTY.map(([level, label, sub]) => {
            const active = (lobby.botDifficulty ?? "hard") === level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={active}
                className={`mode-btn ${active ? "mode-active" : ""}`}
                disabled={!isHost}
                onClick={() => isHost && !active && props.onSetBotDifficulty(level)}
                title={isHost ? `${label}으로 변경 (다음 판부터)` : "방장만 변경할 수 있습니다"}
              >
                <span className="mode-name">{label}</span>
                <span className="mode-sub">{sub}</span>
              </button>
            );
          })}
        </div>

        <div className="seat-list">
          {slots.map((p, i) => (
            <div key={i} className={`seat-row ${p === null ? "seat-empty" : ""} ${p?.playerId === lobby.youId ? "seat-me" : ""}`}>
              <span className="seat-idx">{WIND_KO[i]}</span>
              {p === null ? (
                <span className="seat-vacant">빈 자리</span>
              ) : (
                <>
                  <span className="seat-name">
                    {p.isHost ? <span className="seat-crown" title="방장">👑</span> : null}
                    {p.isBot ? "봇" : p.nickname}
                    {p.playerId === lobby.youId ? <span className="seat-you"> (나)</span> : null}
                    {p.isBot ? <span className="seat-bot">BOT</span> : null}
                  </span>
                  <span className="seat-stats">
                    {/* 봇은 전적 대신 성향을 보여 준다 — 어떤 셋과 붙는지 알고 앉는다 */}
                    {p.isBot ? (
                        isHost
                          ? <BotArchetypePicker
                              archetype={p.archetype}
                              onChange={(a) => props.onSetBotArchetype(p.playerId, a)}
                            />
                          : <BotArchetypeChip archetype={p.archetype} />
                      )
                      : p.stats !== null ? <StatsChips s={p.stats} />
                      : <span className="stat-chip stat-chip-empty">전적 없음</span>}
                  </span>
                  <span className="seat-status">
                    {p.isHost ? (
                      <span className="badge badge-host">방장</span>
                    ) : p.ready ? (
                      <span className="badge badge-ready">준비완료</span>
                    ) : (
                      <span className="badge badge-wait">대기중</span>
                    )}
                    {isHost && p.isBot ? (
                      <button
                        className="seat-kick"
                        onClick={() => {
                          // 자리에서 봇이 사라지는 것 말고는 아무 신호가 없던 자리다.
                          sfx.slide();
                          props.onRemoveBot(p.playerId);
                        }}
                        title="봇 제거"
                      >✕</button>
                    ) : isHost && !p.isHost ? (
                      // 강퇴는 되돌릴 수 없다(그 사람은 이 방에 다시 못 들어온다) — 한 번 묻는다
                      <button
                        className="seat-kick"
                        onClick={() => {
                          void askConfirm({
                            title: `'${p.nickname}' 님을 내보낼까요?`,
                            body: "이 방에는 다시 들어올 수 없습니다.",
                            confirmLabel: "내보내기",
                            danger: true,
                          }).then((ok) => {
                            if (ok) props.onKick(p.playerId);
                          });
                        }}
                        title="강퇴"
                      >✕</button>
                    ) : null}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="waitroom-actions">
          {isHost ? (
            <>
              <button
                className="wr-btn wr-bot"
                onClick={props.onAddBot}
                disabled={lobby.players.length >= 4}
              >
                + 봇 추가
              </button>
              <button
                className="wr-btn wr-shuffle"
                onClick={props.onShuffleSeats}
                disabled={lobby.players.length < 2}
                title="동남서북 자리를 다시 뽑습니다 (친이 바뀝니다)"
              >
                🎲 자리 섞기
              </button>
              <button
                className="wr-btn wr-start"
                onClick={props.onStart}
                disabled={!lobby.canStart}
              >
                게임 시작 {lobby.players.length < 4 ? "(4인 필요)" : readyCount < needReady ? `(준비 ${readyCount}/${needReady})` : ""}
              </button>
            </>
          ) : (
            <button
              className={`wr-btn ${iAmReady ? "wr-unready" : "wr-ready"}`}
              onClick={() => props.onReady(!iAmReady)}
            >
              {iAmReady ? "준비 취소" : "준비 완료"}
            </button>
          )}
        </div>
        <p className="waitroom-hint">
          {isHost
            ? "방장입니다 — 자리(동남서북)는 여기 보이는 그대로 시작합니다. 4인이 모두 준비되면 게임을 시작하세요."
            : iAmReady
              ? "준비 완료. 방장이 시작하기를 기다립니다…"
              : "준비 완료 버튼을 누르면 방장이 게임을 시작할 수 있습니다."}
        </p>
        <WaitroomTips />
      </div>
    </div>
  );
}

// ─────────────────────────── 게임 테이블 ───────────────────────────

/**
 * 이번 국의 도라 종류를 뷰에서 뽑아 DoraContext 값으로 만든다.
 *
 * - 표시패(그리고 국이 끝나 공개된 뒷도라 표시패)가 가리키는 다음 패 = 전원 공통 도라.
 * - 이면투시(ura)로 나만 확인한 뒷도라는 내 전용 채널에만 실리므로 내 패에서만 반짝인다.
 *   (personal은 "이 사람 앞에서만 도라"용 범용 슬롯 — 보유자 한정 도라 증강이 다시
 *    생기면 여기에 채널을 추가한다.)
 */
function useDoraFx(view: PlayerView, enabled: boolean): DoraFx {
  return useMemo<DoraFx>(() => {
    if (!enabled) return NO_DORA;
    const common = new Set<string>();
    for (const id of [...view.round.doraIndicators, ...(view.round.uraDoraIndicators ?? [])]) {
      const kind = view.tiles[id]?.kind;
      if (kind !== undefined) common.add(kindKey(doraKindFor(kind)));
    }
    const personal: Record<string, Set<string>> = {};
    const add = (pid: string, kk: string): void => {
      (personal[pid] ??= new Set<string>()).add(kk);
    };
    // 이면투시로 본 것은 뒷도라 '표시패'라, 다음 패로 넘겨야 진짜 도라가 된다
    const ura = view.augmentView["ura"];
    if (Array.isArray(ura)) {
      for (const raw of ura as unknown[]) {
        const kind = typeof raw === "string" ? parseKindKey(raw) : null;
        if (kind !== null) add(view.playerId, kindKey(doraKindFor(kind)));
      }
    }
    return { common, personal };
  }, [view, enabled]);
}

/**
 * 모드 표시 (좌상단) — 지금 무슨 판이고 증강을 언제 받는지.
 *
 * 판 길이는 대기실에서 한 번 고르고 나면 화면 어디에도 안 남아서, 들어와 보면
 * "이게 반장인가 동풍인가"를 국 번호로 역산해야 했다. 증강 획득 시점도 마찬가지다.
 */
const MODE_BADGE: Record<GameMode, { name: string; drafts: string }> = {
  hanchan: { name: "반장전", drafts: "동1·동3·남1·남3국" },
  tonpuu: { name: "동풍전", drafts: "동1·동3·동4국" },
};

/**
 * 손의 **모양 규칙**을 바꾸는 패시브 증강 — 결과창이 "왜 이게 손이 되는가"를 적을 때 쓴다.
 *
 * 전부 `setHolderRule` 하나짜리라 뷰 채널이 없다. 대기 계산은 클라이언트가 미러링해
 * 정확하지만(waitDecompOptions), 화료해서 손이 공개되는 순간에는 근거가 어디에도 없었다.
 * 자기 이름을 가진 역으로 뜨는 것(우는 국사무쌍·진짜 용)은 역 목록이 이미 말하므로 뺀다.
 */
const SHAPE_RULE_AUGMENTS = new Set<string>([
  "mixed_triplet", // 동수의 결속 — 커쯔의 무늬 제한 해제
  "broken_border", // 무너진 국경 — 슌쯔의 무늬 제한 해제
  "polar_ends", // 양극 — 1과 9를 같은 패로 본다
  "async_chiitoi", // 비대칭 — 치또이의 무늬 무관
  "royal_kokushi", // 왕의 징표 — 국사 중복 허용
  "wind_lineage", // 바람의 계보 — 자패 슌쯔
  "snake_kan", // 장사진 — 연속 네 장 깡
]);

/**
 * 봇 난이도 표기 — 대기실 라디오와 게임 중 칩이 같은 말을 쓴다.
 *
 * 난이도는 `LobbyMessage`에만 실려서 게임에 들어가는 순간 확인할 데가 없었다. 성향
 * (원형)은 이름표·순위표에 상시로 서 있는데 난이도만 사라져, 전적에 남는 판인데도
 * "봇이 쉬움이었나"를 사후에 알 수 없었다. 게스트 체험 방은 대기실을 안 거쳐 한 번도
 * 못 본다.
 */
/**
 * 종국 사유 한 줄. 평범한 종국(`normal`)은 비워 둔다 — 설명할 것이 없다.
 */
/** 리치가 막힌 평범한 사유 — 엔진의 riichi validate와 같은 판정을 서버가 실어 준다 */
const RIICHI_BLOCK_TEXT: Record<"notEnoughPoints" | "wallTooShort", string> = {
  notEnoughPoints: "점수가 리치봉(1,000점)에 못 미쳐 리치를 걸 수 없습니다",
  wallTooShort: "패산이 얼마 안 남아 리치를 걸 수 없습니다",
};

const GAME_END_NOTE: Partial<Record<GameEndReason, string>> = {
  dobi: "도비 — 누군가 0점 아래로 떨어져 그 자리에서 끝났습니다",
  agariYame: "아가리야메 — 마지막 국에서 오야가 연장하며 단독 1위라 그대로 끝났습니다",
  westEntryDecided: "서든데스 종료 — 30000점을 넘긴 사람이 나왔습니다",
  instantWin: "천하통일 — 문턱 점수에 닿아 남은 국 없이 끝났습니다",
};

const BOT_DIFFICULTY: readonly (readonly [string, string, string])[] = [
  ["easy", "쉬움", "실수를 자주 한다"],
  ["normal", "보통", "가끔 흘린다"],
  ["hard", "어려움", "봇의 최선"],
];
const BOT_DIFFICULTY_LABEL: Record<string, string> = Object.fromEntries(
  BOT_DIFFICULTY.map(([id, label]) => [id, label]),
);

function ModeBadge(props: { mode: GameMode }): JSX.Element {
  const m = MODE_BADGE[props.mode] ?? MODE_BADGE.hanchan;
  return (
    <div
      className="mode-badge"
      title={`${m.name} — 증강 획득: ${m.drafts}\n정규 구간이 끝나도 1위가 30000점에 못 미치면 장이 하나 더 붙는다(서든데스). 그 장에는 증강 획득이 없다.`}
    >
      <span className="mode-badge-name">{m.name}</span>
      <span className="mode-badge-drafts">증강 {m.drafts}</span>
    </div>
  );
}

/*
 * 게임판 — App 상태가 하나 바뀔 때마다 통째로 다시 그려지던 곳이라 memo를 씌운다.
 * 성립 조건은 위(useStableFn)에서 만들어 뒀다: 콜백 props가 매 렌더 새 객체가 아니어야 한다.
 * view·prompt·settings처럼 **진짜로 바뀌어야 다시 그릴 것들**만 남으므로,
 * 연출 시작/종료·토스트·점수 이펙트는 이제 판을 건드리지 않는다.
 */
const GameTable = memo(function GameTable(props: {
  view: PlayerView;
  /**
   * 중앙 인포 패널이 그릴 국 스냅샷 (없으면 `view`). 정산~증강 선택 동안은 지난 국에
   * 머물러 있다가, 다음 국이 실제로 시작된 뷰에서만 넘어온다 (App의 centerView 주석).
   */
  roundView?: PlayerView;
  prompt: PromptMessage["prompt"] | null;
  promptSeq: number;
  /** 초읽기(time_pressure)가 걸린 국의 결정 마감 시각(epoch ms). 평소에는 null */
  promptDeadline?: number | null;
  riichiMode: boolean;
  catalog: Record<string, AugmentCatalogEntry>;
  scoreFx: Record<string, number>;
  settings: Settings;
  /** 관전 모드 — 전 손패 공개·조작 없음 (관리자 실시간 관전·리플레이) */
  spectator?: boolean;
  /** 관전 중인 방 코드 (표시용) */
  spectateCode?: string | null;
  /** 게임 무효 투표 현황 (없으면 아직 투표 없음) */
  abortVote?: AbortVoteMessage | null;
  onVoteAbort?: (vote: "agree" | "withdraw" | "reject") => void;
  /** 증강 테스트 게임이면 그 상태 (관리자 전용). null이면 일반 게임. */
  sandbox?: SandboxMessage | null;
  /** 증강 테스트에서 지금 내가 조종 중인 봇 좌석 (없으면 null) */
  controlling?: string | null;
  /** 증강 테스트에서 **내 실제 좌석**이 지금 결정을 기다리는가 (다른 시점 관찰 중 안내용) */
  selfPending?: boolean;
  onSandboxGrant?: (augmentId: string, target: string) => void;
  onSandboxReset?: (
    augments: Record<string, string[]>,
    hands?: Record<string, string[]>,
  ) => void;
  onSandboxViewAs?: (seat: string) => void;
  onSandboxBotRules?: (rules: SandboxBotRules) => void;
  onSandboxControl?: (enabled: boolean) => void;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onRiichiMode: (v: boolean) => void;
  onSubmit: (o: ActionOption) => void;
  onLeave: () => void;
  /**
   * 무효 처리하고 나가기 — 사람이 나 혼자인 판(증강 테스트·봇전)에서만 쓴다.
   * 무효 동의를 보내고 곧바로 방을 뜬다 (동의가 나 하나면 서버가 즉시 무효 처리).
   */
  onAbortLeave?: () => void;
  /** 게임 중 증강 도감 열기 (오버레이) — 상대가 공개한 증강을 그 자리에서 찾아본다 */
  onOpenCodex?: () => void;
  /** 게임 중 규칙·도움말 열기 (오버레이) */
  onOpenHelp?: () => void;
  /** 정형구 보내기 (관전자에게는 없다 — 자리에 앉은 사람들의 대화다) */
  onEmote?: (id: string) => void;
  onToast?: (text: string) => void;
  /** 내 손패 배치가 바뀌었을 때 서버에 알린다 (관전 모드에서는 없음) */
  onHandOrder?: (tileIds: number[]) => void;
  /** 📜 사건 기록 (append-only). 리플레이 뷰어처럼 기록이 없는 자리에서는 생략된다. */
  logEvents?: LogEvent[];
  /**
   * 이 판의 봇 난이도 (`LobbyMessage.botDifficulty`). 대기실을 거치지 않은 판
   * (게스트 체험·리플레이)에서는 null이라 칩을 세우지 않는다.
   */
  botDifficulty?: string | null;
  /** 지나간 국의 정산 — 📜 기록에서 다시 열어 본다 (리플레이 뷰어에는 없다) */
  pastRounds?: PastRound[];
}): JSX.Element {
  const { view, prompt, catalog } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 증강 정보 로그 — 기본은 접힘. 예전엔 왼쪽 위에 상시로 펼쳐져 왼쪽 상대를 덮었다.
  // 설정 패널과 같은 자리(우상단)에 뜨므로 둘 중 하나만 열린다.
  const [logOpen, setLogOpen] = useState(false);
  // 증강 테스트 시점 전환: sandbox.seat이 내 실제 좌석, view.playerId는 지금 보고 있는 좌석.
  // 둘이 다르면 상대(또는 전체공개) 시점을 관찰 중이다.
  const sbxSelfId = props.sandbox?.seat ?? null;
  const observing = sbxSelfId !== null && view.playerId !== sbxSelfId;
  // 지금 보고 있는 봇 좌석을 실제로 조종 중인가 — 그러면 이 자리에서 직접 둘 수 있다.
  const driving = props.controlling != null && props.controlling === view.playerId;
  // 관찰 중인데 내 실제 좌석에 결정 프롬프트가 와 있으면 "내 차례" 복귀를 안내한다.
  const myTurnWhileObserving = observing && props.selfPending === true;
  // 사람이 나 혼자인 판인가 (증강 테스트·봇전) — 나가기가 곧 무효 처리가 되는 조건.
  // 다른 사람이 한 명이라도 앉아 있으면 내 마음대로 판을 없앨 수 없으므로 평소대로 묻는다.
  // (시점 전환 중이면 view.playerId가 봇 좌석이므로 "내 좌석"이 아니라 사람 수를 센다)
  const soloWithBots = props.spectator !== true && view.players.filter((p) => !p.isBot).length <= 1;
  // 내 손패에 마우스를 올리면 그 종류의 공개패(버림·후로)를 강조하기 위한 hover 종류
  const [hoverKind, setHoverKind] = useState<TileKind | null>(null);
  // 관전자·리플레이는 자리가 없으므로 현재 오야(친)를 하단 시점으로 삼아
  // 국이 바뀌어 오야가 옮겨가면 시점도 따라간다.
  const me = view.players.find((p) => p.id === view.playerId)
    ?? view.players.find((p) => p.seat === view.round.dealerSeat)
    ?? view.players.find((p) => p.seat === 0)
    ?? view.players[0]!;
  const n = view.players.length;
  const bySeatOffset = (offset: number) =>
    view.players.find((p) => p.seat === (me.seat + offset) % n) ?? null;
  const seats: Record<Side, PlayerInfo | null> = {
    bottom: me,
    right: bySeatOffset(1),
    top: bySeatOffset(2),
    left: bySeatOffset(3),
  };

  // ── 도라 반짝임 — 게임판 전체가 같은 도라 정보를 본다(DoraContext) ──
  const doraFx = useDoraFx(view, props.settings.doraFx);

  /**
   * ── 오름패 남은 장수 — 판 전체가 같은 셈을 본다(WaitCountContext) ──
   *
   * 손패를 세는 사람은 **하단 시점의 좌석 하나뿐**이다(`me`). 보통은 나 자신이고,
   * 관전·리플레이에서는 화면 아래에 손패가 펼쳐져 있는 그 좌석이다 — 화면에 이미
   * 보이는 것만 센다는 규칙이 두 경우 모두에서 지켜진다. 나머지 좌석의 손패는
   * 관전이라 뷰에 실려 와도 세지 않는다: 관전자가 보는 숫자가 대국자가 보는 숫자와
   * 다르면 "내 화면의 3"과 "관전 화면의 1"이 서로를 거짓말로 만든다.
   */
  const waitRemaining = useMemo(() => remainingCounter(view, me.id), [view, me.id]);

  // ── 액티브 증강 클릭 발동(무장) 상태 — 게임판 전체가 공유(SelectionContext) ──
  const selection = useSelection(view, prompt, props.onSubmit);
  const tableRef = useRef<HTMLDivElement>(null);
  // 무장 중 게임판의 빈 곳(클릭 대상이 아닌 영역)을 누르면 무장을 해제한다.
  // 손패·상대·바닥 등 클릭 대상 영역은 data-arm-zone로 표시해 제외한다.
  useEffect(() => {
    if (selection.armedType === null) return;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t !== null && t.closest("[data-arm-zone]") !== null) return;
      selection.arm(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // armedType이 바뀔 때만 재구독 — onDown은 상태를 null로 만들기만 하므로
    // selection이 약간 스테일해도 결과는 항상 올바르다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.armedType]);

  /**
   * 우클릭 쯔모기리 — **판 어디서든** 오른쪽 버튼이면 방금 쯔모한 패를 그대로 버린다.
   *
   * 처음엔 손패 상자(`.own-hand`)에만 걸었는데(#192), 그 상자는 화면 맨 아래 80px 남짓한
   * 띠라서 판을 보고 있다가 누르면 거의 다 빗나갔다 — "작동을 안 한다"로 읽힌 실체가 이것이다.
   * 그래서 게임판 전체로 올린다. 어차피 **버려지는 패는 커서 아래가 아니라 쯔모패**라,
   * 어디를 눌렀는지는 처음부터 결과에 영향이 없었다.
   *
   * 설정 패널·규칙·결과 화면 같은 오버레이는 전부 body 포털이라 이 판 밖이다(FIXED_SURFACE_NOTE).
   * 여기서 걸리는 건 좌석·강·중앙 패널·손패 — 전부 게임판이다.
   *
   * 네 자리에서는 듣지 않는다. 앞의 셋은 **오른쪽 버튼이 이미 다른 뜻인** 상황이다:
   *  - 리치할 패를 고르는 중: 손이 미끄러지면 고르려던 패가 아닌 것으로 리치가 나간다.
   *  - 증강 무장 중: 지금 클릭은 '버리기'가 아니라 '증강의 대상 고르기'다.
   *  - 관전·리플레이: 낼 패가 없다.
   *  - 글자를 치는 칸: 붙여넣기 같은 표준 수단 자리다 (contextMenu.ts가 메뉴를 살려 두는 자리).
   */
  function rightClickTsumogiri(e: React.MouseEvent): void {
    e.preventDefault();
    if (!props.settings.rightClickTsumogiri) return;
    if (props.spectator === true || view.playerId === SPECTATOR_ID) return;
    if (props.riichiMode || selection.armedType !== null) return;
    if (isTypingTarget(e.target)) return;
    // 쯔모패는 **내 손패 안에 실제로 있을 때만** 나간다 — 후로 직후 버림처럼
    // 쯔모가 없는 순에는 버릴 '그 패'가 없다.
    const drawnId = view.round.myDrawnTile;
    if (drawnId === null) return;
    if (!(view.zones[`hand:${me.id}`]?.tileIds ?? []).includes(drawnId)) return;
    const myPrompt = prompt !== null && prompt.player === view.playerId ? prompt : null;
    const opts = (myPrompt?.options ?? []).filter(
      (o) => (o.payload as { tileId?: unknown }).tileId === drawnId,
    );
    // 손패 클릭과 같은 우선순위 (discard 먼저, 없으면 free_discard)
    const opt = opts.find((o) => o.type === "discard") ?? opts.find((o) => o.type === "free_discard");
    if (opt === undefined) return;
    props.onSubmit(opt);
  }

  return (
    <SelectionContext.Provider value={selection}>
    <DoraContext.Provider value={doraFx}>
    <WaitCountContext.Provider value={waitRemaining}>
    <RelationProvider view={view}>
    {/* `data-hl` — 손패 hover 강조를 **CSS 짝맞추기**로 넘긴 자리 (감사 §7-4).
        예전에는 이 값을 컨텍스트로 내려보내 공개패마다 비교했고, 그래서 마우스가
        손패 위를 지날 때마다 화면의 패 150~250장이 전부 다시 그려졌다. 지금은
        여기 속성 **하나**만 바뀌고 React는 그 아래를 건드리지 않는다. */}
    <div
      className="table"
      ref={tableRef}
      onContextMenu={rightClickTsumogiri}
      data-hl={hoverKind === null ? undefined : `${hoverKind.suit}${hoverKind.rank}`}
    >
      {props.spectator === true ? (
        <div className="spectate-bar">
          👁 관전 중{props.spectateCode != null ? ` — 방 ${props.spectateCode}` : ""} (모든 손패 공개)
        </div>
      ) : null}
      {observing ? (
        <div
          className={`sbx-observe-bar${myTurnWhileObserving ? " my-turn" : ""}${driving ? " driving" : ""}`}
        >
          {driving ? "🎮 " : "🔍 "}
          {view.playerId === SPECTATOR_ID
            ? "전체 공개 시점으로 관찰 중"
            : `${playerNameById(view, view.playerId)} 시점으로 ${driving ? "직접 조작 중" : "관찰 중"}`}
          {myTurnWhileObserving ? " · 내 차례입니다!" : ""}
          {sbxSelfId !== null && props.onSandboxViewAs !== undefined ? (
            <button
              className="sbx-observe-back"
              onClick={() => props.onSandboxViewAs?.(sbxSelfId)}
            >
              내 시점으로
            </button>
          ) : null}
        </div>
      ) : null}
      <ModeBadge mode={view.round.mode} />
      {/* 봇 난이도 — 대기실에서만 보이고 판에 들어오면 사라지던 값. 봇이 없는 판에서는
          띄우지 않는다. */}
      {props.botDifficulty != null && view.players.some((p) => p.isBot) ? (
        <div
          className="mode-badge bot-diff-badge"
          title={`봇 난이도 — ${BOT_DIFFICULTY.find(([id]) => id === props.botDifficulty)?.[2] ?? ""}`}
        >
          <span className="mode-badge-name">🤖 {BOT_DIFFICULTY_LABEL[props.botDifficulty] ?? props.botDifficulty}</span>
        </div>
      ) : null}
      <button
        className="icon-btn settings-btn"
        onClick={() => {
          setSettingsOpen((v) => !v);
          setLogOpen(false);
        }}
        title="설정"
      >⚙</button>
      {/* 게임 중에도 찾아볼 수 있어야 한다 — 상대 증강 위의 `title=` 툴팁은 터치에서
          아예 뜨지 않아, 모바일에서는 그게 무엇인지 알 길이 전혀 없었다.
          아래 화면은 그대로 살아 있으므로 결정 타이머도 게임 상태도 멈추지 않는다. */}
      {props.onOpenCodex !== undefined ? (
        <button
          className="icon-btn codex-btn"
          onClick={props.onOpenCodex}
          title="증강 도감 (게임은 그대로 진행됩니다)"
        >📖</button>
      ) : null}
      {props.onOpenHelp !== undefined ? (
        <button
          className="icon-btn help-btn"
          onClick={props.onOpenHelp}
          title="규칙 · 도움말 (게임은 그대로 진행됩니다)"
        >📘</button>
      ) : null}
      {/* 게임 중 나가기 = 포기(좌석은 자동 진행으로 완주한다) — 되돌릴 수 없으니 한 번 묻는다.
          관전은 그냥 화면을 닫는 것이라 묻지 않는다.

          사람이 나 혼자인 판(증강 테스트·봇전)은 그냥 나가면 안 된다 — 내 좌석이
          자동 진행으로 남아 게임이 계속 돌고, 홈으로 나온 화면 위로 그 판의 연출과
          소리가 계속 튀어나온다. 이 경우 확인 한 번으로 무효 처리까지 같이 한다
          (동의할 사람이 나뿐이라 서버가 즉시 무효로 끝낸다). */}
      <button
        className="icon-btn leave-btn"
        onClick={() => {
          if (props.spectator === true) {
            props.onLeave();
            return;
          }
          if (soloWithBots) {
            void askConfirm({
              title: "게임을 무효 처리하고 나갈까요?",
              body: "사람이 나뿐이라 판은 그 자리에서 무효가 됩니다. 기록도 남지 않습니다.",
              confirmLabel: "무효 처리하고 나가기",
              danger: true,
            }).then((ok) => {
              if (ok) (props.onAbortLeave ?? props.onLeave)();
            });
            return;
          }
          void askConfirm({
            title: "게임을 포기하고 나갈까요?",
            body: "남은 판은 자동으로 진행되고, 그 대국에는 다시 들어올 수 없습니다. 순위와 전적은 그대로 기록됩니다.",
            confirmLabel: "포기하고 나가기",
            danger: true,
          }).then((ok) => {
            if (ok) props.onLeave();
          });
        }}
        title="나가기"
      >✕</button>
      {settingsOpen ? (
        <SettingsPanel
          settings={props.settings}
          onSetting={props.onSetting}
          onClose={() => setSettingsOpen(false)}
          abortVote={props.spectator === true ? null : (props.abortVote ?? null)}
          iVoted={(props.abortVote?.voters ?? []).includes(view.playerId)}
          onVoteAbort={props.spectator === true ? undefined : props.onVoteAbort}
        />
      ) : null}
      {props.spectator !== true ? (
        <QuickToggles settings={props.settings} onSetting={props.onSetting} {...(props.onToast === undefined ? {} : { onToast: props.onToast })} />
      ) : null}
      {props.spectator !== true && props.onEmote !== undefined ? (
        <EmoteBar onSend={props.onEmote} />
      ) : null}
      {props.spectator !== true && props.abortVote != null && props.abortVote.votes > 0 ? (
        <AbortVoteBanner
          abortVote={props.abortVote}
          iVoted={props.abortVote.voters.includes(view.playerId)}
          requesterName={playerNameById(view, props.abortVote.voters[0] ?? view.playerId)}
          onVote={props.onVoteAbort}
        />
      ) : null}

      {seats.top !== null ? <OpponentStrip view={view} player={seats.top} side="top" catalog={catalog} /> : null}
      {seats.left !== null ? <OpponentStrip view={view} player={seats.left} side="left" catalog={catalog} /> : null}
      {seats.right !== null ? <OpponentStrip view={view} player={seats.right} side="right" catalog={catalog} /> : null}

      <div className="table-center">
        <River view={view} playerId={me.id} side="bottom" />
        {seats.right !== null ? <River view={view} playerId={seats.right.id} side="right" /> : null}
        {seats.top !== null ? <River view={view} playerId={seats.top.id} side="top" /> : null}
        {seats.left !== null ? <River view={view} playerId={seats.left.id} side="left" /> : null}
        <CenterPanel
          view={view}
          roundView={props.roundView ?? view}
          seats={seats}
          scoreFx={props.scoreFx}
        />
      </div>

      <AugmentLog
        view={view}
        catalog={catalog}
        events={props.logEvents ?? EMPTY_LOG}
        pastRounds={props.pastRounds ?? EMPTY_PAST_ROUNDS}
        open={logOpen}
        onToggle={() => {
          setLogOpen((v) => !v);
          setSettingsOpen(false);
        }}
      />

      {props.sandbox != null && props.spectator !== true ? (
        <SandboxPanel
          view={view}
          catalog={catalog}
          sandbox={props.sandbox}
          controlling={props.controlling ?? null}
          {...(props.onSandboxGrant !== undefined ? { onGrant: props.onSandboxGrant } : {})}
          {...(props.onSandboxReset !== undefined ? { onReset: props.onSandboxReset } : {})}
          {...(props.onSandboxViewAs !== undefined ? { onViewAs: props.onSandboxViewAs } : {})}
          {...(props.onSandboxBotRules !== undefined ? { onBotRules: props.onSandboxBotRules } : {})}
          {...(props.onSandboxControl !== undefined ? { onControl: props.onSandboxControl } : {})}
          {...(props.onToast !== undefined ? { onToast: props.onToast } : {})}
        />
      ) : null}

      <OwnArea
        view={view}
        me={me}
        prompt={prompt}
        promptSeq={props.promptSeq}
        promptDeadline={props.promptDeadline ?? null}
        riichiMode={props.riichiMode}
        catalog={catalog}
        autoSort={props.settings.autoSort}
        showMyWaits={props.settings.showMyWaits}
        tapTwiceToDiscard={props.settings.tapTwiceToDiscard}
        {...(props.spectator !== true
          ? {
              quickToggles: (
                <QuickToggles settings={props.settings} onSetting={props.onSetting} inline {...(props.onToast === undefined ? {} : { onToast: props.onToast })} />
              ),
            }
          : {})}
        onRiichiMode={props.onRiichiMode}
        onSubmit={props.onSubmit}
        onHoverKind={setHoverKind}
        {...(props.onToast !== undefined ? { onToast: props.onToast } : {})}
        {...(props.onHandOrder !== undefined ? { onHandOrder: props.onHandOrder } : {})}
      />
    </div>
    </RelationProvider>
    </WaitCountContext.Provider>
    </DoraContext.Provider>
    </SelectionContext.Provider>
  );
});

/**
 * 액티브 증강 클릭 발동(무장) 상태를 만들어 SelectionContext에 넣을 값을 반환한다.
 * 무장된 액션의 종류(ArmMode)에 따라 손패·상대·바닥 클릭을 옵션 제출로 연결한다.
 */
function useSelection(
  view: PlayerView,
  prompt: PromptMessage["prompt"] | null,
  onSubmit: (o: ActionOption) => void,
): SelectionCtx {
  const [armedType, setArmedType] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
  const [swapGive, setSwapGive] = useState<number[]>([]);

  const myPrompt = prompt !== null && prompt.player === view.playerId ? prompt : null;
  const armMode = armedType !== null ? (armModeOf(armedType) ?? null) : null;

  const armedOptions = useMemo(
    () =>
      armedType === null
        ? []
        : (myPrompt?.options ?? []).filter((o) => o.type === armedType),
    [armedType, myPrompt],
  );

  // 프롬프트가 바뀌어 무장 액션이 사라지면 무장을 해제한다.
  useEffect(() => {
    if (armedType === null) return;
    if (!(myPrompt?.options ?? []).some((o) => o.type === armedType)) {
      setArmedType(null);
      setSwapTarget(null);
      setSwapGive([]);
    }
  }, [armedType, myPrompt]);

  // swap3에서 벗어나면 상대·선택패를 비운다.
  useEffect(() => {
    if (armedType !== "swap3") {
      setSwapTarget(null);
      setSwapGive([]);
    }
  }, [armedType]);

  const arm = (type: string | null): void => {
    setArmedType((cur) => (type === null ? null : cur === type ? null : type));
    setSwapTarget(null);
    setSwapGive([]);
  };

  const submit = (o: ActionOption): void => {
    onSubmit(o);
    setArmedType(null);
    setSwapTarget(null);
    setSwapGive([]);
  };

  // opp 모드: 이 상대를 대상으로 하는 옵션. swap3 상대 지정 단계도 같은 payload.target.
  const oppOptionFor = (pid: string): ActionOption | undefined =>
    armedOptions.find((o) => (o.payload as { target?: unknown }).target === pid);

  const oppArmable = (pid: string): boolean => {
    if (armMode === "opp") return oppOptionFor(pid) !== undefined;
    if (armMode === "swap3") {
      return swapTarget === null && armedOptions.some((o) => (o.payload as { target?: unknown }).target === pid);
    }
    return false;
  };

  /**
   * 손패를 조작하는 증강(통째로 바꾸기·등가교환·자리 바꿈)을 무장했는데 이 상대가
   * 후보에 없고 **리치를 선언해 둔** 경우 — 왜 못 고르는지 화면에 적어 준다.
   * 서버는 리치 상대를 후보에서 아예 빼므로(riichiBlocksSwap), 클라이언트는 그
   * 빈자리에 이유만 채운다. 숨은 리치는 riichiDeclared가 false라 여기 걸리지 않는다 —
   * 걸리면 그 표시가 곧 은닉을 깨는 누설이 된다.
   */
  const oppRiichiBlocked = (pid: string): boolean => {
    if (armedType === null || !HAND_MANIP_ACTIONS.has(armedType)) return false;
    if (armMode === "swap3" && swapTarget !== null) return false;
    if (oppArmable(pid)) return false;
    return view.round.byPlayer[pid]?.riichiDeclared === true;
  };

  const clickOpp = (pid: string): void => {
    if (armMode === "opp") {
      const o = oppOptionFor(pid);
      if (o !== undefined) submit(o);
      return;
    }
    if (armMode === "swap3" && swapTarget === null) {
      if (armedOptions.some((o) => (o.payload as { target?: unknown }).target === pid)) {
        setSwapTarget(pid);
      }
    }
  };

  // own-river / opp-river 모드: 클릭한 바닥 패가 무장 액션의 대상이면 그 옵션.
  const riverOptionFor = (
    ownerId: string,
    tileId: number,
    kind: TileKind | undefined,
  ): ActionOption | undefined => {
    if (armMode === "own-river") {
      if (ownerId !== view.playerId) return undefined;
      return armedOptions.find((o) => {
        const p = o.payload as { recallTileId?: unknown; kind?: unknown };
        if (armedType === "recall") return p.recallTileId === tileId;
        if (armedType === "bury_mine") return kind !== undefined && p.kind === kindKey(kind);
        return false;
      });
    }
    if (armMode === "opp-river") {
      if (ownerId === view.playerId) return undefined;
      return armedOptions.find((o) => {
        // 날치기는 최근 버림패(snatchId), 무덤 도굴은 바닥 전체(graveId)가 대상이다
        const p = o.payload as {
          snatchId?: unknown;
          graveId?: unknown;
          fromPlayer?: unknown;
        };
        if (p.fromPlayer !== ownerId) return false;
        return p.snatchId === tileId || p.graveId === tileId;
      });
    }
    if (armMode === "any-river") {
      // 정적의 손 — 네 사람 전부의 바닥이 대상. payload는 { tileId } 하나뿐(주인 무관).
      return armedOptions.find(
        (o) => (o.payload as { tileId?: unknown }).tileId === tileId,
      );
    }
    return undefined;
  };

  return {
    armedType,
    armMode,
    armedOptions,
    arm,
    submit,
    oppArmable,
    clickOpp,
    oppRiichiBlocked,
    riverOptionFor,
    swapTarget,
    swapGive,
    setSwapTarget,
    setSwapGive,
  };
}

// ─────────────────────────── 인게임 빠른 토글 ───────────────────────────

/**
 * 게임 화면 좌하단에 붙는 빠른 토글 바.
 * 설정창을 열지 않고 자동정렬·자동화료·후로없음·자동버림을 글자 클릭으로 바로 온/오프한다.
 * (설정은 localStorage에 저장되고, 이미 떠 있는 프롬프트에도 소급 적용된다.)
 *
 * inline: 좁은 화면(모바일)용 — 좌하단 절대배치 대신 내 손패 바로 위에 가로 줄로 눕는다.
 * 두 벌 다 렌더하고 CSS 미디어쿼리가 한쪽만 보여준다 (상태는 없는 컴포넌트라 안전).
 */
/** 문구 하나가 화면에 머무는 시간. 읽고 흘려보내기 딱 좋은 길이. */
const EMOTE_SHOW_MS = 4500;
/** 동시에 보여 줄 최대 개수 — 넷이 한꺼번에 인사해도 화면을 덮지 않는다. */
const EMOTE_FEED_MAX = 4;

interface EmoteEntry {
  key: number;
  nickname: string;
  id: string;
}

/**
 * 받은 정형구를 흘려보내는 자리.
 *
 * 이름표 옆 말풍선이 아니라 **한 곳에 모아** 띄운다. 말풍선은 좌석 위치를 알아야
 * 하고, 대기실·게임·관전에서 그 위치가 전부 다르다 — 화면마다 다른 코드를 두면
 * 셋 중 하나는 반드시 어긋난다. 한 자리에 모으면 어디서든 같은 것이 보인다.
 */
function EmoteFeed({ entries }: { entries: EmoteEntry[] }): JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <div className="emote-feed" aria-live="polite">
      {entries.map((e) => {
        const def = EMOTES.find((x) => x.id === e.id);
        return (
          <div key={e.key} className="emote-bubble">
            <span className="emote-bubble-name">{e.nickname}</span>
            <span className="emote-bubble-text">{def?.text ?? e.id}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 정형구 보내기 (감사 §4-9).
 *
 * 평소에는 말풍선 단추 하나만 떠 있고, 누르면 문구 여덟 개가 펼쳐진다. 항상 펼쳐
 * 두지 않는 이유: 이 자리는 판 위이고, 상시로 자리를 먹으면 정작 게임이 좁아진다.
 *
 * 보낸 뒤에는 스스로 접는다 — 인사 한 번 하려고 두 번 누르게 하지 않는다.
 */
function EmoteBar({ onSend }: { onSend: (id: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "emote-bar open" : "emote-bar"}>
      {open ? (
        <div className="emote-list" role="group" aria-label="정형구">
          {EMOTES.map((e) => (
            <button
              key={e.id}
              className="emote-btn"
              onClick={() => {
                onSend(e.id);
                setOpen(false);
              }}
            >
              <span className="emote-text">{e.text}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        className="emote-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "정형구 닫기" : "정형구 보내기"}
        title="정형구 보내기"
      >
        {open ? "닫기" : "대화"}
      </button>
    </div>
  );
}

function QuickToggles(props: {
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  inline?: boolean;
  /** 켠 순간 무슨 일이 일어나는지 알린다 (자동화료·자동버림 전용) */
  onToast?: (text: string) => void;
}): JSX.Element {
  const items: { key: "autoSort" | "autoWin" | "autoNoMeld" | "autoDiscard"; label: string; desc: string }[] = [
    { key: "autoSort", label: "자동정렬", desc: "끄면 손패를 드래그해 순서를 바꿀 수 있습니다" },
    { key: "autoWin", label: "자동화료", desc: AUTO_WIN_DESC },
    { key: "autoNoMeld", label: "후로없음", desc: "치·퐁·깡 기회를 자동으로 넘깁니다" },
    { key: "autoDiscard", label: "자동버림", desc: "쯔모한 패를 자동으로 버립니다(화료 가능한 순에는 멈춥니다)" },
  ];
  return (
    <div className={`quick-toggles${props.inline === true ? " quick-toggles-inline" : ""}`}>
      {items.map((it) => {
        const active = props.settings[it.key];
        return (
          <button
            key={it.key}
            className={`qt-item${active ? " qt-on" : ""}`}
            aria-pressed={active}
            onClick={() => {
              const next = !active;
              props.onSetting(it.key, next);
              /*
               * 되돌릴 수 없는 자동 진행 둘은 **켠 순간 말해 준다** (감사 §5-14).
               *
               * 되묻는 모달은 일부러 쓰지 않는다 — 2026-08-12에 사용자 지시로 없앴다.
               * 판이 도는 중에 한 손으로 켜고 끄는 자리인데 모달이 판을 가로막아
               * 정작 그 순간의 결정을 놓쳤기 때문이다. 문제는 "되묻지 않는 것"이
               * 아니라 **켜진 줄 모르는 것**이었으므로, 막지 않고 알리기만 한다.
               */
              if (next && (it.key === "autoDiscard" || it.key === "autoWin")) {
                props.onToast?.(
                  it.key === "autoDiscard"
                    ? "자동버림 켜짐 — 쯔모한 패가 그대로 나갑니다"
                    : "자동화료 켜짐 — 화료 가능해지면 바로 냅니다",
                );
              }
            }}
            title={`${it.label} — ${it.desc} (지금 ${active ? "켜짐" : "꺼짐"})`}
            aria-label={`${it.label} ${active ? "켜짐" : "꺼짐"} — ${it.desc}`}
          >
            <span className="qt-dot" />
            <span className="qt-label">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 자동 화료 설명 — 되돌릴 수 없다는 사실을 먼저 말한다.
 *
 * 이 스위치는 판 위에서 한 번 눌리면 되묻지 않고 론·쯔모를 쏜다. 야쿠도 점수도 보지 않고,
 * 하이테이·린샨을 노리고 흘려 보내던 손도 그냥 친다.
 *
 * 2026-08-12(사용자 지시): 켤 때 뜨던 `window.confirm` 되묻기를 **없앴다**. 좌하단 빠른
 * 토글은 판이 도는 중에 한 손으로 켜고 끄는 자리인데, 켤 때마다 브라우저 모달이 판을
 * 가로막아 정작 그 순간의 결정을 놓쳤다. 설명은 툴팁으로 그대로 남는다.
 */
const AUTO_WIN_DESC =
  "화료 가능해지는 즉시 되묻지 않고 론·쯔모합니다 (점수·야쿠를 보지 않습니다)";

// ─────────────────────────── 설정 패널 ───────────────────────────

/**
 * 떠 있는 패널을 헤더 드래그로 옮길 수 있게 한다 (마우스·터치 공통).
 *
 * 패널은 position:fixed라 기본 위치는 CSS(top/right)가 정한다. 처음 드래그하는
 * 순간 실제 화면 좌표를 재서 left/top으로 전환하므로 튀지 않는다. 이동 중에도,
 * 창 크기가 바뀔 때도 항상 뷰포트 안으로 물려 두기 때문에 "설정창이 화면 밖으로
 * 나가 안 보이는" 상황이 생기지 않는다.
 */
function useDraggablePanel(): {
  ref: React.RefObject<HTMLDivElement>;
  style: React.CSSProperties | undefined;
  onPointerDown: (e: React.PointerEvent) => void;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // 드래그 시작 시점의 "패널 좌상단 기준 커서 오프셋"
  const grabRef = useRef<{ dx: number; dy: number } | null>(null);

  /**
   * 패널이 화면 밖으로 나가지 않게 좌표를 가둔다.
   * 인자·결과는 전부 **레이아웃 좌표**다 — getBoundingClientRect·clientX(화면 좌표)는
   * toLayoutPx()로 바꿔 넣는다. UI 배율이 걸리면 두 좌표계가 어긋난다 (uiScale.ts 참고).
   */
  const clamp = (left: number, top: number, w: number, h: number) => {
    const v = layoutViewport();
    return {
      left: Math.min(Math.max(left, 8), Math.max(8, v.w - w - 8)),
      top: Math.min(Math.max(top, 8), Math.max(8, v.h - h - 8)),
    };
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    // 헤더 안의 닫기 버튼 등은 드래그가 아니라 클릭으로 동작해야 한다
    if ((e.target as HTMLElement).closest("button") !== null) return;
    const el = ref.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    grabRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setPos(
      clamp(toLayoutPx(r.left), toLayoutPx(r.top), toLayoutPx(r.width), toLayoutPx(r.height)),
    );
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  // 드래그 중 이동·종료. 포인터 캡처를 헤더가 쥐고 있어 창 밖으로 나가도 따라온다.
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const grab = grabRef.current;
      const el = ref.current;
      if (grab === null || el === null) return;
      const r = el.getBoundingClientRect();
      setPos(
        clamp(
          toLayoutPx(e.clientX - grab.dx),
          toLayoutPx(e.clientY - grab.dy),
          toLayoutPx(r.width),
          toLayoutPx(r.height),
        ),
      );
    };
    const onUp = (): void => {
      grabRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // 창 크기·회전이 바뀌면 옮겨 둔 패널을 다시 화면 안으로 끌어온다
  useEffect(() => {
    if (pos === null) return;
    const onResize = (): void => {
      const el = ref.current;
      if (el === null) return;
      const r = el.getBoundingClientRect();
      setPos((p) =>
        p === null ? null : clamp(p.left, p.top, toLayoutPx(r.width), toLayoutPx(r.height)),
      );
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [pos !== null]);

  return {
    ref,
    style:
      pos === null
        ? undefined
        : ({
            left: pos.left,
            top: pos.top,
            right: "auto",
            bottom: "auto",
            // 패널 높이가 top을 빼고 잡히도록 (styles.css `.settings-panel`) —
            // 옮긴 자리에서도 아래끝이 화면 밖으로 나가지 않는다.
            "--panel-top": `${pos.top}px`,
          } as React.CSSProperties),
    onPointerDown,
  };
}

function SettingsPanel(props: {
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onClose: () => void;
  abortVote?: AbortVoteMessage | null;
  iVoted?: boolean;
  onVoteAbort?: ((vote: "agree" | "withdraw" | "reject") => void) | undefined;
}): JSX.Element {
  // 불리언(토글) 설정만 — 숫자 설정(리치 BGM 볼륨)은 아래 슬라이더로 따로 렌더한다.
  type BoolSettingKey = {
    [K in keyof Settings]: Settings[K] extends boolean ? K : never;
  }[keyof Settings];
  // ⚠ 자동정렬·자동화료·후로없음·자동버림은 여기 없다 — 좌하단 빠른 토글(QuickToggles)이
  //   판 위에서 바로 켜고 끄는 자리라 설정창에 같은 스위치를 한 벌 더 두면 두 곳을 오가며
  //   무엇이 켜졌는지 확인하게 된다(2026-08-12 사용자 지시). 저장 형식(Settings)은 그대로다.
  const rows: { key: BoolSettingKey; label: string; desc: string }[] = [
    {
      key: "tapTwiceToDiscard",
      label: "두 번 눌러 버리기",
      desc: "첫 번째로 누른 패가 들어 올려지고, 한 번 더 눌러야 실제로 나갑니다. 다른 패를 누르면 그쪽으로 옮겨 갑니다 (폰에서는 기본으로 켜져 있습니다 — 패 사이가 좁아 옆 패를 짚기 쉽습니다)",
    },
    {
      key: "showMyWaits",
      label: "내 오름패 표시",
      desc: "텐파이면 손패 위에 화료패를 항상 표시합니다. 패 위 숫자는 아직 보이지 않은 그 패의 장수(기본 4장 − 버림패·후로·도라 표시패·내 손패에 나온 수)이며, 증강 생성패는 세지 않습니다. 0이면 그 패로는 날 수 없습니다",
    },
    {
      key: "rightClickTsumogiri",
      label: "우클릭 쯔모기리",
      desc: "판 어디서든 오른쪽 버튼을 누르면 방금 쯔모한 패를 그대로 버립니다 (리치할 패를 고르는 중·증강 선택 중에는 듣지 않습니다)",
    },
    { key: "doraFx", label: "도라 반짝임", desc: "도라인 패를 금빛으로 반짝입니다 (나만의 도라는 보랏금)" },
    { key: "screenFx", label: "화면 효과", desc: "화료·리치 때 화면 흔들림·번쩍임·파티클 (멀미·광과민이면 끄세요)" },
    { key: "sfxOn", label: "효과음", desc: "모든 게임 효과음을 켭니다" },
    // 진동 장치가 없는 기기에서는 아예 보여 주지 않는다 — 죽은 스위치를 두지 않는다.
    ...(hapticsSupported()
      ? [
          {
            key: "haptics" as const,
            label: "진동",
            desc: "패를 버리거나 선언할 때 짧게 진동합니다. 효과음과 별개라 소리를 꺼도 남습니다 (움직임 줄이기를 켜 두면 진동도 함께 꺼집니다)",
          },
        ]
      : []),
    {
      key: "glossaryTips",
      label: "용어 설명",
      desc: "증강 설명의 마작 용어(슌쯔·오름패…)에 밑줄을 긋고, 올려 두면 풀이를 띄웁니다",
    },
  ];
  const votes = props.abortVote?.votes ?? 0;
  const needed = props.abortVote?.needed ?? 0;
  const drag = useDraggablePanel();
  // 화면 고정 표면은 전부 body 포털이다 — 이유는 FIXED_SURFACE_NOTE 참고.
  // 이 패널은 특히 중요하다: 드래그가 `getBoundingClientRect()`(뷰포트 좌표)를 재서
  // 인라인 left/top으로 넣는데, 그 좌표는 **컨테이닝 블록** 기준으로 해석된다.
  // 홈에서는 `.home-nav`(backdrop-filter)가 컨테이닝 블록이라 마침 원점이 겹쳐
  // 티가 안 났을 뿐, 조상에 여백이나 transform이 하나만 붙어도 창이 튄다.
  return createPortal(
    <div
      className="settings-panel"
      ref={drag.ref}
      {...(drag.style !== undefined ? { style: drag.style } : {})}
      role="dialog"
      aria-label="설정"
      tabIndex={-1}
      /*
       * Esc 로 닫는다 (감사 §6-5). `aria-modal`은 **붙이지 않는다** — 판은 뒤에서
       * 계속 돌고 결정 타이머도 흐르므로 "뒤는 없는 셈"이라고 말하면 거짓이다.
       * ref 자리는 드래그가 이미 쓰고 있어 여기서는 핸들러만 단다.
       */
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          props.onClose();
        }
      }}
    >
      <div
        className="settings-head"
        onPointerDown={drag.onPointerDown}
        title="여기를 끌어 창을 옮길 수 있습니다"
      >
        <span className="settings-grip" aria-hidden="true">⠿</span>
        <span className="settings-title">설정</span>
        <button className="settings-x" onClick={props.onClose} title="닫기">✕</button>
      </div>
      <div className="settings-body">
        {rows.map((r) => (
          <label key={r.key} className="settings-row">
            <div className="settings-text">
              <span className="settings-label">{r.label}</span>
              <span className="settings-desc" id={`set-desc-${r.key}`}>{r.desc}</span>
            </div>
            <button
              className={`toggle${props.settings[r.key] ? " toggle-on" : ""}`}
              role="switch"
              aria-checked={props.settings[r.key]}
              /*
               * 이름을 명시한다 (감사 §6-6). 버튼 내용이 빈 `<span class="toggle-knob">`
               * 이라 이름이 없었고, 감싼 `<label>` 은 **button 에 이름을 주지 못한다**
               * (label 의 암묵 연결은 폼 컨트롤에만 적용된다). 그래서 스크린리더가
               * "스위치, 켬" 만 읽었다 — 무엇의 스위치인지가 빠진다.
               * 바로 아래 음량 슬라이더는 aria-label 이 제대로 붙어 있어 대비된다.
               */
              aria-label={r.label}
              aria-describedby={`set-desc-${r.key}`}
              onClick={() => {
                props.onSetting(r.key, !props.settings[r.key]);
              }}
            >
              <span className="toggle-knob" />
            </button>
          </label>
        ))}
        {/* 연출 속도 — on/off 사이의 자리 (감사 §5-15). 화면 효과를 끄는 것과는
            다른 요구다: 저쪽은 멀미·광과민이고 이쪽은 "이미 다 아는 연출"이다. */}
        <label className="settings-row settings-row-slider">
          <div className="settings-text">
            <span className="settings-label">연출 속도</span>
            <span className="settings-desc">
              화료·리치·증강 컷인이 화면에 머무는 시간입니다. 짧게 둘수록 판이 빨리
              넘어갑니다 (Esc 로 그때그때 건너뛰는 것은 그대로 됩니다).
            </span>
          </div>
          <div className="settings-seg" role="group" aria-label="연출 속도">
            {([
              { v: 1, label: "보통" },
              { v: 0.6, label: "빠르게" },
              { v: 0.35, label: "최소" },
            ] as const).map((o) => (
              <button
                key={o.v}
                className={
                  Math.abs(props.settings.prodSpeed - o.v) < 0.01
                    ? "settings-seg-btn on"
                    : "settings-seg-btn"
                }
                aria-pressed={Math.abs(props.settings.prodSpeed - o.v) < 0.01}
                onClick={() => props.onSetting("prodSpeed", o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </label>
        {/* 효과음 음량 — 마스터 게인은 이미 있었고 손잡이만 없었다 (감사 §5-4).
            BGM은 슬라이더가 둘인데 효과음만 on/off 뿐이라, "소리는 듣고 싶은데
            이렇게 크진 않다"는 자리가 없었다. */}
        <label className="settings-row settings-row-slider">
          <div className="settings-text">
            <span className="settings-label">효과음 음량</span>
            <span className="settings-desc">
              패를 놓는 소리·선언·화료 등 게임 효과음의 음량입니다. 위의 "효과음"을 끄면
              이 값과 무관하게 들리지 않습니다.
            </span>
          </div>
          <div className="settings-slider">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(props.settings.sfxVolume * 100)}
              onChange={(e) => props.onSetting("sfxVolume", Number(e.target.value) / 100)}
              aria-label="효과음 음량"
            />
            <span className="settings-slider-val">{Math.round(props.settings.sfxVolume * 100)}</span>
          </div>
        </label>
        <label className="settings-row settings-row-slider">
          <div className="settings-text">
            <span className="settings-label">배경음악 음량</span>
            <span className="settings-desc">
              대국 중 흐르는 배경음악의 음량입니다 (0이면 끔). 리치가 걸리면 리치 BGM에
              자리를 내주고, 그 국이 끝나면 돌아옵니다.
            </span>
          </div>
          <div className="settings-slider">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(props.settings.bgmVolume * 100)}
              onChange={(e) => props.onSetting("bgmVolume", Number(e.target.value) / 100)}
              aria-label="배경음악 음량"
            />
            <span className="settings-slider-val">{Math.round(props.settings.bgmVolume * 100)}</span>
          </div>
        </label>
        <label className="settings-row settings-row-slider">
          <div className="settings-text">
            <span className="settings-label">리치 BGM 음량</span>
            <span className="settings-desc">
              리치 선언 시 나오는 전용 BGM의 음량입니다 (0이면 끔)
            </span>
          </div>
          <div className="settings-slider">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(props.settings.riichiBgmVolume * 100)}
              onChange={(e) => props.onSetting("riichiBgmVolume", Number(e.target.value) / 100)}
              aria-label="리치 BGM 음량"
            />
            <span className="settings-slider-val">
              {Math.round(props.settings.riichiBgmVolume * 100)}
            </span>
          </div>
        </label>
        {props.onVoteAbort !== undefined ? (
          <div className="settings-abort">
            <div className="settings-text">
              <span className="settings-label">게임 무효 요청</span>
              <span className="settings-desc">
                사람 전원이 동의하면 게임을 무효 처리합니다 (봇은 자동 동의).
                {needed > 0 ? ` 현재 ${votes}/${needed} 동의.` : ""}
              </span>
            </div>
            <button
              className={`abort-btn${props.iVoted === true ? " abort-btn-on" : ""}`}
              onClick={() => props.onVoteAbort?.(props.iVoted === true ? "withdraw" : "agree")}
            >
              {props.iVoted === true ? "동의 취소" : "게임 무효 요청"}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 게임 무효 투표 배너 — 투표가 진행 중(votes>0)이면 설정과 무관하게 화면 상단에 크게 뜬다.
 * 동의(agree)/반대(reject)를 명확히 노출한다. 반대는 만장일치가 불가능해진 투표를 즉시 취소한다.
 */
function AbortVoteBanner(props: {
  abortVote: AbortVoteMessage;
  iVoted: boolean;
  requesterName: string;
  onVote: ((vote: "agree" | "withdraw" | "reject") => void) | undefined;
}): JSX.Element {
  const { votes, needed } = props.abortVote;
  // 화면 고정 표면은 전부 body 포털이다 — 이유는 FIXED_SURFACE_NOTE 참고
  return createPortal(
    <div className="abort-banner" role="alertdialog" aria-live="assertive">
      <div className="abort-banner-info">
        <span className="abort-banner-title">게임 무효 투표</span>
        <span className="abort-banner-sub">
          {props.requesterName}님이 무효를 요청했습니다 · 동의 {votes}/{needed}
        </span>
      </div>
      <div className="abort-banner-actions">
        <button
          className={`abort-yes${props.iVoted ? " abort-yes-on" : ""}`}
          disabled={props.iVoted}
          onClick={() => props.onVote?.("agree")}
        >
          {props.iVoted ? "동의함 ✓" : "동의"}
        </button>
        <button className="abort-no" onClick={() => props.onVote?.("reject")}>
          반대
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────── 지목 관계 표식 ───────────────────────────

/**
 * "A가 B를 지목했다"는 관계를 **양쪽 이름표 위의 작은 표식**으로 보여준다.
 *
 * 이 관계들은 예전에 전부 글줄이었다 — `복수 남풍 → 서풍`, `기생 동풍 → 북풍`,
 * `격(格) 서풍 → 남풍 (5판 미만 화료 불가)` … 아홉 종이 한꺼번에 걸리면 목록의
 * 절반을 먹는다.
 *
 * ⚠ 한때 좌석과 좌석을 잇는 **화살표**로 그렸다가 되돌렸다(2026-08-01 사용자 보고
 * — "화면 전체를 그어버린다 · 판을 가린다"). 맞은편 좌석끼리는 선이 화면을 통째로
 * 가로지를 수밖에 없어서, 곡선을 아무리 판 바깥으로 돌려도 시야를 먹었다.
 * 관계는 **관계에 걸린 사람 위**에 앉히는 게 맞다 — 판 위에는 아무것도 그리지 않는다.
 */
type Relation = {
  key: string;
  from: string;
  to: string;
  /** 이름표 표식에 앉는 아이콘 */
  icon: string;
  /** 표식에 붙는 짧은 이름 */
  label: string;
  /** 표식 색 */
  color: string;
};

/** 지목형 증강 → 표식·색. 여기 없는 관계는 그리지 않는다. */
const RELATION_META: Record<string, { icon: string; label: string; color: string }> = {
  avenger: { icon: "🗡", label: "복수", color: "#e0685f" },
  scapegoat: { icon: "🎭", label: "덤터기", color: "#e0a05f" },
  rank_gate: { icon: "⛩️", label: "격", color: "#c9a227" },
  push_riichi: { icon: "🤚", label: "등 떠밀기", color: "#5fa8e0" },
  disarm: { icon: "🔒", label: "무장해제", color: "#8d9490" },
  parasite: { icon: "🪱", label: "기생", color: "#7fbf6a" },
  frame_up: { icon: "🖼", label: "누명", color: "#b98cd8" },
  counter: { icon: "↩️", label: "반격", color: "#e05f9a" },
  full_hand_swap: { icon: "🔀", label: "통째 교환", color: "#5fd0c0" },
};

/** 이 표식들이 대신 보여주는 채널 — 증강 정보 로그에는 남기지 않는다 */
const RELATION_HEADS: ReadonlySet<string> = new Set(Object.keys(RELATION_META));

/**
 * 지목 관계 중 **당사자에게는 표식으로 부족한** 것들 — 한 번 크게 알린다.
 *
 * 이름표 옆 관계 표식(RELATION_META)은 제3자에게 판을 읽히려고 있는 것이지, 당한
 * 사람에게 "무슨 일이 일어났는가"를 알려 주는 자리가 아니다. 손패가 통째로 바뀌거나
 * 내가 버리지도 않은 패로 후리텐이 되는 것을 작은 아이콘 하나로 알아채라는 것은
 * 무리다 — 실제로 3장 교환(등가교환)은 이미 같은 이유로 전용 컷인이 붙어 있다.
 *
 * 채널 값이 **대상 좌석 id인 것만** 여기 넣는다(`{증강id}:{보유자}` = 대상).
 */
const RELATION_CUTINS: Record<
  string,
  {
    title: string;
    /** 보유자에게 보이는 문구 */
    holder: (other: string) => string;
    /** 대상에게 보이는 문구 */
    target: (other: string) => string;
    ms?: number;
    shake?: ImpactSpec["shake"];
  }
> = {
  full_hand_swap: {
    title: "통째로 바꾸기",
    holder: (o) => `${o}의 손패를 통째로 빼앗았다`,
    target: (o) => `${o}에게 손패를 통째로 빼앗겼다 — 패산에서 새 손을 받는다`,
    ms: 2600,
    shake: 3,
  },
  counter: {
    title: "카운터",
    holder: (o) => `${o}의 선제 리치를 받아쳤다 — 공탁을 대신 물리고 일발을 지웠다`,
    target: (o) => `${o}의 추격 리치 — 공탁을 대납하고 일발이 사라졌다`,
    ms: 2400,
    shake: 2,
  },
  frame_up: {
    title: "누명",
    holder: (o) => `${o}의 바닥에 패를 심었다`,
    target: (o) => `${o}가 내 바닥에 패를 심었다 — 그 패로는 론할 수 없다`,
    ms: 2400,
    shake: 2,
  },
};

/** augmentView에서 지금 살아 있는 지목 관계를 뽑는다 */
function relationsOf(view: PlayerView): Relation[] {
  const out: Relation[] = [];
  const seen = new Set<string>();
  const has = (id: string): boolean => view.players.some((p) => p.id === id);
  const push = (key: string, head: string, from: string, to: string): void => {
    const meta = RELATION_META[head];
    if (meta === undefined) return;
    if (from === to || !has(from) || !has(to)) return;
    // 같은 증강의 같은 관계가 두 채널로 들어와도 선은 하나만 (등 떠밀기의 낙인/발동)
    const dedup = `${head}:${from}:${to}`;
    if (seen.has(dedup)) return;
    seen.add(dedup);
    out.push({ key, from, to, ...meta });
  };

  for (const [key, value] of Object.entries(view.augmentView)) {
    const [head, target] = key.split(":") as [string, string | undefined];
    if (!RELATION_HEADS.has(head)) continue;

    // 값이 객체인 것 — 지목자는 키에, 대상은 값 안에 있다
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const m = value as { by?: string; target?: string };
      if (typeof m.target !== "string") continue;
      push(key, head, typeof m.by === "string" ? m.by : (target ?? ""), m.target);
      continue;
    }
    // 값이 대상 playerId인 것 — `push_riichi:fired:{h}` 처럼 중간 마디가 낀 키도 있어
    // 지목자는 키의 **마지막** 마디에서 읽는다.
    if (typeof value !== "string" || value === "") continue;
    const parts = key.split(":");
    const from = parts[parts.length - 1] ?? "";
    push(key, head, from, value);
  }
  return out;
}

/**
 * 지금 마우스를 올린 관계 — 한쪽 이름표의 표식에 손을 대면 **상대 이름표가 함께
 * 빛난다**. 관계는 두 자리에 걸쳐 있어서, 한쪽만 강조하면 어디로 향하는지 모른다.
 */
const RelationHoverContext = createContext<{
  /** 이 판에 걸린 지목 관계 전부 */
  relations: readonly Relation[];
  hovered: string | null;
  setHovered: (key: string | null) => void;
}>({ relations: [], hovered: null, setHovered: () => undefined });

/**
 * 지목 관계를 이름표에 흘려보내는 공급자. GameTable이 한 번 감싸면 좌석마다 다른
 * 컴포넌트(OpponentStrip·OwnArea)를 지나는 prop 배관 없이 NamePlate가 바로 읽는다.
 */
function RelationProvider({
  view,
  children,
}: {
  view: PlayerView;
  children: React.ReactNode;
}): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);
  const relations = relationsOf(view);
  const value = useMemo(
    () => ({ relations, hovered, setHovered }),
    // relations는 매 렌더 새 배열이라 내용으로 비교한다(키 목록이 곧 내용이다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [relations.map((r) => `${r.key}:${r.from}:${r.to}`).join("|"), hovered],
  );
  return (
    <RelationHoverContext.Provider value={value}>{children}</RelationHoverContext.Provider>
  );
}

/** 이 이름표에 걸린 관계 — 내가 지목한 것과 나를 지목한 것 */
function relationsAt(relations: readonly Relation[], playerId: string): Relation[] {
  return relations.filter((r) => r.from === playerId || r.to === playerId);
}

// ─────────────────────────── 일회성 증강 사건 (컷인) ───────────────────────────

/**
 * **한 번 일어나고 끝나는** 증강 사건 → 전면 컷인 문구.
 *
 * 이 채널들은 "지금 무슨 일이 벌어졌다"를 싣는다. 상태가 아니라 사건이므로 목록에
 * 줄로 쌓아 둘 이유가 없다 — 터지는 순간 크게 보여주고 사라지면 된다.
 * (예전엔 왼쪽 위 목록에 `소환한 패 [3만]` 같은 줄로 남아 국이 끝날 때까지 붙어 있었다.)
 *
 * ⚠ 이 사건들을 **바닥(강) 위의 표식**으로 그리려다 접었다. 무르기·정적의 손·무덤
 * 도굴·한 끗 차이는 전부 그 패가 바닥에서 **빠져나간** 사건이라 표시할 대상이 이미
 * 없고, 채널이 싣는 것도 tileId가 아니라 패 '종류'라 어느 패였는지 특정할 수도 없다.
 * 바닥에 남는 증강 상태는 안개(revealTiles:fog)뿐이고 그건 이미 River가 그린다.
 *
 * 키는 채널 접두다. 더 긴 접두가 먼저 맞는다(`bottom_deal:armed` > `bottom_deal`).
 */
const AUG_EVENTS: Record<
  string,
  {
    title: string;
    sub: string;
    augId: string;
    tone?: CutInTone;
    shake?: ImpactSpec["shake"];
    /** 컷인이 떠 있는 시간(ms). 기본 2000 — 패가 많아 읽을 게 많으면 늘린다 */
    ms?: number;
  }
> = {
  // 소환은 **발동 알림 하나뿐**이다. 예전에는 도착 시점의 `conjure_draw:done`
  // ("소환 성공")이 따로 있어 한 번의 소환에 컷인이 두 번 터졌다 —
  // 2026-08-15 사용자 지시로 도착 알림을 없앴다(콘텐츠 쪽 채널도 함께 삭제).
  conjure_draw: { title: "소환", sub: "다음 쯔모로 이 패를 부른다", augId: "conjure_draw" },
  three_dragons_will: { title: "삼원패의 의지", sub: "삼원패가 손으로 걸어 들어온다", augId: "three_dragons_will" },
  haitei_lord: { title: "해저의 주인", sub: "마지막 한 장을 손에 넣었다", augId: "haitei_lord" },
  off_by_one: { title: "한 끗 차이", sub: "한 끗을 비틀어 손을 맞췄다", augId: "off_by_one" },
  // 무덤 도굴만 전용 톤 — 바닥에서 패가 걸어 나오는 순간이 이 증강의 전부다
  grave_rob: {
    title: "무덤 도굴",
    sub: "바닥에 묻힌 패로 화료했다",
    augId: "grave_rob",
    tone: "grave",
    shake: 3,
  },
  // 무르기는 '버린 패'가 아니라 **방금 쯔모한 패**를 패산 밑으로 돌려보낸다.
  // 문구가 "방금 버린 패를 도로 집었다"였던 탓에 컷인에 뜬 패가 자기 버림패로 읽혔다
  // (2026-08-01 사용자 보고: "방금 버린 패가 계속 뜸").
  take_back: { title: "무르기", sub: "쯔모패를 패산 맨 밑으로 돌려보내고 다시 뽑았다", augId: "take_back" },
  silent_swap: { title: "정적의 손", sub: "상대의 바닥에서 소리 없이 가져갔다", augId: "silent_swap" },
  foresight: { title: "예지", sub: "앞을 보고 손을 다시 짰다", augId: "foresight" },
  palm_flip: { title: "손바닥 뒤집기", sub: "판이 통째로 뒤집힌다", augId: "palm_flip" },
  tile_split: { title: "패 쪼개기", sub: "한 장이 두 장으로 갈라졌다", augId: "tile_split" },
  // 밥상 뒤엎기 — 반납한 배패 13장은 **전원 공개**가 대가다. 그런데 채널만 실려 있고
  // 그리는 곳이 없어 아무에게도 안 보였다(2026-08-02 사용자 보고). 상태가 아니라
  // 사건이므로 국 내내 붙여 두지 않고 컷인으로 잠깐 크게 보여주고 지운다.
  table_flip: {
    title: "밥상 뒤엎기",
    sub: "이 손패를 통째로 산에 반납했다",
    augId: "table_flip",
    shake: 3,
    ms: 3600, // 13장을 훑을 시간
  },
  meld_dissolve: { title: "후로 해체", sub: "이미 울어 둔 묶음이 풀렸다", augId: "meld_dissolve" },
  // 뒤집힌 모래시계 — 판이 가장 크게 뒤집히는 순간인데 신호가 이름표 pill "4장"
  // 하나뿐이었다. 전원이 유국을 기다리는데 국이 안 끝나고 한 사람만 계속 뽑는다.
  // (ROUND_SETTLED 인터셉터라 액션 컷인 경로를 타지 않는다.)
  hourglass: {
    title: "뒤집힌 모래시계",
    sub: "유국이 취소됐다 — 왕패에서 넘어온 패를 혼자 뽑는다",
    augId: "hourglass",
    shake: 3,
    ms: 2600,
  },
  // 염색·연금술사 — 채널 값이 "man3→pin3" 꼴이라 컷인에 **바뀌기 전과 후**가 나란히 뜬다
  // (augEventTiles가 화살표를 풀어 두 장으로 만든다). 패는 손패 안에 남으므로 어디에
  // 있는지는 안 새고, 상대가 읽는 것은 "무엇이 무엇이 됐다"는 사실뿐이다 — 설명이
  // 약속한 그대로다. 발동 순간에만 의미가 있는 사건이라 상태 뱃지가 아니라 컷인이다.
  // (남은 횟수는 별도 채널 `{id}:left`로 이름표 pill이 이미 그린다 — 겹치지 않는다.)
  tile_dyeing: { title: "염색", sub: "손패 한 장이 다른 무늬로 물들었다", augId: "tile_dyeing" },
  alchemist: { title: "연금술사", sub: "손패 한 장의 숫자가 한 칸 움직였다", augId: "alchemist" },
  "bottom_deal:armed": {
    title: "밑장빼기",
    sub: "다음에 뽑을 패를 패산 맨 밑에서 빼온다",
    augId: "bottom_deal",
  },
};

/**
 * **국이 시작하는 순간 저절로 켜지는** 증강 하나 — 그 국 시작 컷인 재료.
 *
 * 초읽기·눈먼 총알·반전은 뽑는 순간 무장해 다음 국 하나에만 켜진다(content/util
 * `armOnNextRound`). 켜졌다는 사실은 이름표 pill에만 있어서, 정작 규칙이 바뀐 그 국을
 * 모른 채 두는 일이 잦았다 — 특히 초읽기는 모르고 있으면 5초가 그냥 지나간다
 * (2026-08-17 사용자 요청). 그래서 국 배너 직후에 한 번 크게 세운다.
 *
 * 사건이 아니라 **국 내내 켜져 있는 상태**라 AUG_EVENTS 표에는 넣지 않는다(그쪽은
 * "터지고 끝나는" 채널 전용이고, 여기 셋은 pill·뱃지가 그 국 내내 함께 그린다).
 * 중복 재생은 같은 augEvents 서명 집합이 막는다.
 */
type ArmedRoundNotice = {
  key: string;
  raw: unknown;
  title: string;
  augId: string;
  line: string;
  /** 컷인이 떠 있는 시간(ms) */
  ms: number;
};

function armedRoundNotices(view: PlayerView): ArmedRoundNotice[] {
  const av = view.augmentView ?? {};
  const out: ArmedRoundNotice[] = [];
  // 초읽기 — 제한이 테이블 전원에게 같아서 채널에 보유자가 없다.
  // ⚠ 이 컷인만 유독 짧다. 서버의 5초 시계는 프롬프트를 보낸 순간부터 흐르는데
  // (HumanAgent.decideFor) 새 국 배너 1.6초가 이미 그 앞에 서 있어서, 여기서 길게
  // 잡으면 오야의 첫 결정이 연출에 다 먹힌다. 컷인 자체는 pointer-events:none이라
  // 그 동안에도 손패는 누를 수 있지만, 가려 두는 시간은 짧을수록 좋다.
  const sec = av["time_pressure"];
  if (typeof sec === "number" && sec > 0) {
    out.push({
      key: "time_pressure",
      raw: sec,
      title: "초읽기",
      augId: "time_pressure",
      line: `이번 국 전원의 모든 결정이 ${sec}초 제한이다`,
      ms: 1600,
    });
  }
  for (const [key, raw] of Object.entries(av)) {
    if (raw !== true) continue;
    const [head, tail] = key.split(":") as [string, string | undefined];
    if (tail === undefined || !view.players.some((p) => p.id === tail)) continue;
    const who = playerNameById(view, tail);
    if (head === "blind_ron") {
      out.push({
        key,
        raw,
        title: "눈먼 총알",
        augId: head,
        line: `${who} — 이번 국의 모든 론이 무작위 한 명에게 청구된다`,
        ms: 2400,
      });
    } else if (head === "sign_flip") {
      out.push({
        key,
        raw,
        title: "반전",
        augId: head,
        line: `${who} — 이번 국 이 사람의 점수 부호가 뒤집힌다`,
        ms: 2400,
      });
    }
  }
  return out;
}

/**
 * 사건 컷인 중복 방지 서명 — `채널=값@국`.
 *
 * ⚠ **국 키는 "마지막으로 실제 시작된 국"(bannerShown.roundKey)이어야 한다.**
 * 뷰의 국 번호를 쓰면 안 된다: `RoundSettled` 리듀서가 정산과 동시에 **다음 국의
 * 번호·본장**을 미리 올려 두므로(flowEvents.ts), `phase === "round.over"` 뷰는 이미
 * 다음 국을 가리킨다. 그 뷰에서 서명을 다시 만들면 **국 안에서 이미 보여 준 사건이
 * 전부 새 사건으로 보여** 컷인이 한 번 더 재생됐다 —
 * 그것도 이 뷰가 `roundOver` 메시지보다 **먼저** 도착하므로(HanchanController:
 * broadcastViews → notifyRoundOver) 화료 컷인 앞에 끼어들었다.
 * 2026-08-01 사용자 보고 "론 나오기 전에 쓰지도 않은 증강 연출이 2번 나온다"가 이것이다
 * (소환은 채널이 둘 — `conjure_draw`·`conjure_draw:done` — 이라 정확히 2번 재생됐다).
 *
 * `shown.roundKey`는 진짜 다음 국이 시작될 때만 갱신되고, 그때 augEvents 집합도 함께
 * 비워진다 — 그래서 국이 넘어가면 같은 사건이 다시 정상적으로 터진다.
 */
function augEventSig(key: string, raw: unknown, roundKey: string): string {
  return `${key}=${JSON.stringify(raw)}@${roundKey}`;
}

/** 채널 키에 맞는 사건 정의 — 더 긴 접두가 이긴다 */
type AugEventDef = {
  prefix: string;
  title: string;
  sub: string;
  augId: string;
  tone?: CutInTone;
  shake?: ImpactSpec["shake"];
  ms?: number;
};

function augEventFor(key: string): AugEventDef | null {
  let best: AugEventDef | null = null;
  for (const [prefix, def] of Object.entries(AUG_EVENTS)) {
    if (!key.startsWith(`${prefix}:`)) continue;
    if (best !== null && best.prefix.length >= prefix.length) continue;
    best = { prefix, ...def };
  }
  return best;
}

/**
 * 사건 값에서 함께 띄울 패를 뽑는다.
 * 값의 모양은 셋 — 패 키 하나("man5") · TileKind 객체 배열(밥상 뒤엎기의 반납 손패) ·
 * kind/from/to를 품은 객체(패 쪼개기 등).
 */
function augEventTiles(raw: unknown): TileKind[] {
  if (typeof raw === "string") {
    // "man3→pin3" — 염색·연금술사가 **바꾸기 전→후**를 한 문자열에 싣는다.
    // 화살표를 먼저 풀어야 한다: 통째로 parseKindKey에 넣으면 null이라 컷인에 패가
    // 한 장도 안 뜨고, 무엇이 무엇이 됐는지가 문구에만 남는다.
    if (raw.includes("→")) {
      return raw
        .split("→")
        .map(parseKindKey)
        .filter((k): k is TileKind => k !== null);
    }
    const k = parseKindKey(raw);
    return k === null ? [] : [k];
  }
  if (Array.isArray(raw)) {
    // 밥상 뒤엎기가 공개하는 반납 손패 13장 — 서버가 보낸 손패 순서 그대로면 무늬가 뒤섞여
    // 있어 한눈에 읽히지 않았다(2026-08-06 사용자 요청). 손패처럼 정렬해서 보여준다.
    return raw
      .filter(
        (k): k is TileKind =>
          k !== null && typeof k === "object" && typeof (k as TileKind).suit === "string",
      )
      .sort((a, b) => kindOrder(a) - kindOrder(b));
  }
  if (raw === null || typeof raw !== "object") return [];
  const m = raw as { kind?: unknown; from?: unknown; to?: unknown };
  const out: TileKind[] = [];
  for (const v of [m.kind, m.from]) {
    if (typeof v !== "string") continue;
    const k = parseKindKey(v);
    if (k !== null) out.push(k);
  }
  if (Array.isArray(m.to)) {
    for (const v of m.to) {
      if (typeof v !== "string") continue;
      const k = parseKindKey(v);
      if (k !== null) out.push(k);
    }
  }
  return out;
}

/**
 * `augEventTiles`가 만든 줄에서 **"바뀌기 전"이 몇 장까지인가** — 그 자리에 "→"가 들어간다.
 *
 * 값이 "man6→man7"(염색·연금술사)이거나 `{kind, to:[…]}`(분열 등)이면 앞쪽이 원래 패,
 * 뒤쪽이 새 패다. 화살표 없이 붙여 놓으면 "6만 7만"이라는 **두 장짜리 손패**로 읽힌다
 * (2026-08-12 사용자 보고). 가를 자리가 없으면 undefined.
 */
function augEventArrowAt(raw: unknown): number | undefined {
  if (typeof raw === "string") {
    if (!raw.includes("→")) return undefined;
    const before = raw.split("→")[0];
    if (before === undefined || parseKindKey(before) === null) return undefined;
    return 1;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const m = raw as { kind?: unknown; from?: unknown; to?: unknown };
  if (!Array.isArray(m.to) || m.to.length === 0) return undefined;
  const before = [m.kind, m.from].filter(
    (v) => typeof v === "string" && parseKindKey(v) !== null,
  ).length;
  return before > 0 ? before : undefined;
}

/**
 * 전용 사건 컷인을 가진 증강 id.
 *
 * 이 증강들은 **발동 결과**를 자기 컷인으로 보여준다. 그런데 액티브 액션은 서버가
 * `actionFx`도 함께 보내므로, 걸러 내지 않으면 한 번의 발동에 컷인이 두 번 뜬다
 * ("증강 발동" → "무르기"). 2단계 액션의 무장 컷인을 서버가 지우는 것
 * (HanchanController FX_SILENT_ACTION_TYPES)과 같은 이유다.
 */
const AUG_EVENT_AUG_IDS: ReadonlySet<string> = new Set(
  Object.values(AUG_EVENTS).map((d) => d.augId),
);

/** 이 컷인들이 대신 보여주는 채널 — 증강 정보 로그에는 남기지 않는다 */
const AUG_EVENT_HEADS: ReadonlySet<string> = new Set([
  ...Object.keys(AUG_EVENTS).map((k) => k.split(":")[0] ?? k),
  // 표를 만들기 전부터 전용 컷인이 있던 둘 — 로그에 다시 찍히지 않게 함께 넣는다
  "void_kan", // 성립하지 않는 깡
  "spy", // 스파이 적발
  "hand_swap3", // 등가교환 결과 통보 (SWAP3_NOTICE_KEY — 전용 컷인이 보여준다)
]);

// ─────────────────────────── 증강 정보 로그 ───────────────────────────

/**
 * `PlayerView.augmentView`(증강 정보 채널)를 사람이 읽을 수 있는 줄로 바꾼다.
 *
 * ⚠ 여기 남는 것은 **어디에도 자리를 못 잡은 잔여 정보**뿐이어야 한다.
 * 증강 정보의 제자리는 "그 정보가 가리키는 대상 위"다 —
 * 오름패는 상대 손패 위(WaitsBadge), 위험패는 내 손패 위(hand-danger),
 * 뒷도라는 중앙 도라 표시패 아래, 무장해제는 이름표의 증강 pill(aug-pill-locked),
 * 내 상태는 손패 옆 뱃지 줄(ActiveInfoBadges). 새 증강을 붙일 때도 그 순서로 찾고,
 * 정말 자리가 없을 때만 이 로그로 내린다.
 *
 * 예전에는 이 목록이 화면 **왼쪽 위에 상시로 펼쳐져** 왼쪽 상대(상가)를 덮었다.
 * 지금은 우상단 📜 버튼 뒤에 접혀 있고, 기본은 닫힘이다.
 */
function augmentLogRows(
  view: PlayerView,
  catalog: Record<string, AugmentCatalogEntry>,
): JSX.Element[] {
  const rows: JSX.Element[] = [];
  const entries = Object.entries(view.augmentView);
  if (entries.length === 0) return rows;

  const me = view.playerId;
  // 채널 head → 사람이 읽는 이름 (카탈로그에 없는 짧은 키를 위해)
  const HEAD_NAME: Record<string, string> = {
    ura: "이면투시(뒷도라)",
    scapegoat: "덤터기",
    let_it_ride: "판돈 굴리기",
    mine: "지뢰 매설",
    blood_contract: "핏빛 계약",
    all_or_nothing: "모 아니면 도",
    take_back: "무르기",
  };
  const nameOf = (h: string): string => HEAD_NAME[h] ?? catalog[h]?.name ?? h;
  const tileRow = (k: string, tag: string, note: string, kinds: TileKind[]): JSX.Element => (
    <div key={k} className="auglog-row">
      <span className="auglog-tag">{tag}</span>
      {note !== "" ? <span>{note}</span> : null}
      <span className="auglog-tiles">
        {kinds.map((kind, i) => <TileImg key={i} tile={{ kind }} size="mini" />)}
      </span>
    </div>
  );
  const textRow = (k: string, tag: string, note: string, tagClass = ""): JSX.Element => (
    <div key={k} className="auglog-row">
      <span className={`auglog-tag ${tagClass}`}>{tag}</span>
      <span>{note}</span>
    </div>
  );
  const kindsOf = (arr: unknown): TileKind[] =>
    Array.isArray(arr)
      ? (arr as string[]).map(parseKindKey).filter((k): k is TileKind => k !== null)
      : [];
  /** 이 문자열이 이 판의 좌석 id인가 — 폴백이 "p2"를 날것으로 찍는 것을 막는다 */
  const isPlayerId = (s: string): boolean => view.players.some((p) => p.id === s);

  /** 값이 **좌석 id**인 채널 — 폴백에 맡기면 `p2` 가 그대로 찍힌다(2026-08-01). */
  const PLAYER_VALUE: Record<string, string> = {
    riichi_upgrade: "이중 선언",
  };

  for (const [key, value] of entries) {
    const [head, target] = key.split(":") as [string, string | undefined];
    // `head:target` 의 target이 **좌석이 아닌** 채널도 있다(cooldown:{증강id} 등).
    // 그때 playerNameById는 받은 문자열을 그대로 돌려주므로, 거르지 않으면
    // `dora_afterimage` 같은 내부 id가 사람 이름 자리에 찍힌다(2026-08-06 제보).
    const who = target !== undefined && isPlayerId(target) ? playerNameById(view, target) : "";

    // ── 다른 곳에 제자리가 있는 채널은 여기 찍지 않는다 ──────────────────
    // 뒷도라: 중앙 도라 표시패 아래(center-ura-peek)
    if (head === "ura") continue;
    // 오름패 간파: 상대 손패 위 WaitsBadge
    if (head === "waits" || head === "open_riichi_reveal" || head === "free_declare_waits") continue;
    // 위험패: 내 손패 위 ⚠ (hand-danger)
    if (head === "danger_sense") continue;
    // 삼세 예지: 손패 위 '다음 쯔모' 스트립
    if (head === "triple_peek") continue;
    // 미래를 보는 자 — 가져온 패는 뱃지 줄(ActiveInfoBadges), 쌓인 판수는 이름표 pill
    if (head === "future_sight") continue;
    // 스파이가 찍은 패: 뱃지 줄
    if (head === "spy") continue;
    // 안개가 걷어낸 강의 마지막 패: 강(River)이 직접 그린다
    if (head === "revealTiles" && (target === "fog" || target === "future")) continue;
    // 다음 국으로 넘어가는 것(미련·귀환)은 국 결과창이 보여준다 — 그게 쓸모 있는 순간이다
    if (head === "regret" || head === "honor_return") continue;
    // 상대의 봉인·투시된 실제 패는 **그 상대의 손패 옆**(SealBadge)에 띄운다.
    // discardLockReveal은 봉인술사 전용 채널 — hand_swap3와 같은 `revealTiles:{target}`
    // 키를 동시에 쓰면 같은 보유자가 두 증강을 함께 들었을 때 서로 덮어써 봉인 판정
    // 자체가 틀어지던 문제가 있어 분리했다(2026-08 감사).
    if (head === "sealed" || head === "revealTiles" || head === "discardLockReveal") continue;
    // 잔량·게이지·발동 여부는 그 사람의 이름표 증강 pill이 대신 보여준다.
    if (PILL_OWNED_HEADS.has(head)) continue;
    // 남은 사용 횟수(`uses:{증강id}`)도 그 증강의 pill이 "n회"로 직접 보여준다.
    // 여기 남겨 두면 사람 이름 자리에 증강 id가, 값 자리에 `{left:1,total:2}`가 찍힌다.
    if (head === "uses") continue;
    // 내부 쿨다운(`cooldown:{증강id}`)은 그 증강의 pill이 "N국"으로 직접 보여준다.
    // 여기 남겨 두면 사람 이름 자리에 증강 id가, 값 자리에 "스택 0"이 찍힌다.
    if (head === "cooldown") continue;
    // 선발동형이 끝났다는 표식(`spent:{증강id}:{좌석}`)도 그 증강의 pill이 "종료"로 그린다.
    if (head === "spent") continue;
    // "A가 B를 지목했다"는 관계는 양쪽 이름표 위의 표식(np-rel)이 보여준다.
    // 나에게 걸린 것의 **의미**("5판 미만 화료 불가")는 표식으로 못 쓰므로 뱃지 줄에 남는다.
    if (RELATION_HEADS.has(head)) continue;
    // 한 번 일어나고 끝나는 사건은 터지는 순간 전면 컷인으로 크게 보여준다(AUG_EVENTS).
    // 상태가 아니라 사건이라 국이 끝날 때까지 줄로 쌓아 둘 이유가 없다.
    if (AUG_EVENT_HEADS.has(head)) continue;
    // 아래는 손패 옆 뱃지 줄(ActiveInfoBadges)이 **전원 것을** 크게 띄운다 — 그대로 중복이다.
    if (head === "hidden_river" || head === "riichi_seal") continue;

    if (head === "cornucopia") {
      /*
       * 수상한 주사위 — 이 사람에게 쏟아진 증강 2개.
       * 쏟아진 것들은 그 사람 이름표에 pill로 서 있고, 주사위 자신은 이름표에서 뺐다
       * (칸을 세 칸 먹어 판을 가렸다). "이 둘이 주사위에서 나왔다"는 출처만 여기 남긴다.
       */
      const ids = Array.isArray(value)
        ? value.filter((x): x is string => typeof x === "string")
        : [];
      if (ids.length === 0) continue;
      const names = ids.map((id) => catalog[id]?.name ?? id).join(", ");
      rows.push(textRow(key, nameOf(head), `${who !== "" ? `${who} — ` : ""}${names}`));
    } else if (head === "tenpai_scan") {
      /*
       * 천리안 — 스캔한 순간 텐파이였던 상대 목록 (보유자 전용 채널).
       * 갱신되지 않는 스냅샷이라 국이 끝날 때까지 그대로 떠 있다 — 몇 순 기준인지
       * 밝히지 않으면 시간이 지날수록 **틀린 정보를 확신 있게** 보여 주게 된다.
       */
      const snap = readScanSnapshot(value, "players");
      const names = snap.items.map((id) => playerNameById(view, id)).filter((n) => n !== "");
      const asOf = snap.turn === null ? "" : ` (${snap.turn}순 기준)`;
      rows.push(
        textRow(
          key,
          "천리안",
          `${names.length > 0 ? `텐파이: ${names.join(", ")}` : "텐파이인 상대 없음"}${asOf}`,
        ),
      );
    } else if (PLAYER_VALUE[head] !== undefined) {
      // 값이 좌석 id인 채널 — 이름으로 푼다.
      if (typeof value !== "string" || value === "") continue;
      rows.push(textRow(key, PLAYER_VALUE[head] ?? head, `${who} → ${playerNameById(view, value)}`));
    } else if (typeof value === "boolean") {
      // 발동 사실만 싣는 채널(진짜 용·개벽·배짱 등) — 예전엔 어떤 분기에도 안 걸려
      // 채널을 쐈는데 **화면에 아무것도 안 떴다**(2026-08-01 감사).
      if (!value) continue;
      rows.push(textRow(key, nameOf(head), `${who !== "" ? `${who} ` : ""}발동`));
    } else if (typeof value === "number") {
      rows.push(textRow(key, nameOf(head), `${who !== "" ? `${who} — ` : ""}스택 ${value}`));
    } else if (typeof value === "string") {
      // 폴백 안전망 — 내부값이 그대로 새어나가지 않게 좌석 id·패 키·roundKey를 먼저 푼다.
      const asKind = parseKindKey(value);
      if (isPlayerId(value)) {
        rows.push(textRow(key, nameOf(head), `${who !== "" ? `${who} → ` : ""}${playerNameById(view, value)}`));
      } else if (asKind !== null) {
        rows.push(tileRow(key, nameOf(head), who, [asKind]));
      } else {
        const clean = /^\d+-\d+-\d+$/.test(value) ? "선언" : value;
        rows.push(textRow(key, nameOf(head), `${who !== "" ? `${who} ` : ""}${clean}`));
      }
    }
  }

  return rows;
}

/** 사건 기록 줄의 시각 — 시:분:초. 국 안에서 순서만 가리면 되므로 날짜는 뺀다. */
function logTime(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 기록 한 줄. 톤을 그대로 클래스로 실어 색을 나눈다 (화료=금, 리치=붉음, 후로=초록…).
 * 컷인이 지나간 자리라 문구는 이미 사람이 읽는 말이다 — 다시 손볼 것이 없다.
 */
function LogEventRow({ ev }: { ev: LogEvent }): JSX.Element {
  return (
    <div className={`auglog-ev auglog-ev-${ev.channel} auglog-tone-${ev.tone}`}>
      <span className="auglog-time">{logTime(ev.at)}</span>
      <span className="auglog-ev-text">{ev.text}</span>
      {ev.sub !== undefined ? <span className="auglog-ev-sub">{ev.sub}</span> : null}
    </div>
  );
}

/**
 * 📜 기록 — 우상단 버튼 뒤에 접혀 있다(기본 닫힘).
 * 열림 상태는 GameTable이 들고 있다(설정 패널과 같은 자리라 둘 중 하나만 열린다).
 *
 * 두 칸으로 나뉜다.
 * - **기록**: 일어난 순서대로 쌓인 사건(후로·리치·화료·증강 발동). 지워지지 않는다.
 * - **지금 상태**: `augmentView`가 지금 이 순간 들고 있는 잔여 정보(augmentLogRows).
 *   상태는 바뀌면 사라지는 게 맞다 — 그래서 기록과 섞지 않고 아래에 따로 둔다.
 */
function AugmentLog({
  view,
  catalog,
  events,
  pastRounds,
  open,
  onToggle,
}: {
  view: PlayerView;
  catalog: Record<string, AugmentCatalogEntry>;
  events: LogEvent[];
  /** 지나간 국의 정산 — 결과 화면을 읽기 전용으로 다시 연다 */
  pastRounds?: PastRound[];
  open: boolean;
  onToggle: () => void;
}): JSX.Element | null {
  const rows = useMemo(() => augmentLogRows(view, catalog), [view, catalog]);
  /** 지금 다시 열어 둔 지난 국 (없으면 null) */
  const [reopened, setReopened] = useState<PastRound | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Esc 로 닫고, 열면 포커스를 안으로, 닫으면 원래 자리로 되돌린다 (감사 §6-5).
  const panelRef = useDismissablePanel(onToggle);
  // 열 때·새 사건이 들어올 때 맨 아래(가장 최근)로. 스크롤백은 위로 올리면 그대로 있다.
  useEffect(() => {
    const el = bodyRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [open, events.length]);

  /*
   * 뱃지(안 본 사건 수)는 없다 (2026-08-08 사용자 지시). 기록은 놓친 걸 되짚어 보는
   * 자리지 재촉하는 자리가 아니다 — 숫자가 붙어 있으면 판을 보는 중에 눈이 그리 간다.
   */

  const past = pastRounds ?? [];
  if (rows.length === 0 && events.length === 0 && past.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={`icon-btn auglog-btn${open ? " auglog-btn-on" : ""}`}
        onClick={onToggle}
        title="기록 — 후로·리치·화료·증강 발동"
        aria-label="기록 열기"
      >
        📜
      </button>
      {/* 화면 고정 표면은 전부 body 포털이다 — 이유는 FIXED_SURFACE_NOTE 참고 */}
      {open
        ? createPortal(
            <div className="auglog" role="dialog" aria-label="기록" tabIndex={-1} ref={panelRef}>
              <div className="auglog-head">
                기록
                <button type="button" className="auglog-close" onClick={onToggle} title="닫기">✕</button>
              </div>
              <div className="auglog-body" ref={bodyRef}>
                {events.length > 0 ? (
                  <>
                    {events.map((ev, i) => (
                      <Fragment key={ev.key}>
                        {/* 국이 바뀌는 자리에만 구분선 — 매 줄에 국 이름을 붙이면 읽는 눈이 지친다 */}
                        {i === 0 || events[i - 1]?.round !== ev.round ? (
                          <div className="auglog-round">{ev.round}</div>
                        ) : null}
                        <LogEventRow ev={ev} />
                      </Fragment>
                    ))}
                  </>
                ) : (
                  <div className="auglog-empty">아직 기록된 사건이 없습니다.</div>
                )}
                {rows.length > 0 ? (
                  <>
                    <div className="auglog-sec">지금 상태</div>
                    {rows}
                  </>
                ) : null}
                {/* 지난 국 정산 — 결과 화면은 스스로 닫히고 다시 여는 길이 없어서,
                    서버 상한(최대 20초) 안에 못 읽으면 그 국의 역·판·부·증감이
                    영구히 사라졌다. 여기서 그대로 다시 연다. */}
                {past.length > 0 ? (
                  <>
                    <div className="auglog-sec">지난 국 정산</div>
                    {past.map((r, i) => (
                      <button
                        key={`${r.label}:${i}`}
                        type="button"
                        className="auglog-past"
                        onClick={() => setReopened(r)}
                      >
                        <span className="auglog-past-round">{r.label}</span>
                        <span className="auglog-past-kind">
                          {r.result.outcome === "win"
                            ? "화료"
                            : r.result.outcome === "draw"
                              ? "유국"
                              : "도중 유국"}
                        </span>
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
      {reopened !== null
        ? createPortal(
            <RoundResultPanel
              result={reopened.result}
              view={view}
              catalog={catalog}
              deadlineAt={null}
              historical
              onClose={() => setReopened(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

// ─────────────────────────── 증강 테스트 패널 (관리자) ───────────────────────────

/**
 * 증강 테스트 패널 — 구현된 증강 전부를 나열하고, 누르면 그 자리에서 획득시킨다.
 *
 * - 대상 선택으로 봇에게도 줄 수 있다 (상대 시점에서 작동하는 증강 확인용).
 * - "새 판"은 지금 보유한 증강 그대로 처음부터 다시 시작한다 — 배패·국 시작에
 *   개입하는 증강은 국 도중에 설치하면 이번 국을 되돌리지 못하기 때문이다.
 * - "초기화"는 증강 없는 백지 상태로 새 판을 연다 (엔진째 새로 만들어 잔재 없음).
 */
function SandboxPanel(props: {
  view: PlayerView;
  catalog: Record<string, AugmentCatalogEntry>;
  sandbox: SandboxMessage;
  /** 지금 내가 조종 중인 봇 좌석 (없으면 null) */
  controlling: string | null;
  onGrant?: (augmentId: string, target: string) => void;
  onReset?: (
    augments: Record<string, string[]>,
    hands?: Record<string, string[]>,
  ) => void;
  onViewAs?: (seat: string) => void;
  onBotRules?: (rules: SandboxBotRules) => void;
  onControl?: (enabled: boolean) => void;
  onToast?: (text: string) => void;
}): JSX.Element {
  const { view, catalog } = props;
  const [open, setOpen] = useState(false);
  /** 열려 있는 탭 — 증강 지급 / 손패 지정 / 봇 설정 */
  const [tab, setTab] = useState<"augment" | "hand" | "bot">("augment");
  // 내 실제 좌석은 sandbox.seat — 시점을 상대로 바꾸면 view.playerId는 그 상대가 되므로
  // "나"·기본 대상 판별에는 view.playerId가 아니라 sandbox.seat을 써야 한다.
  const selfId = props.sandbox.seat;
  // 지금 보고 있는 시점(관찰 대상 좌석 또는 SPECTATOR_ID) — 서버가 보낸 뷰가 진실.
  const viewingSeat = view.playerId;
  const [target, setTarget] = useState<string>(selfId);
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  // 대상 좌석이 사라지는 경우는 없지만(4인 고정), 관전 전환 등으로 어긋나면 나로 되돌린다
  const targetId = view.players.some((p) => p.id === target) ? target : selfId;
  const owned = new Set(view.players.find((p) => p.id === targetId)?.augments ?? []);

  const all = Object.values(catalog);
  const q = query.trim().toLowerCase();
  const filtered = all
    .filter(
      (c) =>
        q === "" ||
        c.name.toLowerCase().includes(q) ||
        c.id.includes(q) ||
        c.description.toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  /** 지금 좌석별 보유 증강 (새 판에 그대로 옮겨 심을 목록) */
  const currentAugments = (): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const p of view.players) if (p.augments.length > 0) out[p.id] = [...p.augments];
    return out;
  };

  // ── 손패 지정 ──
  // 서버가 마지막으로 적용한 지정을 초기값으로 들고, 편집은 로컬에서 하다가
  // "이 손패로 새 판"에서 한 번에 넘긴다 (배패는 국 시작에만 개입할 수 있다).
  const [handDraft, setHandDraft] = useState<Record<string, string[]>>(
    () => props.sandbox.hands,
  );
  const handOf = (seat: string): string[] => handDraft[seat] ?? [];
  const setHandOf = (seat: string, keys: string[]): void =>
    setHandDraft((prev) => ({ ...prev, [seat]: keys }));
  const addHandTile = (key: string): void => {
    const cur = handOf(targetId);
    if (cur.length >= SANDBOX_HAND_MAX) return;
    if (cur.filter((k) => k === key).length >= 4) return; // 한 종류는 4장뿐
    setHandOf(targetId, [...cur, key]);
  };
  const removeHandTileAt = (index: number): void =>
    setHandOf(
      targetId,
      handOf(targetId).filter((_, i) => i !== index),
    );
  /** 지금 화면에 보이는 그 좌석의 손패를 그대로 담는다 (거기서 몇 장만 고치기 좋다) */
  const copyVisibleHand = (): void => {
    const ids = view.zones[`hand:${targetId}`]?.tileIds ?? [];
    const keys = ids
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined)
      .map((k) => `${k.suit}${k.rank}`);
    if (keys.length === 0) {
      props.onToast?.("그 좌석의 손패가 지금 화면에 보이지 않습니다 (시점을 옮겨 보세요)");
      return;
    }
    setHandOf(targetId, keys.slice(0, SANDBOX_HAND_MAX));
  };

  // ── 봇 설정 ──
  const botRules = props.sandbox.botRules;
  const toggleBotRule = (key: keyof SandboxBotRules): void =>
    props.onBotRules?.({ ...botRules, [key]: botRules[key] !== true });

  const grant = (c: AugmentCatalogEntry): void => {
    if (owned.has(c.id)) return;
    props.onGrant?.(c.id, targetId);
    props.onToast?.(`${c.name} 획득 — ${playerNameById(view, targetId)}`);
  };

  const detail = detailId !== null ? catalog[detailId] : undefined;

  if (!open) {
    return (
      <button className="sbx-fab" onClick={() => setOpen(true)} title="증강 테스트 패널 열기">
        🧪 증강
      </button>
    );
  }

  return (
    <div className="sbx">
      <header className="sbx-head">
        <span className="sbx-title">🧪 증강 테스트</span>
        <span className="sbx-mode">{props.sandbox.mode === "tonpuu" ? "동풍전" : "반장전"}</span>
        <span className="home-spacer" />
        <button className="sbx-x" onClick={() => setOpen(false)} title="닫기">✕</button>
      </header>

      <div className="sbx-actions">
        <button
          className="sbx-btn"
          onClick={() => {
            props.onReset?.(currentAugments(), handDraft);
            props.onToast?.("증강·손패 지정을 유지한 채 새 판을 시작합니다");
          }}
          title="지금 보유한 증강과 손패 지정 그대로 첫 국부터 다시 시작"
        >
          ↻ 새 판 (설정 유지)
        </button>
        <button
          className="sbx-btn sbx-btn-danger"
          onClick={() => {
            setHandDraft({});
            props.onReset?.({}, {});
            props.onToast?.("증강·손패 지정을 모두 비우고 새 판을 시작합니다");
          }}
          title="증강·손패 지정을 모두 제거하고 백지 상태로 다시 시작"
        >
          ⟲ 초기화
        </button>
      </div>

      {props.onViewAs !== undefined ? (
        <div className="sbx-target sbx-viewas">
          <span className="sbx-label">시점</span>
          {view.players.map((p) => (
            <button
              key={p.id}
              className={p.id === viewingSeat ? "sbx-seat on" : "sbx-seat"}
              onClick={() => {
                props.onViewAs?.(p.id);
                if (p.id !== selfId) {
                  props.onToast?.(`${playerNameById(view, p.id)} 시점으로 관찰합니다`);
                }
              }}
              title={p.id === selfId ? "내 시점 (조작 가능)" : "이 좌석이 보는 화면으로 관찰"}
            >
              {p.id === selfId ? "나" : playerName(view, p)}
            </button>
          ))}
          <button
            className={viewingSeat === SPECTATOR_ID ? "sbx-seat on" : "sbx-seat"}
            onClick={() => {
              props.onViewAs?.(SPECTATOR_ID);
              props.onToast?.("전체 공개 시점으로 관찰합니다");
            }}
            title="모든 손패·도라가 공개된 관전 시점"
          >
            전체공개
          </button>
        </div>
      ) : null}

      <div className="sbx-target">
        <span className="sbx-label">대상</span>
        {view.players.map((p) => (
          <button
            key={p.id}
            className={p.id === targetId ? "sbx-seat on" : "sbx-seat"}
            onClick={() => setTarget(p.id)}
          >
            {p.id === selfId ? "나" : playerName(view, p)}
            {p.augments.length > 0 ? <span className="sbx-seat-n">{p.augments.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="sbx-tabs">
        {([
          ["augment", "증강 지급"],
          ["hand", "손패 지정"],
          ["bot", "봇 설정"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "sbx-tab on" : "sbx-tab"}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "hand" && handOf(targetId).length > 0 ? (
              <span className="sbx-seat-n">{handOf(targetId).length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "hand" ? (
        <SandboxHandEditor
          hand={handOf(targetId)}
          targetName={targetId === selfId ? "나" : playerNameById(view, targetId)}
          onAdd={addHandTile}
          onRemoveAt={removeHandTileAt}
          onClear={() => setHandOf(targetId, [])}
          onCopyVisible={copyVisibleHand}
          onApply={() => {
            props.onReset?.(currentAugments(), handDraft);
            props.onToast?.("지정한 손패로 새 판을 시작합니다");
          }}
        />
      ) : null}

      {tab === "bot" ? (
        <SandboxBotSettings
          rules={botRules}
          control={props.sandbox.control}
          controlling={props.controlling}
          controllingName={
            props.controlling === null ? null : playerNameById(view, props.controlling)
          }
          onToggle={toggleBotRule}
          {...(props.onControl !== undefined ? { onControl: props.onControl } : {})}
        />
      ) : null}

      {tab === "augment" ? (
      <div className="sbx-filters">
        <span className="codex-filter codex-filter-on">전체 {all.length}</span>
        <input
          className="sbx-search"
          value={query}
          placeholder="이름·설명 검색"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      ) : null}

      {tab === "augment" ? (
      <div className="sbx-list">
        {filtered.length === 0 ? (
          <p className="home-empty">조건에 맞는 증강이 없습니다.</p>
        ) : (
          filtered.map((c) => {
            const has = owned.has(c.id);
            return (
              <div key={c.id} className={`sbx-row${has ? " sbx-row-owned" : ""}`}>
                <button
                  className="sbx-give"
                  disabled={has}
                  onClick={() => grant(c)}
                  title={has ? "이미 보유 중" : "이 증강을 즉시 획득"}
                >
                  {has ? "✓" : "＋"}
                </button>
                <button
                  className="sbx-info"
                  onClick={() => setDetailId(detailId === c.id ? null : c.id)}
                >
                  <span className="sbx-name">
                    {c.name}
                    <QuestBadge id={c.id} />
                    {isActiveAugment(c.id) ? <ActiveBadge /> : null}
                  </span>
                  <span className="sbx-desc">
                    <AugDesc id={c.id} description={c.description} variant="codex" expanded={false} />
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>
      ) : null}

      {tab === "augment" && detail !== undefined ? (
        <div className="sbx-detail">
          <div className="sbx-detail-head">
            <b>{detail.name}</b>
            <span className="sbx-id">{detail.id}</span>
            <span className="home-spacer" />
            <button className="sbx-x" onClick={() => setDetailId(null)}>✕</button>
          </div>
          {codexBadges(detail).map((b) => (
            <span key={b} className="sbx-badge">{b}</span>
          ))}
          {/* 샌드박스 상세는 도감과 같은 취급이다 — 목록 줄에 이미 요약이 서 있고,
              여기 오는 사람은 증강이 실제로 어떻게 도는지 보러 온다(= 상세). */}
          {expandParas("codex", detail.description, detail.detail).map((p, i) => (
            <p key={i} className="sbx-detail-body"><TermText text={p} /></p>
          ))}
        </div>
      ) : null}

      <p className="sbx-hint">
        증강 획득은 즉시 적용됩니다. 배패·국 시작에 개입하는 증강(패 변형 등)과
        <b> 손패 지정</b>은 국 시작에만 개입할 수 있으니 <b>새 판</b>으로 확인하세요.
        이 게임은 리플레이·통계에 남지 않습니다.
      </p>
    </div>
  );
}

/** 강제 배패로 지정할 수 있는 최대 장수 (배패 13장 + 첫 쯔모 1장) */
const SANDBOX_HAND_MAX = 14;
/** 실제 배패 장수 — 이보다 뒤에 담은 한 장은 그 좌석의 첫 쯔모가 된다 */
const SANDBOX_DEAL_SIZE = 13;

/**
 * 손패 지정 — 34종 패를 눌러 담고, 담은 순서대로 배패된다.
 *
 * 국 시작에만 개입할 수 있어(배패는 국 시작에 한 번뿐) 편집은 로컬에서 하고
 * "이 손패로 새 판"에서 한 번에 넘긴다. 13장을 다 채우지 않아도 되며, 지정한 만큼만
 * 앞에서 채우고 나머지는 평소대로 무작위다 — "이 3장만 확실히" 같은 시험이 쉽다.
 */
function SandboxHandEditor(props: {
  hand: string[];
  targetName: string;
  onAdd: (key: string) => void;
  onRemoveAt: (index: number) => void;
  onClear: () => void;
  onCopyVisible: () => void;
  onApply: () => void;
}): JSX.Element {
  const kinds = standardKinds();
  const used = (key: string): number => props.hand.filter((k) => k === key).length;
  const full = props.hand.length >= SANDBOX_HAND_MAX;

  return (
    <div className="sbx-hand">
      <div className="sbx-hand-head">
        <span className="sbx-label">{props.targetName}의 배패</span>
        <span className="sbx-hand-count">
          {props.hand.length}/{SANDBOX_HAND_MAX}
        </span>
        <span className="home-spacer" />
        <button className="sbx-btn sbx-btn-sm" onClick={props.onCopyVisible} title="지금 보이는 손패를 그대로 담는다">
          현재 손패 담기
        </button>
        <button className="sbx-btn sbx-btn-sm sbx-btn-danger" onClick={props.onClear}>
          비우기
        </button>
      </div>

      <div className="sbx-hand-picked" data-arm-zone>
        {props.hand.length === 0 ? (
          <span className="sbx-hand-empty">지정 없음 — 평소대로 무작위 배패</span>
        ) : (
          props.hand.map((key, i) => (
            <button
              key={`${key}-${i}`}
              className={`sbx-hand-chip${i >= SANDBOX_DEAL_SIZE ? " sbx-hand-chip-draw" : ""}`}
              onClick={() => props.onRemoveAt(i)}
              title={i >= SANDBOX_DEAL_SIZE ? "첫 쯔모 — 빼기" : "빼기"}
            >
              <TileImg tile={{ kind: kindFromKey(key) }} size="mini" />
              {i >= SANDBOX_DEAL_SIZE ? <span className="sbx-hand-chip-tag">쯔모</span> : null}
            </button>
          ))
        )}
      </div>

      <div className="sbx-hand-pick" data-arm-zone>
        {kinds.map((kind) => {
          const key = `${kind.suit}${kind.rank}`;
          const n = used(key);
          return (
            <button
              key={key}
              className={`sbx-hand-tile${n > 0 ? " on" : ""}`}
              disabled={full || n >= 4}
              onClick={() => props.onAdd(key)}
              title={n >= 4 ? "이 종류는 4장까지" : "손패에 담기"}
            >
              <TileImg tile={{ kind }} size="mini" />
              {n > 0 ? <span className="sbx-seat-n">{n}</span> : null}
            </button>
          );
        })}
      </div>

      <button className="sbx-btn sbx-btn-wide" onClick={props.onApply}>
        ▶ 이 손패로 새 판
      </button>
      <p className="sbx-hint">
        앞 13장이 배패이고, <b>14번째 한 장은 그 좌석의 첫 쯔모</b>가 됩니다 — 14장을 고르면
        첫 순의 손 그대로 시작합니다. 지정한 패는 <b>매 국</b> 다시 배패됩니다. 패산에 남은
        사본이 없으면(다른 좌석이 같은 패를 먼저 가져갔거나 4장을 넘겼으면) 그 자리는
        조용히 무작위로 채워집니다.
      </p>
    </div>
  );
}

/** "man5" 같은 kindKey를 TileKind로 되돌린다 (숫자 부분이 rank) */
function kindFromKey(key: string): TileKind {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  return m === null
    ? { suit: "man", rank: 1 }
    : { suit: m[1]!, rank: Number(m[2]) };
}

/**
 * 봇 설정 — 행동 제약 4종과 봇 좌석 직접 조작 모드.
 *
 * 제약은 판을 갈아엎지 않고 다음 결정부터 바로 먹는다(체크하는 순간 적용).
 * 조작 모드를 켜면 시점 전환으로 들어간 봇 좌석을 내가 직접 둔다 — 상대의 특정 타패나
 * 증강 발동이 있어야만 확인되는 상황을 손으로 만들 수 있다.
 */
function SandboxBotSettings(props: {
  rules: SandboxBotRules;
  control: boolean;
  controlling: string | null;
  controllingName: string | null;
  onToggle: (key: keyof SandboxBotRules) => void;
  onControl?: (enabled: boolean) => void;
}): JSX.Element {
  const items: Array<[keyof SandboxBotRules, string, string]> = [
    ["noCall", "후로 불가", "봇이 퐁·치·대명깡을 하지 않는다"],
    ["noRiichi", "리치 불가", "봇이 리치를 선언하지 않는다 (다마텐은 친다)"],
    ["noWin", "화료 불가", "봇이 론·쯔모를 하지 않는다 — 판이 끝까지 흐른다"],
    ["noAugment", "증강 사용 불가", "봇이 액티브 증강을 발동하지 않는다"],
  ];
  return (
    <div className="sbx-bot">
      <div className="sbx-bot-group">
        <span className="sbx-label">봇 행동 제약</span>
        {items.map(([key, label, hint]) => (
          <label key={key} className="sbx-check" title={hint}>
            <input
              type="checkbox"
              checked={props.rules[key] === true}
              onChange={() => props.onToggle(key)}
            />
            <span className="sbx-check-label">{label}</span>
            <span className="sbx-check-hint">{hint}</span>
          </label>
        ))}
      </div>

      {props.onControl !== undefined ? (
        <div className="sbx-bot-group">
          <span className="sbx-label">봇 좌석 조작</span>
          <label className="sbx-check" title="시점 전환으로 들어간 봇 좌석을 내가 직접 둔다">
            <input
              type="checkbox"
              checked={props.control}
              onChange={() => props.onControl?.(!props.control)}
            />
            <span className="sbx-check-label">봇 시점에서 직접 조작</span>
            <span className="sbx-check-hint">
              그 좌석의 타패·리치·후로·증강 발동이 봇 대신 나에게 온다
            </span>
          </label>
          <p className="sbx-hint">
            {props.control
              ? props.controlling !== null
                ? `지금 ${props.controllingName ?? props.controlling} 좌석을 조작 중입니다.`
                : "위 시점 버튼으로 봇 좌석을 고르면 그 자리를 직접 두게 됩니다."
              : "꺼져 있습니다 — 봇 시점은 관찰만 됩니다."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────── 중앙 인포 패널 ───────────────────────────

const DORA_SLOTS = 5;

/**
 * 중앙 인포 패널.
 *
 * `roundView`는 **국의 스냅샷**이다 — 정산부터 증강 선택이 끝날 때까지는 지난 국에
 * 머물러 있고, 다음 국이 실제로 시작된 뒤에야 넘어온다. 중앙 패널이 "새 국의 시작점"이라
 * 국번호·본장·공탁·오야(자풍)를 여기서 읽는다.
 *
 * 나머지는 live `view`다: 점수판의 점수는 정산 즉시 반영되고(점수표와 어긋나면 그게 더
 * 헷갈린다), 뒷도라는 정산 뷰에서 처음 공개되므로 얼리면 아예 못 본다.
 */
function CenterPanel({
  view,
  roundView,
  seats,
  scoreFx,
}: {
  view: PlayerView;
  roundView: PlayerView;
  seats: Record<Side, PlayerInfo | null>;
  scoreFx: Record<string, number>;
}): JSX.Element {
  // 스냅샷에서 가져오는 것은 **정산 뷰가 미리 올려 버리는 국 정보뿐**이다.
  // 도라·뒷도라·패산·역행·리치봉은 live 뷰 그대로 둔다 — 특히 뒷도라는 정산 뷰에서
  // 처음 공개되므로, 패널을 통째로 얼리면 이번 국의 뒷도라를 아무도 못 본다.
  const snap = roundView.round;
  const r: PlayerView["round"] =
    roundView === view
      ? view.round
      : {
          ...view.round,
          prevalentWind: snap.prevalentWind,
          roundNumber: snap.roundNumber,
          honba: snap.honba,
          riichiPot: snap.riichiPot,
          dealerSeat: snap.dealerSeat,
        };
  // 자풍은 오야 자리에서 나오므로 스냅샷의 오야로 계산한다 (그래야 東이 안 돌아간다).
  const windView = r === view.round ? view : { ...view, round: r };
  const wallLeft = (view.zones["wall"]?.hiddenCount ?? 0) + (view.zones["wall"]?.tileIds.length ?? 0);
  const turnSide = (Object.keys(seats) as Side[]).find(
    (s) => seats[s] !== null && seats[s]!.seat === r.turnSeat,
  );

  return (
    <div className={`center-panel${turnSide !== undefined ? ` turn-${turnSide}` : ""}`}>
      {(Object.keys(seats) as Side[]).map((side) => {
        const p = seats[side];
        if (p === null) return null;
        const wind = seatWindChar(windView, p);
        const isTurn = r.turnSeat === p.seat;
        const riichi = r.byPlayer[p.id]?.riichiDeclared === true;
        const fx = scoreFx[p.id];
        return (
          <div key={side} className={`plate plate-${side}${isTurn ? " plate-turn" : ""}`}>
            <span className={`plate-wind${wind === "東" ? " plate-dealer" : ""}`}>{wind}</span>
            <span className="plate-score">{p.score.toLocaleString()}</span>
            {riichi ? <span className="plate-stick" title="리치" /> : null}
            {fx !== undefined && fx !== 0 ? (
              <span className={`score-float ${fx > 0 ? "score-plus" : "score-minus"}`}>
                {fx > 0 ? "+" : ""}
                {fx.toLocaleString()}
              </span>
            ) : null}
          </div>
        );
      })}

      <div className="center-core">
        <div className="center-round">
          {WIND_CHAR[r.prevalentWind - 1] ?? "?"}
          {r.roundNumber}국
        </div>
        <div className="center-sub">
          <span
            className="wall-count"
            title={`${glossaryTitle("wall")}\n남은 ${wallLeft}장 · 내 쯔모 약 ${Math.ceil(wallLeft / 4)}번`}
            /* "×57" 만으로는 무엇의 57인지 알 수 없다 — 라벨이 `title` 에만 있었다(감사 §6-7) */
            aria-label={`패산에 남은 패 ${wallLeft}장, 내 쯔모 약 ${Math.ceil(wallLeft / 4)}번`}
          >
            ×{wallLeft}
          </span>
          {/* 지금이 마지막 국인가 — 봇은 이 정보를 명시적으로 받는데(RoomManager의
              setGameMode) 사람만 국 번호로 역산해야 했다. 서든데스 구간은 "몇 국까지"가
              정해져 있지 않으므로 오라스 대신 그 사실을 적는다. */}
          {r.prevalentWind > maxWindOf(r.mode) ? (
            <span className="last-round" title="정규 구간이 끝난 서든데스 — 30000점을 먼저 넘기면 종료">
              서든데스
            </span>
          ) : r.prevalentWind === maxWindOf(r.mode) && r.roundNumber === 4 ? (
            <span className="last-round" title="이 판의 마지막 국(오라스)">
              오라스
            </span>
          ) : null}
          {r.honba > 0 ? <span title={glossaryTitle("honba")}>{r.honba}본장</span> : null}
          {r.riichiPot > 0 ? (
            <span className="pot" title={glossaryTitle("kyoutaku")}>
              供{r.riichiPot / 1000}
            </span>
          ) : null}
          {/* 역행 — 2026-08-17 확인: `turn.direction`을 −1로 바꾸는 콘텐츠는 아직 없다.
              규칙은 엔진·봇·삼세 예지까지 배선돼 있으므로 표시만 미리 서 있는 상태다.
              (뒤집는 증강이 생기면 이 칩이 그대로 살아난다.) */}
          {r.direction < 0 ? <span className="rev-dir" title="역행하는 세계">역행</span> : null}
        </div>
        <div className="center-dora" title="도라 표시패">
          {r.doraIndicators.map((id) => (
            <span key={id} className="dora-slot">
              <TileImg tile={view.tiles[id]} size="fill" />
            </span>
          ))}
          {Array.from(
            { length: Math.max(0, DORA_SLOTS - r.doraIndicators.length) },
            (_, i) => (
              <span key={`b${i}`} className="dora-slot dora-back" />
            ),
          )}
        </div>
        {/* 가려진 도라 — 표시패가 한 장도 없으면 "아직 안 열린 것"과 그림이 같다.
            숨긴 사람은 증강 보유가 공개라 여기서 바로 찾을 수 있다. */}
        {(() => {
          if (r.doraIndicators.length > 0) return null;
          const holder = view.players.find(
            (p) => p.augments.includes("dora_conceal") && p.id !== view.playerId,
          );
          if (holder === undefined) return null;
          return (
            <div className="dora-concealed" title="가려진 도라 — 이번 국의 도라 표시패는 그 사람만 본다">
              🌑 가려진 도라 — {holder.nickname}
            </div>
          );
        })()}
        {r.uraDoraIndicators !== null && r.uraDoraIndicators.length > 0 ? (
          <div className="center-dora center-ura" title="뒷도라">
            {r.uraDoraIndicators.map((id) => (
              <span key={id} className="dora-slot">
                <TileImg tile={view.tiles[id]} size="fill" />
              </span>
            ))}
          </div>
        ) : null}
        {(() => {
          // 이면투시 — 국 종료 전 나만 확인한 뒷도라 표시패를 도라 표시패 아래에 보여준다.
          // (공개 뒷도라가 이미 떴으면 그쪽이 우선이라 표시하지 않는다.)
          const raw = view.augmentView["ura"];
          const peeked = Array.isArray(raw)
            ? (raw as unknown[])
                .map((s) => (typeof s === "string" ? parseKindKey(s) : null))
                .filter((k): k is TileKind => k !== null)
            : [];
          const alreadyPublic =
            r.uraDoraIndicators !== null && r.uraDoraIndicators.length > 0;
          if (peeked.length === 0 || alreadyPublic) return null;
          return (
            <div
              className="center-dora center-ura center-ura-peek"
              title="이면투시 — 나만 확인한 뒷도라 표시패"
            >
              {peeked.map((kind, i) => (
                <span key={i} className="dora-slot">
                  <TileImg tile={{ kind }} size="fill" />
                </span>
              ))}
              <span className="ura-peek-tag">이면투시 · 나만 봄</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─────────────────────────── 바닥 (버림패) ───────────────────────────

const River = memo(function River({
  view,
  playerId,
  side,
}: {
  view: PlayerView;
  playerId: string;
  side: Side;
}): JSX.Element {
  const zone = view.zones[`discards:${playerId}`];
  const ids = zone?.tileIds ?? [];
  const hidden = zone?.hiddenCount ?? 0;
  const riichiIdx = view.round.byPlayer[playerId]?.riichiTileIndex;
  const last = view.round.lastDiscard;
  // 쯔모기리(손을 대지 않고 그대로 흘린 패) — 실제 탁자에서 전원이 보는 정보다.
  // 인덱스가 아니라 tileId로 받아, 후로로 바닥에서 패가 빠져도 표식이 밀리지 않는다.
  const tsumogiri = useMemo(
    () => new Set(view.round.byPlayer[playerId]?.tsumogiriIds ?? []),
    [view.round.byPlayer, playerId],
  );
  // 박무(brief_fog) — 선언하면 각자의 마지막 버림패 tileId가 전원 공개로 실린다.
  // (여러 명이 보유해도 내용이 같으므로 먼저 찾은 맵을 쓴다.)
  // ※ 안개 덮인 바닥(hidden_river)은 2026-08-02부터 "최근 6장"을 코어 peek 가시성으로
  //   직접 열어 주므로 이 채널을 쓰지 않는다 — 아래 바닥 렌더가 zone.tileIds로 그린다.
  const fogLastId = useMemo<number | undefined>(() => {
    for (const [key, value] of Object.entries(view.augmentView)) {
      if (!key.startsWith("brief_fog:last:")) continue;
      const map = value as Record<string, unknown> | null;
      if (map === null || typeof map !== "object") continue;
      const id = map[playerId];
      if (typeof id === "number") return id;
    }
    return undefined;
  }, [view.augmentView, playerId]);
  // 액티브 증강 무장 중 — 이 바닥의 특정 버림패가 클릭 대상이면 강조·클릭 발동한다.
  // (회수=내 바닥 / 날치기·무덤 도굴=상대 바닥)
  const sel = useContext(SelectionContext);
  // 안개(hidden_river)는 **뒤 6장만** 공개하므로 가려진 패는 바닥의 **앞쪽**에 있다.
  // 보이는 패를 먼저 그리면 최근 6장이 오래된 뒷면들 앞에 서 버린다 — 섞여 있을 때는
  // 뒷면을 먼저 깐다. (전부 가려진 박무의 count_only는 ids가 비어 순서가 무의미하다.)
  const backsFirst = hidden > 0 && ids.length > 0;
  /*
   * 이 자리가 리치 선언패인가 — 인덱스는 **바닥 전체 기준**(riichiTileIndex, 공개 정보)이다.
   *
   * 가려진 패는 언제나 바닥의 앞쪽이므로(안개 덮인 바닥의 peek pick:"back" · 박무의
   * count_only), 뒷면 칸의 진짜 자리는 `i`, 보이는 칸의 진짜 자리는 `hidden + i`다.
   *
   * ⚠ 예전에는 `hidden === 0`일 때만 눕혔다. 인덱스가 밀리는 것을 막으려던 것인데,
   * 그 탓에 **안개가 끼는 순간 이미 꺾여 있던 리치패가 평범한 패로 돌아갔다**
   * (2026-08-17 사용자 보고). 리치를 걸었다는 사실도 그 자리도 원래 전원 공개라,
   * 내용이 가려진 뒷면이어도 눕힘은 그대로 남는 것이 맞다.
   */
  const isRiichiSlot = (riverIndex: number): boolean =>
    riichiIdx !== undefined && riverIndex === riichiIdx;
  const tileCells = ids.map((id, i) => {
        const latest =
          last !== null && last.player === playerId && last.tileId === id && i === ids.length - 1;
        const rotated = isRiichiSlot(hidden + i);
        const tk = view.tiles[id]?.kind;
        // 무장된 액션의 클릭 대상 버림패인지 — 대상이면 옵션을 잡아 강조·클릭 발동
        const armOpt = sel.riverOptionFor(playerId, id, tk);
        const armable = armOpt !== undefined;
        // 무덤 도굴은 "고르면 그 자리에서 화료"라 후보가 곧 화료패다 —
        // 다른 클릭 대상과 같은 보랏빛으로 두면 그게 안 보인다. 금빛 + 화료 표식으로
        // 확실히 구분한다 (2026-07-31 사용자 요청: "화료할 수 있는 패 좀 더 티나게").
        const winArm = armable && sel.armedType === "grave_rob";
        // 쯔모기리는 손이 움직이지 않았다는 뜻 — 손버림과 구분해 점 하나를 찍는다
        const tsumo = tsumogiri.has(id);
        return (
          <span
            key={id}
            className={`rt${rotated ? " rt-riichi" : ""}${latest ? " rt-latest" : ""}${armable ? " rt-armable" : ""}${winArm ? " rt-win-armable" : ""}${tsumo ? " rt-tsumogiri" : ""}`}
            data-k={highlightKey(view.tiles[id])}
            title={tsumo ? "쯔모기리 (쯔모한 패를 그대로 버림)" : "손버림 (손패에서 꺼내 버림)"}
            {...(armable
              ? {
                  "data-arm-zone": "1",
                  // 이름을 준다 — 안 주면 스크린리더가 "버튼"이라고만 읽는다.
                  // 바닥에는 같은 그림의 패가 여럿이라 그것만으로는 고를 수가 없다.
                  ...clickableProps(
                    () => sel.submit(armOpt),
                    `${formatTile(view.tiles[id])} — 이 버림패 고르기`,
                  ),
                }
              : {})}
          >
            <span className="rt-inner">
              <TileImg tile={view.tiles[id]} size="fill" owner={playerId} />
            </span>
            {tsumo ? <span className="rt-tsumo-dot" /> : null}
            {winArm ? <span className="rt-win-tag">화료</span> : null}
          </span>
        );
  });
  // 안개 바닥(가려진 버림패) — 뒷면으로 표시.
  const backCells = Array.from({ length: hidden }, (_, i) => {
        // 바닥이 통째로 가려졌을 때(박무의 count_only)에 한해, **이 사람의 마지막
        // 버림패**는 안개 속에서도 보인다 — 테이블 전체의 최신 버림(round.lastDiscard)
        // 이거나, 박무가 전원 공개로 실어 주는 "각자의 마지막 한 장"(brief_fog:last:*).
        // 최근 몇 장이 이미 실물로 보이는 안개 덮인 바닥에서는 이 예외가 필요 없다.
        const ownLastId =
          last !== null && last.player === playerId ? last.tileId : fogLastId;
        const revealLast =
          !backsFirst &&
          i === hidden - 1 &&
          ownLastId !== undefined &&
          view.tiles[ownLastId] !== undefined;
        // 뒷면 칸은 언제나 바닥의 앞쪽이라 자리 번호가 곧 바닥 인덱스다.
        const rot = isRiichiSlot(i) ? " rt-riichi" : "";
        if (revealLast) {
          return (
            <span key={`h${i}`} className={`rt rt-latest${rot}`}>
              <span className="rt-inner">
                <TileImg tile={view.tiles[ownLastId]} size="fill" owner={playerId} />
              </span>
            </span>
          );
        }
        return (
          <span key={`h${i}`} className={`rt${rot}`}>
            <span className="rt-inner">
              <span className="tile-back-face rt-hidden" />
            </span>
          </span>
        );
  });
  /*
   * 단(段) 나누기 — 6장씩 두 단, **남는 건 전부 셋째 단**에 붙인다.
   *
   * 예전에는 한 줄을 flex-wrap 에 맡겨 6장마다 접었다. 그러면 19장째부터 넷째 단이
   * 생기고, 상자 밖으로 흘러나온 그 단이 **각자 앞쪽**으로 자란다 — 맞은편 자리에서는
   * 그게 곧 그 사람의 손패 줄이라 뒷패 위에 버림패가 겹쳐 얹혔다
   * (2026-08-12 사용자 보고: "대면의 패가 겹쳐짐").
   *
   * 실제 탁자에서도 셋째 단은 접지 않고 옆으로 늘인다. 그쪽(모서리)은 어차피
   * --river-h 만큼 비어 있는 자리라, 늘어난 단이 이웃 바닥이나 손패를 건드리지 않는다.
   */
  const cells = backsFirst ? [...backCells, ...tileCells] : [...tileCells, ...backCells];
  const rows = [cells.slice(0, 6), cells.slice(6, 12), cells.slice(12)].filter(
    (r) => r.length > 0,
  );
  return (
    <div className={`river-wrap river-${side}`}>
      <div className="river">
        {rows.map((row, i) => (
          <div className="river-row" key={i}>
            {row}
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────── 상대 영역 ───────────────────────────

/**
 * 상대 손패의 한 자리.
 * - `tile` : 이 뷰어에게 공개된 패 (관전·투시·엿보기)
 * - `back` : 뒷면 (내용 비공개)
 * - `gone` : 방금 패가 빠져나간 빈 자리 (다음 버림 전까지만)
 */
type OppSlot =
  | { kind: "tile"; id: number }
  | { kind: "back"; key: number }
  | { kind: "gone"; tsumogiri: boolean };

/** 슬롯 React key — 패는 id로, 나머지는 자리 번호로 (같은 자리면 같은 key) */
function slotKey(s: OppSlot, i: number): string {
  return s.kind === "tile" ? `t${s.id}` : s.kind === "back" ? `b${s.key}` : `g${i}`;
}

/**
 * 상대 손패 한 자리. 뒷면·공개패·빈 자리를 **같은 크기로** 그려, 패가 빠져도
 * 나머지 자리가 밀리지 않는다 — 그래야 "몇 번째에서 뺐는지"가 눈에 남는다.
 *
 * `gap`은 쯔모패 자리 — 실제 탁자처럼 손패에서 한 칸 띄워 그린다.
 */
const OppHandSlot = memo(function OppHandSlot({
  slot,
  side,
  gap,
  view,
  owner,
}: {
  slot: OppSlot;
  side: "top" | "left" | "right";
  gap: boolean;
  view: PlayerView;
  owner: string;
}): JSX.Element {
  const gapCls = gap ? " slot-drawn" : "";
  if (slot.kind === "gone") {
    return (
      <span
        className={`slot-gone${slot.tsumogiri ? " slot-gone-tsumo" : ""}${gapCls}`}
        title={slot.tsumogiri ? "쯔모패를 그대로 버렸습니다" : "이 자리에서 패를 뺐습니다"}
      />
    );
  }
  if (slot.kind === "back") {
    return <span className={`${side === "top" ? "back-v" : "back-h"}${gapCls}`} />;
  }
  const tile = view.tiles[slot.id];
  const hk = highlightKey(tile);
  if (side === "top") {
    return (
      <span className={`open-tile${gapCls}`} data-k={hk}>
        <TileImg tile={tile} size="fill" owner={owner} />
      </span>
    );
  }
  return (
    <span className={`open-tile-lying open-${side}${gapCls}`} data-k={hk}>
      <span className="open-tile-inner">
        <TileImg tile={tile} size="fill" owner={owner} />
      </span>
    </span>
  );
});

/**
 * 봉인술사·손패 강탈로 알아낸 **그 상대의 손패** — 그 사람의 손패 옆에 띄운다.
 *
 * 예전엔 화면 왼쪽 위 목록에 `봉인 남풍 [미니패…]`로 떠 있었다. 누구 손패인지
 * 글로 읽어야 했고, 정작 그 사람의 손패는 화면 반대편에 있었다. 정보는 그
 * 정보가 가리키는 대상 옆에 있어야 한다 — 오름패 간파(WaitsBadge)와 같은 자리다.
 *
 * `discardLockReveal:{pid}`(실제 패, 적도라까지 그대로)가 있으면 그쪽이 우선이고,
 * 없으면 `sealed:{pid}`(종류 목록)로 떨어진다.
 *
 * ⚠ 손패 **자리**까지는 알 수 없다. 서버는 명시된 tileId의 메타데이터만 뷰에 얹고
 * 그 패들은 여전히 hiddenCount에 남는다(core PlayerView §revealTiles). 그래서
 * 뒷면 자리를 이 패로 바꿔 치지 않는다 — 그러면 "앞에서 N번째"라는 없는 정보를
 * 지어내게 된다. 손패 옆에 따로 띄운다.
 */
function sealedPeekOf(
  view: PlayerView,
  playerId: string,
): { tiles: PublicTileView[]; kinds: TileKind[] } | null {
  // **봉인술사 전용 채널(discardLockReveal)만** 본다.
  // 범용 채널 `revealTiles:{pid}`는 여기서 읽지 않는다 — 등가교환이 교환 중에만
  // 쓰는 채널인데 이 배지가 그걸 '🔒 봉인'으로 그려, 교환한 상대에게 봉인이 걸린
  // 것처럼 보였다(2026-08-02 사용자 보고). 등가교환의 상대 손패는 교환 모달에서만
  // 보이면 된다 — 배지로 따로 띄우지 않는다.
  const revealed = view.augmentView[`discardLockReveal:${playerId}`];
  if (Array.isArray(revealed)) {
    const tiles = (revealed as unknown[])
      .filter((id): id is number => typeof id === "number")
      .map((id) => view.tiles[id])
      .filter((t): t is PublicTileView => t !== undefined);
    if (tiles.length > 0) return { tiles, kinds: [] };
  }
  const sealed = view.augmentView[`sealed:${playerId}`];
  if (Array.isArray(sealed)) {
    const kinds = (sealed as unknown[])
      .map((k) => (typeof k === "string" ? parseKindKey(k) : null))
      .filter((k): k is TileKind => k !== null);
    if (kinds.length > 0) return { tiles: [], kinds };
  }
  return null;
}

/** 봉인·투시로 알아낸 상대 손패를 그 상대의 손패 옆에 띄우는 뱃지 */
function SealBadge({
  peek,
  owner,
}: {
  peek: { tiles: PublicTileView[]; kinds: TileKind[] };
  owner: string;
}): JSX.Element {
  return (
    <div className="seal-badge" title={`${owner}의 봉인된 손패 — 나만 보인다`}>
      <span className="seal-badge-label">
        🔒 봉인
        <span className="seal-badge-owner">{owner}</span>
      </span>
      <span className="seal-badge-tiles">
        {peek.tiles.length > 0
          ? peek.tiles.map((t) => <TileImg key={t.id} tile={t} size="mini" />)
          : peek.kinds.map((kind, i) => <TileImg key={i} tile={{ kind }} size="mini" />)}
      </span>
    </div>
  );
}

function OpponentStrip({
  view,
  player,
  side,
  catalog,
}: {
  view: PlayerView;
  player: PlayerInfo;
  side: "top" | "left" | "right";
  catalog: Record<string, AugmentCatalogEntry>;
}): JSX.Element {
  const zone = view.zones[`hand:${player.id}`];
  const hidden = zone?.hiddenCount ?? 0;
  // 공개된 손패(관전·투시 등)는 **그 사람이 정한 배치 그대로** 보여준다.
  // 뷰의 순서가 곧 소유자의 배치다(core arrangeHand) — 여기서 다시 정렬하면
  // 실제로 쥔 배치와 어긋난다. 뒷면(hidden)은 그대로 개수만.
  const arranged = zone?.tileIds ?? [];
  const pr = view.round.byPlayer[player.id];
  // 방금 이 사람이 버렸다면 그 패가 빠져나간 자리를 빈 칸으로 남겨 둔다 —
  // "13장 중 몇 번째에서 뺐는지 / 떨어져 있던 쯔모패를 흘렸는지"가 그대로 보인다.
  // 다음 버림이 나오면 서버가 표식을 갈아 끼우므로 저절로 사라진다.
  const from = view.round.lastDiscardFrom;
  const vacated = from !== null && from.player === player.id ? from : null;
  const slots = useMemo<OppSlot[]>(() => {
    // 배치 순서 그대로: 공개된 패가 앞(엿보기는 앞 N장), 나머지는 뒷면.
    const list: OppSlot[] = [
      ...arranged.map((id) => ({ kind: "tile" as const, id })),
      ...Array.from({ length: hidden }, (_, i) => ({ kind: "back" as const, key: i })),
    ];
    if (vacated !== null) {
      // 자리 수가 한 장 줄어든 상태라, 빠진 자리에 빈 칸을 도로 끼워 넣으면
      // 버리기 직전의 배치가 그대로 복원된다.
      const at = Math.max(0, Math.min(vacated.index, list.length));
      list.splice(at, 0, { kind: "gone", tsumogiri: vacated.tsumogiri });
    }
    // 오른쪽 자리는 실제 탁자처럼 플레이어가 왼쪽을 바라봐 손패가 아래→위로 흐른다.
    // 배치가 그대로 읽히도록 오른쪽 자리만 표시 순서를 뒤집는다.
    return side === "right" ? list.reverse() : list;
  }, [arranged, hidden, vacated, side]);
  // 쯔모패를 손패와 떨어뜨려 쥐고 있는가 (전원 공개). 방금 쯔모기리로 흘렸다면
  // 그 빈 칸도 떨어져 있던 자리이므로 똑같이 틈을 벌린다.
  const separated = pr?.drawnSeparated === true || vacated?.tsumogiri === true;
  /** 틈을 벌릴 슬롯 — 배치의 맨 끝(오른쪽 자리는 뒤집혔으니 맨 앞) */
  const gapAt = separated ? (side === "right" ? 0 : slots.length - 1) : -1;
  // 이 상대의 손패 장수 — 뒷면 크기를 이 수에 맞춰야 진짜 용(16·17장)이
  // 화면 밖으로 흘러 잘리지 않는다 (CSS --back-n).
  const handCount = slots.length;
  const melds = pr?.melds ?? [];
  const meldCount = pr?.meldCount ?? 0;
  // 후로는 손패와 **같은 줄**에 붙는다(위 자리는 가로, 좌·우 자리는 세로) — 그래서
  // 손패 뒷면과 후로 타일이 한 예산을 나눠 갖는다 (CSS --meld-n → --row-unit/--col-unit).
  // 후로 타일 크기가 고정이던 시절엔 깡 서너 번에 예산을 다 먹어 뒷면만 하한까지
  // 쪼그라들었다 (2026-08-13 보고).
  const meldTileCount =
    melds.reduce((n, m) => n + m.tileIds.length, 0) + pulledMeldTileIds(view, player.id).length;
  const sizeVars = {
    "--back-n": Math.max(1, handCount),
    "--meld-n": meldTileCount,
  } as CSSProperties;
  // 액티브 증강 무장 중 — 이 상대가 클릭 대상이면 강조하고 클릭 시 발동한다.
  const sel = useContext(SelectionContext);
  const oppArmable = sel.oppArmable(player.id);
  // 손패를 건드리는 증강을 무장했는데 이 상대가 리치라 대상이 될 수 없다 —
  // 강조도 클릭도 없는 자리에 이유만 적어 준다 (없으면 "왜 안 눌리지?"가 된다).
  const oppRiichiBlocked = sel.oppRiichiBlocked(player.id);
  // 무장 대상 상대에 붙일 공통 속성 (클릭 발동 + data-arm-zone로 빈곳-취소 방지)
  const armProps = oppArmable
    ? {
        "data-arm-zone": "1",
        ...clickableProps(() => sel.clickOpp(player.id), `${player.nickname} 고르기`),
      }
    : {};
  // 선언 간파로 알아낸 이 상대의 화료패 — 발동한 본인에게만 상시 노출
  const peeked = peekedWaits(view, player.id);
  // 봉인술사·손패 강탈로 알아낸 이 상대의 손패 — 오름패 간파와 같은 자리에 띄운다
  const sealPeek = sealedPeekOf(view, player.id);
  // 관전 모드에서는 손패가 전부 공개되므로 각 플레이어의 오름패(대기)를 직접 계산해 표시
  const specWaits = useMemo<TileKind[]>(() => {
    if (view.playerId !== SPECTATOR_ID) return [];
    const kinds = arranged
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    if (kinds.length % 3 !== 1) return [];
    try {
      return winningKinds(kinds, meldCount, undefined, waitDecompOptions(player, view, kinds));
    } catch {
      return [];
    }
  }, [view, arranged, meldCount, player]);
  // 오픈 리치로 공개된 오름패는 전원에게 상시 보인다 (다른 정보 소스보다 우선).
  const openWaits = openRiichiWaits(view, player.id);
  const waits = openWaits.length > 0 ? openWaits : peeked.length > 0 ? peeked : specWaits;
  // 간파한 오름패는 오픈 리치와 같은 크기·강조로 그 상대의 손패 위에 띄운다
  // (예전엔 작은 뱃지라 상대 손패 옆에 묻혀 잘 안 보였다).
  const peekBadge = openWaits.length === 0 && peeked.length > 0;

  if (side === "top") {
    return (
      <div
        className={`opp-strip opp-strip-top${oppArmable ? " opp-armable" : ""}`}
        style={sizeVars}
        {...armProps}
      >
        {oppArmable ? (
          <div className="opp-arm-tag">✦ 여기 클릭</div>
        ) : oppRiichiBlocked ? (
          <div className="opp-arm-tag opp-arm-blocked">리치 — 손패를 건드릴 수 없다</div>
        ) : null}
        {waits.length > 0 ? (
          <WaitsBadge
            waits={waits}
            owner={playerName(view, player)}
            openRiichi={openWaits.length > 0}
            peek={peekBadge}
          />
        ) : null}
        {sealPeek !== null ? <SealBadge peek={sealPeek} owner={playerName(view, player)} /> : null}
        <div className="opp-melds-row">
          {melds.map((m, i) => (
            <MeldGroup key={i} view={view} meld={m} owner={player} layout="row" />
          ))}
          <PulledGroup view={view} owner={player} layout="row" />
        </div>
        <div className="opp-backs-row">
          {slots.map((s, i) => (
            <OppHandSlot
              key={slotKey(s, i)}
              slot={s}
              side="top"
              gap={i === gapAt}
              view={view}
              owner={player.id}
            />
          ))}
        </div>
        <NamePlate view={view} player={player} catalog={catalog} tipAlign="center" />
      </div>
    );
  }

  return (
    <div
      className={`opp-strip opp-strip-${side}${oppArmable ? " opp-armable" : ""}`}
      style={sizeVars}
      {...armProps}
    >
      {oppArmable ? (
          <div className="opp-arm-tag">✦ 여기 클릭</div>
        ) : oppRiichiBlocked ? (
          <div className="opp-arm-tag opp-arm-blocked">리치 — 손패를 건드릴 수 없다</div>
        ) : null}
      {waits.length > 0 ? (
          <WaitsBadge
            waits={waits}
            owner={playerName(view, player)}
            openRiichi={openWaits.length > 0}
            peek={peekBadge}
          />
        ) : null}
      {sealPeek !== null ? <SealBadge peek={sealPeek} owner={playerName(view, player)} /> : null}
      <NamePlate view={view} player={player} catalog={catalog} tipAlign={side === "left" ? "left" : "right"} />
      <div className="opp-backs-col">
        {slots.map((s, i) => (
          <OppHandSlot
            key={slotKey(s, i)}
            slot={s}
            side={side}
            gap={i === gapAt}
            view={view}
            owner={player.id}
          />
        ))}
      </div>
      <div className="opp-melds-col">
        {melds.map((m, i) => (
          <MeldGroup key={i} view={view} meld={m} owner={player} layout="col" colSide={side} />
        ))}
        <PulledGroup view={view} owner={player} layout="col" colSide={side} />
      </div>
    </div>
  );
}

/**
 * 무장해제로 이번 국 잠긴 이 플레이어의 증강 id 집합.
 *
 * 무장해제는 지목 관계를 `view:*:disarm:{시전자}` 국 스코프 채널에 실어 전원에게
 * 공개한다(값 = {target, augmentId}). 국이 끝나면 서버가 그 채널을 지우므로,
 * 여기 남아 있다는 것 자체가 "지금 잠겨 있다"는 뜻이다.
 */
function disarmedAugmentsOf(view: PlayerView, playerId: string): Set<string> {
  const out = new Set<string>();
  for (const [key, raw] of Object.entries(view.augmentView)) {
    if (!key.startsWith("disarm:")) continue;
    const m = raw as { target?: string; augmentId?: string } | null;
    if (m === null || typeof m !== "object") continue;
    if (m.target !== playerId || typeof m.augmentId !== "string") continue;
    out.add(m.augmentId);
  }
  return out;
}

/** 재장전으로 이번 게임에 되살린 이 사람의 증강 (pill에 ♻를 붙인다) */
function reloadedAugmentsOf(view: PlayerView, playerId: string): Set<string> {
  const out = new Set<string>();
  const v = view.augmentView[`reload:${playerId}`];
  if (typeof v === "string" && v !== "") out.add(v);
  return out;
}

/**
 * 수상한 주사위(화수분)에서 쏟아진 이 사람의 증강 — pill에 🎲를 붙인다.
 *
 * 주사위 자신은 이름표에 세우지 않으므로(칸을 세 칸 먹어 판을 가렸다), 이 표식이
 * "이 둘은 주사위에서 굴러 나온 것"이라는 유일한 흔적이다. 채널은 전원 공개라
 * 남의 이름표에도 똑같이 붙는다.
 */
function cornucopiaGrantsOf(view: PlayerView, playerId: string): Set<string> {
  const raw = view.augmentView[`cornucopia:${playerId}`];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((x): x is string => typeof x === "string"));
}

/**
 * 이름표의 증강 pill에 얹는 상태 — **잔량·게이지·발동 여부**.
 *
 * 이 정보들은 예전에 전부 화면 왼쪽 위 목록에 "스택 3", "연장 (남은 2회)" 같은
 * 글줄로 쌓여 있었다. 정보의 제자리는 그 정보가 가리키는 대상, 곧 **그 사람의 그
 * 증강 pill 위**다 — 무장해제의 자물쇠(aug-pill-locked)가 이미 쓰고 있는 자리다.
 */
type PillStatus = {
  /** pill 오른쪽에 붙는 짧은 글 ("3회", "🛡2", "만개" …) */
  chip: string;
  /** 0~1 게이지 (지금은 카르마 업보만) */
  gauge?: number;
  /** 툴팁에 붙는 한 줄 설명 */
  note: string;
  /**
   * 칩의 성격. 기본(없음)은 잔량·게이지처럼 "세는 값"이다.
   *
   * `guard`는 **상대의 선택을 지금 막고 있는 상태**다 — 불가침 조약·천하무적이 그렇다.
   * 남은 횟수와 같은 회색 칩으로 서면 "왜 론 버튼이 안 뜨는가"를 찾는 눈에 안 걸린다.
   * 색만 다르게 하고 움직이지는 않는다(판 위에서 깜빡이는 것은 이미 차례 표시가 한다).
   *
   * `spent`는 **남은 횟수가 0**이다 — 아직 pill에는 서 있지만 이제 아무 일도 하지 않는
   * 증강이라, 남은 잔량과 같은 색으로 두면 "0회"가 "3회"처럼 읽힌다.
   */
  tone?: "guard" | "spent";
};

/** 카르마 청산선 — 이 값을 넘으면 게이지가 가득 찬다 */
const KARMA_FULL = 8000;

/** 값이 숫자인 잔량·게이지 채널 — 채널 키는 `{augId}:{playerId}` */
const PILL_NUMBER: Record<string, (n: number) => PillStatus | null> = {
  yakuman_shield: (n) => (n > 0 ? { chip: `🛡${n}`, note: `역만 ${n}회 방어` } : null),
  karma: (n) =>
    n > 0
      ? {
          chip: n.toLocaleString(),
          gauge: Math.min(1, n / KARMA_FULL),
          note:
            n >= KARMA_FULL
              ? `업보 ${n.toLocaleString()} — 청산 가능`
              : `업보 ${n.toLocaleString()} / ${KARMA_FULL.toLocaleString()}`,
        }
      : null,
  hourglass: (n) => (n > 0 ? { chip: `${n}장`, note: `되돌린 패 ${n}장` } : null),
  north_trader: (n) => (n > 0 ? { chip: `北${n}`, note: `빼놓은 北 ${n}장` } : null),
  // 미래를 보는 자 — 이번 국에 쌓인 층 = 화료 시 얹히는 판수. 몇 판이 붙어 있는지
  // 화면 어디에도 없어 "쌓이는 게 안 보인다"는 피드백이 있었다(2026-08-02).
  future_sight: (n) =>
    n > 0 ? { chip: `+${n}판`, note: `이번 국 ${n}번 교환 — 화료하면 +${n}판` } : null,
  // 폭주 리치 — 남은 연속 쯔모 횟수
  soul_strike: (n) =>
    n > 0 ? { chip: `${n}쯔모`, note: `연속 쯔모 ${n}번 남음 — 타가가 후로하면 끝난다` } : null,
};

/** 값이 상태 문자열인 채널 — 그 글을 그대로 pill에 붙인다 */
const PILL_TEXT = new Set([
  "eternal_dealer",
  "devils_advance",
  "late_bloomer",
  "late_bloomer_east",
  "cliff_bloom",
]);

/**
 * 발동 사실만 싣는 boolean 채널 — 예전엔 어떤 표시에도 안 걸려 채널을 쐈는데
 * 화면에 아무것도 안 떴다(2026-08-01 감사).
 */
const PILL_FLAG = new Set([
  "blind_ron",
  "sign_flip",
  "even_world",
  "genesis",
  "giant_god",
  "die_hard",
  "bluff_pretense",
  "silent_pact",
  "xray_hand",
]);

/**
 * 이름표 증강 pill이 대신 보여주는 채널 — 증강 정보 로그(augmentLogRows)에는 남기지 않는다.
 * 새 증강의 잔량·상태를 pill에 붙였다면 여기에도 넣어야 두 군데에 겹쳐 뜨지 않는다.
 */
const SUIT_KO: Record<string, string> = { man: "만수", pin: "통수", sou: "삭수" };

/**
 * 값 모양이 제각각인 채널 — 그 증강이 **지금 무엇으로 굳었는지**를 pill에 박는다.
 *
 * ⚠ 이 중 배수·본장 가치·밀실의 도라는 한때 중앙 보드(점수판 옆·본장 옆·도라 줄)에
 * 붙이려다 물렀다. `.center-core`는 `inset`으로 높이가 고정돼 있어(패널 211px 중
 * 코어 ~146px, 이미 국 표시+요약줄+도라 5장으로 꽉 찬다) 줄을 더하면 내용이 4방향
 * 점수판 위로 넘친다. 점수판(--plate-w 131px)도 바람·점수만으로 이미 98px을 쓴다.
 * 중앙에는 자리가 없다 — pill이 유일하게 여유 있는 자리다.
 */
const PILL_CUSTOM: Record<string, (raw: unknown) => PillStatus | null> = {
  // 조커 — 발동하면 이번 국 내내 이 사람의 백이 만능패다 (전원 공개)
  joker: (raw) =>
    raw === true
      ? { chip: "白 만능", note: "이번 국 이 사람의 손패에서 백이 무엇이든 된다" }
      : null,
  suit_unify: (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    const ko = SUIT_KO[raw] ?? raw;
    return { chip: ko, note: `이번 국 손패가 ${ko}로 통일된다` };
  },
  blood_contract: (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    const yaku = YAKU_NAMES[raw] ?? raw;
    return { chip: yaku, note: `계약한 역 — ${yaku}으로만 화료할 수 있다` };
  },
  all_or_nothing: (raw) => {
    if (typeof raw !== "number" || raw <= 0) return null;
    return { chip: `${raw.toLocaleString()}점`, note: `${raw.toLocaleString()}점을 걸었다` };
  },
  let_it_ride: (raw) => {
    const m = raw as { streak?: number; multiplier?: number } | null;
    if (m === null || typeof m !== "object") return null;
    const mult = m.multiplier ?? 1;
    if (mult <= 1) return null;
    return { chip: `×${mult}`, note: `${m.streak ?? 0}연승 — 다음 화료 ×${mult}` };
  },
  jackpot: (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    return { chip: raw, note: `이번 국 화료 점수 ${raw}` };
  },
  // 천하통일 — 문턱까지 남은 점수. 이 증강은 view 채널이 하나도 없어서, 동2국에
  // 갑자기 순위표가 떠도 아무도 이유를 몰랐다. 게이지가 서야 "홀더에게만 안 쏜다"는
  // 대응이 성립한다.
  unification: (raw) => {
    const m = raw as { threshold?: number; left?: number } | null;
    if (m === null || typeof m !== "object" || typeof m.left !== "number") return null;
    const total = m.threshold ?? 45000;
    if (m.left <= 0) {
      return { chip: "도달", note: `${total.toLocaleString()}점 도달 — 이 국으로 게임이 끝난다` };
    }
    return {
      chip: `${m.left.toLocaleString()}점`,
      note: `${total.toLocaleString()}점까지 ${m.left.toLocaleString()}점 — 닿으면 남은 국 없이 끝난다`,
      gauge: Math.min(1, Math.max(0, (total - m.left) / total)),
    };
  },
  // 편식 — 통일한 무늬 (발동 뒤). 진행도는 아래 전용 분기가 그린다.
  picky_eater: (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    const ko = SUIT_KO[raw] ?? raw;
    return { chip: ko, note: `손패의 수패가 ${ko}로 통일됐다` };
  },
  // 천하통일은 문턱이 45000 고정이라 공개 채널이 없다 — 카드 문구가 곧 목표다.
  // (증강 발행분만큼 문턱이 올라가던 시절에는 "지금 목표"를 pill로 계속 띄웠다.)
  /*
   * 불가침 조약 — 지금 조약이 살아 있는가(`no_ron_pact:{보유자}` 국 스코프 전원 공개).
   *
   * 상대에게 론 버튼이 안 뜨는 것이 전부였다. **왜** 안 뜨는지 국 내내 계속 보여야
   * 하는 정보라 컷인이 아니라 상태 뱃지다. 값은 서버가 만든 한 줄 그대로 툴팁에 싣고,
   * 좁은 pill에는 앞머리만 줄여 박는다.
   */
  no_ron_pact: (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    if (raw.startsWith("조약 유효")) {
      return { chip: "🤝 론 불가", note: raw, tone: "guard" };
    }
    // 파기·만료 — 사라뜨리지 않고 남긴다. "조약이 이미 깨졌다"는 것도 상대가 읽어야 할 정보다.
    return { chip: raw.startsWith("조약 만료") ? "조약 만료" : "조약 파기", note: raw };
  },
  /*
   * 천하무적 — 이번 국 이 사람에게는 론이 안 된다(`invincible:{보유자}` 국 스코프 전원 공개).
   * 불가침 조약과 같은 이유로 상태 뱃지다.
   */
  invincible: (raw) =>
    typeof raw === "string" && raw !== ""
      ? { chip: "🛡 론 불가", note: `${raw} — 쯔모 화료와 유국 노텐 벌점은 그대로다`, tone: "guard" }
      : null,
  /*
   * 붉은 손길 — 이 사람이 각인한 숫자(`red_five_touch:{보유자}` 전원 공개, 게임 내내 유지).
   *
   * 읽어야 하는 쪽이 **상대**라 상대가 보는 자리, 곧 그 사람의 이름표에 세운다.
   * 각인된 적도라를 울어 가도 내 채점에는 안 들어간다 — 울기 전에 보여야 의미가 있다.
   */
  red_five_touch: (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    const rank = /(\d)/.exec(raw)?.[1];
    if (rank === undefined) return { chip: raw, note: raw };
    return {
      chip: `${rank} 각인`,
      note: `이 사람의 ${rank}만·${rank}통·${rank}삭은 이 사람에게만 적도라 — 버린 것을 울어 가도 도라가 붙지 않는다`,
    };
  },
  /*
   * 영상 정찰(끌어오기) — 이번 국 영상패 맨 앞이 이 사람의 쯔모패로 갈렸다는 사실.
   *
   * 컷인으로 하지 않았다. 이 정보가 필요한 순간은 발동한 그 순간이 아니라 **몇 순 뒤에
   * 누군가 깡을 치는 순간**이다. 스쳐 지나가면 그때는 아무도 기억하지 못한다.
   * 국 스코프라 국이 끝나면 서버가 지운다 — 뱃지도 함께 사라진다.
   * ⚠ 넣은 패의 정체는 채널에 없고, 여기서도 만들어 붙이지 않는다.
   */
  rinshan_preview: (raw) =>
    typeof raw === "string" && raw !== ""
      ? { chip: "영상패 교체", note: `${raw} — 무슨 패인지는 공개되지 않는다` }
      : null,
  honba_hunter: (raw) => {
    const m = raw as { honba?: number; value?: number } | null;
    if (m === null || typeof m !== "object" || (m.honba ?? 0) <= 0) return null;
    const value = m.value ?? 0;
    return {
      chip: `+${value.toLocaleString()}`,
      note: `${m.honba}본장 = 화료 시 +${value.toLocaleString()}점`,
    };
  },
};

const PILL_OWNED_HEADS: ReadonlySet<string> = new Set([
  ...Object.keys(PILL_NUMBER),
  ...Object.keys(PILL_CUSTOM),
  ...PILL_TEXT,
  ...PILL_FLAG,
  "alchemist",
  "tile_dyeing",
  "dead_wall_master",
  "reload",
  "call_seal",
  "ankan_dora",
  "mirror_dora",
  "dora_afterimage",
  "picky_eater",
  "time_pressure",
]);

/**
 * 내부 쿨다운("2국에 1회")이 몇 국 남았는가 — 0이면 지금 쓸 수 있다.
 *
 * 콘텐츠 쪽 `cooldownViewKey`(util.ts)가 **보유자 본인 채널**로만 올려 주므로 채널에는
 * 좌석이 안 붙는다. 예전에는 이 정보가 어디에도 없어서, 잠긴 증강이 그냥 "아무 일도
 * 안 일어나는 증강"으로 보였다(2026-08-06 사용자 지적).
 *
 * **좌석 인자가 필요한 이유**: 이름표는 좌석마다 그려지는데 채널은 뷰어 것 하나뿐이라,
 * 같은 증강을 나와 남이 함께 들면 내 잔여 쿨다운이 **남의 pill에** 찍힌다. 드래프트는
 * 중복을 막지만 수상한 주사위의 `grantAugments`는 자기 보유분만 걸러서 중복이 실제로
 * 성립한다(core/Augment.ts). 그러면 상대가 그 증강을 쓸 수 있는지를 정반대로 읽는다.
 */
function cooldownRoundsLeft(view: PlayerView, playerId: string, augId: string): number {
  if (playerId !== view.playerId) return 0;
  const left = view.augmentView[`cooldown:${augId}`];
  return typeof left === "number" && left > 0 ? left : 0;
}

/**
 * 남은 쿨다운이 **순** 단위인 증강 (예지·무르기 계열). 국 단위와 같은 자리에 그리되
 * 단위만 다르다 — 채널이 아예 없던 시절에는 버튼이 사라진 것으로만 알 수 있었다.
 */
function cooldownTurnsLeft(view: PlayerView, playerId: string, augId: string): number {
  if (playerId !== view.playerId) return 0;
  const left = view.augmentView[`cooldownTurns:${augId}`];
  return typeof left === "number" && left > 0 ? left : 0;
}

function augmentPillStatus(
  view: PlayerView,
  playerId: string,
  augId: string,
): PillStatus | null {
  const av = view.augmentView;

  /*
   * 선발동형("뽑자마자 이번 국만") — 그 국이 지나가면 콘텐츠가 `spent:{id}:{좌석}`을
   * 올린다. 효과 표시는 국 스코프라 조용히 사라지는데 pill은 그대로 서 있어서, 이미
   * 끝난 증강이 아직 걸려 있는 것처럼 보였다(2026-08-13 사용자 보고).
   * 다른 어떤 분기보다 먼저 본다 — 끝난 증강에 살아 있는 상태를 붙일 이유가 없다.
   */
  if (av[`spent:${augId}:${playerId}`] === true) {
    return { chip: "종료", tone: "spent", note: "이번 국 전용 — 그 국이 지나 효과가 남아 있지 않다" };
  }

  // 보유자 화면에만 실리는 잔량 채널 — 채널 이름에 좌석이 없으므로 **뷰어 자신의
  // pill에만** 붙인다. 같은 증강을 남도 들면 내 잔량이 남의 pill에 찍힌다
  // (cooldownRoundsLeft 주석의 중복 보유 경로).
  const isSelf = playerId === view.playerId;
  // (연금술사는 2026-08-17에 공용 잔량 채널 `uses:alchemist`로 옮겼다 — 아래 usesStatus가 읽는다)
  // 염색 — 연금술사와 같은 게임 전체 5회 자원 (2026-08-04 국당 1회에서 개편)
  if (augId === "tile_dyeing") {
    const left = av["tile_dyeing:left"];
    if (!isSelf || typeof left !== "number") return null;
    return { chip: `${left}회`, note: `염색 ${left}회 남음` };
  }
  /*
   * 예지 — 재배열은 **국에 1회**다. 소진되면 열람은 되는데 드래그 확정이 안 열리는데,
   * 그 이유가 화면 어디에도 없었다("증강이 고장 났다"로 읽힌다).
   * 이 채널은 보유자 전용이고 값이 그냥 true라, 공개 열람 채널을 읽는 아래 일반
   * 경로(`av[augId:좌석]`)로는 볼 수 없어 여기서 따로 본다.
   */
  if (augId === "foresight" && isSelf && av["foresight:reorderSpent"] === true) {
    return {
      chip: "재배열 완료",
      tone: "spent",
      note: "이번 국 재배열은 이미 썼다 — 앞을 보는 것만 된다",
    };
  }
  if (augId === "dead_wall_master") {
    const left = av[`dead_wall_master:remaining:${playerId}`];
    if (typeof left !== "number" || left <= 0) return null;
    return { chip: `${left}회`, note: `이번 국 왕패 교환 ${left}회 남음` };
  }

  // 울기 봉인 — 몇 순 남았는지. 값이 객체라 예전엔 어떤 표시에도 안 걸려
  // **화면에 아무것도 안 떴다**(2026-08-01 감사).
  if (augId === "call_seal") {
    const m = av[`call_seal:${playerId}`] as { until?: number } | null;
    if (m === null || typeof m !== "object" || typeof m.until !== "number") return null;
    const left = m.until - view.round.turnCount;
    if (left <= 0) return null;
    return { chip: `${left}순`, note: `앞으로 ${left}순 동안 아무도 후로할 수 없다` };
  }
  /*
   * 밀실의 도라 — **깡에 들어간 네 장**이 이 사람만의 도라가 된다(전원 공개).
   * 종류가 아니라 그 네 장이라, 손패에 같은 패가 있어도 판이 붙지 않는다.
   * 그래서 문구도 "이 종류가 도라"가 아니라 "깡친 네 장이 도라"로 적는다.
   */
  if (augId === "ankan_dora") {
    const m = av[`ankan_dora:${playerId}`] as { kinds?: string[] } | null;
    const kinds = (Array.isArray(m?.kinds) ? m.kinds : [])
      .map(parseKindKey)
      .filter((k): k is TileKind => k !== null);
    if (kinds.length === 0) return null;
    const names = kinds.map((kind) => formatTile({ kind })).join("·");
    return {
      chip: names,
      note: `안깡한 ${names}${kinds.length > 1 ? "" : " 네 장"}이 이 사람에게만 도라 — 손패의 같은 패에는 붙지 않는다`,
    };
  }

  // 거울의 도라 · 도라의 잔상 — 이 사람에게만 도라가 되는 종류(전원 공개)
  if (augId === "mirror_dora" || augId === "dora_afterimage") {
    const raw = av[`${augId}:${playerId}`];
    const kinds = (Array.isArray(raw) ? raw : [])
      .filter((k): k is string => typeof k === "string")
      .map(parseKindKey)
      .filter((k): k is TileKind => k !== null);
    if (kinds.length === 0) {
      // 잔상은 아직 안 썼어도 **무엇을 되살릴 수 있는지**를 보유자 본인에게만 보여 준다
      // — 값어치를 보고 발동할지 정하라는 증강이라, 안 보이면 도박이 된다.
      if (augId === "dora_afterimage") {
        const prev = (Array.isArray(av[`dora_afterimage:prev:${playerId}`])
          ? (av[`dora_afterimage:prev:${playerId}`] as unknown[])
          : [])
          .filter((k): k is string => typeof k === "string")
          .map(parseKindKey)
          .filter((k): k is TileKind => k !== null);
        if (prev.length === 0) return null;
        const prevNames = prev.map((kind) => formatTile({ kind })).join("·");
        return {
          chip: `↺ ${prevNames}`,
          note: `직전 국의 도라 — 발동하면 ${prevNames}이(가) 나에게만 도라로 겹쳐진다 (나에게만 보인다)`,
        };
      }
      return null;
    }
    const names = kinds.map((kind) => formatTile({ kind })).join("·");
    return { chip: names, note: `이 사람에게만 도라가 되는 패 — ${names}` };
  }

  // 편식 — 퀘스트 진행도. 발동 뒤에는 아래 PILL_CUSTOM이 통일된 무늬를 그린다.
  if (augId === "picky_eater" && av[`picky_eater:${playerId}`] === undefined) {
    const m = av[`picky_eater:progress:${playerId}`] as
      | { suit?: string | null; count?: number; need?: number; failed?: boolean }
      | null;
    if (m === null || typeof m !== "object" || typeof m.count !== "number") return null;
    const need = m.need ?? 12;
    if (m.failed === true) {
      return { chip: "실패", note: "다른 무늬를 버려 이번 국 퀘스트는 깨졌다" };
    }
    if (m.count === 0) return null;
    const ko = m.suit == null ? "자패" : (SUIT_KO[m.suit] ?? m.suit);
    return {
      chip: `${m.count}/${need}`,
      note: `${ko}만 버리는 중 — ${need}장을 채우면 손패를 한 색으로 물들인다`,
    };
  }

  // 초읽기 — 테이블 전원에게 걸리는 제한이라 채널에 보유자가 없다
  if (augId === "time_pressure") {
    const sec = av["time_pressure"];
    if (typeof sec !== "number" || sec <= 0) return null;
    return { chip: `${sec}초`, note: `이번 국 전원의 모든 결정이 ${sec}초 제한이다` };
  }

  const raw = av[`${augId}:${playerId}`];

  /*
   * 남은 사용 횟수 — 횟수형 증강 공용 채널(`uses:{증강id}`, content/util publishUsesLeft).
   *
   * "게임 내 2회"라고 적힌 증강이 몇 번 남았는지가 화면 어디에도 없어서, 액티브 버튼이
   * 사라지고 나서야 소진을 알 수 있었다(2026-08-12 지적). 보유자 본인 채널이라 남의
   * pill에는 애초에 값이 없다.
   *
   * 예전에는 `raw === undefined`일 때만 세웠다 — 상태 뱃지를 함께 쓰는 증강(붉은 손길·
   * 일확천금·조커…)은 **발동한 국에 잔량이 통째로 묻혔다**(2026-08-15 "횟수류가 안
   * 나온다"). 이제 둘 다 있으면 상태 뱃지 뒤에 `·n회`로 붙여 함께 보여준다.
   */
  const uses = (isSelf ? av[`uses:${augId}`] : undefined) as
    | { left?: unknown; total?: unknown; scope?: unknown }
    | undefined;
  const usesStatus: PillStatus | null =
    uses !== undefined && uses !== null && typeof uses.left === "number"
      ? (() => {
          const left = uses.left as number;
          const total = typeof uses.total === "number" ? uses.total : left;
          const where = uses.scope === "round" ? "이번 국" : "게임 내";
          return {
            chip: `${left}회`,
            note:
              left > 0
                ? `${where} ${total}회 중 ${left}회 남음`
                : `${where} ${total}회를 모두 사용했다 — 더는 사용할 수 없다`,
            ...(left === 0 ? { tone: "spent" as const } : {}),
            ...(total > 0 ? { gauge: left / total } : {}),
          };
        })()
      : null;

  /** 상태 뱃지와 잔량을 한 pill에 합친다 (상태가 앞, 잔량이 뒤). */
  const withUses = (base: PillStatus | null): PillStatus | null => {
    if (usesStatus === null) return base;
    if (base === null) return usesStatus;
    return {
      ...base,
      chip: `${base.chip} · ${usesStatus.chip}`,
      note: `${base.note} — ${usesStatus.note}`,
      ...(usesStatus.gauge !== undefined ? { gauge: usesStatus.gauge } : {}),
    };
  };

  /*
   * 등가교환 — **누구와 바꾸기로 했는가**. 지정(swap3)한 순간부터 교환이 성사될
   * 때까지만 pill에 선다.
   *
   * 지정과 실제 교환 사이에는 순서가 몇 번 돌 수 있는데(넘길 3장을 고민하다 물러나면
   * 다음 순으로 넘어간다), 그동안 "누구를 찍어 뒀는지"가 화면 어디에도 없었다
   * (2026-08-15 사용자 요청). 교환이 끝나면 콘텐츠가 채널을 비우므로 이 칩도 함께
   * 사라진다 — 남은 잔량("n회")만 도로 남는다.
   */
  if (augId === "hand_swap3") {
    if (typeof raw !== "string" || raw === "") return usesStatus;
    const who = playerNameById(view, raw);
    return withUses({
      chip: `→ ${who}`,
      note: `${who}와(과) 바꾸기로 지정했다 — 넘길 내 3장과 가져올 상대 3장을 고르면 교환이 끝난다`,
    });
  }

  if (raw === undefined) return usesStatus;

  const custom = PILL_CUSTOM[augId];
  if (custom !== undefined) return withUses(custom(raw));
  const asNumber = PILL_NUMBER[augId];
  if (asNumber !== undefined && typeof raw === "number") return withUses(asNumber(raw));
  if (PILL_TEXT.has(augId) && typeof raw === "string" && raw !== "") {
    return withUses({ chip: raw, note: raw });
  }
  if (PILL_FLAG.has(augId) && raw === true) {
    return withUses({ chip: "발동", note: "이번 국에 발동했다" });
  }
  return usesStatus;
}

const NamePlate = memo(function NamePlate({
  view,
  player,
  catalog,
  tipUp,
  tipAlign,
  glow,
}: {
  view: PlayerView;
  player: PlayerInfo;
  catalog: Record<string, AugmentCatalogEntry>;
  /**
   * 지금 빛낼 증강 id들 — 액티브 증강 버튼에 손을 올린 동안 "그 버튼이 쓰는 증강"을
   * 가리킨다(내 이름표 전용). null이면 아무것도 빛나지 않는다.
   */
  glow?: ReadonlySet<string> | null;
  /** 증강 툴팁이 위로 뜨는지 (내 이름표는 화면 하단이라 위로). 기본 아래. */
  tipUp?: boolean;
  /** 툴팁 가로 정렬 — 화면 가장자리(좌·우 자리)에서 잘리지 않게 중앙 쪽으로 편다. 기본 center. */
  tipAlign?: "left" | "right" | "center";
}): JSX.Element {
  const isMe = player.id === view.playerId;
  const isTurn = view.round.turnSeat === player.seat;
  /*
   * 지금 판이 **선언을 기다리는 중**인가 (reaction 페이즈).
   *
   * 타패 뒤에도 `turnSeat`은 버린 사람 그대로다 — 차례 표시가 전부 그 값만 보므로,
   * 누군가 론·펑을 최대 30초 고민하는 동안 **방금 버린 사람에게 "차례"가 켜진 채**
   * 판이 멈춰 보였다. 접속 상태 칩은 "생각 중과 끊김을 구분하려고" 세워 뒀으면서,
   * 정작 그 "생각 중"에 해당하는 표시가 없었다.
   *
   * 누가 고민 중인지는 뷰에 없다(에이전트 계층의 정보다). 알 수 있는 것 — 지금이
   * 선언 대기 구간이라는 사실 — 만 정직하게 말한다.
   */
  const awaitingCall = view.round.phase === "reaction";
  const furiten = isMe && view.round.byPlayer[player.id]?.furiten === true;
  const noYaku = isMe && view.round.byPlayer[player.id]?.noYaku === true;
  // 후리텐 사유 — 같은 두 글자가 "한 순만 참으면 풀리는 일시 후리텐"과 "이 국은 끝난
  // 리치 후리텐"을 함께 가리켰다. 사유 문안은 이미 있는데(FURITEN_REASON_TEXT) 오름패
  // 뱃지에서만 쓰였고, 그 뱃지는 쯔모해서 14장인 내 차례에는 사라진다.
  const furitenReasons = isMe ? (view.round.byPlayer[player.id]?.furitenReasons ?? []) : [];
  // 일발이 살아 있는가 — 본인 뷰에만 오는 값이라 전원 공개 자리에는 못 놓는다.
  // 누가 울어서 일발이 깨졌는지가 화면에 남지 않아, 1판이 조용히 사라졌다.
  const ippatsu = isMe && view.round.byPlayer[player.id]?.ippatsu === true;
  // 무장해제로 이번 국 잠긴 이 사람의 증강 — 이름표의 pill에 쇠사슬을 채운다.
  // 잠금이 화면 어디에도 드러나지 않아 "무장해제가 안 먹는다"로 보였다(2026-08-01).
  const disarmed = disarmedAugmentsOf(view, player.id);
  const reloaded = reloadedAugmentsOf(view, player.id);
  // 수상한 주사위에서 굴러 나온 증강 — pill에 🎲를 붙여 출처를 남긴다
  const fromDice = cornucopiaGrantsOf(view, player.id);
  // 이 사람에게 걸린 지목 관계 — 판 위에 선을 긋는 대신 양쪽 이름표에 표식을 앉힌다.
  const { relations, hovered, setHovered } = useContext(RelationHoverContext);
  const myRelations = relationsAt(relations, player.id);
  // 증강 툴팁의 "자세히" — Shift를 누르고 있거나(데스크톱), 툴팁 안의 칩을 눌렀거나(터치)
  const shiftHeld = useShiftHeld();
  const [detailFor, setDetailFor] = useState<string | null>(null);
  /** 지금 툴팁을 펼쳐 놓은 증강 id — 이것 하나만 속을 그린다 (나머지는 pill만) */
  const [tipFor, setTipFor] = useState<string | null>(null);
  /**
   * 눌러서 **고정해 둔** 증강 id들 — 손을 떼도 설명이 그대로 서 있는다.
   *
   * hover/focus만으로는 "지금 이 증강이 무슨 조건이었지"를 판을 보면서 확인할 수가 없다.
   * 마우스를 떼는 순간 설명이 사라지므로, 설명을 읽는 동안에는 판을 못 보고 판을 보는
   * 동안에는 설명을 못 본다. 눌러 고정하면 둘을 나란히 놓을 수 있다.
   * 여러 개를 동시에 고정할 수 있다(다시 누르면 풀린다, Esc는 전부 푼다).
   */
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const togglePin = (a: string): void =>
    setPinned((cur) => {
      const next = new Set(cur);
      if (!next.delete(a)) next.add(a);
      return next;
    });
  // Esc — 고정한 설명이 판을 가릴 때 한 번에 걷는 손잡이. 고정한 게 없으면 안 건다
  // (연출 건너뛰기·모달 닫기 같은 다른 Esc 임자를 가로채지 않게).
  const hasPinned = pinned.size > 0;
  useEffect(() => {
    if (!hasPinned) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      setPinned(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPinned]);
  /*
   * 바깥을 누르면 고정을 전부 내린다.
   *
   * 예전에는 내리는 길이 **그 pill을 정확히 다시 누르기**와 Esc 둘뿐이었다. 열어 둔
   * 설명은 판 위를 덮는데, 판을 보려고 아무 데나 눌러도 그대로 서 있어서 "고정이 이상하다,
   * 안 꺼진다"가 됐다(2026-08-12 사용자 보고). 이제 펼쳐진 툴팁 **안쪽**이 아닌 곳을
   * 누르면 내려간다 — 툴팁 안의 "자세히" 칩·용어 링크는 그대로 눌린다.
   *
   * pointerdown으로 듣는다: click보다 먼저라, 다른 pill을 눌러 옮겨 갈 때
   * "이전 것 내리기 → 누른 것 고정하기"가 순서대로 일어난다.
   * 이름표마다 pinned가 따로라, 다른 자리의 pill을 눌러도 이 자리 것은 함께 내려간다.
   */
  useEffect(() => {
    if (!hasPinned) return;
    const onDown = (e: PointerEvent): void => {
      const el = e.target as HTMLElement | null;
      if (el !== null && el.closest(".aug-pill-pinned") !== null) return;
      setPinned(new Set());
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [hasPinned]);
  // 상대 이름표의 표식에 손이 올라가 있고 그 관계가 나를 향하면 나도 같이 빛난다
  const linked =
    hovered !== null && myRelations.some((r) => r.key === hovered);
  // 이름표에 세울 증강 pill.
  // 화수분(수상한 주사위)은 뺀다 — 획득 순간 증강 2개를 쏟고 역할이 끝나는 증강이라,
  // 쏟아진 2개가 이미 옆에 pill로 서 있는데 자기 이름까지 세우면 칸만 세 칸 먹는다
  // (2026-08-04 사용자 지적: 이 증강 하나로 이름표가 판을 가렸다).
  const pills = player.augments.filter((a) => a !== "cornucopia");
  // 5개 이상 — 정규 드래프트 최대치(반장전 4개)를 넘긴, 사실상 화수분을 먹은 사람이다.
  // 이름표를 빽빽 모드로 돌린다: 증강 pill과 지목 표식(np-rel)의 **이름만** 접어
  // 아이콘 칩으로 세운다. 툴팁·title은 그대로라 올려 보면 전부 읽을 수 있다.
  const dense = pills.length >= 5;
  // 봇이면 성향(원형) — 사람 좌석에는 붙지 않는다
  const arch = player.isBot ? archetypeInfo(player.archetype) : null;
  // 접속 상태 — "생각 중"과 "끊김"과 "기권"이 화면에서 구분되지 않아, 자동 처리를
  // 기다리는 몇 초가 그냥 멈춘 게임으로 보였다(QA P0-3b). 이름표에 세운다.
  const conn = player.connection ?? "connected";
  const connLabel =
    conn === "disconnected" ? "접속 끊김" : conn === "abandoned" ? "기권" : null;
  return (
    <div
      className={`nameplate${isTurn ? " nameplate-turn" : ""}${linked ? " nameplate-linked" : ""}${dense ? " nameplate-dense" : ""}${connLabel !== null ? ` nameplate-${conn}` : ""}`}
    >
      {isTurn ? (
        awaitingCall ? (
          <span className="np-turn np-turn-wait" title="다른 자리의 선언(론·펑·치·깡)을 기다리는 중입니다">
            선언 대기
          </span>
        ) : (
          <span className="np-turn" aria-label="현재 차례">차례</span>
        )
      ) : null}
      {connLabel !== null ? (
        <span
          className="np-conn"
          title={
            conn === "disconnected"
              ? "이 자리의 접속이 끊겼습니다 — 돌아올 때까지 결정이 자동 처리됩니다"
              : "이 자리는 기권했습니다 — 남은 국은 자동 진행됩니다"
          }
        >
          {connLabel}
        </span>
      ) : null}
      <span className="np-name" title={playerName(view, player)}>{playerName(view, player)}</span>
      {/* 봇 성향 — 이름만으로는 셋이 구분되지 않아서, 이름 옆에 원형을 세운다 */}
      {arch !== null ? (
        <span className="np-arch" title={`${arch.label} 봇 — ${arch.desc}`}>{arch.label}</span>
      ) : null}
      {pills.length > 0 ? (
        <span className="np-augs">
          {pills.map((a) => {
            const entry = catalog[a];
            const locked = disarmed.has(a);
            const status = augmentPillStatus(view, player.id, a);
            // 내부 쿨다운 잔량 — 보유자 본인 화면에만 실린다(view:{나}:cooldown:{id}).
            const cooldown = cooldownRoundsLeft(view, player.id, a);
            const cooldownTurns = cooldownTurnsLeft(view, player.id, a);
            // 선발동형("이번 국만")이 이미 지나갔는가 — 설명 배지도 함께 갈아 끼운다.
            const spent = view.augmentView[`spent:${a}:${player.id}`] === true;
            return (
              // tabIndex — 터치 기기에는 hover가 없다. 탭하면 포커스가 잡혀
              // :focus로 툴팁이 뜨고, 다른 곳을 탭하면 사라진다.
              //
              // 툴팁 속은 **올려놓기 전까지 만들지 않는다**(tipFor). 예전에는 pill마다
              // 이름·계열·잠금·쿨다운·퀘스트·용어 쪼갠 설명·더보기 토글이 전부 DOM에
              // 서 있고 CSS로 숨겨져만 있었다 — 이름표 4개 × 증강 4개면 16벌이 상시로
              // 살아서, 판이 한 번 다시 그려질 때마다 같이 다시 그려졌다.
              <span
                key={a}
                className={`aug-pill aug-prism${locked ? " aug-pill-locked" : ""}${cooldown > 0 || cooldownTurns > 0 ? " aug-pill-cd" : ""}${status !== null ? " aug-pill-live" : ""}${fromDice.has(a) ? " aug-pill-dice" : ""}${pinned.has(a) ? " aug-pill-pinned" : ""}${glow?.has(a) === true ? " aug-pill-usable" : ""}`}
                tabIndex={0}
                // 눌러서 설명을 고정한다 / 다시 눌러 푼다. 툴팁 **안쪽**("자세히" 칩·용어
                // 링크)을 누른 것은 여기까지 올라오면 안 된다 — 고정을 풀어 버린다.
                onClick={(e) => {
                  if (e.target !== e.currentTarget && (e.target as HTMLElement).closest(".aug-tip") !== null) return;
                  togglePin(a);
                }}
                onMouseEnter={() => setTipFor(a)}
                onMouseLeave={() => setTipFor((cur) => (cur === a ? null : cur))}
                onFocus={() => setTipFor(a)}
                onBlur={(e) => {
                  // 툴팁 **안쪽**("자세히" 칩·용어 링크)으로 포커스가 옮겨간 것은 떠난 게 아니다.
                  // React의 onBlur는 focusout이라 자식으로 옮겨도 올라온다 — 여기서 걸러야
                  // 툴팁이 손가락 밑에서 사라지지 않는다(CSS의 :focus-within과 같은 뜻).
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setTipFor((cur) => (cur === a ? null : cur));
                }}
              >
                <AugCatIcon id={a} />
                {locked ? "🔒 " : ""}
                {reloaded.has(a) ? "♻ " : ""}
                {fromDice.has(a) ? <span className="aug-pill-dice-mark" aria-hidden="true">🎲</span> : null}
                {/* 이름만 별도 span — 무장해제 취소선이 잔량 칩까지 그어지지 않게 */}
                <span className="aug-pill-name">{entry?.name ?? a}</span>
                {cooldown > 0 ? (
                  <span className="aug-pill-cd-chip" title={`쿨다운 — ${cooldown}국 남음`}>
                    🕐{cooldown}국
                  </span>
                ) : null}
                {/* 순 단위 쿨다운 — 국 단위와 같은 자리, 단위만 다르다 */}
                {cooldownTurns > 0 ? (
                  <span className="aug-pill-cd-chip" title={`쿨다운 — ${cooldownTurns}순 남음`}>
                    🕐{cooldownTurns}순
                  </span>
                ) : null}
                {status !== null ? (
                  <span
                    className={`aug-pill-chip${status.tone !== undefined ? ` aug-pill-chip-${status.tone}` : ""}`}
                  >
                    {status.chip}
                  </span>
                ) : null}
                {status?.gauge !== undefined ? (
                  <span className="aug-pill-gauge" aria-hidden="true">
                    <span style={{ transform: `scaleX(${status.gauge})` }} />
                  </span>
                ) : null}
                {pinned.has(a) ? (
                  <span className="aug-pill-pin-mark" aria-hidden="true">📌</span>
                ) : null}
                {/* 고정해 둔 것은 손을 떼도 그린다 — 그래야 판과 설명을 나란히 볼 수 있다 */}
                {tipFor === a || pinned.has(a) ? (
                <span className={`aug-tip${tipUp === true ? " aug-tip-up" : " aug-tip-down"} aug-tip-a-${tipAlign ?? "center"}`}>
                  <span className="aug-tip-name">
                    <AugCatIcon id={a} />
                    {entry?.name ?? a}
                  </span>
                  <span className="aug-tip-cat">{CATEGORY_META[augmentCategory(a)].label} 계열</span>
                  {locked ? (
                    <span className="aug-tip-locked">🔒 무장해제 — 이번 국 동안 잠김</span>
                  ) : null}
                  {cooldown > 0 ? (
                    <span className="aug-tip-cd">
                      🕐 쿨다운 — 지금은 쓸 수 없다 (앞으로 {cooldown}국)
                    </span>
                  ) : null}
                  {cooldownTurns > 0 ? (
                    <span className="aug-tip-cd">
                      🕐 쿨다운 — 지금은 쓸 수 없다 (앞으로 {cooldownTurns}순)
                    </span>
                  ) : null}
                  {reloaded.has(a) ? (
                    <span className="aug-tip-status">♻ 재장전 — 이 증강을 다시 쓸 수 있다</span>
                  ) : null}
                  {fromDice.has(a) ? (
                    <span className="aug-tip-status">🎲 수상한 주사위에서 굴러 나왔다</span>
                  ) : null}
                  {status !== null ? (
                    <span className="aug-tip-status">{status.note}</span>
                  ) : null}
                  {QUEST_GOAL[a] !== undefined ? (
                    <span className="aug-tip-quest">🎯 퀘스트 증강 — {QUEST_GOAL[a]}</span>
                  ) : null}
                  {isActiveAugment(a) ? (
                    <span className="aug-tip-active">⚡ 액티브 증강 (직접 발동)</span>
                  ) : null}
                  <span className="aug-tip-desc">
                    <AugDesc
                      id={a}
                      description={entry?.description}
                      variant="draft"
                      expanded={shiftHeld || detailFor === a}
                      useOverride={spent ? "효과 종료" : undefined}
                    />
                  </span>
                  <MoreToggle
                    open={shiftHeld || detailFor === a}
                    onToggle={() => setDetailFor((cur) => (cur === a ? null : a))}
                  />
                  {/* 고정 손잡이 — 툴팁 안에서도 내릴 수 있어야 한다. 툴팁이 pill을
                      덮고 있어 "다시 누르기"가 사실상 툴팁을 누르는 것이 되는데, 툴팁
                      안쪽 클릭은 고정 토글로 올라가지 않게 막혀 있어서 내릴 방법이
                      없어 보였다(2026-08-12 사용자 보고). 여기서 직접 토글한다. */}
                  <button
                    type="button"
                    className="aug-tip-pin"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(a);
                    }}
                  >
                    {pinned.has(a)
                      ? "📌 고정됨 — 눌러서 내리기 (Esc: 전부, 바깥을 눌러도 내려간다)"
                      : "📌 눌러서 이대로 띄워 두기"}
                  </button>
                </span>
                ) : null}
              </span>
            );
          })}
        </span>
      ) : null}
      {myRelations.length > 0 ? (
        <span className="np-rels">
          {myRelations.map((r) => {
            const outgoing = r.from === player.id;
            const other = playerNameById(view, outgoing ? r.to : r.from);
            return (
              // tabIndex — 터치에는 hover가 없다. 탭하면 포커스로 상대가 빛난다.
              <span
                key={r.key}
                className={`np-rel${outgoing ? " np-rel-out" : " np-rel-in"}${hovered === r.key ? " np-rel-on" : ""}`}
                style={{ color: r.color }}
                tabIndex={0}
                title={`${r.label} — ${playerNameById(view, r.from)} → ${playerNameById(view, r.to)}`}
                onMouseEnter={() => setHovered(r.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(r.key)}
                onBlur={() => setHovered(null)}
              >
                <span className="np-rel-icon">{r.icon}</span>
                <span className="np-rel-dir">{outgoing ? "→" : "←"}</span>
                <span className="np-rel-who">{other}</span>
              </span>
            );
          })}
        </span>
      ) : null}
      {ippatsu ? <span className="np-ippatsu" title="일발이 살아 있습니다 — 누가 울면 사라집니다">일발</span> : null}
      {furiten ? (
        <span
          className="np-furiten"
          title={
            furitenReasons.length > 0
              ? `${furitenReasons.map((r) => FURITEN_REASON_TEXT[r]).join(" · ")} — 론은 안 되고 쯔모로만 화료할 수 있습니다`
              : "론은 안 되고 쯔모로만 화료할 수 있습니다"
          }
        >
          후리텐
        </span>
      ) : null}
      {noYaku ? <span className="np-noyaku" title="텐파이지만 역이 없어 화료할 수 없습니다">역없음</span> : null}
    </div>
  );
});

// ─────────────────────────── 후로 묶음 ───────────────────────────

/**
 * 후로 자리(melds Zone)에 있지만 어떤 후로 묶음에도 속하지 않은 패 —
 * 지금은 북풍 상인의 **빼놓은 北**이 유일하다. 삼마처럼 후로 옆에 눕혀 그린다.
 *
 * 서버는 이 패에 Meld 항목을 만들지 않는다(멘젠 유지). 그래서 melds Zone의 tileIds에서
 * `round.byPlayer[p].melds`가 쓰는 id를 빼면 정확히 '빼놓은 패'만 남는다.
 */
function pulledMeldTileIds(view: PlayerView, pid: string): number[] {
  const zoneIds = view.zones[`melds:${pid}`]?.tileIds ?? [];
  if (zoneIds.length === 0) return [];
  const inMelds = new Set<number>();
  for (const m of view.round.byPlayer[pid]?.melds ?? []) {
    for (const id of m.tileIds) inMelds.add(id);
  }
  return zoneIds.filter((id) => !inMelds.has(id));
}

/**
 * 빼놓은 北 묶음 — 후로 줄 끝에 붙되 **눕히지 않는다**.
 * 눕힌 패는 "누구에게서 울었다"는 후로의 표식이라, 후로가 아닌 북빼기에 쓰면 오해를 부른다
 * (2026-07-26 유저 지적). 그래서 `called` 없이 그냥 세워 그린다.
 */
function PulledGroup({
  view,
  owner,
  layout,
  colSide,
}: {
  view: PlayerView;
  owner: PlayerInfo;
  layout: "row" | "col";
  colSide?: "left" | "right";
}): JSX.Element | null {
  const ids = pulledMeldTileIds(view, owner.id);
  if (ids.length === 0) return null;
  return (
    <span
      className={`${layout === "row" ? "meld meld-row" : "meld meld-col"} meld-pulled`}
      title="북풍 상인 — 빼놓은 北 (버림패가 아닙니다)"
    >
      {ids.map((id) => (
        <MeldTile
          key={id}
          layout={layout}
          colSide={colSide}
          tile={view.tiles[id]}
          owner={owner.id}
        />
      ))}
    </span>
  );
}

function MeldGroup({
  view,
  meld,
  owner,
  layout,
  colSide,
}: {
  view: PlayerView;
  meld: MeldView;
  owner: PlayerInfo;
  layout: "row" | "col";
  colSide?: "left" | "right";
}): JSX.Element {
  const n = view.players.length;
  const fromSeat =
    meld.calledFrom !== undefined
      ? view.players.find((p) => p.id === meld.calledFrom)?.seat
      : undefined;
  const rel = fromSeat !== undefined ? (((fromSeat - owner.seat) % n) + n) % n : 0;
  const cls = layout === "row" ? "meld meld-row" : "meld meld-col";

  /*
   * 안깡 — 양끝 두 장은 엎어 놓는 것이 마작의 표기다. 그런데 랭크가 섞이는 깡
   * (장사진의 1-2-3-4, 바람의 계보의 동남서북)은 가운데 두 장만 남으면 화면이
   * `( )2 3( )` · `( )남 서( )`가 되어 **무슨 깡인지 읽을 수 없었다**
   * (2026-08-15 사용자 지적). 네 장의 정체는 선언 시점에 이미 전원 공개라
   * 가리는 것이 규칙도 아니다 — 엎은 패 위에 실제 패를 옅게 겹쳐, "엎여 있다"는
   * 표기는 지키면서 무엇인지는 알아볼 수 있게 한다.
   *
   * 단 **같은 패 넉 장인 평범한 안깡에는 겹치지 않는다** — 가운데 둘만 봐도
   * 무엇의 깡인지 다 읽히는 자리에 반투명 얼굴을 얹으면 특수깡과 구별이 사라진다
   * (2026-08-17 사용자 지적). 반투명은 "여기 뭔가 다르다"는 신호로만 남긴다.
   */
  if (meld.kind === "kan_closed") {
    const s = sortTileIds(meld.tileIds, view.tiles);
    const first = view.tiles[s[0] ?? -1]?.kind;
    const mixed =
      first === undefined ||
      s.some((id) => {
        const k = view.tiles[id]?.kind;
        return k === undefined || kindKey(k) !== kindKey(first);
      });
    const hidden = (id: number | undefined): PublicTileView | undefined =>
      mixed ? view.tiles[id ?? -1] : undefined;
    return (
      <span className={cls}>
        <MeldTile layout={layout} colSide={colSide} back ghost={hidden(s[0])} />
        <MeldTile layout={layout} colSide={colSide} tile={view.tiles[s[1] ?? -1]} owner={owner.id} />
        <MeldTile layout={layout} colSide={colSide} tile={view.tiles[s[2] ?? -1]} owner={owner.id} />
        <MeldTile layout={layout} colSide={colSide} back ghost={hidden(s[3])} />
      </span>
    );
  }

  const others = sortTileIds(
    meld.tileIds.filter((id) => id !== meld.calledTileId),
    view.tiles,
  );

  // 가깡 — 더한 4장째를 울어 온 패 위에 겹쳐 쌓는다. 옆자리(col)도 같다:
  // 예전엔 row에서만 쌓아, 좌·우 상대의 가깡이 4장 일렬로 그려져 대명깡과
  // 구분되지 않았다(2026-08-01).
  if (meld.kind === "kan_added" && meld.calledTileId !== undefined) {
    const stackExtra = others[0];
    const upright = others.slice(1);
    const pos = rel === 3 ? 0 : rel === 2 ? 1 : upright.length;
    const stack = (
      <MeldStack
        key="stack"
        view={view}
        a={meld.calledTileId}
        b={stackExtra}
        owner={owner.id}
        layout={layout}
        colSide={colSide}
      />
    );
    const items: JSX.Element[] = [];
    upright.forEach((id, idx) => {
      if (idx === pos) items.push(stack);
      items.push(
        <MeldTile
          key={id}
          layout={layout}
          colSide={colSide}
          tile={view.tiles[id]}
          owner={owner.id}
        />,
      );
    });
    if (pos >= upright.length) items.push(stack);
    return <span className={cls}>{items}</span>;
  }

  const hasCalled = meld.calledTileId !== undefined;
  const pos = rel === 3 ? 0 : rel === 2 ? 1 : others.length;
  const items: JSX.Element[] = [];
  others.forEach((id, idx) => {
    if (hasCalled && idx === pos) {
      items.push(
        <MeldTile
          key="called"
          layout={layout}
          colSide={colSide}
          tile={view.tiles[meld.calledTileId!]}
          owner={owner.id}
          called
        />,
      );
    }
    items.push(
      <MeldTile key={id} layout={layout} colSide={colSide} tile={view.tiles[id]} owner={owner.id} />,
    );
  });
  if (hasCalled && pos >= others.length) {
    items.push(
      <MeldTile
        key="called"
        layout={layout}
        colSide={colSide}
        tile={view.tiles[meld.calledTileId!]}
        owner={owner.id}
        called
      />,
    );
  }
  return <span className={cls}>{items}</span>;
}

function MeldTile({
  tile,
  layout,
  colSide,
  called,
  back,
  ghost,
  owner,
}: {
  tile?: PublicTileView | undefined;
  layout: "row" | "col";
  colSide?: "left" | "right" | undefined;
  called?: boolean;
  back?: boolean;
  /**
   * 엎어 놓은 패 위에 **옅게** 겹쳐 그릴 실제 패 (안깡의 양끝).
   * 엎여 있다는 표기는 그대로 두고 정체만 읽히게 한다 — 안깡 네 장은 선언과 함께
   * 이미 전원 공개라 새로 새는 정보가 없다.
   */
  ghost?: PublicTileView | undefined;
  /** 후로의 주인 — 도라 반짝임 판정용 (뒷면 패는 필요 없다). */
  owner?: string | undefined;
}): JSX.Element {
  const lying = layout === "row" ? called === true : called !== true;
  const cls =
    layout === "row"
      ? lying
        ? "mtile mtile-row-lying"
        : "mtile mtile-row"
      : lying
        ? `mtile mtile-col-lying mtile-${colSide ?? "left"}`
        : "mtile mtile-col";
  return (
    <span className={cls} data-k={back === true ? undefined : highlightKey(tile)}>
      <span className="mtile-inner">
        {back === true ? (
          <>
            <span className="tile-back-face" />
            {ghost !== undefined ? (
              <span className="mtile-ghost" aria-hidden="true">
                <TileImg tile={ghost} size="fill" />
              </span>
            ) : null}
          </>
        ) : (
          <TileImg tile={tile} size="fill" {...(owner !== undefined ? { owner } : {})} />
        )}
      </span>
    </span>
  );
}

function MeldStack({
  view,
  a,
  b,
  owner,
  layout = "row",
  colSide,
}: {
  view: PlayerView;
  a: number;
  b?: number | undefined;
  /** 후로의 주인 — 도라 반짝임 판정용. */
  owner: string;
  /** 후로 줄 방향 — 옆자리(col)에서는 겹치는 방향이 90° 돌아간다 */
  layout?: "row" | "col";
  colSide?: "left" | "right" | undefined;
}): JSX.Element {
  const cls =
    layout === "row"
      ? "mtile mtile-stack"
      : `mtile mtile-stack-col mtile-${colSide ?? "left"}`;
  return (
    <span className={cls}>
      <span className="mtile-inner stack-a">
        <TileImg tile={view.tiles[a]} size="fill" owner={owner} />
      </span>
      {b !== undefined ? (
        <span className="mtile-inner stack-b">
          <TileImg tile={view.tiles[b]} size="fill" owner={owner} />
        </span>
      ) : null}
    </span>
  );
}

// ─────────────────────────── 손패 드래그 ───────────────────────────

/**
 * 손패 드래그 상태 — 드래그 패는 포인터를 그대로 따라가고(리프트), 나머지 패는
 * transform으로 슬라이드해 삽입 자리를 실시간으로 비워준다. 놓으면 그 자리로 안착.
 */
interface HandDragState {
  id: number;
  pointerId: number;
  /** 드래그 시작 시점의 표시 순서 — 드래그 중 DOM 순서는 이걸로 고정한다 */
  order: number[];
  fromIdx: number;
  /** order 인덱스별 슬롯 중심 X (드래그 시작 시 1회 측정, 피드백 루프 방지) */
  slotCenter: number[];
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  /** 드래그 패가 놓일 최종 인덱스 (0..N-1) */
  targetIdx: number;
  /** 임계값 이상 움직여 실제 드래그가 시작됐는가 (아니면 그냥 클릭) */
  moved: boolean;
  /** 지금 바닥 드롭존(버리기) 위에 있는가 */
  overDiscard: boolean;
  /** 놓은 뒤 최종 자리로 애니메이션하는 중 */
  settling: boolean;
}

const HAND_DRAG_THRESHOLD = 5;

/** 커서 X로 드래그 패의 최종 인덱스를 구한다 (자기 원래 슬롯은 건너뛴다). */
function handDragTargetIdx(
  slotCenter: number[],
  fromIdx: number,
  curX: number,
): number {
  let t = 0;
  for (let i = 0; i < slotCenter.length; i++) {
    if (i === fromIdx) continue;
    if (curX > slotCenter[i]!) t++;
  }
  return t;
}

/** order에서 dragged를 targetIdx로 옮긴 새 순서를 만든다. */
function handReordered(order: number[], id: number, targetIdx: number): number[] {
  const others = order.filter((x) => x !== id);
  others.splice(targetIdx, 0, id);
  return others;
}

// ─────────────────────────── 내 영역 ───────────────────────────

/**
 * 프롬프트 제한시간 게이지.
 *
 * 서버는 **모든 프롬프트**에 실제 마감(`deadlineMs`)을 실어 보낸다. 예전에는
 * 초읽기(time_pressure)가 걸린 국에만 실어서, 평소의 30초 제한이 화면 어디에도
 * 없었다 — 자리를 잠깐 비운 사람이 론을 조용히 흘렸다(QA P0-5).
 *
 * 대신 **조용하게 시작해 급해질수록 커진다**. 매 타패마다 30초 시계가 큼직하게
 * 뛰면 판보다 시계를 보게 된다:
 * - 10초 넘게 남았으면 가는 막대만 (지금까지와 같은 모습)
 * - 10초 이하로 남으면 남은 초를 숫자로 띄우고
 * - 5초 이하면 막대를 굵게·붉게 하고 숫자를 맥동시킨다
 * 초읽기 국(마감이 애초에 5~10초)에서는 뜨자마자 이 단계로 들어가므로, 예전의
 * "굵은 붉은 게이지 + 숫자"가 그대로 재현된다.
 */
/** 숫자를 띄우기 시작하는 잔여 시간 */
const TIMER_COUNT_MS = 10_000;
/** 굵게·붉게 전환하는 잔여 시간 */
const TIMER_URGENT_MS = 5_000;

function PromptTimer(props: {
  seq: number;
  deadline: number | null;
  /** 시간이 다 되면 서버가 대신 하는 일 (없으면 안내하지 않는다) */
  onTimeout?: string | null;
}): JSX.Element {
  const { deadline } = props;
  const [left, setLeft] = useState<number | null>(
    deadline === null ? null : Math.max(0, deadline - Date.now()),
  );
  useEffect(() => {
    if (deadline === null) {
      setLeft(null);
      return;
    }
    setLeft(Math.max(0, deadline - Date.now()));
    const t = setInterval(() => setLeft(Math.max(0, deadline - Date.now())), 100);
    return () => clearInterval(t);
  }, [deadline]);

  // 게이지 길이는 **이 마감을 처음 본 순간의 남은 시간**으로 한 번만 정한다.
  // 렌더마다 다시 계산하면(0.1초마다 다시 렌더된다) CSS 애니메이션의 duration이 계속
  // 줄어드는데, 진행도는 `경과/duration`이라 막대가 실제 시간의 두 배 속도로 비었다.
  const total = useMemo(
    () => (deadline === null ? null : Math.max(0, deadline - Date.now())),
    [deadline],
  );
  // 남은 시간에 따라 조용함 → 숫자 → 경고 순으로 단계가 올라간다.
  const showCount = left !== null && left <= TIMER_COUNT_MS;
  const urgent = left !== null && left <= TIMER_URGENT_MS;
  return (
    <div
      className={`prompt-timer${urgent ? " prompt-timer-urgent" : ""}`}
      // 마감이 바뀌면 새로 마운트해 애니메이션을 처음부터 돌린다
      key={`${props.seq}:${deadline ?? "none"}`}
      {...(props.onTimeout != null ? { title: props.onTimeout } : {})}
    >
      <div
        className="prompt-timer-fill"
        style={
          total === null
            ? undefined
            : ({ "--timer-duration": `${total}ms` } as CSSProperties)
        }
      />
      {showCount && left !== null ? (
        <span className="prompt-timer-count">{(left / 1000).toFixed(1)}초</span>
      ) : null}
      {/* 급해진 구간에서만 실제로 띄운다 — 상시로 세워 두면 판을 가리기만 한다 */}
      {urgent && props.onTimeout != null ? (
        <span className="prompt-timer-note">{props.onTimeout}</span>
      ) : null}
    </div>
  );
}

function OwnArea(props: {
  view: PlayerView;
  me: PlayerInfo;
  prompt: PromptMessage["prompt"] | null;
  promptSeq: number;
  /** 초읽기가 걸린 국의 결정 마감 시각(epoch ms). 평소에는 null */
  promptDeadline: number | null;
  riichiMode: boolean;
  catalog: Record<string, AugmentCatalogEntry>;
  autoSort: boolean;
  showMyWaits: boolean;
  /** 두 번 눌러 버리기 — 첫 탭은 패를 들어 올리고 두 번째에 나간다 (감사 §5-2) */
  tapTwiceToDiscard: boolean;
  /** 좁은 화면에서 손패 바로 위에 눕는 빠른 토글 (모바일 전용, CSS가 표시를 결정) */
  quickToggles?: JSX.Element;
  onRiichiMode: (v: boolean) => void;
  onSubmit: (o: ActionOption) => void;
  onHoverKind: (k: TileKind | null) => void;
  onToast?: (text: string) => void;
  /** 내 손패 배치를 서버에 알린다 — 다른 사람도 같은 배치(뒷면)를 본다 */
  onHandOrder?: (tileIds: number[]) => void;
}): JSX.Element {
  const { view, me, prompt, autoSort } = props;
  // 관전 모드에서는 하단 시점 플레이어(me)의 손패를 그대로 보여준다
  const isSpectator = view.playerId === SPECTATOR_ID;
  const rawHand = view.zones[`hand:${me.id}`]?.tileIds ?? [];
  const myMelds = view.round.byPlayer[me.id]?.melds ?? [];
  // 북풍 상인으로 빼놓은 北 — 후로가 하나도 없어도 후로 자리를 띄워야 한다
  const myPulled = pulledMeldTileIds(view, me.id);
  const myMeldCount = view.round.byPlayer[me.id]?.meldCount ?? 0;
  const myPrompt = prompt !== null && prompt.player === view.playerId ? prompt : null;
  const isMyTurn = view.round.turnSeat === me.seat;
  const riichiDeclared = !isSpectator && view.round.byPlayer[me.id]?.riichiDeclared === true;

  const drawnId = view.round.myDrawnTile;
  const hasDrawn = drawnId !== null && rawHand.includes(drawnId);

  /*
   * 보조기술에 **차례를 알린다** (감사 §6-3).
   *
   * 예전에는 live region이 연출 큐 하나뿐이었다. 리치·후로·화료처럼 큐를 지나는
   * 사건은 들렸지만, 정작 **내 차례가 왔다 · 무엇을 쯔모했다** 는 맥동과 게이지로만
   * 표현돼 화면을 못 보는 사람에게는 아무 신호가 없었다. 게임에서 가장 자주,
   * 가장 중요하게 알아야 할 두 가지가 빠져 있던 셈이다.
   *
   * 문장을 만들 때만 값이 바뀌게 묶어 둔다 — 매 렌더 같은 문자열을 새로 넣으면
   * 스크린리더가 같은 말을 반복해서 읽는다.
   */
  const turnAnnounce = useMemo(() => {
    if (isSpectator || !isMyTurn) return "";
    const drawn = hasDrawn && drawnId !== null ? formatTile(view.tiles[drawnId]) : null;
    return drawn !== null ? `내 차례입니다. ${drawn} 쯔모.` : "내 차례입니다.";
  }, [isSpectator, isMyTurn, hasDrawn, drawnId, view.tiles]);

  // 수동 정렬용 순서 (자동정렬 OFF일 때만 사용).
  // 패 id는 게임 내내 0~135로 고정 재사용되므로 국이 바뀌어도 자동 초기화되지 않는다 →
  // 국이 바뀌면(roundKey 변경) 지난 국의 정렬이 새 손패로 새어 들어가지 않게 직접 비운다.
  const [manualOrder, setManualOrder] = useState<number[]>([]);
  const roundKeyStr = `${view.round.prevalentWind}-${view.round.roundNumber}-${view.round.honba}`;
  useEffect(() => {
    setManualOrder([]);
  }, [roundKeyStr]);
  /*
   * 자동정렬을 **켜면** 손수 섞어 둔 배치를 버린다.
   *
   * 예전에는 `manualOrder`가 그대로 살아 있어서, 자동정렬을 껐다 켰다 다시 꺼도 예전에
   * 섞어 둔 그 배치가 되살아났다 — "자동정렬을 껐는데 정리가 안 된다"로 보인다
   * (2026-08-17 사용자 보고). 자동정렬은 "지금 배치를 버리고 규칙대로 세운다"는 뜻이므로
   * 켜는 순간이 곧 초기화 시점이다. 그래서 다시 끄면 방금 정렬된 순서에서 새로 시작한다.
   */
  useEffect(() => {
    if (autoSort) setManualOrder([]);
  }, [autoSort]);
  const [hoverId, setHoverId] = useState<number | null>(null);
  /**
   * "두 번 눌러 버리기"에서 첫 번째로 눌린 패 — 한 번 더 누르면 이 패가 나간다.
   * 프롬프트가 바뀌면 비운다(아래 effect): 지난 순에 들어 올려 둔 패가 다음 순까지
   * 남아 있으면, 무심코 한 번 누른 것이 곧바로 타패가 된다.
   */
  const [armedTileId, setArmedTileId] = useState<number | null>(null);
  // 포인터 드래그 상태 (손패 재정렬 + 바닥 버리기). state는 렌더용, ref는 핸들러용.
  const [drag, setDrag] = useState<HandDragState | null>(null);
  const dragRef = useRef<HandDragState | null>(null);
  const setDragBoth = (next: HandDragState | null): void => {
    dragRef.current = next;
    setDrag(next);
  };
  const handRef = useRef<HTMLDivElement | null>(null);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);
  // 드래그(재정렬/버리기) 직후에 딸려오는 click 이벤트를 한 번 무시한다.
  const suppressClickRef = useRef(false);
  // 재정렬 확정 순간 한 프레임만 트랜지션을 끈다 (DOM 재정렬 + transform 제거가
  // 동시에 일어날 때 생기는 튐 방지). 다음 프레임에 다시 켠다.
  const [committing, setCommitting] = useState(false);
  /*
   * 쯔모패가 손패를 떠날 때(쯔모기리·버려서 나감) 170ms만 남기는 잔상.
   * 레일이 그 자리를 비워 둔 채로 두므로 잔상이 사라져도 나머지 패는 안 움직인다 —
   * 잔상은 "방금 여기 있던 패가 나갔다"를 보여 주기만 한다.
   * 다른 패를 버려 쯔모패가 손에 남은 경우(손버림)에는 잔상이 없다.
   */
  const [ghostDrawn, setGhostDrawn] = useState<number | null>(null);
  const prevDrawnRef = useRef<number | null>(null);
  const rawHandRef = useRef(rawHand);
  rawHandRef.current = rawHand;
  useEffect(() => {
    const prev = prevDrawnRef.current;
    prevDrawnRef.current = hasDrawn ? drawnId : null;
    // 새 쯔모가 들어오면 지난 잔상은 즉시 접는다 (자리가 겹치지 않게)
    if (hasDrawn) {
      setGhostDrawn(null);
      return;
    }
    if (prev === null) return;
    // 손에 남아 있으면(손버림) 나간 게 아니다. 국이 끝나 손패가 통째로 비면 잔상도 없다.
    const hand = rawHandRef.current;
    if (hand.length === 0 || hand.includes(prev)) return;
    setGhostDrawn(prev);
  }, [drawnId, hasDrawn]);
  useEffect(() => {
    if (ghostDrawn === null) return;
    const t = window.setTimeout(() => setGhostDrawn(null), 170);
    return () => window.clearTimeout(t);
  }, [ghostDrawn]);
  // 손패 클릭 선택 모드: 액티브 증강(염색 등)을 고르면 손패를 클릭해 대상을 정한다.
  // 무장 상태는 게임판 전체가 공유하므로 SelectionContext에서 읽는다
  // (상대·바닥 클릭도 같은 무장을 소비). armSub만 손패 국지 상태로 남긴다
  // (한 패에 선택지가 여럿일 때 — 무늬·±1).
  const sel = useContext(SelectionContext);
  const armedAug = sel.armedType;
  const swapTarget = sel.swapTarget;
  const swapGive = sel.swapGive;
  const [armSub, setArmSub] = useState<{ tileId: number; options: ActionOption[] } | null>(null);

  const displayIds = useMemo(() => {
    // 관전 시점에서는 **그 사람이 정한 배치**를 그대로 보여준다 —
    // 뷰의 손패 순서가 곧 소유자의 배치다 (core arrangeHand). 여기서 다시 정렬하면
    // 관전자만 다른 순서를 보게 된다.
    if (isSpectator) return rawHand;
    if (autoSort) {
      const base = hasDrawn ? rawHand.filter((id) => id !== drawnId) : rawHand;
      const sorted = sortTileIds(base, view.tiles);
      return hasDrawn && drawnId !== null ? [...sorted, drawnId] : sorted;
    }
    // 수동 정렬: 기존 순서 유지, 아직 배치 안 한 패는 정렬해 뒤에 붙이되
    // 새로 뽑은 쯔모패는 자동정렬과 똑같이 맨 끝에 둔다 (기본 배치가 자연스럽게).
    const inHand = new Set(rawHand);
    const kept = manualOrder.filter((id) => inHand.has(id));
    const keptSet = new Set(kept);
    let remaining = rawHand.filter((id) => !keptSet.has(id));
    const drawnPending = hasDrawn && drawnId !== null && !keptSet.has(drawnId);
    if (drawnPending) remaining = remaining.filter((id) => id !== drawnId);
    const added = sortTileIds(remaining, view.tiles);
    return drawnPending ? [...kept, ...added, drawnId] : [...kept, ...added];
  }, [isSpectator, autoSort, rawHand, manualOrder, drawnId, hasDrawn, view.tiles]);

  // 손패 배치를 서버에 올린다 — 다른 사람은 뒷면이지만 **자리는 이 배치 그대로** 보고,
  // 관전·투시로 공개되면 내가 실제로 쥔 순서가 보인다.
  // 순서가 진짜로 바뀐 경우에만 보낸다 (매 렌더 전송 방지).
  const sentOrderRef = useRef<string>("");
  const onHandOrder = props.onHandOrder;
  useEffect(() => {
    if (onHandOrder === undefined || isSpectator) return;
    const key = displayIds.join(",");
    if (key === sentOrderRef.current) return;
    sentOrderRef.current = key;
    onHandOrder(displayIds);
  }, [displayIds, onHandOrder, isSpectator]);

  const optionsByTile = useMemo(() => {
    const map = new Map<number, ActionOption[]>();
    for (const o of myPrompt?.options ?? []) {
      const t = (o.payload as { tileId?: unknown })?.tileId;
      if (typeof t === "number") map.set(t, [...(map.get(t) ?? []), o]);
    }
    return map;
  }, [myPrompt]);

  // 손패 클릭 선택 모드: armed 액션의 옵션을 tileId별로 모은다
  const armedByTile = useMemo(() => {
    const map = new Map<number, ActionOption[]>();
    if (armedAug === null) return map;
    for (const o of myPrompt?.options ?? []) {
      if (o.type !== armedAug) continue;
      const t = (o.payload as { tileId?: unknown })?.tileId;
      if (typeof t === "number") map.set(t, [...(map.get(t) ?? []), o]);
    }
    return map;
  }, [armedAug, myPrompt]);

  // ⚠ 레거시(48차 이전 등가교환 = 상대 × 내 3장 조합). 지금 swap3 payload는 `{target}`뿐이라
  // byKey가 비고 ARM_MODE.swap3도 "opp"여서 이 경로는 실행되지 않는다.
  // 3:3 교환 선택은 아래 swap3Pick 모달이 담당한다.
  const swap3 = useMemo(() => {
    const targets: string[] = [];
    const byKey = new Map<string, ActionOption>();
    for (const o of myPrompt?.options ?? []) {
      if (o.type !== "swap3") continue;
      const p = o.payload as { target?: unknown; give?: unknown };
      if (typeof p.target !== "string" || !Array.isArray(p.give)) continue;
      if (!targets.includes(p.target)) targets.push(p.target);
      const key = `${p.target}|${[...(p.give as number[])].sort((a, b) => a - b).join(",")}`;
      byKey.set(key, o);
    }
    return { targets, byKey };
  }, [myPrompt]);

  // 무장 무효화(프롬프트 변경)·swap3 상태 정리는 SelectionContext(GameTable)가 소유한다.
  // armed 액션이 사라지면 손패 국지 상태(armSub)만 여기서 함께 정리한다.
  useEffect(() => {
    if (armedAug === null) setArmSub(null);
  }, [armedAug]);

  // 상대를 정한 뒤 내 패에서 3장을 고르면 그 조합에 맞는 옵션을 제출한다.
  const pickSwapTile = (id: number): void => {
    if (swapTarget === null) return;
    const has = swapGive.includes(id);
    const next = has
      ? swapGive.filter((x) => x !== id)
      : swapGive.length >= 3
        ? swapGive
        : [...swapGive, id];
    if (next.length === 3) {
      const key = `${swapTarget}|${[...next].sort((a, b) => a - b).join(",")}`;
      const opt = swap3.byKey.get(key);
      if (opt !== undefined) {
        sel.submit(opt);
        return;
      }
    }
    sel.setSwapGive(next);
  };

  const armName = armedAug !== null ? (ACTION_LABEL[armedAug] ?? armedAug) : "";
  const areaRef = useRef<HTMLDivElement>(null);

  /*
   * 내 영역이 실제로 차지하는 아래쪽 띠 높이를 `--own-band`로 올려 준다.
   * 중앙 보드(패널 + 네 바닥)는 이 값을 빼고 남는 자리 안에서만 크기와 위치를
   * 잡는다(styles.css `.table` / `.table-center`) — 안 그러면 내 버림패가 내
   * 이름표·액티브 증강 버튼·손패 밑으로 흘러들어가 읽히지 않는다(docs/28 §2-3·§2-4).
   *
   * **잠깐 떴다 사라지는 줄(액션 바·프롬프트 타이머·무장 안내)은 빼고 잰다.** 넣으면
   * 치·펑 프롬프트가 뜰 때마다 보드 전체가 크기를 바꿔 판이 출렁인다. 그 줄들은
   * 바닥 아래쪽 한두 단을 잠시 덮는 선에서 끝나고, 점수판(패널 안)에는 닿지 않는다.
   *
   * 되먹임은 없다: 손패·이름표 크기는 cqw/cqmin에만 걸려 있고 `--board`와 무관하다.
   * 값이 그대로면 아무것도 쓰지 않으므로 리렌더가 잦아도 비용은 offsetHeight 읽기뿐이다.
   */
  const ownBandRef = useRef(-1);
  // 렌더마다 다시 잰다(의존성 배열 없음). ResizeObserver를 먼저 써 봤는데, 손패가
  // 채워지거나 화면 크기가 바뀌어 띠가 자라도 콜백이 오지 않는 경우가 있어 띠가 낡았다.
  // 렌더는 뷰가 올 때마다 도므로 이쪽이 확실하다.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (area === null) return;
    const root = area.closest(".game-root");
    if (!(root instanceof HTMLElement)) return;
    const cs = getComputedStyle(area);
    const gap = Number.parseFloat(cs.rowGap) || 0;
    const inset = Number.parseFloat(cs.bottom) || 0;
    let h = area.offsetHeight;
    for (const el of area.children) {
      if (!(el instanceof HTMLElement)) continue;
      // ⚠ 이 목록은 styles.css 의 `order: -1` 목록과 **같아야 한다**.
      if (!el.matches(".action-bar, .prompt-timer, .arm-hint")) continue;
      h -= el.offsetHeight + gap;
    }
    /*
     * 4px 격자로 올림한다. 실측값은 글꼴·소수점 높이 탓에 같은 화면에서도 289↔290px로
     * 1px씩 떨린다(2026-08-12 실측). 그 1px이 그대로 --board로, 다시 바닥 타일 폭으로
     * 내려가면 버림패가 매 순 미세하게 크기를 바꾼다 — 사람 눈에는 "판이 흔들린다"로
     * 읽힌다. 올림이라 자리가 모자라는 쪽으로는 절대 틀리지 않는다(최대 3px 더 비운다).
     */
    const band = Math.max(0, Math.ceil((h + inset) / 4) * 4);
    if (band === ownBandRef.current) return;
    ownBandRef.current = band;
    root.style.setProperty("--own-band", `${band}px`);
  });

  // 대국을 나가면 내 영역도 없다 — 띠를 남겨 두면 로비에서 rotate-hint가 붕 뜬다.
  useLayoutEffect(() => {
    const root = areaRef.current?.closest(".game-root") ?? null;
    return () => {
      ownBandRef.current = -1;
      if (root instanceof HTMLElement) root.style.removeProperty("--own-band");
    };
  }, []);

  // 봉인되어 버릴 수 없는 내 손패(tileId) — 자물쇠 표시 + 클릭 안내용.
  // 서버가 종류 봉인·개별 패 봉인을 합쳐 최종 판정한 결과라 판정과 표시가 어긋나지 않는다.
  // (예전엔 종류 목록만 받아, 봉인 뒤 새로 쯔모한 같은 종류에도 자물쇠가 그려졌다.)
  const sealedSet = useMemo(
    () => new Set(view.round.byPlayer[me.id]?.sealedTileIds ?? []),
    [view, me.id],
  );

  /*
   * 지뢰 탐지 — 스캔한 순간 "버리면 방총"이던 내 손패 종류(kindKey).
   * 왼쪽 위 대신 실제 손패 위에 ⚠로 표시한다. 갱신되지 않는 스냅샷이라 몇 순
   * 기준인지 함께 들고 다니며 ⚠ 툴팁에 밝힌다.
   */
  const dangerScan = useMemo(() => {
    if (isSpectator) return { set: new Set<string>(), turn: null as number | null };
    const snap = readScanSnapshot(view.augmentView["danger_sense"], "kinds");
    return { set: new Set(snap.items), turn: snap.turn };
  }, [view.augmentView, isSpectator]);
  const dangerSet = dangerScan.set;

  // 삼세 예지 — 내 다음 쯔모 3장(종류). 왼쪽 위 대신 손패 바로 위 스트립에 크게 보여준다.
  const nextTsumoKinds = useMemo<TileKind[]>(() => {
    if (isSpectator) return [];
    const v = view.augmentView["triple_peek"];
    return Array.isArray(v)
      ? (v as string[]).map(parseKindKey).filter((k): k is TileKind => k !== null)
      : [];
  }, [view.augmentView, isSpectator]);

  // 밑장빼기 — 패산 맨 밑 3장. 열람 증강이 visibility.wall을 peek(back)으로 열어 주므로
  // 뷰의 wall 존에 **실물 tileId**가 들어온다(삼세 예지처럼 kind 스냅샷이 아니다).
  // 매 상태마다 다시 계산되니 다른 증강이 밑에 패를 밀어 넣으면 창이 그대로 따라 밀린다.
  const bottomWallIds = useMemo<number[]>(() => {
    if (isSpectator) return [];
    return [...(view.zones["wall"]?.tileIds ?? [])];
  }, [view.zones, isSpectator]);
  // 다음 쯔모를 밑장으로 예약해 뒀는가 (선언 사실은 전원 공개, 무엇이 보이는지는 나만)
  const bottomDealArmed = useMemo(() => {
    if (isSpectator) return false;
    return view.augmentView[`bottom_deal:armed:${me.id}`] === true;
  }, [view.augmentView, me.id, isSpectator]);

  // 등가교환 3:3 교환 — 넘길 내 3장(swap3_give) → 가져올 상대 3장(swap3_take)을
  // 각각 '한 번에' 고른다. 서버는 3장 조합(정렬된 배열)을 통째로 후보로 보내므로,
  // 정렬 키로 인덱싱해 두고 세 번째 클릭에서 완전일치 옵션을 제출한다.
  const swap3Pick = useMemo(() => {
    const byKey = new Map<string, ActionOption>();
    const pool: number[] = [];
    let stage: "give" | "take" | null = null;
    for (const o of myPrompt?.options ?? []) {
      const raw =
        o.type === "swap3_give"
          ? (o.payload as { gives?: unknown }).gives
          : o.type === "swap3_take"
            ? (o.payload as { takes?: unknown }).takes
            : undefined;
      if (!Array.isArray(raw) || raw.length !== 3) continue;
      if (!raw.every((x) => typeof x === "number")) continue;
      if (stage === null) stage = o.type === "swap3_give" ? "give" : "take";
      const nums = raw as number[];
      byKey.set([...nums].sort((a, b) => a - b).join(","), o);
      for (const id of nums) if (!pool.includes(id)) pool.push(id);
    }
    // 모달에 펼치는 패는 게임판의 손패와 같은 순서로 — id 순이 아니라 패 순으로 정렬한다
    return { byKey, pool: sortTileIds(pool, view.tiles), stage };
  }, [myPrompt, view.tiles]);
  const canSwapTake = swap3Pick.stage !== null;
  const [swap3Sel, setSwap3Sel] = useState<number[]>([]);
  const [swapTakeDismissed, setSwapTakeDismissed] = useState(false);
  useEffect(() => {
    setSwap3Sel([]);
    setSwapTakeDismissed(false);
    // 들어 올려 둔 패도 함께 내린다. 지난 순의 선택이 다음 순까지 남아 있으면
    // 무심코 한 번 누른 것이 곧바로 타패가 된다 — 두 번 누르게 한 이유가 사라진다.
    setArmedTileId(null);
  }, [props.promptSeq]);
  // 3장을 채우면 그 조합에 해당하는 옵션을 그대로 제출한다.
  const toggleSwap3 = (id: number): void => {
    setSwap3Sel((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur;
      const next = [...cur, id];
      if (next.length === 3) {
        const opt = swap3Pick.byKey.get([...next].sort((a, b) => a - b).join(","));
        if (opt !== undefined) {
          props.onSubmit(opt);
          setSwapTakeDismissed(true);
          return [];
        }
      }
      return next;
    });
  };

  // 미래를 보는 자 — 패산 위 3장과 바꿀 손패를 모달에서 **한 장씩 세 번** 고른다.
  // (2026-08-15 이전에는 무작위 3장 중 '바닥에 버릴' 한 장을 고르는 창이었다.)
  const futurePick = useMemo(() => {
    const byTile = new Map<number, ActionOption>();
    for (const o of myPrompt?.options ?? []) {
      if (o.type !== "future_exchange") continue;
      const t = (o.payload as { tileId?: unknown }).tileId;
      if (typeof t !== "number") continue;
      byTile.set(t, o);
    }
    return byTile;
  }, [myPrompt]);
  const canPickFuture = futurePick.size > 0;
  /**
   * 제출 직후 모달을 즉시 내리기 위한 로컬 플래그 (닫기 버튼은 없다 — 발동은 되돌릴 수
   * 없으므로 "발동하지 않고 진행"이라는 출구를 두지 않는다). 새 프롬프트가 오면 풀린다.
   */
  const [futureDismissed, setFutureDismissed] = useState(false);
  useEffect(() => {
    setFutureDismissed(false);
  }, [props.promptSeq]);

  // 영상패 선택 모달 — 절벽 위에 피어난 꽃(bloom_pick) 전용.
  // (2026-07-26까지 도박사의 손(take_rinshan)과 공용이었다. 그 증강은 밑장빼기로 대체됐고,
  //  밑장빼기는 고를 자리가 없는 단순 예약 버튼이라 모달을 쓰지 않는다.)
  const rinshanOptions = useMemo(() => {
    const byIdx = new Map<number, ActionOption>();
    for (const o of myPrompt?.options ?? []) {
      if (o.type !== "bloom_pick") continue;
      const idx = (o.payload as { index?: unknown })?.index;
      if (typeof idx !== "number") continue;
      byIdx.set(idx, o);
    }
    return byIdx;
  }, [myPrompt]);
  // 영상패 선택은 **내 turn.act 안에서만** 유효하다(서버 validate와 동일). 프롬프트가
  // 응답 없이 지나가면(시간 초과 등) 모달이 남아 판을 가리므로 뷰 기준으로도 닫는다.
  const canPickRinshan =
    rinshanOptions.size > 0 && isMyTurn && view.round.phase === "turn.act";
  // 절벽 위 꽃(bloom)은 깡 직후의 강제 선택이라 자동으로 뜬다.
  const [rinshanDismissed, setRinshanDismissed] = useState(false);
  useEffect(() => {
    setRinshanDismissed(false);
  }, [props.promptSeq]);
  // 내 턴 버림 프롬프트인가 — 봉인 패 클릭 안내는 실제로 버릴 차례일 때만 띄운다
  const promptHasDiscard =
    myPrompt?.options.some(
      (o) => o.type === "discard" || o.type === "free_discard" || o.type === "riichi",
    ) ?? false;

  /**
   * 액티브 증강 버튼에 손이 올라가 있는 동안 **지금 쓸 수 있는 증강 id들**.
   *
   * "액티브 증강 (2)"의 2가 넷 중 어느 둘인지가 화면 어디에도 없었다 — 버튼을 눌러
   * 메뉴를 열어야 알 수 있었고, 그러면 판을 보면서 확인할 수가 없다(2026-08-15 요청).
   * 버튼과 이름표 pill은 같은 줄(.own-top-main)에 나란히 서 있으므로, 올려놓는 동안
   * 그 pill들을 빛내면 둘 사이가 눈으로 이어진다.
   */
  const [usableHint, setUsableHint] = useState<ReadonlySet<string> | null>(null);

  // 자유 선언으로 고정된 오름패 (있으면 물리 손패와 무관하게 이게 진짜 대기다)
  const frozenWaits = useMemo<TileKind[]>(
    () => (isSpectator ? [] : freeDeclareWaits(view, me.id)),
    [view, me.id, isSpectator],
  );

  // 이 패를 버렸을 때의 화료패(대기) — 텐파이면 hover 시 미리 보여준다 (클라 계산).
  // 자유 선언이면 무엇을 버려도 대기는 고정이므로 고정 대기를 그대로 보여준다.
  const hoverWaits = useMemo<TileKind[]>(() => {
    if (hoverId === null) return [];
    if (frozenWaits.length > 0) return frozenWaits;
    const all = rawHand
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    const kinds = rawHand
      .filter((id) => id !== hoverId)
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    if (kinds.length === 0) return [];
    try {
      // 분해 옵션은 **버리기 전 손 전체**로 판정한다 — 서버(scoringOptionsOf)가 보는 손과
      // 같아야 "버리면 텐파이"가 화면에서도 똑같이 잡힌다.
      return winningKinds(kinds, myMeldCount, undefined, waitDecompOptions(me, view, all));
    } catch {
      return [];
    }
  }, [hoverId, rawHand, view.tiles, myMeldCount, frozenWaits, me]);

  /**
   * 내가 이미 버린 패의 종류 — hover 미리보기의 후리텐 판정에 쓴다.
   *
   * 서버의 `furitenReasons`는 **지금 손** 기준이라, "이 패를 버리면 후리텐이 되는가"는
   * 여기서 따로 봐야 한다. 바닥은 전원 공개라 클라이언트가 세어도 정보 규칙에 어긋나지
   * 않는다. 한계: 후로로 바닥을 떠난 패는 세지 못한다(서버의 버림 이력과 달리 zone만
   * 본다) — 그래서 이 표시는 "적어도 후리텐"이고, 서버 판정이 더 넓을 수 있다.
   */
  const myDiscardKeys = useMemo<ReadonlySet<string>>(() => {
    const out = new Set<string>();
    for (const id of view.zones[`discards:${me.id}`]?.tileIds ?? []) {
      const k = view.tiles[id]?.kind;
      if (k !== undefined) out.add(kindKey(k));
    }
    return out;
  }, [view.zones, view.tiles, me.id]);

  /**
   * hover한 패를 버리면 후리텐이 되는가 — 버리는 그 패도 내 바닥에 들어가므로 함께 센다
   * (쯔모한 패가 곧 대기패인 "버리자마자 후리텐"이 실제로 자주 나온다).
   * 이미 후리텐이면(리치 후 넘김·일시 후리텐) 무엇을 버려도 후리텐이라 그대로 참이다.
   */
  const hoverFuriten = useMemo<boolean>(() => {
    if (hoverId === null || hoverWaits.length === 0) return false;
    if ((view.round.byPlayer[me.id]?.furitenReasons ?? []).length > 0) return true;
    const droppedKey = (() => {
      const k = view.tiles[hoverId]?.kind;
      return k === undefined ? null : kindKey(k);
    })();
    return hoverWaits.some((k) => {
      const key = kindKey(k);
      return key === droppedKey || myDiscardKeys.has(key);
    });
  }, [hoverId, hoverWaits, myDiscardKeys, view.tiles, view.round.byPlayer, me.id]);

  // hover 중인 패 종류를 상위로 올려 공개패(버림·후로) 강조에 사용
  useEffect(() => {
    props.onHoverKind(hoverId !== null ? (view.tiles[hoverId]?.kind ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverId]);

  // "내 오름패 표시" 설정 — 텐파이(13장 대기 상태)면 손패 위에 화료패를 항상 띄운다.
  // 내 차례(쯔모패 포함 14장)에서는 hover 미리보기가 담당하므로 대기 상태일 때만 계산한다.
  const myWaits = useMemo<TileKind[]>(() => {
    // 자유 선언으로 고정된 오름패는 물리 손패가 바뀌어도 항상 표시한다 (설정과 무관).
    if (frozenWaits.length > 0) return frozenWaits;
    // 관전 모드에서는 하단 시점 플레이어의 오름패도 항상 표시(설정과 무관).
    if (!isSpectator && !props.showMyWaits) return [];
    const kinds = rawHand
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    if (kinds.length % 3 !== 1) return [];
    try {
      return winningKinds(kinds, myMeldCount, undefined, waitDecompOptions(me, view, kinds));
    } catch {
      return [];
    }
  }, [props.showMyWaits, isSpectator, rawHand, view.tiles, myMeldCount, frozenWaits, me]);

  // 역이 없어 론이 안 되는 대기 종류 — 서버가 내 뷰에만 실어 준다(PlayerRoundView.noYakuWaits).
  // 오름패 표시가 "기다리면 먹을 수 있다"로 읽히는 오해를 막는 용도.
  const noYakuWaitSet = useMemo(
    () => new Set(view.round.byPlayer[me.id]?.noYakuWaits ?? []),
    [view.round.byPlayer, me.id],
  );

  // 후리텐 — 이름표에도 뜨지만, 정작 오름패를 보는 동안에는 시선 밖이라 안 보였다.
  // 후리텐이면 여기 뜬 오름패 전부가 론 불가라 표시가 붙는 자리는 오름패 옆이 맞다.
  // 본인 뷰에만 실리므로 관전자에게는 자연히 비어 있다.
  const myFuritenReasons = view.round.byPlayer[me.id]?.furitenReasons ?? [];

  /** 이 패를 (드래그·클릭으로) 지금 낼 수 있는 옵션 — 클릭 동작과 동일 규칙. */
  function discardOptionFor(id: number | null): ActionOption | undefined {
    if (id === null) return undefined;
    // 오픈 리치·스텔스 리치 등으로 무장한 동안에는 그 액션이 곧 '이 패를 버리는' 수단이다
    if (armedAug !== null) {
      return DRAG_DISCARD_ARM_TYPES.has(armedAug)
        ? armedByTile.get(id)?.[0]
        : undefined;
    }
    const opts = optionsByTile.get(id) ?? [];
    return props.riichiMode
      ? opts.find((o) => o.type === "riichi")
      : (opts.find((o) => o.type === "discard") ?? opts.find((o) => o.type === "free_discard"));
  }

  // 드래그 중인 패를 지금 낼 수 있으면 바닥 드롭존을 띄운다
  const canDropDiscard = discardOptionFor(drag?.id ?? null) !== undefined;

  /**
   * 포인터 드래그 시작 — 시작 시점의 슬롯 중심 X를 한 번 측정해 둔다.
   * 실제 드래그(리프트·재정렬)는 임계값 이상 움직여야 시작하고, 그 전엔 클릭으로 처리된다.
   */
  function beginDrag(e: React.PointerEvent, id: number, idx: number): void {
    // 무장 중에는 드래그를 막는다 — 단, 버리면서 발동하는 리치 계열만 예외로 연다.
    if (isSpectator) return;
    if (armedAug !== null && !DRAG_DISCARD_ARM_TYPES.has(armedAug)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const container = handRef.current;
    if (container === null) return;
    const slotCenter = Array.from(
      container.querySelectorAll<HTMLElement>(".hand-tile"),
    ).map((n) => {
      const r = n.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    setDragBoth({
      id,
      pointerId: e.pointerId,
      order: [...displayIds],
      fromIdx: idx,
      slotCenter,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      targetIdx: idx,
      moved: false,
      overDiscard: false,
      settling: false,
    });
  }

  /** 드래그 중 각 패의 transform — 드래그 패는 커서를 따라가고, 나머지는 자리를 비켜준다. */
  function tileDragStyle(id: number, idx: number): CSSProperties | undefined {
    if (drag === null || !drag.moved) return undefined;
    const { id: did, fromIdx, slotCenter, startX, startY, curX, curY, targetIdx, settling } = drag;
    const base = slotCenter[fromIdx] ?? 0;
    if (id === did) {
      if (settling) {
        // slotCenter·clientX는 화면 좌표, transform은 레이아웃 좌표다 (uiScale.ts 참고)
        const tx = toLayoutPx((slotCenter[targetIdx] ?? base) - base);
        return { transform: `translate(${tx}px, 0)`, transition: "transform 0.16s ease", zIndex: 50 };
      }
      return {
        transform: `translate(${toLayoutPx(curX - startX)}px, ${toLayoutPx(curY - startY)}px) scale(1.06)`,
        transition: "none",
        zIndex: 50,
        pointerEvents: "none",
      };
    }
    if (autoSort) return undefined; // 자동정렬 중엔 재정렬 슬라이드 없음 (버리기 드래그만)
    const j = idx < fromIdx ? idx : idx - 1;
    const finalIdx = j < targetIdx ? j : j + 1;
    const tx = toLayoutPx((slotCenter[finalIdx] ?? slotCenter[idx] ?? 0) - (slotCenter[idx] ?? 0));
    return { transform: `translateX(${tx}px)`, transition: "transform 0.16s ease" };
  }

  // 드래그 중 window 레벨에서 포인터를 추적한다 (타일 밖으로 나가도 따라오게).
  useEffect(() => {
    if (drag === null) return;
    function onMove(e: PointerEvent): void {
      const b = dragRef.current;
      if (b === null || e.pointerId !== b.pointerId) return;
      const dist = Math.hypot(e.clientX - b.startX, e.clientY - b.startY);
      if (!b.moved && dist < HAND_DRAG_THRESHOLD) return;
      const dz = dropzoneRef.current?.getBoundingClientRect();
      const overDiscard =
        dz !== undefined &&
        e.clientX >= dz.left &&
        e.clientX <= dz.right &&
        e.clientY >= dz.top &&
        e.clientY <= dz.bottom;
      const targetIdx = autoSort
        ? b.fromIdx
        : handDragTargetIdx(b.slotCenter, b.fromIdx, e.clientX);
      // 슬롯을 하나 넘길 때마다 "칙" — 패를 스르륵 넘기는 촉감. (재정렬 모드에서만)
      if (!autoSort && targetIdx !== b.targetIdx) sfx.slide();
      setDragBoth({ ...b, curX: e.clientX, curY: e.clientY, moved: true, overDiscard, targetIdx });
    }
    function onUp(e: PointerEvent): void {
      const b = dragRef.current;
      if (b === null || e.pointerId !== b.pointerId) return;
      if (!b.moved) {
        setDragBoth(null);
        return;
      }
      suppressClickRef.current = true; // 드래그 뒤 딸려오는 click 무시
      if (b.overDiscard) {
        const opt = discardOptionFor(b.id);
        setDragBoth(null);
        // 무장 액션으로 버렸으면 무장도 함께 푼다(sel.submit) — 남아 있으면 다음 패까지
        // 그 액션의 대상으로 잡힌다.
        if (opt !== undefined) {
          if (armedAug !== null) sel.submit(opt);
          else props.onSubmit(opt);
        }
        return;
      }
      // 최종 자리로 부드럽게 안착시킨 뒤 순서를 확정한다 (수동 정렬 모드만 커밋).
      setDragBoth({ ...b, settling: true });
      window.setTimeout(() => {
        if (!autoSort) {
          setCommitting(true); // 커밋 프레임엔 트랜지션 off → 튐 방지
          setManualOrder(handReordered(b.order, b.id, b.targetIdx));
        }
        setDragBoth(null);
      }, 160);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  // 커밋 프레임 다음 프레임에 트랜지션을 다시 켠다
  useEffect(() => {
    if (!committing) return;
    const raf = requestAnimationFrame(() => setCommitting(false));
    return () => cancelAnimationFrame(raf);
  }, [committing]);

  /*
   * 손패 블록의 폭 기준. 레일(.own-hand-rail)이 **쯔모패 자리를 늘 비워 두므로**
   * 13→14장이 되어도 이미 있던 패가 밀리지 않는다.
   *
   * handRest = 쯔모패를 뺀 "쉬는" 손패 장수. 내 시점에서는 hasDrawn이 알려 주지만,
   * 관전 시점에는 myDrawnTile이 없다 — 그래서 장수 나머지로도 판단한다.
   * 마작 손패는 쉴 때 3n+1(13·10·7…, 진짜 용은 16), 쯔모를 쥐면 3n+2다.
   *
   * --hand-n(타일 폭 계산용 장수)은 14 미만으로 내리지 않는다 — 후로로 손패가
   * 줄었다고 타일이 커지면 안 된다. 진짜 용(17장)처럼 넓은 손패는 그만큼 조인다.
   * 쯔모 전후로 값이 같아야 타일 폭까지 고정된다(예전엔 16↔17로 흔들렸다).
   */
  const handRest =
    hasDrawn || displayIds.length % 3 === 2
      ? Math.max(1, displayIds.length - 1)
      : displayIds.length;
  const handStyle = {
    "--hand-n": String(Math.max(14, handRest + 1)),
    "--hand-slots": String(handRest),
  } as React.CSSProperties;

  /*
   * 드롭존은 **실제로 끌기 시작한 뒤에만** 띄운다(drag.moved).
   * 예전엔 pointerdown 즉시 떠서, 패를 그냥 클릭하기만 해도 큰 점선 상자가 한 번
   * 번쩍였다 — 이제 그 상자가 다른 UI 위로 올라오므로(z-index) 더 두드러진다.
   */
  const showDropzone = drag?.moved === true && canDropDiscard;

  return (
    <>
      {showDropzone ? (
        <div
          ref={dropzoneRef}
          className={`discard-dropzone${drag?.overDiscard === true ? " discard-dropzone-over" : ""}${
            props.riichiMode || (armedAug !== null && DRAG_DISCARD_ARM_TYPES.has(armedAug))
              ? " discard-dropzone-riichi"
              : ""
          }`}
        >
          <span className="discard-dropzone-label">
            {armedAug !== null
              ? `✦ 여기에 놓아 ${armName}`
              : props.riichiMode
                ? "⚡ 여기에 놓아 리치"
                : "🀫 여기에 놓아 버리기"}
          </span>
        </div>
      ) : null}
      {/* 드래그 중에는 내 영역이 드롭존 위로 올라선다 — 끌고 있는 패가 드롭존에
          가려지면 안 되기 때문. 대신 이름표·액티브 증강·안내·액션 바는 잠시 투명해져
          드롭존 문구를 비켜 준다(자리는 그대로 둬서 손패가 튀지 않는다). */}
      <div
        className={`own-area${showDropzone ? " own-area-dragging" : ""}`}
        ref={areaRef}
        data-arm-zone="1"
      >
        {/* 차례·쯔모를 보조기술에만 읽어 준다 (감사 §6-3 — 화면에는 이미 맥동·게이지로 보인다) */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {turnAnnounce}
        </div>
        {props.quickToggles ?? null}
        {/*
         * 내 이름표 줄 — 이름표·액티브 증강 버튼은 가운데(`.own-top-main`),
         * 오름패 뱃지는 **그 바로 옆**(`.own-top-waits`)에 선다
         * (2026-08-12 사용자 요청: "오름패 표시를 액티브 증강 버튼 옆으로").
         *
         * 뱃지 자리는 **텐파이가 아닐 때도 비워 둔다**(`.own-top-waits`의 min-height).
         * 텐파이가 붙었다 떨어질 때마다 아래쪽 띠(`--own-band`)가 뱃지 높이만큼
         * 늘었다 줄면, 그 띠로 `--board`가 정해지므로 **바닥에 깔린 버림패 크기가
         * 매 순 달라진다**(2026-08-12 사용자 지적: "어지럽다").
         *
         * 옆자리(3열 그리드의 오른쪽 칸)라 뱃지가 떴다 사라져도 이름표·증강 버튼은
         * 가로로도 움직이지 않는다 — 한 줄에 그냥 끼워 넣으면 가운데 정렬이라
         * 뱃지 폭의 절반만큼 이름표가 매번 옆으로 튄다. (자세한 자리 값은
         * styles.css `.own-top` 주석.)
         */}
        <div className="own-top">
          <div className="own-top-main">
            <NamePlate
              view={view}
              player={me}
              catalog={props.catalog}
              tipUp
              glow={usableHint}
            />
            {!isSpectator ? (
              <ActiveAugmentControl
                view={view}
                me={me}
                prompt={prompt}
                catalog={props.catalog}
                onUsableHint={(ids) => setUsableHint(ids === null ? null : new Set(ids))}
              />
            ) : null}
            {!isSpectator ? <ActiveInfoBadges view={view} me={me} /> : null}
          </div>
          <div className="own-top-waits">
            {myWaits.length > 0 ? (
              <WaitsBadge
                waits={myWaits}
                mine={!isSpectator}
                noYaku={noYakuWaitSet}
                furiten={myFuritenReasons}
                {...(isSpectator ? { owner: playerName(view, me) } : {})}
              />
            ) : null}
          </div>
        </div>
        {armedAug === "swap3" ? (
          <div className="arm-hint arm-swap">
            {swapTarget === null ? (
              <>
                <span className="arm-hint-text">✦ {armName} — 교환할 상대를 클릭하세요</span>
                <button className="arm-hint-cancel" onClick={() => sel.arm(null)}>
                  취소
                </button>
              </>
            ) : (
              <>
                <span className="arm-hint-text">
                  ✦ {armName} → <b>{playerNameById(view, swapTarget)}</b> — 넘길 내 패 3장을 클릭 ({swapGive.length}/3)
                </span>
                <button
                  className="arm-hint-cancel"
                  onClick={() => {
                    sel.setSwapTarget(null);
                    sel.setSwapGive([]);
                  }}
                >
                  상대 다시
                </button>
                <button className="arm-hint-cancel" onClick={() => sel.arm(null)}>
                  취소
                </button>
              </>
            )}
          </div>
        ) : armedAug !== null ? (
          <div className="arm-hint">
            <span className="arm-hint-text">✦ {armName} — {armPromptText(sel.armMode, armedAug)}</span>
            <button className="arm-hint-cancel" onClick={() => sel.arm(null)}>
              취소
            </button>
          </div>
        ) : null}
        {/* 한 패에 변형 선택지가 여럿일 때(염색 무늬·연금술 ±1) — 실물 패 전→후를 보여주는
            전용 모달(docs/10 §2a-1: 패를 고르는 증강은 후보 버튼 나열 금지) */}
        {/* ⚠ 반드시 포털로 body에 붙인다. 이 모달만 `.own-area` 안에 있었는데
            `.own-area`는 `transform: translateX(-50%)`를 갖고 있어 **position: fixed의
            컨테이닝 블록**이 된다 — 그래서 `inset: 0`이 화면이 아니라 손패 영역을 가리켜
            모달이 화면 아래쪽에 처박히고 아래가 잘렸다(2026-08-06 사용자 보고: 분열).
            같은 클래스를 쓰는 다른 모달들은 `.own-area` 바깥이라 멀쩡했다. */}
        {/* ⚠ `data-arm-zone`은 필수다. 무장 중에는 게임판 바깥을 누르면 무장이 풀리는데
            (GameTable의 pointerdown 감시), 이 모달은 body로 포탈돼 `.own-area`의
            arm-zone 밖에 있다 → 후보를 누르는 pointerdown이 먼저 무장을 풀고, 무장이
            풀리면 armSub도 함께 비워져 **모달이 click 전에 사라졌다**. 그래서 후보가
            둘 이상인 위조·분열·염색에서 아무리 눌러도 골라지지 않았다
            (2026-08-07 사용자 보고: 선언 간파 — 새 탭에서 선택이 안 됨). */}
        {armSub !== null ? createPortal(
          <div className="rinshan-pick-overlay" data-arm-zone="1">
            <div className="rinshan-pick-panel">
              <div className="rinshan-pick-title">
                ✦ {armName} — {armSub.options[0]?.type === "split_tile" ? "어떻게 쪼갤까요?" : "무엇으로 바꿀까요?"}
              </div>
              <div className="rinshan-pick-sub">
                {armSub.options[0]?.type === "split_tile"
                  ? "고른 패가 어떤 두 장으로 갈라지는지 보고 고르세요. 보라색 패가 새로 만들어지는 패입니다."
                  : "고른 패가 어떻게 바뀌는지 보고 고르세요. 보라색 패가 새로 만들어지는 패입니다."}
              </div>
              <div className="rinshan-pick-tiles">
                {armSub.options.map((o, i) => {
                  // 분열은 결과가 **두 장**이라 morphedTile(한 장) 경로로는 그릴 수 없었다.
                  // 그래서 전부 ActionTiles 대체 경로로 떨어져 후보 버튼이 죄다 "원래 패"
                  // 하나로만 보였고, 어느 분할을 고르는지 알 수 없었다(2026-08-02 사용자 보고).
                  const pieces = splitPreview(view, o);
                  const after = pieces === null ? morphedTile(view, o) : null;
                  return (
                    <button
                      key={i}
                      className="rinshan-pick-tile aug-morph-tile"
                      onClick={() => {
                        sel.submit(o);
                        setArmSub(null);
                      }}
                    >
                      <span className="aug-morph">
                        <TileImg tile={view.tiles[armSub.tileId]} size="hand" />
                        <span className="aug-morph-arrow" aria-hidden="true">→</span>
                        {pieces !== null ? (
                          <>
                            <TileImg tile={pieces[0]} size="hand" />
                            <TileImg tile={pieces[1]} size="hand" />
                          </>
                        ) : after !== null ? (
                          <TileImg tile={after} size="hand" />
                        ) : (
                          <ActionTiles view={view} option={o} />
                        )}
                      </span>
                      <span className="rinshan-pick-label">{optionDetail(view, o) || "이걸로 바꾼다"}</span>
                    </button>
                  );
                })}
              </div>
              <button className="rinshan-pick-skip" onClick={() => setArmSub(null)}>
                취소 (바꾸지 않고 닫기)
              </button>
            </div>
          </div>,
          document.body,
        ) : null}
        {myPrompt !== null ? (
          <>
            <ActionBar
              view={view}
              prompt={myPrompt}
              riichiMode={props.riichiMode}
              catalog={props.catalog}
              onRiichiMode={props.onRiichiMode}
              onSubmit={props.onSubmit}
            />
            <PromptTimer
              seq={props.promptSeq}
              deadline={props.promptDeadline}
              // 시간이 다 되면 무슨 일이 일어나는지를 **미리** 말한다. 드래프트 창은
              // "시간이 다 되면 랜덤으로 결정된다"를 상시로 적어 두는데 여기만 없어서,
              // 되돌릴 수 없는 손실(론 흘림·의도치 않은 타패)이 예고 없이 일어났다.
              // 폴백 순서는 서버의 safeFallbackOption과 같다: 패스가 있으면 패스.
              onTimeout={
                myPrompt.options.some((o) => o.type === "pass")
                  ? "시간이 다 되면 자동으로 패스합니다"
                  : myPrompt.options.some((o) => o.type === "discard")
                    ? "시간이 다 되면 쯔모한 패가 그대로 나갑니다"
                    : null
              }
            />
          </>
        ) : null}
        {/* 삼세 예지 — 서버가 쯔모·버림·후로마다 다시 계산해 올린다(후로로 차례가 밀려도
            맞는다). 국 끝물에 내 몫의 쯔모가 모자라면 두 칸·한 칸으로 줄어든다. */}
        {nextTsumoKinds.length > 0 ? (
          <div className="next-tsumo-strip" title="삼세 예지 — 내 다음 쯔모 (실시간, 최대 세 장)">
            <span className="next-tsumo-tag">삼세 예지 · 다음 쯔모</span>
            {nextTsumoKinds.map((kind, i) => (
              <span key={i} className="next-tsumo-cell">
                <TileImg tile={{ kind }} size="mini" />
                <span className="next-tsumo-ord">{i + 1}</span>
              </span>
            ))}
          </div>
        ) : null}
        {bottomWallIds.length > 0 ? (
          <div
            className={`bottom-deal-strip${bottomDealArmed ? " bottom-deal-armed" : ""}`}
            title="밑장빼기 — 패산 맨 밑 3장 (오른쪽 끝이 다음에 빼올 밑장)"
          >
            <span className="bottom-deal-tag">
              밑장빼기 · 패산 밑{bottomDealArmed ? " (예약됨)" : ""}
            </span>
            {bottomWallIds.map((id, i) => (
              <span
                key={id}
                className={`bottom-deal-cell${
                  i === bottomWallIds.length - 1 ? " bottom-deal-next" : ""
                }`}
              >
                <TileImg tile={view.tiles[id]} size="mini" />
              </span>
            ))}
          </div>
        ) : null}
        {/* 레일이 쯔모패 자리까지 미리 차지해 손패 블록의 왼쪽 끝을 고정한다
            (쯔모할 때 손패가 통째로 밀리지 않게 — styles.css .own-hand-rail 주석 참고) */}
        <div className="own-hand-rail" style={handStyle}>
        <div
          key={roundKeyStr}
          ref={handRef}
          className={`own-hand${isMyTurn ? " own-hand-turn" : ""}${
            drag?.moved === true ? " own-hand-dragging" : ""
          }${committing ? " own-hand-nofx" : ""}${
            /* 배패 전(증강 선택 중)에는 손패가 0장이다. 상자만 남으면 이름표 밑에
               **빈 알약**이 떠 있는 것으로 보인다(2026-08-18 사용자 지적) — 무엇을
               담는 자리인지 알 수 없는 테두리는 없느니만 못하다. 패가 들어오는
               순간 테두리도 함께 나타난다. */
            displayIds.length === 0 ? " own-hand-empty" : ""
          }`}
        >
          {displayIds.map((id, idx) => {
            const opts = optionsByTile.get(id) ?? [];
            const discard = opts.find((o) => o.type === "discard");
            const riichi = opts.find((o) => o.type === "riichi");
            const freeDiscard = opts.find((o) => o.type === "free_discard");
            const active = props.riichiMode ? riichi : (discard ?? freeDiscard);
            // 등가교환: 상대를 정한 뒤엔 모든 손패가 선택 대상, 고른 3장은 강조
            const swapPicking = armedAug === "swap3" && swapTarget !== null;
            const swapChosen = swapPicking && swapGive.includes(id);
            const armable =
              armedAug === "swap3" ? swapPicking : armedAug !== null && armedByTile.has(id);
            // 무장 대상도 '지금 누를 수 있는 패'다 — 커서·hover 들림을 함께 준다
            const clickable =
              armable ||
              (active !== undefined && (!props.riichiMode || riichi !== undefined));
            // 리치 선언 후 버릴 수 없는(옵션 없는) 패 + 리치 모드에서 리치 불가 패를 어둡게
            const noDiscard = discard === undefined && freeDiscard === undefined;
            /*
             * 무장한 증강의 대상이 되는 패는 **어둡게 두지 않는다.**
             * 리치 중에는 손패 전부가 잠겨 어두운데, 손바닥 뒤집기로 무장해도 고를 수 있는
             * 패까지 그대로 어두워서 "정말 바꿀 수 있는 건가"를 화면이 답해 주지 못했다
             * (2026-08-16 사용자 보고). 지금 누를 수 있는 패는 밝아야 한다.
             */
            const dimmed =
              !armable &&
              ((props.riichiMode && riichi === undefined) ||
                (riichiDeclared && !props.riichiMode && noDiscard));
            const isDrawn = hasDrawn && id === drawnId;
            // 봉인된 패(봉인술사 등) — 자물쇠 표시. 소프트락 해제 등으로 버릴 수
            // 있게 된 경우(clickable)에도 봉인 상태 자체는 계속 보여준다.
            const tileKind = view.tiles[id]?.kind;
            const sealed = sealedSet.has(id);
            // 지뢰 탐지 — 이 패를 지금 버리면 방총(위험). 실제 손패 위에 경고 표시.
            const danger =
              dangerSet.size > 0 && tileKind !== undefined && dangerSet.has(kindKey(tileKind));
            // 텐파이면 이 패를 버렸을 때의 대기패를 hover 시 표시 (리치 모드 아니어도)
            const showWaits = hoverId === id && hoverWaits.length > 0;
            return (
              <button
                key={id}
                /*
                 * 상태를 **이름에 싣는다** (감사 §6-8). 예전에는 이름이 패 이름뿐이라
                 * 잠김·쯔모패·위험패·봉인이 전부 클래스=색으로만 표현됐다 — 화면을
                 * 못 보는 사람에게는 열네 장이 전부 똑같이 들렸다.
                 * 잠긴 패는 `aria-disabled` 로도 알린다(포커스는 남겨 둔다 —
                 * 왜 못 버리는지 읽을 수 있어야 하므로 `disabled` 로 빼지 않는다).
                 */
                aria-label={[
                  formatTile(view.tiles[id]),
                  isDrawn ? "방금 쯔모" : null,
                  sealed ? "봉인됨" : null,
                  danger ? "위험패" : null,
                  armedTileId === id ? "선택됨 — 한 번 더 누르면 버립니다" : null,
                  !clickable ? "지금 버릴 수 없음" : null,
                ]
                  .filter((x) => x !== null)
                  .join(", ")}
                aria-disabled={!clickable}
                className={`hand-tile${clickable ? " hand-clickable" : " hand-locked"}${
                  armedTileId === id ? " hand-armed" : ""
                }${
                  dimmed ? " hand-dimmed" : ""
                }${
                  (props.riichiMode && riichi !== undefined) ||
                  (armable && armedAug !== null && DRAG_DISCARD_ARM_TYPES.has(armedAug))
                    ? " hand-riichi"
                    : ""
                }${
                  isDrawn ? " hand-drawn" : ""
                }${freeDiscard !== undefined && discard === undefined ? " hand-free" : ""}${
                  drag?.id === id && drag.moved ? " hand-dragging" : ""
                }${sealed ? " hand-sealed" : ""}${armable ? " hand-armable" : ""}${
                  swapChosen ? " hand-swap-picked" : ""
                }${armedAug !== null && !armable ? " hand-dimmed" : ""}${
                  danger ? " hand-danger" : ""
                }`}
                style={tileDragStyle(id, idx)}
                onPointerDown={(e) => {
                  beginDrag(e, id, idx);
                  // 터치에는 hover가 없다 — 손가락을 얹고 있는 동안을 hover로 친다.
                  // 그래야 "이 패를 버리면 무엇을 기다리게 되는가"를 **떼기 전에** 볼 수 있다.
                  // 이 미리보기는 여태 마우스 전용이었다(onMouseEnter/Leave).
                  if (e.pointerType !== "mouse") setHoverId(id);
                }}
                /* 손을 떼면 미리보기를 내린다 — **터치만**이다. 마우스에서도 내리면
                   클릭한 순간 hover 미리보기가 사라져 데스크톱 동작이 망가진다
                   (마우스는 아래 onMouseLeave가 제자리에서 맡는다). */
                onPointerUp={(e) => {
                  if (e.pointerType !== "mouse") setHoverId((cur) => (cur === id ? null : cur));
                }}
                onPointerCancel={(e) => {
                  if (e.pointerType !== "mouse") setHoverId((cur) => (cur === id ? null : cur));
                }}
                onMouseEnter={() => {
                  if (drag === null) {
                    setHoverId(id);
                    sfx.hoverTile(); // 빠르게 쓸면 "타라라락" (내부 레이트리밋)
                  }
                }}
                onMouseLeave={() => setHoverId((cur) => (cur === id ? null : cur))}
                /*
                 * 키보드에도 같은 미리보기를 준다 (감사 §6-10).
                 * 증강 pill·액션 메뉴·관계 칩은 전부 `onFocus` 를 짝으로 달았는데
                 * **손패만 빠져 있었다** — 정작 "이 패를 버리면 무엇을 기다리게
                 * 되는가"가 가장 필요한 자리다. 탭으로 훑는 사람에게는 이게 유일한 통로다.
                 */
                onFocus={() => setHoverId(id)}
                onBlur={() => setHoverId((cur) => (cur === id ? null : cur))}
                onClick={() => {
                  // 드래그로 재정렬/버리기를 한 직후 딸려온 click은 무시한다
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  // 등가교환: 상대를 정했으면 이 패를 교환 대상으로 토글(3장이면 제출)
                  if (armedAug === "swap3") {
                    if (swapTarget !== null) pickSwapTile(id);
                    return;
                  }
                  // 선택 모드: armed 증강의 대상으로 이 패를 고른다 (손패 클릭형만)
                  if (armedAug !== null) {
                    const opts = armedByTile.get(id);
                    if (opts !== undefined && opts.length > 0) {
                      if (opts.length === 1) {
                        sel.submit(opts[0]!);
                        setArmSub(null);
                      } else {
                        setArmSub({ tileId: id, options: opts });
                      }
                    } else {
                      // 대상이 아닌 패를 누르면(또는 상대·바닥 클릭형이면) 선택 모드 취소
                      sel.arm(null);
                      setArmSub(null);
                    }
                    return;
                  }
                  if (clickable && active !== undefined) {
                    /*
                     * 한 번 탭 = 되돌릴 수 없는 타패. 375px 폰에서 패 하나는 폭 26px에
                     * 간격 2px이라(감사 §5-2) 엄지로는 옆 패를 짚기 쉽고, 짚으면 그대로
                     * 나간다. 리치 선언에는 2단계 게이트가 있는데 평범한 타패에는
                     * 아무 장치도 없었다.
                     *
                     * 그래서 **두 번 탭**: 첫 번째는 그 패를 들어 올리고, 두 번째에
                     * 나간다. 다른 패를 누르면 그쪽으로 옮겨 간다. 마우스는 정확하므로
                     * 기본은 터치 기기에서만 켜지고(설정에서 바꿀 수 있다), 데스크톱의
                     * 한 번 클릭 감각은 그대로다.
                     */
                    if (props.tapTwiceToDiscard && armedTileId !== id) {
                      setArmedTileId(id);
                      sfx.pick();
                      return;
                    }
                    setArmedTileId(null);
                    props.onSubmit(active);
                    return;
                  }
                  // 봉인된 패를 버리려고 클릭 — 왜 안 되는지 안내 (내 버림 차례일 때만)
                  if (sealed && promptHasDiscard && !props.riichiMode) {
                    props.onToast?.(SEAL_HINT);
                  }
                }}
              >
                <TileImg tile={view.tiles[id]} size="hand" owner={me.id} />
                {sealed ? (
                  <span className="hand-seal-badge" title={SEAL_HINT}>
                    🔒
                  </span>
                ) : null}
                {danger ? (
                  <span
                    className="hand-danger-badge"
                    title={`지뢰 탐지 — 이 패는 방총${
                      dangerScan.turn === null ? "" : ` (${dangerScan.turn}순 기준)`
                    }`}
                  >
                    ⚠
                  </span>
                ) : null}
                {showWaits ? (
                  <WaitTip waits={hoverWaits} noYaku={noYakuWaitSet} furiten={hoverFuriten} />
                ) : null}
              </button>
            );
          })}
          {ghostDrawn !== null && !hasDrawn ? (
            <span className="hand-ghost" aria-hidden="true">
              <TileImg tile={view.tiles[ghostDrawn]} size="hand" owner={me.id} />
            </span>
          ) : null}
        </div>
        </div>
      </div>
      {myMelds.length > 0 || myPulled.length > 0 ? (
        <div className="own-corner-right">
          {myMelds.map((m, i) => (
            <MeldGroup key={i} view={view} meld={m} owner={me} layout="row" />
          ))}
          <PulledGroup view={view} owner={me} layout="row" />
        </div>
      ) : null}
      {/* 등가교환 — 넘길 내 3장 → 가져올 상대 3장을 각각 한 번에 고른다 */}
      {/* 화면 고정 표면은 전부 body 포털이다 — 이유는 FIXED_SURFACE_NOTE 참고 */}
      {canSwapTake && !swapTakeDismissed ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel">
            <div className="rinshan-pick-title">
              {swap3Pick.stage === "give"
                ? "🔄 등가교환 — 넘길 내 패 3장"
                : "🔄 등가교환 — 가져올 상대 패 3장"}
            </div>
            <div className="rinshan-pick-sub">
              {swap3Pick.stage === "give"
                ? `상대에게 넘길 내 손패 세 장을 고르세요. (${swap3Sel.length}/3)`
                : `공개된 상대 손패에서 가져올 세 장을 고르세요. (${swap3Sel.length}/3)`}
            </div>
            <div className="rinshan-pick-tiles">
              {swap3Pick.pool.map((id) => {
                const tile = view.tiles[id];
                if (tile === undefined) return null;
                const picked = swap3Sel.includes(id);
                return (
                  <button
                    key={id}
                    className={`rinshan-pick-tile${picked ? " rinshan-pick-on" : ""}`}
                    onClick={() => toggleSwap3(id)}
                  >
                    <TileImg tile={tile} size="hand" />
                    <span className="rinshan-pick-label">
                      {picked ? "선택됨" : swap3Pick.stage === "give" ? "넘길 패" : "가져올 패"}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* 닫기가 없다 — 지정한 순간 상대 손패를 이미 봤으므로 "안 하고 나가기"는
                정보만 챙기고 사용을 아끼는 무료 열람이 된다(2026-08-02 사용자 지시).
                고를 수 있는 건 선택 초기화뿐이고, 시간이 다 되면 서버가 남은 조합에서
                무작위로 하나를 골라 교환을 마친다. */}
            <button
              className="rinshan-pick-skip"
              disabled={swap3Sel.length === 0}
              onClick={() => setSwap3Sel([])}
            >
              {swap3Sel.length > 0 ? "← 선택 다시" : "세 장을 고르면 교환됩니다"}
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      {/* '다시 열기' 버튼은 없다 — 이제 dismissed는 "방금 제출했다"는 뜻뿐이고
          (닫기가 사라졌다), 다음 단계 프롬프트가 오면 모달이 알아서 다시 뜬다. */}
      {/* 미래를 보는 자 — 손패를 보여주고 패산 위 3장과 바꿀 패를 한 장씩 고르게 한다
          (3장을 채우면 그 자리에서 교환이 일어난다).
          ⚠ 닫기가 없다. 버튼을 누른 순간 발동은 확정이고(사용자 확정 2026-08-01
          "사용하면 무조건 패가 바뀌어야 한다"), 고르기 싫으면 랜덤으로 맡긴다. */}
      {/* 화면 고정 표면은 전부 body 포털이다 — 이유는 FIXED_SURFACE_NOTE 참고 */}
      {canPickFuture && !futureDismissed ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel">
            <div className="rinshan-pick-title">🔮 미래를 보는 자 — 교체할 패 선택</div>
            <div className="rinshan-pick-sub">
              패산 위 3장과 바꿀 손패를 고르세요 — 한 장씩 세 번 고르면 그 3장이 패산 맨
              밑으로 가고 패산 위 3장이 손에 들어옵니다. 바닥에 버려지는 패는 없습니다.
            </div>
            <div className="rinshan-pick-tiles">
              {sortTileIds([...futurePick.keys()], view.tiles).map((id) => {
                const opt = futurePick.get(id);
                const tile = view.tiles[id];
                if (opt === undefined || tile === undefined) return null;
                return (
                  <button
                    key={id}
                    className="rinshan-pick-tile"
                    onClick={() => {
                      props.onSubmit(opt);
                      setFutureDismissed(true);
                    }}
                  >
                    <TileImg tile={tile} size="hand" />
                    <span className="rinshan-pick-label">이 패를 바꾼다</span>
                  </button>
                );
              })}
            </div>
            <button
              className="rinshan-pick-skip"
              onClick={() => {
                const opts = [...futurePick.values()];
                const pick = opts[Math.floor(Math.random() * opts.length)];
                if (pick === undefined) return;
                props.onSubmit(pick);
                setFutureDismissed(true);
              }}
            >
              🎲 아무거나 (랜덤으로 고르기)
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      {/* 영상패 선택 모달 — 깡 직후 절벽 위에 피어난 꽃이 영상패를 고른다 */}
      {/* 화면 고정 표면은 전부 body 포털이다 — 이유는 FIXED_SURFACE_NOTE 참고 */}
      {canPickRinshan && !rinshanDismissed ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel">
            <div className="rinshan-pick-title">
              🌸 절벽 위에 피어난 꽃 — 영상패 선택
            </div>
            <div className="rinshan-pick-sub">
              깡을 선언했습니다. 남은 영상패 중에서 원하는 패를 골라 가져오세요 (도라 표시패는 보이지 않습니다).
            </div>
            {/* 고를 수 있는 것은 **영상패뿐**이라 그것만 늘어놓는다 */}
            <div className="rinshan-pick-tiles">
                {/* 깡으로 이미 빠져나간 영상패 자리 — 보충하지 않으므로 빈 칸으로 남는다(07 §2) */}
                {Array.from({ length: rinshanSpentOf(view) }, (_v, i) => (
                  <span key={`spent-${i}`} className="rinshan-pick-tile rinshan-slot-spent">
                    <span className="rinshan-spent-box" aria-hidden="true" />
                    <span className="rinshan-pick-label">사용된 영상패</span>
                  </span>
                ))}
                {[...rinshanOptions.keys()].sort((a, b) => a - b).map((idx) => {
                  const opt = rinshanOptions.get(idx);
                  const tileId = view.zones["deadWall"]?.tileIds[idx];
                  const tile = tileId !== undefined ? view.tiles[tileId] : undefined;
                  if (opt === undefined || tile === undefined) return null;
                  const label = idx === 0 ? "다음 영상패" : `영상패 ${idx + 1}번째`;
                  return (
                    <button
                      key={idx}
                      className="rinshan-pick-tile rinshan-slot-rinshan"
                      onClick={() => {
                        props.onSubmit(opt);
                        setRinshanDismissed(true);
                      }}
                    >
                      <TileImg tile={tile} size="hand" />
                      <span className="rinshan-pick-label">{label}</span>
                    </button>
                  );
                })}
            </div>
            <button
              className="rinshan-pick-skip"
              onClick={() => setRinshanDismissed(true)}
            >
              닫기 (가져오지 않고 진행)
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      {/* 절벽 위 꽃: 닫은 뒤 다시 열기 */}
      {/* 화면 고정 표면은 전부 body 포털이다 — 이유는 FIXED_SURFACE_NOTE 참고 */}
      {canPickRinshan && rinshanDismissed ? createPortal(
        <button className="rinshan-reopen" onClick={() => setRinshanDismissed(false)}>
          🌸 영상패 가져오기
        </button>,
        document.body,
      ) : null}
    </>
  );
}

/**
 * 오름패를 한 줄에 늘어놓을 최대 종류 수.
 *
 * 뒤섞인 아홉 개의 연꽃처럼 무늬를 지우는 손은 대기가 27종까지 간다 — 전부 그리면
 * 뱃지가 화면을 가로지르고 툴팁이 손패를 덮는다. 앞쪽 몇 장만 보여주고 나머지는
 * `+N`으로 접어, "대기가 넓다"는 사실과 대표 패가 함께 읽히게 한다.
 */
const WAIT_TILE_CAP = 9;

/**
 * 후리텐 사유 → 사람 말. 이름표의 "후리텐"만으로는 **왜** 걸렸는지 알 수 없어서,
 * 오름패 뱃지의 툴팁에서 사유까지 풀어 준다(PlayerRoundView.furitenReasons).
 */
const FURITEN_REASON_TEXT: Record<FuritenReason, string> = {
  discard: "내가 이미 버린 패가 오름패에 있습니다",
  temporary: "남이 낸 오름패를 넘겨 일시 후리텐입니다 (다음 내 쯔모까지)",
  riichi: "리치 뒤 오름패를 넘겨 이 국 내내 후리텐입니다",
};

/**
 * 오름패 옆에 붙는 **남은 장수** 계산기 — 게임판 전체가 같은 셈을 본다.
 *
 * 값은 `waitCounts.remainingCounter`가 만든다(보이는 곳만 세고, 증강 생성패는 빼는
 * 규칙은 그쪽 주석에 있다). 컨텍스트로 두는 이유는 오름패 뱃지가 **내 손패 위**와
 * **상대 셋의 스트립** 네 군데에서 따로 그려지기 때문이다 — 자리마다 다른 기준으로
 * 세면 같은 패에 다른 숫자가 뜬다. 판마다 하나만 만들어 전부 그걸 쓴다.
 *
 * null이면 숫자를 아예 그리지 않는다(뷰가 없는 미리보기·헬프 화면).
 */
const WaitCountContext = createContext<((kind: TileKind) => number) | null>(null);

/**
 * 상시 표시용 오름패 뱃지 — 선언 간파(상대 위)와 내 오름패(손패 위)에 공용.
 * WaitTip과 달리 hover 없이 계속 떠 있는다.
 */
function WaitsBadge({
  waits,
  owner,
  mine,
  openRiichi,
  peek,
  noYaku,
  furiten,
}: {
  waits: TileKind[];
  owner?: string;
  mine?: boolean;
  openRiichi?: boolean;
  /** 선언 간파로 알아낸 상대의 오름패 — 오픈 리치와 같은 크기로 상대 손패 위에 띄운다 */
  peek?: boolean;
  /** 역이 없어 론이 안 되는 대기 종류(kindKey) — 오름패 표시의 오해를 막는다 */
  noYaku?: ReadonlySet<string>;
  /**
   * 후리텐 사유 — 본인 뷰에만 온다(PlayerRoundView.furitenReasons).
   * 후리텐이면 **오름패 전부가 론 불가**라, 이름표에만 적어 두면 정작 오름패를
   * 보고 있는 동안에는 안 보인다. 그래서 오름패 자리에도 같이 적는다.
   */
  furiten?: readonly FuritenReason[];
}): JSX.Element {
  const cls =
    openRiichi === true
      ? " waits-badge-open"
      : peek === true
        ? " waits-badge-peek"
        : mine === true
          ? " waits-badge-mine"
          : "";
  const dead = (k: TileKind): boolean => noYaku?.has(kindKey(k)) === true;
  const allDead = waits.length > 0 && waits.every(dead);
  const furitenOn = furiten !== undefined && furiten.length > 0;
  const furitenTip = furitenOn
    ? `${furiten.map((r) => FURITEN_REASON_TEXT[r]).join(" · ")} — 론은 안 되고 쯔모로만 화료할 수 있습니다`
    : undefined;
  const shown = waits.slice(0, WAIT_TILE_CAP);
  const hidden = waits.length - shown.length;
  // 남은 장수 — 보이는 곳에 안 나온 그 종류의 장수(기본 4장 기준, 증강 생성패 제외).
  const remaining = useContext(WaitCountContext);
  // 종류가 많으면 타일을 한 단계 줄인다 — 크게 키운 뱃지가 판을 가로지르면
  // 그게 곧 "판을 가리는 배치"다(docs/28 §2-2~§2-5).
  const wide = shown.length > 5 ? " waits-badge-wide" : "";
  const tipOf = (k: TileKind, left: number | null): string | undefined => {
    const parts: string[] = [];
    if (left !== null) {
      parts.push(left === 0 ? "남은 0장 — 이 패로는 날 수 없습니다" : `남은 ${left}장 (보이지 않는 장수)`);
    }
    if (furitenOn) parts.push("후리텐 — 론 불가, 쯔모만 가능합니다");
    if (dead(k)) parts.push("역이 없어 론할 수 없습니다");
    return parts.length === 0 ? undefined : parts.join(" · ");
  };
  return (
    <div className={`waits-badge${cls}${wide}${furitenOn ? " waits-badge-furiten" : ""}`}>
      <span className="waits-badge-label">
        {openRiichi === true ? "오픈 리치" : mine === true ? "내 오름패" : "간파"}
        {owner !== undefined && mine !== true ? <span className="waits-badge-owner">{owner}</span> : null}
        {waits.length > WAIT_TILE_CAP ? (
          <span className="waits-badge-count">{waits.length}종</span>
        ) : null}
        {furitenOn ? (
          <span className="waits-badge-furiten-tag" title={furitenTip}>
            후리텐
          </span>
        ) : null}
        {allDead ? <span className="waits-badge-noyaku">역없음</span> : null}
        {/* 문구를 "아직 보이지 않은 장수"에서 **세는 곳을 밝히는 쪽**으로 고친다.
            엿보기·투시로 상대 손패가 화면에 그려져도 이 셈은 그 패를 세지 않는다
            (waitCounts는 zone 화이트리스트를 방어선으로 삼는다) — 짧은 문구만 보면
            화면과 어긋나 보였다. */}
        {remaining !== null ? (
          <span
            className="waits-badge-hint"
            title="패 위 숫자 = 기본 4장에서 버림패·후로·도라 표시패·내 손패에 나온 만큼을 뺀 수 (증강 생성패는 세지 않음)"
          >
            남은 장수
          </span>
        ) : null}
      </span>
      <span className="waits-badge-tiles">
        {shown.map((k) => {
          const left = remaining === null ? null : remaining(k);
          return (
            <span
              key={`${k.suit}${k.rank}`}
              className={`wait-tile${dead(k) ? " wait-tile-noyaku" : ""}${left === 0 ? " wait-tile-gone" : ""}`}
              title={tipOf(k, left)}
            >
              <TileImg tile={{ kind: k }} size="mini" />
              {/* 남은 장수는 **패 아래쪽에** 띠로 붙인다 — 오른쪽 위 작은 동그라미는
                  옆 패의 그림과 겹쳐 읽히지 않았다(2026-08-12 사용자 요청).
                  "3"만으로는 무슨 수인지 모르므로 단위까지 적는다. */}
              {left !== null ? (
                <span className={`wait-left${left === 0 ? " wait-left-gone" : ""}`}>{left}장</span>
              ) : null}
              {dead(k) ? <span className="wait-noyaku-tag">역없음</span> : null}
            </span>
          );
        })}
        {hidden > 0 ? (
          <span className="wait-more" title={waits.map((k) => formatTile({ kind: k })).join(" ")}>
            +{hidden}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * 리치 대기패(화료패) 미리보기 툴팁 — "이 패를 버리면 무엇을 기다리는가".
 *
 * 상시 뱃지(WaitsBadge)와 **같은 것을 보여준다**: 오름패 그림 + 남은 장수 + 후리텐.
 * 예전에는 그림뿐이라, 버리기 전에는 "몇 장 남았는지"도 "론이 되는지"도 알 수 없고
 * 버리고 난 뒤에야 상시 뱃지에서 확인할 수 있었다(2026-08-15 사용자 요청).
 * 고를 때 필요한 정보를 고른 뒤에 주는 셈이었다.
 */
function WaitTip({
  waits,
  noYaku,
  furiten,
}: {
  waits: TileKind[];
  /** 역이 없어 론이 안 되는 대기 종류(kindKey) — "오름패인데 왜 못 먹지?" 방지 */
  noYaku?: ReadonlySet<string>;
  /**
   * 이 패를 버리면 후리텐이 되는가 — **버린 뒤의** 상태다(버리는 그 패도 내 바닥에
   * 들어가므로 함께 센다). 서버가 주는 현재 손 기준 후리텐과 달리 가정 계산이라
   * 계산도 판정도 클라이언트가 한다(HandArea).
   */
  furiten?: boolean;
}): JSX.Element {
  const dead = (k: TileKind): boolean => noYaku?.has(kindKey(k)) === true;
  const allDead = waits.length > 0 && waits.every(dead);
  const shown = waits.slice(0, WAIT_TILE_CAP);
  const hidden = waits.length - shown.length;
  // 남은 장수 — 판 전체가 같은 셈을 본다(WaitsBadge와 같은 컨텍스트).
  const remaining = useContext(WaitCountContext);
  const furitenOn = furiten === true;
  const tipOf = (k: TileKind, left: number | null): string | undefined => {
    const parts: string[] = [];
    if (left !== null) {
      parts.push(left === 0 ? "남은 0장 — 이 패로는 날 수 없습니다" : `남은 ${left}장 (보이지 않는 장수)`);
    }
    if (furitenOn) parts.push("후리텐 — 론 불가, 쯔모만 가능합니다");
    if (dead(k)) parts.push("역이 없어 론할 수 없습니다");
    return parts.length === 0 ? undefined : parts.join(" · ");
  };
  return (
    <span className={`wait-tip${furitenOn ? " wait-tip-furiten" : ""}`}>
      <span
        className="wait-tip-label"
        title={waits.length === 0 ? glossaryTitle("keishiki_tenpai") : undefined}
      >
        {waits.length === 0 ? "형식 텐파이" : allDead ? "대기 (역없음)" : "대기"}
        {waits.length > WAIT_TILE_CAP ? (
          <span className="waits-badge-count">{waits.length}종</span>
        ) : null}
        {furitenOn ? (
          <span
            className="waits-badge-furiten-tag"
            title="이 패를 버리면 후리텐입니다 — 론은 안 되고 쯔모로만 화료할 수 있습니다"
          >
            후리텐
          </span>
        ) : null}
      </span>
      {waits.length > 0 ? (
        <span className="wait-tip-tiles">
          {shown.map((k) => {
            const left = remaining === null ? null : remaining(k);
            return (
              <span
                key={`${k.suit}${k.rank}`}
                className={`wait-tile${dead(k) ? " wait-tile-noyaku" : ""}${left === 0 ? " wait-tile-gone" : ""}`}
                title={tipOf(k, left)}
              >
                <TileImg tile={{ kind: k }} size="mini" />
                {left !== null ? (
                  <span className={`wait-left${left === 0 ? " wait-left-gone" : ""}`}>{left}장</span>
                ) : null}
                {dead(k) ? <span className="wait-noyaku-tag">역없음</span> : null}
              </span>
            );
          })}
          {hidden > 0 ? <span className="wait-more">+{hidden}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

// ─────────────────────────── 내 증강 상시 정보 (액티브 버튼 옆) ───────────────────────────

/**
 * 등 떠밀기 낙인이 찍힌 당사자 기준 — **지금 패를 버리면 강제 리치가 걸리는가**.
 *
 * 낙인은 "찍혔다"만으로는 아무 일도 하지 않아서, 당하는 쪽이 그걸 규칙으로 읽지 못한다.
 * 실제로 발이 묶이는 순간은 **멘젠 텐파이로 패를 버리려는 그 순간**이므로, 그때만
 * 경고 문구를 바꿔 준다(2026-08-12 사용자 요청).
 *
 * 서버 판정(`riichiEligibleOnDiscard`)의 전부를 클라이언트가 볼 수는 없다 — 공탁
 * 1000점 여유·`riichi.blocked`·벽 잔여는 규칙 레지스트리의 몫이다. 그래서 여기서는
 * 클라이언트가 확실히 아는 조건(리치 미선언 + 멘젠 + 버리면 텐파이)만 보고,
 * **문구의 강도만** 올린다. 뱃지 자체는 낙인이 살아 있는 동안 늘 떠 있다.
 */
function pushRiichiImminent(view: PlayerView, me: PlayerInfo): boolean {
  const mine = view.round.byPlayer[me.id];
  if (mine === undefined || mine.riichiDeclared) return false;
  // 손을 열었으면(안깡 제외) 리치 조건이 서지 않는다 — 서버 isMenzen과 같은 기준
  if (!mine.melds.every((m) => m.kind === "kan_closed")) return false;
  const ids = view.zones[`hand:${me.id}`]?.tileIds ?? [];
  const kinds = ids
    .map((id) => view.tiles[id]?.kind)
    .filter((k): k is TileKind => k !== undefined);
  if (kinds.length !== ids.length || kinds.length === 0) return false;
  const opts = waitDecompOptions(me, view, kinds);
  const tenpai = (ks: TileKind[]): boolean => {
    try {
      return winningKinds(ks, mine.meldCount, undefined, opts).length > 0;
    } catch {
      return false;
    }
  };
  // 13장(대기 상태)이면 이미 텐파이인지, 14장(내 차례)이면 버려서 텐파이가 되는 패가 있는지
  if (kinds.length % 3 === 1) return tenpai(kinds);
  if (kinds.length % 3 === 2) {
    return kinds.some((_, i) => tenpai(kinds.filter((_, j) => j !== i)));
  }
  return false;
}

/**
 * 내 증강 중 "계속 보여줘야 하는 정보"를 액티브 버튼 옆에 크게 표시한다.
 * (이면투시 뒷도라, 복수자·덤터기 대상, 판돈 예치 상태, 영상정찰/도박사 영상패 등.)
 * 좌상단 증강 정보 패널은 작아서 안 보인다는 피드백에 대한 대응.
 */
const ActiveInfoBadges = memo(function ActiveInfoBadges({
  view,
  me,
}: {
  view: PlayerView;
  me: PlayerInfo;
}): JSX.Element | null {
  const av = view.augmentView;
  // 아래 분기들이 저마다 Object.entries(av)를 다시 돌던 것을 한 번으로 합친다.
  // 순서는 그대로다 — 뱃지가 늘어서는 차례가 바뀌면 눈이 찾던 자리가 흔들린다.
  const avEntries = Object.entries(av);
  const roundKeyStr = `${view.round.prevalentWind}-${view.round.roundNumber}-${view.round.honba}`;
  const badges: JSX.Element[] = [];

  const tilesBadge = (key: string, label: string, kinds: TileKind[]): void => {
    if (kinds.length === 0) return;
    badges.push(
      <span key={key} className="ai-badge">
        <span className="ai-badge-tag">{label}</span>
        <span className="ai-badge-tiles">
          {kinds.map((kind, i) => <TileImg key={i} tile={{ kind }} size="mini" />)}
        </span>
      </span>,
    );
  };
  const textBadge = (key: string, label: string, text: string): void => {
    badges.push(
      <span key={key} className="ai-badge">
        <span className="ai-badge-tag">{label}</span>
        <span className="ai-badge-text">{text}</span>
      </span>,
    );
  };
  const kindsOf = (v: unknown): TileKind[] =>
    Array.isArray(v)
      ? (v as string[]).map(parseKindKey).filter((k): k is TileKind => k !== null)
      : [];

  // 이면투시(뒷도라)는 여기 띄우지 않는다 — 중앙 도라 표시패 바로 아래(center-ura-peek)에
  // 이미 같은 것이 뜬다. 두 군데에 겹쳐 보인다는 지적(2026-08-01)에 따라 중앙만 남겼다.
  // 영상 정찰 — 공개된 영상패.
  // 깡으로 영상패가 소모되면 왕패 앞 4장이 더는 전부 영상패가 아니므로(07 §2)
  // 남은 영상패 수만큼만 자른다 — 안 그러면 도라 표시패가 '영상패'로 새어 보인다.
  const dw = view.zones["deadWall"]?.tileIds ?? [];
  const rinshanShown = Math.min(dw.length, rinshanLeftOf(view));
  if (rinshanShown > 0) {
    tilesBadge(
      "rinshan",
      "영상패",
      dw
        .slice(0, rinshanShown)
        .map((id) => view.tiles[id]?.kind)
        .filter((k): k is TileKind => k !== undefined),
    );
  }
  // 복수자 — 내가 찍은 원수 / 내가 원수로 찍힌 상태 (둘 다 경고급 정보라 크게 띄운다)
  const myNemesis = av[`avenger:${me.id}`];
  if (typeof myNemesis === "string" && myNemesis !== "") {
    textBadge("avenger", "복수 대상", playerNameById(view, myNemesis));
  }
  for (const [key, value] of avEntries) {
    if (!key.startsWith("avenger:") || value !== me.id) continue;
    const hunter = key.slice("avenger:".length);
    if (hunter === me.id) continue;
    textBadge(`avenged_by_${hunter}`, "표적", `${playerNameById(view, hunter)}에게 안전패 없음`);
  }
  // 덤터기 지목 대상 (내 것)
  const scape = av[`scapegoat:${me.id}`];
  if (typeof scape === "string") textBadge("scapegoat", "덤터기", playerNameById(view, scape));
  // 판돈 굴리기 배수(×4)·일확천금 배수도 그 사람의 증강 pill에 붙는다.
  // 스파이 — 내가 찍은 패는 나만 본다(비밀 지정)
  const spyMark = av["spy:mark"];
  if (typeof spyMark === "string") {
    const kind = parseKindKey(spyMark);
    if (kind !== null) tilesBadge("spy", "🕵️ 스파이", [kind]);
  }
  // 카르마 업보 게이지 · 대기만성 만개 · 가불 인생 · 만년 오야는 이제 그 사람의
  // 이름표 증강 pill 위에 잔량/게이지로 붙는다(aug-pill-chip·aug-pill-gauge).
  // 여기서도 띄우면 같은 값이 화면 두 곳에 겹친다.
  /*
   * 리치가 **평범한 이유로** 막혔을 때 — 증강 봉인은 아래에서 따로 알린다.
   *
   * 액션 바는 서버가 준 옵션만 그리므로, 리치가 막히면 버튼이 그냥 없다. 점수가
   * 1000점 아래로 떨어진 순간부터 리치가 영영 안 뜨는데 화면 어디에도 그 인과가
   * 없었다. 증강 봉인·손패 조작 차단은 이미 이유를 적어 주는데 표준 규칙만 구멍이었다.
   */
  const riichiBlocked = view.round.byPlayer[me.id]?.riichiBlocked;
  if (riichiBlocked !== undefined) {
    textBadge("riichi-blocked", "리치 불가", RIICHI_BLOCK_TEXT[riichiBlocked]);
  }
  // 리치 봉인 / 이중 선언 — 내 리치가 잠겼으면 왜 잠겼는지 반드시 보여준다
  for (const [key, value] of avEntries) {
    if (key.startsWith("riichi_seal:") && typeof value === "string") {
      const who = key.slice("riichi_seal:".length);
      if (who !== me.id) textBadge(key, "🔒 리치 봉인", `${playerNameById(view, who)}의 선제 리치 — 이번 국 리치 불가`);
      else textBadge(key, "🔒 리치 봉인", "내 선제 리치로 나머지 셋의 리치를 잠갔다");
    }
    if (key.startsWith("riichi_upgrade:") && typeof value === "string") {
      const who = key.slice("riichi_upgrade:".length);
      if (value === me.id) textBadge(key, "🔒 리치 봉인", `${playerNameById(view, who)}의 이중 선언 — 이번 국 리치 불가`);
      else if (who === me.id) textBadge(key, "🔒 이중 선언", `${playerNameById(view, value)}의 리치를 잠갔다`);
    }
  }
  /*
   * 등 떠밀기 — **낙인이 찍힌 당사자**에게 규칙을 알려 준다.
   *
   * 관계 표식(이름표의 🤚)만으로는 "무슨 일이 예약됐는지"가 안 읽힌다. 당하는 쪽은
   * 다마텐으로 숨을 수 없다는 것을 **버리기 전에** 알아야 대응(후로로 손 열기·텐파이
   * 늦추기)을 고를 수 있다 — 2026-08-12 사용자 요청. 지금 당장 걸리는 상황이면
   * 문구를 그 순간의 말로 바꾼다(pushRiichiImminent).
   */
  for (const [key, value] of avEntries) {
    if (!key.startsWith("push_riichi:") || key.startsWith("push_riichi:fired:")) continue;
    if (typeof value !== "string" || value !== me.id) continue;
    const by = key.slice("push_riichi:".length);
    if (by === me.id) continue;
    // 누가 찍었는지는 이름표의 관계 표식(🤚)이 이미 말한다 — 여기서는 **규칙**만 짧게.
    textBadge(
      key,
      "🤚 등 떠밀기",
      pushRiichiImminent(view, me)
        ? "지금 버리면 자동 리치"
        : "멘젠 텐파이로 버리면 자동 리치",
    );
  }
  // 미래를 보는 자 — 교환으로 **가져온 3장**(전원 공개). 무엇이 들어왔는지 안 보인다는 피드백 대응.
  for (const [key, value] of avEntries) {
    if (!key.startsWith("future_sight:got:")) continue;
    if (!Array.isArray(value)) continue;
    const who = key.slice("future_sight:got:".length);
    const kinds = (value as unknown[])
      .filter((id): id is number => typeof id === "number")
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    if (kinds.length === 0) continue;
    tilesBadge(
      `fs_got_${who}`,
      who === me.id ? "🔮 가져온 패" : `🔮 ${playerNameById(view, who)} 가져옴`,
      kinds,
    );
  }
  // 안개 덮인 바닥 — 선언되면 누가 걸었는지 상시로 보여 준다(내 바닥도 가려지므로)
  for (const [key, value] of avEntries) {
    if (!key.startsWith("hidden_river:") || key.startsWith("hidden_river:last:")) continue;
    if (typeof value !== "string") continue;
    const who = key.slice("hidden_river:".length);
    // 문구는 **최근 6장**이다. 2026-08-02에 공개 범위가 "각자의 마지막 1장"에서 최근 6장으로
    // 넓어졌는데 이 뱃지만 옛 문구로 남아 있어서, 상대는 실제로 보이는 현물을 두고
    // "한 장밖에 못 본다"고 읽었다(2026-08-17 사용자 지적).
    textBadge(
      key,
      "🌫 안개 덮인 바닥",
      `${who === me.id ? "내" : `${playerNameById(view, who)}의`} 선언 — 최근 6장만 보인다`,
    );
  }
  // 박무 — 안개 덮인 바닥과 같은 계열인데 이쪽만 상시 표식이 없었다. 선언 컷인은 뜨지만
  // 6순 지속 상태는 채널 head가 어느 표에도 없어 접힌 📜 로그의 글줄 하나로만 떨어졌다.
  // 값이 "안개 (3순 남음)"이라 남은 순도 그대로 실려 있다.
  for (const [key, value] of avEntries) {
    if (!key.startsWith("brief_fog:") || key.startsWith("brief_fog:last:")) continue;
    if (typeof value !== "string" || value === "") continue;
    const who = key.slice("brief_fog:".length);
    if (!view.players.some((p) => p.id === who)) continue;
    textBadge(
      key,
      "🌁 박무",
      `${who === me.id ? "내" : `${playerNameById(view, who)}의`} 선언 — 모두의 바닥이 가려진다 · ${value.replace(/^안개\s*\(|\)$/g, "")}`,
    );
  }
  // 가려진 도라 — 뷰 채널이 없는 순수 Modifier라, 비보유자 화면에서는 도라 표시패가
  // 그냥 빈 뒷면으로만 뜬다. "아직 안 열린 슬롯"과 그림이 똑같아 버그로 읽혔다.
  // 증강 보유 자체는 공개 정보이므로 보유자를 여기서 바로 찾아 쓴다.
  if (view.round.doraIndicators.length === 0) {
    const holder = view.players.find((p) => p.augments.includes("dora_conceal"));
    if (holder !== undefined && holder.id !== me.id) {
      textBadge("dora_conceal", "🌑 가려진 도라", `${holder.nickname} — 이번 국 도라는 그 사람만 안다`);
    }
  }
  // 역만 방어술 방어 횟수 · 연금술 잔여 · 왕패 교환 잔여도 이름표 pill로 옮겼다
  // (그 증강이 몇 번 남았는지는 그 증강 위에 붙는 게 맞다).
  // 본장 사냥꾼의 본장 가치도 그 사람의 증강 pill에 붙는다.
  // 격(格) — 지목당했으면 그 국 내내 "싼 손으로는 못 오른다"를 상시로 보여준다
  // (지목형 공통 연출 규칙: 전면 컷인 + 상시 뱃지 + 관계 표식).
  for (const [key, raw] of avEntries) {
    if (!key.startsWith("rank_gate:")) continue;
    const mark = raw as { round?: string; by?: string; target?: string; minHan?: number } | null;
    if (mark === null || typeof mark !== "object") continue;
    if (mark.round !== roundKeyStr) continue;
    if (mark.target === me.id) {
      textBadge(
        `rank_gate_on_me_${mark.by ?? ""}`,
        "격(格) 지목당함",
        `${mark.minHan ?? 5}판 미만 화료 불가 — ${playerNameById(view, mark.by ?? "")}`,
      );
    } else if (mark.by === me.id && typeof mark.target === "string") {
      textBadge("rank_gate_mine", "격(格) 지목", playerNameById(view, mark.target));
    }
  }
  // 무장해제 — 내 증강이 잠겼거나 내가 잠갔으면 그 국 내내 크게 보여준다.
  // (좌상단 패널에만 있으면 "잠긴 것 같지가 않다"는 인상이 남는다 — 2026-08-01 보고)
  for (const [key, raw] of avEntries) {
    if (!key.startsWith("disarm:")) continue;
    const m = raw as { target?: string; augmentId?: string } | null;
    if (m === null || typeof m !== "object" || typeof m.target !== "string") continue;
    const by = key.slice("disarm:".length);
    const augName = augmentDisplayName(m.augmentId ?? "");
    if (m.target === me.id) {
      textBadge(
        `disarm_on_me_${by}`,
        "🔒 무장해제당함",
        `${augName} — ${playerNameById(view, by)}가 이번 국 잠갔다`,
      );
    } else if (by === me.id) {
      textBadge(
        "disarm_mine",
        "🔒 무장해제",
        `${playerNameById(view, m.target)}의 ${augName} 잠금`,
      );
    }
  }

  if (badges.length === 0) return null;
  return <div className="active-info">{badges}</div>;
});

// ─────────────────────────── 액티브 증강 버튼 ───────────────────────────

/**
 * 능동 발동 증강(회수·강탈·간파 등)을 위한 전용 버튼.
 * - 지금 사용할 수 있으면 활성(옵션이 여럿이면 목록을 펼친다).
 * - 액티브 증강을 보유했지만 지금 못 쓰면 비활성.
 * - 액티브 증강이 없으면 표시하지 않는다.
 */
function ActiveAugmentControl(props: {
  view: PlayerView;
  me: PlayerInfo;
  prompt: PromptMessage["prompt"] | null;
  catalog: Record<string, AugmentCatalogEntry>;
  /**
   * 지금 이름표 pill에 빛낼 증강 id들을 위로 올린다 (없으면 null).
   *
   * - 버튼에 손을 올리면: 쓸 수 있는 **전부** — "액티브(2)의 2가 무엇인지"를 잇는다.
   * - 열린 메뉴의 한 줄에 올리면: **그 하나만** — 메뉴에 뜨는 것은 액션 이름이라
   *   (되돌리기 ↔ 미련) 이름만으로는 내가 가진 증강과 이어지지 않았다.
   * (2026-08-15 사용자 요청)
   */
  onUsableHint?: (ids: readonly string[] | null) => void;
}): JSX.Element | null {
  const { view, me, prompt } = props;
  // pill 발광 신호를 보내는 콜백 — 훅(effect) 안에서도 써야 해서 여기서 한 번 꺼낸다.
  // (아래 hintOne/hintAll/hintNone은 조기 반환 뒤에 선언되므로 훅에서는 못 쓴다.)
  const onHint = props.onUsableHint;
  // 무장(클릭 발동) 상태는 게임판 전체가 공유하므로 SelectionContext에서 읽는다.
  const sel = useContext(SelectionContext);
  const [open, setOpen] = useState(false);
  // 메뉴에서 파고든 액션 타입 — null이면 1단계(증강 목록), 값이 있으면 2단계(그 증강의 후보들).
  // 후보를 증강 이름과 뒤섞어 한 층에 늘어놓으면 핏빛 계약처럼 후보가 8개인 증강이
  // 메뉴를 통째로 차지해 다른 액티브 증강이 묻힌다 — 증강을 고른 뒤 후보를 고른다.
  const [menuType, setMenuType] = useState<string | null>(null);
  // 후보를 드롭다운 버튼으로 늘어놓지 않고 전용 모달로 고르는 타입 (docs/10 §2a-1).
  // 값은 모달을 띄울 액션 타입 — 닫히면 null.
  const [pickModal, setPickModal] = useState<string | null>(null);
  // 모달 안에서 여러 번 클릭해 조립하는 선택 (왕패의 주인의 1단계 손패 등)
  const [modalPick, setModalPick] = useState<number[]>([]);
  // 왕패의 주인 — 확정 전까지 쌓아 두는 교환 쌍 (손패 ↔ 왕패 자리). 남은 횟수만큼 담긴다.
  const [dwPairs, setDwPairs] = useState<{ handTileId: number; deadIndex: number }[]>([]);
  // 예지 — 재배열 드래그 중인 순서. arr[newPos] = 원래 인덱스. null이면 손대지 않은 상태.
  const [foresightArr, setForesightArr] = useState<number[] | null>(null);
  const [foresightDragFrom, setForesightDragFrom] = useState<number | null>(null);
  /**
   * 예지 재배열 탭이 열려 있는가.
   *
   * 재배열은 여태 액티브 버튼 옆의 **작은 스트립 안에서** 해야 했다. 미니 패 넉 장이
   * 손가락보다 작고, 판 구석에 붙어 있어 무엇을 어디로 끌고 있는지 보이지 않았다
   * (2026-08-12 사용자 보고: "예지 조작이 어색하다"). 분열·염색처럼 **전용 탭**을
   * 크게 띄운다. 닫아도 스트립은 남아 공개된 패는 계속 보인다.
   */
  const [foresightTab, setForesightTab] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // 메뉴가 열려 있을 때 바깥을 누르면 닫는다 (실수로 눌러도 다른 곳 클릭으로 취소)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMenuType(null);
        // 메뉴가 사라지면 pill 발광도 함께 끈다 — 안 그러면 손을 뗄 자리가 없어져
        // 빛이 그대로 남는다(마우스가 이미 메뉴 밖에 있으니 onMouseLeave가 안 온다).
        onHint?.(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onHint]);
  // 증강 리치만 들고 있다면 이 버튼은 아예 안 뜬다 — 그건 액션 바가 맡는다.
  const hasActive = me.augments.some(
    (a) => ACTIVE_AUGMENT_IDS.has(a) && !RIICHI_AUG_IDS.has(a),
  );
  const myPrompt = prompt !== null && prompt.player === view.playerId ? prompt : null;
  // 영상패 선택(bloom_pick)은 전용 모달이 담당하므로 이 버튼에서는 제외한다.
  // (예지 foresight_order는 byType에는 남겨 두되 아래 menuTypes에서 빼 메뉴엔 안 띄운다.)
  // 증강 리치(오픈·스텔스·올인·영혼의 일격)는 액션 바가 [리치] 옆에 전용 버튼으로
  // 세운다 — 여기까지 겹쳐 놓으면 같은 액션이 두 군데서 뜨고, 정작 이 메뉴에서만
  // 고를 수 있는 다른 액티브 증강이 개수에 묻힌다 (2026-08-08 사용자 요청).
  const augOptions = (myPrompt?.options ?? []).filter(
    (o) =>
      AUGMENT_ACTION_TYPES.has(o.type) &&
      !DRAG_DISCARD_ARM_TYPES.has(o.type) &&
      o.type !== "bloom_pick" &&
      o.type !== "swap3_give" &&
      o.type !== "swap3_take" &&
      o.type !== "future_exchange",
  );

  // 예지 — 공개된 패산 앞 장들의 kind (뽑히는 대로 앞에서 한 장씩 줄어든다).
  // 훅은 조기 반환보다 위에 있어야 한다(Rules of Hooks).
  const foresightPeek = useMemo<TileKind[]>(() => {
    const raw = view.augmentView["foresight_peek"];
    return Array.isArray(raw)
      ? (raw as string[]).map(parseKindKey).filter((k): k is TileKind => k !== null)
      : [];
  }, [view.augmentView]);
  const foresightReorderable =
    (myPrompt?.options ?? []).some((o) => o.type === "foresight_order") &&
    foresightPeek.length === 4;
  /**
   * 공개된 패들이 각각 **누구의 쯔모가 되는지** — 렌더 시점의 차례·진행 방향에서 계산한다.
   * 고정 배열(["하가","대면","상가","나"])이던 시절에는 역행(turn.direction = −1)에서
   * 라벨이 통째로 뒤집혔다.
   */
  const foresightSeatLabels = useMemo<string[]>(() => {
    const seatCount = view.players.length;
    const mySeat = view.players.find((p) => p.id === view.playerId)?.seat ?? 0;
    const dir = view.round.direction;
    return projectedDrawSeats(
      view.round.turnSeat,
      dir,
      seatCount,
      foresightPeek.length,
    ).map((s) => relativeSeatLabel(mySeat, s, dir, seatCount));
  }, [
    view.players,
    view.playerId,
    view.round.turnSeat,
    view.round.direction,
    foresightPeek.length,
  ]);
  // 재배열 후보가 뜨면 드래그용 항등 순서를 깐다. 후보가 사라지면(제출·턴 종료·국에 1회
  // 소진) 비운다 — 그래도 공개된 패는 아래 스트립에 계속 보인다(열람만 되는 재발동 포함).
  useEffect(() => {
    if (foresightReorderable) {
      if (foresightArr === null) setForesightArr([0, 1, 2, 3]);
    } else if (foresightArr !== null) {
      setForesightArr(null);
    }
  }, [foresightReorderable, foresightArr]);
  // 재배열이 열리면 전용 탭을 곧바로 띄우고, 닫히면(제출·턴 종료·소진) 탭도 접는다.
  // 발동=공개는 취소할 수 없으므로, 열자마자 크게 보여주는 편이 흐름에 맞는다.
  useEffect(() => {
    setForesightTab(foresightReorderable);
  }, [foresightReorderable]);

  // 모달이 떠 있는 동안 그 액션이 프롬프트에서 사라지면(교환 소진·턴 종료·리치 등)
  // 탭을 자동으로 닫는다. 예전엔 남아 있어서 이미 끝난 선택창을 손으로 닫아야 했다.
  useEffect(() => {
    if (pickModal === null) return;
    if ((myPrompt?.options ?? []).some((o) => o.type === pickModal)) return;
    setPickModal(null);
    setModalPick([]);
    setDwPairs([]);
  }, [pickModal, myPrompt]);

  // 파고든 증강의 후보가 프롬프트에서 사라지면 1단계로 되돌린다 (빈 목록이 남지 않게).
  useEffect(() => {
    if (menuType === null) return;
    if ((myPrompt?.options ?? []).some((o) => o.type === menuType)) return;
    setMenuType(null);
  }, [menuType, myPrompt]);

  // ── 왕패의 주인 — 여러 쌍을 한 번에 고른 뒤 차례로 제출한다 ──
  // 서버는 교환 1회 = 액션 1개라, 고른 쌍을 **프롬프트가 갱신될 때마다 하나씩** 보낸다.
  // (연달아 보내면 두 번째가 갱신 전 프롬프트에 실려 거부된다 — 보낸 프롬프트를 ref로 기억해 막는다.)
  const [dwQueue, setDwQueue] = useState<{ handTileId: number; deadIndex: number }[]>([]);
  const dwSentPromptRef = useRef<unknown>(null);
  useEffect(() => {
    if (dwQueue.length === 0) return;
    if (myPrompt === null) return;
    if (dwSentPromptRef.current === myPrompt) return; // 이 프롬프트에는 이미 보냈다
    const head = dwQueue[0]!;
    const opt = myPrompt.options.find((o) => {
      if (o.type !== "dw_swap") return false;
      const p = o.payload as { handTileId?: unknown; deadIndex?: unknown };
      return p.handTileId === head.handTileId && p.deadIndex === head.deadIndex;
    });
    if (opt === undefined) {
      // 남은 교환이 없거나 상황이 바뀌어 더는 못 보낸다 — 조용히 접는다.
      setDwQueue([]);
      return;
    }
    dwSentPromptRef.current = myPrompt;
    sel.submit(opt);
    setDwQueue((cur) => cur.slice(1));
  }, [dwQueue, myPrompt, sel]);

  if (!hasActive && augOptions.length === 0) return null;

  const usable = augOptions.length > 0;
  const activeIds = me.augments.filter(
    (a) => ACTIVE_AUGMENT_IDS.has(a) && !RIICHI_AUG_IDS.has(a),
  );
  /*
   * 못 쓰는 이유 — 예전에는 `지금은 사용할 수 없습니다 — {이름들}`이 전부였다.
   *
   * 잔량·쿨다운은 서버가 보유자 채널로 실어 주므로 그대로 읽어 붙인다. 상태 조건
   * ("국의 첫 순에만"·"리치 중 불가"처럼)은 서버가 이유를 실어 주지 않으므로 지어내지
   * 않는다 — 틀린 이유를 대느니 아는 것만 말하는 편이 낫다.
   */
  const blockedNote = (id: string): string => {
    const name = props.catalog[id]?.name ?? id;
    const rounds = cooldownRoundsLeft(view, me.id, id);
    if (rounds > 0) return `${name} — 쿨다운 ${rounds}국`;
    const turns = cooldownTurnsLeft(view, me.id, id);
    if (turns > 0) return `${name} — 쿨다운 ${turns}순`;
    const uses = view.augmentView[`uses:${id}`] as { left?: unknown } | undefined;
    if (uses !== undefined && typeof uses.left === "number" && uses.left <= 0) {
      return `${name} — 남은 횟수 없음`;
    }
    if (disarmedAugmentsOf(view, me.id).has(id)) return `${name} — 무장해제로 잠김`;
    return name;
  };

  // 액션 타입별로 옵션을 묶는다 (타일 선택형은 개별 옵션이 아니라 '패 클릭'으로 발동)
  const byType = new Map<string, ActionOption[]>();
  for (const o of augOptions) byType.set(o.type, [...(byType.get(o.type) ?? []), o]);
  // 메뉴에 띄울 타입 — 예지 재배열(foresight_order)은 발동 후 드래그 모달 전용이라 제외한다.
  // (byType에는 남아 있어 모달이 후보를 골라 제출한다.)
  const types = [...byType.keys()].filter((t) => t !== "foresight_order");

  // 지금 쓸 수 있는 **증강 id** — 한 증강이 액션 타입을 둘 이상 낼 수 있으므로
  // (예지의 발동·재배열) 증강 id로 접는다. 버튼 옆 개수와 pill 발광이 같은 목록을 본다.
  const usableAugIds = [...new Set(types.map((t) => ACTION_AUGMENT[t] ?? t))];

  /*
   * 이름표 pill 발광 신호 — 지금 보고 있는 것이 **어느 증강인지**를 pill로 되짚는다.
   *
   * 버튼에 올리면 쓸 수 있는 전부(hintAll), 메뉴에서 한 줄에 올리면 그 하나만(hintOne).
   * 메뉴 밖으로 나가거나 발동해서 메뉴가 닫히면 끈다(hintNone). 메뉴 항목의 이름만으로는
   * "이게 내가 가진 그 증강"이 바로 안 이어져서, 액션 이름(예: '되돌리기')과 증강 이름이
   * 다른 것들은 특히 헷갈렸다 (2026-08-15 사용자 요청).
   */
  const hintOne = (type: string): void =>
    props.onUsableHint?.([ACTION_AUGMENT[type] ?? type]);
  const hintAll = (): void => props.onUsableHint?.(usableAugIds);
  const hintNone = (): void => props.onUsableHint?.(null);

  const augNameFor = (type: string): string => augActionName(props.catalog, type);

  // 손패·상대·바닥을 '클릭'해 발동하는 액션 — 버튼 목록 대신 선택 모드(무장)로 넘긴다.
  const armType = (t: string): boolean => armModeOf(t) !== undefined;
  const armHint = (t: string): string => {
    switch (armModeOf(t)) {
      case "opp":
        return "상대 클릭으로 선택";
      case "own-river":
        return "내 버림패 클릭으로 선택";
      case "opp-river":
        return "상대 버림패 클릭으로 선택";
      case "any-river":
        return "아무 바닥의 버림패 클릭으로 선택";
      case "swap3":
        return "상대·손패 클릭으로 선택";
      default:
        return "손패 클릭으로 선택";
    }
  };

  // 이 타입 발동 — 클릭형이면 무장, 모달형이면 전용 모달, 옵션 1개면 즉시 제출,
  // 여럿이면 그 증강의 후보 목록(2단계)으로 파고든다.
  const activate = (type: string): void => {
    setOpen(false);
    setMenuType(null);
    if (armType(type)) {
      sel.arm(type);
      hintNone();
      return;
    }
    if (MODAL_PICK_TYPES.has(type)) {
      setPickModal(type);
      hintNone();
      return;
    }
    const opts = byType.get(type) ?? [];
    if (opts.length === 1) {
      sel.submit(opts[0]!);
      hintNone();
      return;
    }
    // 2단계로 파고든다 — 메뉴는 그대로 열려 있으므로 그 증강만 계속 빛낸다.
    setMenuType(type);
    setOpen(true);
    hintOne(type);
  };

  // 버튼 옆 개수 = **지금 쓸 수 있는 액티브 증강의 수**(위 usableAugIds).
  // 예전엔 후보 옵션 수를 셌다 — 회수(버림패마다 후보 1개)·연금술(패×방향)처럼 후보가
  // 패 수만큼 나오는 증강이 "액티브 증강 (17)"처럼 떠 패 개수로 읽혔다(2026-08-01 보고).
  const displayCount = usableAugIds.length;

  const click = (): void => {
    if (!usable) return;
    // 다시 눌러 선택 모드 취소(같은 타입이면 해제). 증강 리치 무장은 이 버튼 소관이
    // 아니므로 여기서 가로채지 않는다 — 그냥 메뉴를 연다(무장은 sel.arm이 교체한다).
    if (sel.armedType !== null && !DRAG_DISCARD_ARM_TYPES.has(sel.armedType)) {
      sel.arm(sel.armedType);
      return;
    }
    if (open) {
      setOpen(false);
      setMenuType(null);
      // 손은 아직 버튼 위다 — 메뉴만 접히므로 발광은 '쓸 수 있는 전부'로 되돌린다.
      hintAll();
      return;
    }
    if (types.length === 1) {
      activate(types[0]!);
      return;
    }
    setMenuType(null);
    setOpen(true);
  };

  // 단색 세계·편식 — 통일할 무늬를 '내 손패가 그 색이 된 모습'으로 보여주고 고르게 한다.
  // 두 증강의 효과가 완전히 같으므로(퀘스트판) 모달도 한 벌만 둔다.
  const monoType =
    pickModal === "mono_world" || pickModal === "picky_unify" ? pickModal : null;
  const monoOptions = monoType === null ? [] : (byType.get(monoType) ?? []);
  // 모달에 펼치는 내 손패는 **항상 정렬해서** 보여준다 — Zone 순서(뽑은 순)로 두면
  // 게임판의 손패와 배열이 달라 같은 패를 눈으로 못 찾는다.
  const myHandIds = sortTileIds(view.zones[`hand:${me.id}`]?.tileIds ?? [], view.tiles);

  // ── 정적의 손 — 네 바닥을 통째로 펼쳐 주울 버림패 1장을 고른다 ──
  const silentByOwner = (() => {
    if (pickModal !== "silent_take") return [];
    const opts = byType.get("silent_take") ?? [];
    const byId = new Map<number, ActionOption>();
    for (const o of opts) {
      const t = (o.payload as { tileId?: unknown }).tileId;
      if (typeof t === "number") byId.set(t, o);
    }
    return view.players.map((p) => ({
      player: p,
      tiles: (view.zones[`discards:${p.id}`]?.tileIds ?? [])
        .filter((id) => byId.has(id))
        .map((id) => ({ id, opt: byId.get(id) as ActionOption })),
    }));
  })();

  // ── 예지 — 공개된 패를 버튼 옆 스트립에 늘어놓고, 재배열 가능할 때만 드래그시킨다 ──
  // (후보 매핑·핸들러; 훅은 위에)
  const foresightOpts = byType.get("foresight_order") ?? [];
  const foresightByKey = new Map<string, ActionOption>();
  for (const o of foresightOpts) {
    const ord = (o.payload as { order?: unknown }).order;
    if (Array.isArray(ord)) foresightByKey.set(ord.join(","), o);
  }
  // 스트립에 그릴 순서 — 재배열 중이면 드래그 순서, 아니면 공개된 그대로.
  const foresightOrder: number[] =
    foresightReorderable && foresightArr !== null
      ? foresightArr
      : foresightPeek.map((_k, i) => i);
  // 손대지 않았으면(항등) 확정할 게 없다 — 국에 한 번뿐인 재배열을 헛되이 쓰지 않게 막는다.
  const foresightMoved = foresightOrder.some((orig, pos) => orig !== pos);
  const confirmForesight = (arr: number[]): void => {
    const opt = foresightByKey.get(arr.join(","));
    if (opt !== undefined) sel.submit(opt);
    setForesightDragFrom(null);
  };
  /** from 자리의 패를 빼서 to 자리에 끼워 넣는다 (드래그·탭 두 경로가 함께 쓴다) */
  const moveForesight = (from: number, to: number): void => {
    setForesightDragFrom(null);
    if (from === to) return;
    setForesightArr((cur) => {
      if (cur === null) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved as number);
      return next;
    });
  };

  // ── 왕패의 주인 — 내 손패 ↔ 왕패를 **여러 쌍 한 번에** 고른다 ──
  // 고른 쌍은 바로 보내지 않고 아래에 쌓아 두었다가 '확정'에서 dwQueue로 넘긴다
  // (서버는 교환 1회 = 액션 1개라 위쪽 effect가 프롬프트마다 하나씩 흘려보낸다).
  const dwOpts = pickModal === "dw_swap" ? (byType.get("dw_swap") ?? []) : [];
  // 손패는 옵션 나열 순서(=Zone 순서)가 아니라 정렬해서 보여준다
  const dwHandIds = sortTileIds(
    [
      ...new Set(
        dwOpts
          .map((o) => (o.payload as { handTileId?: unknown }).handTileId)
          .filter((x): x is number => typeof x === "number"),
      ),
    ],
    view.tiles,
  );
  const deadWallIds = view.zones["deadWall"]?.tileIds ?? [];
  // 이번 국에 남은 교환 횟수 — 한 번에 고를 수 있는 쌍의 상한이다
  const dwRemaining = (() => {
    const v = view.augmentView[`dead_wall_master:remaining:${me.id}`];
    return typeof v === "number" ? v : 1;
  })();
  const dwStagedHand = new Set(dwPairs.map((p) => p.handTileId));
  const dwStagedDead = new Set(dwPairs.map((p) => p.deadIndex));
  const dwPending = modalPick[0];
  /** 이 쌍이 실제 후보로 와 있는가 (합법성 최종 판정은 서버 validate) */
  const dwHasOpt = (handTileId: number, deadIndex: number): boolean =>
    dwOpts.some((o) => {
      const p = o.payload as { handTileId?: unknown; deadIndex?: unknown };
      return p.handTileId === handTileId && p.deadIndex === deadIndex;
    });
  /** 손패를 눌렀을 때 — 이미 짝지어진 패면 그 쌍을 취소하고, 아니면 대기 선택으로 잡는다 */
  const dwClickHand = (id: number): void => {
    if (dwStagedHand.has(id)) {
      setDwPairs((cur) => cur.filter((p) => p.handTileId !== id));
      return;
    }
    setModalPick((cur) => (cur[0] === id ? [] : [id]));
  };
  /** 왕패를 눌렀을 때 — 짝지어진 자리면 취소, 아니면 대기 중인 손패와 짝을 짓는다 */
  const dwClickDead = (idx: number): void => {
    if (dwStagedDead.has(idx)) {
      setDwPairs((cur) => cur.filter((p) => p.deadIndex !== idx));
      return;
    }
    if (dwPending === undefined) return;
    if (dwPairs.length >= dwRemaining) return;
    if (!dwHasOpt(dwPending, idx)) return;
    setDwPairs((cur) => [...cur, { handTileId: dwPending, deadIndex: idx }]);
    setModalPick([]);
  };

  // ⚠ 이 모달들은 반드시 **body로 포탈**해야 한다.
  // 조상 `.own-area`에 `transform: translateX(-50%)`가 걸려 있어서, 그 안에서 렌더하면
  // 자식의 `position: fixed`가 뷰포트가 아니라 그 요소를 기준으로 잡힌다 →
  // 모달이 화면 아래쪽에 붙어 잘린다. (OwnArea의 기존 모달들은 `.own-area` 바깥
  // 형제로 렌더돼 있어서 이 문제를 피해 갔다.)
  const closeModal = (): void => {
    setPickModal(null);
    setModalPick([]);
    setDwPairs([]);
  };

  return (
    <div className="own-aug" ref={rootRef}>
      {monoType !== null && monoOptions.length > 0 ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel aug-pick-wide">
            <div className="rinshan-pick-title">🎨 {augNameFor(monoType)} — 통일할 무늬 선택</div>
            <div className="rinshan-pick-sub">
              고른 무늬로 손패의 모든 수패가 물듭니다. 자패는 그대로입니다 —
              아래는 실제로 바뀔 손패의 모습입니다.
            </div>
            <div className="aug-pick-rows">
              {monoOptions.map((o, i) => {
                const suit = (o.payload as { suit?: unknown }).suit;
                if (typeof suit !== "string") return null;
                const preview = unifyPreview(view, myHandIds, suit as TileKind["suit"]);
                return (
                  <button
                    key={`${suit}-${i}`}
                    className="aug-pick-row"
                    onClick={() => {
                      sel.submit(o);
                      setPickModal(null);
                    }}
                  >
                    <span className="aug-pick-row-label">{optionDetail(view, o) || suit}</span>
                    <span className="aug-pick-row-tiles">
                      {preview.map((p) => (
                        <TileImg key={p.id} tile={p.tile} size="mini" />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="rinshan-pick-skip" onClick={closeModal}>
              닫기 (발동하지 않고 진행)
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      {/* 이면투시 — 뒷도라 표시패와 맞바꿀 왕패 자리를 고른다 */}
      {pickModal === "ura_swap" ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel aug-pick-wide">
            <div className="rinshan-pick-title">🔮 {augNameFor("ura_swap")}</div>
            <div className="rinshan-pick-sub">
              지금 뒷도라 표시패를 왕패의 다른 패와 맞바꿉니다 — 본 것을 원하는 대로 고쳐 쓰세요.
              도라·뒷도라 표시패 자리는 고를 수 없습니다.
            </div>
            <div className="aug-pick-rows">
              <div className="aug-pick-row aug-pick-row-static">
                <span className="aug-pick-row-label">왕패</span>
                <span className="aug-pick-row-tiles">
                  {(byType.get("ura_swap") ?? []).map((o, i) => {
                    const idx = (o.payload as { deadIndex?: unknown }).deadIndex;
                    if (typeof idx !== "number") return null;
                    const tileId = deadWallIds[idx];
                    if (tileId === undefined) return null;
                    return (
                      <button
                        key={`${idx}-${i}`}
                        className="aug-pick-tile"
                        onClick={() => {
                          sel.submit(o);
                          closeModal();
                        }}
                      >
                        <TileImg tile={view.tiles[tileId]} size="mini" />
                      </button>
                    );
                  })}
                </span>
              </div>
            </div>
            <button className="rinshan-pick-skip" onClick={closeModal}>
              닫기 (바꾸지 않고 진행)
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      {/* 붉은 손길 — 적도라로 만들 숫자를 고른다 (내 손패에 실제로 있는 숫자만) */}
      {pickModal === "red_touch" ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel aug-pick-wide">
            <div className="rinshan-pick-title">🔴 {augNameFor("red_touch")} — 물들일 숫자 선택</div>
            <div className="rinshan-pick-sub">
              고른 숫자의 손패가 <b>전부 적도라</b>가 됩니다. 게임당 한 번뿐입니다.
            </div>
            <div className="aug-pick-rows">
              {(byType.get("red_touch") ?? []).map((o, i) => {
                const rank = (o.payload as { rank?: unknown }).rank;
                if (typeof rank !== "number") return null;
                const hit = myHandIds.filter((id) => {
                  const k = view.tiles[id]?.kind;
                  return (
                    k !== undefined &&
                    (k.suit === "man" || k.suit === "pin" || k.suit === "sou") &&
                    k.rank === rank
                  );
                });
                return (
                  <button
                    key={`${rank}-${i}`}
                    className="aug-pick-row"
                    onClick={() => {
                      sel.submit(o);
                      closeModal();
                    }}
                  >
                    <span className="aug-pick-row-label">{rank} → 적도라 {hit.length}장</span>
                    <span className="aug-pick-row-tiles">
                      {hit.map((id) => {
                        const k = view.tiles[id]?.kind;
                        return k === undefined ? null : (
                          <TileImg key={id} tile={{ kind: k, attrs: { red: true } }} size="mini" />
                        );
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="rinshan-pick-skip" onClick={closeModal}>
              닫기 (발동하지 않고 진행)
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      {/* 정적의 손 — 네 바닥을 통째로 펼쳐 주울 버림패 1장을 고른다 */}
      {pickModal === "silent_take" ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel aug-pick-wide">
            <div className="rinshan-pick-title">🤫 {augNameFor("silent_take")} — 주울 버림패 선택</div>
            <div className="rinshan-pick-sub">
              바닥에서 한 장을 골라 가져옵니다 — 지금 쯔모한 패는 패산 맨 밑으로 돌아가고,
              고른 패가 그 자리를 대신합니다. <b>이어서 한 장을 버려야 하며</b> 그 버림에
              상대의 론이 붙을 수 있습니다.
            </div>
            <div className="aug-pick-rows">
              {silentByOwner.map(({ player, tiles }) =>
                tiles.length === 0 ? null : (
                  <div key={player.id} className="aug-pick-row aug-pick-row-static">
                    <span className="aug-pick-row-label">
                      {player.id === me.id ? "내 바닥" : playerNameById(view, player.id)}
                    </span>
                    <span className="aug-pick-row-tiles">
                      {tiles.map(({ id, opt }) => (
                        <button
                          key={id}
                          className="aug-pick-tile"
                          onClick={() => {
                            sel.submit(opt);
                            closeModal();
                          }}
                        >
                          <TileImg tile={view.tiles[id]} size="mini" />
                        </button>
                      ))}
                    </span>
                  </div>
                ),
              )}
            </div>
            <button className="rinshan-pick-skip" onClick={closeModal}>
              닫기 (줍지 않고 진행)
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      {/* 왕패의 주인 — 손패↔왕패 쌍을 남은 횟수만큼 골라 두었다가 한 번에 확정한다 */}
      {pickModal === "dw_swap" ? createPortal(
        <div className="rinshan-pick-overlay">
          <div className="rinshan-pick-panel aug-pick-wide">
            <div className="rinshan-pick-title">
              🏯 {augNameFor("dw_swap")} — 남은 교환 {dwRemaining}회
            </div>
            <div className="rinshan-pick-sub">
              {dwPairs.length >= dwRemaining
                ? "고를 수 있는 만큼 다 골랐습니다. 아래 '이대로 교환'을 누르세요."
                : dwPending === undefined
                  ? "왕패로 보낼 내 손패를 고른 뒤, 가져올 왕패를 고르세요. 남은 횟수만큼 여러 쌍을 이어서 고를 수 있습니다."
                  : "이제 가져올 왕패를 한 장 고르세요. 고른 자리에는 내 패가 대신 들어갑니다 — 도라 표시패 자리를 집으면 도라가 바뀝니다."}
            </div>
            <div className="aug-pick-rows">
              <div className="aug-pick-row aug-pick-row-static">
                <span className="aug-pick-row-label">내 손패</span>
                <span className="aug-pick-row-tiles">
                  {dwHandIds.map((id) => {
                    const staged = dwStagedHand.has(id);
                    return (
                      <button
                        key={id}
                        className={`aug-pick-tile${dwPending === id ? " aug-pick-tile-on" : ""}${
                          staged ? " aug-pick-tile-staged" : ""
                        }`}
                        title={staged ? "교환 예약됨 — 누르면 취소" : undefined}
                        onClick={() => dwClickHand(id)}
                      >
                        <TileImg tile={view.tiles[id]} size="mini" />
                      </button>
                    );
                  })}
                </span>
              </div>
              <div className="aug-pick-row aug-pick-row-static">
                <span className="aug-pick-row-label">왕패</span>
                <span className="aug-pick-row-tiles">
                  {/* 깡으로 빠져나간 영상패 자리 — 빈 칸으로 남겨 원래 14칸 배열을 유지한다 */}
                  {Array.from({ length: rinshanSpentOf(view) }, (_v, i) => (
                    <span
                      key={`spent-${i}`}
                      className="aug-pick-tile aug-pick-tile-spent"
                      title="깡으로 사용된 영상패 자리 (보충되지 않습니다)"
                    />
                  ))}
                  {deadWallIds.map((tileId, idx) => {
                    const staged = dwStagedDead.has(idx);
                    const slot = deadWallSlotInfo(
                      idx,
                      view.round.doraIndicators.length,
                      deadWallSizeOf(view),
                    );
                    // 대기 중인 손패가 없고 예약도 아니면 누를 게 없다 (손패부터 고른다)
                    const disabled =
                      !staged &&
                      (dwPending === undefined ||
                        dwPairs.length >= dwRemaining ||
                        !dwHasOpt(dwPending, idx));
                    return (
                      <button
                        key={tileId}
                        className={`aug-pick-tile rinshan-slot-${slot.cls}${
                          staged ? " aug-pick-tile-staged" : ""
                        }`}
                        disabled={disabled}
                        title={staged ? `${slot.label} — 교환 예약됨, 누르면 취소` : slot.label}
                        onClick={() => dwClickDead(idx)}
                      >
                        <TileImg tile={view.tiles[tileId]} size="mini" />
                      </button>
                    );
                  })}
                </span>
              </div>
              {dwPairs.length > 0 ? (
                <div className="aug-pick-row aug-pick-row-static">
                  <span className="aug-pick-row-label">교환 예약</span>
                  <span className="aug-pick-row-tiles aug-pick-pairs">
                    {dwPairs.map((p) => (
                      <span key={p.handTileId} className="aug-pick-pair">
                        <TileImg tile={view.tiles[p.handTileId]} size="mini" />
                        <span className="aug-morph-arrow" aria-hidden="true">→</span>
                        <TileImg tile={view.tiles[deadWallIds[p.deadIndex] ?? -1]} size="mini" />
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="aug-modal-actions">
              <button
                className="rinshan-pick-tile aug-modal-confirm"
                disabled={dwPairs.length === 0}
                onClick={() => {
                  setDwQueue(dwPairs);
                  closeModal();
                }}
              >
                이대로 교환 ({dwPairs.length}장)
              </button>
              <button
                className="rinshan-pick-skip"
                onClick={() => {
                  if (dwPending !== undefined) {
                    setModalPick([]);
                    return;
                  }
                  if (dwPairs.length > 0) {
                    setDwPairs([]);
                    return;
                  }
                  closeModal();
                }}
              >
                {dwPending !== undefined
                  ? "← 손패 다시"
                  : dwPairs.length > 0
                    ? "← 예약 비우기"
                    : "닫기 (바꾸지 않고 진행)"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {open && usable ? (
        menuType !== null ? (
          // 2단계 — 고른 증강의 후보들. 이름은 머리글에 한 번만 쓰고 후보만 나열한다.
          // 이 층은 통째로 한 증강의 이야기라, 열려 있는 동안 그 pill을 계속 빛낸다.
          <div className="aug-menu" onMouseEnter={() => hintOne(menuType)} onMouseLeave={hintNone}>
            <div className="aug-menu-head">{augNameFor(menuType)}</div>
            {(byType.get(menuType) ?? []).map((o, i) => {
              const detail = optionDetail(view, o);
              return (
                <button
                  key={`${menuType}-${i}`}
                  className="aug-menu-item"
                  onClick={() => {
                    sel.submit(o);
                    setOpen(false);
                    setMenuType(null);
                    hintNone();
                  }}
                >
                  <strong className="aug-menu-name">
                    {detail !== "" ? detail : augNameFor(menuType)}
                  </strong>
                  <ActionTiles view={view} option={o} />
                </button>
              );
            })}
            {types.length > 1 ? (
              <button
                className="aug-menu-item aug-menu-back"
                onClick={() => setMenuType(null)}
                // 목록으로 돌아가는 줄에서는 그 증강 하나가 아니라 전부를 다시 비춘다
                onMouseEnter={hintAll}
                onMouseLeave={() => hintOne(menuType)}
              >
                <strong className="aug-menu-name">← 증강 다시 고르기</strong>
              </button>
            ) : null}
          </div>
        ) : (
          // 1단계 — 지금 쓸 수 있는 증강 목록. 후보가 여럿인 증강은 눌러서 파고든다.
          // 한 줄에 손을 올리면 **그 증강의 pill만** 빛난다 — 메뉴에 뜨는 것은 액션
          // 이름이라(예: 되돌리기 ↔ 미련) 이름만으로는 내 증강과 안 이어졌다.
          <div className="aug-menu" onMouseEnter={hintAll} onMouseLeave={hintNone}>
            <div className="aug-menu-head">사용할 증강 선택</div>
            {types.map((type) => {
              const opts = byType.get(type) ?? [];
              const hint = armType(type)
                ? armHint(type)
                : MODAL_PICK_TYPES.has(type)
                  ? "패를 보고 고르기"
                  : opts.length > 1
                    ? `${opts.length}가지 중 고르기`
                    : optionDetail(view, opts[0] as ActionOption);
              return (
                <button
                  key={type}
                  className="aug-menu-item"
                  onClick={() => activate(type)}
                  onMouseEnter={() => hintOne(type)}
                  // 줄에서 벗어나면 메뉴 전체(= 쓸 수 있는 전부)로 되돌린다.
                  // 메뉴 밖으로 나가는 경우는 위 컨테이너의 onMouseLeave가 끈다.
                  onMouseLeave={hintAll}
                  onFocus={() => hintOne(type)}
                  onBlur={hintAll}
                >
                  <strong className="aug-menu-name">{augNameFor(type)}</strong>
                  {hint !== "" ? <span className="act-target">{hint}</span> : null}
                  {!armType(type) && !MODAL_PICK_TYPES.has(type) && opts.length === 1 ? (
                    <ActionTiles view={view} option={opts[0] as ActionOption} />
                  ) : null}
                </button>
              );
            })}
          </div>
        )
      ) : null}
      <button
        /* 증강 리치로 무장한 것은 액션 바의 몫이라 여기선 켜진 것처럼 보이지 않게 한다 */
        className={`aug-btn${usable ? " aug-btn-on" : ""}${
          sel.armedType !== null && !DRAG_DISCARD_ARM_TYPES.has(sel.armedType)
            ? " aug-btn-armed"
            : ""
        }`}
        disabled={!usable}
        title={
          usable
            ? types.length > 1
              ? "액티브 증강 선택"
              : `${augNameFor(types[0]!)} 사용`
            : `지금은 사용할 수 없습니다\n${activeIds.map(blockedNote).join("\n")}`
        }
        onClick={click}
        /* 손을 올리면 그 개수가 **어느 증강인지** 이름표 pill이 빛나 알려 준다.
           터치에는 hover가 없어 포커스(탭)로도 같은 신호를 준다.
           메뉴가 열려 있으면 메뉴 쪽 핸들러가 이어받는다(한 줄에 올리면 그 하나만). */
        onMouseEnter={hintAll}
        onMouseLeave={hintNone}
        onFocus={hintAll}
        onBlur={hintNone}
      >
        ✦ 액티브 증강{usable ? ` (${displayCount})` : ""}
      </button>
      {/*
        예지 — 공개된 패산 앞장을 **액티브 증강 버튼 옆에 상시로** 늘어놓는다.
        예전에는 재배열 후보가 있을 때만 뜨는 모달이 유일한 표시 수단이라,
        재배열을 이미 쓴 국에 다시 발동하면(열람만 가능) 이펙트만 나오고
        정작 본 패는 어디에도 안 보였다 — 정보 증강이 정보를 안 주는 셈이었다.
        이제 공개 채널이 살아 있는 동안 계속 보인다.

        조작(재배열)은 여기서 하지 않는다 — 미니 패 넉 장이 손가락보다 작고 판 구석에
        붙어 있어 무엇을 어디로 끄는지 보이지 않았다(2026-08-12 사용자 보고).
        분열·염색처럼 아래 전용 탭에서 크게 고른다. 여기는 "지금 무엇이 오는가"만 읽는 자리다.
      */}
      {foresightPeek.length > 0 ? (
        <div className="foresight-strip">
          <span className="foresight-strip-tag">🔮 예지</span>
          {/*
            **뒤에서 앞으로** 그린다 — 마지막(내 쯔모)이 왼쪽 끝, 가장 먼저 뽑히는 패가
            오른쪽 끝이다. 공개된 패는 뽑히는 대로 **앞에서** 사라지므로, 순서대로
            그리면 줄이 줄어들 때마다 남은 패가 통째로 왼쪽으로 밀렸다 — 방금 보던
            "내 패"가 매 순 자리를 옮겼다(2026-08-12 사용자 지적). 뒤집어 그리면
            사라지는 쪽이 오른쪽 끝이라 내 패는 늘 같은 자리에 서 있는다.
          */}
          <div className="foresight-strip-tiles">
            {foresightOrder
              .map((origIdx, pos) => ({ origIdx, pos }))
              .reverse()
              .map(({ origIdx, pos }) => {
                const kind = foresightPeek[origIdx];
                const seatLabel = foresightSeatLabels[pos] ?? "";
                const isMine = seatLabel === "나";
                return (
                  <div
                    key={pos}
                    className={`foresight-cell${isMine ? " foresight-mine" : ""}`}
                    title={`${pos + 1}번째 쯔모 — ${seatLabel}`}
                  >
                    {kind !== undefined ? <TileImg tile={{ kind }} size="mini" /> : null}
                    <span className="foresight-cell-label">
                      {seatLabel}
                      {isMine ? " ★" : ""}
                    </span>
                  </div>
                );
              })}
          </div>
          {foresightReorderable && !foresightTab ? (
            <button className="foresight-strip-confirm" onClick={() => setForesightTab(true)}>
              순서 바꾸기 (국에 1회)
            </button>
          ) : null}
        </div>
      ) : null}
      {/*
        예지 재배열 탭 — 분열·염색의 선택 탭(`rinshan-pick-*`)과 같은 자리·같은 뼈대다.
        ⚠ 포털은 필수다: 이 컨트롤의 조상 중에 transform을 가진 것이 있으면
        `position: fixed`의 기준이 화면이 아니라 그 상자가 된다(2026-08-06 분열 사례).
        `data-arm-zone`도 함께 — 무장 중 판 바깥 pointerdown이 무장을 풀어 탭이 클릭
        전에 사라지는 것을 막는다.
      */}
      {foresightTab && foresightReorderable
        ? createPortal(
            <div className="rinshan-pick-overlay" data-arm-zone="1">
              <div className="rinshan-pick-panel foresight-tab">
                <div className="rinshan-pick-title">🔮 예지 — 다음 한 바퀴를 어떻게 놓을까요?</div>
                <div className="rinshan-pick-sub">
                  왼쪽부터 차례로 뽑혀 갑니다. 옮길 패를 끌어다 놓거나, 옮길 패와 놓을 자리를
                  차례로 누르세요. <b>재배열은 이 국에 한 번뿐</b>입니다 — 그대로 두고 닫아도
                  열람은 이미 끝났습니다.
                </div>
                <div className="foresight-tab-row">
                  {foresightOrder.map((origIdx, pos) => {
                    const kind = foresightPeek[origIdx];
                    const seatLabel = foresightSeatLabels[pos] ?? "";
                    const isMine = seatLabel === "나";
                    const picked = foresightDragFrom === pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        className={`foresight-tab-cell${isMine ? " foresight-mine" : ""}${
                          picked ? " foresight-dragging" : ""
                        }`}
                        title={`${seatLabel}의 다음 쯔모 — 끌거나, 두 자리를 차례로 눌러 순서 변경`}
                        /*
                         * 드래그(마우스)와 두 번 누르기(터치·키보드)를 함께 연다.
                         * 모바일 브라우저는 터치에서 dragstart를 아예 내지 않아,
                         * 드래그만 두면 폰에서는 순서를 바꿀 길이 없다.
                         */
                        draggable
                        onDragStart={() => setForesightDragFrom(pos)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const from = foresightDragFrom;
                          if (from === null) return;
                          moveForesight(from, pos);
                        }}
                        onDragEnd={() => setForesightDragFrom(null)}
                        onClick={() => {
                          // 첫 번째 누름 = 집기, 두 번째 = 놓기. 같은 자리면 집기 취소.
                          if (foresightDragFrom === null) setForesightDragFrom(pos);
                          else moveForesight(foresightDragFrom, pos);
                        }}
                      >
                        <span className="foresight-tab-ord">{pos + 1}번째</span>
                        {kind !== undefined ? <TileImg tile={{ kind }} size="hand" /> : null}
                        <span className="foresight-tab-label">
                          {seatLabel}
                          {isMine ? " ★ 내 쯔모" : " 쯔모"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="foresight-tab-hint">
                  {foresightDragFrom !== null
                    ? "놓을 자리를 누르세요 (같은 자리를 다시 누르면 취소)"
                    : foresightMoved
                      ? "이 순서로 확정하면 패산이 그대로 다시 놓입니다."
                      : "아직 손대지 않았습니다 — 옮길 패를 먼저 고르세요."}
                </div>
                <div className="foresight-tab-actions">
                  <button
                    className="foresight-tab-confirm"
                    disabled={!foresightMoved}
                    onClick={() => {
                      confirmForesight(foresightOrder);
                      setForesightTab(false);
                    }}
                  >
                    이 순서로 확정
                  </button>
                  <button
                    className="rinshan-pick-skip"
                    onClick={() => {
                      setForesightDragFrom(null);
                      setForesightArr([0, 1, 2, 3]);
                      setForesightTab(false);
                    }}
                  >
                    그대로 두기 (닫기)
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ─────────────────────────── 액션 바 ───────────────────────────

function ActionBar(props: {
  view: PlayerView;
  prompt: NonNullable<PromptMessage["prompt"]>;
  riichiMode: boolean;
  catalog: Record<string, AugmentCatalogEntry>;
  onRiichiMode: (v: boolean) => void;
  onSubmit: (o: ActionOption) => void;
}): JSX.Element | null {
  const { view, prompt } = props;
  const sel = useContext(SelectionContext);
  const hasRiichi = prompt.options.some((o) => o.type === "riichi");
  const isMyTurn = view.round.phase === "turn.act";
  /*
   * 증강 리치(오픈 리치·스텔스 리치·올인 리치·영혼의 일격)를 **[리치] 바로 옆**에 띄운다.
   *
   * 여태 이것들은 "✦ 액티브 증강" 버튼 → 메뉴 → 선택 안에만 있었다. 리치를 걸 수 있는
   * 순간에 눈이 가는 곳은 액션 바인데 거기엔 평범한 [리치]밖에 없어서, 증강을 들고도
   * 모른 채 그냥 리치를 걸어 버렸다(2026-08-08 사용자 보고). 액티브 증강 메뉴에서도
   * 그대로 고를 수 있다 — 여기 나오는 건 같은 액션으로 가는 지름길이다.
   */
  const riichiAugTypes = [
    ...new Set(
      prompt.options.filter((o) => DRAG_DISCARD_ARM_TYPES.has(o.type)).map((o) => o.type),
    ),
  ];
  const armedRiichiAug =
    sel.armedType !== null && DRAG_DISCARD_ARM_TYPES.has(sel.armedType) ? sel.armedType : null;
  // 타일 클릭으로 처리되는 액션과 액티브 증강(전용 버튼)은 액션 바에서 제외
  const buttons = prompt.options.filter(
    (o) =>
      o.type !== "discard" &&
      o.type !== "riichi" &&
      o.type !== "free_discard" &&
      !AUGMENT_ACTION_TYPES.has(o.type),
  );
  const locked = prompt.locked ?? [];
  /** 고를 것이 패스뿐이라 잠시 뒤 스스로 넘어가는 통보인가 (버튼이 시간을 그린다) */
  const autoPassing = isLockNoticeOnly(prompt);
  if (
    buttons.length === 0 &&
    locked.length === 0 &&
    !hasRiichi &&
    riichiAugTypes.length === 0
  ) {
    return null;
  }

  /** 증강 리치 무장 — 이미 그 증강으로 무장 중이면 해제(토글). 리치 모드는 함께 푼다. */
  const armRiichiAug = (type: string): void => {
    props.onRiichiMode(false);
    sel.arm(sel.armedType === type ? null : type);
  };

  /*
   * 단축키 — 여태 게임을 키보드로 두는 길이 아예 없었다(포커스 표시조차 없었다).
   *
   * 배치: 숫자 1..9 가 **지금 보이는 버튼 순서 그대로** 대응한다. 론·쯔모·패스처럼
   * 매번 나오는 것에는 글자도 따로 준다(R / P). 왜 고정 배치를 안 쓰나 — 후로 선택지는
   * 같은 종류가 여러 벌 뜬다(치 3가지 등). 순서 대응이면 화면에 보이는 것과 손이 어긋나지 않는다.
   *
   * 숫자는 버튼에 **찍지 않는다** (2026-08-07 사용자 지시) — 마우스로 두는 사람에게는
   * 판이 아니라 키보드 이야기를 하는 칩이 매 순간 붙어 있는 셈이라 버튼이 시끄러웠다.
   * 대신 title(툴팁)이 그대로 알려 준다.
   */
  const keyed: { key: string; run: () => void }[] = [];
  if (props.riichiMode) {
    keyed.push({ key: "1", run: () => props.onRiichiMode(false) });
    // 리치 모드에서도 증강 리치로 갈아탈 수 있게 — 취소하고 다시 찾을 필요가 없다.
    for (const t of riichiAugTypes) {
      keyed.push({ key: String(keyed.length + 1), run: () => armRiichiAug(t) });
    }
  } else {
    if (hasRiichi) keyed.push({ key: "1", run: () => props.onRiichiMode(true) });
    for (const t of riichiAugTypes) {
      keyed.push({ key: String(keyed.length + 1), run: () => armRiichiAug(t) });
    }
    for (const o of buttons) keyed.push({ key: String(keyed.length + 1), run: () => props.onSubmit(o) });
  }
  const hotIndex = (i: number): string =>
    String((hasRiichi ? 1 : 0) + riichiAugTypes.length + i + 1);

  return (
    <div className="action-bar">
      <ActionHotkeys keyed={keyed} buttons={buttons} riichiMode={props.riichiMode} />
      {props.riichiMode ? (
        <>
          <span className="action-hint">리치할 패를 바닥으로 끌어 놓거나 클릭하세요</span>
          <button className="act act-cancel" onClick={() => props.onRiichiMode(false)} title="취소 — 단축키 1">
            취소
          </button>
          {/* 그냥 리치를 걸려던 손을 여기서 한 번 더 붙잡는다 — 증강 리치가 있다는 걸
              가장 늦게 알려 줄 수 있는 자리다. */}
          {riichiAugTypes.map((t, i) => (
            <button
              key={t}
              className="act act-riichi-aug"
              onClick={() => armRiichiAug(t)}
              title={`${augActionName(props.catalog, t)}(으)로 바꿔 걸기 — 단축키 ${i + 2}`}
            >
              ⚡ {augActionName(props.catalog, t)}
            </button>
          ))}
        </>
      ) : (
        <>
          {hasRiichi ? (
            <button
              className="act act-riichi"
              onClick={() => {
                sel.arm(null); // 증강 리치로 무장 중이었다면 풀고 평범한 리치로
                props.onRiichiMode(true);
              }}
              title="리치 — 단축키 1"
            >
              리치
            </button>
          ) : null}
          {riichiAugTypes.map((t, i) => (
            <button
              key={t}
              className={`act act-riichi-aug${armedRiichiAug === t ? " act-riichi-aug-on" : ""}`}
              onClick={() => armRiichiAug(t)}
              title={`${augActionName(props.catalog, t)} — 버릴 패를 바닥으로 끌어 놓거나 클릭 (단축키 ${(hasRiichi ? 1 : 0) + i + 1})`}
            >
              ⚡ {augActionName(props.catalog, t)}
            </button>
          ))}
          {/* 잠긴 선언 — 증강이 막은 론/쯔모. 누를 수 없지만 **자리를 지킨다**:
              여기서 사라지면 당한 사람은 왜 화료가 안 되는지 알 길이 없다.
              고를 것이 패스뿐이면 스스로 넘어가므로, 남은 시간을 버튼이 직접 보여 준다. */}
          {locked.map((l) => {
            const label = l.type === "win" ? (isMyTurn ? "쯔모" : "론") : l.type;
            return (
              <button
                key={`locked-${l.type}-${l.reason}`}
                className={`act act-win act-locked${autoPassing ? " act-locked-timed" : ""}`}
                type="button"
                disabled
                aria-disabled="true"
                title={
                  autoPassing
                    ? `${lockedReasonText(l)} — 잠시 뒤 자동으로 넘어갑니다`
                    : lockedReasonText(l)
                }
              >
                🔒 {label}
                <span className="act-target">{lockedReasonShort(l)}</span>
              </button>
            );
          })}
          {buttons.map((o, i) => {
            const label =
              o.type === "win" ? (isMyTurn ? "쯔모" : "론") : actionLabel(o.type, props.catalog);
            const tone =
              o.type === "win"
                ? "act-win"
                : o.type === "pass"
                  ? "act-pass"
                  : ACTION_LABEL[o.type] === undefined || AUGMENT_ACTION_TYPES.has(o.type)
                    ? "act-aug"
                    : "act-call";
            const detail = optionDetail(view, o);
            return (
              <button
                key={`${o.type}-${i}`}
                className={`act ${tone}`}
                onClick={() => props.onSubmit(o)}
                title={
                  o.type === "win"
                    ? `${label} — 단축키 ${hotIndex(i)} 또는 R`
                    : o.type === "pass"
                      ? `${label} — 단축키 ${hotIndex(i)} 또는 P`
                      : `${label} — 단축키 ${hotIndex(i)}`
                }
              >
                {label}
                {detail !== "" ? <span className="act-target">{detail}</span> : null}
                <ActionTiles view={view} option={o} />
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

/**
 * 액션 바 단축키 리스너 — 그리는 것은 없고 window keydown만 건다.
 *
 * 별도 컴포넌트인 이유: ActionBar는 프롬프트가 없을 때 일찍 return null 하는 자리가 있어
 * (훅 규칙상) 그 위에서 useEffect를 걸 수 없다. 여기로 내리면 조건부 마운트가 곧 조건부 등록이다.
 *
 * ⚠ Esc·Space는 잡지 않는다 — 연출 건너뛰기가 이미 쓰고 있고, 그 둘이 겹치면
 * 컷인을 넘기려던 손이 그대로 패스를 눌러 버린다.
 */
function ActionHotkeys({
  keyed,
  buttons,
  riichiMode,
}: {
  keyed: { key: string; run: () => void }[];
  buttons: ActionOption[];
  riichiMode: boolean;
}): null {
  // 최신 핸들러를 ref로 들고 있으면 리스너를 매 렌더 다시 걸 필요가 없다.
  const ref = useRef({ keyed, buttons, riichiMode });
  ref.current = { keyed, buttons, riichiMode };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      const cur = ref.current;
      const hit = cur.keyed.find((k) => k.key === e.key);
      if (hit !== undefined) {
        e.preventDefault();
        hit.run();
        return;
      }
      if (cur.riichiMode) return;
      // 매번 나오는 두 가지에는 글자 단축키도 준다 (론/쯔모, 패스).
      const letter = e.key.toLowerCase();
      const want = letter === "r" ? "win" : letter === "p" ? "pass" : null;
      if (want === null) return;
      const idx = cur.buttons.findIndex((o) => o.type === want);
      if (idx < 0) return;
      e.preventDefault();
      cur.keyed[idx + (cur.keyed.length - cur.buttons.length)]?.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

function ActionTiles({ view, option }: { view: PlayerView; option: ActionOption }): JSX.Element | null {
  const p = (option.payload ?? {}) as Record<string, unknown>;
  // 무늬 변환(염색 등): '바꾸기 전'이 아니라 '바꾼 뒤'가 헷갈리지 않게 전→후로 보여준다
  if (typeof p.suit === "string" && typeof p.tileId === "number") {
    const src = view.tiles[p.tileId]?.kind;
    if (src !== undefined) {
      return (
        <span className="act-tiles">
          <TileImg tile={view.tiles[p.tileId]} size="mini" />
          <span className="act-tiles-arrow" aria-hidden="true">→</span>
          <TileImg
            tile={{ kind: { suit: p.suit as TileKind["suit"], rank: src.rank }, attrs: { conjured: true } }}
            size="mini"
          />
        </span>
      );
    }
  }
  // 숫자 증감(연금술 등): 바뀐 뒤 숫자(±1)를 '전→후'로 보여준다 (같은 무늬, rank±1)
  if (typeof p.delta === "number" && typeof p.tileId === "number") {
    const src = view.tiles[p.tileId]?.kind;
    if (src !== undefined && typeof src.rank === "number") {
      return (
        <span className="act-tiles">
          <TileImg tile={view.tiles[p.tileId]} size="mini" />
          <span className="act-tiles-arrow" aria-hidden="true">→</span>
          <TileImg
            tile={{ kind: { suit: src.suit, rank: src.rank + p.delta }, attrs: { conjured: true } }}
            size="mini"
          />
        </span>
      );
    }
  }
  // 배열 타일 id (안깡·강탈 등)
  const ids: number[] = Array.isArray(p.tileIds) ? (p.tileIds as number[]).slice() : [];
  // 단일 타일 id (회수·염색·도라 옹립·날치기 등)
  for (const key of ["tileId", "recallTileId", "snatchId"]) {
    if (typeof p[key] === "number") ids.push(p[key] as number);
  }
  // 영상패 슬롯 (절벽 위 꽃 bloom_pick: index → 왕패 앞 4장) — 공개돼 있으면 그 패를 보여준다
  if (typeof p.index === "number") {
    const dwId = view.zones["deadWall"]?.tileIds[p.index];
    if (dwId !== undefined) ids.push(dwId);
  }
  // 무늬만 지정 (단색 세계: 통일할 색) — 그 무늬의 5를 대표로 보여준다
  if (typeof p.suit === "string" && p.tileId === undefined) {
    return (
      <span className="act-tiles">
        <TileImg
          tile={{ kind: { suit: p.suit as TileKind["suit"], rank: 5 }, attrs: { conjured: true } }}
          size="mini"
        />
      </span>
    );
  }
  // 종류 지정 (지뢰 매설: kindKey)
  const kindTiles: TileKind[] = [];
  if (typeof p.kind === "string") {
    const k = parseKindKey(p.kind);
    if (k !== null) kindTiles.push(k);
  }
  if (ids.length === 0 && kindTiles.length === 0) return null;
  return (
    <span className="act-tiles">
      {ids.slice(0, 4).map((id) => (
        <TileImg key={id} tile={view.tiles[id]} size="mini" />
      ))}
      {kindTiles.map((kind, i) => (
        <TileImg key={`k${i}`} tile={{ kind }} size="mini" />
      ))}
    </span>
  );
}

/**
 * 패 변형형 액션(염색 `{tileId,suit}`·연금술 `{tileId,delta}`)의 '바꾼 뒤' 패를 만든다.
 * 전용 선택 모달이 전→후를 큰 패로 보여줄 때 쓴다. 변형형이 아니면 null.
 */
function morphedTile(
  view: PlayerView,
  option: ActionOption,
): { kind: TileKind; attrs: { conjured: true } } | null {
  const p = (option.payload ?? {}) as Record<string, unknown>;
  if (typeof p.tileId !== "number") return null;
  const src = view.tiles[p.tileId]?.kind;
  if (src === undefined) return null;
  if (typeof p.suit === "string") {
    return { kind: { suit: p.suit as TileKind["suit"], rank: src.rank }, attrs: { conjured: true } };
  }
  if (typeof p.delta === "number" && typeof src.rank === "number") {
    return { kind: { suit: src.suit, rank: src.rank + p.delta }, attrs: { conjured: true } };
  }
  // 종류를 통째로 지정하는 변형 (선언 간파 위조 — payload.kind는 kindKey 문자열)
  if (typeof p.kind === "string") {
    const k = parseKindKey(p.kind);
    if (k !== null) return { kind: k, attrs: { conjured: true } };
  }
  return null;
}

/**
 * 분열(`split_tile`)의 결과 **두 장**을 미리 계산한다 — 한 장이 a·b(합 = 원래 숫자)로
 * 갈라지고 무늬는 그대로다. 결과가 둘이라 한 장짜리 morphedTile로는 표현할 수 없어
 * 전용 경로를 둔다. 분열이 아니면 null.
 */
function splitPreview(
  view: PlayerView,
  option: ActionOption,
): [{ kind: TileKind; attrs: { conjured: true } }, { kind: TileKind; attrs: { conjured: true } }] | null {
  if (option.type !== "split_tile") return null;
  const p = (option.payload ?? {}) as Record<string, unknown>;
  if (typeof p.tileId !== "number" || typeof p.a !== "number") return null;
  const src = view.tiles[p.tileId]?.kind;
  if (src === undefined) return null;
  const b = src.rank - p.a;
  if (p.a < 1 || b < 1) return null;
  return [
    { kind: { suit: src.suit, rank: p.a }, attrs: { conjured: true } },
    { kind: { suit: src.suit, rank: b }, attrs: { conjured: true } },
  ];
}

/**
 * 단색 세계처럼 "손패 전체가 한 무늬로 물드는" 액션의 결과를 미리 계산한다.
 * 자패(wind·dragon)는 그대로 두고 수패만 목표 무늬로 옮긴다 — suit_unify와 같은 규칙.
 */
function unifyPreview(
  view: PlayerView,
  handIds: readonly number[],
  suit: TileKind["suit"],
): { id: number; tile: { kind: TileKind; attrs: { conjured?: true } } }[] {
  const out: { id: number; tile: { kind: TileKind; attrs: { conjured?: true } } }[] = [];
  for (const id of handIds) {
    const t = view.tiles[id];
    if (t === undefined) continue;
    const numbered = t.kind.suit === "man" || t.kind.suit === "pin" || t.kind.suit === "sou";
    out.push(
      numbered && t.kind.suit !== suit
        ? { id, tile: { kind: { suit, rank: t.kind.rank }, attrs: { conjured: true } } }
        : { id, tile: { kind: t.kind, attrs: {} } },
    );
  }
  // 물든 **결과 기준**으로 정렬한다 — 원본 순서 그대로 두면 색만 바뀐 채 뒤섞여 보여
  // "내 손패가 이렇게 된다"는 미리보기 구실을 못한다.
  out.sort((a, b) => {
    const oa = (SUIT_ORDER[a.tile.kind.suit] ?? 9) * 100 + a.tile.kind.rank;
    const ob = (SUIT_ORDER[b.tile.kind.suit] ?? 9) * 100 + b.tile.kind.rank;
    return oa !== ob ? oa - ob : a.id - b.id;
  });
  return out;
}

/**
 * 액션 옵션의 payload에서 사람이 읽을 상세 라벨을 뽑는다 —
 * 대상 플레이어 이름 / 지정 역 / 무늬 변환 / 증감 / 영상패 슬롯 등.
 * (버튼이 "single_path_declare → p1"처럼 변수로만 뜨던 것을 사람 말로 바꾼다.)
 */
function optionDetail(view: PlayerView, option: ActionOption): string {
  const p = (option.payload ?? {}) as Record<string, unknown>;
  const who = p.target ?? p.fromPlayer ?? p.host;
  // 무장해제처럼 "누구의 어떤 증강"까지 골라야 하는 액션은 둘 다 적는다 —
  // 이름만 적으면 상대의 증강 수만큼 똑같은 버튼이 늘어서 무엇을 잠그는지 알 수 없다.
  if (typeof who === "string" && typeof p.augmentId === "string") {
    return `${playerNameById(view, who)} — ${augmentDisplayName(p.augmentId)}`;
  }
  if (typeof who === "string") return playerNameById(view, who);
  // 증강만 고르는 액션(재장전 = 소진된 내 증강 하나 복구). 위 분기는 who까지
  // 요구해서 여기 걸리지 못했고, 후보가 전부 라벨 없는 같은 버튼으로 떴다 —
  // 재장전은 반장전에 두 번뿐인데 무엇을 되살리는지 모른 채 찍어야 했다
  // (2026-08-08 QA §2-9).
  if (typeof p.augmentId === "string") return augmentDisplayName(p.augmentId);
  if (typeof p.yaku === "string") return YAKU_NAMES[p.yaku] ?? p.yaku;
  // 분열 — 한 패에 후보가 여럿(9 → 1+8·2+7·3+6·4+5)이라 어느 분할인지 라벨로도 적는다
  if (option.type === "split_tile" && typeof p.a === "number" && typeof p.tileId === "number") {
    const src = view.tiles[p.tileId]?.kind;
    if (src !== undefined) return `${p.a} + ${src.rank - p.a}`;
  }
  // 잔상 — 되살릴 도라를 버튼에 적는다. 무엇이 되살아나는지 모른 채 누르면 안 되는 액션이다.
  if (option.type === "dora_recall") {
    const raw = view.augmentView[`dora_afterimage:prev:${view.playerId}`];
    const kinds = (Array.isArray(raw) ? raw : [])
      .filter((k): k is string => typeof k === "string")
      .map(parseKindKey)
      .filter((k): k is TileKind => k !== null);
    if (kinds.length > 0) return kinds.map((kind) => formatTile({ kind })).join("·");
  }
  const suitKo: Record<string, string> = { man: "만수", pin: "통수", sou: "삭수" };
  if (typeof p.suit === "string") return suitKo[p.suit] ?? p.suit;
  if (typeof p.delta === "number") return p.delta > 0 ? "+1" : "-1";
  if (typeof p.index === "number") return `영상패 ${p.index + 1}`;
  if (typeof p.kanKind === "string") {
    return { kan_closed: "안깡", kan_added: "가깡", kan_open: "대명깡" }[p.kanKind] ?? "";
  }
  return "";
}

// ─────────────────────────── 국 결과 화면 ───────────────────────────

/**
 * 화료 점수 카운트업 — 슬롯머신 롤업. 길이는 log(점수) 스케일(큰 손일수록 길게),
 * 진행에 비례해 틱 피치가 올라가고 끝에서 종지음 + 팝.
 */
function CountUpPoints({ value, mute = false }: { value: number; mute?: boolean }): JSX.Element {
  const [display, setDisplay] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = false;
    const dur = Math.min(2000, 300 + Math.log10(Math.max(10, value)) * 320);
    const startDelay = 400; // 역 스탬프가 먼저 찍히기 시작한 뒤 굴러간다
    let raf = 0;
    let lastTick = 0;
    const t0 = performance.now() + startDelay;
    const step = (now: number): void => {
      if (now < t0) {
        raf = requestAnimationFrame(step);
        return;
      }
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - p) ** 3;
      setDisplay(Math.round(value * eased));
      if (p >= 1) {
        if (!doneRef.current) {
          doneRef.current = true;
          if (!mute) sfx.countDone();
        }
        return;
      }
      if (!mute && now - lastTick > 90) {
        lastTick = now;
        sfx.countTick(p);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, mute]);
  const done = display === value;
  return (
    <span className={`result-points${done ? " result-points-done" : ""}`}>
      {display.toLocaleString()}점
    </span>
  );
}

/**
 * 유국 뒤 **다음 국으로 넘어가는 것** — 미련(이월되는 텐파이 손) · 귀환(부활할 자패).
 *
 * 둘 다 "이번 국이 끝나면 어떻게 되는가"라는 정보라 국 결과창이 제자리다.
 * 예전엔 국이 도는 내내 왼쪽 위 목록에 줄로 떠 있었는데, 정작 그게 쓸모 있는
 * 순간(유국 정산 화면)에는 결과창에 가려 보이지 않았다.
 *
 * 두 채널 모두 kindKey 문자열이 아니라 TileKind 객체 배열을 싣는다.
 */
function carryOverOf(
  view: PlayerView,
  playerId: string,
): { label: string; note: string; kinds: TileKind[] }[] {
  const out: { label: string; note: string; kinds: TileKind[] }[] = [];
  const kindsOf = (raw: unknown): TileKind[] =>
    (Array.isArray(raw) ? raw : []).filter(
      (k): k is TileKind =>
        k !== null && typeof k === "object" && typeof (k as TileKind).suit === "string",
    );
  const regret = kindsOf(view.augmentView[`regret:${playerId}`]);
  if (regret.length > 0) {
    out.push({ label: "미련", note: "다음 국으로 이 손을 그대로 가져간다", kinds: regret });
  }
  const back = kindsOf(view.augmentView[`honor_return:${playerId}`]);
  if (back.length > 0) {
    out.push({ label: "귀환", note: "다음 국 배패에 이 자패가 되살아난다", kinds: back });
  }
  return out;
}

/**
 * 유국 정산 화면에서 그 사람의 **오름패(대기)**.
 *
 * 유국은 "텐파이였다"까지만 알려 주고 끝났다 — 무엇을 기다리고 있었는지는 공개된
 * 손패를 보고 각자 눈으로 세라는 뜻이었다. 정작 그게 이 화면의 핵심 정보다
 * (왜 저 사람이 안 접었는지, 내 버림패가 통과한 게 운이었는지가 여기서 갈린다).
 *
 * 우선순위는 판 위의 오름패 표시(OpponentHand)와 같다 — 공개/고정된 대기가 있으면
 * 물리 손패로 다시 계산하지 않는다. 자유 선언은 손패와 대기가 어긋나 있고, 오픈
 * 리치는 서버가 이미 확정해 공개한 값이다.
 */
function drawWaitsOf(
  view: PlayerView,
  player: PlayerInfo,
  revealedHand: readonly PublicTileView[],
): TileKind[] {
  const open = openRiichiWaits(view, player.id);
  if (open.length > 0) return open;
  const frozen = freeDeclareWaits(view, player.id);
  if (frozen.length > 0) return frozen;
  const kinds = revealedHand.map((t) => t.kind);
  if (kinds.length % 3 !== 1) return [];
  const meldCount = view.round.byPlayer[player.id]?.meldCount ?? 0;
  try {
    return winningKinds(kinds, meldCount, undefined, waitDecompOptions(player, view, kinds));
  } catch {
    return [];
  }
}

/** 이 사람에게 증강이 얹은(또는 뺀) 점수 합 — 결과창의 최종 획득점 계산용 */
function augPointsOf(
  settle: RoundOverMessage["settle"],
  player: string,
): number {
  return (settle.augPoints ?? [])
    .filter((a) => a.player === player)
    .reduce((sum, a) => sum + a.points, 0);
}

/**
 * 증감표 한 줄 아래에 붙는 **증강 내역** — 이 사람의 ±가 왜 그 숫자인지.
 *
 * 예전에는 augPoints를 쓰는 코드가 두 곳뿐이었고 둘 다 `w.winner`로 걸렀다. 그래서
 * ① 유국 정산의 노트는 렌더 경로가 아예 없었고 ② 지불자·패자 쪽 노트(역만 방어술 환급·
 * 죽기살기·반전·일확천금 환급·핏빛 계약…)는 계산되어 전송된 뒤 그대로 버려졌다.
 * 화료패를 버리지도 않은 사람이 큰 마이너스를 무는 장면에 설명이 한 줄도 없었던 이유다.
 *
 * 화료자 몫은 위 승자 블록이 이미 적으므로 여기서 건너뛴다(같은 말을 두 번 하지 않는다).
 * `points === 0`인 노트도 싣는다 — 마왕의 진군처럼 **총액이 0이어도 재배선 자체가
 * 설명**인 경우가 있다.
 */
function AugDeltaNotes({
  settle,
  player,
  skipWinners,
}: {
  settle: RoundOverMessage["settle"];
  player: string;
  skipWinners?: ReadonlySet<string>;
}): JSX.Element | null {
  if (skipWinners?.has(player) === true) return null;
  const notes = (settle.augPoints ?? []).filter((a) => a.player === player);
  if (notes.length === 0) return null;
  return (
    <span className="result-delta-augs">
      {notes.map((a) => (
        <span key={`${a.augId}:${a.player}`} className="result-delta-aug">
          {augmentDisplayName(a.augId)}
          {a.points !== 0 ? ` ${a.points > 0 ? "+" : ""}${a.points.toLocaleString()}` : ""}
        </span>
      ))}
    </span>
  );
}

/**
 * 화료한 손 — 채점이 채택한 **몸통대로 끊어서** 보여 준다.
 *
 * 예전에는 손패를 그냥 정렬해서 늘어놓았다. 표준 손이면 그것으로 읽히지만, 손 모양
 * 규칙을 바꾸는 증강(동수의 결속·비대칭·부숴진 벽·양극·조커)으로 난 손은 정렬만 하면
 * **왜 이게 화료인지 화면에 아무 근거도 안 남는다** — 2만2삭·5만5통·6만6삭·8만8통이
 * 2만5만6만8만2삭6삭5통8통으로 늘어서서, 텐파이도 아닌 손이 난 것처럼 보였다
 * (2026-08-18 사용자 보고).
 *
 * 이름표(슌쯔·커쯔·머리)는 **표준으로 설명이 안 되는 몸통이 하나라도 있을 때만** 붙인다.
 * 평범한 손에까지 붙이면 결과 화면이 설명서가 된다.
 *
 * shape가 없거나(옛 리플레이) 공개된 손패로 복원이 안 되면(자유 선언의 리치 스냅샷)
 * 종전대로 정렬만 해서 보여 준다.
 */
function WinHand({
  hand,
  melds,
  shape,
  winningTileId,
}: {
  hand: PublicTileView[];
  melds: RevealedHand["melds"];
  shape: WinInfo["shape"];
  winningTileId: number;
}): JSX.Element {
  const groups = shape === undefined ? null : groupWinHand(shape, hand);
  const meldRow = melds.map((m, i) => (
    <span key={`m${i}`} className="result-meld">
      {m.tiles.map((t) => (
        <TileImg key={t.id} tile={t} size="result" />
      ))}
    </span>
  ));

  if (groups === null || shape === undefined) {
    return (
      <div className="result-hand">
        {sortTileViews(hand).map((t, ti) => (
          <span
            key={t.id}
            className={`result-tile${t.id === winningTileId ? " result-tile-win" : ""}`}
            style={{ animationDelay: `${ti * 0.035}s` }}
          >
            <TileImg tile={t} size="result" />
          </span>
        ))}
        {meldRow}
      </div>
    );
  }

  const labeled = groups.some((g) => g.unusual);
  let seq = 0;
  return (
    <div className={`result-hand result-hand-shaped${labeled ? " result-hand-labeled" : ""}`}>
      {groups.map((g, gi) => {
        const label = shapeGroupLabel(g.type, shape.form);
        return (
          <span
            key={`g${gi}`}
            className={`result-group${g.unusual ? " result-group-odd" : ""}`}
          >
            <span className="result-group-tiles">
              {g.slots.map((s) => {
                const delay = seq++;
                return (
                  <span
                    key={s.tile.id}
                    className={`result-tile${s.tile.id === winningTileId ? " result-tile-win" : ""}${
                      s.as !== undefined ? " result-tile-wild" : ""
                    }`}
                    style={{ animationDelay: `${delay * 0.035}s` }}
                    // 조커가 무엇이 됐는지는 그림으로는 알 수 없다 — 패 아래 작게 적는다
                    title={s.as !== undefined ? `조커 → ${formatTile({ kind: s.as })}` : undefined}
                  >
                    <TileImg tile={s.tile} size="result" />
                    {s.as !== undefined ? (
                      <i className="result-tile-as">{formatTile({ kind: s.as })}</i>
                    ) : null}
                  </span>
                );
              })}
            </span>
            {labeled && label !== "" ? (
              <i className="result-group-label">{label}</i>
            ) : null}
          </span>
        );
      })}
      {meldRow}
    </div>
  );
}

function RoundResultPanel({
  result,
  view,
  catalog,
  deadlineAt,
  onClose,
  historical,
}: {
  result: RoundOverMessage;
  view: PlayerView;
  catalog: Record<string, AugmentCatalogEntry>;
  /**
   * **지나간 국을 다시 열어 보는 중**인가 (📜 기록). 카운트다운도 없고 버튼도 "닫기"다.
   * 그리고 이 판의 지금 상태로는 알 수 없는 것(그 국에 무슨 증강을 들고 있었는가)은
   * 그리지 않는다 — 증강은 판이 갈수록 늘어나므로, 지금 목록으로 과거를 설명하면
   * 그 국에 없던 증강을 있었던 것처럼 말하게 된다.
   */
  historical?: boolean;
  /**
   * 서버가 다음 국을 시작하는 시각(performance.now 기준). null이면 대기가 없다
   * (interRoundDelayMs=0 — 테스트·봇 게임). 카운트다운 표시에만 쓴다.
   */
  deadlineAt: number | null;
  onClose: () => void;
}): JSX.Element {
  const { settle } = result;
  const infos = settle.winInfos ?? [];
  const nameOf = (id: string): string => playerNameById(view, id);
  /**
   * 실역 없이 화료했을 때(무형화료 등) "무엇이 이 화료를 성립시켰는가" 한 줄.
   *
   * 그 증강이 정산에 판을 얹었으면(augPoints) 그 줄이 이름과 판수를 이미 말하므로
   * 여기서는 아무것도 내지 않는다 — 안 그러면 "무형화료 · 역 없음"과
   * "무형화료 · +2판"이 나란히 서서 같은 이야기를 두 번 한다.
   */
  const yakulessLabel = (winner: string): string | null => {
    const augs = view.players.find((p) => p.id === winner)?.augments ?? [];
    if (!augs.includes("yakuless_win")) return null;
    const noted = (settle.augPoints ?? []).some(
      (a) => a.player === winner && a.augId === "yakuless_win" && a.points !== 0,
    );
    if (noted) return null;
    return catalog["yakuless_win"]?.name ?? "무형화료";
  };

  /**
   * 결과 화면은 **스스로 닫지 않는다.** 예전에는 5초 타이머가 창을 강제로 닫았는데,
   * 이 화면 하나에 화료자·공개 손패(스태거 애니메이션)·역 목록·도라 줄·증강 점수
   * 내역·판/부 원·점수 카운트업(0.4s 뒤 시작해 최대 2s)·증감표·다음 국 안내가 다
   * 들어 있고, 황패유국은 네 사람의 손패를 싣는다. `.result-panel`은 스크롤까지
   * 되는데 5초 안에 그걸 읽고 스크롤하라는 요구였다.
   *
   * 이제는 사람이 "다음 국으로"를 눌러야 닫힌다(작혼·천봉과 같은 관례). 아무도 안
   * 누르면 서버가 상한(autoContinueMs)에서 다음 국을 시작하고, 새 국 뷰가 오면
   * 그때 창이 정리된다 — 그 남은 시간을 버튼 위에 그대로 세어 보여 준다.
   */
  const [remainMs, setRemainMs] = useState<number>(() =>
    deadlineAt === null ? 0 : Math.max(0, deadlineAt - performance.now()),
  );
  useEffect(() => {
    if (deadlineAt === null) return;
    const tick = (): void => setRemainMs(Math.max(0, deadlineAt - performance.now()));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);
  const remainSec = Math.ceil(remainMs / 1000);
  const showCountdown = deadlineAt !== null && remainSec > 0;

  // 역 스탬프 사운드 — CSS 스탬프 딜레이(0.15s + i*0.09s)와 동기한 펜타토닉 계단
  const headRows = infos[0] !== undefined
    ? infos[0].yaku.length +
      (infos[0].yakuless === true && yakulessLabel(infos[0].winner) !== null ? 1 : 0) +
      (infos[0].doraHan > 0 ? 1 : 0) +
      (infos[0].uraHan > 0 ? 1 : 0) +
      (infos[0].redHan > 0 ? 1 : 0) +
      (infos[0].extraHan > 0 ? 1 : 0)
    : 0;
  const stepsPlayedFor = useRef<RoundOverMessage | null>(null);
  useEffect(() => {
    if (stepsPlayedFor.current === result) return; // StrictMode 이중 마운트 가드
    stepsPlayedFor.current = result;
    if (result.outcome === "win" && headRows > 0) sfx.yakuSteps(headRows);
  }, [result, headRows]);

  const isWin = result.outcome === "win";
  const isDraw = result.outcome === "draw";
  /** 화료자 — 이 사람들의 증강 내역은 위 승자 블록이 이미 적으므로 표에서는 건너뛴다 */
  const winnerIds = new Set(infos.map((w) => w.winner));
  // 텐파이 집계가 실리지 않은 정산(구 버전 로그 이어받기)은 전원 "노텐"으로 오표기하느니
  // 예전 점수표로 물러난다 — delta 부호로 텐파이를 추정하면 유국 증강이 섞일 때 틀린다.
  const tenpaiPlayers = settle.tenpaiPlayers;
  const drawDetail = isDraw && tenpaiPlayers !== undefined;
  const tenpaiSet = new Set(tenpaiPlayers ?? []);
  // 다음 국 안내 — 유국·도중유국은 여기가 유일한 "그래서 어떻게 되는가" 정보다.
  // …화료에도 붙인다. `dealerContinues`는 화료 정산에도 실려 오는데 예전에는 `!isWin`
  // 안에서만 조립해서, 친이 화료해 연장인지 넘어가는지·본장이 몇 개가 되는지를
  // 결과 화면에서 알 수 없었다.
  const nextRoundNote: string[] = [];
  {
    // 도중유국은 친이 "연장"된 게 아니라 같은 국을 다시 치는 것이라 표현을 나눈다
    if (settle.dealerContinues === true) nextRoundNote.push(isDraw || isWin ? "친 연장" : "친 유지");
    else if (settle.dealerContinues === false) nextRoundNote.push("친 넘어감");
    // 화료로 친이 넘어가면 본장은 0으로 돌아간다 — "0본장"은 알려 줄 것이 없다.
    if (!isWin || settle.honba > 0) nextRoundNote.push(`${settle.honba}본장`);
    if (settle.riichiPot > 0) {
      nextRoundNote.push(`리치봉 ${settle.riichiPot.toLocaleString()}점 이월`);
    }
  }

  return (
    // `overlay-peekable` — 결과 화면도 판을 통째로 덮는다. 표도라·버림패를 다시 보려
    // 해도 볼 수가 없어서, 훔쳐보기 버튼이 붙는 창 목록에 넣는다(증강 선택창과 같다).
    <div className={`overlay overlay-peekable result-overlay result-outcome-${result.outcome}`}>
      {/* 축하 꽃잎은 화료에만 — 유국·도중유국에 뿌리면 진 사람에게도 축포가 된다 */}
      {isWin ? (
        <div className="result-petals" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <i
              key={i}
              className="result-petal"
              style={{
                left: `${(i * 8.3 + 4) % 100}%`,
                animationDelay: `${(i % 5) * 0.5}s`,
                animationDuration: `${6 + (i % 4)}s`,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="result-panel">
        <h2 className="result-title">
          {isWin ? "화 료" : isDraw ? "유 국" : "도중 유국"}
        </h2>
        {!isWin ? (
          <p className="result-subtitle">
            {isDraw
              ? // 평범한 유국이 아니면 그 사실을 말한다 — 유국역만이 32,000점을 옮겨도
                // 부제는 고정 문구 "패산 소진"이라 역만이라는 말조차 없었다.
                settle.drawSpecial !== undefined
                ? `${settle.drawSpecial.label}${
                    settle.drawSpecial.holder !== undefined
                      ? ` (${nameOf(settle.drawSpecial.holder)})`
                      : ""
                  }`
                : "패산 소진 — 텐파이한 사람만 손을 공개한다"
              : (ABORT_REASONS[settle.abortReason ?? ""] ?? "국이 중단됐다")}
          </p>
        ) : null}

        {infos.map((w, wi) => {
          // 역 리스트를 하나의 배열로 모아 스탬프 스태거 딜레이를 일관되게 준다
          // 역 목록이 비었는지가 아니라 **실역 0개 화료였는지**로 본다 — 역 없는 손도
          // 도라·적도라로 판을 세므로 목록에 줄이 설 수 있다(2026-08-17).
          const yakulessName = w.yakuless === true ? yakulessLabel(w.winner) : null;
          const yakuRows: { key: string; label: string; han: string; aug?: boolean }[] = [
            ...(yakulessName !== null
              ? [{ key: "yakuless", label: yakulessName, han: "역 없음", aug: true }]
              : []),
            ...w.yaku.map((y) => ({
              key: y.id,
              label: YAKU_NAMES[y.id] ?? y.name,
              // 역만 손의 역 줄은 판수 대신 배수로 — 대사희·국사 13면은 한 줄이 "더블 역만"이다
              han: w.yakumanCount > 0 ? yakumanHanLabel(y.han) : `${y.han}판`,
            })),
            // 증강 도라는 표준 도라와 합산돼 한 줄로만 떴다 — 화면에 뜬 표시패로
            // 설명되지 않는 판수의 출처를 따로 적는다.
            ...(w.doraHan > 0
              ? [
                  {
                    key: "dora",
                    label:
                      w.augDoraHan !== undefined && w.augDoraHan > 0
                        ? `도라 (증강 ${w.augDoraHan}판 포함)`
                        : "도라",
                    han: `${w.doraHan}판`,
                  },
                ]
              : []),
            ...(w.uraHan > 0 ? [{ key: "ura", label: "뒷도라", han: `${w.uraHan}판` }] : []),
            ...(w.redHan > 0 ? [{ key: "red", label: "적도라", han: `${w.redHan}판` }] : []),
            // 증강이 얹은 추가 판 — 어느 증강이 몇 판인지 알 수 있으면 그렇게 적는다.
            // (합계만 아는 구 리플레이는 예전처럼 익명 한 줄로 떨어진다.)
            ...(w.extraHanBy !== undefined && w.extraHanBy.length > 0
              ? w.extraHanBy.map((e) => ({
                  key: `extra:${e.augId}`,
                  label: augmentDisplayName(e.augId),
                  han: `+${e.han}판`,
                  aug: true,
                }))
              : w.extraHan > 0
                ? [{ key: "extra", label: "증강 보너스", han: `${w.extraHan}판`, aug: true }]
                : []),
            /**
             * 증강이 정산에서 **점수를 직접 움직인 내역**(augPoints).
             *
             * 인터셉터는 deltas만 고치고 지나가므로, 이 줄이 없으면 화면에는 표준 점수만
             * 뜨고 증강이 한 일이 통째로 사라진다 — 뚫린 천장이 점수를 몇 배로 불려도
             * "어디서 온 숫자인지" 알 수 없었다(2026-08-02 사용자 보고).
             *
             * 판으로 말할 수 있는 증강(`han`)은 판으로 적는다 — 역 목록이 전부 "N판"이라
             * 점수 줄 하나만 단위가 튀면 오히려 읽기 어렵다. 누가 냈는지는 적지 않는다:
             * 화료점이 오른 만큼 지불자가 내는 것은 당연한 일이라 설명할 값이 아니다.
             */
            ...(settle.augPoints ?? [])
              .filter((a) => a.player === w.winner && a.points !== 0)
              .map((a) => ({
                key: `augpt:${a.augId}`,
                label: augmentDisplayName(a.augId),
                han:
                  a.han !== undefined && a.han > 0
                    ? `+${a.han}판`
                    : `${a.points > 0 ? "+" : ""}${a.points.toLocaleString()}점`,
                aug: true,
              })),
            /*
             * 본장·리치봉 — 점수는 이미 받고 있었는데 화면에 줄이 없었다. 큰 숫자가
             * `points`(둘을 뺀 값)라 아래 증감표와 숫자가 어긋났고, 리치봉 1000점을
             * 누가 왜 가져갔는지도 어디에도 안 적혔다. 본장 단가는 규칙(본장 사냥꾼이
             * 바꾼다)이라 서버가 계산해 실어 준 값을 그대로 쓴다.
             */
            ...(w.honbaBonus !== undefined && w.honbaBonus > 0
              ? [
                  {
                    key: "honba",
                    // `settle.honba`는 **다음 국**의 본장이라 몇 본을 받았는지는 못 센다.
                    // 금액만 적는다 — 그게 알려 줄 것의 전부다.
                    label: "본장",
                    han: `+${w.honbaBonus.toLocaleString()}점`,
                  },
                ]
              : []),
            ...(w.riichiPotGain !== undefined && w.riichiPotGain > 0
              ? [
                  {
                    key: "pot",
                    label: "리치봉 회수",
                    han: `+${w.riichiPotGain.toLocaleString()}점`,
                  },
                ]
              : []),
          ];
          return (
          <div key={w.winner} className="result-win">
            <div className="result-winner-row">
              <span className="result-winner">{nameOf(w.winner)}</span>
              <span className={`result-wintype ${w.winType === "tsumo" ? "wt-tsumo" : "wt-ron"}`}>
                {w.winType === "tsumo" ? "쯔모" : "론"}
              </span>
              {w.from !== null ? <span className="result-from">← {nameOf(w.from)}</span> : null}
            </div>

            {/* 지불 분담 — 쯔모의 "친 3,900 / 자 2,000씩"이 화면 어디에도 없었다.
                증감표는 본장·공탁·증강 이동이 뒤섞인 순증감 하나뿐이다. */}
            {(() => {
              const pay = w.payments;
              if (pay === undefined) return null;
              const parts: string[] = [];
              if (pay.dealer !== undefined && pay.dealer > 0) {
                parts.push(`친 ${pay.dealer.toLocaleString()}`);
              }
              if (pay.others !== undefined && pay.others > 0) {
                const n = w.winType === "tsumo" ? (pay.dealer !== undefined ? 2 : 3) : 1;
                parts.push(`자 ${pay.others.toLocaleString()}${n > 1 ? `×${n}` : ""}`);
              }
              if (pay.discarder !== undefined && pay.discarder > 0) {
                parts.push(`${pay.discarder.toLocaleString()}점`);
              }
              if (parts.length === 0) return null;
              return <div className="result-payments">{parts.join(" · ")}</div>;
            })()}

            {/* 책임지불(파오) — 엔진은 진작 계산하고 있었는데 클라이언트에는 이 말이
                한 번도 없었다. 대삼원을 확정시킨 후로를 내준 사람이 16,000을 무는데
                화면에는 자기가 쏘지도 않은 큰 마이너스만 떴다. */}
            {w.pao !== undefined ? (
              <div className="result-pao">
                책임지불 {nameOf(w.pao.responsible)} — {YAKU_NAMES[w.pao.yakuId] ?? w.pao.yakuId}{" "}
                {w.pao.points.toLocaleString()}점
              </div>
            ) : null}

            {result.revealedHands[w.winner] !== undefined ? (
              <WinHand
                hand={result.revealedHands[w.winner]!.hand}
                melds={result.revealedHands[w.winner]!.melds}
                shape={w.shape}
                winningTileId={w.winningTileId}
              />
            ) : null}

            {/* 이 손을 성립시킨 증강 — 손 모양 규칙을 바꾸는 패시브는 view 채널이 없어
                화면에 아무 흔적도 안 남는다. 그래서 결과창에 1만1통1삭 커쯔, 동남서 슌쯔,
                3-4-5-6 깡처럼 **규칙 위반으로 보이는 손**이 근거 없이 공개됐다.
                역 이름이 따로 서는 것(우는 국사무쌍 등)은 여기 넣지 않는다 — 같은 말을
                두 번 하게 된다. */}
            {(() => {
              if (historical === true) return null;
              const augs = view.players.find((p) => p.id === w.winner)?.augments ?? [];
              const shapes = augs.filter((a) => SHAPE_RULE_AUGMENTS.has(a));
              if (shapes.length === 0) return null;
              return (
                <div className="result-shape-augs">
                  <span className="result-shape-label">이 손을 성립시킨 증강</span>
                  <span className="result-shape-names">
                    {shapes.map((a) => catalog[a]?.name ?? a).join(" · ")}
                  </span>
                </div>
              );
            })()}

            <div className="result-yaku-list">
              {yakuRows.map((r, i) => (
                <div
                  key={r.key}
                  className={`result-yaku${r.aug === true ? " result-yaku-aug" : ""}`}
                  style={{ animationDelay: `${0.15 + i * 0.09}s` }}
                >
                  {/* 역 이름은 그냥 이름으로 둔다 — 결과 화면은 점수를 읽는 자리다.
                      줄줄이 밑줄이 그어지면 어느 역이 큰지가 안 보인다. */}
                  <span className="result-yaku-name">{r.label}</span>
                  <span className="result-han">{r.han}</span>
                </div>
              ))}
            </div>

            <div className="result-total">
              <span className="result-han-circle">
                {/* 글자 수를 넘겨 준다 — "더블 역만"은 원 밖으로 나가므로 CSS가 줄인다 */}
                <b className="result-han-big" data-len={`${w.yakumanCount >= 2 ? yakumanName(w.yakumanCount).length : 0}`}>
                  {w.yakumanCount > 0 ? yakumanName(w.yakumanCount) : `${w.han}판`}
                </b>
                <i className="result-fu-sm">
                  {/* 배수는 큰 글자가 이미 "더블 역만"으로 말한다 — 작은 줄은 등급만 */}
                  {w.yakumanCount > 0
                    ? w.limit !== null
                      ? (LIMIT_NAMES[w.limit] ?? w.limit)
                      : ""
                    : `${w.fu}부${w.limit !== null ? ` · ${LIMIT_NAMES[w.limit] ?? w.limit}` : ""}`}
                </i>
              </span>
              {/* 증강이 점수를 움직였으면 **최종 획득점**으로 굴린다 — 표준 점수만 크게
                  띄우면 위 증강 줄과 아래 ±점수가 서로 다른 이야기를 한다.
                  본장·리치봉도 같은 이유로 더한다: `w.points`는 둘을 빼고 세는 값이라
                  2본장·리치봉 1개면 `8,000점`이 굴러간 뒤 표에는 `+9,600`이 떴다. */}
              <CountUpPoints
                value={
                  w.points +
                  (w.honbaBonus ?? 0) +
                  (w.riichiPotGain ?? 0) +
                  augPointsOf(settle, w.winner)
                }
                mute={wi > 0}
              />
            </div>
          </div>
          );
        })}

        {/* 유국 — 누가 텐파이였고 그 손이 무엇이었는지. 이 블록이 없으면 결과창에
            "유 국"과 ±점수만 남아 왜 주고받았는지 알 수 없다. */}
        {drawDetail ? (
          <div className="result-draw">
            {view.players.map((p, pi) => {
              const tenpai = tenpaiSet.has(p.id);
              const revealed = result.revealedHands[p.id];
              const d = settle.deltas[p.id] ?? 0;
              return (
                <div
                  key={p.id}
                  className={`result-draw-row ${tenpai ? "is-tenpai" : "is-noten"}`}
                  style={{ animationDelay: `${0.1 + pi * 0.12}s` }}
                >
                  <div className="result-draw-head">
                    <span className="result-draw-seat">{seatWindChar(view, p)}</span>
                    <span className="result-draw-name">{playerName(view, p)}</span>
                    <span className={`result-draw-badge ${tenpai ? "badge-tenpai" : "badge-noten"}`}>
                      {tenpai ? "텐파이" : "노텐"}
                    </span>
                    <span
                      className={`result-draw-delta ${
                        d > 0 ? "delta-plus" : d < 0 ? "delta-minus" : "delta-zero"
                      }`}
                    >
                      {d > 0 ? "+" : ""}
                      {d.toLocaleString()}
                    </span>
                  </div>
                  {/* 유국 정산의 증강 내역 — 예전에는 렌더 경로가 아예 없어(승자 필터)
                      승승장구·유국역만처럼 유국에서만 움직이는 점수가 통째로 사라졌다. */}
                  <AugDeltaNotes settle={settle} player={p.id} />
                  {revealed !== undefined ? (
                    <div className="result-draw-hand">
                      {sortTileViews(revealed.hand).map((t, ti) => (
                        <span
                          key={t.id}
                          className="result-tile"
                          style={{ animationDelay: `${0.16 + pi * 0.12 + ti * 0.025}s` }}
                        >
                          <TileImg tile={t} size="result" />
                        </span>
                      ))}
                      {revealed.melds.map((m, mi) => (
                        <span key={`m${mi}`} className="result-meld">
                          {m.tiles.map((t) => (
                            <TileImg key={t.id} tile={t} size="result" />
                          ))}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="result-draw-hidden">패를 공개하지 않았다</div>
                  )}
                  {/* 오름패 — "텐파이였다"만으로는 무엇을 기다렸는지 알 수 없다.
                      공개된 손패를 각자 눈으로 세게 두지 않고 여기서 바로 보여준다. */}
                  {tenpai && revealed !== undefined ? (
                    (() => {
                      const waits = drawWaitsOf(view, p, revealed.hand);
                      return (
                        <div className="result-draw-waits">
                          <span className="result-draw-waits-label">오름패</span>
                          {waits.length > 0 ? (
                            <span className="result-draw-waits-tiles">
                              {waits.map((k, ki) => (
                                <span
                                  key={`${k.suit}${k.rank}`}
                                  className="result-draw-wait"
                                  style={{ animationDelay: `${0.22 + pi * 0.12 + ki * 0.03}s` }}
                                >
                                  <TileImg tile={{ kind: k }} size="mini" />
                                </span>
                              ))}
                            </span>
                          ) : (
                            // 서버는 텐파이로 쳤는데 클라 계산이 못 잡는 손 — 증강이 분해
                            // 규칙을 바꾼 경우다. 빈칸으로 두면 "대기가 없었다"로 읽힌다.
                            <span className="result-draw-waits-none">화면에서는 셀 수 없는 대기</span>
                          )}
                        </div>
                      );
                    })()
                  ) : null}
                  {carryOverOf(view, p.id).map((c) => (
                    <div key={c.label} className="result-carry">
                      <span className="result-carry-tag">{c.label}</span>
                      <span className="result-carry-tiles">
                        {c.kinds.map((kind, i) => (
                          <TileImg key={i} tile={{ kind }} size="mini" />
                        ))}
                      </span>
                      <span className="result-carry-note">{c.note}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* 표도라 — 결과 화면이 판을 완전히 덮어 뒤의 도라 줄을 훔쳐볼 수 없다.
            뒷도라만 실물로 뜨던 탓에, 표시패 1장으로 설명되지 않는 판수가 나와도
            근거를 찾을 데가 없었다. */}
        {(result.doraIndicators ?? []).length > 0 ? (
          <div className="result-ura">
            <span className="result-ura-label">도라</span>
            {(result.doraIndicators ?? []).map((id) => (
              <TileImg key={id} tile={result.tiles[id]} size="mini" />
            ))}
          </div>
        ) : null}

        {result.uraDoraIndicators.length > 0 ? (
          <div className="result-ura">
            <span className="result-ura-label">뒷도라</span>
            {result.uraDoraIndicators.map((id) => (
              <TileImg key={id} tile={result.tiles[id]} size="mini" />
            ))}
          </div>
        ) : null}

        {/* 유국은 위 텐파이 행이 이미 사람별 증감을 달고 있어 표를 겹쳐 싣지 않는다.
            도중유국은 점수 이동이 없어(전원 0) 표 대신 안내 한 줄로 대신한다. */}
        {drawDetail ? null : view.players.some((p) => (settle.deltas[p.id] ?? 0) !== 0) ? (
          <div className="result-deltas">
            {view.players.map((p) => {
              const d = settle.deltas[p.id] ?? 0;
              return (
                <div key={p.id} className="result-delta-row">
                  <span className="result-delta-name">{nameOf(p.id)}</span>
                  <span className={d > 0 ? "delta-plus" : d < 0 ? "delta-minus" : "delta-zero"}>
                    {d > 0 ? "+" : ""}
                    {d.toLocaleString()}
                  </span>
                  <AugDeltaNotes settle={settle} player={p.id} skipWinners={winnerIds} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="result-no-move">점수 이동 없음</p>
        )}

        {nextRoundNote.length > 0 ? (
          <p className="result-next">{nextRoundNote.join(" · ")}</p>
        ) : null}

        {/* 확인 버튼 — 이 창을 넘기는 유일한 손잡이다. 남은 시간을 함께 달아
            "왜 저절로 넘어가는가"를 화면 안에서 설명한다. 대기가 없는 판
            (interRoundDelayMs=0)에서는 초 표시 없이 버튼만 남는다. */}
        <button
          className={`lobby-join result-close${showCountdown && remainSec <= 5 ? " result-close-urgent" : ""}`}
          onClick={onClose}
        >
          {historical === true ? "닫기" : "다음 국으로"}
          {showCountdown ? (
            <span className="result-close-count" aria-hidden>
              {remainSec}초
            </span>
          ) : null}
        </button>
        {showCountdown ? (
          <p className="result-close-note">
            누르지 않아도 <strong>{remainSec}초</strong> 뒤 다음 국이 시작된다 —
            천천히 읽어도 된다
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────── 드래프트 오버레이 ───────────────────────────

function DraftOverlay({
  draft,
  deadlineAt,
  onPick,
  onReroll,
  picked,
  owned,
  catalog,
}: {
  draft: DraftOfferMessage;
  /**
   * 자동 선택 시각(performance.now 기준) — 오퍼가 **도착한** 시각에 굳힌 값이다.
   * null이면 마감이 없다(구 서버). 이 창이 늦게 떠도 남은 시간은 늘어나지 않는다.
   */
  deadlineAt: number | null;
  onPick: (id: string) => void;
  /** 슬롯 하나를 새로고침한다 (슬롯당 1회) */
  onReroll: (slot: number) => void;
  /** 이미 골랐는가 — 카드 비활성 + "다른 플레이어 대기 중" 표시 */
  picked: boolean;
  /** 지금까지 내가 고른 증강 — 무엇을 이어 붙일지 판단하려면 눈앞에 있어야 한다 */
  owned: readonly string[];
  catalog: Record<string, AugmentCatalogEntry>;
}): JSX.Element {
  // 남은 시간 카운트다운 — 오퍼 **도착 시각**에 굳힌 마감까지 센다. 이 창이 개막
  // 연출·결과 화면 뒤에서 늦게 떠도 화면의 숫자와 서버 타이머가 어긋나지 않는다.
  const [remainMs, setRemainMs] = useState<number>(() =>
    deadlineAt === null ? 0 : Math.max(0, deadlineAt - performance.now()),
  );
  useEffect(() => {
    if (deadlineAt === null) return;
    const tick = (): void => setRemainMs(Math.max(0, deadlineAt - performance.now()));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);
  const remainSec = Math.ceil(remainMs / 1000);
  const showTimer = deadlineAt !== null && !picked;
  /**
   * 10초 아래부터 경고다 — 5초는 너무 늦었다. 시간이 다 되면 서버가 후보 중 하나를
   * **랜덤으로** 골라 버리므로(HumanAgent.armDraft), 그 사실을 미리 크게 알린다
   * (2026-08-12 사용자 지시).
   */
  const urgent = showTimer && remainSec <= 10;
  // 카드는 기본적으로 요약 한 줄만 보여준다 — 고르는 몇 초 안에 읽히는 분량이어야 한다.
  // 원문 설명은 Shift를 누르고 있는 동안, 또는 카드의 "자세히"를 눌렀을 때만 펼친다.
  const shiftHeld = useShiftHeld();
  const [moreFor, setMoreFor] = useState<string | null>(null);
  // 보유 중 알약의 title은 원문 그대로라, 여기서도 이 판의 횟수로 줄여 준다.
  const mode = useContext(GameModeContext);

  return createPortal(
    // overlay-peekable — '누른 채로 게임판 보기' 버튼이 잠깐 투명하게 만드는 대상 표시.
    //
    // ⚠ **body 직속 포털이어야 한다**(FIXED_SURFACE_NOTE). 화면 고정 표면이라는 이유
    // 말고도 하나 더 있다: PeekButton은 붙을 창이 떴는지를 body의 childList 변화로만
    // 감시한다. 앱 트리 안에 그리면 그 변화가 body에 안 잡혀 '누른 채로 게임판 보기'
    // 버튼이 증강 선택창에서 통째로 안 떴다(2026-08-12 사용자 지적).
    <div className="overlay overlay-peekable">
      <div className="draft-panel">
        <h2 className="draft-title">증강 선택</h2>
        <p className="draft-stage">
          {DRAFT_STAGE_HEADLINE[draft.stage] ?? "증강 획득"}
        </p>
        {showTimer ? (
          <>
            <div className={`draft-timer${urgent ? " draft-timer-urgent" : ""}`}>
              ⏳ 남은 시간 <strong>{remainSec}</strong>초
            </div>
            <p className={`draft-timer-note${urgent ? " draft-timer-note-urgent" : ""}`}>
              {urgent
                ? "🎲 10초 남았다 — 시간이 다 되면 랜덤으로 결정된다"
                : "시간이 다 되면 랜덤으로 결정된다"}
            </p>
          </>
        ) : null}
        {/*
          **첫 드래프트에는 이게 무엇인지부터 말한다** (감사 2026-08-17 §3-6).

          게임 시작 30초 만에 규칙을 바꾸는 카드 세 장을 고르게 하면서, 오버레이에는
          아무 안내가 없었다. "Shift로 상세 보기"는 대기실 팁에만 적혀 있었는데
          **체험·연습으로 들어온 사람은 대기실을 거치지 않는다** — 이 게임을 처음
          보는 사람이 정확히 안내를 못 받는 경로였다.

          안내는 첫 판(보유 0)에만 크게 낸다. 두 번째부터는 조작 한 줄이면 된다 —
          매번 같은 문단을 읽히면 그건 안내가 아니라 방해다.
        */}
        {owned.length === 0 ? (
          <p className="draft-intro">
            <TermText text="**증강**은 이 판의 규칙을 바꿉니다. 고른 것은 판이 끝날 때까지 따라오고, 상대가 무엇을 골랐는지는 대개 보이지 않습니다." />
          </p>
        ) : null}
        <p className="draft-howto">
          카드의 <b>자세히 ▾</b>를 누르면 원문 설명이 열립니다
          <span className="draft-howto-key"> · Shift를 누르고 있으면 전부 펼쳐집니다</span>
        </p>
        {/* 지금까지 고른 증강 — 새 증강은 기존 증강과 맞물릴 때 값하므로, 무엇을
            들고 있는지 보이지 않으면 고를 수가 없다 (2026-08-04 사용자 요청). */}
        {owned.length > 0 ? (
          <div className="draft-owned">
            <span className="draft-owned-tag">보유 중 {owned.length}</span>
            {owned.map((id) => {
              const entry = catalog[id];
              return (
                <span
                  key={id}
                  className={`draft-owned-pill aug-cat-${augmentCategory(id)}`}
                  title={entry === undefined ? id : forMode(entry.description, mode)}
                >
                  <AugCatIcon id={id} />
                  {entry?.name ?? id}
                </span>
              );
            })}
          </div>
        ) : null}
        <div className={`draft-cards${picked ? " draft-cards-locked" : ""}`}>
          {draft.choices.map((c, i) => {
            const canReroll = !picked && draft.rerollable?.[i] === true;
            // 새로고침이 있는 판(서버가 rerollable을 보낸 판)에서는 이미 쓴 슬롯에도
            // 잠긴 버튼을 남긴다 — 버튼이 사라지면 카드 세 장의 아래 끝이 어긋난다.
            const hasRerollRow = draft.rerollable !== undefined;
            return (
              <div className="draft-slot" key={i}>
                <button
                  // key를 카드 id로 잡아 새로고침 때 카드가 새로 등장하는 연출을 다시 태운다
                  key={c.id}
                  className={`draft-card draft-card-cat aug-cat-${augmentCategory(c.id)}`}
                  style={{ animationDelay: `${i * 120}ms` }}
                  onClick={() => onPick(c.id)}
                  disabled={picked}
                >
                  <span className="draft-card-head">
                    <span className="draft-head-left">
                      <span className={`draft-cat aug-cat-${augmentCategory(c.id)}`}>
                        {CATEGORY_META[augmentCategory(c.id)].icon} {CATEGORY_META[augmentCategory(c.id)].label}
                      </span>
                      <QuestBadge id={c.id} />
                      {isActiveAugment(c.id) ? <ActiveBadge /> : null}
                    </span>
                  </span>
                  <strong className="draft-name">{c.name}</strong>
                  <span className="draft-desc">
                    <AugDesc id={c.id} description={c.description} variant="draft" expanded={shiftHeld || moreFor === c.id} />
                  </span>
                  <MoreToggle
                    open={shiftHeld || moreFor === c.id}
                    onToggle={() => setMoreFor((cur) => (cur === c.id ? null : c.id))}
                  />
                  {isActiveAugment(c.id) ? (
                    <span className="draft-active-note">⚡ 액티브 증강 — 내 턴에 직접 발동</span>
                  ) : null}
                </button>
                {hasRerollRow ? (
                  <button
                    type="button"
                    className={`draft-reroll${canReroll ? "" : " draft-reroll-spent"}`}
                    onClick={() => onReroll(i)}
                    disabled={!canReroll}
                    title={
                      canReroll
                        ? "이 자리의 증강을 다른 것으로 바꾼다 (한 번뿐)"
                        : "이미 새로고침한 자리다"
                    }
                    aria-label={
                      canReroll
                        ? `${c.name} 대신 다른 증강 보기 (한 번뿐)`
                        : `${c.name} — 새로고침을 이미 썼다`
                    }
                  >
                    <span className="draft-reroll-icon" aria-hidden="true">↻</span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {picked ? (
          <p className="draft-waiting">✓ 선택 완료 — 다른 플레이어를 기다리는 중…</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────── 게임 종료 ───────────────────────────

function GameOverModal({
  rankings,
  endReason,
  stats,
  onClose,
  onContinue,
  onOpenReplay,
  sandbox = false,
}: {
  rankings: RankingEntry[];
  /** 왜 끝났는가 — 헤더 아래 한 줄 */
  endReason?: GameEndReason;
  stats: StatsMessage | null;
  onClose: () => void;
  /** 방이 살아 있을 때만 — 같은 멤버 그대로 다음 판으로 (증강 테스트는 즉시 새 판) */
  onContinue?: () => void;
  /**
   * 방금 끝난 이 판을 그 자리에서 다시 보기 (감사 §5-10).
   * 예전에는 로비로 나가 목록에서 찾아야 했다 — 방금 진 판이 가장 보고 싶은 판인데.
   * 기록을 남기지 않는 판(증강 테스트·게스트)에는 없다.
   */
  onOpenReplay?: () => void;
  sandbox?: boolean;
}): JSX.Element {
  const [tab, setTab] = useState<"rank" | "stats">("rank");
  const gameStats = stats?.game ?? [];
  const careerByNick = useMemo(() => {
    const m: Record<string, StatsEntry> = {};
    for (const e of stats?.career ?? []) m[e.nickname] = e;
    return m;
  }, [stats]);

  return (
    <div className="overlay">
      <div className="gameover-panel">
        <h2>대국 종료</h2>
        {/* 왜 끝났는지 — 남2국에서 갑자기 순위표가 뜨면(도비) 버그로 읽혔다.
            평범한 종국에는 붙이지 않는다(설명할 것이 없다). */}
        {endReason !== undefined && GAME_END_NOTE[endReason] !== undefined ? (
          <p className="gameover-reason">{GAME_END_NOTE[endReason]}</p>
        ) : null}
        {gameStats.length > 0 ? (
          <div className="go-tabs">
            <button className={tab === "rank" ? "go-tab active" : "go-tab"} onClick={() => setTab("rank")}>
              순위
            </button>
            <button className={tab === "stats" ? "go-tab active" : "go-tab"} onClick={() => setTab("stats")}>
              통계
            </button>
          </div>
        ) : null}

        {tab === "rank" || gameStats.length === 0 ? (
          <div className="rank-list">
            {rankings.map((r) => (
              <div key={r.playerId} className={`rank-row rank-${r.rank}`}>
                <span className="rank-no">{r.rank}위</span>
                <span className="rank-name">
                  {r.isBot ? "봇" : r.nickname}
                  {r.isBot ? <span className="seat-bot">BOT</span> : null}
                  {/* 어느 성향이 이겼는지 — 순위표에서 그게 읽혀야 다음 판이 달라진다 */}
                  {r.isBot ? <BotArchetypeChip archetype={r.archetype} /> : null}
                </span>
                {/* 원점 → 우마·오카 → 최종. 세 값 모두 서버가 이미 보내 주는데(RankingEntry)
                    예전에는 원점과 최종만 찍어서, 25000점이 왜 -5가 되는지 역산할 수 없었다.
                    ⚠ 숫자를 보여 주는 것만으로는 여전히 부족했다 (감사 §3-10): "우마"·"오카"가
                    무엇인지 어디에도 설명이 없었다. `TermText`를 통과시켜 용어집에 이어 준다 —
                    새 문구를 지어내지 않고 이미 있는 설명 경로에 얹는다. */}
                <span className="rank-raw">
                  {r.rawScore.toLocaleString()}점
                  {r.uma !== 0 || r.oka !== 0 ? (
                    <span className="rank-umaoka">
                      <TermText
                        text={[
                          r.uma !== 0 ? `우마 ${r.uma > 0 ? "+" : ""}${r.uma}` : null,
                          r.oka !== 0 ? `오카 ${r.oka > 0 ? "+" : ""}${r.oka}` : null,
                        ]
                          .filter((s) => s !== null)
                          .join(" · ")}
                      />
                    </span>
                  ) : null}
                </span>
                <span
                  className={`rank-final ${
                    r.score > 0 ? "rank-final-plus" : r.score < 0 ? "rank-final-minus" : "rank-final-zero"
                  }`}
                >
                  {r.score > 0 ? "+" : ""}
                  {r.score.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="stats-list">
            {gameStats.map((e) => {
              const career = e.isBot ? null : careerByNick[e.nickname] ?? null;
              return (
                <div key={e.playerId ?? e.nickname} className="stats-player">
                  <div className="stats-head">
                    <span className="stats-name">
                      {e.nickname}
                      {e.isBot ? <span className="seat-bot">BOT</span> : null}
                    </span>
                    {career !== null ? (
                      <span className="stats-career-note">누적 {career.stats.games}판</span>
                    ) : null}
                  </div>
                  <div className="stats-sec-label">이번 판</div>
                  <StatsGrid s={e.stats} scope="game" />
                  {career !== null ? (
                    <>
                      <div className="stats-sec-label">누적</div>
                      <StatsGrid s={career.stats} />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="go-actions">
          {onContinue !== undefined ? (
            <button className="lobby-join" onClick={onContinue}>
              {sandbox ? "새 판 시작" : "이어하기 (방 유지)"}
            </button>
          ) : null}
          {onOpenReplay !== undefined ? (
            <button className="lobby-join go-replay" onClick={onOpenReplay}>
              이 판 다시 보기
            </button>
          ) : null}
          <button
            className={onContinue !== undefined ? "lobby-join go-leave" : "lobby-join"}
            onClick={onClose}
          >
            로비로
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 리플레이 뷰어 ───────────────────────────

/** 재생 속도 (이벤트 간 ms) */
const REPLAY_SPEEDS = [
  { label: "0.5×", ms: 700 },
  { label: "1×", ms: 350 },
  { label: "2×", ms: 160 },
  { label: "4×", ms: 70 },
] as const;

/**
 * 리플레이 재구성 모듈을 **필요할 때** 불러온다 (감사 §7-1·7-3).
 *
 * `replayRebuild`는 증강 구현 전체(@majak/content — 117개 모듈, 1.2MB)를 끌고 온다.
 * 판을 되짚으려면 그때 그 증강들이 실제로 있어야 하므로 그 의존 자체는 옳다. 문제는
 * 그것이 **첫 화면 번들에** 들어 있었다는 것이다 — 로그인 화면 하나 그리는 데
 * 서버 엔진과 증강 117개를 전부 파싱했다.
 *
 * 트리셰이킹으로는 못 뺀다: 배열이 참조되는 이상 117개가 전부 살아 있어야 하고,
 * defineAugment가 검증 실패 시 throw 하는 부수효과 함수라 롤업이 각 모듈을 순수로
 * 판정하지도 못한다. 그래서 **경계를 옮긴다** — 리플레이를 여는 사람만 받아 간다.
 */
type ReplayRebuildModule = typeof import("./replayRebuild.js");
let replayModulePromise: Promise<ReplayRebuildModule> | null = null;
function loadReplayModule(): Promise<ReplayRebuildModule> {
  replayModulePromise ??= import("./replayRebuild.js");
  return replayModulePromise;
}

function ReplayViewer(props: {
  data: ReplayDataMessage;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onClose: () => void;
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [mod, setMod] = useState<ReplayRebuildModule | null>(null);
  useEffect(() => {
    let alive = true;
    loadReplayModule().then(
      (m) => {
        if (alive) setMod(m);
      },
      (e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const replay = useMemo<RebuiltReplay | null>(() => {
    if (mod === null) return null;
    try {
      return mod.rebuildReplay(props.data.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [props.data, mod]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const total = replay !== null ? replay.states.length - 1 : 0;
  /** 열어 둔 정산 (없으면 null) — 리플레이는 판만 그려서 역·판·부를 되짚을 수 없었다 */
  const [openSettle, setOpenSettle] = useState<number | null>(null);
  const settlements = useMemo(
    () => (replay !== null && mod !== null ? mod.replaySettlements(replay) : []),
    [replay, mod],
  );
  /** 지금 프레임까지 이미 끝난 국들의 정산 (아직 안 온 국의 결과를 미리 보여 주지 않는다) */
  const shownSettlements = settlements.filter((sx) => sx.index <= idx);

  // 자동 재생
  useEffect(() => {
    if (!playing || replay === null) return;
    const t = window.setInterval(() => {
      setIdx((cur) => {
        if (cur >= total) {
          setPlaying(false);
          return cur;
        }
        return cur + 1;
      });
    }, REPLAY_SPEEDS[speed]?.ms ?? 350);
    return () => window.clearInterval(t);
  }, [playing, speed, total, replay]);

  const view = useMemo(
    () => (replay !== null && mod !== null ? mod.replayViewAt(replay, idx) : null),
    [replay, idx, mod],
  );

  /*
   * 키보드 조작 (감사 2026-08-17 §5-12).
   *
   * 되짚어 보는 화면인데 손이 마우스에 묶여 있었다 — 한 수씩 앞뒤로 가는 일을
   * 수백 번 하는 자리라 여기가 키보드가 가장 필요한 화면이다. 영상 플레이어의
   * 관습을 그대로 쓴다: Space 재생/정지, ←/→ 한 수, Shift+←/→ 열 수, Home/End 처음·끝.
   *
   * 글자를 치는 칸에서는 듣지 않는다 — 리플레이 화면에 입력칸이 생겨도 안전하게.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (el !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((v) => !v);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        setIdx((c) => Math.min(total, c + step));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setIdx((c) => Math.max(0, c - step));
      } else if (e.key === "Home") {
        e.preventDefault();
        setPlaying(false);
        setIdx(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setPlaying(false);
        setIdx(total);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  if (replay === null || view === null) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1 className="lobby-title">리플레이</h1>
          <p className="lobby-tag">{error ?? "재구성 중…"}</p>
          <button className="lobby-join" onClick={props.onClose}>돌아가기</button>
        </div>
      </div>
    );
  }

  // 현재 idx가 속한 국 / 국 점프 대상
  const currentRound = replay.roundStarts.filter((r) => r <= idx).length;
  function jumpRound(delta: number): void {
    const target = currentRound - 1 + delta;
    const to = replay!.roundStarts[target];
    setIdx(to !== undefined ? to : delta < 0 ? 0 : total);
    setPlaying(false);
  }

  const r = view.round;
  const roundLabel = `${WIND_KO[r.prevalentWind - 1] ?? "?"}${r.roundNumber}국${r.honba > 0 ? ` ${r.honba}본장` : ""}`;

  return (
    <div className="replayer">
      <GameTable
        view={view}
        prompt={null}
        promptSeq={0}
        riichiMode={false}
        catalog={replay.catalog as Record<string, AugmentCatalogEntry>}
        scoreFx={{}}
        settings={props.settings}
        spectator
        spectateCode={null}
        onSetting={props.onSetting}
        onRiichiMode={() => undefined}
        onSubmit={() => undefined}
        onLeave={props.onClose}
      />
      <div className="replayer-bar">
        <span className="replayer-round">{roundLabel}</span>
        <button className="rp-btn" onClick={() => jumpRound(-1)} title="이전 국">⏮</button>
        <button className="rp-btn" onClick={() => { setIdx(Math.max(0, idx - 1)); setPlaying(false); }} title="이전">◀</button>
        <button className="rp-btn rp-play" onClick={() => setPlaying((v) => !v)}>
          {playing ? "⏸" : "▶"}
        </button>
        <button className="rp-btn" onClick={() => { setIdx(Math.min(total, idx + 1)); setPlaying(false); }} title="다음">▶</button>
        <button className="rp-btn" onClick={() => jumpRound(1)} title="다음 국">⏭</button>
        <input
          className="replayer-slider"
          type="range"
          min={0}
          max={total}
          value={idx}
          onChange={(e) => { setIdx(Number(e.target.value)); setPlaying(false); }}
        />
        {/*
          "137 / 842" 는 **사람에게 뜻이 없는 수**다 (감사 §5-11). 어느 국 어디쯤인지가
          알고 싶은 것이지 배열 인덱스가 아니다. 국 표시는 이미 화면 위에 있으므로
          여기서는 **그 국 안에서 몇 번째 사건인가**를 보여 준다. 전체 대비 위치는
          바로 왼쪽 슬라이더가 이미 말해 준다.
        */}
        <span
          className="replayer-pos"
          title={`전체 ${idx} / ${total}`}
          aria-label={`${roundLabel} ${idx - (replay.roundStarts[currentRound - 1] ?? 0)}번째 사건, 전체 ${idx} / ${total}`}
        >
          {roundLabel} · {idx - (replay.roundStarts[currentRound - 1] ?? 0)}
        </span>
        <button
          className="rp-btn rp-speed"
          onClick={() => setSpeed((s) => (s + 1) % REPLAY_SPEEDS.length)}
          title="재생 속도"
        >
          {REPLAY_SPEEDS[speed]?.label}
        </button>
        {/* 정산 보기 — 지금까지 끝난 국 중 **가장 최근** 것을 연다. 리플레이가 판만
            그려서 역·판·부·증감을 어디서도 되짚을 수 없었다. */}
        <button
          className="rp-btn"
          disabled={shownSettlements.length === 0}
          onClick={() => setOpenSettle(shownSettlements.length - 1)}
          title="이 국까지의 정산 보기"
        >
          🧾
        </button>
      </div>
      {openSettle !== null && shownSettlements[openSettle] !== undefined ? (
        <RoundResultPanel
          result={shownSettlements[openSettle]!.result}
          view={view}
          catalog={replay.catalog as Record<string, AugmentCatalogEntry>}
          deadlineAt={null}
          historical
          onClose={() => setOpenSettle(null)}
        />
      ) : null}
    </div>
  );
}
