<?php

namespace NexusMods\Services;

use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Exceptions\Http\Server\FileSizeTooLargeException;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * What the server's mod loader reported on its last start. BepInEx rewrites
 * BepInEx/LogOutput.log on every start, listing each plugin it loaded and each one it
 * could not load, with the reason.
 */
final class LoaderStatus
{
    private const string LOG = '/BepInEx/LogOutput.log';

    private const int MAX_LOG_BYTES = 4 * 1024 * 1024;

    /**
     * @return array{bepinex: bool, log_at: ?string, started_at: ?string, loaded: list<array{name: string, version: string, guid: string}>, failed: list<array{name: string, version: string, guid: string, reason: string}>}
     */
    public function read(Server $server): array
    {
        $status = ['bepinex' => false, 'log_at' => null, 'started_at' => null, 'loaded' => [], 'failed' => []];

        try {
            $files = Daemon::server($server)->files();
            // Wings answers a listing of a missing folder with an error, so look from the root down.
            if (! $this->has($files->getDirectory('/'), 'BepInEx', false)) {
                return $status;
            }
            $bepinex = $files->getDirectory('/BepInEx');
            $status['bepinex'] = $this->has($bepinex, 'core', false);
            $log = $this->entry($bepinex, 'LogOutput.log', true);
            if ($log === null) {
                return $status;
            }
            $status['log_at'] = is_string($log['modified'] ?? null) ? $log['modified'] : null;
            $contents = $files->getContent(self::LOG, self::MAX_LOG_BYTES);
        } catch (FileSizeTooLargeException|DaemonConnectionException) {
            return $status;
        } catch (Throwable $exception) {
            report($exception);

            return $status;
        }

        $status['started_at'] = $this->startedAt($contents, $status['log_at']);

        // "Loading [Jotunn 2.29.2]" / "Could not load [Equipment and Quick Slots 3.1.3] (guid) because it has missing dependencies: com.jotunn.jotunn"
        preg_match_all('/\] Loading \[(.+?) ([^ \]]+)\](?: \(([^)]*)\))?/', $contents, $loaded, PREG_SET_ORDER);
        foreach ($loaded as $match) {
            $status['loaded'][] = ['name' => $match[1], 'version' => $match[2], 'guid' => $match[3] ?? ''];
        }
        preg_match_all('/Could not load \[(.+?) ([^ \]]+)\](?: \(([^)]*)\))? because (.+)$/m', $contents, $failed, PREG_SET_ORDER);
        foreach ($failed as $match) {
            $status['failed'][] = ['name' => $match[1], 'version' => $match[2], 'guid' => $match[3] ?? '', 'reason' => trim($match[4])];
        }

        return $status;
    }

    /**
     * When the server last started, so a mod installed later shows "restart to load". The log
     * keeps growing while the server runs, so its modified time is not the start, and the time
     * on BepInEx's first line is the game executable's date. The first Unity line comes right
     * after the plugins load: "[Info   : Unity Log] 10/23/2026 20:08:03: ...", in the
     * container's local time. Wings reports the file's modified time with that same zone's
     * offset, so borrow it.
     */
    private function startedAt(string $contents, ?string $modified): ?string
    {
        if (preg_match('/Unity Log\] (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/', $contents, $m) !== 1) {
            return null;
        }
        $offset = $modified !== null && preg_match('/([+-]\d{2}:\d{2}|Z)$/', $modified, $o) === 1 ? $o[1] : 'Z';

        return sprintf('%s-%s-%sT%s:%s:%s%s', $m[3], $m[1], $m[2], $m[4], $m[5], $m[6], $offset);
    }

    private function has(array $entries, string $name, bool $file): bool
    {
        return $this->entry($entries, $name, $file) !== null;
    }

    private function entry(array $entries, string $name, bool $file): ?array
    {
        foreach ($entries as $entry) {
            if (($entry['name'] ?? null) === $name && (bool) ($entry['file'] ?? false) === $file) {
                return $entry;
            }
        }

        return null;
    }
}
