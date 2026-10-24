<?php

namespace NexusMods\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $server_id
 * @property int|null $user_id
 * @property string $game_domain
 * @property int $mod_id
 * @property int $file_id
 * @property string $mod_name
 * @property string $file_name
 * @property string|null $version
 * @property string $path
 */
class Install extends Model
{
    protected $table = 'ext_nexus_mods_installs';

    protected $fillable = ['server_id', 'user_id', 'game_domain', 'mod_id', 'file_id', 'mod_name', 'file_name', 'version', 'path'];

    protected function casts(): array
    {
        return ['mod_id' => 'integer', 'file_id' => 'integer'];
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'game_domain' => $this->game_domain,
            'mod_id' => $this->mod_id,
            'file_id' => $this->file_id,
            'mod_name' => $this->mod_name,
            'file_name' => $this->file_name,
            'version' => $this->version,
            'path' => $this->path,
            'installed_at' => $this->updated_at?->toAtomString(),
        ];
    }
}
