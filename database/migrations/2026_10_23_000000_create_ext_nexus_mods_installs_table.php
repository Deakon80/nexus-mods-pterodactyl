<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ext_nexus_mods_installs', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->string('game_domain', 64);
            $table->unsignedBigInteger('mod_id');
            $table->unsignedBigInteger('file_id');
            $table->string('mod_name', 191);
            $table->string('file_name', 191);
            $table->string('version', 64)->nullable();
            // The one folder this install created, relative to the server root; removal deletes exactly it.
            $table->string('path', 255);
            $table->timestamps();

            $table->unique(['server_id', 'game_domain', 'mod_id']);
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ext_nexus_mods_installs');
    }
};
