// THE WORLD IN ONE DAY — FRIDAY 27 NOVEMBER 2026
// Fresh procedural renderer, written from scratch in this session.
// Node 22, stdlib only (node:fs, node:zlib, node:crypto, node:path).
// No network, no clock, no randomness: two runs write identical bytes.
// Output: 1024x1024 PNG at <out>/entry.png (MAKEFUN_OUTPUT_DIR or ./out).
//
// Layout (1024 x 1024):
//   masthead -> region strip -> 6-number strip -> 3 lead stories with
//   procedural scenes -> 4 secondary stories -> 3 "also today" stories ->
//   3-item ticker -> world map (13 numbered pins) + fields panel +
//   "The Day in UTC" timeline -> footer with honest DATE CHECK + sources.

import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";
import * as path from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 232];
const INK: RGB = [24, 28, 36];
const NAVY: RGB = [20, 36, 62];
const NAVY2: RGB = [30, 52, 84];
const GOLD: RGB = [198, 158, 62];
const CREAM: RGB = [247, 243, 232];
const MUTED: RGB = [92, 96, 104];
const RULE: RGB = [180, 172, 150];
const CARD: RGB = [255, 253, 246];
const GREEN: RGB = [31, 122, 66];
const AMBER: RGB = [176, 118, 10];
const BLUE: RGB = [28, 84, 158];
const RED: RGB = [168, 44, 34];
const SKY: RGB = [191, 211, 224];
const LAND: RGB = [226, 208, 158];
const LANDLINE: RGB = [150, 132, 92];

// ---------------------------------------------------------------- canvas
const img = new Uint8Array(W * H * 3);
function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; i += 3;
    }
  }
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  fillRect(x, y, w, 1, c); fillRect(x, y + h - 1, w, 1, c);
  fillRect(x, y, 1, h, c); fillRect(x + w - 1, y, 1, h, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let guard = 0; guard < 3000; guard++) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = -r; yy <= r; yy++) {
    const half = Math.floor(Math.sqrt(r * r - yy * yy));
    for (let xx = -half; xx <= half; xx++) px(cx + xx, cy + yy, c);
  }
}
function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}
function fillPoly(pts: Array<[number, number]>, c: RGB): void {
  // Even-odd scanline fill over integer rows.
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c);
    }
  }
}
function blend(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ---------------------------------------------------------------- bitmap font
// Hand-drawn 5x7 glyphs, one string per row ("1" = ink). Only capitals,
// digits and common punctuation are needed: all image text is uppercase.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "00000", "00000", "00000", "01100", "00000"],
  ";": ["00000", "01100", "00000", "00000", "01100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "\u2022": ["00000", "00000", "01110", "01110", "01110", "00000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "\u00d7": ["10001", "01010", "00100", "01010", "10001", "00000", "00000"],
};
function normChar(ch: string): string {
  if (ch === "\u2014" || ch === "\u2013" || ch === "\u2019") return ch === "\u2019" ? "'" : "-";
  return ch.toUpperCase();
}
function textWidth(text: string, scale: number): number {
  const t = [...text].map(normChar).join("");
  return t.length === 0 ? 0 : t.length * 6 * scale - scale;
}
function drawText(x: number, y: number, text: string, scale: number, c: RGB): number {
  const t = [...text].map(normChar).join("");
  let cx = Math.round(x);
  const yy = Math.round(y);
  for (const ch of t) {
    const g = FONT[ch] ?? FONT[" "];
    if (g) {
      for (let r = 0; r < 7; r++) {
        const row = g[r];
        for (let col = 0; col < 5; col++) {
          if (row[col] === "1") fillRect(cx + col * scale, yy + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx - x;
}
function drawTextCentered(cx: number, y: number, text: string, scale: number, c: RGB): void {
  drawText(Math.round(cx - textWidth(text, scale) / 2), y, text, scale, c);
}
function wrapText(text: string, maxW: number, scale: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, scale) <= maxW || cur === "") cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawWrapped(x: number, y: number, text: string, maxW: number, scale: number, c: RGB, lineH: number, maxLines: number): number {
  const lines = wrapText(text, maxW, scale).slice(0, maxLines);
  lines.forEach((ln, i) => drawText(x, y + i * lineH, ln, scale, c));
  return lines.length;
}

// ---------------------------------------------------------------- PNG writer
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- data
// All facts from research.md (27 Nov 2026 morning news cycle). Dates are
// each story's TRUE event date; see the DATE CHECK footer.
interface Story {
  n: number; kind: string; region: string; field: string;
  headline: string; body: string; badge: string; source: string; date: string;
  lat: number; lon: number;
}
const LEADS: Story[] = [
  { n: 1, kind: "LEAD 1", region: "MIDDLE EAST", field: "CONFLICT",
    headline: "IRAN DRONE STRIKE KILLS 2 ITALIANS IN KUWAIT",
    body: "TWO ITALIAN TECHNICIANS FOR RHEINMETALL ITALIA DIED WHEN IRANIAN DRONES HIT AN AIR-DEFENCE STATION IN KUWAIT. TWO MORE WERE HURT. IRAN DENIES RESPONSIBILITY.",
    badge: "CONFIRMED", source: "REUTERS + BBC", date: "26 NOV 2026", lat: 29.38, lon: 47.98 },
  { n: 2, kind: "LEAD 2", region: "NORTH AMERICA", field: "DISASTER",
    headline: "STORM BLACKS OUT 800,000 ON THANKSGIVING",
    body: "A COASTAL STORM HIT THE US EAST COAST ON THANKSGIVING, CUTTING POWER TO 800,000+ HOMES. GUSTS HIT 70 MPH. THE 100TH MACY'S PARADE MOVES TO SAT 28 NOV.",
    badge: "CONFIRMED", source: "USA TODAY + BBC", date: "26-27 NOV 2026", lat: 40.71, lon: -74.01 },
  { n: 3, kind: "LEAD 3", region: "MIDDLE EAST", field: "CONFLICT",
    headline: "6 KILLED IN STRIKE ON GAZA SCHOOL SHELTER",
    body: "SIX PALESTINIANS, INCLUDING THREE CHILDREN, WERE KILLED IN A STRIKE ON AL TABI'EEN SCHOOL, A SHELTER IN GAZA CITY. SEVERAL MORE WERE WOUNDED.",
    badge: "REPORTED", source: "OMAN NEWS AGENCY", date: "27 NOV 2026", lat: 31.5, lon: 34.47 },
];
const SECONDARY: Story[] = [
  { n: 4, kind: "SECONDARY", region: "EUROPE", field: "CONFLICT",
    headline: "RUSSIA HITS 2 GRAIN SHIPS OFF ODESA",
    body: "RUSSIA ATTACKED TWO FOREIGN GRAIN SHIPS OFF ODESA, CARRYING 100,000+ TONNES OF GRAIN, UKRAINE'S PM SAID.",
    badge: "REPORTED", source: "REUTERS", date: "26 NOV 2026", lat: 46.48, lon: 30.72 },
  { n: 5, kind: "SECONDARY", region: "EUROPE", field: "POLITICS",
    headline: "UK NET MIGRATION FALLS TO 77,000",
    body: "UK NET MIGRATION FELL TO 77,000 IN THE YEAR TO JUNE 2026 - LOWEST SINCE 1997 OUTSIDE COVID. 738,000 ARRIVED, 661,000 LEFT. (PROVISIONAL, ONS)",
    badge: "CONFIRMED", source: "ONS + REUTERS", date: "26 NOV 2026", lat: 51.51, lon: -0.13 },
  { n: 6, kind: "SECONDARY", region: "ASIA", field: "DISASTER",
    headline: "9 HURT IN BANGKOK REFINERY BLAST",
    body: "AN EXPLOSION AND FIRE AT THE BANGCHAK REFINERY IN BANGKOK HURT 9 PEOPLE, 3 CRITICALLY. ALL PRODUCTION WAS SHUT DOWN.",
    badge: "CONFIRMED", source: "AP + CNN", date: "26 NOV 2026", lat: 13.69, lon: 100.6 },
  { n: 7, kind: "SECONDARY", region: "AFRICA", field: "POLITICS",
    headline: "GUINEA-BISSAU VOTE DELAYED TO 2028",
    body: "GUINEA-BISSAU'S JUNTA DELAYED PRESIDENTIAL AND LEGISLATIVE ELECTIONS TO NOV 2028, TWO YEARS LATER THAN PROMISED.",
    badge: "CONFIRMED", source: "REUTERS + AP", date: "26 NOV 2026", lat: 11.86, lon: -15.6 },
];
const ALSO: Story[] = [
  { n: 8, kind: "ALSO TODAY", region: "OCEANIA", field: "POLITICS",
    headline: "NZ AWAITS FINAL RESULT",
    body: "NZ'S OFFICIAL ELECTION RESULT IS DUE TODAY, 14:00 NZDT, WITH ABOUT 400,000 SPECIAL VOTES. PRELIMINARY: COALITION 67 OF 131 SEATS.",
    badge: "OFFICIAL", source: "NZ ELECTORAL COMMISSION", date: "27 NOV 2026", lat: -41.29, lon: 174.78 },
  { n: 9, kind: "ALSO TODAY", region: "EUROPE", field: "POLITICS",
    headline: "SPAIN CAMPAIGN ENDS BEFORE SUNDAY VOTE",
    body: "SPAIN'S ELECTION CAMPAIGN ENDS AT MIDNIGHT. VOTING IS SUNDAY 29 NOV. POLLS: PP ABOUT 31.5%, PSOE ABOUT 29%.",
    badge: "CONFIRMED", source: "REUTERS + BBC", date: "27 NOV 2026", lat: 40.42, lon: -3.7 },
  { n: 10, kind: "ALSO TODAY", region: "NORTH AMERICA", field: "TECHNOLOGY",
    headline: "SPACEX CLEARED FOR 1 MILLION SATELLITES",
    body: "THE FCC AUTHORISED SPACEX TO LAUNCH UP TO 1,000,000 SATELLITES FOR ITS STARMIND CONSTELLATION. FIRST SATELLITE DUE BY 2033.",
    badge: "OFFICIAL", source: "FCC + REUTERS", date: "25 NOV 2026", lat: 38.91, lon: -77.04 },
];
const TICKER: Story[] = [
  { n: 11, kind: "TICKER", region: "AFRICA", field: "LAW",
    headline: "DRIVER HELD OVER CAIRO FIRE THAT KILLED 31",
    body: "EGYPT DETAINED THE DRIVER BLAMED FOR THE TANKER FIRE ON CAIRO'S RING ROAD. 31 PEOPLE DIED.",
    badge: "CONFIRMED", source: "AP + REUTERS + BBC", date: "25-26 NOV 2026", lat: 30.09, lon: 31.21 },
  { n: 12, kind: "TICKER", region: "ASIA", field: "LAW",
    headline: "MYANMAR REJECTS ICJ GENOCIDE ORDERS",
    body: "MYANMAR SAID IT WILL NOT FULLY COMPLY WITH THE ICJ GENOCIDE RULING. THE COURT RULED ON 19-20 NOV.",
    badge: "REPORTED", source: "REUTERS", date: "25-26 NOV 2026", lat: 19.76, lon: 96.08 },
  { n: 13, kind: "TICKER", region: "AFRICA", field: "HEALTH",
    headline: "$40 HIV JAB REACHES AFRICA",
    body: "THE FIRST GENERIC LENACAPAVIR SHIPMENT ARRIVED IN ZAMBIA. ABOUT $40 A YEAR, VS $28,000 BRANDED.",
    badge: "CONFIRMED", source: "BBC + GLOBAL FUND", date: "25 NOV 2026", lat: -15.39, lon: 28.32 },
];
const REGIONS: Array<[string, number]> = [
  ["MIDDLE EAST", 2], ["NORTH AMERICA", 2], ["EUROPE", 3],
  ["ASIA", 2], ["AFRICA", 3], ["OCEANIA", 1],
];
const NUMBERS: Array<[string, string]> = [
  ["2", "ITALIANS KILLED IN KUWAIT"],
  ["800,000+", "WITHOUT POWER IN US STORM"],
  ["77,000", "UK NET MIGRATION"],
  ["9", "HURT IN BANGKOK BLAST"],
  ["1,000,000", "SATELLITES CLEARED FOR SPACEX"],
  ["31", "KILLED IN CAIRO TANKER FIRE"],
];
const FIELDS: Array<[string, number]> = [
  ["CONFLICT", 3], ["DISASTER", 2], ["POLITICS", 4],
  ["TECHNOLOGY", 1], ["LAW", 2], ["HEALTH", 1],
];
const TIMELINE: string[] = [
  "25 NOV - FCC CLEARS SPACEX 1M SATELLITES",
  "25 NOV - FIRST GENERIC HIV JAB LANDS IN ZAMBIA",
  "26 NOV - RUSSIA HITS 2 GRAIN SHIPS OFF ODESA",
  "26 NOV - 9-10 KILLED IN GAZA STRIKES OVERNIGHT",
  "26 NOV 07:45 UTC - BANGKOK REFINERY BLAST, 9 HURT",
  "26 NOV - UK NET MIGRATION 77,000, LOWEST SINCE 1997",
  "26 NOV - GUINEA-BISSAU VOTE DELAYED TO 2028",
  "26 NOV - DRIVER HELD OVER CAIRO FIRE, 31 DEAD",
  "26 NOV - STORM BLACKS OUT 800,000+ IN US",
  "26 NOV - 2 ITALIANS KILLED IN KUWAIT DRONE ATTACK",
  "27 NOV 01:00 UTC - NZ OFFICIAL RESULT DUE",
  "27 NOV - 6 KILLED IN STRIKE ON GAZA SCHOOL",
  "27 NOV 23:00 UTC - SPAIN CAMPAIGN ENDS",
];
const PIN_LEGEND = [
  "1 KUWAIT CITY  2 NEW YORK  3 GAZA CITY  4 ODESA  5 LONDON  6 BANGKOK  7 BISSAU",
  "8 WELLINGTON  9 MADRID  10 WASHINGTON DC  11 CAIRO  12 NAYPYIDAW  13 LUSAKA",
];

// Badge colours by verification level.
function badgeColor(b: string): RGB {
  if (b === "CONFIRMED") return GREEN;
  if (b === "OFFICIAL") return BLUE;
  return AMBER;
}
function drawBadge(x: number, y: number, b: string): number {
  const w = textWidth(b, 1) + 10;
  fillRect(x, y, w, 13, badgeColor(b));
  drawText(x + 5, y + 3, b, 1, [255, 255, 255]);
  return w;
}

// ---------------------------------------------------------------- scenes
// Procedural illustrations for the three leads. Simple flat shapes, no text.
function sceneKuwait(x: number, y: number, w: number, h: number): void {
  // Dusk sky bands, desert ground, radar tower, drones, explosion burst.
  for (let i = 0; i < h; i++) {
    const t = i / h;
    fillRect(x, y + i, w, 1, blend([232, 176, 110], [120, 70, 60], t));
  }
  fillCircle(x + w - 52, y + 22, 13, [245, 214, 130]);
  fillRect(x, y + Math.floor(h * 0.68), w, h - Math.floor(h * 0.68), [196, 164, 110]);
  fillRect(x + 18, y + h - 26, 70, 26, [90, 70, 52]);
  fillRect(x + 26, y + h - 40, 54, 14, [110, 88, 64]);
  // Radar tower with dish.
  fillRect(x + 150, y + 18, 8, h - 18 - 26, [52, 48, 44]);
  fillRect(x + 138, y + 14, 32, 6, [52, 48, 44]);
  fillPoly([[x + 154, y + 16], [x + 178, y + 4], [x + 182, y + 16]], [200, 200, 200]);
  // Two drones: dark quadcopter silhouettes with rotor bars.
  for (const [dx, dy] of [[210, 22], [248, 40]] as Array<[number, number]>) {
    fillRect(x + dx, y + dy, 16, 5, INK);
    fillRect(x + dx - 5, y + dy - 2, 26, 2, INK);
    fillRect(x + dx + 6, y + dy + 5, 2, 6, INK);
  }
  // Explosion burst over the station.
  const bx = x + 96, by = y + 52;
  fillPoly([[bx, by - 22], [bx + 6, by - 6], [bx + 22, by - 8], [bx + 9, by + 3],
    [bx + 16, by + 18], [bx + 2, by + 10], [bx - 8, by + 22], [bx - 8, by + 6],
    [bx - 24, by + 4], [bx - 9, by - 5], [bx - 16, by - 18], [bx - 3, by - 8]],
    [232, 120, 30]);
  fillCircle(bx, by, 8, [250, 200, 60]);
  fillCircle(bx - 26, by - 30, 7, [120, 116, 110]);
  fillCircle(bx - 14, by - 38, 9, [140, 136, 130]);
  fillCircle(bx + 4, by - 40, 6, [120, 116, 110]);
}
function sceneStorm(x: number, y: number, w: number, h: number): void {
  // Storm sky, skyline, rain, lightning, parade balloon.
  for (let i = 0; i < h; i++) {
    const t = i / h;
    fillRect(x, y + i, w, 1, blend([44, 58, 82], [96, 110, 130], t));
  }
  fillCircle(x + 40, y + 16, 22, [70, 82, 100]);
  fillCircle(x + 70, y + 10, 26, [70, 82, 100]);
  fillCircle(x + 250, y + 14, 24, [70, 82, 100]);
  fillCircle(x + 285, y + 20, 18, [70, 82, 100]);
  // Skyline.
  const blds: Array<[number, number, number]> = [[8, 34, 52], [52, 46, 44], [106, 30, 58], [172, 40, 48], [228, 52, 40], [276, 36, 56]];
  for (const [bx, bw, bh] of blds) {
    fillRect(x + bx, y + h - bh - 12, bw, bh, [28, 34, 46]);
    for (let wy = y + h - bh - 6; wy < y + h - 16; wy += 9) {
      for (let wx = x + bx + 5; wx < x + bx + bw - 5; wx += 10) {
        if (((wx + wy) / 5) % 3 === 0) fillRect(wx, wy, 4, 5, [250, 210, 90]);
      }
    }
  }
  fillRect(x, y + h - 12, w, 12, [24, 28, 34]);
  // Lightning bolt.
  fillPoly([[x + 150, y + 8], [x + 140, y + 34], [x + 150, y + 34], [x + 138, y + 62],
    [x + 156, y + 30], [x + 146, y + 30], [x + 160, y + 8]], [250, 220, 80]);
  // Rain streaks.
  for (let i = 0; i < 46; i++) {
    const rx = x + ((i * 67) % (w - 8));
    const ry = y + ((i * 41) % (h - 14));
    line(rx, ry, rx - 3, ry + 10, [190, 205, 220]);
  }
  // Parade balloon, tethered low.
  fillCircle(x + 292, y + 46, 16, [198, 60, 60]);
  fillRect(x + 288, y + 58, 8, 4, [198, 60, 60]);
  line(x + 292, y + 62, x + 284, y + h - 12, [220, 220, 220]);
}
function sceneGaza(x: number, y: number, w: number, h: number): void {
  // School building, smoke columns, rubble at the base.
  for (let i = 0; i < h; i++) {
    const t = i / h;
    fillRect(x, y + i, w, 1, blend([214, 196, 160], [168, 140, 104], t));
  }
  fillRect(x + 30, y + 26, 150, h - 26 - 18, [122, 102, 78]);
  fillRect(x + 30, y + 26, 150, 8, [96, 80, 60]);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const wx = x + 42 + c * 28, wy = y + 42 + r * 16;
      fillRect(wx, wy, 16, 10, r === 1 && c === 2 ? [30, 30, 30] : [70, 64, 52]);
    }
  }
  // Breach: dark hole where the strike hit.
  fillPoly([[x + 96, y + 40], [x + 128, y + 40], [x + 120, y + 66], [x + 100, y + 66]], [24, 22, 20]);
  // Smoke columns.
  fillCircle(x + 112, y + 22, 10, [110, 106, 100]);
  fillCircle(x + 120, y + 10, 13, [130, 126, 120]);
  fillCircle(x + 104, y + 6, 8, [150, 146, 140]);
  fillCircle(x + 230, y + 30, 9, [120, 116, 110]);
  fillCircle(x + 238, y + 16, 12, [140, 136, 130]);
  // Rubble at the base.
  fillPoly([[x + 20, y + h - 18], [x + 90, y + h - 18], [x + 55, y + h - 44]], [90, 78, 62]);
  fillPoly([[x + 130, y + h - 18], [x + 210, y + h - 18], [x + 170, y + h - 40]], [104, 90, 72]);
  fillRect(x + 240, y + h - 30, 60, 12, [80, 70, 56]);
}
function sceneFor(n: number, x: number, y: number, w: number, h: number): void {
  if (n === 1) sceneKuwait(x, y, w, h);
  else if (n === 2) sceneStorm(x, y, w, h);
  else sceneGaza(x, y, w, h);
}

// Small flat icons for the secondary cards (drawn in a 40x40 box).
function drawIcon(kind: number, x: number, y: number): void {
  if (kind === 4) { // grain ship
    fillPoly([[x + 4, y + 22], [x + 36, y + 22], [x + 30, y + 34], [x + 10, y + 34]], [40, 60, 90]);
    fillRect(x + 8, y + 12, 10, 10, [200, 160, 60]);
    fillRect(x + 20, y + 12, 10, 10, [160, 90, 50]);
    fillRect(x + 28, y + 6, 3, 16, [40, 60, 90]);
    fillRect(x + 2, y + 36, 36, 2, [120, 170, 200]);
  } else if (kind === 5) { // falling chart bars
    fillRect(x + 6, y + 26, 6, 10, [31, 122, 66]);
    fillRect(x + 15, y + 20, 6, 16, [31, 122, 66]);
    fillRect(x + 24, y + 12, 6, 24, [31, 122, 66]);
    line(x + 4, y + 8, x + 36, y + 30, [168, 44, 34]);
    fillPoly([[x + 36, y + 30], [x + 28, y + 30], [x + 36, y + 22]], [168, 44, 34]);
  } else if (kind === 6) { // flame
    fillPoly([[x + 20, y + 4], [x + 30, y + 18], [x + 34, y + 26], [x + 28, y + 34], [x + 12, y + 34], [x + 6, y + 26], [x + 10, y + 18]], [232, 120, 30]);
    fillPoly([[x + 20, y + 18], [x + 26, y + 26], [x + 22, y + 32], [x + 15, y + 30], [x + 14, y + 24]], [250, 200, 60]);
  } else { // ballot box
    fillRect(x + 8, y + 16, 24, 18, [60, 70, 90]);
    fillRect(x + 6, y + 12, 28, 4, [40, 50, 70]);
    fillRect(x + 16, y + 2, 8, 12, [255, 255, 255]);
    fillRect(x + 18, y + 5, 4, 2, [40, 50, 70]);
    fillRect(x + 12, y + 24, 4, 4, [250, 210, 90]);
    fillRect(x + 24, y + 24, 4, 4, [250, 210, 90]);
  }
}

// ---------------------------------------------------------------- map
// Rough continent outlines in lon/lat, drawn equirectangular.
const CONTINENTS: Array<Array<[number, number]>> = [
  [[-168, 66], [-140, 70], [-120, 71], [-95, 69], [-85, 66], [-80, 73], [-65, 60], [-55, 52], [-60, 46], [-70, 42], [-75, 35], [-80, 32], [-85, 29], [-90, 21], [-97, 16], [-105, 20], [-115, 28], [-125, 40], [-125, 49], [-140, 60], [-165, 60]],
  [[-80, 10], [-75, 5], [-60, 0], [-50, 0], [-35, -8], [-40, -20], [-48, -28], [-58, -35], [-65, -45], [-70, -55], [-73, -40], [-70, -20], [-80, -5]],
  [[-10, 36], [-9, 43], [-2, 48], [0, 51], [5, 53], [8, 57], [10, 59], [18, 56], [21, 55], [24, 59], [30, 60], [30, 70], [25, 71], [18, 69], [12, 65], [5, 60], [-5, 58], [-10, 54], [-10, 43]],
  [[-17, 15], [-10, 30], [0, 35], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 11], [48, 0], [40, -10], [35, -18], [32, -29], [25, -34], [18, -35], [12, -18], [9, -1], [9, 4], [-8, 4], [-13, 8]],
  [[30, 36], [36, 36], [43, 39], [48, 38], [54, 37], [57, 26], [61, 25], [66, 25], [72, 20], [77, 8], [80, 13], [88, 22], [92, 21], [97, 16], [100, 8], [103, 1], [104, 9], [108, 11], [109, 15], [106, 20], [100, 21], [95, 16], [92, 21], [89, 22], [85, 20], [80, 15], [75, 12], [70, 20], [65, 25], [58, 26], [52, 28], [50, 30], [48, 30], [44, 29], [40, 31], [36, 36]],
  [[113, -22], [114, -30], [115, -35], [124, -33], [129, -32], [137, -35], [140, -38], [147, -39], [150, -37], [153, -27], [146, -19], [142, -11], [135, -12], [130, -13], [126, -14], [122, -17], [114, -21]],
  [[-20, 64], [-14, 66], [-20, 70], [-30, 68], [-40, 64], [-45, 60], [-30, 60], [-22, 60]],
];
const ALL_STORIES: Story[] = [...LEADS, ...SECONDARY, ...ALSO, ...TICKER];
// Badge offsets (px) so close pins (Gaza/Cairo, New York/Washington,
// London/Madrid) do not collide; a leader line joins badge to true point.
const PIN_OFF: Record<number, [number, number]> = {
  1: [14, -18], 2: [-18, -14], 3: [-24, 14], 4: [-14, -14], 5: [-13, -11],
  6: [14, 10], 7: [-13, 9], 8: [-8, -13], 9: [13, 11], 10: [18, 10],
  11: [20, 14], 12: [-14, -12], 13: [2, 14],
};

// ---------------------------------------------------------------- render
function render(): void {
  fillRect(0, 0, W, H, PAPER);
  rect(0, 0, W, H, INK);
  rect(3, 3, W - 6, H - 6, RULE);

  // ---- masthead
  fillRect(8, 8, W - 16, 92, NAVY);
  drawTextCentered(W / 2, 18, "THE WORLD IN ONE DAY", 4, [255, 255, 255]);
  drawTextCentered(W / 2, 54, "FRIDAY 27 NOVEMBER 2026", 2, GOLD);
  drawTextCentered(W / 2, 80, "13 STORIES FROM THE 27 NOVEMBER NEWS CYCLE  \u2022  SIX REGIONS  \u2022  SIX FIELDS", 1, [210, 214, 222]);
  fillRect(8, 100, W - 16, 2, GOLD);

  // ---- region strip
  const ry = 106;
  drawText(10, ry + 6, "REGIONS", 1, NAVY);
  const cellW = 148, gap = 4;
  REGIONS.forEach(([name, count], i) => {
    const x = 78 + i * (cellW + gap);
    fillRect(x, ry, cellW, 22, CARD);
    rect(x, ry, cellW, 22, RULE);
    drawText(x + 6, ry + 7, name, 1, INK);
    const cw = textWidth(String(count), 2);
    drawText(x + cellW - cw - 6, ry + 4, String(count), 2, RED);
  });

  // ---- number strip
  const ny = 134, ncell = 163, ngap = 6;
  NUMBERS.forEach(([num, cap], i) => {
    const x = 8 + i * (ncell + ngap);
    fillRect(x, ny, ncell, 50, CARD);
    rect(x, ny, ncell, 50, NAVY);
    const sc = textWidth(num, 3) > ncell - 10 ? 2 : 3;
    drawTextCentered(x + ncell / 2, ny + 6, num, sc, RED);
    const lines = wrapText(cap, ncell - 10, 1);
    lines.slice(0, 2).forEach((ln, j) =>
      drawTextCentered(x + ncell / 2, ny + 28 + j * 9, ln, 1, INK));
  });

  // ---- leads
  const ly = 192, lw = 328, lxs = [8, 348, 688];
  LEADS.forEach((s, i) => {
    const x = lxs[i];
    fillRect(x, ly, lw, 222, CARD);
    rect(x, ly, lw, 222, RULE);
    sceneFor(s.n, x + 4, ly + 4, lw - 8, 88);
    rect(x + 4, ly + 4, lw - 8, 88, INK);
    drawText(x + 8, ly + 100, s.kind + "  \u2022  " + s.region + "  \u2022  " + s.field, 1, RED);
    drawWrapped(x + 8, ly + 114, s.headline, lw - 16, 2, INK, 17, 2);
    drawWrapped(x + 8, ly + 150, s.body, lw - 16, 1, INK, 9, 5);
    const bw = drawBadge(x + 8, ly + 200, s.badge);
    drawText(x + 8 + bw + 6, ly + 202, s.source, 1, MUTED);
    drawText(x + lw - textWidth(s.date, 1) - 8, ly + 202, s.date, 1, NAVY);
  });

  // ---- secondary
  const sy = 422, sw = 240, sxs = [8, 258, 508, 758];
  SECONDARY.forEach((s, i) => {
    const x = sxs[i];
    fillRect(x, sy, sw, 148, CARD);
    rect(x, sy, sw, 148, RULE);
    fillRect(x, sy, sw, 40, NAVY2);
    drawIcon(s.n, x + 6, sy);
    drawText(x + 52, sy + 8, s.region, 1, GOLD);
    drawText(x + 52, sy + 20, s.field, 1, [210, 214, 222]);
    drawWrapped(x + 8, sy + 48, s.headline, sw - 16, 2, INK, 17, 2);
    drawWrapped(x + 8, sy + 84, s.body, sw - 16, 1, INK, 9, 4);
    const bw = drawBadge(x + 8, sy + 128, s.badge);
    drawText(x + 8 + bw + 6, sy + 130, s.source, 1, MUTED);
    drawText(x + sw - textWidth(s.date, 1) - 8, sy + 130, s.date, 1, NAVY);
  });

  // ---- also today
  const ay = 578;
  fillRect(8, ay, W - 16, 14, NAVY);
  drawText(14, ay + 3, "ALSO TODAY", 1, [255, 255, 255]);
  const ays = ay + 18, ah = 92;
  ALSO.forEach((s, i) => {
    const x = lxs[i];
    fillRect(x, ays, lw, ah, CARD);
    rect(x, ays, lw, ah, RULE);
    drawText(x + 8, ays + 6, s.kind + "  \u2022  " + s.region + "  \u2022  " + s.field, 1, RED);
    drawWrapped(x + 8, ays + 18, s.headline, lw - 16, 2, INK, 16, 2);
    drawWrapped(x + 8, ays + 50, s.body, lw - 16, 1, INK, 9, 2);
    const bw = drawBadge(x + 8, ays + 74, s.badge);
    drawText(x + 8 + bw + 6, ays + 76, s.source, 1, MUTED);
    drawText(x + lw - textWidth(s.date, 1) - 8, ays + 76, s.date, 1, NAVY);
  });

  // ---- ticker
  const ty = 692;
  fillRect(8, ty, W - 16, 14, RED);
  drawText(14, ty + 3, "THE TICKER", 1, [255, 255, 255]);
  const tys = ty + 18, th = 46;
  TICKER.forEach((s, i) => {
    const x = lxs[i];
    fillRect(x, tys, lw, th, CARD);
    rect(x, tys, lw, th, RULE);
    drawText(x + 8, tys + 5, String(s.n) + "  \u2022  " + s.headline, 1, INK);
    drawWrapped(x + 8, tys + 16, s.body, lw - 16, 1, MUTED, 9, 2);
    drawText(x + 8, tys + 36, s.badge + "  \u2022  " + s.source + "  \u2022  " + s.date, 1, NAVY);
  });

  // ---- map + fields + timeline
  const my = 764;
  // Map panel.
  fillRect(8, my, 620, 178, CARD);
  rect(8, my, 620, 178, RULE);
  drawText(16, my + 6, "THE WORLD MAP - 13 PINS, NUMBERED AS THE STORIES", 1, NAVY);
  const mapX = 16, mapY = my + 20, mapW = 604, mapH = 128;
  fillRect(mapX, mapY, mapW, mapH, SKY);
  rect(mapX, mapY, mapW, mapH, NAVY);
  const proj = (lon: number, lat: number): [number, number] => [
    Math.round(mapX + ((lon + 180) / 360) * mapW),
    Math.round(mapY + ((90 - lat) / 180) * mapH),
  ];
  for (const cont of CONTINENTS) {
    fillPoly(cont.map(([lo, la]) => proj(lo, la)), LAND);
    for (let i = 0; i < cont.length; i++) {
      const [x0, y0] = proj(cont[i][0], cont[i][1]);
      const [x1, y1] = proj(cont[(i + 1) % cont.length][0], cont[(i + 1) % cont.length][1]);
      line(x0, y0, x1, y1, LANDLINE);
    }
  }
  // Graticule.
  for (let lo = -150; lo <= 150; lo += 30) {
    const [gx] = proj(lo, 0);
    for (let y = mapY; y < mapY + mapH; y += 4) px(gx, y, [160, 180, 195]);
  }
  for (let la = -60; la <= 60; la += 30) {
    const [, gy] = proj(0, la);
    for (let x = mapX; x < mapX + mapW; x += 4) px(x, gy, [160, 180, 195]);
  }
  // Pins: dot at the true spot, numbered badge offset with a leader line.
  for (const s of ALL_STORIES) {
    const [px0, py0] = proj(s.lon, s.lat);
    const [dx, dy] = PIN_OFF[s.n];
    const bx = px0 + dx, by = py0 + dy;
    line(px0, py0, bx, by, INK);
    fillCircle(px0, py0, 2, INK);
    fillCircle(bx, by, 10, RED);
    circle(bx, by, 10, [255, 255, 255]);
    const num = String(s.n);
    drawText(bx - Math.floor(textWidth(num, 1) / 2), by - 3, num, 1, [255, 255, 255]);
  }
  drawText(16, my + 154, PIN_LEGEND[0], 1, INK);
  drawText(16, my + 164, PIN_LEGEND[1], 1, INK);

  // Right panel: fields + timeline.
  const rx = 636, rw = 380;
  fillRect(rx, my, rw, 178, CARD);
  rect(rx, my, rw, 178, RULE);
  drawText(rx + 8, my + 6, "BY FIELD - 13 STORIES", 1, NAVY);
  // Two columns of three bars so the timeline below fits inside the panel.
  const fieldCol = (items: Array<[string, number]>, colX: number, barX: number): void => {
    items.forEach(([name, count], i) => {
      const y = my + 20 + i * 11;
      drawText(colX, y, name, 1, INK);
      fillRect(barX, y + 1, 22 * count, 6, NAVY2);
      drawText(barX + 22 * count + 5, y, String(count), 1, RED);
    });
  };
  fieldCol(FIELDS.slice(0, 3), rx + 8, rx + 74);
  fieldCol(FIELDS.slice(3), rx + 196, rx + 262);
  const tly = my + 20 + 3 * 11 + 6;
  drawText(rx + 8, tly, "THE DAY IN UTC", 1, NAVY);
  TIMELINE.forEach((t, i) => {
    drawText(rx + 8, tly + 12 + i * 8, t, 1, INK);
  });

  // ---- footer
  const fy = 950;
  fillRect(8, fy, W - 16, 66, NAVY);
  drawText(16, fy + 6, "DATE CHECK", 1, GOLD);
  drawText(16, fy + 17, "ONLY STORIES 3, 8 AND 9 ARE FULLY 27 NOV; STORY 2 SPANS 26-27 NOV; THE REST ARE 25-26 NOV -", 1, [235, 238, 242]);
  drawText(16, fy + 27, "THE 27 NOVEMBER MORNING NEWS CYCLE. NO DATE WAS MOVED. FIGURES ARE AS REPORTED; UK MIGRATION IS", 1, [235, 238, 242]);
  drawText(16, fy + 37, "PROVISIONAL; NZ'S FINAL RESULT HAD NOT BEEN RELEASED AT PRESS TIME. POLLS ARE POLLS, NOT RESULTS.", 1, [235, 238, 242]);
  drawText(16, fy + 51, "SOURCES: REUTERS  \u2022  AP  \u2022  BBC  \u2022  CNN  \u2022  USA TODAY  \u2022  ONS  \u2022  FCC  \u2022  NZ ELECTORAL COMMISSION  \u2022  GLOBAL FUND  \u2022  OMAN NEWS AGENCY", 1, [190, 194, 202]);
}

// ---------------------------------------------------------------- main
function main(): void {
  render();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? path.join(process.cwd(), "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  const hash = crypto.createHash("sha256").update(png).digest("hex");
  process.stdout.write(`wrote ${outPath} ${png.length} bytes sha256=${hash}\n`);
}
main();
