<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The Nexus Collection a server's mods were shared as, so later clicks add revisions to it.
        Schema::create('ext_nexus_mods_collections', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id')->unique();
            $table->string('collection_id', 32);
            $table->string('slug', 64);
            $table->string('owner', 64);
            $table->unsignedInteger('revision_number')->default(1);
            $table->string('revision_status', 16)->default('draft');
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ext_nexus_mods_collections');
    }
};
