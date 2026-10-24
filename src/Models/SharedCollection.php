<?php

namespace NexusMods\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $server_id
 * @property string $collection_id
 * @property string $slug
 * @property string $owner
 * @property int $revision_number
 * @property string $revision_status
 */
class SharedCollection extends Model
{
    protected $table = 'ext_nexus_mods_collections';

    protected $fillable = ['server_id', 'collection_id', 'slug', 'owner', 'revision_number', 'revision_status'];

    public function toApi(): array
    {
        return [
            'collection_id' => $this->collection_id,
            'slug' => $this->slug,
            'owner' => $this->owner,
            'revision_number' => (int) $this->revision_number,
            'revision_status' => $this->revision_status,
            'updated_at' => $this->updated_at?->toAtomString(),
        ];
    }
}
