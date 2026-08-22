/**
 * 쿠이카에 금지가 **화면에서 «봉인»으로 둔갑한다**.
 *
 * core: kuikaeForbiddenIds → lockedDiscardIds → PlayerView…sealedTileIds
 * client: sealedSet → 🔒 배지 + SEAL_HINT("봉인된 패 — 이번 국 동안 버릴 수 없습니다")
 *         + 배너("누군가 내 패 N장을 봉인했습니다 — 🔒 이 패는 버릴 수 없음")
 * 증강이 하나도 없는 판에서 그렇게 되는지 본다.
 */
import { createInitialGameState } from "@majak/core/engine/state/GameState.js";
import type { GameState } from "@majak/core/engine/state/GameState.js";
import { DEAD_WALL, WALL, createZone, discardsZone, handZone, meldsZone } from "@majak/core/engine/zones/Zone.js";
import type { PlayerId } from "@majak/core/engine/zones/Zone.js";
import { kindKey } from "@majak/core/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "@majak/core/mahjong/tiles/Tile.js";
import { lockedDiscardIds } from "@majak/core/mahjong/flow/helpers.js";
import { FlowController } from "@majak/core/mahjong/flow/FlowController.js";
import { createStandardGameFromState } from "@majak/core/mahjong/flow/standardGame.js";
import { buildPlayerView } from "@majak/core/information/PlayerView.js";

function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") { digits += ch; continue; }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z") out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
    }
    digits = "";
  }
  return out;
}
const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];
function craft(hands: Partial<Record<PlayerId, string>>, turnSeat: number, drawnLastFor: PlayerId): GameState {
  const base = createInitialGameState({ seed: 1, playerIds: [...PLAYERS] }, { startScore: 25000, redFivesPerSuit: 1 });
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (kind: TileKind): TileId => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`no ${kindKey(kind)}`);
    return id;
  };
  const zones = { ...base.zones };
  for (const p of PLAYERS) {
    zones[handZone(p)] = { ...createZone(handZone(p), "hand", p), tileIds: h(hands[p] ?? "").map(take) };
    zones[discardsZone(p)] = createZone(discardsZone(p), "discards", p);
    zones[meldsZone(p)] = createZone(meldsZone(p), "melds", p);
  }
  const rest = [...pool.values()].flat().sort((a, b) => a - b);
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: rest.slice(0, 14) };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };
  return {
    ...base, zones,
    round: { ...base.round, phase: "turn.act", turnSeat,
      doraIndicators: [zones[DEAD_WALL]!.tileIds[4] as TileId],
      lastDrawnTile: zones[handZone(drawnLastFor)]?.tileIds.at(-1) ?? null },
  };
}
function idOf(game: any, player: PlayerId, spec: string): TileId {
  const want = kindKey(h(spec)[0]!);
  for (const id of game.engine.state.zones[handZone(player)]?.tileIds ?? []) {
    const k = game.engine.state.tiles[id]?.kind;
    if (k !== undefined && kindKey(k) === want) return id;
  }
  throw new Error(`${player} has no ${spec}`);
}

const game = createStandardGameFromState(craft({ p0: "45m3m6m123p456p135s", p3: "3m99m111z222z333z44z" }, 3, "p3"));
const flow = new FlowController(game.engine);
flow.begin();
const st0 = flow.submit("p3", { type: "discard", payload: { tileId: idOf(game, "p3", "3m") } });
if (st0.kind !== "awaiting") throw new Error("치 프롬프트 없음");
const chi = (st0.prompts.find((x: any) => x.player === "p0")?.options ?? []).find((o: any) => {
  if (o.type !== "chi") return false;
  return (o.payload.tileIds as TileId[]).map((id) => kindKey(game.engine.state.tiles[id]!.kind)).sort().join(",") === "man4,man5";
});
flow.submit("p0", chi);

const s = game.engine.state;
const locked = [...lockedDiscardIds(s, game.engine.rules, "p0")];
console.log("증강 보유:", s.players.map((p: any) => `${p.id}:${(p.augments ?? []).length}`).join(" "));
console.log("치 직후 잠긴 손패:", locked.map((id) => kindKey(s.tiles[id]!.kind)));
const mine: any = buildPlayerView(s, "p0", game.engine.rules);

const sealedIds = mine.round.byPlayer["p0"].sealedTileIds ?? [];
console.log("PlayerView.sealedTileIds:", sealedIds.map((id: TileId) => kindKey(s.tiles[id]!.kind)));
console.log("→ 클라이언트: 🔒 배지 + SEAL_HINT «봉인된 패 — 이번 국 동안 버릴 수 없습니다»");
console.log("→ 클라이언트: 배너 «누군가 내 패", sealedIds.length, "장을 봉인했습니다»  (sealedNow 0 →", sealedIds.length, ")");
