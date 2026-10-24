<?php

namespace NexusMods\Services;

use Illuminate\Support\Str;
use NexusMods\Models\Install;
use NexusMods\Support\Paths;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * Installs a Nexus file onto a server through Wings: pull into a staging folder, unpack,
 * then move the mod into "<game folder>/<Mod Name>-<mod id>". One folder per mod keeps
 * removal exact. Wings confines every path to the server's own directory.
 */
final class Installer
{
    private const string STAGING = '.nexus-mods/staging';

    private const array ARCHIVES = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'xz', 'bz2'];

    /** Seconds Wings may spend downloading before the request gives up. */
    private const int PULL_TIMEOUT = 600;

    /**
     * @param  array{url: string, game_domain: string, mod_id: int, file_id: int, mod_name: string, file_name: string, version: ?string, folder: string}  $input
     */
    public function install(Server $server, User $user, array $input): Install
    {
        $files = Daemon::server($server)->files();
        $stage = Paths::join(self::STAGING, (string) Str::uuid());
        $archive = Paths::name($input['file_name'], 'download');
        $target = Paths::join($input['folder'], Paths::name($input['mod_name'], 'mod').'-'.$input['mod_id']);

        $existing = Install::query()->where('server_id', $server->id)->where('game_domain', $input['game_domain'])->where('mod_id', $input['mod_id'])->first();

        try {
            $this->ensureDirectory($server, $stage);
            // Called directly rather than through the panel's PullFile action, which writes the
            // full URL to the activity log; Nexus links carry the user's signed download token.
            $files->pull($input['url'], $stage, ['filename' => $archive, 'foreground' => true, 'timeout' => self::PULL_TIMEOUT]);

            if (in_array(mb_strtolower(pathinfo($archive, PATHINFO_EXTENSION)), self::ARCHIVES, true)) {
                $files->decompressFile($stage, $archive);
                $files->deleteFiles($stage, [$archive]);
            }
            $this->listings = [];

            $source = $this->contentRoot($server, $stage, $input['folder']);
            if ($this->entries($server, $source) === []) {
                throw new HttpException(422, 'The download was empty.');
            }

            if ($existing !== null) {
                $this->deletePath($server, $existing->path);
            } elseif ($this->exists($server, $target)) {
                throw new HttpException(409, 'A folder named '.basename($target).' already exists in '.$input['folder'].'. Remove it first.');
            }

            $this->ensureDirectory($server, dirname($target));
            $files->renameFiles('/', [['from' => ltrim($source, '/'), 'to' => ltrim($target, '/')]]);
            $this->forget($server, $source, $target);
        } catch (DaemonConnectionException $exception) {
            throw new HttpException(502, 'The server\'s node could not complete the install: '.$exception->getMessage());
        } finally {
            rescue(fn () => $files->deleteFiles(self::STAGING, [basename($stage)]), report: false);
        }

        $install = Install::query()->updateOrCreate(
            ['server_id' => $server->id, 'game_domain' => $input['game_domain'], 'mod_id' => $input['mod_id']],
            ['user_id' => $user->id, 'file_id' => $input['file_id'], 'mod_name' => $input['mod_name'], 'file_name' => $input['file_name'], 'version' => $input['version'], 'path' => ltrim($target, '/')],
        );

        Activity::event('server:nexus-mods.install')->subject($server)->property([
            'game' => $input['game_domain'], 'mod_id' => $input['mod_id'], 'file_id' => $input['file_id'], 'mod' => $input['mod_name'], 'path' => $install->path,
        ])->log();

        return $install;
    }

    public function remove(Server $server, Install $install): void
    {
        try {
            $this->deletePath($server, $install->path);
        } catch (DaemonConnectionException $exception) {
            throw new HttpException(502, 'The server\'s node could not remove the mod: '.$exception->getMessage());
        }
        Activity::event('server:nexus-mods.remove')->subject($server)->property(['game' => $install->game_domain, 'mod_id' => $install->mod_id, 'mod' => $install->mod_name, 'path' => $install->path])->log();
        $install->delete();
    }

    /**
     * Where the mod's own files start inside the unpacked download. Archives often wrap
     * everything in one folder, or ship the full layout (e.g. BepInEx/plugins/...): unwrap
     * single folders, then follow the game folder's segments if the archive contains them.
     */
    private function contentRoot(Server $server, string $stage, string $folder): string
    {
        $root = $stage;
        foreach (explode('/', $folder) as $segment) {
            $match = $this->childFolder($server, $root, $segment);
            if ($match === null) {
                break;
            }
            $root = Paths::join($root, $match);
        }

        for ($depth = 0; $depth < 3; $depth++) {
            $entries = $this->entries($server, $root);
            if (count($entries) !== 1 || ($entries[0]['file'] ?? true)) {
                break;
            }
            $root = Paths::join($root, $entries[0]['name']);
        }

        return $root;
    }

    private function childFolder(Server $server, string $directory, string $name): ?string
    {
        foreach ($this->entries($server, $directory) as $entry) {
            if (! ($entry['file'] ?? true) && strcasecmp($entry['name'], $name) === 0) {
                return $entry['name'];
            }
        }

        return null;
    }

    /** @var array<string, list<array<string, mixed>>> directory listings for the current install, by path */
    private array $listings = [];

    /**
     * The entries of a directory that is known to exist. Wings answers a listing of a
     * missing directory with a 500, so callers check existence through exists() first.
     *
     * @return list<array<string, mixed>>
     */
    private function entries(Server $server, string $directory): array
    {
        $key = $server->uuid.'|'.$directory;

        return $this->listings[$key] ??= Daemon::server($server)->files()->getDirectory($directory);
    }

    /** Walks down from the root, so no missing directory is ever listed. */
    private function exists(Server $server, string $path): bool
    {
        $path = Paths::join($path);
        if ($path === '/') {
            return true;
        }
        if (! $this->exists($server, dirname($path))) {
            return false;
        }
        foreach ($this->entries($server, dirname($path)) as $entry) {
            if ($entry['name'] === basename($path)) {
                return true;
            }
        }

        return false;
    }

    /** Listings change as the install moves things; drop the cache for a path and its parent. */
    private function forget(Server $server, string ...$paths): void
    {
        foreach ($paths as $path) {
            unset($this->listings[$server->uuid.'|'.Paths::join($path)], $this->listings[$server->uuid.'|'.dirname(Paths::join($path))]);
        }
    }

    private function ensureDirectory(Server $server, string $path): void
    {
        $current = '/';
        foreach (explode('/', trim($path, '/')) as $segment) {
            if ($segment === '') {
                continue;
            }
            if (! $this->exists($server, Paths::join($current, $segment))) {
                Daemon::server($server)->files()->createDirectory($segment, $current);
                $this->forget($server, Paths::join($current, $segment));
            }
            $current = Paths::join($current, $segment);
        }
    }

    private function deletePath(Server $server, string $path): void
    {
        $path = Paths::folder($path);
        if ($path === null) {
            throw new HttpException(422, 'Refusing to delete an unsafe path.');
        }
        if ($this->exists($server, '/'.$path)) {
            Daemon::server($server)->files()->deleteFiles(dirname('/'.$path), [basename($path)]);
            $this->forget($server, '/'.$path);
        }
    }
}
