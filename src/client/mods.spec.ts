import { describe, expect, it } from 'vitest';
import { hasPending, modStatus, otherFailures, sameMod, type Installed, type Loader } from './mods';

const install = (mod_name: string, installed_at = '2026-10-23T19:00:00-06:00'): Installed => ({
    id: 1, mod_id: 1, file_id: 1, mod_name, file_name: 'x.zip', version: '1.0', path: 'BepInEx/plugins/x', installed_at,
});

const loader: Loader = {
    bepinex: true,
    // The log keeps changing while the server runs; only the start time decides "restart needed".
    log_at: '2026-10-23T21:00:00-06:00',
    started_at: '2026-10-23T19:43:19-06:00',
    loaded: [{ name: 'Jotunn', version: '2.30.2', guid: 'com.jotunn.jotunn' }],
    failed: [{ name: 'Equipment and Quick Slots', version: '3.1.3', guid: 'eqs', reason: 'it has missing dependencies: com.jotunn.jotunn' }, { name: 'Other Mod', version: '1', guid: 'o', reason: 'boom' }],
};

describe('sameMod', () => {
    it('matches a plugin name to the longer Nexus name and ignores punctuation', () => {
        expect(sameMod('Jotunn', 'Jotunn the Valheim Library')).toBe(true);
        expect(sameMod('JsonDotNet', 'JsonDotNET - ValheimModding')).toBe(true);
        expect(sameMod('Epic Loot', 'Equipment and Quick Slots')).toBe(false);
        expect(sameMod('ab', 'abc')).toBe(false);
    });
});

describe('modStatus', () => {
    it('reports loaded, failed, restart-needed and library states', () => {
        expect(modStatus(install('Jotunn the Valheim Library'), loader)).toEqual({ tone: 'success', text: 'Loaded (v2.30.2)' });
        expect(modStatus(install('Equipment and Quick Slots'), loader)?.tone).toBe('danger');
        // Installed after the last start but before the log's latest write: still needs a restart.
        expect(modStatus(install('Epic Loot', '2026-10-23T20:00:00-06:00'), loader)).toEqual({ tone: 'warning', text: 'Restart the server to load it' });
        expect(modStatus(install('JsonDotNET - ValheimModding'), loader)?.tone).toBe('neutral');
        expect(modStatus(install('Anything'), { ...loader, bepinex: false, loaded: [], failed: [] })).toBeNull();
        expect(hasPending({ game: null, installed: [install('Epic Loot', '2026-10-23T20:00:00-06:00')], loader, collection: null })).toBe(true);
        expect(hasPending({ game: null, installed: [install('Jotunn the Valheim Library')], loader, collection: null })).toBe(false);
    });

    it('lists loader failures that no installed mod accounts for', () => {
        expect(otherFailures([install('Equipment and Quick Slots')], loader).map((plugin) => plugin.name)).toEqual(['Other Mod']);
    });
});
