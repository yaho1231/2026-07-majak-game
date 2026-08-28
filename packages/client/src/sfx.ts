/**
 * sfx — WebAudio 합성 효과음 (에셋 없이 게임감을 만든다).
 * 첫 사용자 입력 후에만 AudioContext를 연다 (브라우저 정책).
 *
 * 설계:
 * - 모든 소리는 마스터 버스(Gain→DynamicsCompressor)로 나간다 — 레이어를
 *   겹쳐도 합산 클리핑 없이 트랜지언트("탁")가 산다. 효과음 토글도 이 게인 하나로.
 * - 타격의 "무게"는 킥드럼식 사인 피치드랍(thump), 질감은 필터형 노이즈(noiseBurst),
 *   반짝임은 고음 사인 무리(sparkle)로 만든다.
 * - **어택·릴리스 규약 (2026-07-22, 52차)**: 어택은 최소 `MIN_ATTACK`(6ms) 페이드인
 *   (0이면 계단 파형의 "턱" 클릭). 릴리스는 `setTargetAtTime` 지수 감쇠 — 단, τ를 작게
 *   잡고 3τ에서 끊는다. **잔향·에코는 금지**(유저 확정): 무게는 꼬리가 아니라
 *   저역 임팩트(서브 thump)와 몸통 공명(tileBody)에서 나와야 한다.
 * - **실물 녹음 우선**: 타패·손패 훑기·후로(치·펑·깡)의 패 타격은 유저가 녹음한 실제
 *   마작패 소리를 쓴다(`SAMPLE_URLS`). 합성은 **녹음에 없는 대역**(초저역 thump)과
 *   타격이 아닌 소리(치의 "스윽" 마찰음)만 담당한다 — 진짜 위에 가짜 패 소리를 겹치지 않는다.
 * - **음색 계열 분리**: 후로는 실물 패 타악, 증강 발동은 **큰 북 "둥"**(깊은 저역 위주) —
 *   음역대가 갈려 소리만 듣고 구분된다.
 * - **신스 어휘 금지 (2026-07-22 유저 확정)**: 필터 스윕 라이저·벨 배음·글리치·triangle
 *   장음은 "사이버네틱" 느낌의 주범 — 실물 타악(돌·나무·북·판)의 물리만 쓴다.
 * - 컷인 연출과 동기: 컷인 글자 슬램이 화면에 꽂히는 시점(~0.2s)에 사운드 피크가
 *   오도록 각 효과음이 내부에서 예열(라이저)→임팩트로 스케줄한다.
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
  // ⚠ `"suspended"` 하나만 보면 안 된다 (2026-08-29). iOS Safari 는 전화·알람·다른 앱의
  // 소리로 오디오가 끊기면 컨텍스트를 **`"interrupted"`** 로 둔다 — 표준 상태값이 아니라
  // 위 비교에 걸리지 않아 resume 이 영영 안 불렸고, 그 뒤로는 소리가 통째로 안 났다.
  // running / closed 가 아닌 모든 상태는 «깨워야 하는 상태»로 본다.
  if (ctx.state !== "running" && ctx.state !== "closed") void ctx.resume();
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
      loadSamples(); // 첫 입력에 프리로드 — 첫 타패·후로부터 소리가 나게
    }
  };
  /*
   * ⚠ 리스너를 **떼지 않는다** (2026-08-29).
   *
   * 예전에는 한 번 running 이 되면 세 리스너를 전부 떼었다. 그런데 오디오가 한 번
   * 열렸다고 계속 열려 있는 게 아니다 — 탭을 뒤로 보내거나 화면을 끄면 브라우저가
   * 컨텍스트를 스스로 suspend 하고, iOS 는 전화 한 통에 interrupted 로 만든다.
   * 그렇게 잠든 뒤에는 다시 깨울 손잡이가 아무 데도 없어서, 돌아와도 **그 판이
   * 끝날 때까지 소리가 안 났다**(「가끔 소리가 안 난다」의 실체).
   * 리스너는 passive 로 계속 붙여 둔다 — 이미 running 이면 unlock 은 사실상 무비용이다.
   */
  const opts: AddEventListenerOptions = { passive: true };
  window.addEventListener("pointerdown", unlock, opts);
  window.addEventListener("keydown", unlock, opts);
  window.addEventListener("touchstart", unlock, opts);
  // 탭으로 돌아온 순간·bfcache 복귀에도 곧바로 깨운다 — 첫 소리를 기다리지 않는다.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") audio();
  });
  window.addEventListener("pageshow", () => {
    audio();
  });
}

installAudioUnlock();

// ───────── 마스터 버스: Gain → Compressor → SoftClip → destination ─────────

let masterBus: GainNode | null = null;
let sfxEnabled = true;

/**
 * 무지연 소프트 클리퍼 커브 — |x|<0.7은 **완전 선형**(색이 전혀 붙지 않는다), 그 위로만
 * 부드럽게 눕혀 1.0을 넘기지 않는다.
 *
 * 브릭월 리미터를 DynamicsCompressor로 만들지 않는 이유는 순수하게 **지연**이다:
 * 브라우저의 DynamicsCompressorNode는 룩어헤드용 고정 프리딜레이(kParamPreDelay=6ms,
 * Blink/WebKit/Gecko 공통)를 신호 경로에 물고 있어서, 마스터단에 하나 달 때마다
 * **모든 효과음이 6ms씩 늦는다**. WaveShaper는 샘플 단위 함수라 지연이 0이다.
 */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const knee = 0.7; // 이 아래로는 손대지 않는다
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

function bus(): GainNode | null {
  const ac = audio();
  if (ac === null) return null;
  if (masterBus === null) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; // dB — 레이어 합산 피크가 여기부터 눌린다
    comp.knee.value = 12;
    comp.ratio.value = 4; // 과한 비율은 타격 위계를 평탄화하고 롱테일에 펌핑을 만든다
    comp.attack.value = 0.003; // 3ms — 트랜지언트 앞머리는 살린다
    comp.release.value = 0.25;
    // 브릭월 안전장치 — 효과음 레이어·연타가 겹쳐 0dBFS를 넘으면 하드클립되며 "깨지는"
    // 소리가 난다. 예전엔 여기에 DynamicsCompressor를 하나 더 달았는데, 그 룩어헤드가
    // 모든 소리에 6ms를 얹고 있었다(컴프까지 합쳐 12ms). 무지연 WaveShaper로 교체.
    const clip = ac.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = "none"; // 오버샘플링은 구현에 따라 리샘플러 지연이 붙는다 — 쓰지 않는다
    masterBus = ac.createGain();
    masterBus.gain.value = targetGain();
    masterBus.connect(comp).connect(clip).connect(ac.destination);
  }
  return masterBus;
}

/**
 * 오디오 컨텍스트를 깨운다 — 관전 시작처럼, 사용자 제스처 직후지만 이후로는
 * 조작이 거의 없는 진입점에서 호출한다. 관전자는 게임 내내 클릭할 일이 없어
 * 컨텍스트가 suspended로 남으면 효과음·BGM이 통째로 안 나는데, 이를 막는다.
 * (BGM 엘리먼트는 지연 로드 유지 — 여기서 프리로드하지 않는다.)
 */
export function resumeAudio(): void {
  audio(); // 생성 + suspended면 내부에서 resume() 시도
}

/** 효과음 전체 on/off — 마스터 게인 뮤트라 호출부는 손대지 않는다. */
/**
 * 효과음 음량 (0~1). 예전에는 on/off 뿐이었다 (감사 2026-08-17 §5-4) —
 * BGM은 슬라이더가 둘인데 효과음만 이분법이라, "소리는 듣고 싶은데 이렇게 크진
 * 않다"는 자리가 없었다. **마스터 게인은 이미 있었고 손잡이만 없던 것이다.**
 */
let sfxVolume = 1;

/** 지금 걸려야 할 실제 게인 — 꺼져 있으면 0, 아니면 기준(0.9) × 사용자 음량. */
function targetGain(): number {
  return sfxEnabled ? 0.9 * sfxVolume : 0;
}

function rampMaster(): void {
  if (masterBus === null || ctx === null) return;
  // 짧은 램프로 뮤트/해제 — 순간 게인 점프의 "딱" 클릭 방지.
  // 램프는 직전 스케줄 이벤트부터 시작하므로 현재값 앵커를 먼저 찍어야 실제로 램프가 된다.
  masterBus.gain.cancelScheduledValues(ctx.currentTime);
  masterBus.gain.setValueAtTime(masterBus.gain.value, ctx.currentTime);
  masterBus.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 0.05);
}

export function setSfxEnabled(v: boolean): void {
  sfxEnabled = v;
  rampMaster();
}

export function setSfxVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(1, v));
  rampMaster();
}

/**
 * 재생 가드 — running 상태의 컨텍스트에서만 스케줄한다.
 * suspended 상태(첫 입력 전·재접속 자동 복원 중)에 쌓인 소리가
 * 첫 클릭 순간 한꺼번에 터지는 폭발을 막는다.
 */
function readyAudio(): { ac: AudioContext; out: GainNode } | null {
  const ac = audio();
  const out = bus();
  if (ac === null || out === null || ac.state !== "running") return null;
  return { ac, out };
}

import { RIICHI_BGM_SRCS as RIICHI_BGM_TRACK_SRCS } from "@majak/core";

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * 최소 어택(초). 게인을 0에서 목표로 순간 점프시키면 파형이 계단으로 시작해
 * "턱" 하는 클릭이 들린다 — 6ms 페이드인이면 트랜지언트는 살면서 클릭만 사라진다.
 */
const MIN_ATTACK = 0.006;

/**
 * 자연스러운 릴리스 — 지수 감쇠로 꼬리를 남기고 끝에서만 0으로 정리한다.
 * `setTargetAtTime`은 시간상수 τ로 목표값에 점근하므로 급정거가 없다.
 * @returns 실제로 소리가 사라지는 시각 (노드 stop 예약용)
 */
function release(param: AudioParam, from: number, dur: number): number {
  // 짧고 단단하게 — τ를 작게, 꼬리도 3τ에서 끊는다 (질질 끄는 잔향 금지)
  const tau = Math.max(0.014, dur * 0.3);
  param.setTargetAtTime(0.0001, from, tau);
  const end = from + tau * 3;
  param.setValueAtTime(0.0001, end);
  return end;
}

// ───────── 공유 노이즈 버퍼 (1초, 1회 생성·재사용 — 연타 GC 방지) ─────────

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noiseBuf === null) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

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
  const ready = readyAudio();
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
    const atk = Math.min(MIN_ATTACK * 1.5, dur * 0.3);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    const end = release(g.gain, at + atk, dur);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

/** 킥드럼식 사인 피치드랍 — 모든 타격의 "몸통". 8ms 어택으로 펀치는 살리고 클릭은 없앤다. */
function thump(
  at: number,
  o: { from?: number; to?: number; dur?: number; gain?: number } = {},
): void {
  const ready = readyAudio();
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

/** 필터형 노이즈 버스트 — lowpass=붐/슬램, bandpass=스냅/스와이프, highpass=클랙 */
interface NoiseSpec {
  at?: number;
  dur?: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  q?: number;
  /** 필터 주파수 슬라이드 — 스와이프·라이저용 */
  freqTo?: number;
}

function noiseBurst(o: NoiseSpec = {}): void {
  const ready = readyAudio();
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
  src.start(t, rand(0, 0.5)); // 랜덤 오프셋 → 같은 버퍼라도 매번 다른 결
  src.stop(end + 0.02);
}

/** 스파클 — 고음 짧은 사인 무리 (반짝임·코인 캐스케이드) */
function sparkle(
  at: number,
  o: { count?: number; base?: number; spread?: number; span?: number; gain?: number } = {},
): void {
  const count = o.count ?? 6;
  const base = o.base ?? 2100;
  const spread = o.spread ?? 1400;
  const span = o.span ?? 0.35;
  const gain = o.gain ?? 0.05;
  const specs: ToneSpec[] = [];
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

/**
 * 패 몸통 노크 — **바둑돌을 판에 내려놓는 "탁"** 의 몸통.
 *
 * 실물 돌 소리는 배음이 거의 없는 단단한 노크다: 기음 + 비조화 부분음(×1.62) 두 개가
 * 50ms 안에 감쇠하면 "돌", 길게 울리면 "실로폰(신스)"이 된다. 매번 ±1.5% 디튠해
 * 같은 돌이 연속으로 떨어져도 기계음처럼 안 들리게 한다.
 * (triangle·긴 부분음·필터 스윕은 전부 금지 — "사이버네틱" 느낌의 주범이었다.)
 */
function tileBody(
  at: number,
  o: { base?: number; gain?: number; dur?: number } = {},
): void {
  const det = rand(0.985, 1.015);
  const base = (o.base ?? 840) * det;
  const gain = o.gain ?? 0.1;
  const dur = o.dur ?? 0.055;
  play([
    { freq: base, at, dur, type: "sine", gain },
    { freq: base * 1.62, at: at + 0.001, dur: dur * 0.7, type: "sine", gain: gain * 0.42 },
  ]);
}

/**
 * 후로 클랙 — 한 동작에 **"탁" 한 번**. tileBody(돌 노크) + 고역 스냅(tick)으로 타패처럼
 * 깔끔하다. 종류는 리듬이 아니라 **음색·무게**로 구분한다(base=음색, dur=길이).
 * (2026-07-25 유저 확정: 치=딥 660 · 펑=드라이 820 · 깡=우드 1060.)
 */
function nakiClack(base: number, gain: number, dur: number): void {
  tileBody(0, { base, gain, dur });
  noiseBurst({ filter: "highpass", freq: 5200, dur: 0.012, gain: gain * 0.3 }); // 어택 스냅
}

// ───────── 실물 패 녹음 샘플 (유저 제공) ─────────
//
// 같은 녹음에서 뽑은 타격 2종. 둘 다 **그대로** 재생한다 — 피치 시프트·변주·로테이션 없음.
//  · discard.wav (83ms, 밝고 빠름) — 타패, 그리고 그 앞머리를 잘라 쓰는 손패 훑기음
//  · call.wav    (103ms, 묵직함)  — 치·펑·깡. 여러 장을 판에 내려놓는 무게가 필요해 무거운 쪽.
// **한 번의 동작에는 소리 한 번**이 원칙이다. 레이어를 겹치거나 변형을 돌리면
// "여러 소리가 섞여 여러 번 난다"고 들린다.
// 샘플이 아직 없으면 소리를 내지 않는다(합성 폴백 없음 — 다른 소리가 나느니 무음).

type SampleName = "discard" | "call";
const SAMPLE_URLS: Record<SampleName, string> = {
  discard: "/sfx/discard.wav",
  call: "/sfx/call.wav",
};
/**
 * 타패음을 한 번 낸 뒤 **남의 타패음**을 막는 시간(ms).
 *
 * 근거: 봇은 think-time이 0이고(`BotAgent.decide`), 서버는 결정마다 view를 쏜다
 * (`HanchanController` 턴 루프). 그래서 내가 한 번 버리면 봇 3명의 타패가 **수 ms 안에**
 * 연달아 도착한다 — 그대로 다 내면 "타타타타"가 되고, 간격을 줘서 펼치면 기계 연타가 된다.
 * 이 창 안에 몰려온 남의 타패는 통째로 버려서 **한 번 버리면 "탁" 한 번**을 보장한다.
 * (봇에 think-time이 생기면 각 타패가 이 창 밖으로 벌어져 자연히 하나씩 다 울린다.)
 */
const OTHERS_MUTE_MS = 260;

/**
 * 손패 훑기음 — **타패음과 같은 녹음의 앞부분만** 잘라 쓴다(별도 파일 없음).
 * 같은 소스를 쓰므로 재질이 저절로 일치하고, 타패음을 바꾸면 이 소리도 함께 따라간다.
 * `LEN`은 타격의 앞머리만 남기는 길이 — 잘린 자리는 tileShot이 눕혀 클릭을 없앤다.
 */
const HOVER_LEN = 0.05;
const HOVER_GAIN = 0.1;
/** 손패를 빠르게 훑을 때 "타라라락"의 밀도 상한(ms) */
const HOVER_MIN_MS = 32;

const sampleBufs: Partial<Record<SampleName, AudioBuffer>> = {};
const sampleLoading: Partial<Record<SampleName, boolean>> = {};

/** 패 샘플 프리로드 — AudioContext가 살아있을 때 시작한다 */
function loadSamples(): void {
  const ac = audio();
  if (ac === null) return;
  for (const name of Object.keys(SAMPLE_URLS) as SampleName[]) {
    if (sampleLoading[name] === true) continue;
    sampleLoading[name] = true;
    fetch(SAMPLE_URLS[name])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => {
        sampleBufs[name] = buf;
      })
      .catch(() => {
        sampleLoading[name] = false; // 일시적 실패면 다음에 다시 받는다
      });
  }
}

/**
 * 녹음 타격 한 방을 예약한다. 후로음은 컷인 글자가 꽂히는 시점(~0.2s)에 마지막 타가
 * 오도록 짜여 있어, `at` 오프셋을 그대로 유지하는 게 중요하다.
 * @param at   지금으로부터의 지연(초)
 * @param gain 재생 게인 (타패 = 0.75 기준으로 위계를 잡는다)
 * @param len  이 길이만 재생하고 끝을 눕힌다(초). 생략하면 샘플 전체.
 */
function tileShot(name: SampleName, at: number, gain: number, len?: number): void {
  const ready = readyAudio();
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

/** 마지막 타패음 시각(epoch ms) — 호버음이 타패음에 붙어 나는 걸 막는 데 쓴다 */
let lastDiscardAt = 0;
/** 슬라이드 레이트리밋 — 빠르게 쓸면 노이즈가 합산돼 클리핑(깨짐)나므로 40ms 간격 */
let lastSlideAt = 0;
/** 호버 레이트리밋 — 손패를 빠르게 쓸 때 "타라라락"의 밀도 상한 */
let lastHoverAt = 0;

export const sfx = {
  /**
   * 패 버리기 — 유저가 직접 녹음한 마작패 "탁". 녹음 파일 하나를 그대로 재생한다
   * (변주·로테이션·피치 시프트·합성 레이어 없음).
   *
   * **한 번 버리면 "탁" 한 번**이 절대 조건이다. 내 타패는 언제나 즉시 울리고,
   * 그 직후 `OTHERS_MUTE_MS` 안에 몰려오는 남의 타패는 버린다(위 상수 주석 참조).
   * @param own 내 타패면 true (기본) — 타인 타패는 살짝 작게
   */
  discard(own = true): void {
    loadSamples();
    const now = Date.now();
    // 남의 타패는 방금 난 "탁"에 묻어가지 않는다 — 봇 연타를 하나로 접는다
    if (!own && now - lastDiscardAt < OTHERS_MUTE_MS) return;
    if (readyAudio() === null || sampleBufs.discard === undefined) return;
    lastDiscardAt = now;
    tileShot("discard", 0, own ? 0.75 : 0.55);
  },

  /**
   * 손패 훑기 — 패 위로 커서가 지나갈 때의 아주 작은 "톡".
   *
   * **타패음과 같은 녹음의 앞머리(50ms)를 작게 재생한 것**이라 재질이 정확히 같다 —
   * 타패가 "탁"이면 이건 그 축소판이고, 손패를 빠르게 쓸면 "타라라락"이 된다.
   * 합성음이 아니므로 타패음을 교체하면 이 소리도 같이 바뀐다.
   */
  hoverTile(): void {
    const now = Date.now();
    // 타패 직후에는 손패가 다시 배열돼 커서가 가만히 있어도 다른 패 위로 올라간다 —
    // 브라우저가 그 mouseenter를 쏘면 "탁" 바로 뒤에 "톡"이 붙어 한 번의 타패가
    // 두 번 난 것처럼 들린다. 타패 직후 잠깐은 훑기음을 내지 않는다.
    if (now - lastDiscardAt < 250) return;
    if (now - lastHoverAt < HOVER_MIN_MS) return;
    if (readyAudio() === null || sampleBufs.discard === undefined) return;
    lastHoverAt = now;
    tileShot("discard", 0, HOVER_GAIN, HOVER_LEN);
  },

  /**
   * 패 슬라이드 — 비단이 스치는 "사락" (~38ms). 손패를 마우스로 끌어 슬롯을 하나
   * 넘길 때마다 한 번. (2026-08-03 유저 확정: 효과음 랩 `slide-silk`)
   *
   * 좁은 밴드패스(Q=2.2)를 1.6k→3.2k로 **올려** 훑는 노이즈 한 겹뿐이다. 예전엔
   * 고정 밴드패스 + 고역 겹치기 2겹이었는데, 그건 마른 "칙"이라 연속으로 넘길 때
   * 거칠었다. 상행 스윕은 결이 부드러워 같은 게인에서도 덜 쏜다.
   */
  slide(): void {
    const now = Date.now();
    if (now - lastSlideAt < 40) return;
    lastSlideAt = now;
    noiseBurst({ filter: "bandpass", freq: 1600, freqTo: 3200, q: 2.2, dur: 0.038, gain: 0.05 });
  },

  /**
   * 리치 선언 — 1단 임팩트(패를 눕히는 "탁!") 후 금속성 "샤킹—" 링.
   * 배너 글자가 꽂히는 ~0.2s에 링이 울리도록 예열을 두고 시작한다.
   */
  riichi(): void {
    loadSamples();
    // 패를 눕히는 임팩트 — 후로와 같은 실물 녹음(call.wav). 초저역만 thump가 받친다.
    tileShot("call", 0.08, 0.62);
    thump(0.08, { from: 200, to: 58, dur: 0.11, gain: 0.28 });
    // 금속 링 — 비조화 배음비 1 : 2.01 : 2.76 (벨 물리학)
    play([
      { freq: 1245, at: 0.18, dur: 0.4, type: "triangle", gain: 0.07 },
      { freq: 1245 * 2.01, at: 0.18, dur: 0.34, type: "sine", gain: 0.05 },
      { freq: 1245 * 2.76, at: 0.19, dur: 0.28, type: "sine", gain: 0.035 },
    ]);
    sparkle(0.25, { count: 5, base: 2600, spread: 1800, span: 0.24, gain: 0.045 });
  },

  // ── 후로(치·펑·깡) — 단타 "탁" (2026-07-25 유저 확정) ──
  //
  // 예전엔 실물 녹음(call.wav)을 여러 번 쳐 "타라라락"이 났다. 유저 확정에 따라
  // **한 동작에 "탁" 한 번**만 낸다. 종류는 리듬이 아니라 **음색·무게**로 구분한다:
  //  · 치 = 딥(낮고 둥근) · 펑 = 드라이(마른) · 깡 = 우드(높고 짧은)
  // 전부 nakiClack(합성 클랙 + 고역 스냅) — 타패처럼 깔끔한 계열로 통일.
  // (리치·론·쯔모·역만만 화려한 소리, 그 외는 깔끔하게 — 유저 방향.)

  /** 치 — 딥 "탁" (낮고 둥글다) */
  callChi(): void {
    nakiClack(660, 0.26, 0.065);
  },

  /** 펑 — 드라이 "탁" (마른 클랙) */
  callPon(): void {
    nakiClack(820, 0.24, 0.055);
  },

  /** 깡 — 우드 "탁" (높고 짧다) */
  callKan(): void {
    nakiClack(1060, 0.22, 0.04);
  },

  /**
   * 증강 발동 — **큰 북을 한 번 치는 "둥"**. 묵직하고 짧다.
   *
   * 신스 어휘(필터 스윕·벨 배음·글리치)는 전부 뺐다 — "사이버네틱"의 주범.
   * 남긴 것은 실물 타악의 물리뿐: 깊은 몸통(피치 드랍) + 가죽 질감(저역 노이즈) +
   * 낮은 나무 테두리 노크. 0.4s 안에 끝나고 저역이라 후로(밝은 돌 클랙)와 안 겹친다.
   * @param weight 0=가벼운 발동 / 1=무거운 발동 (북이 더 크고 깊어진다)
   */
  augment(weight = 0): void {
    const w = Math.max(0, Math.min(1, weight));
    // 북 몸통 — "둥". 깊은 피치 드랍, 어택은 부드럽게
    thump(0.02, { from: 96 - w * 16, to: 38, dur: 0.2 + w * 0.06, gain: 0.42 + w * 0.09 });
    // 가죽 질감 — 저역 노이즈 한 겹
    noiseBurst({ at: 0.02, filter: "lowpass", freq: 300, dur: 0.09, gain: 0.18 });
    // 나무 테두리 — 낮은 노크가 정체를 찍는다
    tileBody(0.025, { base: 300 - w * 60, gain: 0.09, dur: 0.09 });
  },

  /** 증강 정보성 알림(지목당함·봉인됨 등) — 발동음의 축소판. 작은 북 "둑" */
  augmentSoft(): void {
    thump(0.01, { from: 88, to: 42, dur: 0.12, gain: 0.17 });
    tileBody(0.015, { base: 280, gain: 0.055, dur: 0.07 });
  },

  /**
   * 후로 버튼 등장 — 치·펑·깡·론 버튼이 뜰 때의 은은한 "삑".
   * 부드러운 어택의 짧은 차임 하나 — 주의를 끌되 놀라게 하지 않는다.
   */
  callPrompt(): void {
    play([
      { freq: 1040, at: 0, dur: 0.13, type: "sine", gain: 0.05 },
      { freq: 2080, at: 0.005, dur: 0.09, type: "sine", gain: 0.016 },
    ]);
  },

  /** 론 — 라이저 예열 후 0.2s에 충격(슬램+서브베이스 드랍), 잔향 위로 팡파르 */
  ron(): void {
    noiseBurst({ filter: "bandpass", freq: 500, freqTo: 3600, q: 1.8, dur: 0.18, gain: 0.07 });
    // 임팩트 (컷인 글자 슬램 ~0.2s 동기)
    noiseBurst({ at: 0.2, filter: "lowpass", freq: 420, dur: 0.16, gain: 0.34 });
    noiseBurst({ at: 0.2, filter: "bandpass", freq: 1300, q: 0.9, dur: 0.06, gain: 0.22 });
    thump(0.2, { from: 130, to: 32, dur: 0.16, gain: 0.42 });
    play([{ freq: 88, at: 0.2, dur: 0.34, type: "sine", gain: 0.26, slideTo: 30 }]);
    // 팡파르 C5-E5-G5-C6 (triangle 본체 + square 광택)
    play([
      { freq: 523, at: 0.38, dur: 0.11, type: "triangle", gain: 0.11 },
      { freq: 523, at: 0.38, dur: 0.11, type: "square", gain: 0.04 },
      { freq: 659, at: 0.47, dur: 0.11, type: "triangle", gain: 0.12 },
      { freq: 784, at: 0.56, dur: 0.13, type: "triangle", gain: 0.13 },
      { freq: 1046, at: 0.66, dur: 0.3, type: "triangle", gain: 0.13 },
      { freq: 1046, at: 0.66, dur: 0.3, type: "square", gain: 0.045 },
    ]);
    sparkle(0.7, { count: 6, base: 2100, spread: 1600, span: 0.25, gain: 0.05 });
  },

  /**
   * 더블 론 — 두 사람이 **동시에** 손을 뻗은 소리.
   *
   * ⚠ `ron()` 을 두 번 부르면 안 된다. 이 엔진의 스케줄링은 전부 **절대 시각**
   *   기준이라(`play`/`thump`/`noiseBurst` 의 `at` 은 now 에 더한다) 두 호출이
   *   샘플 단위로 겹쳐 위상이 그대로 더해진다 — 새로운 소리가 아니라 **볼륨만
   *   두 배**인 같은 소리가 되고, 마스터에서 클리핑까지 난다.
   *
   * 그래서 «두 명»은 **두 번째 겹**으로 말한다: 본체는 론 그대로 두고, 임팩트와
   * 팡파르를 100ms 뒤에 반음 위(≈1.06배)로 한 겹 더 얹어 «따-닥» 으로 갈라 놓는다.
   * 두 번째 겹은 본체보다 작다 — 중계 화면이라 놀라게 하는 것이 목적이 아니다.
   */
  doubleRon(): void {
    sfx.ron();
    const d = 0.1; // 두 번째 사람의 «닥» — 이보다 짧으면 한 소리로 뭉친다
    const s = 1.06; // 반음
    noiseBurst({ at: 0.2 + d, filter: "lowpass", freq: 460, dur: 0.14, gain: 0.19 });
    noiseBurst({ at: 0.2 + d, filter: "bandpass", freq: 1400, q: 0.9, dur: 0.06, gain: 0.12 });
    thump(0.2 + d, { from: 138, to: 34, dur: 0.15, gain: 0.24 });
    play([
      { freq: 523 * s, at: 0.38 + d, dur: 0.11, type: "triangle", gain: 0.06 },
      { freq: 659 * s, at: 0.47 + d, dur: 0.11, type: "triangle", gain: 0.065 },
      { freq: 784 * s, at: 0.56 + d, dur: 0.13, type: "triangle", gain: 0.07 },
      { freq: 1046 * s, at: 0.66 + d, dur: 0.3, type: "triangle", gain: 0.07 },
    ]);
  },

  /** 쯔모 — 론과 구분: 픽업음 두 개 → 더 높은 슬램("패를 내려치는 딱!") → 밝고 빠른 팡파르 */
  tsumo(): void {
    play([
      { freq: 392, at: 0.06, dur: 0.07, type: "triangle", gain: 0.07 },
      { freq: 494, at: 0.13, dur: 0.07, type: "triangle", gain: 0.08 },
    ]);
    thump(0.2, { from: 220, to: 62, dur: 0.11, gain: 0.36 });
    noiseBurst({ at: 0.2, filter: "bandpass", freq: 2600, q: 1.2, dur: 0.05, gain: 0.24 });
    noiseBurst({ at: 0.2, filter: "lowpass", freq: 600, dur: 0.1, gain: 0.2 });
    play([
      { freq: 659, at: 0.33, dur: 0.1, type: "triangle", gain: 0.11 },
      { freq: 784, at: 0.41, dur: 0.1, type: "triangle", gain: 0.12 },
      { freq: 1046, at: 0.49, dur: 0.12, type: "triangle", gain: 0.13 },
      { freq: 1318, at: 0.58, dur: 0.28, type: "triangle", gain: 0.12 },
      { freq: 1318, at: 0.58, dur: 0.28, type: "square", gain: 0.04 },
    ]);
    sparkle(0.62, { count: 6, base: 2400, spread: 1800, span: 0.22, gain: 0.05 });
  },

  /**
   * 만관~삼배만 — 등급이 오를수록 임팩트가 무거워지고 팡파르 음이 늘며(4→7)
   * 간격이 조여든다. 하네만부터 코인(마리오식 2단 핑) 캐스케이드.
   */
  mangan(tier: "mangan" | "haneman" | "baiman" | "sanbaiman" = "mangan"): void {
    const rank = { mangan: 1, haneman: 2, baiman: 3, sanbaiman: 4 }[tier];
    noiseBurst({ filter: "bandpass", freq: 400, freqTo: 3000, q: 1.8, dur: 0.18, gain: 0.07 });
    thump(0.2, {
      from: 150 - rank * 8,
      to: 40 - rank * 2,
      dur: 0.12 + rank * 0.01,
      gain: 0.3 + rank * 0.04,
    });
    noiseBurst({ at: 0.2, filter: "lowpass", freq: 500, dur: 0.12, gain: 0.2 + rank * 0.03 });
    const scale = [523, 659, 784, 1046, 1318, 1568, 2093]; // C E G C E G C
    const notes = 3 + rank;
    const step = 0.1 - rank * 0.008;
    const specs: ToneSpec[] = [];
    for (let i = 0; i < notes; i++) {
      const last = i === notes - 1;
      specs.push({
        freq: scale[i]!,
        at: 0.36 + i * step,
        dur: last ? 0.34 : 0.11,
        type: "triangle",
        gain: 0.11 + i * 0.004,
      });
      if (last) specs.push({ freq: scale[i]!, at: 0.36 + i * step, dur: 0.34, type: "square", gain: 0.05 });
    }
    play(specs);
    const fanEnd = 0.36 + notes * step;
    sparkle(fanEnd - 0.05, { count: 4 + rank * 3, base: 2100, spread: 2200, span: 0.3 + rank * 0.1, gain: 0.05 });
    if (rank >= 2) {
      for (let i = 0; i < rank * 2; i++) {
        const t0 = fanEnd + i * 0.07 + rand(0, 0.02);
        const f0 = rand(1900, 2600);
        play([
          { freq: f0, at: t0, dur: 0.03, type: "square", gain: 0.04 },
          { freq: f0 * 1.5, at: t0 + 0.03, dur: 0.06, type: "square", gain: 0.035 },
        ]);
      }
    }
  },

  /** 역만 — 라이저(0.45s 예열) → 대형 슬램 → 공(gong) 비조화 배음 롱테일 → 시머 */
  yakuman(): void {
    const ready = readyAudio();
    if (ready === null) return;
    const { ac, out } = ready;
    const t0 = ac.currentTime;
    // 1) 라이저 (0–0.45s): 톱니 70→620Hz + 노이즈 스윕 — 컷인 밴드가 열리는 예열 구간
    const riser = ac.createOscillator();
    riser.type = "sawtooth";
    riser.frequency.setValueAtTime(70, t0);
    riser.frequency.exponentialRampToValueAtTime(620, t0 + 0.45);
    const rg = ac.createGain();
    rg.gain.setValueAtTime(0.0001, t0);
    rg.gain.exponentialRampToValueAtTime(0.13, t0 + 0.4);
    rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.47);
    riser.connect(rg).connect(out);
    riser.start(t0);
    riser.stop(t0 + 0.49);
    noiseBurst({ filter: "bandpass", freq: 300, freqTo: 5200, q: 2, dur: 0.45, gain: 0.09 });
    // 2) 대형 슬램 (0.45s — 글자 슬램과 동기)
    thump(0.45, { from: 100, to: 26, dur: 0.22, gain: 0.5 });
    noiseBurst({ at: 0.45, filter: "lowpass", freq: 380, dur: 0.2, gain: 0.4 });
    play([{ freq: 42, at: 0.45, dur: 0.7, type: "sine", gain: 0.26, slideTo: 30 }]);
    // 3) 공(gong) — 비조화 배음비 1 : 2.05 : 2.76 : 4.07 : 5.43, 길게 우웅—
    const gong = 98; // G2
    play([
      { freq: gong, at: 0.45, dur: 1.4, type: "triangle", gain: 0.14 },
      { freq: gong * 2.05, at: 0.45, dur: 1.2, type: "sine", gain: 0.09 },
      { freq: gong * 2.76, at: 0.47, dur: 1.1, type: "sine", gain: 0.06 },
      { freq: gong * 4.07, at: 0.47, dur: 0.9, type: "sine", gain: 0.04 },
      { freq: gong * 5.43, at: 0.49, dur: 0.7, type: "sine", gain: 0.025 },
    ]);
    // 4) 시머 — 스파클 캐스케이드 + 고음 잔광
    sparkle(0.7, { count: 14, base: 2200, spread: 2600, span: 1.0, gain: 0.04 });
    play([
      { freq: 2093, at: 0.75, dur: 1.0, type: "sine", gain: 0.03 },
      { freq: 3136, at: 0.85, dur: 0.9, type: "sine", gain: 0.02 },
    ]);
  },

  /** 유국 — 의도적으로 조용하게 (화료와의 대비) */
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

  /** 결과창 역 스탬프 — 펜타토닉 계단 상승 n음 (CSS 스탬프 딜레이와 동기) */
  yakuSteps(count: number, startAt = 0.15, step = 0.09): void {
    const penta = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // 펜타토닉 — 어떤 조합도 불협 없음
    const n = Math.min(count, penta.length);
    const specs: ToneSpec[] = [];
    for (let i = 0; i < n; i++) {
      specs.push({
        freq: 523 * 2 ** (penta[i]! / 12),
        at: startAt + i * step,
        dur: 0.09,
        type: "triangle",
        gain: 0.07,
      });
    }
    play(specs);
    for (let i = 0; i < n; i++) {
      noiseBurst({ at: startAt + i * step, filter: "bandpass", freq: 1600, q: 1.2, dur: 0.03, gain: 0.06 });
    }
  },

  /**
   * 점수 카운트업 틱 — 오르골 핀이 계단을 오르는 방울 소리.
   * (2026-08-03 유저 확정: 효과음 랩 `countTick-orgel`)
   *
   * 진행도 0~1을 **완전5도**(7반음)에 걸쳐 C6→G6로 올린다. 선형 Hz 증가가 아니라
   * 지수(음정) 증가라 귀에는 균일한 계단으로 들린다. 예전엔 square 1발이라 길게
   * 세면 쏘았는데, 사인 기음 + 오르골 부분음(×3.01)으로 바꿔 둥글게 만들었다.
   * @param progress 카운트업 진행도 0~1
   */
  countTick(progress: number): void {
    const f = 1046 * 2 ** ((progress * 7) / 12);
    play([
      { freq: f, dur: 0.03, type: "sine", gain: 0.038 },
      { freq: f * 3.01, dur: 0.016, type: "sine", gain: 0.01 },
    ]);
  },

  /** 점수 카운트업 피니시 — 짧은 종지 */
  countDone(): void {
    thump(0, { from: 180, to: 60, dur: 0.08, gain: 0.22 });
    play([
      { freq: 1046, dur: 0.09, type: "triangle", gain: 0.09 },
      { freq: 1568, at: 0.06, dur: 0.18, type: "triangle", gain: 0.08 },
    ]);
  },
};

// ───────── 평상시 대국 BGM (mp3 루프, 효과음 버스와 독립) ─────────
//
// 대국이 진행되는 동안 계속 흐르는 배경음. **리치 BGM과는 서로 배타적**이다 —
// 누가 리치를 걸면 이쪽이 물러나고(덕킹), 그 국이 끝나면 다시 돌아온다.
// 뚝 끊지 않고 크로스페이드로 주고받아야 전환이 자연스럽다.

const BGM_SRC = "/BackgroundBGM.mp3";
/** 트랙 자체 레벨 보정 — 곡이 크거나 작으면 여기만 만진다(0~1+) */
const BGM_TRACK_GAIN = 1;
/** 리치가 걸려 물러날 때 / 리치가 끝나고 돌아올 때의 페이드 길이(ms) */
const BGM_DUCK_MS = 700;
const BGM_UNDUCK_MS = 1400;

let bgmEl: HTMLAudioElement | null = null;
let bgmVolume = 0.35; // 0~1, 설정에서 동기화
/** 대국 중인가 — "틀어야 하는 상태"(설정·리치와 무관) */
let bgmWanted = false;
/** 리치 BGM이 흐르는 중인가 — 그동안은 이쪽이 비켜준다 */
let bgmDucked = false;
/** 화료·유국 정산 동안 배경 BGM을 무음으로 붙드는가 (되감지 않고 새 국에서 재개) */
let bgmResultHold = false;
let bgmFadeTimer: number | null = null;

/** 지연 생성 — SSR/미지원 환경 방어. 실제로 틀 때 처음 만든다(8MB짜리를 미리 받지 않게). */
function bgmAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (bgmEl === null) {
    const el = new Audio(BGM_SRC);
    el.loop = true;
    el.preload = "auto";
    el.volume = 0; // 항상 0에서 페이드인
    bgmEl = el;
  }
  return bgmEl;
}

/** 지금 실제로 나야 할 볼륨 — 대국 중이 아니거나 리치가 걸려 있으면 0 */
function bgmTargetVolume(): number {
  if (!bgmWanted || bgmDucked || bgmResultHold) return 0;
  return Math.max(0, Math.min(1, bgmVolume * BGM_TRACK_GAIN));
}

function bgmClearFade(): void {
  if (bgmFadeTimer !== null) {
    window.clearInterval(bgmFadeTimer);
    bgmFadeTimer = null;
  }
}

/**
 * 현재 상태(`bgmWanted`·`bgmDucked`·`bgmVolume`)에 맞춰 볼륨을 페이드로 따라가게 한다.
 * 0에 닿으면 일시정지하되 **되감지 않는다** — 리치가 끝나면 곡이 이어서 흐른다.
 */
function bgmSync(ms: number): void {
  const el = bgmAudio();
  if (el === null) return;
  const target = bgmTargetVolume();
  bgmClearFade();
  if (target > 0 && el.paused) {
    // 자동재생 정책으로 거부될 수 있다(사용자 제스처 전) — 조용히 무시
    void el.play().catch(() => {
      /* 재생 거부·로드 실패 무시 */
    });
  }
  const from = el.volume;
  if (ms <= 0 || Math.abs(target - from) < 0.005) {
    el.volume = target;
    if (target <= 0) el.pause();
    return;
  }
  const steps = 24;
  const stepMs = Math.max(16, ms / steps);
  let i = 0;
  bgmFadeTimer = window.setInterval(() => {
    i++;
    el.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps)));
    if (i >= steps) {
      bgmClearFade();
      if (target <= 0) el.pause();
    }
  }, stepMs);
}

/** 리치 BGM이 잡거나 놓을 때 호출 — 배경음이 비켜났다 돌아온다(크로스페이드) */
function bgmSetDucked(ducked: boolean): void {
  if (bgmDucked === ducked) return;
  bgmDucked = ducked;
  bgmSync(ducked ? BGM_DUCK_MS : BGM_UNDUCK_MS);
}

export const bgm = {
  /** 대국 시작 — 페이드인으로 들어온다. 이미 흐르는 중이면 아무 일도 없다. */
  start(): void {
    if (typeof window === "undefined" || bgmWanted) return;
    bgmWanted = true;
    bgmSync(1200);
  },

  /**
   * 화료·유국 정산 동안 배경 BGM을 무음으로 붙든다 — 되감지 않아 새 국에서 이어서 재개된다.
   * 국 종료 시 hold(true), 새 국 시작 시 hold(false). (론·쯔모 후 리치/대기 BGM이
   * 정산 화면까지 새어 들어오지 않게 한다 — 유저 확정: 정산 중엔 무음.)
   */
  holdForResult(hold: boolean): void {
    if (bgmResultHold === hold) return;
    bgmResultHold = hold;
    bgmSync(hold ? 500 : 900); // 붙들 땐 빠르게 무음, 새 국엔 부드럽게 복귀
  },

  /** 대국 종료·로비 복귀 — 페이드 없이 정지하고 처음으로 되감는다. */
  stop(): void {
    bgmWanted = false;
    bgmDucked = false;
    bgmResultHold = false;
    bgmClearFade();
    if (bgmEl !== null) {
      bgmEl.pause();
      bgmEl.currentTime = 0;
      bgmEl.volume = 0;
    }
  },

  /** 볼륨(0~1) 설정 — 0이면 정지(재생 위치는 유지돼 다시 올리면 이어진다). */
  setVolume(v: number): void {
    bgmVolume = Math.max(0, Math.min(1, v));
    bgmSync(150);
  },
};

// ───────── 리치 BGM (mp3 에셋 루프, 효과음 버스와 독립) ─────────
//
// 합성 효과음(sfx)과 달리 실제 오디오 파일을 재생한다. 효과음 마스터 게인(sfxOn)과
// 분리된 자체 볼륨을 가져 설정에서 따로 조절한다 — "리치 순간의 긴장 BGM".
// 누군가 리치를 선언하면 그 국이 끝날 때까지 루프하고, 국 종료·리셋 때 멈춘다.
//
// 트랙이 여러 개다. 리치 때마다 무작위로 하나를 고르되, 이미 BGM이 흐르는 중에
// 다른 사람이 리치를 걸면 "직전과 다른" 트랙으로 갈아끼워 흐름이 바뀐 느낌을 준다.

// 목록은 core(protocol)에 있다 — 서버도 같은 수를 봐야 «없는 곡»을 배정하지 않는다.
// **곡을 늘리는 자리는 그 배열 하나다** (여기와 서버는 따라온다).
const RIICHI_BGM_SRCS: readonly string[] = RIICHI_BGM_TRACK_SRCS;
// 트랙별 상대 음량 배율 — 곡마다 녹음 레벨이 달라 "적절한 크기"로 맞추는 보정값.
// 특정 곡이 크거나 작으면 그 곡의 경로에 값을 적는다 (0~1+). 안 적은 곡은 1이다
// — 곡을 늘릴 때 이 표를 같이 늘리는 것을 잊어도 소리가 사라지지 않게 경로로 건다.
const RIICHI_BGM_GAIN_BY_SRC: Record<string, number> = {
  // 2026-08-25 실측(ffmpeg loudnorm, integrated LUFS)을 **가장 조용한 곡(1번)에**
  // 맞춘 값이다 — 곡을 바꿀 때마다 볼륨을 다시 만지지 않게. 새 곡을 넣으면 같은
  // 방법으로 재 보고 한 줄 더한다(안 적으면 1배 = 원본 그대로).
  "/richiBGM2.mp3": 0.85, // -13.24 LUFS
  "/richiBGM3.mp3": 0.87, // -13.51
  "/richiBGM4.mp3": 0.93, // -14.08
  "/richiBGM5.mp3": 0.89, // -13.67
  "/richiBGM6.mp3": 0.84, // -13.29
  "/richiBGM7.mp3": 0.78, // -12.49 — 가장 큰 곡
  "/richiBGM8.mp3": 0.96, // -14.31
};
const RIICHI_BGM_GAIN: readonly number[] = RIICHI_BGM_SRCS.map(
  (src) => RIICHI_BGM_GAIN_BY_SRC[src] ?? 1,
);

/** 트랙 수 — 설정 화면(선택 버튼)과 서버(랜덤 풀기)가 같은 수를 본다. */
export const RIICHI_BGM_COUNT = RIICHI_BGM_SRCS.length;

const riichiBgmEls: (HTMLAudioElement | null)[] = RIICHI_BGM_SRCS.map(() => null);
// 이번 리치 구간에 "선택된" 트랙 인덱스 (-1 = 리치 구간 아님).
// 재생 여부는 이 값과 볼륨으로 결정된다 → 볼륨 0으로 내렸다가 다시 올려도
// 선택이 유지돼 곧바로 재개된다 (음소거가 곧 정지는 아니다).
let riichiBgmCurrent = -1;
let riichiBgmVolume = 0.5; // 0~1, 설정에서 동기화
/** 미리듣기 중인 트랙 (-1 = 없음) — 로비에서 곡을 골라 들어 볼 때만 쓴다. */
let riichiBgmPreview = -1;

/**
 * 다음 리치에 쓸 트랙 — **미리 골라 미리 받아 둔다** (-1 = 아직 안 골랐다).
 *
 * 트랙 하나가 5~9MB다. 리치가 걸린 뒤에 Audio를 만들면 그때부터 받기 시작하므로
 * 브금이 리치 컷인보다 몇 초 늦게 터져 나왔다 — 연출은 이미 지나갔는데 음악만
 * 뒤늦게 시작되는 그림이다(2026-08-12 사용자 지적). 대국에 들어서는 조용한 순간에
 * 다음 곡을 하나 정해 버퍼링을 걸어 두면, start()는 이미 받아 둔 것을 틀기만 한다.
 */
let riichiBgmNext = -1;
/** load()를 이미 걸어 둔 트랙 — 다시 걸면 버퍼링이 처음부터 다시 시작된다. */
const riichiBgmWarmed = new Set<number>();

/** 지금 트랙과 겹치지 않게 다음 트랙을 고른다. */
function riichiBgmPick(): number {
  const n = RIICHI_BGM_SRCS.length;
  if (riichiBgmCurrent < 0 || n <= 1) return Math.floor(Math.random() * n);
  return (riichiBgmCurrent + 1 + Math.floor(Math.random() * (n - 1))) % n;
}

// 페이드아웃 상태 — 국 종료 시 뚝 끊지 않고 볼륨을 부드럽게 낮춰 정지한다.
let riichiBgmFadeTimer: number | null = null;
let riichiBgmFadeEl: HTMLAudioElement | null = null;

/** 진행 중인 페이드를 마무리(정지·되감기·볼륨 원복)하고 상태를 정리한다. */
function riichiBgmEndFade(): void {
  if (riichiBgmFadeTimer !== null) {
    window.clearInterval(riichiBgmFadeTimer);
    riichiBgmFadeTimer = null;
  }
  if (riichiBgmFadeEl !== null) {
    const el = riichiBgmFadeEl;
    riichiBgmFadeEl = null;
    el.pause();
    el.currentTime = 0;
    const i = riichiBgmEls.indexOf(el); // 다음 재생 대비 볼륨 원복
    el.volume = riichiBgmVolume * (RIICHI_BGM_GAIN[i] ?? 1);
  }
}

/** 지연 생성 — SSR/미지원 환경 방어. 해당 트랙을 처음 쓸 때만 Audio 엘리먼트를 만든다. */
function riichiBgmAudio(i: number): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (riichiBgmEls[i] == null) {
    const el = new Audio(RIICHI_BGM_SRCS[i]);
    el.loop = true;
    el.preload = "auto";
    el.volume = riichiBgmVolume * (RIICHI_BGM_GAIN[i] ?? 1);
    riichiBgmEls[i] = el;
  }
  return riichiBgmEls[i];
}

/**
 * 선택된 트랙의 재생 상태를 볼륨에 맞춘다.
 * - 볼륨>0: 정지 중이면 재생 재개 (restart=true면 처음부터)
 * - 볼륨<=0: 일시정지 (선택·재생위치는 유지 → 볼륨 올리면 이어서 재개)
 */
function riichiBgmSync(restart: boolean): void {
  if (riichiBgmCurrent < 0) return;
  const el = riichiBgmAudio(riichiBgmCurrent);
  if (el === null) return;
  if (riichiBgmVolume <= 0) {
    el.pause(); // 음소거 — 되감지 않는다 (재개 시 이어서)
    return;
  }
  el.volume = riichiBgmVolume * (RIICHI_BGM_GAIN[riichiBgmCurrent] ?? 1);
  if (restart) el.currentTime = 0;
  if (el.paused) {
    // 자동재생 정책으로 거부될 수 있다(사용자 제스처 전) — 조용히 무시.
    void el.play().catch(() => {
      /* 재생 거부·로드 실패 무시 */
    });
  }
}

export const riichiBgm = {
  /**
   * 다음 리치에 쓸 트랙을 미리 정하고 **미리 받아 둔다** — 대국에 들어설 때,
   * 그리고 리치가 걸릴 때마다 다음 판을 위해 한 번 더 호출한다.
   *
   * 재생은 하지 않으므로 자동재생 정책과 무관하다. 이미 받아 둔 트랙은 건드리지
   * 않는다(load()를 다시 걸면 버퍼링이 처음부터 다시 시작된다).
   */
  prepare(track?: number): void {
    if (typeof window === "undefined" || typeof Audio === "undefined") return;
    if (riichiBgmVolume <= 0) return; // 꺼 둔 사람에게 6MB를 미리 받게 하지 않는다
    // 트랙이 정해져 있으면(내가 고른 곡) 그것을 받아 둔다 — 내 리치가 가장 잦다.
    if (track !== undefined && track >= 0 && track < RIICHI_BGM_SRCS.length) {
      riichiBgmNext = track;
    } else if (riichiBgmNext < 0 || riichiBgmNext === riichiBgmCurrent) {
      riichiBgmNext = riichiBgmPick();
    }
    const i = riichiBgmNext;
    if (riichiBgmWarmed.has(i)) return;
    const el = riichiBgmAudio(i);
    if (el === null) return;
    riichiBgmWarmed.add(i);
    el.load(); // preload="auto" — 재생 없이 앞부분부터 버퍼에 채운다
  },

  /**
   * 리치 선언 시 호출 — 미리 받아 둔 트랙을 처음부터 루프 재생.
   * 이미 다른 트랙이 흐르는 중이면(연속 리치) 그것과 다른 트랙으로 갈아끼운다.
   * 볼륨이 0이어도 트랙 선택은 해 둔다 → 도중에 볼륨을 올리면 바로 재생된다.
   */
  start(track?: number): void {
    if (typeof window === "undefined") return;
    bgmSetDucked(true); // 평상시 BGM은 리치 동안 비켜준다
    riichiBgmEndFade(); // 페이드 중 새 리치가 오면 즉시 마무리하고 새 곡으로
    // prepare()가 골라 둔 것이 있으면 그것을 쓴다 — 이미 버퍼에 들어와 있어
    // 컷인과 같은 순간에 소리가 난다. 없으면(준비 전 리치) 그 자리에서 고른다.
    // 트랙이 지정되면(선언자가 로비에서 고른 곡) 그것을 그대로 쓴다 — 네 사람이
    // 같은 곡을 들어야 하므로 여기서 무작위로 갈지 않는다.
    const next =
      track !== undefined && track >= 0 && track < RIICHI_BGM_SRCS.length
        ? track
        : riichiBgmNext >= 0 && riichiBgmNext !== riichiBgmCurrent
          ? riichiBgmNext
          : riichiBgmPick();
    // 이전 곡 완전 정지(되감기) 후 새 곡으로 전환
    if (riichiBgmCurrent >= 0) {
      const prev = riichiBgmEls[riichiBgmCurrent];
      if (prev != null) {
        prev.pause();
        prev.currentTime = 0;
      }
    }
    riichiBgmCurrent = next;
    riichiBgmNext = -1;
    riichiBgmSync(true);
    riichiBgm.prepare(); // 추격 리치가 바로 이어질 수 있다 — 다음 곡도 미리 받아 둔다
  },

  /**
   * 국 종료 시 자연스러운 페이드아웃 — 뚝 끊지 않고 ms 동안 볼륨을 낮춰 정지한다.
   * 페이드가 시작되면 선택은 즉시 해제돼, 다음 리치는 새 트랙을 고른다.
   * (론·쯔모 컷인이 뜨는 동안 BGM이 서서히 빠지며 템포를 넘겨주는 연출.)
   */
  fadeOut(ms = 1400): void {
    bgmSetDucked(false); // 리치가 빠지는 동안 평상시 BGM이 겹쳐 들어온다(크로스페이드)
    riichiBgmEndFade(); // 진행 중 페이드가 있으면 먼저 마무리
    if (riichiBgmCurrent < 0) return;
    const el = riichiBgmEls[riichiBgmCurrent];
    riichiBgmCurrent = -1; // 즉시 선택 해제
    if (el == null || el.paused || el.volume <= 0) {
      if (el != null) {
        el.pause();
        el.currentTime = 0;
      }
      return;
    }
    riichiBgmFadeEl = el;
    const startVol = el.volume;
    const steps = 30;
    const stepMs = Math.max(16, ms / steps);
    let i = 0;
    riichiBgmFadeTimer = window.setInterval(() => {
      i++;
      el.volume = Math.max(0, startVol * (1 - i / steps));
      if (i >= steps) riichiBgmEndFade();
    }, stepMs);
  },

  /**
   * 리치 BGM이 현재 켜져 있는가 (트랙 선택 중 — 볼륨 0으로 잠시 멈춘 상태 포함).
   * 증강 테스트 시점 전환 시 "이미 흐르는 중이면 다시 start()로 트랙을 갈지 않기" 판정용.
   */
  active(): boolean {
    return riichiBgmCurrent >= 0;
  },

  /** 즉시 정지 — 리셋·나가기 등. 페이드 없이 바로 끊고 선택 해제. */
  stop(): void {
    bgmSetDucked(false); // 덕킹 해제 — 대국 중이면 평상시 BGM이 돌아온다
    riichiBgmEndFade();
    if (riichiBgmCurrent >= 0) {
      const el = riichiBgmEls[riichiBgmCurrent];
      if (el != null) {
        el.pause();
        el.currentTime = 0;
      }
    }
    riichiBgmCurrent = -1;
  },

  /**
   * **미리듣기** — 로비에서 고른 곡을 그 자리에서 들어 본다.
   *
   * 리치 구간 재생과 같은 엘리먼트를 쓰되 루프하지 않고, 볼륨이 0이어도(설정에서
   * 꺼 둔 사람이 곡만 확인하는 경우) 들리도록 최소 볼륨을 보장한다.
   */
  preview(i: number): void {
    if (typeof window === "undefined") return;
    if (i < 0 || i >= RIICHI_BGM_SRCS.length) return;
    riichiBgm.previewStop();
    const el = riichiBgmAudio(i);
    if (el === null) return;
    el.loop = false;
    el.volume = Math.max(0.3, riichiBgmVolume) * (RIICHI_BGM_GAIN[i] ?? 1);
    el.currentTime = 0;
    riichiBgmPreview = i;
    void el.play().catch(() => {
      /* 재생 거부·로드 실패 무시 */
    });
  },

  /** 미리듣기 정지 — 루프 설정을 되돌려 리치 재생에 영향이 남지 않게 한다. */
  previewStop(): void {
    if (riichiBgmPreview < 0) return;
    const el = riichiBgmEls[riichiBgmPreview];
    riichiBgmPreview = -1;
    if (el == null) return;
    el.pause();
    el.currentTime = 0;
    el.loop = true;
    const i = riichiBgmEls.indexOf(el);
    el.volume = riichiBgmVolume * (RIICHI_BGM_GAIN[i] ?? 1);
  },

  /** 지금 미리듣기 중인 트랙 (-1 = 없음). */
  previewing(): number {
    return riichiBgmPreview;
  },

  /**
   * 볼륨(0~1) 설정 — 모든 트랙에 즉시 반영(트랙별 배율 유지).
   * 리치 구간 중이면 볼륨에 맞춰 재생/정지를 동기화한다 (0→정지, 0초과→재개).
   * 페이드아웃 중인 트랙은 건드리지 않는다(페이드 곡선 유지).
   */
  setVolume(v: number): void {
    riichiBgmVolume = Math.max(0, Math.min(1, v));
    riichiBgmEls.forEach((el, i) => {
      if (el != null && el !== riichiBgmFadeEl) {
        el.volume = riichiBgmVolume * (RIICHI_BGM_GAIN[i] ?? 1);
      }
    });
    riichiBgmSync(false);
  },
};
