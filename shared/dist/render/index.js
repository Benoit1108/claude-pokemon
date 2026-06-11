// View render dispatch (Phase R3c). Maps a view name to its TS renderer. Views
// not yet ported return { supported: false } so the bash dispatcher can fall
// back to its own implementation (same graceful-degradation contract as R3b).
import { renderBadges, renderInventory, renderTeam, renderPc, } from './views.js';
const RENDERERS = {
    badges: renderBadges,
    inventory: renderInventory,
    team: renderTeam,
    pc: renderPc,
};
export const SUPPORTED_VIEWS = Object.keys(RENDERERS);
export function renderView(input) {
    const renderer = RENDERERS[input.view];
    if (!renderer)
        return { supported: false, output: '' };
    const ctx = {
        state: input.state,
        data: input.data,
        locale: input.locale,
        lang: input.lang ?? 'fr',
        scriptName: input.scriptName ?? 'pokemon-status.sh',
    };
    return { supported: true, output: renderer(ctx) };
}
//# sourceMappingURL=index.js.map