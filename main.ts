// The World in One Image — Friday 20 November 2026.
// A program that draws a newspaper front page summarising the day's world
// news and writes it as a single PNG to /output/entry.png.
//
// How it works: a tiny RGB canvas is drawn with hand-made primitives
// (rectangles, lines, circles, triangles), text is set with a hand-made
// 5x7 bitmap font, and the pixels are packed into a PNG with a hand-made
// encoder (CRC32 + chunk assembly, deflate through node:zlib). Node 22,
// standard library only, no network, no files read, fully deterministic:
// the same run always writes the same bytes.
//
// Stories (all first reported on 20 November 2026, in one time zone or
// another — see README.md for the source of each one):
//   1. Trump puts the Iran war decision off to 2027.
//   2. Cyclone Akvan: about 300,000 evacuated, landfall due in Odisha.
//   3. Anthropic's Nasdaq debut touches $2 trillion; the Dow dives 1,101.
//   4. GTA 6 takes $1.84bn on day one, passing The Odyssey's $1.805bn.
//   5. Voyager 1 becomes the first craft one light-day from Earth.
//   6. Europe says it is ready to negotiate with Russia over Ukraine.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas size
const W = 1024;
const H = 1024;

// ------------------------------------------------------------------- palette
// A newspaper palette: cream paper, navy ink, red for the lead, and one
// accent colour per story so the eye can find each panel at a glance.
const PAPER = [247, 243, 232];
const PAPER_DARK = [238, 231, 214];
const CARD = [255, 253, 247];
const INK = [20, 33, 61];
const INK_SOFT = [58, 68, 92];
const RED = [178, 44, 36];
const TEAL = [14, 124, 123];
const GOLD = [196, 138, 30];
const BLUE = [36, 90, 168];
const GREEN = [32, 128, 64];
const PURPLE = [104, 74, 158];
const LINE = [190, 182, 163];
const WHITE = [255, 255, 255];

type RGB = [number, number, number];

// ------------------------------------------------------------- CRC32 (PNG)
// The table is built at start-up from the standard polynomial, so the
// encoder carries no lookup data of its own.
function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Encode an RGB buffer (W x H, 3 bytes per pixel) as a whole PNG.
// Every scanline is stored unfiltered (filter byte 0) and the image data
// is deflated once at level 9, which keeps the output byte-identical
// between runs on the same Node build.
function encodePng(rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ canvas
// A plain RGB frame buffer with the few drawing primitives the page
// needs. Everything is clipped to the canvas, so a shape drawn half off
// the edge can never write outside the buffer.
class Canvas {
  buf = new Uint8Array(W * H * 3);

  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }

  fill(c: RGB): void {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = c[0];
      this.buf[i * 3 + 1] = c[1];
      this.buf[i * 3 + 2] = c[2];
    }
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(W, x + w);
    const y1 = Math.min(H, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.px(xx, yy, c);
    }
  }

  // A rectangle outline of the given thickness.
  strokeRect(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }

  // Bresenham's line, thickened by stamping a small square at each step.
  line(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    const r = Math.floor(t / 2);
    for (;;) {
      this.fillRect(x - r, y - r, t, t, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  // A polyline through the given points.
  polyline(pts: [number, number][], t: number, c: RGB): void {
    for (let i = 0; i + 1 < pts.length; i++) {
      this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], t, c);
    }
  }

  // A filled disc, drawn scanline by scanline.
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, c);
    }
  }

  // A ring (circle outline) of the given thickness.
  ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + r * Math.cos(rad));
      const y = Math.round(cy + r * Math.sin(rad));
      this.fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    }
  }

  // An arc of a ring, from a0 to a1 degrees.
  arc(cx: number, cy: number, r: number, t: number, a0: number, a1: number, c: RGB): void {
    for (let a = a0; a <= a1; a += 1) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + r * Math.cos(rad));
      const y = Math.round(cy + r * Math.sin(rad));
      this.fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    }
  }

  // A filled triangle, rasterised one scanline at a time.
  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges: [number, number, number, number][] = [
        [x0, y0, x1, y1],
        [x1, y1, x2, y2],
        [x2, y2, x0, y0],
      ];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      if (xs.length >= 2) {
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        for (let x = Math.ceil(lo); x <= Math.floor(hi); x++) this.px(x, y, c);
      }
    }
  }
}

// ------------------------------------------------------------ bitmap font
// A 5-wide by 7-tall bitmap font, one glyph per character. Each glyph is
// seven rows; each row is a five-bit number, the leftmost column in the
// highest bit. All page text is set in capitals, which suits a newspaper
// and keeps the table to one case. The rows below were drawn by hand,
// letter by letter, for this page.
const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
};

// The rest of the font: N to Z, the digits, and the punctuation the page
// needs. A space is five blank rows; an unknown character is drawn blank.
const FONT_REST: Record<string, number[]> = {
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ",": [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  ":": [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  ";": [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  "-": [0, 0, 0, 0b01110, 0, 0, 0],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  "&": [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "+": [0, 0b00100, 0b00100, 0b01110, 0b00100, 0b00100, 0],
  "=": [0, 0, 0b11111, 0, 0b11111, 0, 0],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0b01010, 0, 0, 0, 0],
  "*": [0, 0b10101, 0b01110, 0b10101, 0, 0, 0],
  "#": [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  _: [0, 0, 0, 0, 0, 0, 0b11111],
  ">": [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  "<": [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  // An em dash: a full-width bar across the middle row.
  "—": [0, 0, 0, 0b11111, 0, 0, 0],
  // A middle dot, used between sources in the footer.
  "·": [0, 0, 0, 0b01100, 0b01100, 0, 0],
};
Object.assign(FONT, FONT_REST);

// -------------------------------------------------------------- text
// One glyph cell is 5 columns plus 1 column of space, so a character
// advances 6 * scale pixels and stands 7 * scale pixels tall.
function charAdvance(scale: number): number {
  return 6 * scale;
}

function textWidth(text: string, scale: number): number {
  return text.length * charAdvance(scale) - scale;
}

function drawChar(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB): void {
  const glyph = FONT[ch] ?? FONT[" "];
  for (let row = 0; row < 7; row++) {
    const bits = glyph[row];
    for (let col = 0; col < 5; col++) {
      if (bits & (1 << (4 - col))) {
        cv.fillRect(x + col * scale, y + row * scale, scale, scale, c);
      }
    }
  }
}

function drawText(cv: Canvas, text: string, x: number, y: number, scale: number, c: RGB): void {
  for (let i = 0; i < text.length; i++) {
    drawChar(cv, text[i], x + i * charAdvance(scale), y, scale, c);
  }
}

function drawTextCentred(cv: Canvas, text: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, text, cx - Math.floor(textWidth(text, scale) / 2), y, scale, c);
}

// Word-wrap: split the text into lines that fit maxWidth pixels at the
// given scale. A single word longer than the width is cut mid-word so
// that text can never overflow its panel.
function wrapText(text: string, scale: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const trial = line === "" ? word : line + " " + word;
      if (textWidth(trial, scale) <= maxWidth) {
        line = trial;
      } else {
        if (line !== "") lines.push(line);
        if (textWidth(word, scale) > maxWidth) {
          let rest = word;
          while (textWidth(rest, scale) > maxWidth) {
            let cut = 0;
            while (cut < rest.length && textWidth(rest.slice(0, cut + 1), scale) <= maxWidth) cut++;
            lines.push(rest.slice(0, cut));
            rest = rest.slice(cut);
          }
          line = rest;
        } else {
          line = word;
        }
      }
    }
    if (line !== "") lines.push(line);
  }
  return lines;
}

// Draw a wrapped paragraph, one line after another, and return the y
// just below the last line drawn.
function drawPara(cv: Canvas, text: string, x: number, y: number, scale: number, maxWidth: number, c: RGB, leading: number): number {
  const lines = wrapText(text, scale, maxWidth);
  for (const line of lines) {
    drawText(cv, line, x, y, scale, c);
    y += 7 * scale + leading;
  }
  return y;
}

// ------------------------------------------------------------------ icons
// One small picture per story, each drawn from the same primitives as
// the rest of the page. Every icon fits in a square box of the given
// size, anchored at its top-left corner, and uses only flat colours.

// A wall calendar page marked 2027: the year the Iran decision is put
// off to. The year itself is set in the bitmap font inside the page.
function drawCalendar(cv: Canvas, x: number, y: number, size: number): void {
  const u = size / 120;
  const px = (v: number) => Math.round(v * u);
  cv.fillRect(x, y + px(14), size, size - px(14), CARD);
  cv.strokeRect(x, y + px(14), size, size - px(14), Math.max(2, px(3)), INK);
  cv.fillRect(x, y + px(14), size, px(26), RED);
  cv.fillRect(x + px(18), y, px(8), px(22), INK);
  cv.fillRect(x + size - px(26), y, px(8), px(22), INK);
  drawTextCentred(cv, "2027", x + size / 2, y + px(52), 3, INK);
  cv.fillRect(x + px(16), y + px(88), size - px(32), px(4), LINE);
  drawTextCentred(cv, "JAN 1", x + size / 2, y + px(98), 2, RED);
}

// A cyclone: a spiral of widening arcs around a calm eye, with slanted
// rain below it.
function drawCyclone(cv: Canvas, x: number, y: number, size: number): void {
  const cx = x + size / 2;
  const cy = y + size * 0.42;
  const r0 = size / 2 - 6;
  cv.arc(cx, cy, Math.round(r0), 5, 200, 470, TEAL);
  cv.arc(cx, cy, Math.round(r0 * 0.72), 5, 20, 290, TEAL);
  cv.arc(cx, cy, Math.round(r0 * 0.46), 5, 200, 470, BLUE);
  cv.arc(cx, cy, Math.round(r0 * 0.24), 4, 20, 290, BLUE);
  cv.disc(cx, cy, Math.max(4, Math.round(size * 0.05)), GOLD);
  for (let i = 0; i < 4; i++) {
    const rx = x + Math.round(size * (0.18 + i * 0.22));
    const ry = y + Math.round(size * 0.82);
    cv.line(rx, ry, rx - 6, ry + 14, 3, BLUE);
  }
}

// A market chart: one line climbs (Anthropic's debut) while another
// falls off a cliff (the Dow), each ending in an arrowhead.
function drawChart(cv: Canvas, x: number, y: number, size: number): void {
  const pad = Math.round(size * 0.12);
  const x0 = x + pad;
  const x1 = x + size - pad;
  const y0 = y + pad;
  const y1 = y + size - pad;
  cv.line(x0, y0, x0, y1, 3, INK_SOFT);
  cv.line(x0, y1, x1, y1, 3, INK_SOFT);
  const up: [number, number][] = [
    [x0, y1 - 8],
    [x0 + 22, y1 - 26],
    [x0 + 44, y1 - 20],
    [x0 + 66, y1 - 52],
    [x1, y0 + 6],
  ];
  cv.polyline(up, 4, GREEN);
  cv.triangle(x1 - 10, y0 + 2, x1 - 10, y0 + 14, x1 + 2, y0 + 8, GREEN);
  const down: [number, number][] = [
    [x0, y0 + 22],
    [x0 + 22, y0 + 26],
    [x0 + 44, y0 + 30],
    [x0 + 66, y0 + 58],
    [x1, y1 - 4],
  ];
  cv.polyline(down, 4, RED);
  cv.triangle(x1 - 10, y1 - 12, x1 - 10, y1, x1 + 2, y1 - 6, RED);
}

// A game controller: body, directional pad, four action buttons and
// two thumb sticks.
function drawController(cv: Canvas, x: number, y: number, size: number): void {
  const u = size / 120;
  const px = (v: number) => Math.round(v * u);
  cv.fillRect(x + px(6), y + px(34), size - px(12), px(62), INK);
  cv.disc(x + px(18), y + px(96), px(16), INK);
  cv.disc(x + size - px(18), y + px(96), px(16), INK);
  cv.disc(x + px(18), y + px(96), px(10), INK_SOFT);
  cv.disc(x + size - px(18), y + px(96), px(10), INK_SOFT);
  cv.fillRect(x + px(24), y + px(52), px(8), px(26), WHITE);
  cv.fillRect(x + px(15), y + px(61), px(26), px(8), WHITE);
  const bx = x + size - px(42);
  const by = y + px(56);
  cv.disc(bx, by, px(6), GOLD);
  cv.disc(bx + px(18), by, px(6), RED);
  cv.disc(bx + px(9), by - px(9), px(6), GREEN);
  cv.disc(bx + px(9), by + px(9), px(6), BLUE);
  cv.disc(x + px(58), y + px(52), px(9), PAPER);
  cv.ring(x + px(58), y + px(52), px(9), 2, INK_SOFT);
}

// Voyager 1: a gold bus, a dish beaming home, and a long boom, under
// a scattering of stars. The signal arcs are the one-light-day message.
function drawVoyager(cv: Canvas, x: number, y: number, size: number): void {
  const u = size / 120;
  const px = (v: number) => Math.round(v * u);
  for (const [sx, sy] of [
    [8, 10],
    [30, 4],
    [96, 8],
    [112, 26],
    [6, 44],
    [104, 96],
    [14, 108],
  ]) {
    cv.fillRect(x + px(sx), y + px(sy), px(4), px(4), INK);
  }
  cv.line(x + px(28), y + px(64), x + px(86), y + px(64), px(4), INK_SOFT);
  cv.fillRect(x + px(44), y + px(52), px(34), px(26), GOLD);
  cv.strokeRect(x + px(44), y + px(52), px(34), px(26), 2, INK);
  cv.line(x + px(44), y + px(65), x + px(24), y + px(44), px(3), INK);
  cv.line(x + px(44), y + px(65), x + px(24), y + px(86), px(3), INK);
  cv.arc(x + px(20), y + px(65), px(22), px(4), 90, 270, INK);
  cv.line(x + px(78), y + px(65), x + px(104), y + px(30), px(3), INK);
  cv.disc(x + px(106), y + px(28), px(5), RED);
  cv.arc(x + px(20), y + px(65), px(32), 2, 100, 260, TEAL);
  cv.arc(x + px(20), y + px(65), px(40), 2, 110, 250, TEAL);
}

// Two speech bubbles: Europe and Russia talking, at last, about ending
// the war in Ukraine.
function drawTalks(cv: Canvas, x: number, y: number, size: number): void {
  const u = size / 120;
  const px = (v: number) => Math.round(v * u);
  cv.fillRect(x + px(6), y + px(16), px(62), px(40), BLUE);
  cv.triangle(x + px(16), y + px(56), x + px(34), y + px(56), x + px(16), y + px(72), BLUE);
  cv.disc(x + px(22), y + px(36), px(4), WHITE);
  cv.disc(x + px(37), y + px(36), px(4), WHITE);
  cv.disc(x + px(52), y + px(36), px(4), WHITE);
  cv.fillRect(x + size - px(68), y + px(58), px(62), px(40), TEAL);
  cv.triangle(x + size - px(34), y + px(98), x + size - px(16), y + px(98), x + size - px(16), y + px(114), TEAL);
  cv.disc(x + size - px(52), y + px(78), px(4), WHITE);
  cv.disc(x + size - px(37), y + px(78), px(4), WHITE);
  cv.disc(x + size - px(22), y + px(78), px(4), WHITE);
}

// ------------------------------------------------------------------ layout
// The page is a newspaper front page: a navy masthead, one lead story,
// a two-by-two grid of shorter stories, one wide panel, and a footer
// naming the sources. All coordinates are fixed, so the layout is the
// same on every run.

const MARGIN = 20;
const PAGE_LEFT = MARGIN;
const PAGE_RIGHT = W - MARGIN;
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

function drawMasthead(cv: Canvas): void {
  cv.fillRect(0, 0, W, 116, INK);
  drawTextCentred(cv, "THE WORLD IN ONE IMAGE", W / 2, 18, 5, PAPER);
  drawText(cv, "FRIDAY", PAGE_LEFT, 74, 2, GOLD);
  drawTextCentred(cv, "SIX STORIES FROM ONE DAY", W / 2, 74, 2, PAPER);
  const date = "20 NOVEMBER 2026";
  drawText(cv, date, PAGE_RIGHT - textWidth(date, 2), 74, 2, GOLD);
  cv.fillRect(0, 104, W, 4, GOLD);
  cv.fillRect(0, 112, W, 4, RED);
}

// A small outlined chip with centred text, used for the lead's key facts.
function drawChip(cv: Canvas, x: number, y: number, text: string, fg: RGB): number {
  const w = textWidth(text, 2) + 20;
  cv.strokeRect(x, y, w, 24, 2, fg);
  drawText(cv, text, x + 10, y + 5, 2, fg);
  return w;
}

function drawLead(cv: Canvas): void {
  const x = PAGE_LEFT;
  const y = 128;
  const w = PAGE_WIDTH;
  const h = 264;
  cv.fillRect(x, y, w, h, CARD);
  cv.strokeRect(x, y, w, h, 2, INK);
  cv.fillRect(x, y, w, 8, RED);
  drawText(cv, "LEAD STORY — WASHINGTON", x + 16, y + 22, 2, RED);
  const hx = x + 16;
  let hy = y + 50;
  for (const line of ["TRUMP PUTS IRAN", "WAR DECISION OFF", "TO 2027"]) {
    drawText(cv, line, hx, hy, 4, INK);
    hy += 32;
  }
  drawPara(
    cv,
    "NO NEW STRIKES THIS YEAR, HE SAYS AFTER TALKS IN CHINA: 'WE'LL SEE WHAT HAPPENS AFTER JANUARY 1' — AS ISRAEL PRESSES FOR A NEW CAMPAIGN AND US WAR COSTS PASS $48BN.",
    hx,
    y + 158,
    2,
    620,
    INK_SOFT,
    4,
  );
  const cy = y + 232;
  let cx = hx;
  cx += drawChip(cv, cx, cy, "DECISION: AFTER JAN 1, 2027", RED) + 12;
  drawChip(cv, cx, cy, "WAR COST SO FAR: $48BN", INK);
  // The right-hand column: the calendar, and a divider from the text.
  cv.fillRect(x + 668, y + 22, 2, h - 44, LINE);
  drawCalendar(cv, x + 716, y + 34, 170);
  drawTextCentred(cv, "DECISION DEFERRED", x + 716 + 85, y + 218, 2, INK_SOFT);
}

// One grid card: a coloured top rule, a kicker, a one-line headline, a
// short body on the left and the story's icon on the right.
function drawCard(
  cv: Canvas,
  x: number,
  y: number,
  accent: RGB,
  kicker: string,
  headline: string,
  body: string,
  icon: (cv: Canvas, x: number, y: number, size: number) => void,
): void {
  const w = 484;
  const h = 176;
  cv.fillRect(x, y, w, h, CARD);
  cv.strokeRect(x, y, w, h, 2, INK);
  cv.fillRect(x, y, w, 6, accent);
  drawText(cv, kicker, x + 16, y + 16, 2, accent);
  drawText(cv, headline, x + 16, y + 40, 3, INK);
  // The body gets 330 px so a four-line body never spills a lone word
  // onto a fifth line near the card's bottom edge.
  drawPara(cv, body, x + 16, y + 74, 2, 330, INK_SOFT, 4);
  icon(cv, x + w - 16 - 108, y + 60, 108);
}

function drawWide(cv: Canvas): void {
  const x = PAGE_LEFT;
  const y = 776;
  const w = PAGE_WIDTH;
  const h = 148;
  cv.fillRect(x, y, w, h, CARD);
  cv.strokeRect(x, y, w, h, 2, INK);
  cv.fillRect(x, y, w, 6, BLUE);
  drawText(cv, "EUROPE — BERLIN", x + 16, y + 16, 2, BLUE);
  drawText(cv, "EUROPE READY TO TALK TO RUSSIA ON UKRAINE", x + 16, y + 40, 3, INK);
  drawPara(
    cv,
    "AT A BERLIN SUMMIT OF THE COALITION OF THE WILLING, LEADERS SAY THEY ARE READY TO NEGOTIATE AN END TO THE WAR — IF KYIV AND EUROPE HAVE A SEAT AT THE TABLE. PUTIN INVITES EUROPEANS TO MOSCOW.",
    x + 16,
    y + 72,
    2,
    800,
    INK_SOFT,
    4,
  );
  drawTalks(cv, x + w - 16 - 120, y + 14, 120);
}

function drawFooter(cv: Canvas): void {
  cv.fillRect(PAGE_LEFT, 932, PAGE_WIDTH, 2, LINE);
  drawTextCentred(
    cv,
    "SOURCES: REUTERS · BBC · THE HINDU · TIMES OF INDIA · SENSOR TOWER · NASA",
    W / 2,
    946,
    2,
    INK_SOFT,
  );
  drawTextCentred(
    cv,
    "DRAWN ENTIRELY IN CODE — NO PHOTOGRAPHS · ONE IMAGE, SIX STORIES, ONE DAY",
    W / 2,
    970,
    2,
    INK_SOFT,
  );
}

// -------------------------------------------------------------------- main
function main(): void {
  const cv = new Canvas();
  cv.fill(PAPER);
  drawMasthead(cv);
  drawLead(cv);
  drawCard(
    cv, PAGE_LEFT, 404, TEAL,
    "CYCLONE AKVAN — INDIA",
    "300,000 FLEE THE STORM",
    "LANDFALL DUE TODAY NEAR PURI AND GOPALPUR, ODISHA. WINDS 100 KM/H, RED ALERTS IN 11 DISTRICTS.",
    drawCyclone,
  );
  drawCard(
    cv, PAGE_LEFT + 500, 404, GREEN,
    "MARKETS — NEW YORK",
    "ANT SOARS, DOW SINKS",
    "ANTHROPIC CLOSES AT $97.17, UP 17%, AFTER TOUCHING $2 TRILLION. THE DOW DIVES 1,101 POINTS.",
    drawChart,
  );
  drawCard(
    cv, PAGE_LEFT, 588, GOLD,
    "GAMES — LAUNCH DAY",
    "$1.84BN BEATS THE ODYSSEY",
    "GTA 6 SELLS 19.05M COPIES ON DAY ONE, PASSING THE $1.805BN GLOBAL RUN OF NOLAN'S FILM.",
    drawController,
  );
  drawCard(
    cv, PAGE_LEFT + 500, 588, PURPLE,
    "SPACE — NASA",
    "ONE LIGHT-DAY FROM HOME",
    "VOYAGER 1 PASSES 16 BILLION MILES, 49 YEARS AFTER LAUNCH — THE FARTHEST HUMAN-MADE OBJECT.",
    drawVoyager,
  );
  drawWide(cv);
  drawFooter(cv);
  const png = encodePng(cv.buf);
  mkdirSync("/output", { recursive: true });
  writeFileSync("/output/entry.png", png);
  console.log(`wrote /output/entry.png (${png.length} bytes, 1024x1024)`);
}

main();
