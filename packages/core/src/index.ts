export { RuleRegistry, RuleLayer } from "./engine/rules/RuleRegistry.js";
export type { RuleKey, RuleContext, RuleModifier } from "./engine/rules/RuleRegistry.js";

export { Prng } from "./engine/random/Prng.js";

export type { GameEvent, ProposedEvent } from "./engine/events/GameEvent.js";

export {
  GameEngine,
  DISARMED_SOURCES_KEY,
  isSourceDisarmed,
} from "./engine/GameEngine.js";
export type {
  EngineOptions,
  SubmitResult,
  ActionCandidate,
  TurnOptionProvider,
} from "./engine/GameEngine.js";

export { ActionRegistry } from "./engine/actions/ActionRegistry.js";
export type { ActionDef, ActionRequest, ActionContext } from "./engine/actions/ActionRegistry.js";

export { ReducerRegistry, identityReducer } from "./engine/reducers/ReducerRegistry.js";
export type { EventReducer } from "./engine/reducers/ReducerRegistry.js";

export { TILES_MOVED, tilesMoved, tilesMovedReducer } from "./engine/events/TilesMoved.js";
export type { TilesMovedPayload } from "./engine/events/TilesMoved.js";

export { EffectRegistry } from "./engine/effects/EffectRegistry.js";
export type {
  EffectDef,
  EffectContext,
  ReactionContext,
  Interceptor,
  Reaction,
} from "./engine/effects/EffectRegistry.js";

export {
  EventProcessor,
  DEFAULT_MAX_CHAIN_DEPTH,
  DEFAULT_MAX_EVENTS_PER_ROOT,
} from "./engine/effects/EventProcessor.js";
export type {
  ProcessorOptions,
  ProcessResult,
  CanceledEvent,
  EffectFailure,
  Reducer,
} from "./engine/effects/EventProcessor.js";

export {
  Suits,
  buildStandardTileSet,
  standardKinds,
  isNumberSuit,
  isHonor,
  isTerminal,
  isTerminalOrHonor,
  sameKind,
  kindKey,
} from "./mahjong/tiles/Tile.js";

export {
  decompose,
  isWinningShape,
  ORPHAN_KINDS,
  DEFAULT_SEQUENCE_SUITS,
  honorMaxRank,
  isHonorRun,
} from "./mahjong/scoring/decompose.js";
export type { Decomposition, DecompSet, DecomposeOptions } from "./mahjong/scoring/decompose.js";
export { winningKinds, isTenpai } from "./mahjong/scoring/waits.js";
export { shantenOf, ukeireOf } from "./mahjong/scoring/shanten.js";
export type { Ukeire } from "./mahjong/scoring/shanten.js";
export { buildVariants, allKinds } from "./mahjong/scoring/WinContext.js";
export type {
  WinContext,
  MeldInfo,
  ScoringVariant,
  ScoringSet,
  WaitType,
} from "./mahjong/scoring/WinContext.js";
export { YakuRegistry } from "./mahjong/scoring/YakuRegistry.js";
export type { YakuDef } from "./mahjong/scoring/YakuRegistry.js";
export { registerStandardYaku, standardYakuList } from "./mahjong/scoring/standardYaku.js";
export { calculateFu } from "./mahjong/scoring/fu.js";
export { calculateScore } from "./mahjong/scoring/score.js";
export type { ScoreArgs, ScoreResult, LimitName } from "./mahjong/scoring/score.js";
export { doraKindFor, frontDoraKindFor, countDora } from "./mahjong/scoring/dora.js";
export { evaluateWin } from "./mahjong/scoring/evaluate.js";
export type { WinEvaluation, YakuResult } from "./mahjong/scoring/evaluate.js";

export {
  SYSTEM_PLAYER,
  buildWinContext,
  isFuriten,
  sealedDiscardIds,
  seatWindOf,
  nextSeat,
  playerOf,
  playerAtSeat,
  kindOf,
  handIdsOf,
  handKindsOf,
  winHandIdsOf,
  winHandKindsOf,
  meldInfosOf,
  meldCountOf,
  openMeldCountOf,
  scoringOptionsOf,
  uraIndicatorIds,
} from "./mahjong/flow/helpers.js";
export type { BuildWinContextOptions } from "./mahjong/flow/helpers.js";
export {
  ROUND_STARTED,
  TILE_DRAWN,
  TILE_DISCARDED,
  CALL_MADE,
  KAN_DECLARED,
  DORA_FLIPPED,
  FURITEN_MARKED,
  TURN_PASSED,
  WIN_DECLARED,
  ROUND_SETTLED,
  registerFlowReducers,
} from "./mahjong/flow/flowEvents.js";
export type {
  TileDrawnPayload,
  TurnPassedPayload,
  TileDiscardedPayload,
  CallMadePayload,
  KanDeclaredPayload,
  DoraFlippedPayload,
  FuritenMarkedPayload,
  WinDeclaredPayload,
  RoundSettledPayload,
  AbortReason,
  AugPointNote,
  WinInfo,
} from "./mahjong/flow/flowEvents.js";
export {
  defineStandardFlowRules,
  registerStandardActions,
} from "./mahjong/flow/standardActions.js";
export { FlowController, reactionPriority } from "./mahjong/flow/FlowController.js";
export type {
  ActionOption,
  DecisionPrompt,
  FlowStatus,
} from "./mahjong/flow/FlowController.js";
export {
  createStandardGame,
  createStandardGameFromState,
} from "./mahjong/flow/standardGame.js";
export type { StandardGame, StandardGameOptions } from "./mahjong/flow/standardGame.js";

export {
  defineAugment,
  installAugment,
  uninstallAugment,
  augmentInstanceId,
  TIER_LAYER,
  AUGMENT_CATEGORIES,
  BOT_WEIGHT,
  botChosenOption,
} from "./augment/Augment.js";
export type {
  AugmentDef,
  AugmentTier,
  EffectOptions,
  AugmentCategory,
  AugmentContext,
  AugmentExtras,
  AugmentBotPolicy,
  BotDecisionContext,
  BotAugmentOption,
  BotAugmentChoice,
  BotRng,
} from "./augment/Augment.js";
export { AugmentRegistry } from "./augment/AugmentRegistry.js";
export { SETTLE_LAYER, SETTLE_STAGE } from "./augment/settleStages.js";
export type { SettleStage } from "./augment/settleStages.js";
export {
  SCORE_CHANGED,
  AUGMENT_DRAFTED,
  AUGMENT_DATA_SET,
  AUGMENT_DISARMED,
  TILE_KIND_CHANGED,
  scoreChanged,
  augmentDataSet,
  augmentDisarmed,
  tileKindChanged,
  registerAugmentSupport,
  draftDoneKey,
  augmentStageKey,
  augmentGrantKey,
} from "./augment/events.js";
export type {
  ScoreChangedPayload,
  AugmentDraftedPayload,
  AugmentDataSetPayload,
  AugmentDisarmedPayload,
  TileKindChangedPayload,
} from "./augment/events.js";
export { DraftController, rebuildAugments } from "./augment/DraftController.js";
export type { DraftStage } from "./augment/DraftController.js";
export { standardAugments, discardRecall } from "./augment/standardAugments.js";
export {
  ADJUST_EVERY_GAMES,
  ADJUST_FRACTION,
  MAX_HALF_STEPS,
  MIN_SAMPLE,
  adjustedWeight,
  computeAdjustment,
  weightForOffset,
  weightsFromOffsets,
} from "./augment/tierAdjust.js";
export type { AugmentRecord, TierOffsets } from "./augment/tierAdjust.js";
export {
  AUGMENT_POWER_TIERS,
  POWER_TIER_ORDER,
  POWER_TIER_WEIGHT,
  POWER_TIER_LABEL,
  TIER_CUTS,
  powerScore,
  defaultBotWeight,
} from "./augment/powerTier.js";
export type { PowerTier, PowerTierEntry } from "./augment/powerTier.js";
export type {
  Tile,
  TileId,
  TileKind,
  TileAttrs,
  Suit,
  StandardSuit,
  StandardSetOptions,
} from "./mahjong/tiles/Tile.js";

export {
  WALL,
  DEAD_WALL,
  handZone,
  discardsZone,
  meldsZone,
  createZone,
  moveTiles,
} from "./engine/zones/Zone.js";
export type { Zone, ZoneId, Zones, PlayerId } from "./engine/zones/Zone.js";

export {
  createInitialGameState,
  setupRound,
  DEAD_WALL_SIZE,
  INDICATOR_BLOCK_SIZE,
  FIRST_DORA_INDEX,
  HAND_START_SIZE,
  rinshanRemaining,
  doraIndicatorIndex,
  ROUND_SCOPED_MARK,
  isRoundScopedKey,
} from "./engine/state/GameState.js";
export type {
  GameState,
  GameConfig,
  GameMode,
  InitialStateOptions,
  SetupRoundOptions,
  PlayerState,
  PlayerRoundState,
  RoundState,
  RiichiState,
  Meld,
} from "./engine/state/GameState.js";

// ── Information System (09) ──
export {
  buildPlayerView,
  arrangeHandForDisplay,
  defineVisibilityRules,
  visibleTileIdsIn,
  SPECTATOR_ID,
} from "./information/PlayerView.js";
export type {
  VisibilityRule,
  PeekVisibility,
  PlayerView,
  ZoneView,
  PublicTileView,
  PlayerInfo,
  PlayerRoundView,
  MeldView,
  RoundView,
  FuritenReason,
  DiscardOrigin,
} from "./information/PlayerView.js";

// ── Player Stats (14) ──
export {
  StatsTracker,
  createEmptyStats,
  mergeStats,
  deriveStats,
} from "./stats/PlayerStats.js";
export type {
  PlayerStatsRaw,
  PlayerStatsView,
  AugmentStatRaw,
  RankInput,
} from "./stats/PlayerStats.js";

// ── Network Protocol (12·14·15) ──
export type {
  DraftStage as NetworkDraftStage,
  JoinMessage,
  ActionMessage,
  DraftPickMessage,
  PingMessage,
  HandOrderMessage,
  ReadyMessage,
  AddBotMessage,
  RemoveBotMessage,
  StartGameMessage,
  StatsRequestMessage,
  RegisterMessage,
  LoginMessage,
  TokenLoginMessage,
  LogoutMessage,
  CreateRoomMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  ReplayListRequestMessage,
  ReplayGetMessage,
  LeaderboardRequestMessage,
  AdminUsersRequestMessage,
  AdminDeleteUserMessage,
  LiveGamesRequestMessage,
  SpectateMessage,
  SpectateStopMessage,
  SandboxStartMessage,
  SandboxGrantMessage,
  SandboxResetMessage,
  SandboxViewAsMessage,
  SandboxBotRules,
  SandboxBotRulesMessage,
  SandboxControlMessage,
  ClientMessage,
  JoinedMessage,
  ViewMessage,
  PromptMessage,
  DraftOfferMessage,
  AugmentCatalogEntry,
  CatalogMessage,
  RevealedHand,
  RoundOverMessage,
  RankingEntry,
  GameOverMessage,
  AbortVoteMessage,
  GameAbortedMessage,
  ErrorMessage,
  PongMessage,
  LobbyPlayerEntry,
  LobbyMessage,
  StatsEntry,
  StatsMessage,
  LeaderboardEntry,
  LeaderboardMessage,
  AdminUserEntry,
  AdminUsersMessage,
  AugmentTierEntry,
  AdminAugmentTiersMessage,
  AuthOkMessage,
  RoomCreatedMessage,
  ReplayGameSummary,
  ReplayListMessage,
  ReplayDataMessage,
  LiveRoomSummary,
  LiveGamesMessage,
  SpectateStartedMessage,
  SpectateEndedMessage,
  SandboxMessage,
  SandboxConfigMessage,
  ActionFxMessage,
  ServerMessage,
} from "./network/protocol.js";

// ── Match (12·15) ──
export { HanchanController, DEFAULT_HANCHAN_CONFIG } from "./match/HanchanController.js";
export type {
  HanchanConfig,
  HanchanEvents,
  SpectatorSink,
} from "./match/HanchanController.js";
export type { PlayerAgent } from "./match/PlayerAgent.js";
