/**
 * endgame.ts — 반장전 종료 조건(아가리야메/텐파이야메·서입·토비)의 실전 판정.
 * 증강 없음. 남4국 상태를 직접 세우고 HanchanController.resume 으로 그 국부터 돌린다.
 */
import { HanchanController, DEFAULT_HANCHAN_CONFIG } from "@majak/core";
import type {
  ActionOption, DecisionPrompt, GameState, PlayerAgent, PlayerId, PlayerView, StandardGame,
} from "@majak/core";
import { craft, gameOf } from "./flow.js";

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = ""): void => { results.push({ name, ok, note }); };

class Agent implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  /** kindKey → 이 종류를 우선해서 버린다 */
  kindOfTile: (id: number) => string = () => "";
  constructor(readonly id: PlayerId, private readonly want: string[]) { this.nickname = id; }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    for (const w of this.want) {
      if (w.startsWith("discard:")) {
        const key = w.slice(8);
        const o = prompt.options.find(
          (x) => x.type === "discard" && this.kindOfTile((x.payload as { tileId: number }).tileId) === key);
        if (o !== undefined) return o;
        continue;
      }
      const o = prompt.options.find((x) => x.type === w);
      if (o !== undefined) return o;
    }
    const d = prompt.options.find((x) => x.type === "discard");
    return (d ?? prompt.options[0]) as ActionOption;
  }
}

interface RunRes { reason: string | null; roundsStarted: number; outcomes: string[]; scores: number[]; nextRound: string }

async function runFrom(
  st: GameState,
  wants: Record<PlayerId, string[]>,
  stopAfterRounds = 2,
  cfgPatch: Record<string, unknown> = {},
): Promise<RunRes> {
  const game: StandardGame = gameOf(st);
  const agents = (["p0", "p1", "p2", "p3"] as PlayerId[]).map((id) => {
    const a = new Agent(id, wants[id] ?? []);
    a.kindOfTile = (tid: number): string => {
      const t = (game.engine.state.tiles as Record<number, { kind: { suit: string; rank: number } }>)[tid];
      return t === undefined ? "" : `${t.kind.suit}${t.kind.rank}`;
    };
    return a;
  });
  let roundsStarted = 0;
  let reason: string | null = null;
  let nextRound = "";
  const outcomes: string[] = [];
  let ctrl!: HanchanController;
  ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    seed: 1, maxWind: 2, westEntry: false, draftSchedules: [], extraAugments: [],
    agentDecideTimeoutMs: 5_000, interRoundDelayMs: 0,
    ...cfgPatch,
  } as never, {
    onRoundStart: (g: StandardGame) => {
      roundsStarted++;
      if (roundsStarted > 1) nextRound = `${g.engine.state.round.prevalentWind}-${g.engine.state.round.roundNumber}-${g.engine.state.round.honba}`;
      if (roundsStarted >= stopAfterRounds) ctrl.requestAbort();
    },
    onRoundEnd: (g: StandardGame, outcome: string) => {
      outcomes.push(`${outcome}@${g.engine.state.round.prevalentWind}-${g.engine.state.round.roundNumber}-${g.engine.state.round.honba}`);
    },
    onGameOver: (_r: unknown, why: string) => { reason = why; },
  } as never);
  await ctrl.resume(game);
  const scores = (ctrl.gameState ?? game.engine.state).players.map((p) => p.score);
  return { reason, roundsStarted, outcomes, scores, nextRound };
}

/** 남4국(오라스), 오야=p3(seat3), p3 단독 1위 */
function south4(cfg: Parameters<typeof craft>[0], scores = [20000, 20000, 20000, 40000]): GameState {
  const base = craft(cfg);
  return {
    ...base,
    players: base.players.map((p, i) => ({ ...p, score: scores[i] ?? p.score })),
    round: { ...base.round, prevalentWind: 2, roundNumber: 4, dealerSeat: 3, rotationSeat: 3 },
  } as GameState;
}

// ── A. 도중유국(구종구패)이 아가리야메로 종국을 일으키는가 ──────────────
async function testAbortAgariYame(): Promise<void> {
  const st = south4({
    hands: {
      p0: "119m19p19s1234z5z6z7z",
      p1: "123m456m789m12p22p", p2: "123m456m789m12s33s", p3: "234m567m234p567p9s",
    },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const st2 = { ...st, round: { ...st.round, firstTurn: true } } as GameState;
  const r = await runFrom(st2, { p0: ["kyushuKyuhai"], p1: [], p2: [], p3: [] } as never);
  check("도중유국(구종구패)로 게임이 끝나지 않는다 — 아가리야메 아님",
    r.reason !== "agariYame",
    `reason=${String(r.reason)} outcomes=${r.outcomes.join(",")} 시작된국=${r.roundsStarted}`);
}

// ── B. 대조군: 오야가 남4국에서 화료(단독 1위)하면 아가리야메 종국 ──────
async function testDealerWinAgariYame(): Promise<void> {
  // p3(오야)가 1s 쯔모 화료 (핑후형·멘젠쯔모)
  const st = south4({
    hands: {
      p3: "234m567m234p567p11p", p0: "19m19p19s1234z5z7z",
      p1: "123m456m789m123p22p", p2: "345m678m345p678s99s",
    },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  });
  const r = await runFrom(st, { p3: ["win"], p0: [], p1: [], p2: [] } as never);
  check("대조군: 오야 화료 → 아가리야메 종국", r.reason === "agariYame",
    `reason=${String(r.reason)} outcomes=${r.outcomes.join(",")} scores=${r.scores.join("/")}`);
}

// ── C. 도중유국인데 오야가 1위가 아니면? (계속돼야 정상) ─────────────
async function testAbortNonTopDealer(): Promise<void> {
  const st = south4({
    hands: {
      p0: "119m19p19s1234z5z6z7z",
      p1: "123m456m789m12p22p", p2: "123m456m789m12s33s", p3: "234m567m234p567p9s",
    },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  }, [40000, 20000, 20000, 20000]);
  const st2 = { ...st, round: { ...st.round, firstTurn: true } } as GameState;
  const r = await runFrom(st2, { p0: ["kyushuKyuhai"], p1: [], p2: [], p3: [] } as never);
  check("도중유국 + 오야가 1위 아님 → 게임 계속", r.reason === null && r.roundsStarted >= 2,
    `reason=${String(r.reason)} 시작된국=${r.roundsStarted}`);
}

// ── D. 악용: 1위 오야가 스스로 구종구패를 선언해 게임을 끝낸다 ─────────
async function testDealerSelfAbortEndsGame(): Promise<void> {
  const st = south4({
    hands: {
      p3: "119m19p19s1234z5z6z7z",
      p1: "123m456m789m12p22p", p2: "123m456m789m12s33s", p0: "234m567m234p567p9s",
    },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  });
  const st2 = { ...st, round: { ...st.round, firstTurn: true } } as GameState;
  const r = await runFrom(st2, { p3: ["kyushuKyuhai"], p0: [], p1: [], p2: [] } as never);
  check("1위 오야가 구종구패로 게임을 끝낼 수 없다", r.reason !== "agariYame",
    `reason=${String(r.reason)} outcomes=${r.outcomes.join(",")} scores=${r.scores.join("/")}`);
}

// ── E. 토비 — 0점 미만이면 즉시 종국, 정확히 0점은 속행 ────────────────
async function testDobi(): Promise<void> {
  const mk = (scores: number[]): GameState => south4({
    hands: {
      p3: "234m567m234p567p11p", p0: "19m19p19s1234z5z7z",
      p1: "123m456m789m123p22p", p2: "345m678m345p678s99s",
    },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  }, scores);
  // p3(오야) 쯔모 → 자들이 각각 지불. p0을 마이너스로 떨어뜨린다.
  const r = await runFrom(mk([500, 40000, 40000, 19500]), { p3: ["win"] } as never);
  check("E1 토비: 0점 미만이 생기면 즉시 종국", r.reason === "dobi",
    `reason=${String(r.reason)} scores=${r.scores.join("/")}`);
  const r2 = await runFrom(mk([25000, 25000, 25000, 25000]), { p3: ["win"] } as never);
  check("E2 (대조) 토비 아님", r2.reason !== "dobi", `reason=${String(r2.reason)} scores=${r2.scores.join("/")}`);
}

// ── F. 서입 — 남4 종료 시 1위가 30000 미만이면 서1국으로 이어진다 ───────
async function testWestEntry(): Promise<void> {
  // p0(자)이 p3의 버림패로 론 → 오야 교대 → 남4 종료
  const st = south4({
    hands: {
      p0: "234m567m234p567p11p", p3: "1p258m369s5z6z7z247s1s",
      p1: "123m456m789m123p2p", p2: "345m678m345p678s9s",
    },
    phase: "turn.act", turnSeat: 3, drawnLastFor: "p3",
  }, [25000, 25000, 25000, 25000]);
  const r = await runFrom(st, { p0: ["win"], p3: ["discard:pin1"] } as never, 2, { westEntry: true });
  check("F 서입: 1위가 30000 미만이면 서1국으로 이어진다",
    r.reason === null && r.nextRound.startsWith("3-1"),
    `reason=${String(r.reason)} 다음국=${r.nextRound} scores=${r.scores.join("/")}`);
}

async function main(): Promise<void> {
  for (const [n, fn] of [
    ["A", testAbortAgariYame], ["B", testDealerWinAgariYame], ["C", testAbortNonTopDealer],
    ["D", testDealerSelfAbortEndsGame], ["E", testDobi], ["F", testWestEntry],
  ] as [string, () => Promise<void>][]) {
    try { await fn(); } catch (e) { check(`${n} — 예외`, false, String(e)); }
  }
  for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} 통과`);
}
void main();
