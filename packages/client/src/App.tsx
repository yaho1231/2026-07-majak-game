import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  AbortVoteMessage,
  ActionOption,
  ActionMessage,
  AugmentCatalogEntry,
  ClientMessage,
  DraftOfferMessage,
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
  ReplayGameSummary,
  RoundOverMessage,
  ServerMessage,
  StatsEntry,
  StatsMessage,
  TileKind,
  WinInfo,
} from "@majak/core";
import { SPECTATOR_ID, winningKinds } from "@majak/core";
import { rebuildReplay, replayViewAt } from "./replayRebuild.js";
import type { RebuiltReplay } from "./replayRebuild.js";
import { sfx } from "./sfx.js";

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

/** 자동 재연결 백오프 (ms) — 0.5s부터 두 배씩, 최대 10s. 무한 재시도. */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;
type Side = "bottom" | "right" | "top" | "left";

/** 서버 WS 주소 — 배포(정적 서빙)면 same-origin, vite dev면 localhost:3001 */
function defaultServerUrl(): string {
  const loc = window.location;
  if (/^517\d$/.test(loc.port)) return "ws://localhost:3001";
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}`;
}
const SERVER_OVERRIDE_KEY = "majak.serverUrl";
const SESSION_KEY = "majak.sessionToken";
const LAST_ROOM_KEY = "majak.lastRoomCode";

const WIND_CHAR = ["東", "南", "西", "北"];
const WIND_KO = ["동", "남", "서", "북"];

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
  haitei: "해저모월",
  houtei: "하저로어",
  rinshan: "영상개화",
  chankan: "창깡",
  chiitoitsu: "치토이츠",
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
  suuankou: "스안커",
  daisangen: "대삼원",
  shousuushii: "소사희",
  daisuushii: "대사희",
  tsuuiisou: "자일색",
  ryuuiisou: "녹일색",
  chinroutou: "청노두",
  chuuren: "구련보등",
  suukantsu: "스깡쯔",
  tenhou: "천화",
  chihou: "지화",
  tanyao_break: "탕야오 해방",
  kokushi_open: "우는 국사무쌍",
  wait_art_tanki: "대기의 미학(단기)",
  wait_art_bad: "대기의 미학(간·변짱)",
};

const LIMIT_NAMES: Record<string, string> = {
  mangan: "만관",
  haneman: "하네만",
  baiman: "배만",
  sanbaiman: "삼배만",
  kazoe_yakuman: "헤아림 역만",
  yakuman: "역만",
};

const ACTION_LABEL: Record<string, string> = {
  win: "화료",
  pon: "펑",
  chi: "치",
  minkan: "깡",
  ankan: "안깡",
  shouminkan: "가깡",
  kyushuKyuhai: "구종구패",
  pass: "패스",
  recall: "회수",
  peek_waits: "선언 간파",
  swap3: "3장 강탈",
  hand_swap: "통째로 바꾸기",
  red_touch: "붉은 손길",
  future_exchange: "미래 보기",
  gamble_start: "도박 개시",
  take_rinshan: "영상패 획득",
  claim_dealer: "오야 찬탈",
  seat_swap: "자리 바꿈",
  cancel_riichi: "리치 취소",
  bloom_kan: "만개 (영상개화)",
  declare_no_retreat: "불퇴 선언",
};

/** 액티브 액션 → 그 액션을 만들어내는 증강 id (메뉴에서 어느 증강인지 표시용). */
const ACTION_AUGMENT: Record<string, string> = {
  recall: "discard_recall",
  peek_waits: "peek_riichi_waits",
  swap3: "hand_swap3",
  hand_swap: "full_hand_swap",
  red_touch: "red_five_touch",
  future_exchange: "future_sight",
  gamble_start: "rinshan_gamble",
  take_rinshan: "rinshan_gamble",
  claim_dealer: "pseudo_dealer",
  seat_swap: "seat_swap",
  cancel_riichi: "last_stand",
  bloom_kan: "cliff_bloom",
  declare_no_retreat: "no_retreat",
};

/** 플레이어가 버튼으로 발동하는 액티브 증강 액션 타입 (타일 클릭 액션은 제외). */
const AUGMENT_ACTION_TYPES = new Set([
  "recall",
  "peek_waits",
  "swap3",
  "hand_swap",
  "red_touch",
  "future_exchange",
  "gamble_start",
  "take_rinshan",
  "claim_dealer",
  "seat_swap",
  "cancel_riichi",
  "bloom_kan",
  "declare_no_retreat",
]);

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
  "rinshan_gamble",
  "peek_riichi_waits",
  "pseudo_dealer",
  "seat_swap",
  "last_stand",
  "cliff_bloom",
  "no_retreat",
]);

/** 이 증강이 '액티브 증강' 버튼으로 직접 발동되는지 (설명카드·툴팁 뱃지용). */
function isActiveAugment(id: string): boolean {
  return ACTIVE_AUGMENT_IDS.has(id);
}

// ─────────────────────────── 증강 카테고리 (분류·아이콘) ───────────────────────────

/**
 * 증강 분류. 아이콘은 지금은 이모지 플레이스홀더이며 추후 이미지로 교체 예정.
 * 분류는 (1) 아래 명시 매핑 → (2) id 관례 휴리스틱 순으로 정해져,
 * 앞으로 추가되는 증강도 별도 작업 없이 알맞은 카테고리로 자동 편입된다.
 * (id에 riichi/peek/swap/bounty… 같은 관례어가 들어가면 자동 분류되고,
 *  애매하면 명시 매핑에 한 줄만 추가하면 된다.)
 */
type AugmentCategory =
  | "scoring"
  | "info"
  | "hand"
  | "call"
  | "riichi"
  | "defense"
  | "disrupt"
  | "etc";

interface CategoryMeta {
  label: string;
  /** 임시 아이콘 (추후 이미지로 교체) */
  icon: string;
}

const CATEGORY_META: Record<AugmentCategory, CategoryMeta> = {
  scoring: { label: "점수", icon: "💰" },
  info: { label: "정보", icon: "👁" },
  hand: { label: "손패 조작", icon: "🔧" },
  call: { label: "부로", icon: "🀄" },
  riichi: { label: "리치", icon: "⚡" },
  defense: { label: "수비", icon: "🛡" },
  disrupt: { label: "교란", icon: "🌀" },
  etc: { label: "기타", icon: "✦" },
};

/** 현재 구현된 증강의 명시 분류. (휴리스틱으로 안 잡히거나 뜻이 애매한 것만 꼭 필요) */
const AUGMENT_CATEGORY: Record<string, AugmentCategory> = {
  // core 기본
  cheap_riichi: "riichi",
  tsumo_bonus: "scoring",
  iron_wall: "defense",
  vengeance: "scoring",
  open_riichi: "riichi",
  yakuless_win: "call",
  discard_recall: "hand",
  // silver
  gokuakumudo: "scoring",
  riichi_market: "riichi",
  noten_insurance: "defense",
  honba_collector: "scoring",
  red_five_touch: "hand",
  dealer_grit: "scoring",
  final_spurt: "scoring",
  flow: "scoring",
  overtime: "scoring",
  counter: "scoring",
  avenger: "scoring",
  red_hand: "hand",
  greed: "scoring",
  dora_hunter: "scoring",
  picky_eater: "call",
  bounty_tanyao: "scoring",
  bounty_riichi: "scoring",
  bounty_yakuhai: "scoring",
  bounty_sanshoku: "scoring",
  bounty_honitsu: "scoring",
  bounty_toitoi: "scoring",
  // gold
  slow_steady: "scoring",
  furo_master: "call",
  promise_next: "scoring",
  riichi_upgrade: "riichi",
  free_riichi_discard: "riichi",
  peek_riichi_waits: "info",
  xray_hand: "info",
  rinshan_preview: "info",
  hidden_river: "disrupt",
  yakuman_shield: "defense",
  omni_chi: "call",
  pseudo_dealer: "disrupt",
  veteran: "scoring",
  composure: "defense",
  gambler_pro: "disrupt",
  underdog: "scoring",
  wait_art: "scoring",
  momentum: "scoring",
  minimalist: "scoring",
  last_stand: "defense",
  die_hard: "defense",
  // prism
  suit_unify: "hand",
  hand_swap3: "hand",
  full_hand_swap: "hand",
  discard_lock: "disrupt",
  tanyao_break: "scoring",
  open_kokushi: "call",
  broken_wall: "disrupt",
  seat_swap: "disrupt",
  future_sight: "info",
  rinshan_gamble: "disrupt",
  true_dragon: "hand",
  parasite: "disrupt",
  jackpot: "scoring",
  big_hand: "scoring",
  late_bloomer: "scoring",
  vanguard: "scoring",
  nagashi_yakuman: "scoring",
  cliff_bloom: "call",
  no_retreat: "riichi",
};

/** id 관례로 카테고리를 추정 (명시 매핑이 없을 때의 자동 분류). */
function inferCategory(id: string): AugmentCategory {
  const s = id.toLowerCase();
  const has = (...keys: string[]): boolean => keys.some((k) => s.includes(k));
  if (has("bounty", "dora", "bonus", "greed", "jackpot", "score", "point", "han")) return "scoring";
  if (has("riichi")) return "riichi";
  if (has("peek", "xray", "preview", "sight", "reveal", "vision", "scout")) return "info";
  if (has("swap", "hand", "recall", "unify", "dragon", "tile")) return "hand";
  if (has("furo", "chi", "pon", "kan", "kokushi", "call", "meld")) return "call";
  if (has("shield", "insurance", "guard", "wall", "defense", "iron")) return "defense";
  if (has("seat", "dealer", "parasite", "gamble", "lock", "break")) return "disrupt";
  return "etc";
}

function augmentCategory(id: string): AugmentCategory {
  return AUGMENT_CATEGORY[id] ?? inferCategory(id);
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

// ─────────────────────────── 설정 (자동정렬·자동화료·후로없음) ───────────────────────────

interface Settings {
  /** 손패 자동 정렬. 끄면 드래그로 순서를 바꿀 수 있다. */
  autoSort: boolean;
  /** 자동 화료 — 텐파이에서 화료 가능하면 론/쯔모를 자동으로 누른다. */
  autoWin: boolean;
  /** 후로 없음 — 치/펑/깡 부로 기회를 자동으로 패스한다. */
  autoNoMeld: boolean;
  /** 내 오름패 표시 — 텐파이면 손패 위에 항상 화료패를 보여준다. */
  showMyWaits: boolean;
}

const SETTINGS_KEY = "majak.settings";
const DEFAULT_SETTINGS: Settings = { autoSort: true, autoWin: false, autoNoMeld: false, showMyWaits: false };

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw !== null) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* 손상된 값은 무시하고 기본값 */
  }
  return DEFAULT_SETTINGS;
}

/** 후로없음: 치·펑·깡만 있는(론 없는) 부로 프롬프트인가. */
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
 * 손패에 마우스를 올렸을 때, 그 종류의 패를 강조할 대상(공개된 버림패·부로)에
 * 알려주는 컨텍스트. null이면 강조 없음.
 */
const HighlightContext = createContext<TileKind | null>(null);

function kindMatches(tile: PublicTileView | undefined, hl: TileKind | null): boolean {
  return (
    hl !== null &&
    tile !== undefined &&
    tile.kind.suit === hl.suit &&
    tile.kind.rank === hl.rank
  );
}

type BannerTone = "riichi" | "win" | "draw" | "info" | "chi" | "pon" | "kan";
type CutInTone = "tsumo" | "ron" | "yakuman" | "limit" | "draw" | "augment" | "chi" | "pon" | "kan";
/** 만관 이상(역만 미만) 컷인의 세부 등급 — CSS가 data-tier로 강도를 키운다 */
type LimitTier = "mangan" | "haneman" | "baiman" | "sanbaiman";

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
  /** 화면에 떠 있는 시간(ms) */
  ttl: number;
  /** 이 연출이 실제로 화면에 뜨는 순간 재생할 효과음 (enqueue 시점이 아니라 활성화 시점) */
  sfx?: () => void;
}

/** 만관 이상 등급의 상대 순위 (헤드라인 화료 선정용) */
const LIMIT_RANK: Record<string, number> = { mangan: 1, haneman: 2, baiman: 3, sanbaiman: 4 };

/** 부로(치·펑·깡) 컷인 톤 — 컷인 연출을 좀 더 컴팩트하게 그린다 */
const CALL_CUTIN_TONES = new Set(["chi", "pon", "kan"]);

interface AuthInfo {
  username: string;
  isAdmin: boolean;
}

interface Toast {
  key: number;
  text: string;
  tone: "error" | "info";
}

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

// ─────────────────────────── 패 정렬·표기 ───────────────────────────

const SUIT_ORDER: Record<string, number> = { man: 0, pin: 1, sou: 2, wind: 3, dragon: 4 };

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

/** "man5" 같은 kindKey → TileKind (증강 정보 패널 렌더용) */
function parseKindKey(key: string): TileKind | null {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return null;
  return { suit: m[1] as string, rank: Number(m[2]) };
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

function tileImageSrcOf(kind: TileKind, red: boolean): string | null {
  const { suit, rank } = kind;
  if (suit === "man" || suit === "pin" || suit === "sou") {
    if (rank < 1 || rank > 9) return null;
    return `/tiles/${red ? 0 : rank}${suit === "man" ? "m" : suit === "pin" ? "p" : "s"}.png`;
  }
  if (suit === "wind" && rank >= 1 && rank <= 4) return `/tiles/${rank}z.png`;
  if (suit === "dragon" && rank >= 1 && rank <= 3) return `/tiles/${rank + 4}z.png`;
  return null;
}

/**
 * 모든 타일 이미지를 앱 로드 시 미리 받아 브라우저 캐시에 넣는다.
 * (안 하면 패가 처음 보일 때 png 로딩 전까지 흰 타일이 잠깐 번쩍인다.)
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

preloadTileImages();

function TileImg({
  tile,
  size,
}: {
  tile: { kind: TileKind; attrs?: Record<string, unknown> } | undefined;
  size: "hand" | "mini" | "fill" | "result";
}): JSX.Element {
  const src = tile === undefined ? null : tileImageSrcOf(tile.kind, tile.attrs?.red === true);
  // 증강이 새로 만들어낸 패(색 변환 등)는 원본과 구분되게 별도 이펙트로 표시한다
  const conjured = tile?.attrs?.conjured === true ? " tile-conjured" : "";
  if (src === null) {
    return <span className={`tile-face tile-${size} tile-text${conjured}`}>{formatTile(tile)}</span>;
  }
  return (
    <span className={`tile-face tile-${size}${conjured}`}>
      <img src={src} alt={formatTile(tile)} draggable={false} />
    </span>
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
  const catalogRef = useRef<Record<string, AugmentCatalogEntry>>({});
  const spectatingRef = useRef(false);
  /** 자동 재연결 상태: 예약 타이머·시도 횟수·의도적 종료 여부. */
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  /** 재연결 후 자동 복귀 대상 — 참가 중인 방 코드 / 관전 중인 방 코드. */
  const activeRoomRef = useRef<string | null>(null);
  const activeSpectateRef = useRef<string | null>(null);
  /** 이번 국 결과에 대해 roundContinue(다음 국 신호)를 이미 보냈는지 — 국마다 리셋 */
  const roundContinueSent = useRef(false);
  /**
   * 연출 배너를 국 단위로 정확히 한 번만 띄우기 위한 "이미 알림한 상태" 추적.
   * detectTransitions가 중복·스테일 뷰로 같은 전환을 다시 받아도 재발동하지 않게 한다
   * (재발동이 누적되면 배너가 자기 타이머로도 안 사라지는 stuck 버그가 났었다).
   */
  const bannerShown = useRef<{
    roundKey: string;
    riichi: Set<string>;
    melds: Record<string, number>;
  }>({ roundKey: "", riichi: new Set(), melds: {} });

  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [joined, setJoined] = useState<JoinedMessage | null>(null);
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [stats, setStats] = useState<StatsMessage | null>(null);
  const [myReplays, setMyReplays] = useState<ReplayGameSummary[]>([]);
  const [replayData, setReplayData] = useState<ReplayDataMessage | null>(null);
  const [liveRooms, setLiveRooms] = useState<LiveRoomSummary[]>([]);
  const [spectating, setSpectating] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [prompt, setPrompt] = useState<PromptMessage["prompt"] | null>(null);
  const [promptSeq, setPromptSeq] = useState(0);
  const [draft, setDraft] = useState<DraftOfferMessage | null>(null);
  const [catalog, setCatalog] = useState<Record<string, AugmentCatalogEntry>>({});
  // 연출 큐 — 대기열(ref)과 현재 재생 중(active) 하나. 한 번에 하나씩 순서대로.
  const productionQueue = useRef<Production[]>([]);
  const prodSeq = useRef(0);
  const [activeProd, setActiveProd] = useState<Production | null>(null);
  const [prodTick, setProdTick] = useState(0); // enqueue/변화 시 펌프 재실행 신호
  // 큐가 모두 빈 뒤에 열어야 하는 국 결과 (이전 국 연출이 끝난 뒤 결과창)
  const pendingResult = useRef<RoundOverMessage | null>(null);
  const [roundResult, setRoundResult] = useState<RoundOverMessage | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[] | null>(null);
  const [abortVote, setAbortVote] = useState<AbortVoteMessage | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);
  const [intro, setIntro] = useState(false);
  const [scoreFx, setScoreFx] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings>(loadSettings);
  settingsRef.current = settings; // 매 렌더 동기화 (소켓 콜백에서 최신 설정 읽기)
  catalogRef.current = catalog;
  spectatingRef.current = spectating !== null;

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패는 무시 (세션 내 설정은 유지) */
      }
      return next;
    });
  }

  // 연출은 큐에 쌓고 한 번에 하나씩 재생한다. 여러 알림이 한 틱에 몰려도 덮어써
  // 사라지거나(드롭) 다음 국까지 남지(잔류) 않고, 각자 제 시간만큼 뜬 뒤 다음으로 넘어간다.
  function enqueueProduction(p: Omit<Production, "key">): void {
    productionQueue.current.push({ ...p, key: ++prodSeq.current });
    setProdTick((t) => t + 1); // 펌프 재실행
  }

  function showBanner(
    text: string,
    tone: BannerTone,
    sub?: string,
    ms = 1500,
    sfxFn?: () => void,
  ): void {
    enqueueProduction({
      channel: "banner",
      text,
      tone,
      ttl: ms,
      ...(sub !== undefined ? { sub } : {}),
      ...(sfxFn !== undefined ? { sfx: sfxFn } : {}),
    });
  }

  function showCutIn(
    text: string,
    tone: CutInTone,
    sub?: string,
    ms = 1300,
    opts: { tier?: LimitTier; sfx?: () => void } = {},
  ): void {
    enqueueProduction({
      channel: "cutin",
      text,
      tone,
      ttl: ms,
      ...(sub !== undefined ? { sub } : {}),
      ...(opts.tier !== undefined ? { tier: opts.tier } : {}),
      ...(opts.sfx !== undefined ? { sfx: opts.sfx } : {}),
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
      setActiveProd(productionQueue.current.shift() ?? null);
      return;
    }
    if (pendingResult.current !== null) {
      setRoundResult(pendingResult.current);
      pendingResult.current = null;
    }
  }, [activeProd, prodTick]);

  // 현재 연출을 ttl 동안 띄우고, 뜨는 순간 효과음을 재생한 뒤 내린다.
  useEffect(() => {
    if (activeProd === null) return;
    activeProd.sfx?.();
    const t = window.setTimeout(() => setActiveProd(null), activeProd.ttl);
    return () => window.clearTimeout(t);
  }, [activeProd]);

  /** 연출 큐·현재 연출·대기 결과를 모두 비운다 (리셋·관전 종료 시) */
  function clearProductions(): void {
    productionQueue.current = [];
    pendingResult.current = null;
    setActiveProd(null);
  }

  function showToast(text: string, tone: Toast["tone"] = "error", ms = 3200): void {
    const key = ++toastSeq.current;
    setToast({ key, text, tone });
    window.setTimeout(() => setToast((cur) => (cur?.key === key ? null : cur)), ms);
  }

  function send(msg: ClientMessage): void {
    const ws = wsRef.current;
    if (ws === null || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
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
    const url = window.localStorage.getItem(SERVER_OVERRIDE_KEY) ?? defaultServerUrl();
    setConnection((c) => (c === "reconnecting" ? "reconnecting" : "connecting"));
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener("open", () => {
      setConnection("connected");
      reconnectAttemptsRef.current = 0;
      const token = window.localStorage.getItem(SESSION_KEY);
      if (token !== null && token !== "") send({ type: "tokenLogin", sessionToken: token });
    });
    ws.addEventListener("message", (event) => {
      handleServerMessage(JSON.parse(event.data as string) as ServerMessage);
    });
    ws.addEventListener("close", () => {
      wsRef.current = null;
      if (intentionalCloseRef.current) {
        setConnection("closed");
        return;
      }
      scheduleReconnect(); // 예기치 않은 끊김 → 자동 재연결
    });
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
    setView(null);
    setPrompt(null);
    setDraft(null);
    setRankings(null);
    setRoundResult(null);
    setAbortVote(null);
    setSpectating(null);
    clearProductions();
    setScoreFx({});
    prevViewRef.current = null;
    introShown.current = false;
    activeRoomRef.current = null;
    activeSpectateRef.current = null;
    bannerShown.current = { roundKey: "", riichi: new Set(), melds: {} };
  }

  /** 홈으로 — 게임 상태를 정리하고 홈 데이터(통계·리플레이)를 새로 고친다 */
  function returnHome(): void {
    if (joined !== null && view === null) send({ type: "leaveRoom" });
    if (spectating !== null) send({ type: "spectateStop" });
    resetGameState();
    setReplayData(null);
    refreshHome();
  }

  function refreshHome(): void {
    send({ type: "statsRequest" });
    send({ type: "replayList" });
  }

  function logout(): void {
    send({ type: "logout" });
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(LAST_ROOM_KEY);
    setAuth(null);
    resetGameState();
    setReplayData(null);
    setStats(null);
    setMyReplays([]);
  }

  function handleServerMessage(msg: ServerMessage): void {
    if (msg.type === "authOk") {
      window.localStorage.setItem(SESSION_KEY, msg.sessionToken);
      setAuth({ username: msg.username, isAdmin: msg.isAdmin });
      // 재연결 복귀 — 끊기기 전 참가/관전 중이던 방으로 자동 재입장한다.
      // (신원 기준 재접속: 서버가 좌석의 소켓을 교체하고 뷰를 즉시 복원)
      if (activeRoomRef.current !== null) {
        send({ type: "joinRoom", code: activeRoomRef.current });
      } else if (activeSpectateRef.current !== null) {
        send({ type: "spectate", code: activeSpectateRef.current });
      }
      send({ type: "statsRequest" });
      send({ type: "replayList" });
      if (msg.isAdmin) send({ type: "liveGames" });
      return;
    }
    if (msg.type === "error") {
      // 주의: 이 콜백은 마운트 시 소켓에 고정된 클로저라 state 값(view/auth 등)은
      // 스테일하다. 판단은 반드시 live ref(activeRoomRef 등)나 setter로만 한다.
      if (msg.code === "TOKEN_INVALID") {
        // 세션 만료(자동 로그인/재연결 실패) — 로그인 화면으로 정리
        window.localStorage.removeItem(SESSION_KEY);
        activeRoomRef.current = null;
        activeSpectateRef.current = null;
        setAuth(null);
        resetGameState();
        return;
      }
      // 재연결 후 자동 재입장했는데 그 방이 사라졌으면(게임이 오프라인 중 종료 등)
      // 조용히 홈으로 돌아간다. activeRoomRef가 살아 있으면 = 자동 재입장 시도였다.
      if ((msg.code === "ROOM_NOT_FOUND" || msg.code === "ROOM_PLAYING") && activeRoomRef.current !== null) {
        activeRoomRef.current = null;
        showToast("진행 중이던 게임이 종료되었습니다", "info");
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
      window.localStorage.setItem(LAST_ROOM_KEY, msg.code);
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
    if (msg.type === "spectateStarted") {
      setSpectating(msg.code);
      activeSpectateRef.current = msg.code; // 재연결 시 관전 자동 복귀 대상
      introShown.current = true; // 관전은 개막 연출 생략
      return;
    }
    if (msg.type === "spectateEnded") {
      showToast(`관전 종료 — ${msg.reason}`, "info");
      activeSpectateRef.current = null;
      // gameOver 모달이 떠 있으면 그대로 두고, 뷰·연출만 정리한다
      setSpectating(null);
      setView(null);
      clearProductions();
      prevViewRef.current = null;
      return;
    }
    if (msg.type === "actionFx") {
      // 액티브 증강 발동 연출 — 이름은 라벨 맵 → 카탈로그 순으로 찾는다
      const label =
        ACTION_LABEL[msg.actionType] ??
        catalogRef.current[msg.actionType]?.name ??
        msg.actionType;
      const pv = prevViewRef.current;
      const who = pv !== null ? playerNameById(pv, msg.player) : msg.player;
      showCutIn(label, "augment", `${who} — 증강 발동`, 1600, { sfx: sfx.call });
      return;
    }
    if (msg.type === "joined") {
      setJoined(msg);
      activeRoomRef.current = msg.roomId; // 재연결 시 자동 재입장 대상
      window.localStorage.setItem(LAST_ROOM_KEY, msg.roomId);
      return;
    }
    if (msg.type === "catalog") {
      const map: Record<string, AugmentCatalogEntry> = {};
      for (const a of msg.augments) map[a.id] = a;
      setCatalog(map);
      return;
    }
    if (msg.type === "lobby") {
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
      detectTransitions(prevViewRef.current, msg.view);
      prevViewRef.current = msg.view;
      setView(msg.view);
      return;
    }
    if (msg.type === "prompt") {
      const auto = settingsRef.current;
      const opts = msg.prompt.options;
      const win = opts.find((o) => o.type === "win");
      const pass = opts.find((o) => o.type === "pass");
      // 자동 화료 — 화료 가능하면 즉시 론·쯔모 (프롬프트를 그리지 않는다)
      if (auto.autoWin && win !== undefined) {
        send({ type: "action", actionType: "win", payload: win.payload });
        setPrompt(null);
        return;
      }
      // 후로 없음 — 부로(치·펑·깡)만 있는 프롬프트를 즉시 패스 (뜨고 지워지는 깜빡임 방지)
      if (auto.autoNoMeld && pass !== undefined && isCallOnlyPrompt(opts)) {
        send({ type: "action", actionType: "pass", payload: pass.payload });
        setPrompt(null);
        return;
      }
      setPrompt(msg.prompt);
      setPromptSeq((s) => s + 1);
      setDraft(null);
      setRiichiMode(false);
      return;
    }
    if (msg.type === "draftOffer") {
      setDraft(msg);
      setPrompt(null);
      sfx.draft();
      return;
    }
    if (msg.type === "roundOver") {
      handleRoundOver(msg);
      return;
    }
    if (msg.type === "gameOver") {
      setRankings(msg.rankings);
      setPrompt(null);
      setDraft(null);
      setAbortVote(null);
      activeRoomRef.current = null; // 게임 종료 → 재연결 자동 재입장 안 함
      window.localStorage.removeItem(LAST_ROOM_KEY);
      return;
    }
    if (msg.type === "abortVote") {
      setAbortVote(msg);
      return;
    }
    if (msg.type === "gameAborted") {
      showToast(msg.reason, "info", 4000);
      activeRoomRef.current = null;
      window.localStorage.removeItem(LAST_ROOM_KEY);
      returnHome();
      return;
    }
  }

  /** 국 종료 — 화료 컷인(만관 이상은 별도 연출) → 결과 화면 순서로 연출.
   *  결과창은 연출 큐가 모두 빈 뒤에 열리므로(scheduleRoundResult) 컷인과 겹치지 않는다. */
  function handleRoundOver(msg: RoundOverMessage): void {
    // 새 국 결과 → 다음-국 신호 가드 리셋 (결과 화면이 실제로 뜰 때 열어 준다)
    roundContinueSent.current = false;
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
        showCutIn("역 만", "yakuman", who, 2200, { sfx: sfx.yakuman });
      } else if (limitWin !== undefined) {
        const tier = limitWin.limit as LimitTier;
        const label = LIMIT_NAMES[limitWin.limit!] ?? limitWin.limit!;
        showCutIn(label, "limit", `${who} · ${wt} · ${limitWin.points.toLocaleString()}점`, 2000, {
          tier,
          sfx: sfx.mangan,
        });
      } else {
        showCutIn(
          headline.winType === "tsumo" ? "쯔모!" : "론!",
          headline.winType === "tsumo" ? "tsumo" : "ron",
          who,
          1400,
          { sfx: sfx.win },
        );
      }
    } else {
      showCutIn(msg.outcome === "draw" ? "유 국" : "도중 유국", "draw", undefined, 1300, {
        sfx: sfx.draw,
      });
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
   * 뷰 전이 감지 → 연출 (리치·부로·새 국·점수 변동·타패음).
   *
   * 배너 알림(새 국·리치·부로)은 prev/next 비교가 아니라 bannerShown ref로 판단한다.
   * 서버가 같은 상태의 뷰를 중복 전송하거나(재접속 복원 등) 뷰가 스테일하게 도착해도
   * 전환당 정확히 한 번만 배너를 띄운다 — 중복 발동이 쌓여 배너가 안 사라지던 버그 방지.
   */
  function detectTransitions(prev: PlayerView | null, next: PlayerView): void {
    const rk = roundKeyOf(next);
    const shown = bannerShown.current;

    // 첫 뷰(또는 리셋 후): 현재 국을 "이미 알림함"으로 시드만 하고 배너는 개막 연출에 맡긴다.
    // 리치·부로도 현재 상태를 시드해 재접속 중간 합류 시 헛알림을 막는다.
    if (prev === null) {
      shown.roundKey = rk;
      shown.riichi = new Set(
        next.players
          .filter((p) => next.round.byPlayer[p.id]?.riichiDeclared === true)
          .map((p) => p.id),
      );
      shown.melds = {};
      for (const p of next.players) {
        shown.melds[p.id] = next.round.byPlayer[p.id]?.melds?.length ?? 0;
      }
      return;
    }

    // 새 국 시작 — roundKey가 바뀌고 '실제로' 다음 국이 시작됐을 때만.
    // 정산 직후(round.over) 뷰는 이미 다음 국 번호를 담지만(ROUND_SETTLED가 국번호를 미리
    // 올린다) 아직 다음 국이 시작된 게 아니다. 이때 배너를 띄우면 론·점수표보다 먼저 나오고
    // 지난 국 리치·부로가 재발동한다 → phase 가드로 진짜 다음 국 뷰에서만 처리한다.
    if (rk !== shown.roundKey && next.round.phase !== "round.over") {
      shown.roundKey = rk;
      shown.riichi = new Set();
      shown.melds = {};
      const label = `${WIND_CHAR[next.round.prevalentWind - 1] ?? "?"}${next.round.roundNumber}국`;
      const sub = next.round.honba > 0 ? `${next.round.honba}본장` : undefined;
      // 새 국 배너는 큐 뒤에 붙어, 이전 국의 연출(화료 컷인 등)이 모두 끝난 뒤에 뜬다.
      // 아직 안 열린 이전 국 결과(pendingResult)가 다음 국으로 새어 나오지 않게 함께 정리한다.
      setRoundResult(null);
      pendingResult.current = null;
      showBanner(label, "info", sub, 1600, sfx.round);
    }

    // 타패 소리 (누군가의 강이 늘었다)
    for (const p of next.players) {
      const prevLen = prev.zones[`discards:${p.id}`]?.tileIds.length ?? 0;
      const nextLen = next.zones[`discards:${p.id}`]?.tileIds.length ?? 0;
      const prevHidden = prev.zones[`discards:${p.id}`]?.hiddenCount ?? 0;
      const nextHidden = next.zones[`discards:${p.id}`]?.hiddenCount ?? 0;
      if (nextLen + nextHidden > prevLen + prevHidden) {
        sfx.discard();
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

    for (const p of next.players) {
      const sub = p.id === next.playerId ? undefined : playerNameById(next, p.id);

      // 리치 선언 — 이 국에서 이 플레이어를 아직 알림하지 않았을 때만
      const nowRiichi = next.round.byPlayer[p.id]?.riichiDeclared === true;
      if (nowRiichi && !shown.riichi.has(p.id)) {
        shown.riichi.add(p.id);
        showBanner("리 치", "riichi", sub, 1500, sfx.riichi);
      }

      // 부로 (치/펑/깡) — 멜드 수가 이전 알림보다 늘었을 때만. 화료·리치처럼 컷인 연출.
      const nextMelds = next.round.byPlayer[p.id]?.melds ?? [];
      const shownCount = shown.melds[p.id] ?? 0;
      if (nextMelds.length > shownCount) {
        shown.melds[p.id] = nextMelds.length;
        const m = nextMelds[nextMelds.length - 1];
        if (m !== undefined) {
          const isKan =
            m.kind === "kan_open" || m.kind === "kan_closed" || m.kind === "kan_added";
          const label = m.kind === "chi" ? "치" : isKan ? "깡" : "펑";
          const tone = m.kind === "chi" ? "chi" : isKan ? "kan" : "pon";
          const who = playerNameById(next, p.id);
          showCutIn(label, tone, who, 1150, { sfx: sfx.call });
        }
      }
    }
  }

  function submitOption(option: ActionOption): void {
    const msg: ActionMessage = { type: "action", actionType: option.type, payload: option.payload };
    send(msg);
    if (option.type === "discard" || option.type === "free_discard") sfx.discard();
    setPrompt(null);
    setRiichiMode(false);
  }

  function pickDraft(augmentId: string): void {
    if (draft === null) return;
    send({ type: "draftPick", stage: draft.stage, augmentId });
    setDraft(null);
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
  function startGame(): void {
    send({ type: "startGame" });
    sfx.round();
  }

  // ── 화면 라우팅 ──
  const isSpectator = spectating !== null;
  const inGame = (joined !== null || isSpectator) && view !== null;
  const inWaiting = joined !== null && view === null && rankings === null && !isSpectator;
  const draftVisible = inGame && draft !== null && !intro && roundResult === null && !isSpectator;
  const lastRoomCode = window.localStorage.getItem(LAST_ROOM_KEY);

  return (
    <div className="game-root">
      {connection === "reconnecting" ? (
        <div className="reconnect-bar">
          <span className="reconnect-spin">⟳</span> 서버와 재연결 중…
        </div>
      ) : null}
      {auth === null ? (
        <AuthScreen
          connection={connection}
          onLogin={(u, p) => send({ type: "login", username: u, password: p })}
          onRegister={(u, p, code, signup) =>
            send({
              type: "register",
              username: u,
              password: p,
              ...(code !== "" ? { adminCode: code } : {}),
              ...(signup !== "" ? { signupCode: signup } : {}),
            })
          }
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
          prompt={prompt}
          promptSeq={promptSeq}
          riichiMode={riichiMode}
          catalog={catalog}
          scoreFx={scoreFx}
          settings={settings}
          spectator={isSpectator}
          spectateCode={spectating}
          abortVote={abortVote}
          onVoteAbort={voteAbort}
          onSetting={updateSetting}
          onRiichiMode={setRiichiMode}
          onSubmit={submitOption}
          onLeave={returnHome}
        />
      ) : inWaiting ? (
        <WaitingRoom
          lobby={lobby}
          roomId={joined?.roomId ?? ""}
          onReady={setReady}
          onAddBot={addBot}
          onRemoveBot={removeBot}
          onStart={startGame}
          onLeave={returnHome}
          onToast={(t) => showToast(t, "info")}
        />
      ) : (
        <HomeScreen
          auth={auth}
          stats={stats}
          replays={myReplays}
          liveRooms={liveRooms}
          lastRoomCode={lastRoomCode}
          onCreateRoom={() => send({ type: "createRoom" })}
          onJoinRoom={(code) => send({ type: "joinRoom", code })}
          onOpenReplay={(gameId) => send({ type: "replayGet", gameId })}
          onRefreshLive={() => send({ type: "liveGames" })}
          onSpectate={(code) => send({ type: "spectate", code })}
          onRefresh={refreshHome}
          onLogout={logout}
        />
      )}

      {inGame && intro && !isSpectator ? <IntroOverlay view={view!} /> : null}
      {draftVisible && draft !== null ? <DraftOverlay draft={draft} onPick={pickDraft} /> : null}
      {activeProd !== null && activeProd.channel === "banner" ? (
        <div key={activeProd.key} className={`banner banner-${activeProd.tone}`}>
          <span className="banner-text">{activeProd.text}</span>
          {activeProd.sub !== undefined ? <span className="banner-sub">{activeProd.sub}</span> : null}
        </div>
      ) : null}
      {activeProd !== null && activeProd.channel === "cutin" ? (
        <div
          key={activeProd.key}
          className={`cutin cutin-${activeProd.tone}${CALL_CUTIN_TONES.has(activeProd.tone) ? " cutin-call" : ""}`}
          {...(activeProd.tier !== undefined ? { "data-tier": activeProd.tier } : {})}
        >
          <div className="cutin-band" />
          <div className="cutin-body">
            <span className="cutin-text">{activeProd.text}</span>
            {activeProd.sub !== undefined ? <span className="cutin-sub">{activeProd.sub}</span> : null}
          </div>
        </div>
      ) : null}
      {roundResult !== null && view !== null ? (
        <RoundResultPanel
          result={roundResult}
          view={view}
          onClose={closeRoundResult}
        />
      ) : null}
      {rankings !== null ? (
        <GameOverModal rankings={rankings} stats={stats} onClose={returnHome} />
      ) : null}
      {toast !== null ? (
        <div key={toast.key} className={`toast toast-${toast.tone}`}>
          {toast.text}
        </div>
      ) : null}
    </div>
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

// ─────────────────────────── 로비 ───────────────────────────

function AuthScreen(props: {
  connection: ConnectionState;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string, adminCode: string, signupCode: string) => void;
  onRetryConnect: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [serverUrl, setServerUrl] = useState(
    window.localStorage.getItem(SERVER_OVERRIDE_KEY) ?? "",
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const disconnected = props.connection === "closed";

  function submit(): void {
    setLocalError(null);
    if (username.trim().length < 2) return setLocalError("닉네임은 2자 이상이어야 합니다");
    if (password.length < 4) return setLocalError("비밀번호는 4자 이상이어야 합니다");
    if (tab === "register" && password !== password2) {
      return setLocalError("비밀번호 확인이 일치하지 않습니다");
    }
    if (tab === "login") props.onLogin(username.trim(), password);
    else props.onRegister(username.trim(), password, adminCode.trim(), signupCode.trim());
  }

  function saveServer(): void {
    if (serverUrl.trim() === "") window.localStorage.removeItem(SERVER_OVERRIDE_KEY);
    else window.localStorage.setItem(SERVER_OVERRIDE_KEY, serverUrl.trim());
    window.location.reload();
  }

  return (
    <div className="lobby">
      <div className="lobby-card auth-card">
        <h1 className="lobby-title">MAJAK</h1>
        <p className="lobby-tag">리치마작 × 증강</p>

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
          <input
            value={username}
            maxLength={12}
            autoFocus
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
            <label>
              비밀번호 확인
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
            <label>
              가입 코드 <span className="auth-optional">(서버에 설정된 경우 필요)</span>
              <input
                value={signupCode}
                placeholder="공개 서버는 가입 코드가 필요할 수 있습니다"
                onChange={(e) => setSignupCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
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

        {localError !== null ? <p className="auth-error">{localError}</p> : null}

        {disconnected ? (
          <button className="lobby-join auth-reconnect" onClick={props.onRetryConnect}>
            서버에 다시 연결
          </button>
        ) : (
          <button
            className="lobby-join"
            onClick={submit}
            disabled={props.connection !== "connected"}
          >
            {props.connection === "connected"
              ? tab === "login" ? "로그인" : "가입하고 시작"
              : props.connection === "reconnecting" ? "재연결 중…" : "서버 연결 중…"}
          </button>
        )}

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

function HomeScreen(props: {
  auth: AuthInfo;
  stats: StatsMessage | null;
  replays: ReplayGameSummary[];
  liveRooms: LiveRoomSummary[];
  lastRoomCode: string | null;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onOpenReplay: (gameId: number) => void;
  onRefreshLive: () => void;
  onSpectate: (code: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
}): JSX.Element {
  const [code, setCode] = useState("");
  const career = props.stats?.career.find((e) => e.nickname === props.auth.username) ?? null;

  function joinByCode(): void {
    const c = code.trim().toUpperCase();
    if (c.length >= 4) props.onJoinRoom(c);
  }

  return (
    <div className="home">
      <header className="home-nav">
        <span className="home-logo">MAJAK</span>
        <span className="home-tagline">리치마작 × 증강</span>
        <span className="home-spacer" />
        <span className="home-user">
          {props.auth.username}
          {props.auth.isAdmin ? <span className="home-admin-badge">관리자</span> : null}
        </span>
        <button className="home-logout" onClick={props.onLogout}>로그아웃</button>
      </header>

      <main className="home-main">
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
        </section>

        <section className="home-card">
          <div className="home-card-head">
            <h2>내 통계</h2>
            <button className="home-refresh" onClick={props.onRefresh} title="새로 고침">↻</button>
          </div>
          {career !== null ? (
            <StatsGrid s={career.stats} />
          ) : (
            <p className="home-empty">아직 완료한 대국이 없습니다. 첫 대국을 시작해 보세요!</p>
          )}
        </section>

        <section className="home-card home-replays">
          <div className="home-card-head">
            <h2>내 리플레이</h2>
            <button className="home-refresh" onClick={props.onRefresh} title="새로 고침">↻</button>
          </div>
          {props.replays.length === 0 ? (
            <p className="home-empty">저장된 리플레이가 없습니다.</p>
          ) : (
            <ul className="replay-list">
              {props.replays.map((g) => {
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
        </section>

        {props.auth.isAdmin ? (
          <section className="home-card home-admin">
            <div className="home-card-head">
              <h2>진행 중인 게임 <span className="home-admin-badge">관리자</span></h2>
              <button className="home-refresh" onClick={props.onRefreshLive} title="새로 고침">↻</button>
            </div>
            {props.liveRooms.length === 0 ? (
              <p className="home-empty">지금 진행 중인 게임이 없습니다.</p>
            ) : (
              <ul className="replay-list">
                {props.liveRooms.map((r) => (
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

/** 통계 상세 그리드 (게임 종료 화면). */
function StatsGrid({ s }: { s: PlayerStatsView }): JSX.Element {
  const rows: [string, string][] = [
    ["국수", `${s.roundsPlayed}`],
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

function WaitingRoom(props: {
  lobby: LobbyMessage | null;
  roomId: string;
  onReady: (ready: boolean) => void;
  onAddBot: () => void;
  onRemoveBot: (playerId: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onToast?: (text: string) => void;
}): JSX.Element {
  const { lobby } = props;

  function copyCode(): void {
    void navigator.clipboard
      ?.writeText(props.roomId)
      .then(() => props.onToast?.("방 코드가 복사되었습니다 — 친구에게 공유하세요!"))
      .catch(() => props.onToast?.(`방 코드: ${props.roomId}`));
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
  const slots: (LobbyPlayerEntry | null)[] = [0, 1, 2, 3].map(
    (i) => lobby.players.find((p) => p.playerId === `p${i}`) ?? null,
  );
  const readyCount = lobby.players.filter((p) => !p.isHost && p.ready).length;
  const needReady = lobby.players.filter((p) => !p.isHost && !p.isBot).length;

  return (
    <div className="waitroom">
      <div className="waitroom-card">
        <button className="icon-btn leave-btn" onClick={props.onLeave} title="나가기">✕</button>
        <h1 className="waitroom-title">대기실</h1>
        <div className="waitroom-code" onClick={copyCode} title="클릭해서 복사">
          <span className="waitroom-code-label">방 코드</span>
          <span className="waitroom-code-value">{props.roomId}</span>
          <span className="waitroom-code-copy">📋 복사</span>
        </div>
        <p className="waitroom-room">코드를 친구에게 알려주세요 · {lobby.players.length}/4</p>

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
                    {p.nickname}
                    {p.playerId === lobby.youId ? <span className="seat-you"> (나)</span> : null}
                    {p.isBot ? <span className="seat-bot">BOT</span> : null}
                  </span>
                  <span className="seat-stats">
                    {p.isBot ? <span className="stat-chip stat-chip-empty">봇</span>
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
                      <button className="seat-kick" onClick={() => props.onRemoveBot(p.playerId)} title="봇 제거">✕</button>
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
            ? "방장입니다 — 4인이 모두 준비되면 게임을 시작하세요."
            : iAmReady
              ? "준비 완료. 방장이 시작하기를 기다립니다…"
              : "준비 완료 버튼을 누르면 방장이 게임을 시작할 수 있습니다."}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────── 게임 테이블 ───────────────────────────

function GameTable(props: {
  view: PlayerView;
  prompt: PromptMessage["prompt"] | null;
  promptSeq: number;
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
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onRiichiMode: (v: boolean) => void;
  onSubmit: (o: ActionOption) => void;
  onLeave: () => void;
}): JSX.Element {
  const { view, prompt, catalog } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 내 손패에 마우스를 올리면 그 종류의 공개패(버림·부로)를 강조하기 위한 hover 종류
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

  return (
    <HighlightContext.Provider value={hoverKind}>
    <div className="table">
      {props.spectator === true ? (
        <div className="spectate-bar">
          👁 관전 중{props.spectateCode != null ? ` — 방 ${props.spectateCode}` : ""} (모든 손패 공개)
        </div>
      ) : null}
      <button className="icon-btn settings-btn" onClick={() => setSettingsOpen((v) => !v)} title="설정">⚙</button>
      <button className="icon-btn leave-btn" onClick={props.onLeave} title="나가기">✕</button>
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
        <CenterPanel view={view} seats={seats} scoreFx={props.scoreFx} />
      </div>

      <AugmentInfoPanel view={view} catalog={catalog} />

      <OwnArea
        view={view}
        me={me}
        prompt={prompt}
        promptSeq={props.promptSeq}
        riichiMode={props.riichiMode}
        catalog={catalog}
        autoSort={props.settings.autoSort}
        showMyWaits={props.settings.showMyWaits}
        onRiichiMode={props.onRiichiMode}
        onSubmit={props.onSubmit}
        onHoverKind={setHoverKind}
      />
    </div>
    </HighlightContext.Provider>
  );
}

// ─────────────────────────── 설정 패널 ───────────────────────────

function SettingsPanel(props: {
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onClose: () => void;
  abortVote?: AbortVoteMessage | null;
  iVoted?: boolean;
  onVoteAbort?: ((vote: "agree" | "withdraw" | "reject") => void) | undefined;
}): JSX.Element {
  const rows: { key: keyof Settings; label: string; desc: string }[] = [
    { key: "autoSort", label: "자동 정렬", desc: "끄면 손패를 드래그해 순서를 바꿀 수 있습니다" },
    { key: "autoWin", label: "자동 화료", desc: "텐파이에서 화료 가능하면 자동으로 론·쯔모합니다" },
    { key: "autoNoMeld", label: "후로 없음", desc: "치·펑·깡 기회를 자동으로 넘깁니다" },
    { key: "showMyWaits", label: "내 오름패 표시", desc: "텐파이면 손패 위에 화료패를 항상 표시합니다" },
  ];
  const votes = props.abortVote?.votes ?? 0;
  const needed = props.abortVote?.needed ?? 0;
  return (
    <div className="settings-panel">
      <div className="settings-head">
        <span>설정</span>
        <button className="settings-x" onClick={props.onClose} title="닫기">✕</button>
      </div>
      {rows.map((r) => (
        <label key={r.key} className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{r.label}</span>
            <span className="settings-desc">{r.desc}</span>
          </div>
          <button
            className={`toggle${props.settings[r.key] ? " toggle-on" : ""}`}
            role="switch"
            aria-checked={props.settings[r.key]}
            onClick={() => props.onSetting(r.key, !props.settings[r.key])}
          >
            <span className="toggle-knob" />
          </button>
        </label>
      ))}
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
  return (
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
    </div>
  );
}

// ─────────────────────────── 증강 정보 패널 ───────────────────────────

/**
 * PlayerView.augmentView(증강 정보 채널)를 사람이 읽을 수 있게 표시.
 * 알려진 키 규약: sealed:{pid} / waits:{pid} /
 * suit_unify:{pid} / future_stacks / promise_next:{pid} 등.
 */
function AugmentInfoPanel({
  view,
  catalog,
}: {
  view: PlayerView;
  catalog: Record<string, AugmentCatalogEntry>;
}): JSX.Element | null {
  const entries = Object.entries(view.augmentView);
  if (entries.length === 0) return null;

  const rows: JSX.Element[] = [];
  const suitKo: Record<string, string> = { man: "만수", pin: "통수", sou: "삭수" };

  for (const [key, value] of entries) {
    const [head, target] = key.split(":") as [string, string | undefined];
    const who = target === undefined ? "" : playerNameById(view, target);

    if (head === "sealed" && Array.isArray(value)) {
      rows.push(
        <div key={key} className="ainfo-row">
          <span className="ainfo-tag ainfo-tag-seal">봉인</span>
          <span>{who}</span>
          <span className="ainfo-tiles">
            {(value as string[]).map((k) => {
              const kind = parseKindKey(k);
              return kind !== null ? <TileImg key={k} tile={{ kind }} size="mini" /> : null;
            })}
          </span>
        </div>,
      );
    } else if (head === "waits") {
      // 선언 간파 오름패는 상대 손패 위(WaitsBadge)에 상시 표시하므로 패널에서는 생략
    } else if (head === "suit_unify" && typeof value === "string") {
      rows.push(
        <div key={key} className="ainfo-row">
          <span className="ainfo-tag">단색</span>
          <span>{who}: {suitKo[value] ?? value}</span>
        </div>,
      );
    } else if (typeof value === "number") {
      const name = catalog[head]?.name ?? head;
      rows.push(
        <div key={key} className="ainfo-row">
          <span className="ainfo-tag">{name}</span>
          <span>{who !== "" ? `${who} — ` : ""}스택 {value}</span>
        </div>,
      );
    } else if (typeof value === "string" || typeof value === "boolean") {
      rows.push(
        <div key={key} className="ainfo-row">
          <span className="ainfo-tag">{catalog[head]?.name ?? head}</span>
          <span>{who !== "" ? `${who} ` : ""}{typeof value === "string" ? value : ""}</span>
        </div>,
      );
    }
  }

  if (rows.length === 0) return null;
  return <div className="ainfo">{rows}</div>;
}

// ─────────────────────────── 중앙 인포 패널 ───────────────────────────

const DORA_SLOTS = 5;

function CenterPanel({
  view,
  seats,
  scoreFx,
}: {
  view: PlayerView;
  seats: Record<Side, PlayerInfo | null>;
  scoreFx: Record<string, number>;
}): JSX.Element {
  const r = view.round;
  const wallLeft = (view.zones["wall"]?.hiddenCount ?? 0) + (view.zones["wall"]?.tileIds.length ?? 0);
  const turnSide = (Object.keys(seats) as Side[]).find(
    (s) => seats[s] !== null && seats[s]!.seat === r.turnSeat,
  );

  return (
    <div className={`center-panel${turnSide !== undefined ? ` turn-${turnSide}` : ""}`}>
      {(Object.keys(seats) as Side[]).map((side) => {
        const p = seats[side];
        if (p === null) return null;
        const wind = seatWindChar(view, p);
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
          <span className="wall-count" title="남은 패산">×{wallLeft}</span>
          {r.honba > 0 ? <span title="본장">{r.honba}본장</span> : null}
          {r.riichiPot > 0 ? <span className="pot" title="공탁">供{r.riichiPot / 1000}</span> : null}
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
        {r.uraDoraIndicators !== null && r.uraDoraIndicators.length > 0 ? (
          <div className="center-dora center-ura" title="우라도라">
            {r.uraDoraIndicators.map((id) => (
              <span key={id} className="dora-slot">
                <TileImg tile={view.tiles[id]} size="fill" />
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────── 강 (버림패) ───────────────────────────

function River({
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
  const highlight = useContext(HighlightContext);
  return (
    <div className={`river-wrap river-${side}`}>
      <div className="river">
        {ids.map((id, i) => {
          const latest =
            last !== null && last.player === playerId && last.tileId === id && i === ids.length - 1;
          const rotated = riichiIdx !== undefined && i === riichiIdx;
          const match = kindMatches(view.tiles[id], highlight);
          return (
            <span
              key={id}
              className={`rt${rotated ? " rt-riichi" : ""}${latest ? " rt-latest" : ""}${match ? " tile-hl" : ""}`}
            >
              <span className="rt-inner">
                <TileImg tile={view.tiles[id]} size="fill" />
              </span>
            </span>
          );
        })}
        {/* 안개 강(가려진 버림패) — 뒷면으로 표시 */}
        {Array.from({ length: hidden }, (_, i) => (
          <span key={`h${i}`} className="rt">
            <span className="rt-inner">
              <span className="tile-back-face rt-hidden" />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── 상대 영역 ───────────────────────────

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
  const open = zone?.tileIds ?? [];
  const melds = view.round.byPlayer[player.id]?.melds ?? [];
  const highlight = useContext(HighlightContext);
  // 선언 간파로 알아낸 이 상대의 화료패 — 발동한 본인에게만 상시 노출
  const waits = peekedWaits(view, player.id);

  if (side === "top") {
    return (
      <div className="opp-strip opp-strip-top">
        {waits.length > 0 ? <WaitsBadge waits={waits} owner={playerName(view, player)} /> : null}
        <div className="opp-melds-row">
          {melds.map((m, i) => (
            <MeldGroup key={i} view={view} meld={m} owner={player} layout="row" />
          ))}
        </div>
        <div className="opp-backs-row">
          {open.map((id) => (
            <span key={id} className={`open-tile${kindMatches(view.tiles[id], highlight) ? " tile-hl" : ""}`}>
              <TileImg tile={view.tiles[id]} size="fill" />
            </span>
          ))}
          {Array.from({ length: hidden }, (_, i) => (
            <span key={i} className="back-v" />
          ))}
        </div>
        <NamePlate view={view} player={player} catalog={catalog} tipAlign="center" />
      </div>
    );
  }

  return (
    <div className={`opp-strip opp-strip-${side}`}>
      {waits.length > 0 ? <WaitsBadge waits={waits} owner={playerName(view, player)} /> : null}
      <NamePlate view={view} player={player} catalog={catalog} tipAlign={side === "left" ? "left" : "right"} />
      <div className="opp-backs-col">
        {open.map((id) => (
          <span key={id} className={`open-tile-lying open-${side}${kindMatches(view.tiles[id], highlight) ? " tile-hl" : ""}`}>
            <span className="open-tile-inner">
              <TileImg tile={view.tiles[id]} size="fill" />
            </span>
          </span>
        ))}
        {Array.from({ length: hidden }, (_, i) => (
          <span key={i} className="back-h" />
        ))}
      </div>
      <div className="opp-melds-col">
        {melds.map((m, i) => (
          <MeldGroup key={i} view={view} meld={m} owner={player} layout="col" colSide={side} />
        ))}
      </div>
    </div>
  );
}

function NamePlate({
  view,
  player,
  catalog,
  tipUp,
  tipAlign,
}: {
  view: PlayerView;
  player: PlayerInfo;
  catalog: Record<string, AugmentCatalogEntry>;
  /** 증강 툴팁이 위로 뜨는지 (내 이름표는 화면 하단이라 위로). 기본 아래. */
  tipUp?: boolean;
  /** 툴팁 가로 정렬 — 화면 가장자리(좌·우 자리)에서 잘리지 않게 중앙 쪽으로 편다. 기본 center. */
  tipAlign?: "left" | "right" | "center";
}): JSX.Element {
  const isMe = player.id === view.playerId;
  const isTurn = view.round.turnSeat === player.seat;
  const furiten = isMe && view.round.byPlayer[player.id]?.furiten === true;
  return (
    <div className={`nameplate${isTurn ? " nameplate-turn" : ""}`}>
      {isTurn ? <span className="np-turn" aria-label="현재 차례">차례</span> : null}
      <span className="np-name">{playerName(view, player)}</span>
      {player.augments.length > 0 ? (
        <span className="np-augs">
          {player.augments.map((a) => {
            const entry = catalog[a];
            return (
              <span key={a} className={`aug-pill aug-${entry?.tier ?? "silver"}`}>
                <AugCatIcon id={a} />
                {entry?.name ?? a}
                <span className={`aug-tip${tipUp === true ? " aug-tip-up" : " aug-tip-down"} aug-tip-a-${tipAlign ?? "center"}`}>
                  <span className="aug-tip-name">
                    <AugCatIcon id={a} />
                    {entry?.name ?? a}
                    {entry !== undefined ? (
                      <span className={`aug-tip-tier tier-txt-${entry.tier}`}>{entry.tier.toUpperCase()}</span>
                    ) : null}
                  </span>
                  <span className="aug-tip-cat">{CATEGORY_META[augmentCategory(a)].label} 계열</span>
                  {isActiveAugment(a) ? (
                    <span className="aug-tip-active">⚡ 액티브 증강 (직접 발동)</span>
                  ) : null}
                  {entry?.description !== undefined ? (
                    <span className="aug-tip-desc">{entry.description}</span>
                  ) : null}
                </span>
              </span>
            );
          })}
        </span>
      ) : null}
      {furiten ? <span className="np-furiten">후리텐</span> : null}
    </div>
  );
}

// ─────────────────────────── 멜드 (부로 묶음) ───────────────────────────

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

  if (meld.kind === "kan_closed") {
    const s = sortTileIds(meld.tileIds, view.tiles);
    return (
      <span className={cls}>
        <MeldTile layout={layout} colSide={colSide} back />
        <MeldTile layout={layout} colSide={colSide} tile={view.tiles[s[1] ?? -1]} />
        <MeldTile layout={layout} colSide={colSide} tile={view.tiles[s[2] ?? -1]} />
        <MeldTile layout={layout} colSide={colSide} back />
      </span>
    );
  }

  const others = sortTileIds(
    meld.tileIds.filter((id) => id !== meld.calledTileId),
    view.tiles,
  );

  if (meld.kind === "kan_added" && layout === "row" && meld.calledTileId !== undefined) {
    const stackExtra = others[0];
    const upright = others.slice(1);
    const pos = rel === 3 ? 0 : rel === 2 ? 1 : upright.length;
    const items: JSX.Element[] = [];
    upright.forEach((id, idx) => {
      if (idx === pos) {
        items.push(
          <MeldStack key="stack" view={view} a={meld.calledTileId!} b={stackExtra} />,
        );
      }
      items.push(<MeldTile key={id} layout="row" tile={view.tiles[id]} />);
    });
    if (pos >= upright.length) {
      items.push(<MeldStack key="stack" view={view} a={meld.calledTileId!} b={stackExtra} />);
    }
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
          called
        />,
      );
    }
    items.push(<MeldTile key={id} layout={layout} colSide={colSide} tile={view.tiles[id]} />);
  });
  if (hasCalled && pos >= others.length) {
    items.push(
      <MeldTile
        key="called"
        layout={layout}
        colSide={colSide}
        tile={view.tiles[meld.calledTileId!]}
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
}: {
  tile?: PublicTileView | undefined;
  layout: "row" | "col";
  colSide?: "left" | "right" | undefined;
  called?: boolean;
  back?: boolean;
}): JSX.Element {
  const highlight = useContext(HighlightContext);
  const lying = layout === "row" ? called === true : called !== true;
  const match = back !== true && kindMatches(tile, highlight);
  const cls =
    layout === "row"
      ? lying
        ? "mtile mtile-row-lying"
        : "mtile mtile-row"
      : lying
        ? `mtile mtile-col-lying mtile-${colSide ?? "left"}`
        : "mtile mtile-col";
  return (
    <span className={`${cls}${match ? " tile-hl" : ""}`}>
      <span className="mtile-inner">
        {back === true ? <span className="tile-back-face" /> : <TileImg tile={tile} size="fill" />}
      </span>
    </span>
  );
}

function MeldStack({ view, a, b }: { view: PlayerView; a: number; b?: number | undefined }): JSX.Element {
  return (
    <span className="mtile mtile-stack">
      <span className="mtile-inner stack-a">
        <TileImg tile={view.tiles[a]} size="fill" />
      </span>
      {b !== undefined ? (
        <span className="mtile-inner stack-b">
          <TileImg tile={view.tiles[b]} size="fill" />
        </span>
      ) : null}
    </span>
  );
}

// ─────────────────────────── 내 영역 ───────────────────────────

function OwnArea(props: {
  view: PlayerView;
  me: PlayerInfo;
  prompt: PromptMessage["prompt"] | null;
  promptSeq: number;
  riichiMode: boolean;
  catalog: Record<string, AugmentCatalogEntry>;
  autoSort: boolean;
  showMyWaits: boolean;
  onRiichiMode: (v: boolean) => void;
  onSubmit: (o: ActionOption) => void;
  onHoverKind: (k: TileKind | null) => void;
}): JSX.Element {
  const { view, me, prompt, autoSort } = props;
  // 관전 모드에서는 하단 시점 플레이어(me)의 손패를 그대로 보여준다
  const isSpectator = view.playerId === SPECTATOR_ID;
  const rawHand = view.zones[`hand:${me.id}`]?.tileIds ?? [];
  const myMelds = view.round.byPlayer[me.id]?.melds ?? [];
  const myMeldCount = view.round.byPlayer[me.id]?.meldCount ?? 0;
  const myPrompt = prompt !== null && prompt.player === view.playerId ? prompt : null;
  const isMyTurn = view.round.turnSeat === me.seat;
  const riichiDeclared = !isSpectator && view.round.byPlayer[me.id]?.riichiDeclared === true;

  const drawnId = view.round.myDrawnTile;
  const hasDrawn = drawnId !== null && rawHand.includes(drawnId);

  // 수동 정렬용 순서 (자동정렬 OFF일 때만 사용).
  // 패 id는 게임 내내 0~135로 고정 재사용되므로 국이 바뀌어도 자동 초기화되지 않는다 →
  // 국이 바뀌면(roundKey 변경) 지난 국의 정렬이 새 손패로 새어 들어가지 않게 직접 비운다.
  const [manualOrder, setManualOrder] = useState<number[]>([]);
  const roundKeyStr = `${view.round.prevalentWind}-${view.round.roundNumber}-${view.round.honba}`;
  useEffect(() => {
    setManualOrder([]);
  }, [roundKeyStr]);
  const dragId = useRef<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  // 드래그 중인 손패 id (바닥 버리기 드롭존 표시용) + 드롭존 위 hover 여부
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState(false);

  const displayIds = useMemo(() => {
    if (autoSort) {
      const base = hasDrawn ? rawHand.filter((id) => id !== drawnId) : rawHand;
      const sorted = sortTileIds(base, view.tiles);
      return hasDrawn && drawnId !== null ? [...sorted, drawnId] : sorted;
    }
    // 수동 정렬: 기존 순서 유지, 새로 들어온 패(쯔모 등)는 정렬해 뒤에 붙인다
    const inHand = new Set(rawHand);
    const kept = manualOrder.filter((id) => inHand.has(id));
    const keptSet = new Set(kept);
    const added = sortTileIds(rawHand.filter((id) => !keptSet.has(id)), view.tiles);
    return [...kept, ...added];
  }, [autoSort, rawHand, manualOrder, drawnId, hasDrawn, view.tiles]);

  const optionsByTile = useMemo(() => {
    const map = new Map<number, ActionOption[]>();
    for (const o of myPrompt?.options ?? []) {
      const t = (o.payload as { tileId?: unknown })?.tileId;
      if (typeof t === "number") map.set(t, [...(map.get(t) ?? []), o]);
    }
    return map;
  }, [myPrompt]);

  // 이 패를 버렸을 때의 화료패(대기) — 텐파이면 hover 시 미리 보여준다 (클라 계산)
  const hoverWaits = useMemo<TileKind[]>(() => {
    if (hoverId === null) return [];
    const kinds = rawHand
      .filter((id) => id !== hoverId)
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    if (kinds.length === 0) return [];
    try {
      return winningKinds(kinds, myMeldCount);
    } catch {
      return [];
    }
  }, [hoverId, rawHand, view.tiles, myMeldCount]);

  // hover 중인 패 종류를 상위로 올려 공개패(버림·부로) 강조에 사용
  useEffect(() => {
    props.onHoverKind(hoverId !== null ? (view.tiles[hoverId]?.kind ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverId]);

  // "내 오름패 표시" 설정 — 텐파이(13장 대기 상태)면 손패 위에 화료패를 항상 띄운다.
  // 내 차례(쯔모패 포함 14장)에서는 hover 미리보기가 담당하므로 대기 상태일 때만 계산한다.
  const myWaits = useMemo<TileKind[]>(() => {
    if (!props.showMyWaits || isSpectator) return [];
    const kinds = rawHand
      .map((id) => view.tiles[id]?.kind)
      .filter((k): k is TileKind => k !== undefined);
    if (kinds.length % 3 !== 1) return [];
    try {
      return winningKinds(kinds, myMeldCount);
    } catch {
      return [];
    }
  }, [props.showMyWaits, isSpectator, rawHand, view.tiles, myMeldCount]);

  /** 드롭한 타일의 좌/우 절반에 따라 대상 앞/뒤로 삽입 — 커서 위치에 정확히 놓인다. */
  function reorderTo(targetId: number, e: React.DragEvent): void {
    const from = dragId.current;
    if (from === null || from === targetId) return;
    const arr = displayIds.filter((x) => x !== from);
    let idx = arr.indexOf(targetId);
    if (idx < 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX > r.left + r.width / 2) idx += 1; // 오른쪽 절반에 놓으면 대상 뒤로
    arr.splice(idx, 0, from);
    setManualOrder(arr);
  }

  /** 이 패를 (드래그·클릭으로) 지금 낼 수 있는 옵션 — 클릭 동작과 동일 규칙. */
  function discardOptionFor(id: number | null): ActionOption | undefined {
    if (id === null) return undefined;
    const opts = optionsByTile.get(id) ?? [];
    return props.riichiMode
      ? opts.find((o) => o.type === "riichi")
      : (opts.find((o) => o.type === "discard") ?? opts.find((o) => o.type === "free_discard"));
  }

  function endDrag(): void {
    dragId.current = null;
    setDragging(null);
    setDropOver(false);
  }

  /** 바닥(드롭존)에 놓아 버리기 — 드래그하던 패를 낸 것으로 처리. */
  function dropToDiscard(): void {
    const opt = discardOptionFor(dragId.current);
    endDrag();
    if (opt !== undefined) props.onSubmit(opt);
  }

  // 드래그 중인 패를 지금 낼 수 있으면 바닥 드롭존을 띄운다
  const canDropDiscard = discardOptionFor(dragging) !== undefined;

  // 진짜 용(17장) 등 넓은 손패도 화면 안에 들어오게 타일 폭을 조인다
  const handStyle =
    displayIds.length > 15
      ? ({ "--hand-w": "clamp(30px, 5vw, 52px)" } as React.CSSProperties)
      : undefined;

  return (
    <>
      {canDropDiscard ? (
        <div
          className={`discard-dropzone${dropOver ? " discard-dropzone-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dropOver) setDropOver(true);
          }}
          onDragLeave={() => setDropOver(false)}
          onDrop={dropToDiscard}
        >
          <span className="discard-dropzone-label">🀫 여기에 놓아 버리기</span>
        </div>
      ) : null}
      <div className="own-area">
        <div className="own-top">
          <NamePlate view={view} player={me} catalog={props.catalog} tipUp />
          {myWaits.length > 0 ? <WaitsBadge waits={myWaits} mine /> : null}
          {!isSpectator ? (
            <ActiveAugmentControl
              view={view}
              me={me}
              prompt={prompt}
              catalog={props.catalog}
              onSubmit={props.onSubmit}
            />
          ) : null}
        </div>
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
            <div className="prompt-timer" key={props.promptSeq}>
              <div className="prompt-timer-fill" />
            </div>
          </>
        ) : null}
        <div
          key={roundKeyStr}
          className={`own-hand${isMyTurn ? " own-hand-turn" : ""}`}
          {...(handStyle !== undefined ? { style: handStyle } : {})}
        >
          {displayIds.map((id) => {
            const opts = optionsByTile.get(id) ?? [];
            const discard = opts.find((o) => o.type === "discard");
            const riichi = opts.find((o) => o.type === "riichi");
            const freeDiscard = opts.find((o) => o.type === "free_discard");
            const active = props.riichiMode ? riichi : (discard ?? freeDiscard);
            const clickable = active !== undefined && (!props.riichiMode || riichi !== undefined);
            // 리치 선언 후 버릴 수 없는(옵션 없는) 패 + 리치 모드에서 리치 불가 패를 어둡게
            const noDiscard = discard === undefined && freeDiscard === undefined;
            const dimmed =
              (props.riichiMode && riichi === undefined) ||
              (riichiDeclared && !props.riichiMode && noDiscard);
            const isDrawn = hasDrawn && id === drawnId;
            // 텐파이면 이 패를 버렸을 때의 대기패를 hover 시 표시 (리치 모드 아니어도)
            const showWaits = hoverId === id && hoverWaits.length > 0;
            return (
              <button
                key={id}
                className={`hand-tile${clickable ? " hand-clickable" : " hand-locked"}${
                  dimmed ? " hand-dimmed" : ""
                }${props.riichiMode && riichi !== undefined ? " hand-riichi" : ""}${
                  isDrawn ? " hand-drawn" : ""
                }${freeDiscard !== undefined && discard === undefined ? " hand-free" : ""}${
                  dragging === id ? " hand-dragging" : ""
                }`}
                draggable={!isSpectator}
                onDragStart={
                  !isSpectator
                    ? (e) => {
                        dragId.current = id;
                        setDragging(id);
                        e.dataTransfer.effectAllowed = "move";
                        // Firefox는 데이터가 있어야 드래그가 시작된다
                        e.dataTransfer.setData("text/plain", String(id));
                        // 드래그 이미지를 타일 면만으로 — hover 들림·툴팁 없이 커서에 붙어 따라온다
                        const face = (e.currentTarget as HTMLElement).querySelector(".tile-face");
                        if (face instanceof HTMLElement) {
                          e.dataTransfer.setDragImage(face, face.offsetWidth / 2, face.offsetHeight / 2);
                        }
                      }
                    : undefined
                }
                onDragEnd={!isSpectator ? endDrag : undefined}
                onDragOver={!autoSort ? (e) => e.preventDefault() : undefined}
                onDrop={!autoSort ? (e) => reorderTo(id, e) : undefined}
                onMouseEnter={() => setHoverId(id)}
                onMouseLeave={() => setHoverId((cur) => (cur === id ? null : cur))}
                onClick={() => (clickable && active !== undefined ? props.onSubmit(active) : undefined)}
              >
                <TileImg tile={view.tiles[id]} size="hand" />
                {showWaits ? <WaitTip waits={hoverWaits} /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {myMelds.length > 0 ? (
        <div className="own-corner-right">
          {myMelds.map((m, i) => (
            <MeldGroup key={i} view={view} meld={m} owner={me} layout="row" />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * 상시 표시용 오름패 뱃지 — 선언 간파(상대 위)와 내 오름패(손패 위)에 공용.
 * WaitTip과 달리 hover 없이 계속 떠 있는다.
 */
function WaitsBadge({ waits, owner, mine }: { waits: TileKind[]; owner?: string; mine?: boolean }): JSX.Element {
  return (
    <div className={`waits-badge${mine === true ? " waits-badge-mine" : ""}`}>
      <span className="waits-badge-label">
        {mine === true ? "내 오름패" : "간파"}
        {owner !== undefined && mine !== true ? <span className="waits-badge-owner">{owner}</span> : null}
      </span>
      <span className="waits-badge-tiles">
        {waits.map((k) => (
          <TileImg key={`${k.suit}${k.rank}`} tile={{ kind: k }} size="mini" />
        ))}
      </span>
    </div>
  );
}

/** 리치 대기패(화료패) 미리보기 툴팁. */
function WaitTip({ waits }: { waits: TileKind[] }): JSX.Element {
  return (
    <span className="wait-tip">
      <span className="wait-tip-label">{waits.length > 0 ? "대기" : "형식 텐파이"}</span>
      {waits.length > 0 ? (
        <span className="wait-tip-tiles">
          {waits.map((k) => (
            <TileImg key={`${k.suit}${k.rank}`} tile={{ kind: k }} size="mini" />
          ))}
        </span>
      ) : null}
    </span>
  );
}

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
  onSubmit: (o: ActionOption) => void;
}): JSX.Element | null {
  const { view, me, prompt } = props;
  const [open, setOpen] = useState(false);
  const hasActive = me.augments.some((a) => ACTIVE_AUGMENT_IDS.has(a));
  const myPrompt = prompt !== null && prompt.player === view.playerId ? prompt : null;
  const augOptions = (myPrompt?.options ?? []).filter((o) => AUGMENT_ACTION_TYPES.has(o.type));
  if (!hasActive && augOptions.length === 0) return null;

  const usable = augOptions.length > 0;
  const activeNames = me.augments
    .filter((a) => ACTIVE_AUGMENT_IDS.has(a))
    .map((a) => props.catalog[a]?.name ?? a);

  const click = (): void => {
    if (!usable) return;
    if (augOptions.length === 1) {
      props.onSubmit(augOptions[0]!);
      setOpen(false);
    } else {
      setOpen((v) => !v);
    }
  };

  // 옵션이 어느 증강에서 왔는지 이름을 붙인다 — 여러 액티브 증강을 보유했을 때
  // 메뉴에서 원하는 증강을 골라 발동할 수 있게 한다.
  const augNameFor = (o: ActionOption): string => {
    const augId = ACTION_AUGMENT[o.type];
    return (augId ? props.catalog[augId]?.name : undefined) ?? ACTION_LABEL[o.type] ?? o.type;
  };

  return (
    <div className="own-aug">
      {open && usable && augOptions.length > 1 ? (
        <div className="aug-menu">
          <div className="aug-menu-head">사용할 증강 선택</div>
          {augOptions.map((o, i) => {
            const target = (o.payload as { target?: unknown })?.target;
            const index = (o.payload as { index?: unknown })?.index;
            return (
              <button
                key={`${o.type}-${i}`}
                className="aug-menu-item"
                onClick={() => {
                  props.onSubmit(o);
                  setOpen(false);
                }}
              >
                <strong className="aug-menu-name">{augNameFor(o)}</strong>
                <span className="act-target">
                  {ACTION_LABEL[o.type] ?? o.type}
                  {typeof target === "string" ? ` → ${target}` : ""}
                  {typeof index === "number" ? ` #${index + 1}` : ""}
                </span>
                <ActionTiles view={view} option={o} />
              </button>
            );
          })}
        </div>
      ) : null}
      <button
        className={`aug-btn${usable ? " aug-btn-on" : ""}`}
        disabled={!usable}
        title={
          usable
            ? augOptions.length > 1
              ? "액티브 증강 선택"
              : `${augNameFor(augOptions[0]!)} 사용`
            : `지금은 사용할 수 없습니다 — ${activeNames.join(", ")}`
        }
        onClick={click}
      >
        ✦ 액티브 증강{usable ? ` (${augOptions.length})` : ""}
      </button>
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
  const hasRiichi = prompt.options.some((o) => o.type === "riichi");
  const isMyTurn = view.round.phase === "turn.act";
  // 타일 클릭으로 처리되는 액션과 액티브 증강(전용 버튼)은 액션 바에서 제외
  const buttons = prompt.options.filter(
    (o) =>
      o.type !== "discard" &&
      o.type !== "riichi" &&
      o.type !== "free_discard" &&
      !AUGMENT_ACTION_TYPES.has(o.type),
  );
  if (buttons.length === 0 && !hasRiichi) return null;

  return (
    <div className="action-bar">
      {props.riichiMode ? (
        <>
          <span className="action-hint">리치할 패를 선택하세요</span>
          <button className="act act-cancel" onClick={() => props.onRiichiMode(false)}>
            취소
          </button>
        </>
      ) : (
        <>
          {hasRiichi ? (
            <button className="act act-riichi" onClick={() => props.onRiichiMode(true)}>
              리치
            </button>
          ) : null}
          {buttons.map((o, i) => {
            const label =
              o.type === "win" ? (isMyTurn ? "쯔모" : "론") : (ACTION_LABEL[o.type] ?? props.catalog[o.type]?.name ?? o.type);
            const tone =
              o.type === "win"
                ? "act-win"
                : o.type === "pass"
                  ? "act-pass"
                  : ACTION_LABEL[o.type] === undefined || ["recall", "peek_waits", "swap3", "hand_swap", "red_touch", "future_exchange", "gamble_start", "take_rinshan", "claim_dealer", "seat_swap"].includes(o.type)
                    ? "act-aug"
                    : "act-call";
            const target = (o.payload as { target?: unknown })?.target;
            const index = (o.payload as { index?: unknown })?.index;
            return (
              <button key={`${o.type}-${i}`} className={`act ${tone}`} onClick={() => props.onSubmit(o)}>
                {label}
                {typeof target === "string" ? <span className="act-target">→ {target}</span> : null}
                {typeof index === "number" ? <span className="act-target">#{index + 1}</span> : null}
                <ActionTiles view={view} option={o} />
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

function ActionTiles({ view, option }: { view: PlayerView; option: ActionOption }): JSX.Element | null {
  const payload = option.payload as { tileIds?: unknown };
  if (!Array.isArray(payload?.tileIds)) return null;
  return (
    <span className="act-tiles">
      {(payload.tileIds as number[]).slice(0, 4).map((id) => (
        <TileImg key={id} tile={view.tiles[id]} size="mini" />
      ))}
    </span>
  );
}

// ─────────────────────────── 국 결과 화면 ───────────────────────────

function RoundResultPanel({
  result,
  view,
  onClose,
}: {
  result: RoundOverMessage;
  view: PlayerView;
  onClose: () => void;
}): JSX.Element {
  const { settle } = result;
  const infos = settle.winInfos ?? [];
  const nameOf = (id: string): string => playerNameById(view, id);

  // 결과 화면은 최대 5초 노출 후 자동으로 닫힌다. 타이머는 이 결과(result)마다
  // 한 번만 걸고, 부모 리렌더로 onClose 참조가 바뀌어도 리셋되지 않게 ref로 읽는다.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const t = window.setTimeout(() => onCloseRef.current(), 5000);
    return () => window.clearTimeout(t);
  }, [result]);

  return (
    <div className="overlay result-overlay">
      <div className="result-panel">
        <h2 className="result-title">
          {result.outcome === "win" ? "화 료" : result.outcome === "draw" ? "유 국" : "도중 유국"}
        </h2>

        {infos.map((w) => (
          <div key={w.winner} className="result-win">
            <div className="result-winner-row">
              <span className="result-winner">{nameOf(w.winner)}</span>
              <span className={`result-wintype ${w.winType === "tsumo" ? "wt-tsumo" : "wt-ron"}`}>
                {w.winType === "tsumo" ? "쯔모" : "론"}
              </span>
              {w.from !== null ? <span className="result-from">← {nameOf(w.from)}</span> : null}
            </div>

            {result.revealedHands[w.winner] !== undefined ? (
              <div className="result-hand">
                {sortTileViews(result.revealedHands[w.winner]!.hand).map((t) => (
                  <span
                    key={t.id}
                    className={`result-tile${t.id === w.winningTileId ? " result-tile-win" : ""}`}
                  >
                    <TileImg tile={t} size="result" />
                  </span>
                ))}
                {result.revealedHands[w.winner]!.melds.map((m, i) => (
                  <span key={`m${i}`} className="result-meld">
                    {m.tiles.map((t) => (
                      <TileImg key={t.id} tile={t} size="result" />
                    ))}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="result-yaku-list">
              {w.yaku.map((y) => (
                <div key={y.id} className="result-yaku">
                  <span>{YAKU_NAMES[y.id] ?? y.name}</span>
                  <span className="result-han">{w.yakumanCount > 0 ? "역만" : `${y.han}판`}</span>
                </div>
              ))}
              {w.doraHan > 0 ? (
                <div className="result-yaku"><span>도라</span><span className="result-han">{w.doraHan}판</span></div>
              ) : null}
              {w.uraHan > 0 ? (
                <div className="result-yaku"><span>우라도라</span><span className="result-han">{w.uraHan}판</span></div>
              ) : null}
              {w.redHan > 0 ? (
                <div className="result-yaku"><span>적도라</span><span className="result-han">{w.redHan}판</span></div>
              ) : null}
              {w.extraHan > 0 ? (
                <div className="result-yaku result-yaku-aug"><span>증강 보너스</span><span className="result-han">{w.extraHan}판</span></div>
              ) : null}
            </div>

            <div className="result-total">
              {w.yakumanCount > 0
                ? `${w.yakumanCount >= 2 ? `${w.yakumanCount}배 ` : ""}역만`
                : `${w.han}판 ${w.fu}부`}
              {w.limit !== null && w.yakumanCount === 0 ? (
                <span className="result-limit"> · {LIMIT_NAMES[w.limit] ?? w.limit}</span>
              ) : null}
              <span className="result-points">{w.points.toLocaleString()}점</span>
            </div>
          </div>
        ))}

        {result.uraDoraIndicators.length > 0 ? (
          <div className="result-ura">
            <span className="result-ura-label">우라도라</span>
            {result.uraDoraIndicators.map((id) => (
              <TileImg key={id} tile={result.tiles[id]} size="mini" />
            ))}
          </div>
        ) : null}

        <div className="result-deltas">
          {view.players.map((p) => {
            const d = settle.deltas[p.id] ?? 0;
            return (
              <div key={p.id} className="result-delta-row">
                <span>{nameOf(p.id)}</span>
                <span className={d > 0 ? "delta-plus" : d < 0 ? "delta-minus" : "delta-zero"}>
                  {d > 0 ? "+" : ""}
                  {d.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        <button className="lobby-join result-close" onClick={onClose}>
          닫기 (다음 국)
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── 드래프트 오버레이 ───────────────────────────

function DraftOverlay({
  draft,
  onPick,
}: {
  draft: DraftOfferMessage;
  onPick: (id: string) => void;
}): JSX.Element {
  return (
    <div className="overlay">
      <div className="draft-panel">
        <h2 className="draft-title">증강 선택</h2>
        <p className="draft-stage">
          {draft.stage === "gameStart" ? "대국 개시 — 첫 번째 증강" : "남장 돌입 — 두 번째 증강"}
        </p>
        <div className="draft-cards">
          {draft.choices.map((c, i) => (
            <button
              key={c.id}
              className={`draft-card tier-${c.tier}`}
              style={{ animationDelay: `${i * 120}ms` }}
              onClick={() => onPick(c.id)}
            >
              <span className="draft-card-head">
                <span className="draft-head-left">
                  <span className={`draft-cat aug-cat-${augmentCategory(c.id)}`}>
                    {CATEGORY_META[augmentCategory(c.id)].icon} {CATEGORY_META[augmentCategory(c.id)].label}
                  </span>
                  {isActiveAugment(c.id) ? <ActiveBadge /> : null}
                </span>
                <span className="draft-tier">{c.tier.toUpperCase()}</span>
              </span>
              <strong className="draft-name">{c.name}</strong>
              <span className="draft-desc">{c.description}</span>
              {isActiveAugment(c.id) ? (
                <span className="draft-active-note">⚡ 액티브 증강 — 내 턴에 직접 발동</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 게임 종료 ───────────────────────────

function GameOverModal({
  rankings,
  stats,
  onClose,
}: {
  rankings: RankingEntry[];
  stats: StatsMessage | null;
  onClose: () => void;
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
                </span>
                <span className="rank-raw">{r.rawScore.toLocaleString()}점</span>
                <span className="rank-final">
                  {r.score >= 0 ? "+" : ""}
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
                  <StatsGrid s={e.stats} />
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

        <button className="lobby-join" onClick={onClose}>
          로비로
        </button>
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

function ReplayViewer(props: {
  data: ReplayDataMessage;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onClose: () => void;
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const replay = useMemo<RebuiltReplay | null>(() => {
    try {
      return rebuildReplay(props.data.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [props.data]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const total = replay !== null ? replay.states.length - 1 : 0;

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
    () => (replay !== null ? replayViewAt(replay, idx) : null),
    [replay, idx],
  );

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
        <span className="replayer-pos">{idx} / {total}</span>
        <button
          className="rp-btn rp-speed"
          onClick={() => setSpeed((s) => (s + 1) % REPLAY_SPEEDS.length)}
          title="재생 속도"
        >
          {REPLAY_SPEEDS[speed]?.label}
        </button>
      </div>
    </div>
  );
}
