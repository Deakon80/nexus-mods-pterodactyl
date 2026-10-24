<?php

namespace NexusMods;

use Pterodactyl\Extensions\ExtensionProvider;

class NexusModsProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerPermissions('Nexus Mods: install mods from Nexus Mods with your own Nexus account.', [
            'manage' => 'Search Nexus Mods and install or remove mods on this server. Also needs the file permissions.',
        ]);

        // Users' Nexus API keys are never sent here: each browser talks to Nexus
        // directly and only hands the panel the short-lived download link Nexus
        // returned, which Wings pulls. Game mappings are edited on Admin → Nexus Mods.
        $this->registerApiRoutes();
    }
}
