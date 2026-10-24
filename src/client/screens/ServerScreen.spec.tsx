import { describe, expect, it } from 'vitest';
import { parseNxm } from '../nexus';

describe('parseNxm', () => {
    it('reads the mod, file, key and expiry from a Mod Manager Download link', () => {
        expect(parseNxm('nxm://valheim/mods/1042/files/4567?key=abc123&expires=1793000000&user_id=99')).toEqual({
            domain: 'valheim',
            modId: 1042,
            fileId: 4567,
            key: 'abc123',
            expires: '1793000000',
        });
    });

    it('rejects links without a key or expiry, and anything that is not an nxm link', () => {
        expect(parseNxm('nxm://valheim/mods/1042/files/4567?user_id=99')).toBeNull();
        expect(parseNxm('https://www.nexusmods.com/valheim/mods/1042')).toBeNull();
        expect(parseNxm('')).toBeNull();
    });
});
