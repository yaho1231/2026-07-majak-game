/**
 * QA round2 · server 도메인 — 실서버(WS) 클라이언트 하네스.
 *
 * 워크트리 전용 임시 서버(PORT=3921, DB_PATH=scratchpad)를 향한다.
 * 운영 서버·운영 DB는 건드리지 않는다.
 */
import WebSocket from "ws";

export const URL_ = process.env.QA_WS ?? "ws://127.0.0.1:3921";
export const HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3921";

export interface Msg { type: string; [k: string]: any }

export class C {
  ws: WebSocket;
  log: Msg[] = [];
  name: string;
  closed = false;
  closeInfo: { code: number; reason: string } | null = null;
  private waiters: { pred: (m: Msg) => boolean; res: (m: Msg) => void; rej: (e: any) => void; t: any }[] = [];
  onMsg: ((m: Msg) => void) | null = null;

  constructor(name = "c") {
    this.name = name;
    this.ws = new WebSocket(URL_);
    this.ws.on("message", (d) => {
      let m: Msg;
      try { m = JSON.parse(d.toString()); } catch { return; }
      this.log.push(m);
      this.onMsg?.(m);
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(m)) { clearTimeout(w.t); w.res(m); return false; }
        return true;
      });
    });
    this.ws.on("close", (code, reason) => {
      this.closed = true;
      this.closeInfo = { code, reason: reason?.toString() ?? "" };
      for (const w of this.waiters) { clearTimeout(w.t); w.rej(new Error(`[${this.name}] socket closed (${code} ${reason})`)); }
      this.waiters = [];
    });
    this.ws.on("error", () => { /* close follows */ });
  }

  async open(): Promise<this> {
    if (this.ws.readyState === WebSocket.OPEN) return this;
    await new Promise<void>((res, rej) => {
      this.ws.once("open", () => res());
      this.ws.once("error", rej);
    });
    return this;
  }

  send(m: Msg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  raw(s: string): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
  }

  /** 이미 받은 로그부터 뒤진 뒤, 없으면 기다린다. */
  wait(pred: string | ((m: Msg) => boolean), ms = 8000): Promise<Msg> {
    const p = typeof pred === "string" ? (m: Msg) => m.type === pred : pred;
    const found = this.log.find(p);
    if (found) return Promise.resolve(found);
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.res !== res);
        rej(new Error(`[${this.name}] timeout waiting for ${typeof pred === "string" ? pred : "pred"} (last: ${this.log.slice(-6).map((m) => m.type).join(",")})`));
      }, ms);
      this.waiters.push({ pred: p, res, rej, t });
    });
  }

  /** 로그를 지우고 새로 오는 것만 기다린다. */
  waitNext(pred: string | ((m: Msg) => boolean), ms = 8000): Promise<Msg> {
    const p = typeof pred === "string" ? (m: Msg) => m.type === pred : pred;
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.res !== res);
        rej(new Error(`[${this.name}] timeout waiting(next) for ${typeof pred === "string" ? pred : "pred"}`));
      }, ms);
      this.waiters.push({ pred: p, res, rej, t });
    });
  }

  last(type: string): Msg | undefined {
    for (let i = this.log.length - 1; i >= 0; i--) if (this.log[i]!.type === type) return this.log[i];
    return undefined;
  }
  count(type: string): number { return this.log.filter((m) => m.type === type).length; }

  close(): void { try { this.ws.close(); } catch { /* */ } }
  /** 네트워크가 끊긴 것처럼 (FIN 없이) 소켓을 파괴한다. */
  kill(): void { try { (this.ws as any).terminate(); } catch { /* */ } }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = Date.now() % 100000;
export function uniq(prefix = "큐"): string {
  seq++;
  return `${prefix}${seq.toString(36)}`;
}

/** 가입 후 authOk를 받아 반환. */
export async function signup(name = uniq(), pw = "qatest1234", adminCode?: string): Promise<{ c: C; auth: Msg; name: string; pw: string }> {
  const c = new C(name);
  await c.open();
  await c.wait("serverInfo");
  c.send({ type: "register", username: name, password: pw, ...(adminCode ? { adminCode } : {}) });
  const auth = await c.wait((m) => m.type === "authOk" || m.type === "error", 20000);
  if (auth.type !== "authOk") throw new Error(`register failed: ${JSON.stringify(auth)}`);
  return { c, auth, name, pw };
}

export async function login(name: string, pw = "qatest1234"): Promise<{ c: C; auth: Msg }> {
  const c = new C(name);
  await c.open();
  await c.wait("serverInfo");
  c.send({ type: "login", username: name, password: pw });
  const auth = await c.wait((m) => m.type === "authOk" || m.type === "error", 20000);
  if (auth.type !== "authOk") throw new Error(`login failed: ${JSON.stringify(auth)}`);
  return { c, auth };
}

export async function tokenLogin(token: string, name = "tok"): Promise<{ c: C; auth: Msg }> {
  const c = new C(name);
  await c.open();
  await c.wait("serverInfo");
  c.send({ type: "tokenLogin", sessionToken: token });
  const auth = await c.wait((m) => m.type === "authOk" || m.type === "error", 20000);
  if (auth.type !== "authOk") throw new Error(`tokenLogin failed: ${JSON.stringify(auth)}`);
  return { c, auth };
}

export async function health(): Promise<any> {
  const r = await fetch(`${HTTP}/healthz`);
  return r.json();
}

/** 방 하나 만들고 봇 3으로 채워 시작한다. host는 인증된 C. */
export async function hostRoomWithBots(host: C, mode = "tonpuu"): Promise<string> {
  host.send({ type: "createRoom" });
  const rc = await host.wait("roomCreated", 10000);
  const code = rc.code as string;
  host.send({ type: "setGameMode", mode });
  for (let i = 0; i < 3; i++) { host.send({ type: "addBot" }); await sleep(60); }
  await sleep(200);
  host.send({ type: "startGame" });
  return code;
}

/**
 * 프롬프트에 자동 응답하는 봇 손. 기본은 "안전한 진행" —
 * discard 가 있으면 첫 discard, 없으면 pass, 그것도 없으면 첫 옵션.
 */
export function autoPlay(c: C, opts: { pick?: (opts: any[]) => any; onRoundOver?: () => void; verbose?: boolean } = {}): void {
  c.onMsg = (m) => {
    if (m.type === "prompt") {
      const p = m.prompt;
      const list: any[] = p.options ?? [];
      if (list.length === 0) return;
      const chosen = opts.pick ? opts.pick(list) : (list.find((o) => o.type === "discard") ?? list.find((o) => o.type === "pass") ?? list[0]);
      setTimeout(() => c.send({ type: "action", actionType: chosen.type, payload: chosen.payload ?? {} }), 5);
    } else if (m.type === "draftOffer") {
      const ch = m.choices?.[0];
      if (ch) setTimeout(() => c.send({ type: "draftPick", stage: m.stage, augmentId: ch.id }), 5);
    } else if (m.type === "roundOver") {
      opts.onRoundOver?.();
      setTimeout(() => c.send({ type: "roundContinue" }), 5);
    }
  };
}
