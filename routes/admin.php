<?php

use Illuminate\Support\Facades\Route;
use NexusMods\Http\Controllers\GamesController;

// Mounted at /api/admin/extensions/nexus-mods (root admins only)
Route::get('/games', [GamesController::class, 'index'])->name('games');
Route::put('/games', [GamesController::class, 'update'])->middleware('throttle:20,1,nxm-admin')->name('games.update');
