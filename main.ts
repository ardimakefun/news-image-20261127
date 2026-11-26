// THE WORLD IN ONE DAY — Friday 27 November 2026
// A one-image world newspaper, drawn procedurally to PNG.
// Written fresh in this session for the news-image-20261127 bounty.
// No network, no clock, no randomness: identical input, identical bytes.
// Stdlib only: node:fs, node:zlib, node:crypto, node:path.
//
// How it works: an RGB pixel buffer (1024x1024) is painted with small
// shape helpers, text comes from a hand-built 5x7 bitmap font stored
// as 5-bit row masks, and the PNG is encoded by hand (raw scanlines,
// zlib deflate, CRC32 table built in code). All 13 facts come from
// research.md in the work directory; every story carries its TRUE
// event date beside it (only stories 3, 8 and 9 fall wholly on 27 Nov;
// story 2 spans 26-27 Nov).

import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";
import * as path from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 234];
const INK: RGB = [22, 22, 22];
const RED: RGB = [178, 34, 34];
const NAVY: RGB = [31, 58, 95];
const GREEN: RGB = [46, 125, 50];
const ORANGE: RGB = [196, 112, 0];
const PURPLE: RGB = [106, 63, 160];
const TEAL: RGB = [18, 110, 105];
const GOLD: RGB = [242, 201, 0];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [12, 12, 12];
const SAND: RGB = [226, 214, 180];
const SEA: RGB = [196, 216, 222];
const BODY: RGB = [60, 58, 52];
const MUTED: RGB = [90, 86, 78];
const HAIR: RGB = [200, 194, 182];
const CREAM: RGB = [250, 235, 220];

// ---------------------------------------------------------------- pixel buffer
const buf = new Uint8Array(W * H * 3);

function paintAll(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    buf[i * 3] = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }
}

function dot(x: number, y: number, c: RGB): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = (iy * W + ix) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function box(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) dot(xx, yy, c);
  }
}

function hBar(x: number, y: number, w: number, c: RGB): void {
  box(x, y, w, 1, c);
}

function vBar(x: number, y: number, h: number, c: RGB): void {
  box(x, y, 1, h, c);
}

function outline(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  box(x, y, w, t, c);
  box(x, y + h - t, w, t, c);
  box(x, y, t, h, c);
  box(x + w - t, y, t, h, c);
}

// Bresenham segment between integer endpoints.
function seg(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    dot(x, y, c);
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

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = -r; yy <= r; yy++) {
    const half = Math.floor(Math.sqrt(r * r - yy * yy));
    for (let xx = -half; xx <= half; xx++) dot(cx + xx, cy + yy, c);
  }
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    dot(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

// Filled triangle by scanline interpolation.
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const lo = Math.min(y0, y1, y2);
  const hi = Math.max(y0, y1, y2);
  const edges: [number, number, number, number][] = [
    [x0, y0, x1, y1],
    [x1, y1, x2, y2],
    [x2, y2, x0, y0],
  ];
  for (let y = lo; y <= hi; y++) {
    const xs: number[] = [];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    if (xs.length >= 2) {
      const a = Math.min(...xs);
      const b = Math.max(...xs);
      for (let x = Math.ceil(a); x <= Math.floor(b); x++) dot(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// One glyph = 7 rows; each row is a 5-bit mask, bit 4 = leftmost pixel.
// Stored as plain numbers so the table stays compact.
const GLYPHS: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15],
  b: [16, 16, 30, 17, 17, 17, 30],
  c: [0, 0, 14, 16, 16, 17, 14],
  d: [1, 1, 15, 17, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14],
  f: [6, 9, 8, 30, 8, 8, 8],
  g: [0, 15, 17, 17, 15, 1, 14],
  h: [16, 16, 30, 17, 17, 17, 17],
  i: [4, 0, 12, 4, 4, 4, 14],
  j: [2, 0, 6, 2, 2, 18, 12],
  k: [16, 16, 18, 20, 24, 20, 18],
  l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 21, 21],
  n: [0, 0, 30, 17, 17, 17, 17],
  o: [0, 0, 14, 17, 17, 17, 14],
  p: [0, 0, 30, 17, 17, 30, 16],
  q: [0, 0, 15, 17, 17, 15, 1],
  r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 15, 16, 14, 1, 30],
  t: [8, 8, 28, 8, 8, 8, 6],
  u: [0, 0, 17, 17, 17, 19, 13],
  v: [0, 0, 17, 17, 17, 10, 4],
  w: [0, 0, 17, 21, 21, 21, 10],
  x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 17, 17, 17, 15, 1, 14],
  z: [0, 0, 31, 2, 4, 8, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "-": [0, 0, 0, 14, 0, 0, 0],
  "/": [1, 2, 2, 4, 8, 8, 16],
  "%": [25, 26, 2, 4, 8, 11, 19],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
  $: [4, 15, 20, 14, 5, 30, 4],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "*": [0, 4, 21, 14, 21, 4, 0],
  "#": [10, 10, 31, 10, 31, 10, 10],
  "~": [0, 0, 9, 22, 0, 0, 0],
  "·": [0, 0, 0, 12, 12, 0, 0],
  _: [0, 0, 0, 0, 0, 0, 31],
  "[": [14, 8, 8, 8, 8, 8, 14],
  "]": [14, 2, 2, 2, 2, 2, 14],
};

// Normalise the few non-ASCII marks used in copy to plain glyphs.
function normCh(ch: string): string {
  if (ch === "–" || ch === "—") return "-";
  if (ch === "’" || ch === "‘") return "'";
  if (ch === "×") return "x";
  return ch;
}

function adv(s: number, bold: boolean): number {
  return Math.round(6 * s) + (bold ? Math.max(1, Math.round(s * 0.5)) : 0);
}

function strW(t: string, s: number, bold = false): number {
  if (t.length === 0) return 0;
  const a = adv(s, bold);
  return t.length * a - (a - Math.round(5 * s));
}

function drawChar(ch: string, x: number, y: number, s: number, c: RGB, bold: boolean): void {
  const g = GLYPHS[normCh(ch)] ?? GLYPHS["?"];
  const passes = bold ? 2 : 1;
  const off = Math.max(1, Math.round(s * 0.5));
  for (let p = 0; p < passes; p++) {
    const ox = x + p * off;
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      if (row === 0) continue;
      const y0 = Math.round(y + r * s);
      const y1 = Math.round(y + (r + 1) * s);
      for (let col = 0; col < 5; col++) {
        if ((row >> (4 - col)) & 1) {
          const x0 = Math.round(ox + col * s);
          const x1 = Math.round(ox + (col + 1) * s);
          box(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), c);
        }
      }
    }
  }
}

type Align = "left" | "center" | "right";

function drawStr(t: string, x: number, y: number, s: number, c: RGB, bold = false, align: Align = "left"): void {
  let sx = Math.round(x);
  if (align === "center") sx = Math.round(x - strW(t, s, bold) / 2);
  if (align === "right") sx = Math.round(x - strW(t, s, bold));
  for (const ch of t) {
    drawChar(ch, sx, y, s, c, bold);
    sx += adv(s, bold);
  }
}

// Greedy word wrap to a pixel width.
function wrapStr(t: string, maxW: number, s: number, bold = false): string[] {
  const words = t.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (strW(test, s, bold) <= maxW || cur === "") {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawPara(lines: string[], x: number, y: number, s: number, c: RGB, lh: number, bold = false, align: Align = "left"): void {
  lines.forEach((ln, i) => drawStr(ln, x, y + i * lh, s, c, bold, align));
}

// ---------------------------------------------------------------- PNG encoder
const CRC: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

function encodePNG(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- data
// Every fact below is copied from research.md (27 Nov 2026, 05:40 WIB).
// Dates are the TRUE event dates — only #3, #8 and #9 are dated 27 Nov.
const M = 16;
const CW = W - 2 * M; // 992

const REGIONS: { name: string; n: number; color: RGB }[] = [
  { name: "MIDDLE EAST", n: 2, color: RED },
  { name: "NORTH AMERICA", n: 2, color: PURPLE },
  { name: "EUROPE", n: 3, color: NAVY },
  { name: "ASIA", n: 2, color: ORANGE },
  { name: "AFRICA", n: 3, color: GREEN },
  { name: "OCEANIA", n: 1, color: TEAL },
];

const STATS: { big: string; l1: string; l2: string }[] = [
  { big: "2", l1: "ITALIANS KILLED", l2: "IN KUWAIT" },
  { big: "800,000+", l1: "WITHOUT POWER", l2: "THANKSGIVING STORM" },
  { big: "77,000", l1: "UK NET MIGRATION", l2: "YEAR TO JUNE 2026" },
  { big: "9", l1: "HURT IN BANGKOK", l2: "3 CRITICAL" },
  { big: "1,000,000", l1: "SATELLITES CLEARED", l2: "SPACEX STARMIND" },
  { big: "31", l1: "KILLED IN CAIRO", l2: "TANKER FIRE" },
];

// 14 timeline rungs, chronological. Myanmar (25 Nov) dropped for space;
// its story still appears in the ticker. The two overnight-into-26-Nov
// rungs (Odesa, Gaza strikes) sit before the 07:45 Bangkok rung.
// "25-26 NOV NIGHT" is 15 chars: at the normal 1.5 time scale it would
// be 148 px wide, wider than the 141.7 px cell, so those two rungs use
// ts 1.3 (133 px) instead.
const DAYLINE: { t: string; a: string; b: string; ts?: number }[] = [
  { t: "25 NOV 16:30", a: "CAIRO", b: "TANKER FIRE" },
  { t: "25 NOV", a: "FCC CLEARS", b: "SPACEX 1M" },
  { t: "25 NOV", a: "HIV JAB", b: "IN ZAMBIA" },
  { t: "25-26 NOV NIGHT", a: "ODESA", b: "SHIPS HIT", ts: 1.3 },
  { t: "25-26 NOV NIGHT", a: "GAZA STRIKES", b: "9-10 KILLED", ts: 1.3 },
  { t: "26 NOV 07:45", a: "BANGKOK", b: "BLAST, 9 HURT" },
  { t: "26 NOV AM", a: "UK MIGRATION", b: "77,000" },
  { t: "26 NOV", a: "GUINEA-BISSAU", b: "VOTE DELAYED" },
  { t: "26 NOV", a: "CAIRO DRIVER", b: "HELD" },
  { t: "26 NOV PM", a: "US STORM", b: "800,000 OUT" },
  { t: "26 NOV", a: "KUWAIT", b: "DRONE STRIKE" },
  { t: "27 NOV 01:00", a: "NZ RESULT", b: "DUE TODAY" },
  { t: "27 NOV", a: "GAZA SCHOOL", b: "6 KILLED" },
  { t: "27 NOV 23:00", a: "SPAIN", b: "CAMPAIGN ENDS" },
];

type Badge = "CONFIRMED" | "OFFICIAL" | "REPORTED";
const BADGE_COL: Record<Badge, RGB> = { CONFIRMED: GREEN, OFFICIAL: NAVY, REPORTED: RED };

function badge(x: number, y: number, kind: Badge, source: string): void {
  const label = kind + " · " + source;
  const w = strW(label, 1.5, true) + 10;
  box(x, y, w, 15, BADGE_COL[kind]);
  drawStr(label, x + 5, y + 2, 1.5, WHITE, true);
}

type Story = {
  n: number;
  place: string;
  region: string;
  date: string;
  head: string;
  body: string;
  kind: Badge;
  src: string;
  color: RGB;
};

const LEADS: Story[] = [
  {
    n: 1,
    place: "KUWAIT · MIDDLE EAST",
    region: "MIDDLE EAST",
    date: "26 NOV",
    head: "IRAN DRONE STRIKE KILLS 2 ITALIANS IN KUWAIT",
    body: "Two Italian technicians killed at a Kuwait air-defence station. Kuwait says it dealt with several drones; Iran denies blame. Two more hurt.",
    kind: "CONFIRMED",
    src: "REUTERS, BBC",
    color: RED,
  },
  {
    n: 2,
    place: "NEW YORK, USA",
    region: "NORTH AMERICA",
    date: "26-27 NOV",
    head: "STORM BLACKS OUT 800,000 ON THANKSGIVING",
    body: "Coastal storm cuts power to 800,000+ on Thanksgiving, with gusts up to 70 mph. The 100th Macy's parade moves to Sat 28 Nov, a first.",
    kind: "CONFIRMED",
    src: "USA TODAY, BBC",
    color: PURPLE,
  },
  {
    n: 3,
    place: "GAZA CITY · MIDDLE EAST",
    region: "MIDDLE EAST",
    date: "27 NOV",
    head: "6 KILLED IN STRIKE ON GAZA SCHOOL SHELTER",
    body: "Six killed, three of them children, in a strike on Al Tabi'een school shelter. Several wounded, some critically. Weapon not confirmed.",
    kind: "REPORTED",
    src: "OMAN NEWS AGENCY",
    color: RED,
  },
];

const SECONDARY: Story[] = [
  {
    n: 4,
    place: "ODESA · EUROPE",
    region: "EUROPE",
    date: "26 NOV",
    head: "Russia hits 2 grain ships off Odesa",
    body: "Two foreign cargo ships carrying 100,000+ tonnes of grain attacked overnight, Ukraine's PM says. No damage toll reported.",
    kind: "REPORTED",
    src: "REUTERS",
    color: NAVY,
  },
  {
    n: 5,
    place: "LONDON · EUROPE",
    region: "EUROPE",
    date: "26 NOV",
    head: "UK net migration falls to 77,000",
    body: "Provisional ONS figure, year to June 2026, down from 204,000. Lowest since 1997 outside Covid; 738,000 arrived, 661,000 left.",
    kind: "OFFICIAL",
    src: "ONS",
    color: NAVY,
  },
  {
    n: 6,
    place: "BANGKOK · ASIA",
    region: "ASIA",
    date: "26 NOV",
    head: "9 hurt in Bangkok refinery blast",
    body: "Blast and fire at Bangchak refinery; 9 hurt, 3 critically. All production units shut; cause under investigation.",
    kind: "CONFIRMED",
    src: "AP, CNN",
    color: ORANGE,
  },
  {
    n: 7,
    place: "BISSAU · AFRICA",
    region: "AFRICA",
    date: "26 NOV",
    head: "Guinea-Bissau vote delayed to 2028",
    body: "Junta decrees elections for Nov 2028, not Dec 2026, extending its transition by two years, a year after the coup.",
    kind: "CONFIRMED",
    src: "REUTERS, AP",
    color: GREEN,
  },
];

const ALSO: Story[] = [
  {
    n: 8,
    place: "WELLINGTON · OCEANIA",
    region: "OCEANIA",
    date: "27 NOV",
    head: "NZ awaits final result",
    body: "Official result due today from 14:00 NZDT, incl. 399,365 special votes. Prelims give the coalition 67 of 131 seats, a one-seat majority.",
    kind: "OFFICIAL",
    src: "NZ ELECTORAL COMM.",
    color: TEAL,
  },
  {
    n: 9,
    place: "MADRID · EUROPE",
    region: "EUROPE",
    date: "27 NOV",
    head: "Spain campaign ends before Sunday vote",
    body: "The 15-day campaign ends at midnight tonight; voting is Sun 29 Nov for all 350 Congress seats. Polls put PP ~31.5%, PSOE ~29%.",
    kind: "CONFIRMED",
    src: "REUTERS, BBC",
    color: NAVY,
  },
  {
    n: 10,
    place: "WASHINGTON DC",
    region: "NORTH AMERICA",
    date: "25 NOV",
    head: "SpaceX cleared for 1 million satellites",
    body: "FCC authorises up to 1,000,000 satellites for SpaceX's Starmind orbital AI data centres. First satellite due by Nov 2033.",
    kind: "OFFICIAL",
    src: "FCC",
    color: PURPLE,
  },
];

const TICKER: Story[] = [
  {
    n: 11,
    place: "CAIRO · AFRICA",
    region: "AFRICA",
    date: "25-26 NOV",
    head: "Driver held over Cairo fire that killed 31",
    body: "",
    kind: "CONFIRMED",
    src: "AP, REUTERS",
    color: GREEN,
  },
  {
    n: 12,
    place: "NAYPYIDAW · ASIA",
    region: "ASIA",
    date: "25 NOV",
    head: "Myanmar rejects ICJ genocide orders",
    body: "",
    kind: "REPORTED",
    src: "REUTERS",
    color: ORANGE,
  },
  {
    n: 13,
    place: "LUSAKA · AFRICA",
    region: "AFRICA",
    date: "25 NOV",
    head: "$40 HIV jab reaches Africa",
    body: "",
    kind: "CONFIRMED",
    src: "BBC, GLOBAL FUND",
    color: GREEN,
  },
];

const FIELDS: [string, number, RGB][] = [
  ["POLITICS", 4, NAVY],
  ["CONFLICT", 3, RED],
  ["DISASTER", 2, ORANGE],
  ["LAW", 2, [120, 90, 40]],
  ["TECHNOLOGY", 1, PURPLE],
  ["HEALTH", 1, GREEN],
];

// ---------------------------------------------------------------- lead scenes
// Each scene is an original flat drawing. A black caption bar sits at
// the bottom of every scene.

function captionBar(x: number, y: number, w: number, h: number, text: string): void {
  box(x, y + h - 15, w, 15, BLACK);
  drawStr(text, x + 6, y + h - 12, 1.5, WHITE, true);
}

function sceneKuwait(x: number, y: number, w: number, h: number): void {
  box(x, y, w, h, [20, 26, 44]); // night sky
  const stars: [number, number][] = [
    [12, 8], [40, 5], [70, 10], [120, 6], [180, 9], [230, 5], [270, 11],
    [30, 18], [95, 16], [150, 14], [205, 18], [255, 16], [290, 8],
  ];
  for (const [sx, sy] of stars) dot(x + sx, y + sy, [200, 205, 220]);
  box(x, y + h - 18, w, 18, [38, 36, 32]); // ground
  // Radar station: mast, dish, low building with lit windows.
  box(x + 34, y + 18, 64, h - 36, [70, 66, 60]);
  for (let i = 0; i < 3; i++) {
    box(x + 42 + i * 20, y + 24, 8, 7, GOLD);
    box(x + 42 + i * 20, y + 36, 8, 7, [40, 38, 34]);
  }
  vBar(x + 118, y + 8, h - 26, [150, 146, 138]);
  tri(x + 108, y + 8, x + 128, y + 8, x + 118, y + 22, [190, 186, 176]); // dish
  // Three drones, dark silhouettes with a red light each.
  const drones: [number, number][] = [
    [150, 14], [196, 8], [238, 18],
  ];
  for (const [dx, dy] of drones) {
    box(x + dx, y + dy, 16, 3, [10, 10, 12]);
    box(x + dx + 6, y + dy - 2, 4, 7, [10, 10, 12]);
    dot(x + dx + 8, y + dy + 1, RED);
  }
  // Explosion burst over the station roof.
  disc(x + 210, y + 30, 13, [240, 140, 40]);
  disc(x + 210, y + 30, 8, [250, 210, 80]);
  disc(x + 210, y + 30, 4, WHITE);
  disc(x + 186, y + 18, 7, [150, 146, 138]); // smoke
  disc(x + 232, y + 16, 9, [168, 164, 156]);
  disc(x + 222, y + 8, 6, [150, 146, 138]);
  captionBar(x, y, w, h, "AIR-DEFENCE STATION, KUWAIT");
}

function sceneStorm(x: number, y: number, w: number, h: number): void {
  box(x, y, w, h, [58, 66, 78]); // storm sky
  // Cloud masses, small and high behind the skyline: every disc top
  // stays at y-3 or lower, i.e. >= 9 px below the timeline text above
  // (which ends at scene y-11). Previously four big discs dominated the
  // scene and read as blobs, not a storm over a city.
  disc(x + 70, y + 9, 12, [38, 44, 54]); // cloud masses
  disc(x + 150, y + 8, 11, [44, 50, 60]);
  disc(x + 205, y + 9, 12, [38, 44, 54]);
  // New York skyline: 5 dark towers with lit windows, tallest with a
  // spire (Empire-State-like). Bottoms sit on the ground line y+40.
  const TOWERS: [number, number, number, RGB][] = [
    [6, 40, 18, [34, 38, 50]],
    [50, 36, 9, [28, 32, 44]],
    [90, 42, 16, [34, 38, 50]],
    [136, 42, 20, [28, 32, 44]],
    [182, 34, 14, [34, 38, 50]],
  ];
  for (const [bx, bw, top, c] of TOWERS) {
    box(x + bx, y + top, bw, h - 14 - top, c);
    for (let wx = bx + 6; wx + 2 <= bx + bw - 4; wx += 10) {
      for (let wy = top + 4; wy + 2 <= h - 16; wy += 8) {
        box(x + wx, y + wy, 2, 2, GOLD);
      }
    }
  }
  vBar(x + 66, y + 3, 6, [28, 32, 44]); // spire on the tallest tower
  dot(x + 67, y + 2, RED);
  box(x, y + h - 14, w, 14, [52, 56, 52]); // ground
  // Leaning power pole, 2 px thick, with crossarm and sagging wire.
  seg(x + 30, y + h - 14, x + 46, y + 20, [20, 18, 16]);
  seg(x + 31, y + h - 14, x + 47, y + 20, [20, 18, 16]);
  seg(x + 40, y + 24, x + 58, y + 22, [20, 18, 16]);
  seg(x + 40, y + 25, x + 58, y + 23, [20, 18, 16]);
  seg(x + 58, y + 22, x + 120, y + 34, [90, 86, 78]);
  seg(x + 120, y + 34, x + 175, y + 28, [90, 86, 78]);
  // Macy's parade balloon, enlarged 1.5x (r 15 -> 17) and floating, with
  // highlight, strings and a basket — no longer a flat red disc on the
  // street. Top of the balloon (y-2) stays 9 px below the timeline text.
  disc(x + 256, y + 15, 17, RED);
  disc(x + 250, y + 9, 5, [210, 70, 70]); // highlight
  seg(x + 248, y + 30, x + 253, y + 36, [30, 28, 26]); // strings
  seg(x + 264, y + 30, x + 259, y + 36, [30, 28, 26]);
  box(x + 250, y + 35, 12, 4, [90, 60, 30]); // basket
  // Diagonal rain, denser: spacing 14 px -> 8 px (40 lines).
  for (let i = 0; i < 40; i++) {
    const rx = x + 4 + i * 8;
    const ry = y + 4 + (i % 5) * 5;
    seg(rx, ry, rx - 4, ry + 9, [180, 200, 215]);
  }
  captionBar(x, y, w, h, "NEW YORK CITY - THANKSGIVING DAY");
}

function sceneGaza(x: number, y: number, w: number, h: number): void {
  box(x, y, w, h, [158, 138, 110]); // darkened brown-grey sky (was pale [214,196,168])
  box(x, y + h - 16, w, 16, [104, 88, 66]); // ground
  // School block, two storeys; right corner collapsed. Darker walls and
  // near-black windows for contrast (was pale cream, low contrast).
  box(x + 24, y + 10, 150, h - 26, [138, 118, 90]);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      box(x + 34 + c * 28, y + 16 + r * 14, 12, 8, [42, 36, 28]);
    }
  }
  tri(x + 174, y + 10, x + 210, y + 10, x + 210, y + h - 16, [108, 92, 70]); // broken wing
  // Dark contact shadow under the rubble, drawn before the rubble so its
  // edges stay visible at the sides.
  box(x + 184, y + h - 20, 112, 4, [84, 70, 52]);
  // Rubble pile at the base of the broken wing.
  tri(x + 190, y + h - 16, x + 235, y + h - 38, x + 280, y + h - 16, [126, 112, 94]);
  tri(x + 225, y + h - 16, x + 258, y + h - 30, x + 292, y + h - 16, [146, 132, 112]);
  box(x + 240, y + h - 30, 16, 5, [70, 64, 54]);
  // Two smoke columns rising from the rubble (stacked grey discs,
  // dark at the base, paler as they rise), plus a low dust puff.
  disc(x + 240, y + 30, 8, [128, 120, 110]);
  disc(x + 246, y + 22, 9, [146, 138, 126]);
  disc(x + 241, y + 14, 8, [164, 156, 144]);
  disc(x + 247, y + 7, 6, [180, 172, 160]);
  disc(x + 272, y + 33, 6, [128, 120, 110]);
  disc(x + 277, y + 26, 7, [148, 140, 128]);
  disc(x + 273, y + 19, 6, [166, 158, 146]);
  disc(x + 258, y + 34, 7, [190, 178, 158]);
  // A standing wall fragment, left of the rubble.
  box(x + 150, y + h - 34, 6, 18, [108, 92, 70]);
  captionBar(x, y, w, h, "AL TABI'EEN SCHOOL, GAZA CITY");
}

// ---------------------------------------------------------------- world map
// Coarse continent outlines (lon/lat), drawn equirectangular.
const CONTINENTS: number[][][] = [
  // North America
  [[-165, 65], [-140, 70], [-120, 71], [-100, 69], [-85, 66], [-75, 62], [-65, 60], [-55, 52], [-65, 45], [-70, 42], [-76, 35], [-81, 26], [-84, 30], [-90, 29], [-97, 26], [-97, 16], [-90, 14], [-83, 9], [-79, 9], [-85, 12], [-92, 15], [-97, 16], [-105, 20], [-112, 24], [-117, 32], [-124, 40], [-125, 48], [-132, 56], [-152, 60], [-165, 60]],
  // South America
  [[-79, 9], [-77, 4], [-80, -3], [-81, -6], [-77, -12], [-70, -18], [-70, -23], [-70, -30], [-72, -37], [-73, -44], [-74, -50], [-68, -52], [-65, -55], [-68, -50], [-62, -41], [-58, -34], [-52, -32], [-48, -28], [-41, -23], [-39, -17], [-35, -9], [-35, -6], [-40, -3], [-44, -2], [-50, 0], [-52, 4], [-55, 6], [-60, 8], [-62, 10], [-68, 11], [-72, 12], [-77, 8], [-79, 9]],
  // Eurasia
  [[-10, 36], [-9, 43], [-2, 44], [-4, 48], [0, 50], [4, 53], [8, 57], [10, 59], [5, 60], [10, 64], [18, 69], [28, 71], [35, 68], [45, 68], [55, 68], [65, 69], [75, 72], [90, 75], [105, 77], [120, 73], [135, 72], [150, 70], [160, 69], [170, 66], [178, 65], [170, 60], [162, 58], [158, 52], [156, 51], [150, 59], [142, 59], [140, 53], [135, 43], [130, 42], [127, 40], [122, 39], [120, 34], [115, 30], [110, 20], [108, 18], [105, 10], [103, 7], [100, 7], [98, 10], [97, 16], [94, 17], [92, 21], [89, 22], [86, 20], [80, 15], [77, 8], [75, 12], [72, 20], [66, 25], [62, 25], [58, 25], [56, 27], [54, 27], [52, 28], [50, 30], [48, 30], [44, 29], [40, 28], [36, 36], [33, 36], [30, 36], [27, 37], [23, 36], [22, 37], [19, 40], [18, 40], [15, 38], [16, 39], [12, 42], [10, 44], [8, 44], [3, 43], [0, 39], [-2, 37], [-6, 36], [-9, 37], [-10, 36]],
  // Africa
  [[-6, 35], [-10, 31], [-15, 27], [-17, 21], [-17, 15], [-15, 11], [-13, 8], [-8, 5], [-4, 5], [2, 6], [6, 4], [9, 4], [9, 0], [12, -4], [13, -10], [12, -17], [14, -22], [16, -28], [19, -34], [25, -34], [28, -32], [32, -28], [35, -24], [40, -16], [40, -10], [42, -4], [46, -1], [51, 2], [51, 10], [48, 11], [43, 11], [40, 15], [39, 20], [37, 22], [35, 28], [33, 31], [30, 31], [25, 32], [20, 32], [15, 32], [11, 34], [10, 37], [5, 37], [-6, 35]],
  // Australia
  [[114, -22], [114, -30], [115, -33], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [147, -39], [150, -37], [153, -32], [153, -27], [150, -23], [146, -19], [142, -15], [142, -11], [137, -12], [135, -15], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20], [114, -22]],
  // Greenland
  [[-45, 60], [-40, 64], [-32, 68], [-22, 70], [-20, 74], [-25, 78], [-35, 80], [-50, 80], [-58, 76], [-58, 70], [-53, 66], [-50, 62], [-45, 60]],
];

function drawMap(x0: number, y0: number, w: number, h: number): void {
  box(x0, y0, w, h, SEA);
  const lon0 = -170;
  const lon1 = 190;
  const lat0 = -58;
  const lat1 = 84;
  const X = (lon: number) => x0 + ((lon - lon0) * w) / (lon1 - lon0);
  const Y = (lat: number) => y0 + ((lat1 - lat) * h) / (lat1 - lat0);
  for (const poly of CONTINENTS) {
    const pts = poly.map(([lo, la]) => [X(lo), Y(la)] as [number, number]);
    const minY = Math.floor(Math.min(...pts.map((p) => p[1])));
    const maxY = Math.ceil(Math.max(...pts.map((p) => p[1])));
    for (let yy = minY; yy <= maxY; yy++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) {
          xs.push(ax + ((yy - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let xx = Math.ceil(xs[k]); xx <= Math.floor(xs[k + 1]); xx++) dot(xx, yy, SAND);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      seg(Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by), [150, 138, 108]);
    }
  }
  // Pins: [story, lon, lat, badge dx, badge dy]. Offsets are spread so
  // every pair of r=9 badges stays >= 21 px centre-to-centre
  // (checked against the equirectangular projection: 2.139 px/deg lon,
  // 0.62 px/deg lat on this 770x88 map).
  const PINS: [number, number, number, number, number][] = [
    [1, 47.98, 29.38, 14, -7], // Kuwait City
    [2, -74.01, 40.71, 17, -11], // New York City
    [3, 34.47, 31.5, 13, 8], // Gaza City
    [4, 30.72, 46.48, -13, -11], // Odesa
    [5, -0.13, 51.51, -17, -10], // London
    [6, 100.6, 13.69, 15, 8], // Bangkok
    [7, -15.6, 11.86, -16, 9], // Bissau
    [8, 174.78, -41.29, -14, -13], // Wellington
    [9, -3.7, 40.42, -16, 10], // Madrid
    [10, -77.04, 38.91, -15, 13], // Washington DC
    [11, 31.21, 30.09, 0, 16], // Giza / Cairo
    [12, 96.08, 19.76, -15, -11], // Naypyidaw
    [13, 28.32, -15.39, -16, -9], // Lusaka (dy -9: badge bottom stays above the legend strip)
  ];
  for (const [n, lo, la, dx, dy] of PINS) {
    const tx = Math.round(X(lo));
    const ty = Math.round(Y(la));
    const cx = tx + dx;
    const cy = ty + dy;
    if (dx !== 0 || dy !== 0) seg(tx, ty, cx, cy, INK);
    disc(tx, ty, 2, INK);
    disc(cx, cy, 9, RED);
    ring(cx, cy, 9, WHITE);
    drawStr(String(n), cx, cy - 5, 1.5, WHITE, true, "center");
  }
  box(x0, y0 + h - 15, w, 15, WHITE);
  hBar(x0, y0 + h - 15, w, INK);
  drawStr("CONFIRMED 2+ OUTLETS · OFFICIAL ON RECORD · REPORTED ONE OUTLET", x0 + w / 2, y0 + h - 12, 1.5, INK, true, "center");
}

// ---------------------------------------------------------------- story cards
const SCENES: ((x: number, y: number, w: number, h: number) => void)[] = [sceneKuwait, sceneStorm, sceneGaza];

// A lead column: scene, kicker with true date, headline, body, badge.
function leadCard(x: number, y: number, w: number, s: Story, scene: (x: number, y: number, w: number, h: number) => void): number {
  const sceneH = 54;
  scene(x, y, w, sceneH);
  let cy = y + sceneH + 4;
  box(x, cy, 20, 15, s.color);
  drawStr(String(s.n), x + 10, cy + 2, 1.5, WHITE, true, "center");
  drawStr(s.place, x + 26, cy + 2, 1.5, s.color, true);
  drawStr(s.date, x + w, cy + 2, 1.5, RED, true, "right");
  cy += 19;
  const hl = wrapStr(s.head, w, 2.4, true);
  drawPara(hl, x, cy, 2.4, INK, 18, true);
  cy += hl.length * 18 + 3;
  const bl = wrapStr(s.body, w, 1.8, false);
  drawPara(bl, x, cy, 1.8, BODY, 14, false);
  cy += bl.length * 14 + 4;
  badge(x, cy, s.kind, s.src);
  return cy + 15;
}

// A compact card: coloured header bar (place + true date), headline,
// body, badge.
function miniCard(x: number, y: number, w: number, s: Story): number {
  box(x, y, w, 19, s.color);
  drawStr(String(s.n), x + 6, y + 4, 1.5, WHITE, true);
  drawStr(s.place, x + 6 + strW(String(s.n), 1.5, true) + 6, y + 4, 1.5, WHITE, true);
  drawStr(s.date, x + w - 6, y + 4, 1.5, WHITE, true, "right");
  let cy = y + 19 + 4;
  const hl = wrapStr(s.head, w, 2, true);
  drawPara(hl, x, cy, 2, INK, 15, true);
  cy += hl.length * 15 + 2;
  const bl = wrapStr(s.body, w, 1.5, false);
  drawPara(bl, x, cy, 1.5, BODY, 11, false);
  cy += bl.length * 11 + 3;
  badge(x, cy, s.kind, s.src);
  return cy + 15;
}

// ---------------------------------------------------------------- build page
function build(): number {
  paintAll(PAPER);
  box(0, 0, W, 6, RED);
  let y = 10;

  drawStr("ONE DAY OF WORLD NEWS — ONE PICTURE", M, y, 2, RED, true);
  drawStr("13 STORIES · 6 REGIONS · 6 FIELDS", W - M, y, 2, INK, true, "right");
  y += 17;

  drawStr("THE WORLD IN ONE DAY", W / 2, y, 3, INK, true, "center");
  y += 22;
  drawStr("FRIDAY 27 NOVEMBER 2026", W / 2, y, 5, INK, true, "center");
  y += 39;
  drawStr("KUWAIT DRONE STRIKE · THANKSGIVING STORM · GAZA SCHOOL SHELTER", W / 2, y, 2, MUTED, true, "center");
  y += 14;
  box(M, y, CW, 2, INK);
  y += 6;

  // Region strip: 2+2+3+2+3+1 = 13.
  const segW = CW / REGIONS.length;
  REGIONS.forEach((r, i) => {
    const sx = M + i * segW;
    box(Math.round(sx), y, Math.ceil(segW) - 1, 20, r.color);
    drawStr(r.name + "  " + r.n, Math.round(sx + segW / 2), y + 5, 1.5, WHITE, true, "center");
  });
  y += 20;

  // Six-number strip: every figure comes from a story on this page.
  const cellW = CW / STATS.length;
  STATS.forEach((n, i) => {
    const cx = M + i * cellW + cellW / 2;
    if (i > 0) vBar(Math.round(M + i * cellW), y + 4, 40, HAIR);
    drawStr(n.big, cx, y, 2.8, RED, true, "center");
    drawStr(n.l1, cx, y + 25, 1.4, INK, true, "center");
    drawStr(n.l2, cx, y + 36, 1.4, MUTED, false, "center");
  });
  y += 50;
  hBar(M, y, CW, HAIR);
  y += 4;

  // Timeline: 14 rungs, 7 per row.
  drawStr("THE DAY IN UTC", M, y, 2, RED, true);
  drawStr("ALL TIMES UTC — FRI 27 NOVEMBER 2026", W - M, y, 2, INK, true, "right");
  y += 14;
  const tCellW = CW / 7;
  DAYLINE.forEach((ev, i) => {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const cx = M + col * tCellW + tCellW / 2;
    const cy = y + row * 41;
    if (col > 0) vBar(Math.round(M + col * tCellW), cy, 34, [210, 204, 192]);
    drawStr(ev.t, cx, cy, ev.ts ?? 1.5, RED, true, "center");
    drawStr(ev.a, cx, cy + 12, 1.7, INK, true, "center");
    drawStr(ev.b, cx, cy + 25, 1.7, INK, false, "center");
  });
  y += 82;
  box(M, y, CW, 2, INK);
  y += 5;

  // Leads 1-3.
  const gap = 12;
  const colW = (CW - 2 * gap) / 3;
  const e1 = leadCard(M, y, colW, LEADS[0], SCENES[0]);
  const e2 = leadCard(M + colW + gap, y, colW, LEADS[1], SCENES[1]);
  const e3 = leadCard(M + 2 * (colW + gap), y, colW, LEADS[2], SCENES[2]);
  y = Math.max(e1, e2, e3) + 3;
  box(M, y, CW, 2, INK);
  y += 5;

  // Secondary 4-7.
  const sColW = (CW - 3 * gap) / 4;
  const sEnds = SECONDARY.map((s, i) => miniCard(M + i * (sColW + gap), y, sColW, s));
  y = Math.max(...sEnds) + 2;

  // Also today 8-10.
  drawStr("ALSO TODAY — THREE MORE STORIES", M, y, 2, RED, true);
  y += 14;
  const aColW = (CW - 2 * gap) / 3;
  const aEnds = ALSO.map((s, i) => miniCard(M + i * (aColW + gap), y, aColW, s));
  y = Math.max(...aEnds) + 2;

  // Ticker 11-13, one line each.
  drawStr("THE TICKER — IN BRIEF", M, y, 2, RED, true);
  y += 14;
  for (const t of TICKER) {
    drawStr(String(t.n), M, y, 1.5, RED, true);
    const headX = M + 6 + strW(String(t.n), 1.5, true) + 8;
    drawStr(t.head, headX, y, 1.5, INK, true);
    drawStr("— " + t.date + " · " + t.kind + " · " + t.src, headX + strW(t.head, 1.5, true) + 12, y, 1.5, MUTED, false);
    y += 12;
  }

  // Map + field breakdown.
  drawStr("WHERE IT HAPPENED", M, y, 2, RED, true);
  drawStr("THE DAY BY FIELD", 796, y, 2, RED, true);
  y += 14;
  const mapY = y;
  const mapH = 88;
  drawMap(M, mapY, 770, mapH);
  outline(M, mapY, 770, mapH, INK, 1);
  FIELDS.forEach((f, i) => {
    const fx = 796;
    const fy = mapY + 1 + i * 15;
    box(fx, fy + 1, 9, 9, f[2]);
    drawStr(f[0] + "  " + f[1], fx + 14, fy, 1.5, INK, true);
  });
  y = mapY + mapH;
  drawStr("Map numbers match the story numbers above.", M, y + 1, 1.5, MUTED, false);
  y += 10;

  // Footer: honest date check + sources.
  hBar(M, y, CW, INK);
  y += 3;
  box(M, y, CW, 38, CREAM);
  outline(M, y, CW, 38, RED, 1);
  drawStr("DATE CHECK — Stories leading the news on Fri 27 Nov 2026; true dates shown.", M + 8, y + 3, 1.8, INK, true);
  drawStr("Only stories 3, 8 and 9 fall wholly on 27 Nov; story 2 spans 26-27 Nov; the rest are 25-26 Nov.", M + 8, y + 16, 1.5, INK, false);
  drawStr("Sources: Reuters · AP · BBC · CNN · ONS · FCC · NZ Electoral Commission · Oman News Agency · Global Fund", M + 8, y + 27, 1.5, MUTED, false);
  y += 38;
  return y;
}

// ---------------------------------------------------------------- main
function main(): void {
  const endY = build();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "./out";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath}`);
  console.log(`size=${png.length} bytes sha256=${sha}`);
  console.log(`dimensions=${W}x${H} endY=${endY}`);
}

main();
