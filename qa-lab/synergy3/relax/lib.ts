/**
 * relax 축 공용 하네스 — 화료 제약 해제 · 유국 · 후로.
 * packages/** 는 읽기만 한다. 여기 있는 것은 전부 QA 측정용이다.
 */
import {
  FlowController,
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  installAugment,
  standardAugments,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";

export { craft };
export const SYS = "__system" as PlayerId;
const STD_IDS = new Set(standardAugments.map((d) => d.id));
export const stdAug = (id: string): AugmentDef => {
  const d = standardAugments.find((a) => a.id === id);
  if (d === undefined) throw new Error(`no std augment ${id}`);
  return d;
};

export type Game = ReturnType<typeof createStandardGameFromState>;

export function withAugs(
  state: GameState,
  player: PlayerId,
  ids: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** 증강 def 목록을 같은 좌석에 심고 게임을 세운다 */
export function start(
  state: GameState,
  defs: AugmentDef[],
  holder: PlayerId = "p0" as PlayerId,
): Game {
  const s = withAugs(structuredClone(state), holder, defs.map((d) => d.id));
  // 표준 증강(iron_wall 등)은 카탈로그에 이미 들어 있다 — 다시 넣으면 중복 에러
  const extra = defs.filter((d) => !STD_IDS.has(d.id));
  const g = createStandardGameFromState(s, undefined, extra);
  for (const d of defs) {
    installAugment(g.engine, d, holder, { yaku: g.yaku, catalog: g.augments });
  }
  return g;
}

/** 좌석별로 다른 증강을 심는다 */
export function startMulti(
  state: GameState,
  spec: { def: AugmentDef; holder: PlayerId }[],
): Game {
  let s = structuredClone(state);
  for (const { def, holder } of spec) s = withAugs(s, holder, [def.id]);
  const g = createStandardGameFromState(
    s,
    undefined,
    spec.map((x) => x.def).filter((d) => !STD_IDS.has(d.id)),
  );
  for (const { def, holder } of spec) {
    installAugment(g.engine, def, holder, { yaku: g.yaku, catalog: g.augments });
  }
  return g;
}

export function lastSettled(game: Game): RoundSettledPayload | null {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  return null;
}

/** turn.act 에서 player 의 화료(쯔모/론) 옵션을 찾아 제출한다 */
export function declareWin(game: Game, player: PlayerId): string | null {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") return `not awaiting: ${status.kind}`;
  const prompt = status.prompts.find((p) => p.player === player);
  const win = prompt?.options.find((o) => o.type === "win");
  if (win === undefined) {
    return `no win option (options=${JSON.stringify(
      (prompt?.options ?? []).map((o) => o.type),
    )})`;
  }
  let st = flow.submit(player, win);
  // 남은 좌석(퐁·론 후보)은 전부 패스시켜 정산까지 흘린다
  for (let i = 0; i < 12 && st.kind === "awaiting"; i++) {
    const pr = st.prompts[0];
    if (pr === undefined) break;
    const pass = pr.options.find((o) => o.type === "pass") ?? pr.options[0];
    if (pass === undefined) break;
    st = flow.submit(pr.player, pass);
  }
  return null;
}

/** 패산을 비운 상태를 만든다 (게임 생성 **전에** 쓴다) */
export function emptyWall(s: GameState): GameState {
  return {
    ...s,
    zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } },
    round: { ...s.round, phase: "turn.draw" },
  };
}

/** sys.settleDraw 로 진짜 황패유국 정산을 돌린다 (패산이 비어 있어야 한다) */
export function settleDraw(game: Game): RoundSettledPayload | null {
  const r = game.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
  if (!r.ok) throw new Error(`settleDraw rejected: ${JSON.stringify(r)}`);
  // 정산 이벤트가 통째로 대체됐을 수 있다 (모래시계) → null
  return lastSettled(game);
}

export interface WinReport {
  err: string | null;
  deltas: Record<string, number>;
  han: number;
  fu: number;
  points: number;
  yakumanCount: number;
  yaku: string[];
  extraHan?: number;
  augPoints: { augId: string; player: string; points: number; han?: number }[];
}

export function winReport(game: Game, player: PlayerId): WinReport {
  const err = declareWin(game, player);
  const p = lastSettled(game);
  const info = (p?.winInfos ?? []).find((w) => w.winner === player);
  return {
    err,
    deltas: (p?.deltas ?? {}) as Record<string, number>,
    han: info?.han ?? 0,
    fu: info?.fu ?? 0,
    points: info?.points ?? 0,
    yakumanCount: info?.yakumanCount ?? 0,
    yaku: (info?.yaku ?? []).map((y) => `${y.id}(${y.han ?? "*"})`),
    ...(info !== undefined && "extraHan" in info
      ? { extraHan: (info as { extraHan?: number }).extraHan }
      : {}),
    augPoints: (p?.augPoints ?? []) as WinReport["augPoints"],
  };
}

/** 대조군 4칸 표 출력 */
export function table(
  title: string,
  rows: { label: string; value: unknown }[],
): void {
  console.log(`\n=== ${title}`);
  for (const r of rows) {
    console.log(
      `  ${r.label.padEnd(28)} ${
        typeof r.value === "object" ? JSON.stringify(r.value) : String(r.value)
      }`,
    );
  }
}
