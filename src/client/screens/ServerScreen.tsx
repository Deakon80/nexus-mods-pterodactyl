import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, http, httpErrorToHuman, Input, ServerContentBlock, Spinner, TitledGreyBox, toast, useCurrentServerUuid } from '@pterodactyl/sdk';
import {
    downloadLink,
    findByName,
    forgetKey,
    isMainFile,
    loadKey,
    modFiles,
    modPageUrl,
    normalizeName,
    parseNxm,
    requirements,
    saveKey,
    searchMods,
    validateKey,
    type NexusFile,
    type NexusMod,
    type NexusUser,
} from '../nexus';

import { hasPending, modStatus, modsUrl, otherFailures, sameMod, type Game, type Installed, type Loader, type ServerMods as State } from '../mods';
import { useModsRefresh } from '../useModsRefresh';
import CollectionPanel from './CollectionPanel';

/** Everything the screens below need about this server. */
interface Context {
    apiKey: string | null;
    user: NexusUser | null;
    game: Game;
    base: string;
    installed: Installed[];
    loader: Loader;
    refresh: () => void;
}

const message = (cause: unknown) => (cause instanceof Error && !('isAxiosError' in cause) ? cause.message : httpErrorToHuman(cause));

const isBepInEx = (name: string) => normalizeName(name).startsWith('bepinex');

export default function ServerScreen() {
    const uuid = useCurrentServerUuid();
    const base = modsUrl(uuid);

    const [state, setState] = useState<State | null>(null);
    const [key, setKey] = useState<string | null>(() => loadKey());
    const [user, setUser] = useState<NexusUser | null>(null);

    const refresh = useCallback(() => {
        http.get<State>(base)
            .then(({ data }) => setState(data))
            .catch((cause) => toast.error(httpErrorToHuman(cause)));
    }, [base]);

    useEffect(refresh, [refresh]);
    useModsRefresh(refresh, state !== null && hasPending(state));

    useEffect(() => {
        if (!key) {
            setUser(null);
            return;
        }
        validateKey(key)
            .then(setUser)
            .catch((cause) => {
                toast.error(message(cause));
                forgetKey();
                setKey(null);
            });
    }, [key]);

    if (state === null) {
        return (
            <ServerContentBlock title={'Nexus Mods'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    const context: Context | null = state.game
        ? { apiKey: key && user ? key : null, user, game: state.game, base, installed: state.installed, loader: state.loader, refresh }
        : null;

    return (
        <ServerContentBlock title={'Nexus Mods'}>
            <div className={'nxm:flex nxm:flex-col nxm:gap-4'}>
                {context === null ? (
                    <TitledGreyBox title={'Not set up for this game'}>
                        <p className={'nxm:text-sm'}>An administrator needs to link this server&apos;s game to Nexus Mods on the Admin → Nexus Mods page.</p>
                    </TitledGreyBox>
                ) : (
                    <>
                        <CollectionPanel
                            game={context.game}
                            installed={state.installed}
                            loader={state.loader}
                            collection={state.collection}
                            apiKey={context.apiKey}
                            user={user}
                            base={base}
                            onSaved={refresh}
                        />
                        <Account
                            user={user}
                            onConnect={(value, remember) => {
                                saveKey(value, remember);
                                setKey(value);
                            }}
                            onDisconnect={() => {
                                forgetKey();
                                setKey(null);
                            }}
                        />
                        <Search context={context} />
                    </>
                )}
                <InstalledList base={base} installed={state.installed} loader={state.loader} onChange={refresh} />
            </div>
        </ServerContentBlock>
    );
}

function Account({ user, onConnect, onDisconnect }: { user: NexusUser | null; onConnect: (key: string, remember: boolean) => void; onDisconnect: () => void }) {
    const [value, setValue] = useState('');
    const [remember, setRemember] = useState(false);

    if (user) {
        return (
            <TitledGreyBox title={'Nexus Mods account'}>
                <div className={'nxm:flex nxm:items-center nxm:justify-between nxm:gap-3'}>
                    <p className={'nxm:text-sm'}>
                        Signed in as <strong>{user.name}</strong> <Badge tone={user.isPremium ? 'success' : 'neutral'}>{user.isPremium ? 'Premium' : 'Free'}</Badge>
                    </p>
                    <Button size={'small'} isSecondary onClick={onDisconnect}>
                        Disconnect
                    </Button>
                </div>
            </TitledGreyBox>
        );
    }

    return (
        <TitledGreyBox title={'Connect your Nexus Mods account'}>
            <div className={'nxm:flex nxm:flex-col nxm:gap-3 nxm:text-sm'}>
                <p>
                    Paste your personal API key from{' '}
                    <a className={'nxm:underline'} href={'https://www.nexusmods.com/settings/api-keys'} target={'_blank'} rel={'noreferrer'}>
                        nexusmods.com → Site preferences → API keys
                    </a>
                    . The key stays in this browser and is sent only to Nexus Mods. This panel never receives or stores it.
                </p>
                <Input type={'password'} autoComplete={'off'} placeholder={'Nexus Mods API key'} value={value} onChange={(event) => setValue(event.currentTarget.value)} />
                <label className={'nxm:flex nxm:items-center nxm:gap-2'}>
                    <input type={'checkbox'} checked={remember} onChange={(event) => setRemember(event.currentTarget.checked)} />
                    Remember on this browser (otherwise it is forgotten when this tab closes)
                </label>
                <div>
                    <Button disabled={value.trim() === ''} onClick={() => onConnect(value.trim(), remember)}>
                        Connect
                    </Button>
                </div>
            </div>
        </TitledGreyBox>
    );
}

function Search({ context }: { context: Context }) {
    const { game, installed } = context;
    const [term, setTerm] = useState('');
    // The term the list currently shows; '' is the game's most downloaded mods.
    const [shown, setShown] = useState('');
    const [results, setResults] = useState<NexusMod[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState<NexusMod | null>(null);

    const load = useCallback(
        (value: string) => {
            setBusy(true);
            setSelected(null);
            // Nexus matches plain words; wildcards like *term* make the search return nothing.
            searchMods(game.domain, value)
                .then((mods) => {
                    setResults(mods);
                    setShown(value);
                })
                .catch((cause) => toast.error(message(cause)))
                .finally(() => setBusy(false));
        },
        [game.domain],
    );

    useEffect(() => load(''), [load]);

    const installedIds = useMemo(() => new Set(installed.map((item) => item.mod_id)), [installed]);
    // Premium installs from the panel in one click, so a click opens the mod here. Everyone else
    // browses the mod on Nexus; a connected free account still installs through the guided steps.
    const premium = context.apiKey !== null && context.user?.isPremium === true;
    const canInstall = context.apiKey !== null && context.user !== null;

    return (
        <TitledGreyBox title={shown === '' ? `Most popular ${game.name} mods on Nexus Mods` : `${game.name} mods matching "${shown}"`}>
            <div className={'nxm:flex nxm:flex-col nxm:gap-3'}>
                <form
                    className={'nxm:flex nxm:gap-2'}
                    onSubmit={(event) => {
                        event.preventDefault();
                        load(term.trim());
                    }}
                >
                    <Input className={'nxm:flex-1'} placeholder={'Search by mod name'} value={term} onChange={(event) => setTerm(event.currentTarget.value)} />
                    <Button type={'submit'} isLoading={busy} disabled={term.trim().length < 2}>
                        Search
                    </Button>
                    {shown !== '' && (
                        <Button
                            type={'button'}
                            isSecondary
                            onClick={() => {
                                setTerm('');
                                load('');
                            }}
                        >
                            Most popular
                        </Button>
                    )}
                </form>
                {results === null && <Spinner size={'small'} />}
                {results !== null && results.length === 0 && <p className={'nxm:text-sm'}>No mods found.</p>}
                {results?.map((mod, index) =>
                    selected?.modId === mod.modId ? (
                        <ModPanel key={mod.modId} context={context} mod={mod} onClose={() => setSelected(null)} />
                    ) : (
                        <div key={mod.modId} className={'nxm:flex nxm:items-center nxm:gap-3 nxm:rounded-md nxm:border nxm:border-border nxm:p-2 nxm:hover:bg-accent'}>
                            <button
                                type={'button'}
                                className={'nxm:flex nxm:flex-1 nxm:gap-3 nxm:text-left'}
                                title={premium ? undefined : 'Opens the mod on Nexus Mods in a new tab'}
                                onClick={() => (premium ? setSelected(mod) : window.open(`https://www.nexusmods.com/${game.domain}/mods/${mod.modId}`, '_blank', 'noopener,noreferrer'))}
                            >
                                <span className={'nxm:w-6 nxm:shrink-0 nxm:self-center nxm:text-right nxm:text-sm nxm:font-semibold nxm:text-muted-foreground'}>{index + 1}</span>
                                {mod.thumbnailUrl && !mod.adultContent && <img src={mod.thumbnailUrl} alt={''} className={'nxm:h-14 nxm:w-24 nxm:rounded nxm:object-cover'} />}
                                <span className={'nxm:flex nxm:flex-col nxm:gap-1'}>
                                    <span className={'nxm:font-medium'}>
                                        {mod.name} <span className={'nxm:text-xs nxm:text-muted-foreground'}>v{mod.version} by {mod.author}</span>
                                    </span>
                                    <span className={'nxm:line-clamp-2 nxm:text-xs nxm:text-muted-foreground'}>{mod.summary}</span>
                                    <span className={'nxm:text-xs nxm:text-muted-foreground'}>
                                        {mod.downloads.toLocaleString()} downloads · {mod.endorsements.toLocaleString()} endorsements
                                    </span>
                                </span>
                            </button>
                            {installedIds.has(mod.modId) ? (
                                <Button size={'small'} color={'green'} className={'nxm:shrink-0'} onClick={() => setSelected(mod)}>
                                    Installed
                                </Button>
                            ) : (
                                canInstall &&
                                !premium && (
                                    <Button size={'small'} isSecondary className={'nxm:shrink-0'} onClick={() => setSelected(mod)}>
                                        Install
                                    </Button>
                                )
                            )}
                        </div>
                    ),
                )}
            </div>
        </TitledGreyBox>
    );
}

/** A requirement from the mod's Nexus page and what installing it involves. */
interface PlanItem {
    key: string;
    name: string;
    /** Nexus mod to install, when the requirement is (or was matched to) a Nexus mod. */
    modId: number;
    status: 'installed' | 'provided' | 'install' | 'external';
    /** The author linked outside Nexus and we found a Nexus mod with that name. */
    matched: boolean;
    url: string;
    include: boolean;
}

async function buildPlan(context: Context, mod: NexusMod): Promise<PlanItem[]> {
    const { game, installed, loader } = context;
    const plan: PlanItem[] = [];
    const seen = new Set<string>([String(mod.modId)]);
    const installedIds = new Set(installed.map((item) => item.mod_id));
    const loadedNames = loader.loaded.map((plugin) => plugin.name);

    const visit = async (modId: number, depth: number) => {
        for (const requirement of await requirements(game.domain, modId)) {
            if (isBepInEx(requirement.name)) {
                if (!seen.has('bepinex')) {
                    seen.add('bepinex');
                    plan.push({ key: 'bepinex', name: requirement.name, modId: 0, status: loader.bepinex ? 'provided' : 'external', matched: false, url: requirement.url, include: false });
                }
                continue;
            }

            let targetId = requirement.external ? 0 : requirement.modId;
            let name = requirement.name;
            let matched = false;
            if (targetId === 0) {
                const found = await findByName(game.domain, requirement.name).catch(() => null);
                if (found) {
                    targetId = found.modId;
                    name = found.name;
                    matched = true;
                }
            }

            const key = targetId > 0 ? String(targetId) : `external:${normalizeName(requirement.name)}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);

            const alreadyThere = (targetId > 0 && installedIds.has(targetId)) || loadedNames.some((loaded) => sameMod(loaded, name) || sameMod(loaded, requirement.name));
            const status: PlanItem['status'] = alreadyThere ? 'installed' : targetId > 0 ? 'install' : 'external';
            plan.push({ key, name, modId: targetId, status, matched, url: requirement.url, include: status === 'install' });

            if (status === 'install' && depth < 2) {
                await visit(targetId, depth + 1);
            }
        }
    };

    await visit(mod.modId, 0);
    return plan;
}

const CATEGORY_TONES: Record<string, 'success' | 'info' | 'neutral'> = { MAIN: 'success', UPDATE: 'info' };

function ModPanel({ context, mod, onClose }: { context: Context; mod: NexusMod; onClose: () => void }) {
    const { apiKey, user, game, base, installed, refresh } = context;
    const [files, setFiles] = useState<NexusFile[] | null>(null);
    const [plan, setPlan] = useState<PlanItem[] | null>(null);
    const [chosen, setChosen] = useState<NexusFile | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const current = installed.find((item) => item.mod_id === mod.modId) ?? null;

    useEffect(() => {
        buildPlan(context, mod)
            .then(setPlan)
            .catch(() => setPlan([]));
        if (apiKey) {
            modFiles(apiKey, game.domain, mod.modId)
                .then(setFiles)
                .catch((cause) => toast.error(message(cause)));
        }
        // The plan is built once per opened mod; installs refresh it by reopening.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey, game.domain, mod.modId]);

    const toInstall = (plan ?? []).filter((item) => item.status === 'install' && item.include);

    // Authors often bundle a requirement on their own page (Epic Loot ships a "JsonDotNet" main
    // file). That file is already covered when the requirement is installed as its own mod, so
    // compare its name with the other installed mods and satisfied requirements. The mod's own
    // name is left out, so newer versions of it can still be installed.
    const coveredBy = (file: NexusFile): string | null => {
        const others = [
            ...installed.filter((item) => item.mod_id !== mod.modId).map((item) => item.mod_name),
            ...(plan ?? []).filter((item) => item.status === 'installed' || item.status === 'provided').map((item) => item.name),
        ];
        return others.find((name) => sameMod(file.name, name) && !sameMod(file.name, mod.name)) ?? null;
    };

    const installOne = async (modId: number, modName: string, file: NexusFile, link: string) => {
        await http.post(`${base}/install`, { url: link, mod_id: modId, file_id: file.file_id, mod_name: modName, file_name: file.file_name, version: file.version });
    };

    /** Premium: requirements' newest main files, then the chosen file, one after another. */
    const installPremium = async (file: NexusFile) => {
        if (!apiKey) {
            return;
        }
        try {
            for (const item of toInstall) {
                setBusy(`Installing ${item.name}…`);
                const itemFiles = await modFiles(apiKey, game.domain, item.modId);
                const main = itemFiles.find(isMainFile) ?? itemFiles[0];
                if (!main) {
                    throw new Error(`${item.name} has no file to install.`);
                }
                await installOne(item.modId, item.name, main, await downloadLink(apiKey, game.domain, item.modId, main.file_id));
            }
            setBusy(`Installing ${mod.name}…`);
            await installOne(mod.modId, mod.name, file, await downloadLink(apiKey, game.domain, mod.modId, file.file_id));
            toast.success(toInstall.length ? `${mod.name} and ${toInstall.length} requirement(s) installed. Restart the server to load them.` : `${mod.name} installed. Restart the server to load it.`);
            refresh();
        } catch (cause) {
            toast.error(message(cause));
            refresh();
        } finally {
            setBusy(null);
        }
    };

    if (!apiKey || !user) {
        return (
            <div className={'nxm:flex nxm:items-center nxm:justify-between nxm:gap-3 nxm:rounded-md nxm:border nxm:border-border nxm:p-3 nxm:text-sm'}>
                <span>
                    Connect your Nexus Mods account above to install <strong>{mod.name}</strong>.
                </span>
                <Button size={'small'} isSecondary onClick={onClose}>
                    Close
                </Button>
            </div>
        );
    }

    return (
        <div className={'nxm:flex nxm:flex-col nxm:gap-3 nxm:rounded-md nxm:border nxm:border-border nxm:p-3'}>
            <div className={'nxm:flex nxm:items-center nxm:justify-between'}>
                <strong>{mod.name}</strong>
                <Button size={'small'} isSecondary onClick={onClose}>
                    Close
                </Button>
            </div>

            <Requirements plan={plan} onToggle={(key) => setPlan((items) => items?.map((item) => (item.key === key ? { ...item, include: !item.include } : item)) ?? null)} />

            {busy && (
                <p className={'nxm:flex nxm:items-center nxm:gap-2 nxm:text-sm'}>
                    <Spinner size={'small'} /> {busy}
                </p>
            )}

            {chosen && !user.isPremium ? (
                <FreeSteps context={context} mod={mod} file={chosen} requirements={toInstall} onCancel={() => setChosen(null)} onDone={() => setChosen(null)} />
            ) : files === null ? (
                <Spinner size={'small'} />
            ) : files.length === 0 ? (
                <p className={'nxm:text-sm'}>This mod has no main or optional files.</p>
            ) : (
                files.map((file) => {
                    const covered = current?.file_id === file.file_id ? null : coveredBy(file);
                    const isInstalled = current?.file_id === file.file_id || covered !== null;
                    return (
                        <div key={file.file_id} className={'nxm:flex nxm:items-center nxm:justify-between nxm:gap-3 nxm:text-sm'}>
                            <span className={'nxm:flex nxm:flex-wrap nxm:items-center nxm:gap-2'}>
                                <Badge size={'sm'} tone={CATEGORY_TONES[(file.category_name ?? '').toUpperCase()] ?? 'neutral'}>
                                    {isMainFile(file) ? 'Main file' : (file.category_name ?? 'File').toLowerCase()}
                                </Badge>
                                {file.name}
                                <span className={'nxm:text-xs nxm:text-muted-foreground'}>
                                    {file.version ? `v${file.version} · ` : ''}
                                    {Math.max(1, Math.round(file.size_kb / 1024))} MB
                                </span>
                            </span>
                            {isInstalled ? (
                                <Button size={'small'} color={'green'} disabled title={covered ? `Already installed as ${covered}` : undefined}>
                                    Installed
                                </Button>
                            ) : (
                                <Button
                                    size={'small'}
                                    isLoading={busy !== null && chosen?.file_id === file.file_id}
                                    disabled={busy !== null || plan === null}
                                    onClick={() => {
                                        setChosen(file);
                                        if (user.isPremium) {
                                            void installPremium(file);
                                        }
                                    }}
                                >
                                    {toInstall.length ? `Install + ${toInstall.length} requirement${toInstall.length > 1 ? 's' : ''}` : 'Install'}
                                </Button>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}

function Requirements({ plan, onToggle }: { plan: PlanItem[] | null; onToggle: (key: string) => void }) {
    if (plan === null) {
        return (
            <p className={'nxm:flex nxm:items-center nxm:gap-2 nxm:text-xs nxm:text-muted-foreground'}>
                <Spinner size={'small'} /> Checking requirements…
            </p>
        );
    }
    if (plan.length === 0) {
        return <p className={'nxm:text-xs nxm:text-muted-foreground'}>No requirements listed on Nexus Mods.</p>;
    }

    return (
        <div className={'nxm:flex nxm:flex-col nxm:gap-1 nxm:rounded-md nxm:bg-accent nxm:p-2 nxm:text-sm'}>
            <span className={'nxm:font-medium'}>Requirements</span>
            {plan.map((item) => (
                <div key={item.key} className={'nxm:flex nxm:flex-wrap nxm:items-center nxm:gap-2'}>
                    {item.status === 'install' && <input type={'checkbox'} checked={item.include} onChange={() => onToggle(item.key)} aria-label={`Install ${item.name}`} />}
                    <span>{item.name}</span>
                    {item.status === 'installed' && <Badge size={'sm'} tone={'success'}>installed</Badge>}
                    {item.status === 'provided' && <Badge size={'sm'} tone={'success'}>provided by this server</Badge>}
                    {item.status === 'install' && <Badge size={'sm'} tone={'info'}>{item.include ? 'will be installed' : 'skipped'}</Badge>}
                    {item.status === 'install' && item.matched && <span className={'nxm:text-xs nxm:text-muted-foreground'}>(matched on Nexus by name)</span>}
                    {item.status === 'external' && (
                        <>
                            <Badge size={'sm'} tone={'warning'}>install separately</Badge>
                            {item.url && (
                                <a className={'nxm:text-xs nxm:underline'} href={item.url} target={'_blank'} rel={'noreferrer'}>
                                    where to get it
                                </a>
                            )}
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}

/**
 * Free accounts: Nexus only hands out download links after a "Mod Manager Download" click
 * on its site, so collect one such link per mod (requirements first), then install them all.
 */
function FreeSteps({ context, mod, file, requirements: needed, onCancel, onDone }: { context: Context; mod: NexusMod; file: NexusFile; requirements: PlanItem[]; onCancel: () => void; onDone: () => void }) {
    const { apiKey, game, base, refresh } = context;
    const steps = [...needed.map((item) => ({ modId: item.modId, name: item.name, fileId: null as number | null })), { modId: mod.modId, name: mod.name, fileId: file.file_id }];
    const [links, setLinks] = useState<string[]>(() => steps.map(() => ''));
    const [busy, setBusy] = useState<string | null>(null);

    const parsed = links.map((link, index) => {
        const nxm = parseNxm(link);
        const step = steps[index];
        const ok = nxm !== null && nxm.domain === game.domain && nxm.modId === step.modId && (step.fileId === null || nxm.fileId === step.fileId);
        return ok ? nxm : null;
    });

    const run = async () => {
        if (!apiKey) {
            return;
        }
        try {
            for (const [index, step] of steps.entries()) {
                const nxm = parsed[index]!;
                setBusy(`Installing ${step.name}…`);
                const files = await modFiles(apiKey, game.domain, step.modId);
                const chosenFile = files.find((candidate) => candidate.file_id === nxm.fileId);
                if (!chosenFile) {
                    throw new Error(`That link is for a file ${step.name} no longer offers. Copy a fresh one.`);
                }
                const url = await downloadLink(apiKey, game.domain, step.modId, nxm.fileId, nxm);
                await http.post(`${base}/install`, { url, mod_id: step.modId, file_id: chosenFile.file_id, mod_name: step.name, file_name: chosenFile.file_name, version: chosenFile.version });
            }
            toast.success(`${mod.name}${needed.length ? ` and ${needed.length} requirement(s)` : ''} installed. Restart the server to load them.`);
            refresh();
            onDone();
        } catch (cause) {
            toast.error(message(cause));
            refresh();
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className={'nxm:flex nxm:flex-col nxm:gap-3 nxm:text-sm'}>
            <p>
                Free Nexus accounts download from the mod page. For each step, open its Files tab on Nexus Mods, right-click <em>Mod Manager Download</em>, copy the link, and paste it here.
                Links expire after a few minutes, so copy them just before installing.
            </p>
            {steps.map((step, index) => (
                <div key={step.modId} className={'nxm:flex nxm:flex-col nxm:gap-1'}>
                    <span className={'nxm:flex nxm:items-center nxm:gap-2'}>
                        <strong>
                            {index + 1}. {step.name}
                        </strong>
                        <span className={'nxm:text-xs nxm:text-muted-foreground'}>{step.fileId === null ? 'its main file' : file.name}</span>
                        <a className={'nxm:text-xs nxm:underline'} href={modPageUrl(game.domain, step.modId)} target={'_blank'} rel={'noreferrer'}>
                            open Files tab
                        </a>
                        {parsed[index] && <Badge size={'sm'} tone={'success'}>link ok</Badge>}
                    </span>
                    <Input
                        placeholder={'nxm://…'}
                        value={links[index]}
                        $hasError={links[index] !== '' && !parsed[index]}
                        onChange={(event) => {
                            const value = event.currentTarget.value;
                            setLinks((current) => current.map((link, i) => (i === index ? value : link)));
                        }}
                    />
                </div>
            ))}
            {busy && (
                <p className={'nxm:flex nxm:items-center nxm:gap-2'}>
                    <Spinner size={'small'} /> {busy}
                </p>
            )}
            <div className={'nxm:flex nxm:gap-2'}>
                <Button disabled={busy !== null || parsed.some((item) => item === null)} onClick={() => void run()}>
                    {steps.length > 1 ? `Install all ${steps.length}` : 'Install'}
                </Button>
                <Button isSecondary disabled={busy !== null} onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

function InstalledList({ base, installed, loader, onChange }: { base: string; installed: Installed[]; loader: Loader; onChange: () => void }) {
    const [removing, setRemoving] = useState<number | null>(null);

    const remove = (item: Installed) => {
        if (!window.confirm(`Remove ${item.mod_name}? This deletes ${item.path}.`)) {
            return;
        }
        setRemoving(item.id);
        http.delete(`${base}/installed/${item.id}`)
            .then(() => {
                toast.success(`${item.mod_name} removed. Restart the server to unload it.`);
                onChange();
            })
            .catch((cause) => toast.error(httpErrorToHuman(cause)))
            .finally(() => setRemoving(null));
    };

    const unmatchedFailures = otherFailures(installed, loader);

    return (
        <TitledGreyBox title={'Installed from Nexus Mods'}>
            <div className={'nxm:flex nxm:flex-col nxm:gap-2'}>
                {loader.bepinex && loader.started_at && (
                    <p className={'nxm:text-xs nxm:text-muted-foreground'}>
                        Mod loader (BepInEx) last started {new Date(loader.started_at).toLocaleString()}: {loader.loaded.length} loaded, {loader.failed.length} failed.
                    </p>
                )}
                {installed.length === 0 ? (
                    <p className={'nxm:text-sm'}>Nothing installed yet.</p>
                ) : (
                    installed.map((item) => {
                        const state = modStatus(item, loader);
                        return (
                            <div key={item.id} className={'nxm:flex nxm:items-center nxm:justify-between nxm:gap-3 nxm:text-sm'}>
                                <span className={'nxm:flex nxm:flex-col nxm:gap-1'}>
                                    <span>
                                        {item.mod_name} <span className={'nxm:text-xs nxm:text-muted-foreground'}>{item.version ? `v${item.version} · ` : ''}{item.path}</span>
                                    </span>
                                    {state && (
                                        <span>
                                            <Badge size={'sm'} tone={state.tone}>
                                                {state.text}
                                            </Badge>
                                        </span>
                                    )}
                                </span>
                                <Button size={'small'} color={'red'} isSecondary isLoading={removing === item.id} onClick={() => remove(item)}>
                                    Remove
                                </Button>
                            </div>
                        );
                    })
                )}
                {unmatchedFailures.map((plugin) => (
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
