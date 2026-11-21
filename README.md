# Sokoban Solver

Push-optimal solver for make.fun sokoban-solver-01-run-20261121. Rooms are
independent, so each is solved with push A* (admissible assignment heuristic
+ deadlock pruning). Practice: 5/5 push-optimal, score 1,000,000.

Run: `MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts`
