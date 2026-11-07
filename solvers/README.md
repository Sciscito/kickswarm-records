# Searchers

A searcher improves a solution. The personal hive runs the built-in searchers of this folder on your
processor (or in your browser), and asks AI models to write better ones. The contract is the same for all:

```
export async function search(input, report) { ... }
```

- `input = { problem, n, start, seconds, seed }`. `start` is the current best solution on the board
  (`{ centers: [["x","y"], ...] }` or `{ points: [[x,y], ...] }`), or `null`.
- Call `report(solution)` each time you have a better solution, same shape as `start`.
  Coordinates as decimal strings (up to 30 digits) are best; integers for points.
- Return before `input.seconds` have elapsed. The hive stops you a little later anyway.
- Plain JavaScript: no imports, no network, no files, no processes, no DOM. AI-written searchers run in
  a sandbox: a Node process under the permission model (`solvers/run.mjs`), or a browser Web Worker.
