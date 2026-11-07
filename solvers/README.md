# Searchers

A searcher is a standalone Node.js ES module that improves a solution. The personal hive (`npm run hunt`)
runs built-in searchers from this folder on your processor, and asks AI models to write better ones.

## Contract (the same for built-in and AI-written searchers)

- Input, on standard input, one JSON object:
  `{ "problem": "circles-in-square", "n": 487, "start": <solution or null>, "seconds": 120, "seed": 12345 }`
  `start` is the current best solution on the board (`{ "centers": [...] }` or `{ "points": [...] }`).
- Output, on standard output: a line `BEST <json>` each time the searcher has a better solution, where
  `<json>` is the solution object (`{ "centers": [["x","y"], ...] }` or `{ "points": [[x,y], ...] }`).
  The last `BEST` line before the deadline is the one judged.
- Finish before `seconds` have elapsed. The hive stops it a few seconds later anyway.
- No network, no file writes, no child processes: AI-written searchers run under Node's permission
  model, with read access to their own folder only.
- Coordinates: decimal strings are best (up to 30 digits); the exact judge decides.
