import { useCallback, useEffect, useState } from 'react';
import { Badge, http, TitledGreyBox, useCurrentServerUuid, useServerPermission } from '@pterodactyl/sdk';
import { hasPending, modStatus, modsUrl, otherFailures, type ServerMods } from './mods';
import { useModsRefresh } from './useModsRefresh';

/** Installed mods and their load status, under the console. Hidden where mods are not set up. */
export default function ConsoleMods() {
    const uuid = useCurrentServerUuid();
    const allowed = useServerPermission(['ext.nexus-mods.manage', 'file.read']);
    const [data, setData] = useState<ServerMods | null>(null);

    const refresh = useCallback(() => {
        if (!uuid || !allowed) {
            return;
        }
        http.get<ServerMods>(modsUrl(uuid))
            .then(({ data }) => setData(data))
            .catch(() => setData(null));
    }, [uuid, allowed]);

    useEffect(refresh, [refresh]);

    useModsRefresh(refresh, data !== null && hasPending(data));

    if (!allowed || data === null || data.game === null) {
        return null;
    }

    const failures = otherFailures(data.installed, data.loader);

    return (
        <TitledGreyBox title={`Installed mods (${data.installed.length})`} className={'nxm:mt-4'}>
            <div className={'nxm:flex nxm:flex-col nxm:gap-2 nxm:text-sm'}>
                {data.loader.bepinex && data.loader.started_at && (
                    <p className={'nxm:text-xs nxm:text-muted-foreground'}>
                        Mod loader last started {new Date(data.loader.started_at).toLocaleString()}: {data.loader.loaded.length} loaded, {data.loader.failed.length} failed.
                    </p>
                )}
                {data.installed.length === 0 ? (
                    <p>No mods installed. Browse and install them on the Nexus Mods tab.</p>
                ) : (
                    data.installed.map((item) => {
                        const state = modStatus(item, data.loader);
                        return (
                            <div key={item.id} className={'nxm:flex nxm:flex-wrap nxm:items-center nxm:justify-between nxm:gap-2'}>
                                <span>
                                    {item.mod_name} {item.version && <span className={'nxm:text-xs nxm:text-muted-foreground'}>v{item.version}</span>}
                                </span>
                                {state && (
                                    <Badge size={'sm'} tone={state.tone}>
                                        {state.text}
                                    </Badge>
                                )}
                            </div>
                        );
                    })
                )}
                {failures.map((plugin) => (
                    <p key={plugin.guid || plugin.name} className={'nxm:text-xs'}>
                        <Badge size={'sm'} tone={'danger'}>
                            {plugin.name} failed to load
                        </Badge>{' '}
                        {plugin.reason}
                    </p>
                ))}
            </div>
        </TitledGreyBox>
    );
}
