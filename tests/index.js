// Entry point so `node --test tests/` works (Node 22+ treats the directory as a module path).
// `node --test` with no arguments also finds the *.test.mjs files directly.
Promise.all([import('./logic.test.mjs'), import('./stress.test.mjs')]).catch((e) => { console.error(e); process.exitCode = 1; });
