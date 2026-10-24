// Shared between the Nexus Mods tab and the console's installed-mods section.
import { normalizeName } from './nexus';

export interface Game {
    domain: string;
    name: string;
    folder: string;
}

export interface Installed {
    id: number;
    mod_id: number;
    file_id: number;
    mod_name: string;
    file_name: string;
    version: string | null;
    path: string;
    installed_at: string | null;
}

export interface Plugin {
    name: string;
    version: string;
    guid: string;
    reason?: string;
}

export interface Loader {
    bepinex: boolean;
    log_at: string | null;
    /** When the server last started, from the loader log's first line; the log's own time moves while it runs. */
    started_at: string | null;
    loaded: Plugin[];
    failed: Plugin[];
}

export interface SharedCollection {
    collection_id: string;
    slug: string;
    owner: string;
    revision_number: number;
    revision_status: string;
    updated_at?: string | null;
}

export interface ServerMods {
    game: Game | null;
    installed: Installed[];
    loader: Loader;
    collection: SharedCollection | null;
}

export const modsUrl = (uuid: string | undefined) => `/api/client/servers/${uuid}/extensions/nexus-mods`;

/** Whether a mod-loader plugin name and a Nexus mod name are the same mod ("Jotunn" / "Jotunn the Valheim Library"). */
export const sameMod = (a: string, b: string) => {
    const x = normalizeName(a);
    const y = normalizeName(b);
    return x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x));
};

export type ModStatus = { tone: 'success' | 'warning' | 'danger' | 'neutral'; text: string } | null;

/** What the mod loader said about an installed mod on its last start. */
export function modStatus(item: Installed, loader: Loader): ModStatus {
    const failed = loader.failed.find((plugin) => sameMod(plugin.name, item.mod_name));
    if (failed) {
        return { tone: 'danger', text: `Failed to load: ${failed.reason}` };
    }
    const startTime = loader.started_at ? new Date(loader.started_at).getTime() : null;
    const installedTime = item.installed_at ? new Date(item.installed_at).getTime() : null;
    if (installedTime !== null && (startTime === null || installedTime > startTime)) {
        return { tone: 'warning', text: 'Restart the server to load it' };
    }
    const loaded = loader.loaded.find((plugin) => sameMod(plugin.name, item.mod_name));
    if (loaded) {
        return { tone: 'success', text: `Loaded (v${loaded.version})` };
    }
    if (!loader.bepinex) {
        return null;
    }
    return { tone: 'neutral', text: 'Not listed by the mod loader (libraries usually are not)' };
}

/** Whether any installed mod is waiting for a restart to load. */
export const hasPending = (data: ServerMods) => data.installed.some((item) => modStatus(item, data.loader)?.tone === 'warning');

/** Failures the loader reported for plugins that were not installed through this extension. */
export const otherFailures = (installed: Installed[], loader: Loader) =>
    loader.failed.filter((plugin) => !installed.some((item) => sameMod(plugin.name, item.mod_name)));
