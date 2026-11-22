// Directional centerlines for uppercase print and the ten digits.
export const TRACE_WIDTH = 340;
export const TRACE_HEIGHT = 350;

export const tracingGlyphs = {
  A: ["M35 319 L170 34", "M170 34 L305 319", "M83 218 H257"],
  B: ["M76 34 V319", "M76 34 H177 C285 34 282 168 177 168 H76", "M177 168 C299 168 298 319 177 319 H76"],
  C: ["M275 74 C240 38 213 34 170 34 C34 34 32 319 170 319 C215 319 246 301 275 270"],
  D: ["M74 34 V319", "M74 34 H153 C334 34 334 319 153 319 H74"],
  E: ["M78 34 V319", "M78 34 H265", "M78 171 H228", "M78 319 H265"],
  F: ["M78 34 V319", "M78 34 H265", "M78 171 H232"],
  G: ["M271 78 C245 43 215 34 171 34 C35 34 33 319 171 319 C222 319 251 300 275 271 V188 H178"],
  H: ["M67 34 V319", "M273 34 V319", "M67 172 H273"],
  I: ["M112 34 H228", "M170 34 V319", "M112 319 H228"],
  J: ["M113 34 H257", "M257 34 V239 Q257 319 172 319 Q108 319 83 269"],
  K: ["M72 34 V319", "M271 34 L72 202", "M132 151 L278 319"],
  L: ["M85 34 V319 H265"],
  M: ["M49 319 V34 L170 212 L291 34 V319"],
  N: ["M63 319 V34 L277 319 V34"],
  O: ["M171 34 C103 34 61 91 61 176 C61 261 103 319 171 319 C238 319 279 261 279 176 C279 90 238 34 171 34 Z"],
  P: ["M78 34 V319", "M78 34 H174 C299 34 299 181 174 181 H78"],
  Q: ["M171 34 C103 34 61 91 61 176 C61 261 103 319 171 319 C238 319 279 261 279 176 C279 90 238 34 171 34 Z", "M213 248 L283 319"],
  R: ["M78 34 V319", "M78 34 H170 C294 34 294 179 170 179 H78", "M169 179 L278 319"],
  S: ["M260 72 C240 46 206 34 170 34 C64 34 54 135 151 166 C201 182 268 195 268 252 C268 327 135 344 77 274"],
  T: ["M52 34 H288", "M170 34 V319"],
  U: ["M62 34 V211 C62 355 278 355 278 211 V34"],
  V: ["M40 34 L170 319 L300 34"],
  W: ["M31 34 L96 319 L170 133 L244 319 L309 34"],
  X: ["M57 34 L283 319", "M283 34 L57 319"],
  Y: ["M58 34 L170 177", "M282 34 L170 177 V319"],
  Z: ["M62 34 H278 L62 319 H278"],
  "0": ["M170 34 C104 34 63 93 63 176 C63 259 104 319 170 319 C236 319 277 259 277 176 C277 93 236 34 170 34 Z"],
  "1": ["M106 91 L174 34 V319", "M102 319 H241"],
  "2": ["M80 97 C96 55 135 34 177 34 C258 34 280 100 245 151 C207 207 118 253 78 319 H269"],
  "3": ["M86 67 C137 15 264 20 255 101 C252 148 211 173 157 173 C220 173 272 190 272 246 C272 325 139 346 80 281"],
  "4": ["M183 34 L61 224 H286", "M232 36 V319"],
  "5": ["M259 34 H102 L87 165 C108 150 139 143 170 143 C306 143 300 319 167 319 C126 319 92 306 73 282"],
  "6": ["M255 65 C230 44 205 34 171 34 C93 34 57 119 57 202 C57 272 97 319 168 319 C294 319 298 155 173 155 C119 155 84 186 57 214"],
  "7": ["M60 34 H283 L140 319"],
  "8": ["M170 174 C43 132 65 34 170 34 C274 34 297 132 170 174 C20 221 48 319 170 319 C292 319 320 221 170 174 Z"],
  "9": ["M282 140 C282 78 246 34 174 34 C45 34 45 197 173 197 C225 197 261 171 282 140 C283 230 247 319 168 319 C135 319 104 309 83 287"],
} satisfies Record<string, readonly string[]>;

export type TracingGlyph = keyof typeof tracingGlyphs;
export const tracingLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as TracingGlyph[];
export const tracingDigits = "0123456789".split("") as TracingGlyph[];

export function nextTracingGlyph(glyph: TracingGlyph): TracingGlyph {
  const group = tracingDigits.includes(glyph) ? tracingDigits : tracingLetters;
  return group[(group.indexOf(glyph) + 1) % group.length];
}

// Italian names of letters and digits that start with a vowel sound take the elided article:
// l’A, l’effe, l’acca, l’elle, l’emme, l’enne, l’erre, l’esse, l’ics, l’uno, l’otto.
const elided = new Set(["A", "E", "F", "H", "I", "L", "M", "N", "O", "R", "S", "U", "X", "1", "8"]);

/** Heading of the tracing game, e.g. “Ripassa la B”, “Ripassa il 3”, “Ripassa l’8”. */
export function tracingTitle(glyph: string) {
  const article = elided.has(glyph) ? "l’" : /^[0-9]$/.test(glyph) ? "il " : "la ";
  return `Ripassa ${article}${glyph}`;
}
