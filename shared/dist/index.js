// claude-pokemon-shared — root module re-exports.
//
// Consumers can either import from the root (`claude-pokemon-shared`) or
// from a sub-path (`claude-pokemon-shared/battle`, /moves, /stages, /types)
// for tighter tree-shaking.
export * from './types.js';
export * from './battle.js';
export * from './stages.js';
export * from './moves.js';
//# sourceMappingURL=index.js.map