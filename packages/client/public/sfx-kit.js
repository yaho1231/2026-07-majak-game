/* 이능마작 효과음 랩 — WebAudio 합성 킷
 *
 * packages/client/src/sfx.ts 의 합성 어휘를 정적 랩용으로 포팅 + 확장한 것.
 * 게임 코드와 독립이다 — 여기서 고른 레시피를 나중에 sfx.ts 로 옮긴다.
 *
 * 셀프테스트를 위해 출력 대상(env)을 OfflineAudioContext 로 바꿔칠 수 있게
 * 모든 헬퍼가 호출 시점에 target() 을 읽는다. 모듈 톱레벨에서는 브라우저
 * 오디오 API를 만지지 않는다(node 임포트 스모크 테스트용).
 */

// ───────── 컨텍스트 / 마스터 버스 ─────────

let liveCtx = null; // AudioContext
let liveBus = null; // 마스터 GainNode (comp → softclip → destination)
let masterVol = 0.9;
let envOverride = null; // {ac, out} — 셀프테스트가 바꿔친다

function softClipCurve() {
  const n = 2048;
  const knee = 0.7;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

/** 첫 사용자 제스처에서 호출 — AudioContext 생성/재개 */
export function unlock() {
  if (typeof window === "undefined") return;
  if (liveCtx === null) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor === undefined) return;
    liveCtx = new Ctor();
  }
  if (liveCtx.state === "suspended") void liveCtx.resume();
  if (liveBus === null) {
    const ac = liveCtx;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    const clip = ac.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = "none";
    liveBus = ac.createGain();
    liveBus.gain.value = masterVol;
    liveBus.connect(comp).connect(clip).connect(ac.destination);
  }
}

/** 마스터 볼륨 (0~1) */
export function setMaster(v) {
  masterVol = Math.max(0, Math.min(1, v));
  if (liveBus !== null && liveCtx !== null) {
    liveBus.gain.cancelScheduledValues(liveCtx.currentTime);
    liveBus.gain.setValueAtTime(liveBus.gain.value, liveCtx.currentTime);
    liveBus.gain.linearRampToValueAtTime(masterVol, liveCtx.currentTime + 0.05);
  }
}

/** 셀프테스트용 출력 대상 교체. null 이면 라이브로 복귀 */
export function setEnv(e) {
  envOverride = e;
}

/** 현재 출력 대상 — 없거나 잠겨 있으면 null (그 소리는 조용히 스킵) */
export function target() {
  if (envOverride !== null) return envOverride;
  if (liveCtx === null || liveBus === null || liveCtx.state !== "running") return null;
  return { ac: liveCtx, out: liveBus };
}

// ───────── 공용 유틸 ─────────

export const rand = (lo, hi) => lo + Math.random() * (hi - lo);

const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C5" · "F#4" · "Bb3" → 주파수(Hz). A4=440 */
export function note(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (m === null) throw new Error(`bad note: ${name}`);
  let semi = NOTE_SEMI[m[1]];
  if (m[2] === "#") semi += 1;
  if (m[2] === "b") semi -= 1;
  const oct = Number(m[3]);
  return 440 * 2 ** ((semi - 9 + (oct - 4) * 12) / 12);
}

const MIN_ATTACK = 0.006;

/** 지수 릴리스 — 꼬리를 3τ에서 정리. @returns 소리가 사라지는 시각 */
function release(param, from, dur) {
  const tau = Math.max(0.014, dur * 0.3);
  param.setTargetAtTime(0.0001, from, tau);
  const end = from + tau * 3;
  param.setValueAtTime(0.0001, end);
  return end;
}

let noiseBuf = null;
let noiseBufRate = 0;
function noiseBuffer(ac) {
  if (noiseBuf === null || noiseBufRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    noiseBufRate = ac.sampleRate;
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// ───────── 기본 어휘 (sfx.ts 포팅) ─────────

/**
 * 톤 무리 재생. spec: { freq, at=0, dur=0.12, type="triangle", gain=0.12,
 *   slideTo?, attack?, vib?: {rate=6, depth=freq*0.02} }
 * vib 는 LFO 비브라토 — "뽀용/뿌잉" 계열 귀여운 흔들림에 쓴다.
 */
export function play(tones) {
  const ready = target();
  if (ready === null) return;
  const { ac, out } = ready;
  const now = ac.currentTime;
  for (const t of tones) {
    const at = now + (t.at ?? 0);
    const dur = t.dur ?? 0.12;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = t.type ?? "triangle";
    osc.frequency.setValueAtTime(t.freq, at);
    if (t.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.slideTo), at + dur);
    }
    const peak = t.gain ?? 0.12;
    const atk = Math.max(t.attack ?? 0, Math.min(MIN_ATTACK * 1.5, dur * 0.3));
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    const end = release(g.gain, at + atk, dur);
    if (t.vib !== undefined) {
      const lfo = ac.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = t.vib.rate ?? 6;
      const lg = ac.createGain();
      lg.gain.value = t.vib.depth ?? t.freq * 0.02;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(end + 0.02);
    }
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

/** 킥드럼식 사인 피치드랍 — 타격의 "몸통" */
export function thump(at, o = {}) {
  const ready = target();
  if (ready === null) return;
  const { ac, out } = ready;
  const t = ac.currentTime + at;
  const from = o.from ?? 160;
  const to = o.to ?? 50;
  const dur = o.dur ?? 0.09;
  const gain = o.gain ?? 0.3;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur * 0.8);
  const g = ac.createGain();
  const atk = Math.min(0.008, dur * 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + atk);
  const end = release(g.gain, t + atk, dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(end + 0.02);
}

/** 필터형 노이즈 버스트 — lowpass=붐/슬램, bandpass=스냅/스와이프, highpass=클랙
 *  o: { at=0, dur=0.05, gain=0.2, filter="highpass", freq=1800, q=0.8, freqTo? } */
export function noise(o = {}) {
  const ready = target();
  if (ready === null) return;
  const { ac, out } = ready;
  const t = ac.currentTime + (o.at ?? 0);
  const dur = o.dur ?? 0.05;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = o.filter ?? "highpass";
  f.frequency.setValueAtTime(o.freq ?? 1800, t);
  if (o.freqTo !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqTo), t + dur);
  }
  f.Q.value = o.q ?? 0.8;
  const g = ac.createGain();
  const atk = Math.min(MIN_ATTACK, dur * 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.2, t + atk);
  const end = release(g.gain, t + atk, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, rand(0, 0.5));
  src.stop(end + 0.02);
}

/** 스파클 — 고음 짧은 사인 무리 (키라키라 반짝임) */
export function sparkle(at, o = {}) {
  const count = o.count ?? 6;
  const base = o.base ?? 2100;
  const spread = o.spread ?? 1400;
  const span = o.span ?? 0.35;
  const gain = o.gain ?? 0.05;
  const specs = [];
  for (let i = 0; i < count; i++) {
    specs.push({
      freq: base + Math.random() * spread,
      at: at + (i / count) * span + rand(0, span / count),
      dur: 0.05 + Math.random() * 0.04,
      type: "sine",
      gain: gain * rand(0.6, 1),
    });
  }
  play(specs);
}

/** 패 몸통 노크 — 바둑돌 "탁"의 몸통 (기음 + 비조화 ×1.62, ±1.5% 디튠) */
export function tileBody(at, o = {}) {
  const det = rand(0.985, 1.015);
  const base = (o.base ?? 840) * det;
  const gain = o.gain ?? 0.1;
  const dur = o.dur ?? 0.055;
  play([
    { freq: base, at, dur, type: "sine", gain },
    { freq: base * 1.62, at: at + 0.001, dur: dur * 0.7, type: "sine", gain: gain * 0.42 },
  ]);
}

/** 후로 클랙 — 돌 노크 + 고역 스냅. 한 동작에 "탁" 한 번 */
export function clack(base, gain, dur) {
  tileBody(0, { base, gain, dur });
  noise({ filter: "highpass", freq: 5200, dur: 0.012, gain: gain * 0.3 });
}

// ───────── 확장 어휘 (일본풍 팝 / 미소녀 게임 결) ─────────

/**
 * 벨 — 가산 부분음 벨. 기본 부분음비는 오르골/차임 느낌.
 * o: { freq, gain=0.1, dur=0.6, partials=[[비율, 상대게인], ...], type="sine" }
 * 부분음 예: 오르골 [[1,1],[3.01,0.25],[4.9,0.1]] · 공(gong) [[1,1],[2.05,0.6],[2.76,0.4],[4.07,0.25]]
 */
export function bell(at, o) {
  const partials = o.partials ?? [[1, 1], [2.76, 0.28], [5.4, 0.1]];
  const gain = o.gain ?? 0.1;
  const dur = o.dur ?? 0.6;
  const specs = [];
  for (const [ratio, rel] of partials) {
    specs.push({
      freq: o.freq * ratio,
      at: at + (ratio > 1 ? 0.001 : 0),
      dur: dur * (ratio > 2 ? 0.7 : 1),
      type: o.type ?? "sine",
      gain: gain * rel,
    });
  }
  play(specs);
}

/**
 * 플럭 — 하프/고토 느낌의 뜯는 소리. 톱니를 로우패스로 깎고 필터를 빠르게 닫는다.
 * o: { freq, gain=0.1, dur=0.25, bright=1 (필터 시작 높이 배수), type="sawtooth" }
 */
export function pluck(at, o) {
  const ready = target();
  if (ready === null) return;
  const { ac, out } = ready;
  const t = ac.currentTime + at;
  const dur = o.dur ?? 0.25;
  const gain = o.gain ?? 0.1;
  const bright = o.bright ?? 1;
  const osc = ac.createOscillator();
  osc.type = o.type ?? "sawtooth";
  osc.frequency.setValueAtTime(o.freq, t);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(Math.min(12000, o.freq * 7 * bright), t);
  f.frequency.exponentialRampToValueAtTime(Math.max(200, o.freq * 1.4), t + dur * 0.55);
  f.Q.value = 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  const end = release(g.gain, t + 0.004, dur);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  osc.stop(end + 0.02);
}

/**
 * 뽀용 — 귀여운 피치벤드 사인. from→to 로 미끄러진다 (위로 = 통통, 아래로 = 푹).
 * o: { from, to, dur=0.12, gain=0.1, type="sine", vib? }
 */
export function popBend(at, o) {
  play([
    {
      freq: o.from,
      slideTo: o.to,
      at,
      dur: o.dur ?? 0.12,
      type: o.type ?? "sine",
      gain: o.gain ?? 0.1,
      ...(o.vib !== undefined ? { vib: o.vib } : {}),
    },
  ]);
}

/** 코인 — 2단 핑 (f → f×1.5). 마리오 코인의 부드러운 버전 */
export function coin(at, o = {}) {
  const f = o.freq ?? 1976;
  const gain = o.gain ?? 0.06;
  const type = o.type ?? "square";
  play([
    { freq: f, at, dur: 0.03, type, gain },
    { freq: f * 1.5, at: at + 0.03, dur: 0.09, type, gain: gain * 0.9 },
  ]);
}

/**
 * 글리스 — from→to 를 로그 간격 n음으로 빠르게 훑는다 (하프 글리산도).
 * o: { from, to, steps=8, span=0.18, dur=0.08, type="sine", gain=0.05 }
 */
export function gliss(at, o) {
  const steps = o.steps ?? 8;
  const span = o.span ?? 0.18;
  const specs = [];
  for (let i = 0; i < steps; i++) {
    const r = steps === 1 ? 0 : i / (steps - 1);
    specs.push({
      freq: o.from * (o.to / o.from) ** r,
      at: at + r * span,
      dur: o.dur ?? 0.08,
      type: o.type ?? "sine",
      gain: (o.gain ?? 0.05) * (0.8 + 0.2 * r),
    });
  }
  play(specs);
}

/**
 * 코드 — 여러 음 동시(또는 스트럼). o: { freqs:[..], dur=0.4, type="triangle",
 *   gain=0.08(음당), strum=0 (음 사이 간격 s) } */
export function chord(at, o) {
  const specs = [];
  for (let i = 0; i < o.freqs.length; i++) {
    specs.push({
      freq: o.freqs[i],
      at: at + i * (o.strum ?? 0),
      dur: o.dur ?? 0.4,
      type: o.type ?? "triangle",
      gain: o.gain ?? 0.08,
    });
  }
  play(specs);
}

// ───────── 실물 패 샘플 (현재 게임 소리 재현용) ─────────

const SAMPLE_URLS = { discard: "/sfx/discard.wav", call: "/sfx/call.wav" };
const sampleBufs = {};

/** 게임의 실물 녹음 샘플 프리로드 — 첫 제스처 후 호출 */
export async function loadSamples() {
  if (liveCtx === null) return;
  const ac = liveCtx;
  await Promise.all(
    Object.entries(SAMPLE_URLS).map(async ([name, url]) => {
      if (sampleBufs[name] !== undefined) return;
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        sampleBufs[name] = await ac.decodeAudioData(await r.arrayBuffer());
      } catch {
        /* 없으면 무음 — 게임과 같은 정책 */
      }
    }),
  );
}

/** 샘플 한 방 (게임의 tileShot 포팅). len 을 주면 그 길이만 재생하고 끝을 눕힌다 */
export function shot(name, at, gain, len) {
  const ready = target();
  const buf = sampleBufs[name];
  if (ready === null || buf === undefined) return;
  const { ac, out } = ready;
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  if (len === undefined) {
    g.gain.setValueAtTime(gain, t);
    src.connect(g).connect(out);
    src.start(t);
    return;
  }
  const fade = Math.min(0.014, len * 0.3);
  g.gain.setValueAtTime(gain, t);
  g.gain.setValueAtTime(gain, t + len - fade);
  g.gain.linearRampToValueAtTime(0, t + len);
  src.connect(g).connect(out);
  src.start(t, 0, len);
}
