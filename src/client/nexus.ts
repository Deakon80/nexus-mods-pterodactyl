// Talks to Nexus Mods straight from the user's browser. The user's API key is kept
// here and sent only to api.nexusmods.com; the panel never receives it. The panel
// gets just the short-lived download link Nexus returns for the user's own account.

const API = 'https://api.nexusmods.com';
const APP_HEADERS = { 'Application-Name': 'Nexus Mods for Pterodactyl', 'Application-Version': '1.0.1' };
const STORAGE_KEY = 'nexus-mods:api-key';

export interface NexusUser {
    name: string;
    isPremium: boolean;
}

export interface NexusMod {
    modId: number;
    name: string;
    summary: string;
    version: string;
    author: string;
    thumbnailUrl: string | null;
    endorsements: number;
    downloads: number;
    adultContent: boolean;
}

export interface NexusFile {
    file_id: number;
    name: string;
    file_name: string;
    version: string | null;
    category_name: string | null;
    size_kb: number;
    uploaded_timestamp: number;
}

export interface NxmLink {
    domain: string;
    modId: number;
    fileId: number;
    key: string;
    expires: string;
}

// sessionStorage unless the user asked to be remembered: a key typed on a shared
// computer is forgotten when the tab closes.
export function loadKey(): string | null {
    try {
        return sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function saveKey(key: string, remember: boolean): void {
    try {
        forgetKey();
        (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key);
    } catch {
        // Storage blocked: the key lives only in memory for this page.
    }
}

export function forgetKey(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // nothing stored
    }
}

async function rest<T>(key: string, path: string): Promise<T> {
    const response = await fetch(API + path, { headers: { apikey: key, ...APP_HEADERS } });
    if (response.status === 401) {
        throw new Error('Nexus Mods rejected the API key. Check it, or create a new one.');
    }
    if (response.status === 403) {
        throw new Error('Nexus Mods refused this download for your account. Free accounts must use "Mod Manager Download" on the mod page.');
    }
    if (response.status === 429) {
        throw new Error('Nexus Mods rate limit reached for your account. Try again later.');
    }
    if (!response.ok) {
        throw new Error(`Nexus Mods answered ${response.status}.`);
    }
    return (await response.json()) as T;
}

export async function validateKey(key: string): Promise<NexusUser> {
    const user = await rest<{ name: string; is_premium: boolean }>(key, '/v1/users/validate.json');
    return { name: user.name, isPremium: user.is_premium === true };
}

const MOD_FIELDS = 'nodes { modId name summary version author thumbnailUrl endorsements downloads adultContent }';

const SEARCH = `query Search($domain: String!, $term: String!, $count: Int!) {
  mods(filter: { gameDomainName: [{ value: $domain }], name: [{ value: $term, op: WILDCARD }] },
       sort: [{ downloads: { direction: DESC } }], count: $count) { ${MOD_FIELDS} }
}`;

const TOP = `query Top($domain: String!, $count: Int!) {
  mods(filter: { gameDomainName: [{ value: $domain }] }, sort: [{ downloads: { direction: DESC } }], count: $count) { ${MOD_FIELDS} }
}`;

export const LIST_SIZE = 50;

/** The game's mods, most downloaded first: the top of the whole game when the term is empty, otherwise mods whose names match it. */
export async function searchMods(domain: string, term: string): Promise<NexusMod[]> {
    const query = term === '' ? TOP : SEARCH;
    const response = await fetch(`${API}/v2/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...APP_HEADERS },
        body: JSON.stringify({ query, variables: term === '' ? { domain, count: LIST_SIZE } : { domain, term, count: LIST_SIZE } }),
    });
    if (!response.ok) {
        throw new Error(`Nexus Mods search failed (${response.status}).`);
    }
    const body = (await response.json()) as { data?: { mods?: { nodes?: NexusMod[] } }; errors?: unknown[] };
    if (body.errors?.length) {
        throw new Error('Nexus Mods could not run that search.');
    }
    return body.data?.mods?.nodes ?? [];
}

export interface NexusGame {
    name: string;
    domainName: string;
}

const GAMES = `query Games($term: String!) {
  games(filter: { name: [{ value: $term, op: WILDCARD }] }, count: 8) { nodes { name domainName } }
}`;

/** Finds Nexus games by name ("valheim", "V Rising"); no API key needed. */
export async function searchGames(term: string): Promise<NexusGame[]> {
    const response = await fetch(`${API}/v2/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...APP_HEADERS },
        body: JSON.stringify({ query: GAMES, variables: { term } }),
    });
    if (!response.ok) {
        throw new Error(`Nexus Mods game search failed (${response.status}).`);
    }
    const body = (await response.json()) as { data?: { games?: { nodes?: NexusGame[] } } };
    return body.data?.games?.nodes ?? [];
}

const CATEGORY_ORDER = ['MAIN', 'UPDATE', 'OPTIONAL', 'MISCELLANEOUS'];

const categoryRank = (file: NexusFile) => {
    const rank = CATEGORY_ORDER.indexOf((file.category_name ?? '').toUpperCase());
    return rank === -1 ? CATEGORY_ORDER.length : rank;
};

/** Main files first, then updates and optional files; newest first within each. */
export async function modFiles(key: string, domain: string, modId: number): Promise<NexusFile[]> {
    const body = await rest<{ files: NexusFile[] }>(key, `/v1/games/${encodeURIComponent(domain)}/mods/${modId}/files.json?category=main,optional`);
    return [...body.files].sort((a, b) => categoryRank(a) - categoryRank(b) || b.uploaded_timestamp - a.uploaded_timestamp);
}

export const isMainFile = (file: NexusFile) => (file.category_name ?? '').toUpperCase() === 'MAIN';

const gameIds = new Map<string, number>();

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${API}/v2/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...APP_HEADERS },
        body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
        throw new Error(`Nexus Mods answered ${response.status}.`);
    }
    const body = (await response.json()) as { data?: T; errors?: unknown[] };
    if (body.errors?.length || !body.data) {
        throw new Error('Nexus Mods could not answer that request.');
    }
    return body.data;
}

async function gameId(domain: string): Promise<number> {
    const cached = gameIds.get(domain);
    if (cached !== undefined) {
        return cached;
    }
    const data = await graphql<{ game: { id: number } | null }>('query G($d: String!) { game(domainName: $d) { id } }', { d: domain });
    if (!data.game) {
        throw new Error(`Nexus Mods has no game "${domain}".`);
    }
    gameIds.set(domain, data.game.id);
    return data.game.id;
}

export interface Requirement {
    /** The Nexus mod id, or 0 when the author linked somewhere other than Nexus. */
    modId: number;
    name: string;
    external: boolean;
    url: string;
    notes: string;
}

/** The "Requirements" list from the mod's Nexus page. */
export async function requirements(domain: string, modId: number): Promise<Requirement[]> {
    const data = await graphql<{
        mod: { modRequirements: { nexusRequirements: { nodes: { modId: string; modName: string; externalRequirement: boolean; url: string; notes: string }[] } } } | null;
    }>('query R($m: ID!, $g: ID!) { mod(modId: $m, gameId: $g) { modRequirements { nexusRequirements { nodes { modId modName externalRequirement url notes } } } } }', {
        m: String(modId),
        g: String(await gameId(domain)),
    });
    return (data.mod?.modRequirements.nexusRequirements.nodes ?? []).map((node) => ({
        modId: Number(node.modId) || 0,
        name: node.modName,
        external: node.externalRequirement || !(Number(node.modId) > 0),
        url: node.url,
        notes: node.notes,
    }));
}

export const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The Nexus mod a requirement most likely means, when the author linked it outside
 * Nexus: the most downloaded mod of the game whose name starts with the requirement's.
 * "Jotunn" finds "Jotunn the Valheim Library", "JsonDotNet" finds "JsonDotNET - ValheimModding".
 */
export async function findByName(domain: string, name: string): Promise<NexusMod | null> {
    const wanted = normalizeName(name);
    if (wanted.length < 3) {
        return null;
    }
    const mods = await searchMods(domain, name);
    return mods.find((mod) => normalizeName(mod.name).startsWith(wanted)) ?? null;
}

/** Premium accounts get a link straight from the API; free accounts pass the key and expiry from an nxm link. */
export async function downloadLink(key: string, domain: string, modId: number, fileId: number, nxm?: NxmLink): Promise<string> {
    const query = nxm ? `?key=${encodeURIComponent(nxm.key)}&expires=${encodeURIComponent(nxm.expires)}` : '';
    const links = await rest<{ URI: string }[]>(key, `/v1/games/${encodeURIComponent(domain)}/mods/${modId}/files/${fileId}/download_link.json${query}`);
    if (!links.length) {
        throw new Error('Nexus Mods returned no download link.');
    }
    return links[0].URI;
}

/** Parses the link behind a "Mod Manager Download" button: nxm://domain/mods/1/files/2?key=…&expires=…&user_id=… */
export function parseNxm(value: string): NxmLink | null {
    const match = value.trim().match(/^nxm:\/\/([a-z0-9]+)\/mods\/(\d+)\/files\/(\d+)\?(.+)$/i);
    if (!match) {
        return null;
    }
    const params = new URLSearchParams(match[4]);
    const key = params.get('key');
    const expires = params.get('expires');
    if (!key || !expires) {
        return null;
    }
    return { domain: match[1].toLowerCase(), modId: Number(match[2]), fileId: Number(match[3]), key, expires };
}

export function modPageUrl(domain: string, modId: number): string {
    return `https://www.nexusmods.com/${domain}/mods/${modId}?tab=files`;
}
