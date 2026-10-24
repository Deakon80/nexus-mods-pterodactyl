import { describe, expect, it } from 'vitest';
import { crc32, md5, zip } from './archive';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('md5', () => {
    it('matches the RFC 1321 test vectors', () => {
        expect(md5(bytes(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
        expect(md5(bytes('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
        expect(md5(bytes('message digest'))).toBe('f96b697d7cb7938d525a2f31aaf161d0');
        expect(md5(bytes('12345678901234567890123456789012345678901234567890123456789012345678901234567890'))).toBe('57edf4a22be3c955ac49da2e2107b67a');
    });
});

describe('crc32', () => {
    it('matches the standard check value', () => {
        expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    });
});

describe('zip', () => {
    it('writes a zip with a local header, the file data and an end record', () => {
        const data = bytes('{"info":{}}');
        const archive = zip([{ name: 'collection.json', data }]);
        expect([...archive.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
        expect(new TextDecoder().decode(archive.slice(30 + 'collection.json'.length, 30 + 'collection.json'.length + data.length))).toBe('{"info":{}}');
        expect([...archive.slice(archive.length - 22, archive.length - 18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    });
});
