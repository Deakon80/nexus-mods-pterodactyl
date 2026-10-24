<?php

namespace NexusMods\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use NexusMods\Models\Install;
use NexusMods\Models\SharedCollection;
use NexusMods\Services\Installer;
use NexusMods\Services\LoaderStatus;
use NexusMods\Support\GameMap;
use NexusMods\Support\Paths;
use Pterodactyl\Models\Server;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ModsController
{
    public function __construct(private readonly Installer $installer, private readonly LoaderStatus $loader) {}

    #[Endpoint('Get Nexus Mods state', 'The Nexus game and install folder for this server, the mods installed through the extension, and what the mod loader reported on its last start.')]
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->ensureCan($request, $server, ['ext.nexus-mods.manage', 'file.read']);

        return new JsonResponse([
            'game' => GameMap::forServer($server),
            'installed' => Install::query()->where('server_id', $server->id)->orderBy('mod_name')->get()->map->toApi()->all(),
            'loader' => $this->loader->read($server),
            'collection' => SharedCollection::query()->where('server_id', $server->id)->first()?->toApi(),
        ]);
    }

    #[Endpoint('Remember the shared collection', 'Stores the Nexus Collection the browser created or updated for this server, so the next share adds a revision to it.')]
    public function saveCollection(Request $request, Server $server): JsonResponse
    {
        $this->ensureCan($request, $server, ['ext.nexus-mods.manage', 'file.read']);

        $data = $request->validate([
            'collection_id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
            'slug' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{1,64}$/'],
            'owner' => ['required', 'string', 'max:64'],
            'revision_number' => ['required', 'integer', 'min:1'],
            'revision_status' => ['required', 'string', 'in:draft,published,retracted'],
        ]);

        $collection = SharedCollection::query()->updateOrCreate(['server_id' => $server->id], $data);

        return new JsonResponse($collection->toApi());
    }

    #[Endpoint('Upload a collection package', 'Relays the collection package to the presigned Nexus Mods storage URL, for browsers that storage blocks. Only the package and the presigned URL pass through; the Nexus API key never does.')]
    #[BodyParam('url', 'string', 'The presigned_url from a Nexus Mods v3 upload session.', required: true)]
    #[BodyParam('filename', 'string', 'The filename the upload session was created with.', required: true)]
    #[BodyParam('content', 'string', 'The package, base64-encoded (at most 1 MB).', required: true)]
    public function uploadCollection(Request $request, Server $server): JsonResponse
    {
        $this->ensureCan($request, $server, ['ext.nexus-mods.manage', 'file.read']);

        $data = $request->validate([
            'url' => ['required', 'string', 'max:4096'],
            'filename' => ['required', 'string', 'regex:/^[A-Za-z0-9_.-]{1,128}$/'],
            'content' => ['required', 'string', 'max:1400000'],
        ]);

        if (! Paths::isNexusUpload($data['url'])) {
            $host = parse_url($data['url'], PHP_URL_HOST);
            throw new HttpException(422, 'That is not a Nexus Mods upload URL'.(is_string($host) ? " (host {$host})" : '').'.');
        }
        $bytes = base64_decode($data['content'], true);
        if ($bytes === false || $bytes === '') {
            throw new HttpException(422, 'The package is not valid base64.');
        }

        // The URL is presigned for exactly these headers; redirects are not followed.
        $response = Http::withOptions(['allow_redirects' => false])
            ->timeout(30)
            ->withHeaders([
                'Content-Disposition' => "attachment; filename=\"{$data['filename']}\"",
                'Content-MD5' => base64_encode(md5($bytes, true)),
            ])
            ->withBody($bytes, 'application/octet-stream')
            ->put($data['url']);

        if (! $response->successful()) {
            $code = preg_match('/<Code>([A-Za-z]+)<\/Code>/', $response->body(), $match) === 1 ? ": {$match[1]}" : '';
            throw new HttpException(502, "Nexus Mods storage refused the upload (HTTP {$response->status()}{$code}).");
        }

        return new JsonResponse(['ok' => true]);
    }

    #[Endpoint('Install a Nexus file', 'Downloads a file from a Nexus Mods download link into the server and installs it into its game folder.')]
    #[BodyParam('url', 'string', 'An https download link returned by the Nexus Mods API for the signed-in user.', required: true)]
    public function install(Request $request, Server $server): JsonResponse
    {
        $this->ensureCan($request, $server, ['ext.nexus-mods.manage', 'file.read', 'file.create', 'file.update']);

        $data = $request->validate([
            'url' => ['required', 'string', 'max:2048'],
            'mod_id' => ['required', 'integer', 'min:1'],
            'file_id' => ['required', 'integer', 'min:1'],
            'mod_name' => ['required', 'string', 'max:191'],
            'file_name' => ['required', 'string', 'max:191'],
            'version' => ['nullable', 'string', 'max:64'],
            'folder' => ['nullable', 'string', 'max:128'],
        ]);

        if (! Paths::isNexusDownload($data['url'])) {
            throw new HttpException(422, 'Only Nexus Mods download links can be installed.');
        }

        $game = GameMap::forServer($server) ?? throw new HttpException(422, 'This server\'s game is not set up for Nexus Mods. Ask an administrator to add it.');
        $folder = isset($data['folder']) && $data['folder'] !== '' ? Paths::folder($data['folder']) : $game['folder'];
        if ($folder === null) {
            throw new HttpException(422, 'That install folder is not allowed.');
        }

        $install = $this->installer->install($server, $request->user(), [
            'url' => $data['url'],
            'game_domain' => $game['domain'],
            'mod_id' => (int) $data['mod_id'],
            'file_id' => (int) $data['file_id'],
            'mod_name' => $data['mod_name'],
            'file_name' => $data['file_name'],
            'version' => $data['version'] ?? null,
            'folder' => $folder,
        ]);

        return new JsonResponse($install->toApi(), 201);
    }

    #[Endpoint('Remove an installed mod', 'Deletes the folder the extension created for the mod.')]
    public function destroy(Request $request, Server $server, int $install): JsonResponse
    {
        $this->ensureCan($request, $server, ['ext.nexus-mods.manage', 'file.read', 'file.delete']);

        $row = Install::query()->where('server_id', $server->id)->findOrFail($install);
        $this->installer->remove($server, $row);

        return new JsonResponse(status: 204);
    }

    private function ensureCan(Request $request, Server $server, array $permissions): void
    {
        foreach ($permissions as $permission) {
            abort_unless($request->user()->can($permission, $server), 403, 'You do not have permission to do that on this server.');
        }
    }
}
