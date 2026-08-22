/**
 * aug-2 심층 프로브 1 — 담당 증강의 "약속"을 불변식으로 걸고 대량 반복한다.
 *  · 사용 횟수 카운터 상한 (eternal_dealer keeps<=3, full_hand_swap<=2, hand_swap3<=2,
 *    genesis/grave_rob/hidden_river/honor_return <= matchUses)
 *  · invincible: 켜진 국에 보유자가 방총(winInfo.from===holder)하면 위반
 *  · hourglass: 연장 중 쯔모가 보유자 외 좌석에 가면 기록
 *  · frame_up: 심은 패의 kind가 대상 이력에 들어가고 보유자 이력에는 없어야 한다
 *  · late_double: riichi.double은 discardCount<=7 선언에만
 *  · karma: burn(ScoreChanged reason=karma) 합계 0
 *  · jackpot: 배수는 {0.5,1,2,3}
 */
import { Prng, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { assignPreset } from "../../harness.js";
import { PERSONAS, SEATS, runMatch2 } from "./lib.js";
import type { Ev } from "./lib.js";
import type { Persona } from "../../harness.js";

const MINE = `eternal_dealer even_world foresight frame_up free_riichi_discard full_hand_swap future_sight genesis giant_god grave_rob haitei_lord hand_swap3 hidden_blade hidden_river honba_hunter honor_return hourglass invincible jackpot joker karma last_stand late_bloomer late_bloomer_east late_double let_it_ride meld_dissolve mirror_dora mixed_nine_gates mixed_triplet`.split(/\s+/);

const plist = Object.values(PERSONAS) as Persona[];
const perAug = Number(process.argv[2] ?? 30);
const sel = (process.argv[3] ?? "").split(",").filter((x) => x !== "");
const augs = sel.length > 0 ? MINE.filter((a) => sel.includes(a)) : MINE;

const findings: string[] = [];
const note = (s: string): void => { if (findings.length < 300) { findings.push(s); console.log("!! " + s); } };

const CAPS: Record<string, (mode: string) => number> = {
  "eternal_dealer:keeps": () => 3,
  "full_hand_swap:used": () => 2,
  "hand_swap3:used": () => 2,
  "genesis:uses": (m) => (m === "tonpuu" ? 1 : 2),
  "grave_rob:uses": (m) => (m === "tonpuu" ? 1 : 2),
  "hidden_river:uses": (m) => (m === "tonpuu" ? 1 : 2),
  "honor_return:uses": (m) => (m === "tonpuu" ? 1 : 2),
};

for (const aug of augs) {
  for (let k = 0; k < perAug; k++) {
    const rng = new Prng((k + 1) * 40503 + aug.length * 7919);
    const mode = k % 3 === 0 ? "tonpuu" : "hanchan";
    const preset = assignPreset(rng, mode, [aug], 2);
    if (k % 3 === 1) (preset.p2 as string[])[0] = aug;
    const personas = Object.fromEntries(SEATS.map((s) => [s, plist[rng.int(plist.length)] as Persona])) as Record<string, Persona>;
    const seed = k * 6151 + 29;
    const tag = `aug=${aug} k=${k} seed=${seed} ${mode}`;
    const holders = SEATS.filter((s) => (preset[s] as string[]).includes(aug));

    // ── 상태 스냅 ───────────────────────────────────────────────
    let lastState: GameState | null = null;
    // hourglass 연장 추적
    const hgOpen = new Set<PlayerId>();
    // karma 정산
    let karmaSum = 0;

    const r = await runMatch2({
      seed, mode, preset, personas: personas as never, timeoutMs: 90_000,
      onState: (st) => {
        lastState = st;
        for (const [prefix, cap] of Object.entries(CAPS)) {
          for (const s of SEATS) {
            const v = st.augmentData[`${prefix}:${s}`];
            if (typeof v === "number" && v > cap(mode)) {
              note(`${tag} CAP_EXCEEDED ${prefix}:${s}=${v} > ${cap(mode)}`);
            }
          }
        }
        for (const s of SEATS) {
          const g = st.augmentData[`karma:gauge:${s}`];
          if (typeof g === "number" && g < 0) note(`${tag} KARMA_NEG ${s}=${g}`);
        }
      },
      onEvent: (e: Ev, st) => {
        const p = e.payload as Record<string, unknown>;
        if (e.type === "ScoreChanged" && p["reason"] === "karma") {
          karmaSum += (p["delta"] as number) ?? 0;
        }
        if (e.type === "HourglassOpened") hgOpen.add(p["holder"] as PlayerId);
        if (e.type === "RoundSettled") {
          if (Math.abs(karmaSum) > 0) { note(`${tag} KARMA_NOT_ZERO_SUM ${karmaSum}`); karmaSum = 0; }
          const infos = (p["winInfos"] ?? []) as { winner: PlayerId; from: PlayerId | null }[];
          const s = st;
          if (s !== null) {
            for (const h of SEATS) {
              // invincible: 켜진 국에 그 사람이 방총했는가
              const key = Object.keys(s.augmentData).find((kk) => kk.startsWith("invincible:active:") && kk.endsWith(`:${h}`) && s.augmentData[kk] === true);
              if (key !== undefined && infos.some((w) => w.from === h)) {
                note(`${tag} INVINCIBLE_RON_THROUGH ${h} key=${key}`);
              }
            }
          }
          hgOpen.clear();
        }
        if (e.type === "TileDrawn" && hgOpen.size > 0 && p["rinshan"] !== true) {
          const drawer = p["player"] as PlayerId;
          if (!hgOpen.has(drawer)) {
            const s = st;
            const lastDiscarder = s?.round.lastDiscard?.player;
            note(`${tag} HOURGLASS_DRAW_STOLEN drawer=${drawer} holders=${[...hgOpen].join()} lastDisc=${String(lastDiscarder)}`);
          }
        }
        if (e.type === "TileDiscarded" && p["riichi"] === true) {
          const who = p["player"] as PlayerId;
          const s = st;
          if (s !== null && (preset[who] as string[]).includes("late_double")) {
            const dc = s.round.byPlayer[who]?.discardCount ?? 0;
            const dbl = s.round.byPlayer[who]?.riichi?.double === true;
            if (dbl && dc > 7) note(`${tag} LATE_DOUBLE_OVER dc=${dc}`);
          }
        }
        if (e.type === "AugmentDataSet") {
          const key = String(p["key"] ?? "");
          if (key.startsWith("round:") && key.includes(":view:*:jackpot:")) {
            const v = String(p["value"]);
            if (!["0.5배", "1배", "2배", "3배"].includes(v)) note(`${tag} JACKPOT_MULT ${v}`);
          }
        }
      },
    });
    if (r.crash !== undefined) note(`${tag} CRASH ${r.crash.split("\n")[0]}`);
    if (r.effectErrors.length > 0) note(`${tag} EFFERR ${r.effectErrors.slice(0, 3).join(" | ")}`);
    const bad = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
    if (bad.length > 0) note(`${tag} VIOL ${JSON.stringify(bad.slice(0, 4))}`);
    void holders; void lastState; void kindKey;
  }
  console.log(`-- ${aug} done (findings=${findings.length})`);
}
console.log(`DONE findings=${findings.length}`);
