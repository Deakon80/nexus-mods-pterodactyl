<?php

namespace NexusMods\Support;

/**
 * Path and URL checks. Everything a user sends is validated here before Wings sees it.
 */
final class Paths
{
    /** Download hosts Nexus Mods serves files from. Anything else is refused. */
    private const array NEXUS_HOST_SUFFIXES = ['.nexus-cdn.com', '.nexusmods.com'];

    /** A relative folder inside the server, or null when it is unsafe. */
    public static function folder(string $folder): ?string
    {
        $folder = trim(str_replace('\\', '/', $folder), '/ ');
        if ($folder === '' || mb_strlen($folder) > 128) {
            return null;
        }
        foreach (explode('/', $folder) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..' || preg_match('/^[A-Za-z0-9 _.~-]+$/', $segment) !== 1) {
                return null;
            }
        }

        return $folder;
    }

    /** A single safe file or folder name made from free text. */
    public static function name(string $value, string $fallback): string
    {
        $name = trim((string) preg_replace('/[^A-Za-z0-9 _.-]+/', '', $value), ' .');

        return $name === '' ? $fallback : mb_substr($name, 0, 80);
    }

    /** Whether the URL is an https download link on a Nexus Mods host. */
    public static function isNexusDownload(string $url): bool
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            return false;
        }
        $host = mb_strtolower($parts['host'] ?? '');
        foreach (self::NEXUS_HOST_SUFFIXES as $suffix) {
            if (str_ends_with($host, $suffix)) {
                return true;
            }
        }

        return false;
    }

    /** Storage hosts Nexus Mods hands out presigned upload URLs for (S3-compatible). */
    private const array UPLOAD_HOST_SUFFIXES = ['.amazonaws.com', '.r2.cloudflarestorage.com', '.nexusmods.com'];

    /** Whether the URL is a presigned (AWS SigV4) https upload URL on a storage host Nexus Mods uses. */
    public static function isNexusUpload(string $url): bool
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            return false;
        }
        parse_str($parts['query'] ?? '', $query);
        if (! isset($query['X-Amz-Signature'], $query['X-Amz-Algorithm'])) {
            return false;
        }
        $host = mb_strtolower($parts['host'] ?? '');
        foreach (self::UPLOAD_HOST_SUFFIXES as $suffix) {
            if (str_ends_with($host, $suffix)) {
                return true;
            }
        }

        return false;
    }

    public static function join(string ...$parts): string
    {
        return '/'.implode('/', array_filter(array_map(fn (string $part): string => trim($part, '/'), $parts), fn (string $part): bool => $part !== ''));
    }
}
