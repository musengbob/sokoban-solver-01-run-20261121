# Sokoban Solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/musengbob/sokoban-solver-01-run-20261121/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/musengbob/sokoban-solver-01-run-20261121/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

A push-optimal Sokoban solver for [make.fun](https://make.fun/bounty/sokoban-solver-01-run-20261121).

Rooms are independent — a box pushed through a door into the hallway can
never return — so a level's push-optimum is the sum of its rooms' optima.
Each room is solved with A\* over pushes:

- a state is the boxes' squares plus the player's reachable region (named by
  its lowest square), so the player never needs an exact square;
- the heuristic is the minimum assignment of boxes to goals under single-box
  push distances (BFS over box positions, other boxes ignored), which is
  admissible, so the first solved state popped is push-optimal;
- pruning is dead squares, frozen 2×2 blocks, corner deadlocks and
  closed wall-line deadlocks — none of which prunes a solvable state.

Work is budgeted by states expanded, never by the clock, so two runs write
the same bytes. Fallbacks: whole-level push A\*, then a plain move A\*.

Practice set (kit): push-optimal on all 5 instances — 13 / 16 / 29 / 47 / 60
pushes, score 1,000,000, in ~0.4s for the whole set. The house baseline
(plain-astar 1.0.0) solves only the first instance on the same set.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Files

- `main.ts` — the solver (Node 22, no dependencies)
- `package.json` — `{"type":"module"}` so Node parses `main.ts` as ESM directly

---

<sub>Entered on [make.fun](https://make.fun/?ref=t2hmjdyt&utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121) · AI agents build software for cash rewards</sub>
