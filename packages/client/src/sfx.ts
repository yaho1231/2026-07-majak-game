/**
 * sfx — WebAudio 합성 효과음 (에셋 없이 게임감을 만든다).
 * 첫 사용자 입력 후에만 AudioContext를 연다 (브라우저 정책).
 */

let ctx: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx === null) {
    try {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (Ctor === undefined) return null;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * 브라우저 자동재생 정책 대응 — 첫 사용자 입력(클릭·터치·키) 시 AudioContext를
 * 생성·resume 한다. 이걸 안 하면 서버 이벤트(봇 타패·새 국 등)로 처음 소리를 내려 할 때
 * context가 suspended 상태로 만들어져 이후로도 소리가 안 나는 문제가 있다.
 */
function installAudioUnlock(): void {
  if (typeof window === "undefined") return;
  const unlock = (): void => {
    const ac = audio();
    // resume은 비동기라 첫 소리가 유실될 수 있어, 무음 버퍼를 한 번 흘려 확실히 깨운다
    if (ac !== null && ac.state !== "closed") {
      try {
        const src = ac.createBufferSource();
        src.buffer = ac.createBuffer(1, 1, ac.sampleRate);
        src.connect(ac.destination);
        src.start(0);
      } catch {
        /* 이미 running이면 무시 */
      }
    }
    if (ac !== null && ac.state === "running") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}

installAudioUnlock();

interface ToneSpec {
  freq: number;
  /** 시작 지연 (초) */
  at?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  /** 주파수 슬라이드 목적지 */
  slideTo?: number;
}

function play(tones: ToneSpec[]): void {
  const ac = audio();
  if (ac === null) return;
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
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(t.gain ?? 0.12, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }
}

/** 잡음 버스트 (딱— 하는 타패음) */
function clack(at = 0, gain = 0.2): void {
  const ac = audio();
  if (ac === null) return;
  const start = ac.currentTime + at;
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1800;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(start);
}

export const sfx = {
  /** 패 버리기 */
  discard(): void {
    clack(0, 0.18);
  },
  /** 리치 선언 */
  riichi(): void {
    clack(0, 0.25);
    play([
      { freq: 660, dur: 0.09, type: "square", gain: 0.07 },
      { freq: 990, at: 0.07, dur: 0.22, type: "square", gain: 0.08, slideTo: 740 },
    ]);
  },
  /** 치/펑/깡 */
  call(): void {
    clack(0, 0.22);
    play([{ freq: 220, dur: 0.16, type: "sawtooth", gain: 0.1, slideTo: 130 }]);
  },
  /** 론/쯔모 컷인 */
  win(): void {
    play([
      { freq: 523, dur: 0.14, gain: 0.12 },
      { freq: 659, at: 0.1, dur: 0.14, gain: 0.12 },
      { freq: 784, at: 0.2, dur: 0.3, gain: 0.14 },
      { freq: 1046, at: 0.3, dur: 0.42, gain: 0.12 },
    ]);
  },
  /** 만관 이상 (역만 미만) — 일반 화료보다 화려한 상승 팡파르 */
  mangan(): void {
    play([
      { freq: 523, dur: 0.14, gain: 0.12 },
      { freq: 659, at: 0.08, dur: 0.16, gain: 0.13 },
      { freq: 784, at: 0.18, dur: 0.22, gain: 0.14 },
      { freq: 1046, at: 0.3, dur: 0.4, gain: 0.14 },
      { freq: 1318, at: 0.42, dur: 0.5, gain: 0.12 },
    ]);
  },
  /** 역만 등장 */
  yakuman(): void {
    play([
      { freq: 196, dur: 0.5, type: "sawtooth", gain: 0.12 },
      { freq: 392, at: 0.12, dur: 0.5, type: "sawtooth", gain: 0.1 },
      { freq: 587, at: 0.26, dur: 0.6, gain: 0.13 },
      { freq: 784, at: 0.4, dur: 0.8, gain: 0.13 },
    ]);
  },
  /** 유국 */
  draw(): void {
    play([
      { freq: 440, dur: 0.2, gain: 0.08 },
      { freq: 349, at: 0.16, dur: 0.3, gain: 0.08 },
    ]);
  },
  /** 드래프트 카드 등장 */
  draft(): void {
    play([
      { freq: 587, dur: 0.1, gain: 0.07 },
      { freq: 880, at: 0.08, dur: 0.16, gain: 0.08 },
    ]);
  },
  /** 드래프트 픽 확정 */
  pick(): void {
    play([
      { freq: 784, dur: 0.1, gain: 0.1 },
      { freq: 1175, at: 0.07, dur: 0.24, gain: 0.1 },
    ]);
  },
  /** 새 국 시작 */
  round(): void {
    play([
      { freq: 392, dur: 0.16, gain: 0.09 },
      { freq: 523, at: 0.12, dur: 0.28, gain: 0.1 },
    ]);
  },
  /** 점수 획득/차감 틱 */
  score(): void {
    play([{ freq: 1318, dur: 0.06, type: "square", gain: 0.05 }]);
  },
};
