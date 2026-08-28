// WS 동시접속 부하 테스트. 방 N개 x 4인(1 real host + 3 server bot 또는 4 real).
// 사용: node loadtest.mjs --rooms 16 --port 3103 --realPlayers 4 --durationSec 60
//
// 각 방: host가 register→createRoom→(realPlayers-1)명 join 또는 addBot으로 나머지 채움→startGame.
// 모든 소켓은 "prompt" 수신 시 options[0]을 즉시 action으로 회신하는 최소 봇.
// 행동→브로드캐스트 왕복 지연: action 전송 시각 -> 그 결과로 오는 다음 "view" 또는
// "prompt" 메시지 수신 시각의 차를 측정해 p50/p95/p99를 낸다.

import WebSocket from "ws";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const ROOMS = Number(args.rooms ?? 4);
const PORT = Number(args.port ?? 3103);
const REAL_PLAYERS = Number(args.realPlayers ?? 1); // 1 = host+3bots, 4 = 전원 실소켓
const DURATION_SEC = Number(args.durationSec ?? 60);
const URL = `ws://127.0.0.1:${PORT}`;

let uidCounter = 0;
function nextUsername() {
  uidCounter += 1;
  // 2~12자, 한글/영문/숫자/_- 만 허용 — base36 축약해 상한 안에 맞춘다.
  return `L${(Date.now() % 1e6).toString(36)}${uidCounter}`.slice(0, 12);
}

const latencies = []; // ms — action→next prompt/draftProgress (봇 "생각 시간"이 섞여 있음, 절대값 아닌 규모 간 비교용)
const pingLatencies = []; // ms — 순수 이벤트루프/네트워크 왕복 (ping→pong, 게임 로직 무관)
const errors = [];
const rejections = []; // 서버가 MAX_CONNECTIONS 등으로 즉시 close(1013)한 연결
let roomsStarted = 0;
let roomsFinished = 0;
const roomFinishedFlags = new Set();

function connectPlayer({ isHost, roomCode, resolveCode }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const username = nextUsername();
    const password = "loadtest123!";
    let pendingActionSentAt = null;
    let lastDraftSentAt = null;
    let readySent = false;
    let myRoomCode = roomCode ?? null;
    let seat = null;
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        errors.push(`connect/setup timeout: ${username}`);
        resolve({ ws, username });
      }
    }, 20_000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "register", username, password }));
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case "authOk": {
          if (isHost) {
            ws.send(JSON.stringify({ type: "createRoom" }));
          } else {
            // 방 코드가 아직 없으면 잠깐 기다렸다 join (호스트가 먼저 만든다)
            const tryJoin = () => {
              if (myRoomCode) {
                ws.send(JSON.stringify({ type: "joinRoom", code: myRoomCode }));
              } else {
                setTimeout(tryJoin, 50);
              }
            };
            tryJoin();
          }
          break;
        }
        case "roomCreated": {
          myRoomCode = msg.code;
          if (resolveCode) resolveCode(msg.code);
          if (REAL_PLAYERS < 4) {
            ws.send(JSON.stringify({ type: "addBot" }));
            ws.send(JSON.stringify({ type: "addBot" }));
            ws.send(JSON.stringify({ type: "addBot" }));
            setTimeout(() => ws.send(JSON.stringify({ type: "startGame" })), 300);
          }
          break;
        }
        case "joined": {
          seat = msg.playerId;
          break;
        }
        case "lobby": {
          // 방장이 아니면 준비 완료를 보낸다 — ready.add()는 멱등이라 매번 보내도
          // 안전하다. 한 번짜리 가드를 두면 한판(hanchan)이 끝나고 방이 waiting으로
          // 돌아왔을 때(서버가 room.ready를 새로 비움) 다시 준비를 안 보내 방이
          // 로비에 영원히 멈춰 있었다 — 30분 연속 대국 시험에서 실제로 겪은 버그.
          if (!isHost) {
            ws.send(JSON.stringify({ type: "ready", ready: true }));
          }
          // 방장이면, 인원 다 찼고 전원 준비됐을 때 시작 (한판 끝나고 로비로
          // 돌아온 뒤에도 같은 조건으로 다시 시작 — 연속 대국).
          if (isHost && REAL_PLAYERS >= 4 && msg.canStart === true) {
            setTimeout(() => ws.send(JSON.stringify({ type: "startGame" })), 300);
          }
          break;
        }
        case "draftOffer": {
          const c = msg.choices?.[0];
          if (c) {
            const sendT = Date.now();
            ws.send(JSON.stringify({ type: "draftPick", stage: msg.stage, augmentId: c.id }));
            // draftProgress로 왕복 확인 (아래)
            lastDraftSentAt = sendT;
          }
          break;
        }
        case "draftProgress": {
          if (lastDraftSentAt !== null) {
            latencies.push(Date.now() - lastDraftSentAt);
            lastDraftSentAt = null;
          }
          break;
        }
        case "prompt": {
          const opt = msg.prompt?.options?.[0];
          const now = Date.now();
          // 이전에 보낸 action의 결과로 온 prompt라면 그 왕복을 기록.
          if (pendingActionSentAt !== null) {
            latencies.push(now - pendingActionSentAt);
            pendingActionSentAt = null;
          }
          if (opt) {
            const sentAt = Date.now();
            ws.send(
              JSON.stringify({ type: "action", actionType: opt.type, payload: opt.payload }),
            );
            pendingActionSentAt = sentAt;
          }
          break;
        }
        case "pong": {
          if (ws._lastPingAt) {
            pingLatencies.push(Date.now() - ws._lastPingAt);
            ws._lastPingAt = null;
          }
          break;
        }
        case "roundOver": {
          // 결과 화면에서 "다음 국으로"를 즉시 눌러 회전율을 높인다 (INTER_ROUND_DELAY_MS=20s 대기 방지).
          setTimeout(() => {
            try {
              ws.send(JSON.stringify({ type: "roundContinue" }));
            } catch {
              /* noop */
            }
          }, 200);
          break;
        }
        case "error": {
          errors.push(`${username}: ${msg.code ?? ""} ${msg.message ?? ""}`);
          break;
        }
        default:
          break;
      }
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ ws, username });
      }
    });

    ws.on("error", (e) => {
      errors.push(`ws error ${username}: ${e.message}`);
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ ws, username });
      }
    });

    ws.on("close", (code, reasonBuf) => {
      // 서버가 MAX_CONNECTIONS(전체 상한)에서 거절하면 인증 메시지 없이 바로 close(1013)만
      // 온다 — "지연"이 아니라 "거절"이므로 즉시 감지해 20초 타임아웃까지 죽치지 않는다.
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        rejections.push({ username, code, reason: reasonBuf?.toString() ?? "" });
        resolve({ ws, username, rejected: true });
      }
    });
  });
}

async function spinRoom(roomIdx) {
  let resolveCode;
  const codePromise = new Promise((r) => (resolveCode = r));
  const host = await connectPlayer({ isHost: true, resolveCode });
  const rest = [];
  if (REAL_PLAYERS >= 4) {
    const code = await codePromise;
    for (let i = 0; i < 3; i++) {
      rest.push(await connectPlayer({ isHost: false, roomCode: code }));
    }
  }
  roomsStarted += 1;
  return [host, ...rest];
}

function memSample() {
  const mu = process.memoryUsage();
  return { rss: mu.rss, heapUsed: mu.heapUsed };
}

async function main() {
  console.log(
    `[loadtest] rooms=${ROOMS} realPlayers=${REAL_PLAYERS} port=${PORT} duration=${DURATION_SEC}s`,
  );
  const t0 = Date.now();
  const allConns = [];
  // 방을 순차적으로 약간 지연시켜 연결 폭주(레이트리밋 무관하지만 소켓 오픈 폭주)를 피한다.
  const BATCH = 10;
  for (let i = 0; i < ROOMS; i += BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH, ROOMS); j++) batch.push(spinRoom(j));
    const results = await Promise.all(batch);
    for (const r of results) allConns.push(...r);
    console.log(`[loadtest] rooms ${Math.min(i + BATCH, ROOMS)}/${ROOMS} up, elapsed ${Date.now() - t0}ms`);
  }
  const setupMs = Date.now() - t0;
  console.log(`[loadtest] all ${ROOMS} rooms up in ${setupMs}ms, sockets=${allConns.length}`);

  const memSamples = [memSample()];
  const memTimer = setInterval(() => memSamples.push(memSample()), 5000);
  // 순수 왕복 지연 프로브 — 소켓마다 2초 간격으로 ping, 게임 로직과 무관하게
  // 서버 이벤트루프가 큐에 밀려 있는지를 잰다.
  const pingTimer = setInterval(() => {
    for (const c of allConns) {
      if (c.ws.readyState === 1 && !c.ws._lastPingAt) {
        c.ws._lastPingAt = Date.now();
        try {
          c.ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          /* noop */
        }
      }
    }
  }, 2000);

  await new Promise((r) => setTimeout(r, DURATION_SEC * 1000));
  clearInterval(memTimer);
  clearInterval(pingTimer);

  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN);

  const psorted = [...pingLatencies].sort((a, b) => a - b);
  const ppct = (p) => (psorted.length ? psorted[Math.min(psorted.length - 1, Math.floor((p / 100) * psorted.length))] : NaN);

  const report = {
    rooms: ROOMS,
    realPlayersPerRoom: REAL_PLAYERS,
    sockets: allConns.length,
    setupMs,
    durationSec: DURATION_SEC,
    actionSamples: latencies.length,
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    max: sorted[sorted.length - 1] ?? NaN,
    pingSamples: pingLatencies.length,
    pingP50: ppct(50),
    pingP95: ppct(95),
    pingP99: ppct(99),
    pingMax: psorted[psorted.length - 1] ?? NaN,
    errorCount: errors.length,
    sampleErrors: errors.slice(0, 10),
    rejectionCount: rejections.length,
    sampleRejections: rejections.slice(0, 5),
    memRssStartMB: (memSamples[0].rss / 1e6).toFixed(1),
    memRssEndMB: (memSamples[memSamples.length - 1].rss / 1e6).toFixed(1),
  };
  console.log("[loadtest] REPORT " + JSON.stringify(report, null, 2));

  for (const c of allConns) {
    try {
      c.ws.close();
    } catch {
      /* noop */
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
