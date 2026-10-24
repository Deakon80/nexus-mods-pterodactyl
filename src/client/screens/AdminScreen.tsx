import { useEffect, useState } from 'react';
import { Button, http, httpErrorToHuman, Input, Spinner, TitledGreyBox, toast } from '@pterodactyl/sdk';
import { searchGames, type NexusGame } from '../nexus';

interface Row {
    tag: string;
    domain: string;
    name: string;
    folder: string;
}

interface Data {
    rows: Row[];
    tags: { slug: string; name: string }[];
    presets: Record<string, string>;
}

const URL = '/api/admin/extensions/nexus-mods/games';
const field = 'nxm:w-full nxm:rounded-md nxm:border nxm:border-border nxm:bg-background nxm:px-3 nxm:py-2 nxm:text-sm';

export default function AdminScreen() {
    const [data, setData] = useState<Data | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        http.get<Data>(URL)
            .then(({ data }) => {
                setData(data);
                setRows(data.rows);
            })
            .catch((cause) => toast.error(httpErrorToHuman(cause)));
    }, []);

    if (data === null) {
        return <Spinner centered />;
    }

    const update = (index: number, patch: Partial<Row>) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    const used = new Set(rows.map((row) => row.tag));

    const save = () => {
        setSaving(true);
        http.put<Data>(URL, { rows })
            .then(({ data }) => {
                setRows(data.rows);
                toast.success('Saved.');
            })
            .catch((cause) => toast.error(httpErrorToHuman(cause)))
            .finally(() => setSaving(false));
    };

    return (
        <div className={'nxm:flex nxm:flex-col nxm:gap-4'}>
            <TitledGreyBox title={'Nexus Mods games'}>
                <p className={'nxm:text-sm'}>
                    Link each game on this panel to its game on Nexus Mods, and choose the folder its mods are installed into. Servers whose game is not listed here do not
                    get the Nexus Mods tab&apos;s search.
                </p>
            </TitledGreyBox>

            {rows.map((row, index) => (
                <TitledGreyBox key={index} title={row.name || 'New game'}>
                    <div className={'nxm:grid nxm:gap-4 nxm:md:grid-cols-3'}>
                        <label className={'nxm:flex nxm:flex-col nxm:gap-1 nxm:text-sm'}>
                            <span className={'nxm:font-medium'}>Game on this panel</span>
                            <select className={field} value={row.tag} onChange={(event) => update(index, { tag: event.currentTarget.value })}>
                                <option value={''}>Choose…</option>
                                {data.tags.map((tag) => (
                                    <option key={tag.slug} value={tag.slug} disabled={tag.slug !== row.tag && used.has(tag.slug)}>
                                        {tag.name}
                                    </option>
                                ))}
                            </select>
                            <span className={'nxm:text-xs nxm:text-muted-foreground'}>The tag on the game&apos;s egg.</span>
                        </label>

                        <GamePicker
                            value={row.domain ? { name: row.name, domainName: row.domain } : null}
                            onChange={(game) =>
                                update(index, {
                                    domain: game.domainName,
                                    name: game.name,
                                    folder: row.folder || data.presets[game.domainName] || '',
                                })
                            }
                        />

                        <label className={'nxm:flex nxm:flex-col nxm:gap-1 nxm:text-sm'}>
                            <span className={'nxm:font-medium'}>Install folder</span>
                            <Input placeholder={'e.g. BepInEx/plugins'} value={row.folder} onChange={(event) => update(index, { folder: event.currentTarget.value })} />
                            <span className={'nxm:text-xs nxm:text-muted-foreground'}>Inside the server&apos;s files. Each mod gets its own folder in here.</span>
                        </label>
                    </div>
                    <div className={'nxm:mt-3'}>
                        <Button size={'small'} color={'red'} isSecondary onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                            Remove
                        </Button>
                    </div>
                </TitledGreyBox>
            ))}

            <div className={'nxm:flex nxm:gap-2'}>
                <Button isSecondary onClick={() => setRows([...rows, { tag: '', domain: '', name: '', folder: '' }])}>
                    Add a game
                </Button>
                <Button isLoading={saving} disabled={rows.some((row) => !row.tag || !row.domain || !row.folder.trim())} onClick={save}>
                    Save
                </Button>
            </div>
        </div>
    );
}

function GamePicker({ value, onChange }: { value: NexusGame | null; onChange: (game: NexusGame) => void }) {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<NexusGame[] | null>(null);
    const [busy, setBusy] = useState(false);

    const search = () => {
        setBusy(true);
        searchGames(term.trim())
            .then(setResults)
            .catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)))
            .finally(() => setBusy(false));
    };

    return (
        <div className={'nxm:flex nxm:flex-col nxm:gap-1 nxm:text-sm'}>
            <span className={'nxm:font-medium'}>Game on Nexus Mods</span>
            {value && results === null ? (
                <div className={'nxm:flex nxm:items-center nxm:justify-between nxm:gap-2'}>
                    <span>
                        {value.name} <span className={'nxm:text-xs nxm:text-muted-foreground'}>nexusmods.com/{value.domainName}</span>
                    </span>
                    <Button size={'xsmall'} isSecondary onClick={() => setResults([])}>
                        Change
                    </Button>
                </div>
            ) : (
                <>
                    <form
                        className={'nxm:flex nxm:gap-2'}
                        onSubmit={(event) => {
                            event.preventDefault();
                            search();
                        }}
                    >
                        <Input placeholder={'Search, e.g. Valheim'} value={term} onChange={(event) => setTerm(event.currentTarget.value)} />
                        <Button type={'submit'} size={'small'} isLoading={busy} disabled={term.trim().length < 2}>
                            Find
                        </Button>
                    </form>
                    {results?.length === 0 && term && !busy && <span className={'nxm:text-xs'}>No games found.</span>}
                    {results?.map((game) => (
                        <button
                            key={game.domainName}
                            type={'button'}
                            className={'nxm:rounded nxm:px-2 nxm:py-1 nxm:text-left nxm:hover:bg-accent'}
                            onClick={() => {
                                onChange(game);
                                setResults(null);
                                setTerm('');
                            }}
                        >
                            {game.name} <span className={'nxm:text-xs nxm:text-muted-foreground'}>nexusmods.com/{game.domainName}</span>
                        </button>
                    ))}
                </>
            )}
        </div>
    );
}
