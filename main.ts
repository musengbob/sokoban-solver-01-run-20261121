// Sokoban solver for make.fun sokoban-solver-01-run-20261121.
// Push-optimal per room: rooms are independent (a box pushed through a door
// into the hallway can never return), so a level's optimum is the sum of its
// rooms' optima. Each room is solved with A* over pushes:
//   - state: the boxes' squares + the player's reachable region (named by its
//     lowest square), so the player never needs an exact square;
//   - heuristic: the minimum assignment of boxes to goals under single-box
//     push distances (BFS over box positions, other boxes ignored), which is
//     admissible, so the first solved state popped is push-optimal;
//   - pruning: dead squares (no push, boxes ignored, ever reaches a goal),
//     frozen 2x2 blocks, corner deadlocks and wall-line deadlocks — none of
//     which prunes a solvable state.
// Work is budgeted by states expanded, never by the clock, so two runs write
// the same bytes. Fallbacks: whole-level push A*, then a plain move A*.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Work budgets (states), never the clock: deterministic across runs.
const MAX_ROOM_STATES = 400_000;
const MAX_LEVEL_STATES = 600_000;
const MAX_MOVE_STATES = 200_000;

const DIRS = [
  { dx: 0, dy: -1, ch: 'u', push: 'U' },
  { dx: 0, dy: 1, ch: 'd', push: 'D' },
  { dx: -1, dy: 0, ch: 'l', push: 'L' },
  { dx: 1, dy: 0, ch: 'r', push: 'R' },
] as const;

interface Level {
  w: number;
  h: number;
  wall: Uint8Array; // 1 = wall (short rows / outside padded as walls)
  goals: number[];
  goalSet: Uint8Array;
  boxes: number[]; // sorted
  player: number;
}

function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
  const goalSet = new Uint8Array(w * h);
  for (const g of goals) goalSet[g] = 1;
  return { w, h, wall, goals, goalSet, boxes: boxes.sort((a, b) => a - b), player };
}

/** Squares from which a box alone can be pushed onto some goal (pulled back from the goals over open floor). */
function liveSquares(lv: Level): Uint8Array {
  const { w, wall, goals } = lv;
  const live = new Uint8Array(wall.length);
  const queue = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi]!;
    for (const d of DIRS) {
      const dd = d.dy * w + d.dx;
      const y = x - dd;
      if (!wall[y] && !wall[y - dd] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/**
 * Single-box push distances to each goal: dist[gi][s] = fewest pushes to move
 * one box from s onto goals[gi], other boxes ignored. Reverse BFS from the
 * goal: a box at q came from p = q - d when p and p - d are open floor.
 */
function pushDistances(lv: Level): Int32Array[] {
  const { w, wall, goals } = lv;
  const n = wall.length;
  const out: Int32Array[] = [];
  for (const g of goals) {
    const dist = new Int32Array(n).fill(-1);
    dist[g] = 0;
    const queue = [g];
    for (let qi = 0; qi < queue.length; qi++) {
      const q = queue[qi]!;
      const dq = dist[q]!;
      for (const d of DIRS) {
        const dd = d.dy * w + d.dx;
        const p = q - dd;
        if (wall[p] || wall[p - dd] || dist[p] !== -1) continue;
        dist[p] = dq + 1;
        queue.push(p);
      }
    }
    out.push(dist);
  }
  return out;
}

/** Minimum assignment of boxes to distinct goals under the push distances (-1 when some box reaches no goal). */
function assignmentHeuristic(boxes: number[], dists: Int32Array[], goals: number[]): number {
  const nb = boxes.length;
  const ng = goals.length;
  if (nb === 0) return 0;
  // Boxes with the fewest reachable goals first (fixed order, deterministic).
  const ordered = boxes
    .map((b, i) => ({ b, n: dists.reduce((a, dd) => a + (dd[b]! >= 0 ? 1 : 0), 0), i }))
    .sort((x, y) => x.n - y.n || x.i - y.i)
    .map((o) => o.b);
  let best = Infinity;
  const rec = (bi: number, used: number, sum: number): void => {
    if (sum >= best) return;
    if (bi === nb) {
      best = sum;
      return;
    }
    for (let gi = 0; gi < ng; gi++) {
      if (used & (1 << gi)) continue;
      const d = dists[gi]![ordered[bi]!]!;
      if (d < 0) continue;
      rec(bi + 1, used | (1 << gi), sum + d);
    }
  };
  rec(0, 0, 0);
  return best === Infinity ? -1 : best;
}

/** Whether the box just pushed to `t` is dead: corner, wall-line, or frozen 2x2 block. */
function isDead(lv: Level, occupied: Uint8Array, t: number): boolean {
  const { w, wall, goalSet } = lv;
  if (goalSet[t]) return false;
  const up = wall[t - w] ? 1 : 0;
  const down = wall[t + w] ? 1 : 0;
  const left = wall[t - 1] ? 1 : 0;
  const right = wall[t + 1] ? 1 : 0;
  if ((up || down) && (left || right)) return true; // corner: walls on two perpendicular sides
  // Wall-line: box against a wall, on a run of squares with that wall
  // continuing, bounded on BOTH ends by a wall in the row/column (so the box
  // cannot slide out and away), and no goal anywhere on the run. A run open
  // at either end is escapable, not dead.
  if (up || down) {
    const wd = up ? -w : w;
    let L = t;
    let Rr = t;
    while (!wall[L - 1] && wall[L - 1 + wd]) L -= 1;
    while (!wall[Rr + 1] && wall[Rr + 1 + wd]) Rr += 1;
    if (wall[L - 1] && wall[Rr + 1]) {
      let hasGoal = false;
      for (let q = L; q <= Rr; q++) if (goalSet[q]) hasGoal = true;
      if (!hasGoal) return true;
    }
  }
  if (left || right) {
    const wd = left ? -1 : 1;
    let U = t;
    let Dd = t;
    while (!wall[U - w] && wall[U - w + wd]) U -= w;
    while (!wall[Dd + w] && wall[Dd + w + wd]) Dd += w;
    if (wall[U - w] && wall[Dd + w]) {
      let hasGoal = false;
      for (let q = U; q <= Dd; q += w) if (goalSet[q]) hasGoal = true;
      if (!hasGoal) return true;
    }
  }
  // Frozen 2x2 block of walls and boxes with a box off its goal.
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b]) || !(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goalSet[a]) || (occupied[b] && !goalSet[b]) || (occupied[c] && !goalSet[c]) || (occupied[d] && !goalSet[d])) return true;
  }
  return false;
}

/** Flood-fill the player's reachable region from `from` (boxes block); returns its lowest square. */
function reachLow(lv: Level, occupied: Uint8Array, from: number, seen: Int32Array, stamp: number, stack: Int32Array): number {
  const { w, wall } = lv;
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n]!;
    if (p < low) low = p;
    for (const d of DIRS) {
      const q = p + d.dy * w + d.dx;
      if (!wall[q] && !occupied[q] && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

interface PushSolution {
  pushes: number;
  moves: string;
}

// State key: region-low then boxes, base-`size` digits (exact while size ** (boxes + 1) < 2 ** 53).
function keyOf(boxes: number[], low: number, size: number): number {
  let k = low;
  for (const b of boxes) k = k * size + b;
  return k;
}

/**
 * Push-optimal A* over one (sub-)level: {pushes, moves} or null when the
 * state budget is spent (or the level has no solution).
 */
function solvePushAStar(lv: Level, maxStates: number): PushSolution | null {
  const { w, wall, goals, goalSet } = lv;
  const size = wall.length;
  const live = liveSquares(lv);
  const dists = pushDistances(lv);
  if (lv.boxes.some((b) => !live[b])) return null;
  const solved = (bs: number[]): boolean => bs.every((b) => goalSet[b]);
  if (solved(lv.boxes)) return { pushes: 0, moves: '' };
  const h0 = assignmentHeuristic(lv.boxes, dists, goals);
  if (h0 < 0) return null;

  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;

  const boxesArr: number[][] = [lv.boxes.slice()];
  const playerArr: number[] = [lv.player]; // square the player stands on after the push that made the state
  const gArr: number[] = [0];
  const hArr: number[] = [h0];
  const keyArr: number[] = [0];
  const parent: number[] = [-1];
  const pushBox: number[] = [-1]; // box square pushed from
  const pushDir: number[] = [-1]; // DIRS index of the push
  const seqOf: number[] = [0];
  const best = new Map<number, number>();
  for (const b of lv.boxes) occupied[b] = 1;
  keyArr[0] = keyOf(lv.boxes, reachLow(lv, occupied, lv.player, seen, ++stamp, stack), size);
  for (const b of lv.boxes) occupied[b] = 0;
  best.set(keyArr[0]!, 0);

  // Binary heap on (f, h, seq): deterministic ties.
  const heap: number[] = [];
  let seq = 0;
  const heapLess = (a: number, b: number): boolean => {
    const fa = gArr[a]! + hArr[a]!;
    const fb = gArr[b]! + hArr[b]!;
    if (fa !== fb) return fa < fb;
    if (hArr[a] !== hArr[b]) return hArr[a]! < hArr[b]!;
    return seqOf[a]! < seqOf[b]!;
  };
  const heapPush = (s: number): void => {
    let i = heap.length;
    heap.push(s);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!heapLess(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const heapPop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heapLess(heap[c + 1]!, heap[c]!)) c++;
        if (!heapLess(heap[c]!, heap[i]!)) break;
        [heap[i], heap[c]] = [heap[c]!, heap[i]!];
        i = c;
      }
    }
    return top;
  };
  heapPush(0);

  let found = -1;
  while (heap.length > 0) {
    const s = heapPop();
    if (best.get(keyArr[s]!) !== s) continue; // superseded by a cheaper path to the same state
    if (solved(boxesArr[s]!)) {
      found = s;
      break;
    }
    if (boxesArr.length >= maxStates) return null;
    const boxes = boxesArr[s]!;
    const g = gArr[s]!;
    for (const b of boxes) occupied[b] = 1;
    reachLow(lv, occupied, playerArr[s]!, seen, ++stamp, stack);
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi]!;
      for (let di = 0; di < 4; di++) {
        const d = DIRS[di]!;
        const dd = d.dy * w + d.dx;
        const t = b + dd;
        if (seen[b - dd] !== here || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        if (isDead(lv, occupied, t)) {
          occupied[t] = 0;
          occupied[b] = 1;
          continue;
        }
        const next = boxes.slice();
        next[bi] = t;
        next.sort((x, y) => x - y);
        const h = assignmentHeuristic(next, dists, goals);
        const low = reachLow(lv, occupied, b, mark, ++stamp, stack);
        occupied[t] = 0;
        occupied[b] = 1;
        if (h < 0) continue;
        const key = keyOf(next, low, size);
        const prev = best.get(key);
        if (prev !== undefined && gArr[prev]! <= g + 1) continue;
        const t2 = boxesArr.length;
        boxesArr.push(next);
        playerArr.push(b);
        gArr.push(g + 1);
        hArr.push(h);
        keyArr.push(key);
        parent.push(s);
        pushBox.push(b);
        pushDir.push(di);
        seqOf.push(++seq);
        best.set(key, t2);
        heapPush(t2);
        if (solved(next)) {
          found = t2;
          break;
        }
      }
    }
    for (const b of boxes) occupied[b] = 0;
    if (found >= 0) break;
  }
  if (found < 0) return null;

  // Reconstruct: walk to each push's square, then push.
  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s]!) path.push(s);
  path.reverse();
  let moves = '';
  let player = lv.player;
  let boxes = lv.boxes.slice();
  for (const s of path) {
    const nextBoxes = boxesArr[s]!;
    const from = pushBox[s]!;
    const d = DIRS[pushDir[s]!]!;
    const dd = d.dy * w + d.dx;
    for (const b of boxes) occupied[b] = 1;
    moves += walkTo(lv, occupied, player, from - dd);
    for (const b of boxes) occupied[b] = 0;
    moves += d.push;
    player = from;
    boxes = nextBoxes;
  }
  return { pushes: path.length, moves };
}

/** Shortest walk from `from` to `to` around walls and boxes (DIRS order on ties). */
function walkTo(lv: Level, occupied: Uint8Array, from: number, to: number): string {
  const { w, wall } = lv;
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array<string>(wall.length);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi]!;
    if (p === to) break;
    for (const d of DIRS) {
      const q = p + d.dy * w + d.dx;
      if (wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = d.ch;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: push square out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]!) s = how[p]! + s;
  return s;
}

interface Room {
  boxes: number[];
  goals: number[];
  done?: boolean;
}

/**
 * The level's rooms: cut the dead squares of the player's row (the hallway:
 * a box there reaches no goal) out of the floor; each part left holding a box
 * is a room. Null when a box starts in the hallway or a part's boxes and goals
 * do not match.
 */
function roomsOf(lv: Level): Room[] | null {
  const { w, wall, goals, boxes, player } = lv;
  const live = liveSquares(lv);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms: Room[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const d of DIRS) {
        const q = squares[i]! + d.dy * w + d.dx;
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]!]!.boxes.push(b);
  for (const g of goals) if (part[g]! >= 0) rooms[part[g]!]!.goals.push(g);
  if (goals.some((g) => part[g]! < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/** The level solved room by room; null when a room's search gives up. */
function solveByRooms(lv: Level): PushSolution | null {
  const rooms = roomsOf(lv);
  if (rooms === null) return null;
  let player = lv.player;
  let pushes = 0;
  let moves = '';
  for (const room of rooms) {
    const wall = lv.wall.slice();
    for (const other of rooms)
      if (other !== room) for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
    const sub: Level = {
      w: lv.w,
      h: lv.h,
      wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      goalSet: lv.goalSet,
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    const solved = solvePushAStar(sub, MAX_ROOM_STATES);
    if (solved === null) return null;
    pushes += solved.pushes;
    moves += solved.moves;
    player = endOf(lv.w, player, solved.moves);
    room.done = true;
  }
  return { pushes, moves };
}

function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

/** Plain move A* fallback (fewest moves, no deadlock knowledge), like the house baseline. */
function solveMoveAStar(text: string): string {
  const lv = parseLevel(text);
  const { w, wall, goals, goalSet } = lv;
  const dist = (b: number): number =>
    Math.min(...goals.map((g) => Math.abs((g % w) - (b % w)) + Math.abs(Math.floor(g / w) - Math.floor(b / w))));
  const est = (bs: number[]): number => bs.reduce((a, b) => a + dist(b), 0);
  const key = (p: number, bs: number[]): string => String.fromCharCode(p, ...bs);
  const sp: number[] = [lv.player];
  const sb: number[][] = [lv.boxes.slice()];
  const sg: number[] = [0];
  const parent: number[] = [-1];
  const step: string[] = [''];
  const best = new Map<string, number>([[key(lv.player, lv.boxes), 0]]);
  const heap: [number, number, number][] = [[est(lv.boxes), 0, 0]];
  const less = (a: [number, number, number], b: [number, number, number]): boolean =>
    a[0] < b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] < b[2])));
  const push = (e: [number, number, number]): void => {
    let i = heap.length;
    heap.push(e);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const pop = (): [number, number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1]!, heap[c]!)) c++;
        if (!less(heap[c]!, heap[i]!)) break;
        [heap[i], heap[c]] = [heap[c]!, heap[i]!];
        i = c;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length > 0 && expanded < MAX_MOVE_STATES) {
    const [, g, s] = pop();
    if (best.get(key(sp[s]!, sb[s]!)) !== s) continue;
    const bs = sb[s]!;
    if (bs.every((b) => goalSet[b])) {
      let moves = '';
      for (let t = s; t > 0; t = parent[t]!) moves = step[t]! + moves;
      return moves;
    }
    expanded++;
    const p = sp[s]!;
    for (const d of DIRS) {
      const dd = d.dy * w + d.dx;
      const q = p + dd;
      if (wall[q]) continue;
      let nb = bs;
      let move = d.ch;
      const at = bs.indexOf(q);
      if (at >= 0) {
        if (wall[q + dd] || bs.includes(q + dd)) continue;
        nb = bs.slice();
        nb[at] = q + dd;
        nb.sort((a, b) => a - b);
        move = d.push;
      }
      const k = key(q, nb);
      const seen = best.get(k);
      if (seen !== undefined && sg[seen]! <= g + 1) continue;
      const t = sp.length;
      sp.push(q);
      sb.push(nb);
      sg.push(g + 1);
      parent.push(s);
      step.push(move);
      best.set(k, t);
      push([g + 1 + est(nb), g + 1, t]);
    }
  }
  return '';
}

function solve(text: string): string {
  const lv = parseLevel(text);
  const byRooms = solveByRooms(lv);
  if (byRooms !== null) return byRooms.moves;
  const whole = solvePushAStar(lv, MAX_LEVEL_STATES);
  if (whole !== null) return whole.moves;
  return solveMoveAStar(text);
}

for (const id of readdirSync(I).sort()) {
  const moves = solve(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
