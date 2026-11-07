// Node harness for searchers: reads the input JSON on stdin, runs the searcher given as argument, and
// prints "BEST <json>" for every reported solution. The hive runs it under Node's permission model.
const input = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => r(s)); }));
const { pathToFileURL } = await import('node:url');
const mod = await import(pathToFileURL(process.argv[2]).href);
await mod.search(input, (sol) => process.stdout.write('BEST ' + JSON.stringify(sol) + '\n'));
