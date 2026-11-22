// Ricalco del disegno allegato dall’utente, diviso in zone per il gioco Colorare.
const ink = "#17141b";
type Shape = { path: string; fill?: string };

function ellipse(x: number, y: number, rx: number, ry: number, fill?: string): Shape {
  return { path: `M${x - rx} ${y} a${rx} ${ry} 0 1 1 ${2 * rx} 0 a${rx} ${ry} 0 1 1 ${-2 * rx} 0 Z`, fill };
}

function leg(x: number): Shape {
  return {
    path: `M${x} 370 h11 l2 55 q0 11 -10 11 h-14 q-10 0 -9 -7 q1 -6 9 -6 h10 Z`,
    fill: ink,
  };
}

const shapes: Shape[] = [
  ...[309, 343, 397, 436, 485, 523].map(leg),
  // Guscio e testa condividono la stessa curva.
  { path: "M258 164 C302 137 349 131 390 134 C453 136 506 158 543 200 C582 243 606 312 601 373 Q601 376 595 376 C497 378 395 379 299 377 C318 275 299 217 258 164 Z" },
  { path: "M258 164 C299 217 318 275 299 377 C244 377 191 377 154 370 Q148 370 148 363 C144 337 143 313 149 292 C162 242 200 199 258 164 Z" },
  // Le macchie nere sono zone distinte e si possono ricolorare.
  ellipse(368, 197, 34, 31, ink),
  { path: "M505 174 Q491 185 493 203 C496 222 523 241 550 224 C538 206 523 188 505 174 Z", fill: ink },
  ellipse(453, 270, 35, 31, ink),
  ellipse(359, 317, 33, 31, ink),
  ellipse(544, 320, 31, 28, ink),
  ellipse(191, 233, 19, 18, ink),
  ellipse(265, 233, 18, 18, ink),
  ellipse(191, 233, 15, 14),
  ellipse(265, 233, 14, 14),
  ellipse(189, 234, 4, 4, ink),
  ellipse(263, 234, 4, 4, ink),
  // Guance e sorriso.
  { path: "M155 271 C172 274 184 284 180 298 C177 310 164 316 146 316 Q146 294 155 271 Z" },
  ellipse(277, 291, 25, 24),
  { path: "M183 342 Q186 337 190 343 C204 365 231 366 243 344 Q247 337 251 341 Q253 343 250 349 C238 372 197 372 182 347 Q180 344 183 342 Z", fill: ink },
  // Antenne davanti alla testa.
  { path: "M136 75 Q141 71 146 78 C169 111 182 139 197 165 Q214 185 216 199 Q214 205 209 200 C193 178 185 173 176 155 C165 135 149 100 136 84 Q133 79 136 75 Z" },
  { path: "M324 60 Q327 55 332 60 Q334 64 331 70 C313 109 282 155 268 198 Q265 203 261 200 Q259 198 261 193 C276 151 305 100 324 60 Z" },
  ellipse(132, 75, 14, 11, ink),
  ellipse(334, 57, 12, 12, ink),
];

export const smilingLadybug = {
  id: "coccinella-sorridente",
  title: "Coccinella sorridente",
  // Source and licence are mandatory metadata (AGENTS.md); the licence awaits confirmation (ADR 0025).
  source: "Ricalco di un disegno fornito dal titolare del progetto",
  license: "Da confermare dal titolare del progetto",
  background: "#fff0e3",
  areas: shapes.map(shape => shape.path),
  areaFills: shapes.map(shape => shape.fill),
  details: [
    "M156 278 C168 280 176 289 172 299 Q164 312 150 309 M152 298 Q166 302 168 294 Q170 288 155 287 M151 304 Q160 307 165 301",
    "M294 293 C293 275 270 270 261 280 C248 295 266 313 283 308 C297 303 295 284 283 281 C273 277 261 283 265 293 C269 301 283 304 287 296 C293 284 273 283 272 291 Q271 297 282 296",
  ],
} as const;
