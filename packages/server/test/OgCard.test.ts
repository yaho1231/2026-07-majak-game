/**
 * 초대 링크 공유 카드 — 흰 종이에 방 코드만 찍힌 PNG 와, 그것을 가리키게
 * 갈아 끼우는 메타 태그.
 *
 * 여기서 지키는 것: **코드마다 다른 그림**이 나오고(캐시가 섞이지 않고), 그림이
 * 진짜 PNG 이고, 실제 index.html 에서 갈아 끼울 자리 셋이 모두 맞는다는 것.
 * 마지막 것이 특히 중요하다 — 마크업이 조금만 바뀌어도 조용히 안 갈리고,
 * 그러면 모든 초대 링크가 옛 정적 카드를 보여 준다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";
import { OG_CARD_H, OG_CARD_W, ogCardFor, ogCardSupports, renderOgCard } from "../src/ogCard.js";
import { OG_GLYPH_CHARS } from "../src/ogGlyphAtlas.js";
import { injectInviteMeta, ogCardPath } from "../src/ogMeta.js";
import { CODE_CHARS, isRoomCodeShape } from "../src/RoomManager.js";

const INDEX_HTML = resolve(__dirname, "../../client/index.html");

/** 8비트 회색조 PNG 를 되읽는다 (ogCard 가 내는 형식만 다룬다) */
function decodeGray(png: Buffer): { width: number; height: number; px: Buffer } {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8); // 비트 깊이
      expect(data[9]).toBe(0); // 회색조
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width + 1)]).toBe(0); // 필터 None
    raw.copy(px, y * width, y * (width + 1) + 1, (y + 1) * (width + 1));
  }
  return { width, height, px };
}

/** 잉크(어두운 픽셀)가 닿은 범위 */
function inkBox(px: Buffer, width: number, height: number) {
  let x0 = width;
  let x1 = 0;
  let y0 = height;
  let y1 = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((px[y * width + x] as number) > 128) continue;
      count++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
  return { x0, x1, y0, y1, count };
}

describe("초대 카드 그림", () => {
  it("글자 그림판이 방 코드 문자 집합과 같다", () => {
    // 하나라도 빠지면 그 글자가 든 방의 카드가 500 으로 죽는다.
    expect([...OG_GLYPH_CHARS].sort().join("")).toBe([...CODE_CHARS].sort().join(""));
  });

  it("1200×630 회색조 PNG 를 낸다", () => {
    const { width, height } = decodeGray(renderOgCard("7Q79FM"));
    expect(width).toBe(OG_CARD_W);
    expect(height).toBe(OG_CARD_H);
  });

  it("흰 바탕에 검은 글자다 — 종이가 압도적으로 많고 잉크는 완전한 검정까지 간다", () => {
    const { px } = decodeGray(renderOgCard("7Q79FM"));
    let white = 0;
    let darkest = 255;
    for (const v of px) {
      if (v === 255) white++;
      if (v < darkest) darkest = v;
    }
    expect(white / px.length).toBeGreaterThan(0.85);
    expect(darkest).toBe(0);
  });

  it("코드가 종이 가운데에, 양옆 여백을 남기고 크게 놓인다", () => {
    const { px, width, height } = decodeGray(renderOgCard("7Q79FM"));
    const box = inkBox(px, width, height);
    // 가운데 — 잉크 상자의 중심이 종이 중심에서 2px 안쪽
    expect(Math.abs((box.x0 + box.x1) / 2 - width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs((box.y0 + box.y1) / 2 - height / 2)).toBeLessThanOrEqual(2);
    // 크게 — 폭의 절반은 넘고, 가장자리에 닿지는 않는다
    expect(box.x1 - box.x0).toBeGreaterThan(width * 0.5);
    expect(box.x1 - box.x0).toBeLessThan(width * 0.9);
    expect(box.y1 - box.y0).toBeGreaterThan(height * 0.2);
  });

  it("코드가 다르면 그림도 다르다 (캐시가 섞이지 않는다)", () => {
    expect(ogCardFor("AAAAAA").equals(ogCardFor("BBBBBB"))).toBe(false);
    // 같은 코드는 몇 번을 물어도 같은 바이트
    expect(ogCardFor("AAAAAA").equals(ogCardFor("AAAAAA"))).toBe(true);
  });

  it("서른두 글자 전부 잉크가 있다 — 빈 칸이 섞이면 카드에 구멍이 난다", () => {
    for (const ch of OG_GLYPH_CHARS) {
      const { px, width, height } = decodeGray(renderOgCard(ch));
      expect(inkBox(px, width, height).count).toBeGreaterThan(500);
    }
  });

  it("그림판에 없는 글자는 거절한다", () => {
    expect(ogCardSupports("7Q79FM")).toBe(true);
    expect(ogCardSupports("7q79fm")).toBe(false);
    expect(ogCardSupports("O0I1")).toBe(false);
    expect(ogCardSupports("")).toBe(false);
  });
});

describe("초대 코드 꼴", () => {
  it("여섯 글자 + 혼동 문자 제외만 통과한다", () => {
    expect(isRoomCodeShape("7Q79FM")).toBe(true);
    expect(isRoomCodeShape("7Q79F")).toBe(false);
    expect(isRoomCodeShape("7Q79FMM")).toBe(false);
    expect(isRoomCodeShape("7Q79F0")).toBe(false); // 0 은 코드에 안 쓴다
    expect(isRoomCodeShape("../../x")).toBe(false);
  });
});

describe("초대 메타 갈아 끼우기", () => {
  const html = readFileSync(INDEX_HTML, "utf8");

  it("실제 index.html 에 갈아 끼울 자리가 그대로 있다", () => {
    // 이 셋이 안 맞으면 아래 치환이 조용히 아무것도 안 한다.
    expect(html).toMatch(/<meta property="og:image" content="[^"]*\/og\.png/);
    expect(html).toMatch(/<meta name="twitter:image" content="[^"]*\/og\.png/);
    expect(html).toMatch(/<meta property="og:image:alt" content="/);
    expect(html).toMatch(/<meta property="og:url" content="/);
  });

  it("두 그림 주소가 모두 코드 카드로 바뀐다", () => {
    const out = injectInviteMeta(html, "7Q79FM");
    expect(out).not.toContain("/og.png");
    expect(out).toContain(`<meta property="og:image" content="https://majak.yaho1231.com${ogCardPath("7Q79FM")}"`);
    expect(out).toContain(`<meta name="twitter:image" content="https://majak.yaho1231.com${ogCardPath("7Q79FM")}"`);
  });

  it("og:url 에 방을 붙인다 — 카톡이 카드를 og:url 로 캐시하기 때문", () => {
    const out = injectInviteMeta(html, "7Q79FM");
    expect(out).toContain('<meta property="og:url" content="https://majak.yaho1231.com/?room=7Q79FM"');
    // canonical 은 건드리지 않는다 (초대 주소가 따로 색인될 이유가 없다)
    expect(out).toContain('<link rel="canonical" href="https://majak.yaho1231.com/" />');
  });

  it("대체 텍스트가 그림에 실제로 적힌 것을 말한다", () => {
    const out = injectInviteMeta(html, "7Q79FM");
    expect(out).toMatch(/<meta property="og:image:alt" content="방 코드 7Q79FM[^"]*"/);
    expect(out).not.toContain("개벽으로 손패 열네 장이");
  });

  it("나머지 문서는 손대지 않는다", () => {
    const out = injectInviteMeta(html, "7Q79FM");
    expect(out).toContain("<title>이능마작 — 증강 리치마작</title>");
    expect(out.length).toBeGreaterThan(html.length * 0.9);
  });
});
