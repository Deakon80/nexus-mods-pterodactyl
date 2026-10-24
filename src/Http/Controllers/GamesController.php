<?php

namespace NexusMods\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\Endpoint;
use NexusMods\Support\GameMap;
use Pterodactyl\Models\Tag;

/** Admin → Nexus Mods: which panel games map to which Nexus Mods games. Root admins only (admin API stack). */
class GamesController
{
    #[Endpoint('List Nexus game mappings', 'The configured rows, the egg tags they can use, and folder presets for known Nexus games.')]
    public function index(): JsonResponse
    {
        return new JsonResponse([
            'rows' => GameMap::rows(),
            'tags' => Tag::query()->whereHas('eggs')->orderBy('slug')->get()->map(fn (Tag $tag): array => [
                'slug' => mb_strtolower($tag->slug),
                'name' => $tag->effectiveName(),
            ])->values()->all(),
            'presets' => GameMap::FOLDER_PRESETS,
        ]);
    }

    #[Endpoint('Save Nexus game mappings', 'Replaces every row.')]
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rows' => ['present', 'array', 'max:100'],
            'rows.*.tag' => ['required', 'string', 'max:64'],
            'rows.*.domain' => ['required', 'string', 'regex:/^[a-z0-9]{1,64}$/'],
            'rows.*.name' => ['nullable', 'string', 'max:120'],
            'rows.*.folder' => ['required', 'string', 'max:128'],
        ]);

        $rows = [];
        $seen = [];
        foreach ($data['rows'] as $index => $row) {
            $clean = GameMap::clean($row);
            if ($clean === null) {
                throw ValidationException::withMessages(["rows.$index.folder" => 'Use a folder inside the server, like BepInEx/plugins, without ".." or a leading slash.']);
            }
            if (isset($seen[$clean['tag']])) {
                throw ValidationException::withMessages(["rows.$index.tag" => 'Each panel game can only be mapped once.']);
            }
            $seen[$clean['tag']] = true;
            $rows[] = $clean;
        }

        GameMap::save($rows);

        return $this->index();
    }
}
