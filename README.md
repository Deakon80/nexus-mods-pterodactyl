# Nexus Mods for Pterodactyl

A [Pterodactyl](https://pterodactyl.io) 2.0 panel extension that lets server owners search [Nexus Mods](https://www.nexusmods.com), install and remove mods on their game servers, and share the server's mod list with players as a Nexus Collection. Everyone signs in with their own Nexus Mods account.

- **Browse and search** a game's mods from the server's **Nexus Mods** tab. It opens on the 50 most-downloaded mods.
- **Install in one click** (Nexus Premium) or through guided steps (free accounts). Requirements listed on Nexus are installed too.
- **See what loaded.** The mod list and the Console page show whether each mod loaded, failed, or needs a restart. This is read from the BepInEx log.
- **Remove** a mod cleanly. The extension deletes exactly the folder it installed.
- **Share with players.** One button creates or updates a Nexus Collection of the server's mods, so players install the same set in Vortex or the Nexus Mods app.

## Privacy and fair use

- **API keys stay in the browser.** Each user's Nexus Mods API key is kept in their own browser: for the session only, or until they disconnect if they tick "Remember". The browser talks to Nexus directly. The panel never receives, stores, or logs the key, so not even the panel owner can see it.
- **Nexus's download rules apply.** Premium members get direct downloads. Free members download through Nexus's own "Mod Manager Download" button, exactly as they would with Vortex. Nothing works around Nexus Premium.
- **Mod files are never redistributed.** Players get mods through a Nexus Collection, from Nexus, with their own accounts. Mod authors keep their download counts and control of their files.

## Requirements

- **Panel:** Pterodactyl Panel **2.0** (beta), which has the extension system. Panel 1.x is not supported.
- **Wings:** Wings must be able to reach `*.nexus-cdn.com` and `*.nexusmods.com` over HTTPS to download mod files.
- **Game:** a game that loads mods with **BepInEx**. **Valheim** and **V Rising** are set up out of the box, and an admin can add other games.
- **Users:** each user needs a **Nexus Mods account** and its personal **API key**. Premium is optional.

## Installation

### 1. Download the extension

Go to this repository's [**Releases**](../../releases) page and download the latest `nexus-mods-<version>.pteroext` file.

### 2. Install it on the panel

**Option A: from the admin area (recommended)**

1. Sign in to your panel as an administrator.
2. Open the **Admin** area and go to **Extensions**.
3. Click **Install**.
4. Choose the `.pteroext` file you downloaded.
5. Tick **Enable after install**, then confirm.
6. Reload the panel in your browser (extensions load when the page loads).

**Option B: from the command line**

1. Copy the `.pteroext` file to the panel server, for example to `/tmp/`.
2. Run, from your panel directory (usually `/var/www/pterodactyl`):

   ```bash
   cd /var/www/pterodactyl
   sudo -u www-data php artisan p:extension:install /tmp/nexus-mods-1.0.1.pteroext --enable
   ```

   Use your web server's user in place of `www-data` if it is different (for example `nginx`).
3. Reload the panel in your browser.

Enabling the extension runs its database migrations automatically. You can check it is active with:

```bash
sudo -u www-data php artisan p:extension:list
```

### 3. Tag your game eggs

The extension finds a server's game through its egg's **tag**. Valheim (`valheim`) and V Rising (`v-rising`) are mapped already; their eggs just need the tag.

1. In the **Admin** area, open **Tags**. Create the tag if it does not exist yet, for example `valheim`.
2. Open **Eggs**, select your game's egg (for example *Valheim BepInEx*), and open its **Tags** tab.
3. Add the tag and save.

Every server created from that egg now shows a **Nexus Mods** tab.

### 4. Check or add game mappings (admin)

1. In the **Admin** area, open **Nexus Mods**.
2. Each row links an egg **tag** to a **Nexus Mods game** and an **install folder** (relative to the server's root):

   | Tag | Nexus game | Folder |
   |---|---|---|
   | `valheim` | Valheim | `BepInEx/plugins` |
   | `v-rising` | V Rising | `BepInEx/plugins` |

3. To add another game, click **Add a game**, pick the egg tag, click **Find** to search for the game by name, set the folder its mods go in, and save.

### 5. Give subusers access (optional)

Server owners and admins can use the tab straight away. For a subuser, open the server's **Users** page and give them:

- **Nexus Mods: manage**
- **File** permissions: **read**, **create** and **update**, plus **delete** if they should be able to remove mods.

## Using it

### Connect your Nexus Mods account

1. On Nexus Mods, open **Site preferences → API Keys** ([nexusmods.com/users/myaccount?tab=api](https://www.nexusmods.com/users/myaccount?tab=api)) and copy your **personal API key**.
2. Open your server in the panel and click the **Nexus Mods** tab.
3. Paste the key under **Connect your Nexus Mods account**. Tick **Remember on this browser** only on a computer you trust, then click **Connect**.

The panel shows your Nexus username and whether the account is Premium or Free.

### Install a mod

1. In the **Nexus Mods** tab, browse the most popular mods or search by name.
2. **Premium:** click a mod, choose a file (main files are listed first), and click **Install**. Any requirements are listed with it and installed too.
3. **Free account:** clicking a mod opens its page on Nexus Mods. To install it from the panel, click **Install** next to the mod and follow the steps. For each file, click **Mod Manager Download** on Nexus, copy the `nxm://` link, and paste it into the panel.
4. **Restart the server.** The mod's status changes from **Restart the server to load it** to **Loaded** once the server is back up. The page refreshes on its own.

Installed mods show a green **Installed** button in the list, and are listed under **Installed from Nexus Mods** and at the bottom of the **Console** page.

### Remove a mod

Under **Installed from Nexus Mods**, click **Remove** next to the mod and confirm. Restart the server to unload it.

### Share the mods with players

1. At the top of the **Nexus Mods** tab, under **Share with players**, click **Create collection**.
2. When it finishes, the panel shows the collection's link. New collections and updates start as a **draft** that only you can see.
3. Open the link and **publish** the collection on Nexus Mods.
4. Send players the link. They click **Add to Vortex** (or the Nexus Mods app) and get every mod, each downloaded through their own account.

After you change the server's mods, click **Update collection** to add a new revision. Only the Nexus account that created a collection can update it.

Server settings files (for example in `BepInEx/config`) are not part of a Nexus mod. Share those separately if players need them.

## Known limitations

- Only the part of a mod archive that belongs in the game's mod folder is installed. Mods that also ship `BepInEx/config` or `BepInEx/patchers` files get their plugin installed but not those extra files.
- Mods installed by hand (through the File Manager or SFTP) are not listed as installed. They still count when the extension checks a new mod's requirements.
- Updates are not detected yet. To update a mod, install its newer file over it.

## Building from source

The frontend is built against the `@pterodactyl/sdk` package that ships inside the panel, so you need a Pterodactyl 2.0 panel checkout on the build machine.

1. Install **Node.js 20 or newer** and clone this repository.
2. Point the SDK dependency at your panel's SDK and install:

   ```bash
   npm pkg set 'devDependencies.@pterodactyl/sdk=file:/var/www/pterodactyl/packages/sdk'
   npm install --legacy-peer-deps
   ```

3. Check, test and build:

   ```bash
   npm run typecheck
   npx vitest run -c vitest.unit.config.mjs
   npm run build
   ```

4. From the panel directory, validate and package it:

   ```bash
   php artisan p:extension:doctor /path/to/nexus-mods
   php artisan p:extension:pack /path/to/nexus-mods
   ```

   The `.pteroext` file is written to the panel directory. Install it as in step 2 above.

### Project layout

| Path | What it is |
|---|---|
| `extension.json` | Extension manifest: screens, permissions, styling prefix |
| `src/NexusModsProvider.php` | Boots the extension: permissions and API routes |
| `src/Http/Controllers/` | Panel API: mod state, install, remove, collection, admin game mapping |
| `src/Services/Installer.php` | Downloads through Wings, unpacks, and places mods in the game folder |
| `src/Services/LoaderStatus.php` | Reads the BepInEx log for loaded and failed plugins |
| `src/Support/` | Game mapping and the URL/path safety checks |
| `src/client/` | React frontend: Nexus API client, screens, Console section, collections |
| `database/migrations/` | The extension's two tables (installed mods, shared collections) |

## Status

This extension is not affiliated with or endorsed by Nexus Mods. It is being submitted to Nexus Mods for registration as an application. Until then, it uses each user's personal API key, as Nexus allows.

## License

**Free for private and noncommercial use.** Personal use, hobby and community game servers, and noncommercial organizations can use, change and share this extension without charge, under the [PolyForm Noncommercial License 1.0.0](LICENSE).

**Commercial use needs a separate license.** Examples include running it as part of a paid game-server hosting business, or bundling it into a product or service you sell. To discuss licensing options, [open an issue](https://github.com/Deakon80/nexus-mods-pterodactyl/issues) or contact [Deakon80](https://github.com/Deakon80) on GitHub.

Version 1.0.0 was first published under the MIT License. Anyone who received it then keeps those rights for that version.
