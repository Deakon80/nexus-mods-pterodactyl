<?php

use Illuminate\Support\Facades\Route;
use NexusMods\Http\Controllers\ModsController;

// Mounted at /api/client/servers/{server}/extensions/nexus-mods
Route::get('/', [ModsController::class, 'index'])->middleware('throttle:60,1,nxm-read')->name('index');
Route::post('/install', [ModsController::class, 'install'])->middleware('throttle:10,1,nxm-install')->name('install');
Route::put('/collection', [ModsController::class, 'saveCollection'])->middleware('throttle:20,1,nxm-collection')->name('collection');
Route::post('/collection/upload', [ModsController::class, 'uploadCollection'])->middleware('throttle:10,1,nxm-upload')->name('collection.upload');
Route::delete('/installed/{install}', [ModsController::class, 'destroy'])->whereNumber('install')->middleware('throttle:20,1,nxm-remove')->name('remove');
