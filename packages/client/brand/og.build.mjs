/**
 * og.svg 를 만든다 — 링크를 공유했을 때 보이는 카드(1200×630).
 *
 * 손패는 **실제 게임 에셋**(`public/tiles/*.png`)을 base64로 박아 넣는다. 공유 카드가
 * 화면과 다른 그림을 보여 주면 그건 광고지 거짓말이다. 여기 있는 패는 게임에서
 * 보는 그 패다.
 *
 * # 무엇을 보여 주는가 (2026-08-18 재설계)
 *
 * 예전 카드는 **아홉 장짜리 평범한 손패**였다. 마작을 아는 사람에게는 아무 일도
 * 일어나지 않은 그림이고, 모르는 사람에게는 그냥 타일 아홉 개다 — 카톡에 뜬 그
 * 그림을 보고 "이게 뭐 어쩌라고"라는 말이 나왔다(사용자 지적). 링크를 받은 사람이
 * 0.5초 안에 알아야 하는 것은 두 가지뿐이다.
 *
 *   1. **누가 나를 부른다** — 초대장이라는 것
 *   2. **여긴 이상한 일이 일어나는 마작이다** — 클릭할 이유
 *
 * 그래서 지금 카드는 **개벽(genesis)이 터진 직후의 손패**다. 수패 열네 장이 통째로
 * 자패로 뒤집혀 동동동·남남남·서서서·북북북·백백 — 자일색과 대사희가 겹친 더블
 * 역만이 서 있다. 뒤집히기 전의 수패는 흐릿한 잔상으로 위에 남겨 두어, 규칙을
 * 몰라도 "방금 무언가가 통째로 바뀌었다"가 보이게 했다.
 *
 * 손으로 놓은 자리들이라 자동 배치처럼 보이지 않는다 — 로고는 왼쪽 위, 주소는
 * 오른쪽 위, 가운데는 초대 문구 하나. 장식은 잔상과 이음매 빛 둘뿐이다.
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

/**
 * 개벽 **직후**의 손패 — 동동동 남남남 서서서 북북북 백백 (자패 열네 장).
 * 자일색 + 대사희 = 더블 역만. 이 게임에서 실제로 일어나는 일이다.
 *
 * 백(5z)은 얼굴이 비어 보이지만 두 장뿐이고 오른쪽 끝에서 마침표 노릇을 한다 —
 * 전부 글자로 채우면 열네 장이 벽처럼 보인다.
 */
const HAND = ["1z", "1z", "1z", "2z", "2z", "2z", "3z", "3z", "3z", "4z", "4z", "4z", "5z", "5z"];

/** 뒤집히기 전의 수패 — 잔상으로만 쓰이므로 어떤 패든 상관없다 (평범한 손이면 된다) */
const BEFORE = ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "3m", "5p", "7s", "2m", "6p"];

const W = 1200;
const H = 630;
const CANVAS = 1200;
const PAD = (CANVAS - H) / 2;

const TW = 72;
const TH = 116;
const GAP = 8;
const ROW_W = HAND.length * TW + (HAND.length - 1) * GAP;
const X0 = (W - ROW_W) / 2;
/** 뒤집힌 손패가 놓인 줄 */
const ROW_Y = 396;
/** 잔상(뒤집히기 전)은 같은 자리에서 위로 밀려 나 있다 */
const GHOST_Y = ROW_Y - 98;

const b64 = (t) => readFileSync(resolve(tilesDir, `${t}.png`)).toString("base64");
const row = (tiles, y) =>
  tiles
    .map((t, i) => {
      const x = (X0 + i * (TW + GAP)).toFixed(1);
      return `<image href="data:image/png;base64,${b64(t)}" x="${x}" y="${y}" width="${TW}" height="${TH}"/>`;
    })
    .join("\n        ");

const FONT = "Apple SD Gothic Neo, Noto Sans KR, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CANVAS}" viewBox="0 0 ${W} ${CANVAS}">
  <!-- 자동 생성 — packages/client/brand/og.build.mjs. 손으로 고치지 말 것. -->
  <defs>
    <!-- 탁자 천 — 가운데가 조금 밝고 가장자리로 가라앉는다 -->
    <radialGradient id="felt" cx="50%" cy="46%" r="82%">
      <stop offset="0" stop-color="#16281f"/>
      <stop offset="1" stop-color="#070d0b"/>
    </radialGradient>
    <!-- 천의 결. 매끈한 그라데이션만 있으면 화면 보호기처럼 보인다 -->
    <pattern id="weave" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <line x1="0" y1="0" x2="0" y2="10" stroke="#ffffff" stroke-opacity="0.022" stroke-width="1"/>
    </pattern>
    <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b7a3ff"/>
      <stop offset="1" stop-color="#6a45f5"/>
    </linearGradient>
    <!-- 뒤집힘의 이음매 — 가운데만 밝고 양끝은 천에 녹는다 -->
    <linearGradient id="seam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9b82ff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#c3b4ff" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#9b82ff" stop-opacity="0"/>
    </linearGradient>
    <!-- 잔상은 위로 갈수록 사라진다 (아래쪽이 방금 지나간 자리) -->
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <mask id="ghostMask">
      <rect x="0" y="${GHOST_Y}" width="${W}" height="${TH}" fill="url(#fade)"/>
    </mask>
  </defs>
  <rect width="${W}" height="${CANVAS}" fill="#070d0b"/>
  <g transform="translate(0,${PAD})">
    <rect width="${W}" height="${H}" fill="url(#felt)"/>
    <rect width="${W}" height="${H}" fill="url(#weave)"/>

    <!-- ── 머리: 왼쪽에 이름, 오른쪽에 주소. 가운데는 비워 둔다 ── -->
    <g transform="translate(56,52) scale(0.17)">
      <path d="M0 -100 L29 -29 L100 0 L29 29 L0 100 L-29 29 L-100 0 L-29 -29 Z" fill="url(#spark)"/>
      <circle r="16" fill="#e4dcff"/>
    </g>
    <text x="82" y="62" font-family="${FONT}" font-size="29" font-weight="700" fill="#ece4d2" letter-spacing="3">이능마작</text>
    <text x="1144" y="61" text-anchor="end" font-family="${FONT}" font-size="21" font-weight="500" fill="#6f8b7c" letter-spacing="0.5">majak.yaho1231.com</text>
    <line x1="56" y1="88" x2="1144" y2="88" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>

    <!-- ── 초대 ── -->
    <text x="600" y="182" text-anchor="middle" font-family="${FONT}" font-size="60" font-weight="700" fill="#ece4d2" letter-spacing="-1">???님이 당신을 초대합니다</text>
    <text x="600" y="230" text-anchor="middle" font-family="${FONT}" font-size="25" font-weight="500" fill="#9db3a6">규칙을 바꾸는 증강을 뽑아 두는 온라인 리치마작 · 가입 없이 봇 3명과 바로 한 판</text>

    <!-- ── 뒤집히기 전의 수패 (잔상) ── -->
    <g opacity="0.24" mask="url(#ghostMask)">
        ${row(BEFORE, GHOST_Y)}
    </g>

    <!-- ── 뒤집힘의 이음매 ── -->
    <rect x="120" y="${ROW_Y - 26}" width="960" height="2" fill="url(#seam)"/>
    <g transform="translate(600,${ROW_Y - 25})">
      <rect x="-63" y="-19" width="126" height="38" rx="19" fill="#120b2a" stroke="#7d63f0" stroke-opacity="0.75"/>
      <g transform="translate(-38,0) scale(0.11)">
        <path d="M0 -100 L29 -29 L100 0 L29 29 L0 100 L-29 29 L-100 0 L-29 -29 Z" fill="url(#spark)"/>
      </g>
      <text x="8" y="9" text-anchor="middle" font-family="${FONT}" font-size="23" font-weight="700" fill="#d9cfff" letter-spacing="2">개벽</text>
    </g>

    <!-- ── 뒤집힌 손패 ── -->
    <g>
        ${row(HAND, ROW_Y)}
    </g>

    <text x="600" y="562" text-anchor="middle" font-family="${FONT}" font-size="31" font-weight="700" fill="#d8b25e" letter-spacing="5">자일색 · 대사희 — 더블 역만</text>
    <text x="600" y="598" text-anchor="middle" font-family="${FONT}" font-size="21" font-weight="500" fill="#7d968a">수패 열네 장이 통째로 자패가 된 순간</text>
  </g>
</svg>
`;

writeFileSync(resolve(here, "og.svg"), svg);
console.log(`og.svg — ${HAND.length + BEFORE.length}장 embed, ${(svg.length / 1024).toFixed(0)}KB`);
