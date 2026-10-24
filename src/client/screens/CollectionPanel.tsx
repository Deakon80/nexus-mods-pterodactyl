import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, http, httpErrorToHuman, Spinner, TitledGreyBox, toast, useCurrentServer } from '@pterodactyl/sdk';
import { collectionUrl, publishCollection } from '../collections';
import { findByName, type NexusMod, type NexusUser } from '../nexus';
import type { Game, Installed, Loader, SharedCollection } from '../mods';

const modUrl = (domain: string, modId: number) => `https://www.nexusmods.com/${domain}/mods/${modId}`;

interface Props {
    game: Game;
    installed: Installed[];
    loader: Loader;
    collection: SharedCollection | null;
    apiKey: string | null;
    user: NexusUser | null;
    base: string;
    onSaved: () => void;
}

/**
 * Players need the same mods as the server. Mod files are never handed out from the panel
 * (Nexus terms and authors' permissions); instead the server's mods become a Nexus Collection,
 * created or updated here with the user's own Nexus account, as a draft they publish on Nexus.
 */
export default function CollectionPanel({ game, installed, loader, collection, apiKey, user, base, onSaved }: Props) {
    const serverName = useCurrentServer((server) => server.attributes.name) ?? 'Server';
    const [step, setStep] = useState<string | null>(null);
    const [modLoader, setModLoader] = useState<NexusMod | null>(null);
    const [showList, setShowList] = useState(false);

    // The mod loader is a mod players need too (BepInExPack_Valheim is #3605 on Nexus).
    useEffect(() => {
        if (loader.bepinex) {
            findByName(game.domain, 'BepInExPack')
                .then(setModLoader)
                .catch(() => setModLoader(null));
        }
    }, [loader.bepinex, game.domain]);

    const mods = useMemo(() => [...installed].sort((a, b) => a.mod_name.localeCompare(b.mod_name)), [installed]);
    const notOwner = collection !== null && user !== null && collection.owner.toLowerCase() !== user.name.toLowerCase();

    const share = async () => {
        if (!apiKey || !user) {
            return;
        }
        try {
            const result = await publishCollection({
                apiKey,
                author: user.name,
                domain: game.domain,
                gameName: game.name,
                serverName,
                loader: loader.bepinex ? modLoader : null,
                mods,
                existing: collection,
                onStep: setStep,
                relay: async (url, filename, content) => {
                    await http.post(`${base}/collection/upload`, { url, filename, content });
                },
            });
            setStep('Saving…');
            await http.put(`${base}/collection`, result);
            toast.success(collection ? `Collection updated: revision ${result.revision_number} is a ${result.revision_status}.` : 'Collection created as a draft.');
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error && !('isAxiosError' in cause) ? cause.message : httpErrorToHuman(cause));
        } finally {
            setStep(null);
        }
    };

    const text = useMemo(() => {
        const lines = [`Mods for ${serverName} (${game.name})`, ''];
        if (collection) {
            lines.push(`Nexus Collection: ${collectionUrl(game.domain, collection.slug)}`, '');
        }
        if (modLoader && loader.bepinex) {
            lines.push(`Mod loader: ${modLoader.name}, ${modUrl(game.domain, modLoader.modId)}`);
        }
        mods.forEach((item, index) => lines.push(`${index + 1}. ${item.mod_name}${item.version ? ` v${item.version}` : ''}: ${modUrl(game.domain, item.mod_id)}?tab=files`));
        return lines.join('\n');
    }, [serverName, game, mods, modLoader, loader.bepinex, collection]);

    return (
        <TitledGreyBox title={'Share with players'}>
            <div className={'nxm:flex nxm:flex-col nxm:gap-3 nxm:text-sm'}>
                <p>
                    Players need the same mods as the server. Share them as a Nexus Collection: players add it in Vortex or the Nexus Mods app and get every mod in one click,
                    each through their own Nexus account.
                </p>

                {collection && (
                    <div className={'nxm:flex nxm:flex-wrap nxm:items-center nxm:gap-2 nxm:rounded-md nxm:bg-accent nxm:p-2'}>
                        <a className={'nxm:font-medium nxm:underline'} href={collectionUrl(game.domain, collection.slug)} target={'_blank'} rel={'noreferrer'}>
                            {collectionUrl(game.domain, collection.slug)}
                        </a>
                        <Badge size={'sm'} tone={collection.revision_status === 'published' ? 'success' : 'warning'}>
                            revision {collection.revision_number}: {collection.revision_status}
                        </Badge>
                        <Button
                            size={'xsmall'}
                            isSecondary
                            onClick={() =>
                                navigator.clipboard
                                    .writeText(collectionUrl(game.domain, collection.slug))
                                    .then(() => toast.success('Link copied.'))
                                    .catch(() => toast.error('Your browser blocked copying.'))
                            }
                        >
                            Copy link
                        </Button>
                        {collection.revision_status === 'draft' && (
                            <span className={'nxm:basis-full nxm:text-xs nxm:text-muted-foreground'}>
                                Drafts are only visible to you. Open the link and publish it on Nexus Mods so players can add it.
                            </span>
                        )}
                    </div>
                )}

                {step && (
                    <p className={'nxm:flex nxm:items-center nxm:gap-2'}>
                        <Spinner size={'small'} /> {step}
                    </p>
                )}

                <div className={'nxm:flex nxm:flex-wrap nxm:items-center nxm:gap-2'}>
                    <Button disabled={!apiKey || !user || installed.length === 0 || step !== null || notOwner} isLoading={step !== null} onClick={() => void share()}>
                        {collection ? 'Update collection' : 'Create collection'}
                    </Button>
                    <Button isSecondary size={'small'} onClick={() => setShowList(!showList)}>
                        {showList ? 'Hide mod list' : 'Show mod list'}
                    </Button>
                    {!apiKey && <span className={'nxm:text-xs nxm:text-muted-foreground'}>Connect your Nexus Mods account below first.</span>}
                    {notOwner && <span className={'nxm:text-xs nxm:text-muted-foreground'}>Only {collection?.owner}, who created this collection, can update it.</span>}
                    {installed.length === 0 && <span className={'nxm:text-xs nxm:text-muted-foreground'}>Install some mods first.</span>}
                </div>

                {showList && (
                    <div className={'nxm:flex nxm:flex-col nxm:gap-1 nxm:rounded-md nxm:bg-accent nxm:p-2'}>
                        {loader.bepinex && (
                            <div className={'nxm:flex nxm:items-center nxm:gap-2'}>
                                <Badge size={'sm'} tone={'info'}>
                                    mod loader
                                </Badge>
                                {modLoader ? (
                                    <a className={'nxm:underline'} href={modUrl(game.domain, modLoader.modId)} target={'_blank'} rel={'noreferrer'}>
                                        {modLoader.name}
                                    </a>
                                ) : (
                                    <span>BepInEx</span>
                                )}
                            </div>
                        )}
                        {mods.map((item, index) => (
                            <div key={item.id} className={'nxm:flex nxm:flex-wrap nxm:items-center nxm:gap-2'}>
                                <span className={'nxm:w-5 nxm:text-right nxm:text-xs nxm:text-muted-foreground'}>{index + 1}.</span>
                                <a className={'nxm:underline'} href={`${modUrl(game.domain, item.mod_id)}?tab=files`} target={'_blank'} rel={'noreferrer'}>
                                    {item.mod_name}
                                </a>
                                {item.version && <Badge size={'sm'}>v{item.version}</Badge>}
                            </div>
                        ))}
                        <div className={'nxm:mt-2'}>
                            <Button
                                size={'xsmall'}
                                isSecondary
                                onClick={() =>
                                    navigator.clipboard
                                        .writeText(text)
                                        .then(() => toast.success('Mod list copied.'))
                                        .catch(() => toast.error('Your browser blocked copying.'))
                                }
                            >
                                Copy list
                            </Button>
                        </div>
                    </div>
                )}
                <p className={'nxm:text-xs nxm:text-muted-foreground'}>
                    Server settings files (for example in BepInEx/config) are not part of a Nexus mod. If players need them, share them separately.
                </p>
            </div>
        </TitledGreyBox>
    );
}
