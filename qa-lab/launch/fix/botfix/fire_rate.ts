/**
 * fire_rate — 액티브 증강별 **실제 발동률** 측정 (2026-08-28, botfix).
 *
 * 코디네이터 지적: 「정책이 코드상 존재하고 게이트가 걸려 있다」와 「봇이 실전에서
 * 그 증강을 쓴다」는 다른 명제다. 이 스크립트는 후자를 잰다.
 *
 * 방법: `bot:` 필드가 있는(=액티브) 증강마다, **그 증강 하나만**을 네 좌석 전원에게
 * `presetAugments`로 강제하고(다른 액티브가 섞이지 않아 입찰 경쟁·귀속 모호함이 없다)
 * 실제 `BotAgent`(서버가 실전에 쓰는 바로 그 클래스, PersonaAgent 아님)로 여러 판을
 * 돌린다. 국마다 "이 좌석이 이 증강을 들고 있었는가"(모든 국이 해당 — 게임 내내
 * preset)와 "그 국에서 표준 액션이 아닌 액션 타입을 한 번이라도 냈는가"(=그 증강의
 * 커스텀 액션이 실행됐다, `BotAgent.ts`의 STANDARD_ACTION_TYPES 밖은 전부 액티브
 * 증강의 발동이라는 그 파일 자신의 불변식을 그대로 쓴다)를 국 단위로 센다.
 *
 * 발동률 = 발동한 국 수 / 보유한 국 수. 좌석 4개 × 판마다 8국(반장)이 표본이다.
 *
 * ⚠ 드래프트 시점을 `eastFirst` 하나만 남겼다(실전은 국 중간에도 재드래프트가 있어
 * 국마다 여러 증강이 쌓인다). 재드래프트를 열어 두면 게임 도중 다른 증강이 더 들어와
 * "이 액션이 어느 증강의 것인가"가 모호해진다(스모크 테스트에서 표준 4종 증강
 * `time_stop`·`pseudo_dealer`·`frame_up`·`brief_fog`가 섞여 나오는 것으로 확인) —
 * 그래서 이 측정은 **게임 내내 그 증강 하나만 보유한, 고립된 조건**에서의 발동률이다.
 * 재드래프트로 다른 증강과 경쟁하는 실전 조건에서는 이 값이 상한에 가깝다(입찰
 * 경쟁자가 없으므로) — 그래도 "고립 조건에서도 0%"라면 정책·조건 문제가 확실하다.
 *
 * ⚠ **한 프로세스에 판을 몰아넣지 않는다** (2026-08-28, augbug 감사 반영).
 * `qa-lab/harness.ts`의 `withTimeout`이 타임아웃에도 `ctrl.requestAbort()`를 안 불러
 * 버려진 판이 백그라운드에서 계속 돌며 RSS가 389MB→1,644MB로 불어 5시간 헛돈 사고가
 * 있었다(그 파일은 이미 고쳐졌다 — 이 스크립트는 그 파일을 쓰지 않지만 같은 함정이라
 * 여기도 직접 방어한다: `runOneGame`이 게임마다 `Promise.race`로 타임아웃을 걸고,
 * 타임아웃 시 `ctrl.requestAbort()`를 호출해 버려진 판이 계속 돌지 않게 한다).
 * 그리고 **증강 목록을 덩이로 나눠 별도 프로세스로 돌린다** — 한 프로세스가 수백 판을
 * 넘기지 않게 하는 것이 요점이다(`run_shards.sh` 참고).
 *
 * 실행(단독, 전체):
 *   /Users/skul/majak/node_modules/.bin/tsx qa-lab/launch/fix/botfix/fire_rate.ts [games] [outFile]
 * 실행(덩이 — start·end는 활성 증강 배열의 [start,end) 인덱스):
 *   ... fire_rate.ts [games] [outFile] [start] [end]
 *
 * 중간 결과를 매 증강마다 스트리밍으로 outFile(JSONL)에 흘려 쓴다 — 프로세스가 죽어도
 * 이미 낸 결과는 남는다. 재실행하면 outFile에 이미 있는 id는 건너뛴다(재개).
 */
import { appendFileSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import {
  HanchanController,
  DEFAULT_HANCHAN_CONFIG,
} from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../../../../packages/server/src/BotAgent.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

/** BotAgent.ts의 STANDARD_ACTION_TYPES와 동일 — 이 밖은 전부 액티브 증강 발동이다 */
const STD_ACTIONS = new Set([
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

const GAMES = Number(process.argv[2] ?? 15);
const OUT = process.argv[3] ?? "qa-lab/launch/fix/botfix/fire_rate.jsonl";
const START = process.argv[4] !== undefined ? Number(process.argv[4]) : undefined;
const END = process.argv[5] !== undefined ? Number(process.argv[5]) : undefined;

/** 한 판의 상한 — 이 시간을 넘기면 판을 접는다(requestAbort) 그리고 다음 판으로 간다 */
const GAME_TIMEOUT_MS = 90_000;

interface AugFireRow {
  id: string;
  category: string;
  roundsHeld: number;
  roundsFired: number;
  fireRate: number;
  gamesRun: number;
  gamesTimedOut: number;
  crash?: string;
}

function gameSeed(base: number, i: number): number {
  let h = (base ^ (i * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * **판 하나를 시간 제한 안에서 돌린다.** 타임아웃이 오면 `onTimeout`(requestAbort)을
 * 불러 실행 중인 컨트롤러가 다음 체크 지점에서 실제로 멈추게 한다 — 그냥 reject만
 * 하고 내버려두면(2026-08-28 augbug 감사가 잡은 그 버그) 버려진 판이 백그라운드에서
 * 계속 돌아 메모리가 새고 스위프 전체가 멈춘다.
 */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`TIMEOUT after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 이 증강 하나를 네 좌석 전원에게 강제하고 games판을 돌려 발동률을 잰다 */
async function measureOne(
  augId: string,
  category: string,
  games: number,
  baseSeed: number,
): Promise<AugFireRow> {
  const preset: Record<PlayerId, readonly string[]> = {
    p0: [augId],
    p1: [augId],
    p2: [augId],
    p3: [augId],
  };
  let roundsHeld = 0;
  let roundsFired = 0;
  let gamesTimedOut = 0;
  let crash: string | undefined;
  for (let g = 0; g < games; g++) {
    const seed = gameSeed(baseSeed, g);
    // 좌석별 이번 국 액션 로그 — 국 경계에서 비운다
    const roundActions: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
    const agents = SEATS.map((id, i) => {
      const bot = new BotAgent(id, `Bot_${id}`, seed * 131 + i * 7 + 1, contentAugments);
      bot.setGameMode("hanchan");
      const origDecide = bot.decide.bind(bot);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (bot as any).decide = async (prompt: unknown) => {
        const opt = await origDecide(prompt as never);
        roundActions[id].push((opt as { type: string }).type);
        return opt;
      };
      return bot;
    });
    let inRound = false;
    const ctrl = new HanchanController(
      agents as never,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        mode: "hanchan",
        seed,
        maxWind: 2,
        westEntry: false,
        draftSchedules: ["eastFirst"],
        extraAugments: contentAugments,
        presetAugments: preset,
        agentDecideTimeoutMs: 20_000,
      } as never,
      {
        onRoundStart: () => {
          inRound = true;
          for (const s of SEATS) roundActions[s] = [];
        },
        onRoundEnd: () => {
          if (!inRound) return;
          inRound = false;
          for (const s of SEATS) {
            roundsHeld++;
            const fired = roundActions[s].some((t) => !STD_ACTIONS.has(t));
            if (fired) roundsFired++;
          }
        },
      } as never,
    );
    try {
      await withTimeout(ctrl.run(), GAME_TIMEOUT_MS, () => ctrl.requestAbort());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("TIMEOUT")) {
        gamesTimedOut++;
        continue; // 이 판만 접고 다음 판으로 — 스위프 전체를 죽이지 않는다
      }
      crash = msg;
      break;
    }
  }
  return {
    id: augId,
    category,
    roundsHeld,
    roundsFired,
    fireRate: roundsHeld === 0 ? 0 : roundsFired / roundsHeld,
    gamesRun: games,
    gamesTimedOut,
    ...(crash !== undefined ? { crash } : {}),
  };
}

async function main(): Promise<void> {
  const allActive = contentAugments.filter((d) => d.bot !== undefined);
  const active = allActive.slice(START ?? 0, END ?? allActive.length);
  console.error(
    `active(=bot 정책 있음) 증강 총 ${allActive.length}종 중 [${START ?? 0},${END ?? allActive.length}) = ${active.length}종, 각 ${GAMES}판씩 측정`,
  );

  // 이미 낸 결과가 있으면 이어서(재개) — 같은 id를 다시 재지 않는다
  const done = new Set<string>();
  if (existsSync(OUT)) {
    for (const line of readFileSync(OUT, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        const row = JSON.parse(line) as AugFireRow;
        done.add(row.id);
      } catch {
        /* ignore malformed line */
      }
    }
    console.error(`재개: 이미 ${done.size}종 완료`);
  } else {
    writeFileSync(OUT, "");
  }

  let i = 0;
  for (const def of active) {
    i++;
    if (done.has(def.id)) continue;
    const t0 = Date.now();
    const row = await measureOne(def.id, def.category ?? "?", GAMES, 0xc0ffee + (START ?? 0) * 977 + i * 97);
    appendFileSync(OUT, JSON.stringify(row) + "\n");
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.error(
      `[${i}/${active.length}] ${def.id}: held=${row.roundsHeld} fired=${row.roundsFired} rate=${(row.fireRate * 100).toFixed(1)}% timedOut=${row.gamesTimedOut} (${secs}s)${row.crash !== undefined ? " CRASH:" + row.crash : ""}`,
    );
  }
  console.error(`끝. -> ${OUT}`);
}

void main();
