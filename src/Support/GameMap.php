<?php

namespace NexusMods\Support;

use Pterodactyl\Facades\Extensions;
use Pterodactyl\Models\Server;

/**
 * Which Nexus Mods game a server belongs to, and where its mods go. Admins edit the
 * rows on Admin → Nexus Mods; each row links a panel egg tag to a Nexus game.
 */
final class GameMap
{
    private const string KEY = 'games';

    /** Folders that are right for every server of these Nexus games. Admins can change them. */
    public const array FOLDER_PRESETS = [
        'valheim' => 'BepInEx/plugins',
        'vrising' => 'BepInEx/plugins',
    ];

    /** @var list<array{tag: string, domain: string, name: string, folder: string}> */
    public const array DEFAULTS = [
        ['tag' => 'valheim', 'domain' => 'valheim', 'name' => 'Valheim', 'folder' => 'BepInEx/plugins'],
        ['tag' => 'v-rising', 'domain' => 'vrising', 'name' => 'V Rising', 'folder' => 'BepInEx/plugins'],
    ];

    /** @return list<array{tag: string, domain: string, name: string, folder: string}> */
    public static function rows(): array
    {
        $stored = Extensions::settings('nexus-mods')->get(self::KEY);
        $rows = [];
        foreach (is_array($stored) ? $stored : self::DEFAULTS as $row) {
            $row = self::clean($row);
            if ($row !== null) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    /** @param list<array{tag: string, domain: string, name: string, folder: string}> $rows */
    public static function save(array $rows): void
    {
        Extensions::settings('nexus-mods')->set(self::KEY, array_values($rows));
    }

    /** @return array{tag: string, domain: string, name: string, folder: string}|null */
    public static function clean(mixed $row): ?array
    {
        if (! is_array($row)) {
            return null;
        }
        $tag = is_string($row['tag'] ?? null) ? mb_strtolower(trim($row['tag'])) : '';
        $domain = is_string($row['domain'] ?? null) ? mb_strtolower(trim($row['domain'])) : '';
        $name = is_string($row['name'] ?? null) ? trim($row['name']) : '';
        $folder = is_string($row['folder'] ?? null) ? Paths::folder($row['folder']) : null;
        if ($tag === '' || preg_match('/^[a-z0-9]{1,64}$/', $domain) !== 1 || $folder === null) {
            return null;
        }

        return ['tag' => mb_substr($tag, 0, 64), 'domain' => $domain, 'name' => mb_substr($name !== '' ? $name : $domain, 0, 120), 'folder' => $folder];
    }

    /** @return array{domain: string, name: string, folder: string}|null the first row matching one of the server's egg tags */
    public static function forServer(Server $server): ?array
    {
        $tags = array_map(fn ($tag): string => mb_strtolower((string) $tag->slug), $server->egg?->tags?->all() ?? []);
        foreach (self::rows() as $row) {
            if (in_array($row['tag'], $tags, true)) {
                return ['domain' => $row['domain'], 'name' => $row['name'], 'folder' => $row['folder']];
            }
        }

        return null;
    }
}
