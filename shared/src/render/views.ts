// Public import surface for the CLI view renderers. The implementation was
// split out of this (formerly 1146-line) file into the `views/` directory in a
// pure structural refactor; this thin re-export keeps the `./views.js`
// specifier valid for every existing importer (TS `moduleResolution: Bundler`
// resolves `./views.js` to this file, NOT to `views/index.ts`).
export * from './views/index.js'
