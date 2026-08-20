/**
 * bot 의심 3 재검증 — 발동률이 극단적으로 낮은 정책의 **문턱이 조건에 맞는가.**
 *
 *   npx tsx qa-lab/verify-shape/gate_profile.ts [판/증강]
 *
 * 발동률만 보면 "안 켠다"밖에 안 보인다. 여기서는 액션이 제시된 **모든 순간**에
 * 정책이 보는 게이트 값(threat · tenpai · wallLeft · 대기 잔량 …)을 그대로 찍어,
 * "조건을 만족했는데 안 켰다"와 "조건이 애초에 성립하지 않았다"를 가른다.
 */
import { HanchanController, DEFAULT_HANCHAN_CONFIG, standardAugments } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../packages/server/src/BotAgent.js";
import { waitTilesLeft, handKindsOf } from "../../packages/content/src/augments/botHelpers.js";
import type { AugmentDef } from "@majak/core";

const GAMES = Number(process.argv[2] ?? 6);

interface Row { opp: number; fired: number; gate: Map<string, number> }
const rows = new Map<string, Row>();
const row = (id: string): Row => {
  let r = rows.get(id);
  if (r === undefined) { r = { opp: 0, fired: 0, gate: new Map() }; rows.set(id, r); }
  return r;
};
const bump = (r: Row, k: string): void => r.gate.set(k, (r.gate.get(k) ?? 0) + 1);

/** 증강별 액션 타입 — 이 옵션이 **실제로 제시된 순간**만 "기회"로 센다 */
const ACTION_OF: Record<string, string> = {
  last_stand: "cancel_riichi",
  palm_flip: "flip_riichi",
  open_kokushi: "kokushi_pon",
  blood_contract: "blood_contract_declare",
};

/** 게이트 해부 — 소스의 pick 조건과 1:1로 맞춘다 */
const PROBES: Record<string, (r: Row, ctx: any) => void> = {
  // last_stand.ts:160-169 — threat>=0.9 && (left<=1 || (wallLeft<=12 && left<=3))
  last_stand: (r, ctx) => {
    const left = waitTilesLeft(ctx);
    const hopeless = left <= 1 || (ctx.wallLeft <= 12 && left <= 3);
    if (ctx.threat >= 0.9) bump(r, "threat>=0.9");
    if (hopeless) bump(r, "대기가 죽음");
    if (ctx.threat >= 0.9 && hopeless) bump(r, "전부충족");
  },
  // palm_flip.ts:241-247 — tenpai && wallLeft>=12 && waitTilesLeft===0
  palm_flip: (r, ctx) => {
    if (ctx.tenpai) bump(r, "텐파이");
    if (ctx.wallLeft >= 12) bump(r, "패산>=12");
    if (ctx.tenpai && waitTilesLeft(ctx) === 0) bump(r, "텐파이&대기잔량0");
    if (ctx.tenpai && ctx.wallLeft >= 12 && waitTilesLeft(ctx) === 0) bump(r, "전부충족");
  },
  // open_kokushi.ts:218-229 — 이미 kokushi_pon이면 무조건 / 아니면 요구패 8종 이상
  open_kokushi: (r, ctx) => {
    const committed = (ctx.view.round.byPlayer[ctx.holder]?.melds ?? []).some(
      (m: any) => m.kind === "kokushi_pon",
    );
    const isOrphan = (k: any): boolean =>
      k.suit === "wind" || k.suit === "dragon" || k.rank === 1 || k.rank === 9;
    const kinds = new Set(
      handKindsOf(ctx.view, ctx.holder).filter(isOrphan).map((k: any) => `${k.suit}${k.rank}`),
    );
    if (committed) bump(r, "이미 착수");
    bump(r, `요구패 ${kinds.size}종`);
    if (committed || kinds.size >= 8) bump(r, "전부충족");
  },
  // blood_contract.ts:156-192 — 손 전체가 탕야오/청일/혼일/4짝 중 하나
  blood_contract: (r, ctx) => {
    const kinds = handKindsOf(ctx.view, ctx.holder);
    const isNum = (x: string): boolean => x === "man" || x === "pin" || x === "sou";
    const suitCount: Record<string, number> = { man: 0, pin: 0, sou: 0 };
    let honors = 0;
    for (const k of kinds) {
      if (isNum(k.suit)) suitCount[k.suit] = (suitCount[k.suit] ?? 0) + 1;
      else honors++;
    }
    const numbers = kinds.length - honors;
    const used = ["man", "pin", "sou"].filter((x) => (suitCount[x] ?? 0) > 0);
    let dom = "man";
    for (const x of ["man", "pin", "sou"]) if ((suitCount[x] ?? 0) > (suitCount[dom] ?? 0)) dom = x;
    const off = numbers - (suitCount[dom] ?? 0);
    const cnt = new Map<string, number>();
    for (const k of kinds) { const key = `${k.suit}${k.rank}`; cnt.set(key, (cnt.get(key) ?? 0) + 1); }
    const pairs = [...cnt.values()].filter((c) => c >= 2).length;
    if (kinds.every((k) => isNum(k.suit) && k.rank >= 2 && k.rank <= 8)) bump(r, "탕야오형");
    else if (honors === 0 && used.length === 1) bump(r, "청일형");
    else if (off <= 1 && (suitCount[dom] ?? 0) >= 5) bump(r, "혼일형");
    else if (pairs >= 4 && kinds.length <= 14) bump(r, "4짝형");
    else bump(r, "어느 쪽도 아님");
    bump(r, `색이 몰린 정도 off=${Math.min(6, off)}`);
  },
};

const wrapped: AugmentDef[] = contentAugments.map((def) => {
  const probe = PROBES[def.id];
  const policy = def.bot;
  if (probe === undefined || policy === undefined) return def;
  return {
    ...def,
    bot: {
      ...policy,
      choose: (ctx: any) => {
        const r = row(def.id);
        // "기회" = 이 증강의 액션이 **실제로 제시된** 순간만 센다.
        // (choose는 매 프롬프트마다 불리므로, 옵션이 없는 호출을 세면 분모가 통째로 거짓이 된다.)
        const act = ACTION_OF[def.id];
        const present = ctx.options.some((o: any) => o.type === act);
        if (present) {
          r.opp++;
          try { probe(r, ctx); } catch { /* 게이트 계측 실패는 무시 */ }
        }
        const out = policy.choose(ctx);
        if (out !== null && out !== undefined) r.fired++;
        return out;
      },
    },
  } as AugmentDef;
});

// 강제 지급 — 드래프트에 기대면 표본이 안 쌓인다 (아레나 6판에서 0회 관측)
const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const botCatalog = [...standardAugments, ...wrapped];
for (const id of Object.keys(PROBES)) {
  for (let g = 0; g < GAMES; g++) {
    const seed = 770_000 + g * 31 + id.length;
    const bots = SEATS.map((s, i) => {
      const b = new BotAgent(s, `Bot_${s}`, seed + i, botCatalog);
      b.setGameMode("tonpuu");
      return b;
    });
    const preset = Object.fromEntries(SEATS.map((s) => [s, [id]])) as Record<PlayerId, readonly string[]>;
    const ctrl = new HanchanController(bots, {
      ...DEFAULT_HANCHAN_CONFIG, mode: "tonpuu", seed, maxWind: 1, westEntry: false,
      draftSchedules: [], extraAugments: wrapped, presetAugments: preset,
      agentDecideTimeoutMs: 20_000,
    } as never, {} as never);
    try {
      await Promise.race([ctrl.run(), new Promise((_r, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 120_000))]);
    } catch (e) { console.log(`  (중단 ${id} g${g}: ${String(e).slice(0, 60)})`); break; }
  }
}

console.log(`=== 게이트 해부 (증강별 강제 지급 ${GAMES}배패 · 동풍전 · 네 좌석 전원 보유) ===`);
for (const [id, r] of rows) {
  console.log(`\n${id}  액션 제시 ${r.opp}회 → 제안 ${r.fired}회 (${((r.fired / Math.max(1, r.opp)) * 100).toFixed(1)}%)`);
  for (const [k, v] of [...r.gate].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(16)} ${String(v).padStart(5)}회 (${((v / Math.max(1, r.opp)) * 100).toFixed(1)}%)`);
  }
}
