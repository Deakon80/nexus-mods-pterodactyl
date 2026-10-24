import { describe, expect, it } from 'vitest';
import { collectionName } from './collections';

describe('collectionName', () => {
    it('adds "mods" when it fits in 36 characters', () => {
        expect(collectionName('Nexus Test - Valheim', 'Valheim')).toBe('Nexus Test - Valheim mods');
    });

    it('cuts a long server name to 36 characters', () => {
        const name = collectionName('Rogue Gamers Valheim Hardcore PvE Server #2', 'Valheim');
        expect(name).toBe('Rogue Gamers Valheim Hardcore PvE Se');
        expect(name.length).toBeLessThanOrEqual(36);
    });

    it('falls back to the game when the server name is too short', () => {
        expect(collectionName(' ', 'Valheim')).toBe('Valheim server mods');
    });
});
