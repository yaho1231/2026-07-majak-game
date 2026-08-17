/**
 * gen-og-glyphs.mjs — 초대 카드에 찍을 **글자 그림판**을 만든다.
 *
 *   node scripts/gen-og-glyphs.mjs
 *
 * 산출물은 `packages/server/src/ogGlyphAtlas.ts` 하나이고 **커밋한다**.
 *
 * # 왜 이런 게 필요한가
 *
 * 초대 링크(`?room=7Q79FM`)를 공유하면 카톡·디스코드가 og:image 를 받아 카드에
 * 그린다. 그 카드에 **방 코드 여섯 글자**를 찍으려면 코드마다 다른 PNG 를 그 자리에서
 * 만들어야 한다 — 코드는 32^6 가지라 미리 구워 둘 수 없다.
 *
 * 문제는 이 서버에 글자를 그릴 수단이 없다는 것이다. sharp·canvas·resvg 같은 네이티브
 * 의존성은 배포 머신(맥 한 대)에 툴체인을 요구하고, 그 대가로 얻는 건 글자 서른두 개다.
 * 그래서 **빌드 때 한 번** 실제 폰트로 A–Z·2–9 를 렌더해 알파 비트맵으로 굳혀 두고,
 * 런타임에는 그 비트맵을 흰 바탕에 얹어 PNG 로 묶기만 한다(`ogCard.ts`). 런타임 의존성은
 * node 내장 `zlib` 뿐이다.
 *
 * # 왜 qlmanage 인가
 *
 * `scripts/gen-brand-assets.sh` 와 같은 이유다 — 이 맥에 rsvg-convert·ImageMagick·
 * Inkscape 가 없고, macOS 기본 도구만 쓰면 아무 설치 없이 재생성할 수 있다. 대신
 * 결과가 **항상 정사각**이라 정사각 캔버스에 격자를 그린다.
 *
 * # 격자에서 글리프를 오려 내는 규칙
 *
 * 칸마다 글자를 **가운데 정렬**로 그린 뒤, 서른두 칸의 잉크 경계를 **합집합**으로 묶어
 * 모든 글자를 같은 크기로 오려 낸다. 글자마다 딱 맞게 자르면 (칸 안에서 중심이 같아도)
 * 조각 크기가 제각각이라 런타임에서 다시 중심을 맞춰야 한다 — 합집합으로 자르면
 * 조각을 일정 간격으로 늘어놓기만 하면 등간격이 된다.
 */
import { execFileSync } from "node:child_process";
import { deflateSync, inflateSync } from "node:zlib";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../packages/server/src/ogGlyphAtlas.ts");

/** RoomManager 의 CODE_CHARS 와 같아야 한다 (혼동 문자 O/0·I/1 제외) */
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 격자 — 8열 4행 */
const COLS = 8;
const ROWS = 4;
/** 칸 크기. 폭은 글자 진폭(0.602em)보다 넉넉히 잡아 잉크가 잘리지 않게 한다. */
const CELL_W = 340;
const CELL_H = 420;
/** 칸 안에서 글자가 앉는 기준선 */
const BASELINE = 320;
const FONT_SIZE = 250;
/**
 * Menlo — macOS 기본 고정폭. 코드를 코드처럼 보이게 하고, 진폭이 일정해서
 * 여섯 글자를 등간격으로 늘어놓기만 하면 된다.
 */
const FONT = "Menlo, ui-monospace, monospace";
/** Menlo 의 진폭 (em 대비). 런타임 자간 계산에 쓴다. */
const ADVANCE_EM = 0.602;

const CANVAS = COLS * CELL_W; // 정사각 — 2720
if (ROWS * CELL_H > CANVAS) throw new Error("격자가 정사각 캔버스를 넘습니다");

// ─────────────────────────── 1. SVG 격자 ───────────────────────────

const cells = [...CHARS]
  .map((ch, i) => {
    const cx = (i % COLS) * CELL_W + CELL_W / 2;
    const y = Math.floor(i / COLS) * CELL_H + BASELINE;
    // XML 이스케이프가 필요한 글자는 이 집합에 없다(A–Z, 2–9).
    return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${FONT_SIZE}" font-weight="700" fill="#000000">${ch}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <rect width="${CANVAS}" height="${CANVAS}" fill="#ffffff"/>
  ${cells}
</svg>
`;

const tmp = mkdtempSync(join(tmpdir(), "majak-glyphs-"));
try {
  const svgPath = join(tmp, "glyphs.svg");
  writeFileSync(svgPath, svg);

  // ─────────────────────────── 2. 렌더 ───────────────────────────

  const outDir = join(tmp, "r");
  mkdirSync(outDir);
  execFileSync("qlmanage", ["-t", "-s", String(CANVAS), "-o", outDir, svgPath], { stdio: "ignore" });
  const png = readFileSync(join(outDir, "glyphs.svg.png"));

  // ─────────────────────────── 3. PNG → 잉크 농도 ───────────────────────────

  const { width, height, ink } = decodeInk(png);
  if (width !== height) throw new Error(`정사각이 아닙니다: ${width}×${height}`);
  // qlmanage 가 요청보다 작게 줄 때가 있다 — 그만큼 좌표를 같이 줄인다.
  const scale = width / CANVAS;

  // ─────────────────────────── 4. 합집합 경계 ───────────────────────────

  const cellBox = (i) => ({
    x0: Math.round((i % COLS) * CELL_W * scale),
    y0: Math.round(Math.floor(i / COLS) * CELL_H * scale),
    w: Math.round(CELL_W * scale),
    h: Math.round(CELL_H * scale),
  });

  /** 칸 중심을 원점으로 한 잉크 경계의 합집합 */
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  const THRESHOLD = 8; // 이보다 옅은 픽셀은 렌더러의 먼지로 본다

  for (let i = 0; i < CHARS.length; i++) {
    const box = cellBox(i);
    const cx = box.x0 + box.w / 2;
    const cy = box.y0 + box.h / 2;
    let found = false;
    for (let y = box.y0; y < box.y0 + box.h; y++) {
      for (let x = box.x0; x < box.x0 + box.w; x++) {
        if (ink[y * width + x] <= THRESHOLD) continue;
        found = true;
        left = Math.min(left, x - cx);
        right = Math.max(right, x + 1 - cx);
        top = Math.min(top, y - cy);
        bottom = Math.max(bottom, y + 1 - cy);
      }
    }
    if (!found) throw new Error(`글자 '${CHARS[i]}' 가 비어 있습니다 — 폰트를 못 찾은 듯합니다`);
  }

  // 좌우는 대칭으로 맞춘다 — 중심이 어긋나면 여섯 글자가 미세하게 기운다.
  const half = Math.ceil(Math.max(-left, right));
  const gw = half * 2;
  const gh = Math.ceil(bottom) - Math.floor(top);
  const gy = Math.floor(top);

  // ─────────────────────────── 5. 오려 담기 ───────────────────────────

  const atlas = Buffer.alloc(CHARS.length * gw * gh);
  for (let i = 0; i < CHARS.length; i++) {
    const box = cellBox(i);
    const cx = box.x0 + box.w / 2;
    const cy = box.y0 + box.h / 2;
    for (let y = 0; y < gh; y++) {
      const sy = Math.round(cy + gy + y);
      for (let x = 0; x < gw; x++) {
        const sx = Math.round(cx - half + x);
        const v = sx >= 0 && sx < width && sy >= 0 && sy < height ? ink[sy * width + sx] : 0;
        atlas[(i * gh + y) * gw + x] = v;
      }
    }
  }

  const packed = deflateSync(atlas, { level: 9 });
  // 되읽어 봐야 "커밋했는데 서버에서 안 풀린다"를 여기서 잡는다.
  if (inflateSync(packed).length !== atlas.length) throw new Error("압축 왕복 검증 실패");

  const advance = Math.round(FONT_SIZE * ADVANCE_EM * scale);

  writeFileSync(
    OUT,
    `/**
 * 자동 생성 — \`node scripts/gen-og-glyphs.mjs\`. 손으로 고치지 말 것.
 *
 * 초대 카드(\`ogCard.ts\`)가 방 코드를 찍는 데 쓰는 글자 그림판이다. 글자 하나가
 * ${gw}×${gh} 알파 비트맵이고, ${CHARS.length}개가 \`OG_GLYPH_CHARS\` 순서대로 이어 붙어 있다
 * (0 = 종이, 255 = 잉크). 왜 비트맵인지는 생성기 주석을 보라.
 */

/** 그림판에 들어 있는 글자 — RoomManager 의 CODE_CHARS 와 같다 */
export const OG_GLYPH_CHARS = ${JSON.stringify(CHARS)};

/** 글자 한 칸의 크기 (px) */
export const OG_GLYPH_W = ${gw};
export const OG_GLYPH_H = ${gh};

/** 고정폭 진폭 — 글자를 이 간격으로 늘어놓으면 원래 폰트의 짜임이 된다 */
export const OG_GLYPH_ADVANCE = ${advance};

/** deflate + base64 로 굳힌 알파 비트맵 ${CHARS.length} × ${gw} × ${gh} */
export const OG_GLYPH_ATLAS_B64 =
  "${packed.toString("base64")}";
`,
  );

  console.log(
    `ogGlyphAtlas.ts — ${CHARS.length}자 ${gw}×${gh}, 진폭 ${advance}, ${(packed.length / 1024).toFixed(0)}KB`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

/**
 * PNG 를 읽어 픽셀당 **잉크 농도**(0 = 흰 종이, 255 = 검은 잉크) 한 장으로 돌려준다.
 * qlmanage 가 내는 것만 다루면 되므로 8비트·비인터레이스로 한정한다.
 */
function decodeInk(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG 가 아닙니다");
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`8비트 채널만 지원합니다 (${data[8]})`);
      colorType = data[9];
      if (data[12] !== 0) throw new Error("인터레이스 PNG 는 지원하지 않습니다");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += len + 12; // 길이(4) + 타입(4) + 데이터 + CRC(4)
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) throw new Error(`지원하지 않는 색 방식: ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`알 수 없는 필터: ${filter}`);
      px[y * stride + x] = v & 0xff;
    }
  }

  const ink = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const gray =
      channels <= 2 ? px[o] : Math.round(0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]);
    const alpha = channels === 2 ? px[o + 1] : channels === 4 ? px[o + 3] : 255;
    // 흰 종이 위에 합성한 뒤 뒤집는다 — 투명한 곳은 종이 그대로다.
    ink[i] = Math.max(0, Math.round(((255 - gray) * alpha) / 255));
  }
  return { width, height, ink };
}
