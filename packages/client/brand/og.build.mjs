/**
 * og.svg 를 만든다 — 링크를 공유했을 때 보이는 카드(1200×630).
 *
 * 손패는 **실제 게임 에셋**(`public/tiles/*.png`)을 base64로 박아 넣는다. 공유 카드가
 * 화면과 다른 그림을 보여 주면 그건 광고지 거짓말이다. 여기 있는 패는 게임에서
 * 보는 그 패다.
 *
 * 캔버스가 1200×1200 인 이유: 렌더러(qlmanage)가 SVG를 **정사각으로 잘라** 썸네일을
 * 만든다. 1200×630 짜리를 주면 좌우가 잘린다. 그래서 정사각 캔버스 가운데 띠에
 * 카드를 그리고, 나중에 sips 가 그 띠만 오려 낸다.
 *
 * 실행: scripts/gen-brand-assets.sh 가 부른다. 직접 부를 일은 없다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tilesDir = resolve(here, "../public/tiles");

// 1m2m3m · 5p6p7p · 적5삭 · 중중 — 화료 직전처럼 보이는 아홉 장.
// 백(5z)은 얼굴이 비어 있어 카드에서 구멍처럼 보인다 → 쓰지 않는다.
const TILES = ["1m", "2m", "3m", "5p", "6p", "7p", "0s", "7z", "7z"];

const W = 1200;
const H = 630;
const CANVAS = 1200;
const PAD = (CANVAS - H) / 2;

const TW = 96;
const TH = 155;
const GAP = 10;
const rowWidth = TILES.length * TW + (TILES.length - 1) * GAP;
const x0 = (W - rowWidth) / 2;
const y0 = 372;

const images = TILES.map((t, i) => {
  const b64 = readFileSync(resolve(tilesDir, `${t}.png`)).toString("base64");
  const x = (x0 + i * (TW + GAP)).toFixed(1);
  return `<image href="data:image/png;base64,${b64}" x="${x}" y="${y0}" width="${TW}" height="${TH}"/>`;
}).join("\n      ");

const FONT = "Apple SD Gothic Neo, Noto Sans KR, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CANVAS}" viewBox="0 0 ${W} ${CANVAS}">
  <!-- 자동 생성 — packages/client/brand/og.build.mjs. 손으로 고치지 말 것. -->
  <defs>
    <radialGradient id="bg" cx="50%" cy="34%" r="78%">
      <stop offset="0" stop-color="#1a2a21"/>
      <stop offset="1" stop-color="#080f0d"/>
    </radialGradient>
    <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9b82ff"/>
      <stop offset="1" stop-color="#6a45f5"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${CANVAS}" fill="#080f0d"/>
  <g transform="translate(0,${PAD})">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>

    <g opacity="0.95">
      ${images}
    </g>

    <g transform="translate(600,150) scale(0.46)">
      <path d="M0 -100 L29 -29 L100 0 L29 29 L0 100 L-29 29 L-100 0 L-29 -29 Z" fill="url(#spark)"/>
      <circle r="14" fill="#d9cfff"/>
    </g>

    <text x="600" y="278" text-anchor="middle" font-family="${FONT}" font-size="82" font-weight="700" fill="#ece4d2" letter-spacing="4">이능마작</text>
    <text x="600" y="336" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="500" fill="#a8bcaf">규칙을 바꾸는 증강을 뽑아 두는 온라인 리치마작</text>
    <text x="600" y="596" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="500" fill="#9a7b42">가입 없이 봇 3명과 바로 한 판 · majak.yaho1231.com</text>
  </g>
</svg>
`;

writeFileSync(resolve(here, "og.svg"), svg);
console.log(`og.svg — ${TILES.length}장 embed, ${(svg.length / 1024).toFixed(0)}KB`);
