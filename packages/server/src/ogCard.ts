/**
 * ogCard.ts — 초대 링크의 공유 카드 그림.
 *
 * 카톡·디스코드에 `https://majak.yaho1231.com/?room=7Q79FM` 를 붙이면 크롤러가
 * `og:image` 를 받아 카드에 그린다. 예전에는 여기에 **정적인 그림**(`og.png`)이 걸려
 * 있었다 — 손패와 문구가 있는 예쁜 카드였지만, 링크를 받은 사람에게 정작 필요한
 * **방 코드**는 그 안에 없었다. 그림은 코드마다 달라야 하는데 코드는 32^6 가지라
 * 미리 구워 둘 수가 없다.
 *
 * 그래서 여기서 그 자리에서 만든다. 1200×630 흰 종이에 **검은 코드 여섯 글자만**.
 * 로고도 손패도 설명도 없다 — 카드 아래에 제목과 설명이 이미 붙고, 그림이 할 일은
 * 코드를 0.5초 안에 읽히게 하는 것뿐이다.
 *
 * 글자는 `ogGlyphAtlas.ts` 의 알파 비트맵을 얹어 찍는다(빌드 때 실제 폰트로 구워 둔
 * 것 — 이유는 `scripts/gen-og-glyphs.mjs` 주석에 있다). 런타임 의존성은 `zlib` 뿐이라
 * 배포 머신에 이미지 툴체인이 필요 없다.
 */
import { deflateSync, inflateSync } from "node:zlib";
import {
  OG_GLYPH_ADVANCE,
  OG_GLYPH_ATLAS_B64,
  OG_GLYPH_CHARS,
  OG_GLYPH_H,
  OG_GLYPH_W,
} from "./ogGlyphAtlas.js";

/** 공유 카드 규격 — index.html 의 og:image:width/height 와 같아야 한다 */
export const OG_CARD_W = 1200;
export const OG_CARD_H = 630;

/**
 * 글자 사이에 더 주는 여백(px). 고정폭 진폭 그대로 붙이면 M·W 처럼 살찐 글자가
 * 서로 닿는다 — 코드는 한 글자씩 옮겨 적는 물건이라 붙어 보이면 안 된다.
 */
const LETTER_SPACING = 12;

/** 코드가 종이 폭의 이만큼을 넘으면 줄여 그린다 (양옆 숨 쉴 자리) */
const MAX_INK_RATIO = 0.84;

interface Glyph {
  /** W×H 알파 (0 = 종이, 255 = 잉크) */
  alpha: Uint8Array;
  /** 칸 안에서 잉크가 실제로 닿는 범위 — 여섯 글자를 가운데 맞추는 데 쓴다 */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

let glyphs: Map<string, Glyph> | null = null;

/** 그림판을 처음 쓸 때 한 번만 푼다 — 서버 기동을 40KB 압축 해제로 붙잡지 않는다. */
function atlas(): Map<string, Glyph> {
  if (glyphs !== null) return glyphs;
  const raw = inflateSync(Buffer.from(OG_GLYPH_ATLAS_B64, "base64"));
  const size = OG_GLYPH_W * OG_GLYPH_H;
  if (raw.length !== OG_GLYPH_CHARS.length * size) {
    throw new Error(`글자 그림판이 깨졌습니다: ${raw.length}바이트`);
  }
  const map = new Map<string, Glyph>();
  for (let i = 0; i < OG_GLYPH_CHARS.length; i++) {
    const alpha = new Uint8Array(raw.subarray(i * size, (i + 1) * size));
    let x0 = OG_GLYPH_W;
    let x1 = 0;
    let y0 = OG_GLYPH_H;
    let y1 = 0;
    for (let y = 0; y < OG_GLYPH_H; y++) {
      for (let x = 0; x < OG_GLYPH_W; x++) {
        if (alpha[y * OG_GLYPH_W + x] === 0) continue;
        if (x < x0) x0 = x;
        if (x + 1 > x1) x1 = x + 1;
        if (y < y0) y0 = y;
        if (y + 1 > y1) y1 = y + 1;
      }
    }
    map.set(OG_GLYPH_CHARS[i] as string, { alpha, x0, x1, y0, y1 });
  }
  glyphs = map;
  return map;
}

/** 이 글자들로만 카드를 만들 수 있다 (그림판에 없는 글자는 그릴 수 없다) */
export function ogCardSupports(code: string): boolean {
  return code.length > 0 && [...code].every((ch) => OG_GLYPH_CHARS.includes(ch));
}

/**
 * 코드 한 줄짜리 카드를 그려 PNG 로 돌려준다.
 *
 * 세로·가로 모두 **실제 잉크 경계**를 기준으로 가운데를 맞춘다. 글자 칸 기준으로
 * 맞추면 Q 의 꼬리 같은 것 때문에 줄 전체가 미세하게 기운 것처럼 보인다.
 */
export function renderOgCard(code: string): Buffer {
  const map = atlas();
  const chars = [...code].map((ch) => {
    const g = map.get(ch);
    if (g === undefined) throw new Error(`그림판에 없는 글자입니다: ${ch}`);
    return g;
  });

  let pitch = OG_GLYPH_ADVANCE + LETTER_SPACING;
  const span = (p: number) => {
    let left = Infinity;
    let right = -Infinity;
    chars.forEach((g, i) => {
      left = Math.min(left, i * p + g.x0);
      right = Math.max(right, i * p + g.x1);
    });
    return { left, right, width: right - left };
  };
  // 코드가 길어 종이를 넘치면 자간부터 줄인다. 그래도 넘치면 잉크가 잘리지만,
  // 실제 방 코드는 여섯 글자 고정이라 이 자리까지 오지 않는다.
  if (span(pitch).width > OG_CARD_W * MAX_INK_RATIO) {
    pitch = OG_GLYPH_ADVANCE;
  }
  const { left, width } = span(pitch);
  const top = Math.min(...chars.map((g) => g.y0));
  const height = Math.max(...chars.map((g) => g.y1)) - top;

  const offsetX = Math.round((OG_CARD_W - width) / 2) - left;
  const offsetY = Math.round((OG_CARD_H - height) / 2) - top;

  // 종이 한 장 — 8비트 회색조. 색을 안 쓰니 채널 하나면 충분하고, 압축도 잘 된다.
  const paper = Buffer.alloc(OG_CARD_W * OG_CARD_H, 0xff);
  chars.forEach((g, i) => {
    const gx = offsetX + i * pitch;
    for (let y = g.y0; y < g.y1; y++) {
      const py = offsetY + y;
      if (py < 0 || py >= OG_CARD_H) continue;
      for (let x = g.x0; x < g.x1; x++) {
        const a = g.alpha[y * OG_GLYPH_W + x] as number;
        if (a === 0) continue;
        const px = gx + x;
        if (px < 0 || px >= OG_CARD_W) continue;
        const at = py * OG_CARD_W + px;
        // 흰 종이 위 검은 잉크 — 겹치는 자리는 진한 쪽을 남긴다.
        const v = 255 - a;
        if (v < (paper[at] as number)) paper[at] = v;
      }
    }
  });

  return encodeGrayPng(paper, OG_CARD_W, OG_CARD_H);
}

// ─────────────────────────── PNG 묶기 ───────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** 8비트 회색조 PNG (색 방식 0, 비인터레이스). 행마다 필터 0 — 글자는 평면이라 이걸로 충분하다. */
function encodeGrayPng(pixels: Buffer, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // 필터: None
    pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 0; // 색 방식: 회색조
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─────────────────────────── 캐시 ───────────────────────────

/**
 * 같은 코드가 여러 번 오는 게 정상이다 — 카톡·디스코드·슬랙이 각자 크롤링하고,
 * 링크를 다시 붙일 때마다 또 온다. 그림 한 장이 수 KB 라 이 정도는 들고 있어도 된다.
 */
const CACHE_LIMIT = 256;
const cache = new Map<string, Buffer>();

export function ogCardFor(code: string): Buffer {
  const hit = cache.get(code);
  if (hit !== undefined) return hit;
  const png = renderOgCard(code);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(code, png);
  return png;
}
