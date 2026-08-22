/**
 * 무장해제(disarm) × "이미 선언해 둔" 증강 — 효과는 꺼지는데 **전원 공개 배너는 남는가**.
 *
 * disarm detail: "잠긴 증강이 이미 만들어 둔 것은 대체로 그대로 남는다 …
 *                 지목은 전원에게 공개되며 국이 끝나면 증강도 돌아온다."
 * 각 대상 카드의 배너는 "지금 이 효과가 살아 있다"를 **전원에게** 알리는 채널이다.
 *
 * 기대: 잠기는 순간 효과(규칙 값)와 배너가 **함께** 꺼진다.
 *       (blind_ron·time_pressure는 실제로 그렇게 고쳐져 있다 — 대조군)
 * 재는 것: (효과) 해당 규칙의 resolve 값, (배너) p2(제3자) 뷰의 augmentView 채널.
 */
import { craft, setup, submit, table, view } from "./lib.js";
import type { Game, GameState, PlayerId } from "./lib.js";

function scene(): GameState {
  return craft({
    hands: {
      p0: "123456789m12p33p",
      p1: "123456789m12p33p",
      p2: "*",
      p3: "*",
    },
    discards: { p0: "1s", p1: "1s", p2: "1s", p3: "1s" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
}

function seat(game: Game, s: number): void {
  (game.engine as unknown as { currentState: GameState }).currentState = {
    ...game.engine.state,
    round: { ...game.engine.state.round, turnSeat: s },
  };
}

/** p2(제3자) 뷰에 보이는 채널 중 `needle` 을 포함하는 것들 */
function banners(game: Game, viewer: PlayerId, needle: string): string {
  const av = (view(game, viewer).augmentView ?? {}) as Record<string, unknown>;
  const hits = Object.entries(av).filter(([k]) => k.includes(needle));
  return hits.length === 0 ? "(없음)" : JSON.stringify(Object.fromEntries(hits));
}

interface Case {
  id: string;
  /** 선언 액션 (없으면 패시브) */
  declare?: { type: string; payload?: unknown };
  /** 효과를 재는 규칙 */
  probe: (g: Game) => unknown;
  needle: string;
}

const cases: Case[] = [
  {
    id: "invincible",
    declare: { type: "invincible_guard" },
    probe: (g) =>
      g.engine.rules.resolve("win.ronImmune", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
    needle: "invincible",
  },
  {
    id: "call_seal",
    declare: { type: "call_seal_use" },
    probe: (g) =>
      g.engine.rules.resolve("call.blocked", {
        playerId: "p2",
        state: g.engine.state,
      } as never),
    needle: "call_seal",
  },
  {
    id: "hidden_river",
    declare: { type: "declare_fog" },
    probe: (g) =>
      JSON.stringify(
        g.engine.rules.resolve("visibility.discards", {
          playerId: "p2",
          zoneOwner: "p3",
          state: g.engine.state,
        } as never),
      ),
    needle: "hidden_river",
  },
  {
    id: "brief_fog",
    declare: { type: "declare_brief_fog" },
    probe: (g) =>
      JSON.stringify(
        g.engine.rules.resolve("visibility.discards", {
          playerId: "p2",
          zoneOwner: "p3",
          state: g.engine.state,
        } as never),
      ),
    needle: "brief_fog",
  },
  {
    id: "push_riichi",
    declare: { type: "push_brand", payload: { target: "p2" } },
    probe: (g) =>
      String(g.engine.state.augmentData[`push_riichi:brand:p1#round`] ?? "(키없음)"),
    needle: "push_riichi",
  },
  {
    id: "parasite",
    declare: { type: "parasite_attach", payload: { target: "p2" } },
    probe: () => "(정산에서만 관측)",
    needle: "parasite",
  },
  {
    id: "scapegoat",
    declare: { type: "scapegoat_mark", payload: { target: "p2" } },
    probe: () => "(정산에서만 관측)",
    needle: "scapegoat",
  },
  {
    id: "xray_hand",
    declare: { type: "xray_reveal" },
    probe: (g) =>
      String(
        g.engine.rules.resolve("visibility.hand", {
          playerId: "p1",
          zoneOwner: "p2",
          state: g.engine.state,
        } as never),
      ),
    needle: "xray_hand",
  },
  {
    id: "no_ron_pact",
    probe: (g) =>
      g.engine.rules.resolve("win.ronImmune", {
        playerId: "p1",
        state: g.engine.state,
      } as never),
    needle: "no_ron_pact",
  },
  {
    id: "blind_ron",
    probe: () => "(정산에서만 관측)",
    needle: "blind_ron",
  },
  {
    id: "time_pressure",
    probe: () => "(서버가 채널만 읽는다)",
    needle: "time_pressure",
  },
];

const rows: Record<string, unknown>[] = [];
for (const c of cases) {
  // p1 이 대상 증강을, p0 이 무장해제를 든다.
  const build = (): Game => {
    const g = setup(scene(), { p0: ["disarm"], p1: [c.id] });
    // 자동 발동형(blind_ron·time_pressure)은 ROUND_STARTED 로 무장한다
    return g;
  };

  // ── 대조군 A: 선언만 (무장해제 없음)
  const a = build();
  seat(a, 1);
  if (c.declare) submit(a, "p1", c.declare.type, c.declare.payload ?? {});
  const effA = String(c.probe(a));
  const banA = banners(a, "p2", c.needle);

  // ── A+B: 선언 뒤 p0 이 그 증강을 무장해제
  const b = build();
  seat(b, 1);
  if (c.declare) submit(b, "p1", c.declare.type, c.declare.payload ?? {});
  seat(b, 0);
  submit(b, "p0", "disarm_lock", { target: "p1", augmentId: c.id });
  const effB = String(c.probe(b));
  const banB = banners(b, "p2", c.needle);

  rows.push({
    증강: c.id,
    "효과(A: 선언만)": effA,
    "효과(A+B: 무장해제 뒤)": effB,
    "효과 꺼짐?": effA !== effB ? "예" : "아니오/무관",
    "배너(A)": banA.slice(0, 60),
    "배너(A+B)": banB.slice(0, 60),
    "배너 남음?": banB !== "(없음)" && banB === banA ? "❌ 그대로" : "정리됨/변함",
  });
}
table("disarm × 선언 상태 증강 — 효과 vs 전원 공개 배너", rows);
