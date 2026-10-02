# Face by Pieces

A mobile-first portrait guessing game built from transparent PNG layers in `data/line-art/`, with legacy SVG styles and server-side session and activity recording.

## Run locally

```bash
npm install
npm run build
cp .env.example .env
npm run dev
```

Set `ADMIN_TOKEN` in `.env` to a long random value before sharing or deploying the app. `npm run dev` starts both the Vite browser app and the activity API.

Open the local address shown by Vite. Other phones on the same network can use the network address when the development server is started with:

```bash
npm run dev -- --host
```

## Production build

```bash
npm run build
npm start
```

The server hosts the production build from `dist/` and listens on `PORT` (8080 by default).

## Interface designs

The default **Ink** interface shows **Guess Who?** with **Mode** and **Style** dropdown buttons together at the top left and a simple step counter at the top right. The counter starts at **Step 1**, increases with each clue refresh, and resets for a new round. On narrow screens, the centered title sits just below these controls. The sketch fills the space between the header and the bottom controls: a round clue button and a name field with a submit button. The Mode menu offers 1, 2, or 4 clues and Sequence mode. The Style menu offers Line art, Abstract color, and Vector lines. Selecting an option applies it immediately and starts a fresh round when the choice changes.

Line-art portraits fit the combined visible bounds of every eligible PNG layer. Transparent and pure-white margins are removed from the displayed viewport, with one source pixel of padding for edge antialiasing. All layers retain their original alignment, and the viewport stays fixed as clues change. `npm run dev:client` and `npm run build` automatically generate a small bounds manifest from the PNGs, so the browser only needs to download and decode the selected clues before displaying the drawing. The clue button is disabled and grey while those layers load. After the first clue, the current drawing stays visible until the next layer set is ready. Sequence additions fade in over 180 ms while existing layers stay in place; shuffled sets swap together without a blank frame. The fade respects reduced-motion preferences. A failed download keeps the current drawing visible and enables a retry of the same step without adding to the step count. Original PNG files remain unchanged.

After the first clue appears, the remaining eligible layers for that portrait preload in the background, two at a time with low fetch priority. Selecting a layer that is still preloading shares its pending download. Background failures do not interrupt play, and selecting a failed layer retries it normally. Changing portraits or leaving the view stops queued preloads; in-flight downloads may finish, and decoded images are not retained by the loader after completion.

The generated manifest in `src/generated/` is ignored by Git and recreated during each build using the pure JavaScript `pngjs` development dependency. Run `npm run prepare:portraits` (or restart the dev client) after changing PNGs or pixel-count reports during development. If the layer list no longer matches the manifest, the browser measures that portrait as a fallback; unusable bounds retain the full image canvas.

The previous colorful interface is preserved in `src/legacy/LegacyApp.jsx` and `src/legacy/styles.css`. Each interface loads its own stylesheet and uses the same portrait catalog, layer filter, and activity API.

- Open `/?ux=ink` to use the new design.
- Open `/?ux=legacy` to restore the original design.
- The Style dropdown links to the legacy interface; the legacy Game mode panel links back to Ink.

The choice is remembered in `face-by-pieces-ux` local storage. Switching interfaces reloads the app and starts a new round. Portrait style and game mode preferences carry across. To change the default for everyone, update the fallback in `src/main.jsx`.

## Game modes

- **1 clue:** shows one random layer per refresh.
- **2 clues:** shows two random layers per refresh.
- **4 clues:** shows four random layers per refresh.
- **Sequence:** begins with one layer and reveals one additional random layer on every refresh, until all eligible layers are visible. This is called **Progressive** in the legacy interface and retains the `progressive` ID in saved preferences and activity records.

## Portrait styles

- **Line art (default):** automatically discovers portraits in `data/line-art/`. Each PNG in a portrait's `transparent/` folder is a separate layer, aligned at its original aspect ratio over a pure white background. Layers with fewer than 200 pixels in `report.json`'s `class_pixels` are excluded entirely, including random clues, progressive mode, the full reveal, and replay. Exactly 200 pixels is eligible. Files in `masks/`, `white/`, and contact sheets are not used. All 31 supplied portraits are available.
- **Vector lines (legacy):** uses the portraits in `data/vector-lines/` and preserves the original SVG element reveal behavior.
- **Abstract color (legacy):** uses the available portraits in `data/svg/`. The background, face base, and clothing base are always visible at step 0. Face and clothing details share one clue pool, retaining the existing SVG grouping behavior.

Add new line-art portraits as `data/line-art/<person-name>/transparent/*.png`, alongside their `report.json` pixel counts. All layers for a portrait should share the same canvas dimensions. Both hyphens and underscores in folder names are supported. The catalog is discovered at build time; rebuild the app and restart the server after adding portraits. If a report or a layer's pixel count is missing, that PNG remains eligible.

Line art is also the starting style for browsers with an older saved SVG preference. Subsequent choices are remembered under the updated style preference key.

Changing style starts a new round, resets the non-repeating face deck, and limits the deck to portraits available in that style.

Steps are counted during the round and displayed on the result screen. Each refresh is a step, and the submitted guess is the final step. Submitting an incorrect name ends the round and reveals the answer; the next portrait can then be started with **Play another face**.

After a round, **Retrace your clues** opens **Round Replay**, with a large portrait between a compact header and the playback controls. Every frame uses **Step 1**, **Step 2**, and so on, matching the in-game counter in all modes, including Sequence. The caption shows the current step, total steps, and cumulative number of unique clues shown through the selected step. Repeated clues count once, and moving backward excludes clues first shown at later steps. The portrait still displays the original layer set for that step. Players can select a numbered step or move backward or forward. The back button returns to the reveal screen, where **Play another face** starts the next round.

## Activity recording

The browser creates two pseudonymous identifiers:

- A persistent device ID in local storage links rounds played in the same browser.
- A new session ID identifies each game round.

The server records the portrait, mode, exact elements shown initially and after every refresh, submitted response, outcome, and canonical step count. A step is one refresh or the final submitted guess. Data is stored in `storage/game-activity.sqlite` by default.

`npm run report` displays element history in chronological form:

```text
Initial [#3, #6] → R1 [#2, #5] → R2 [#1, #7]
```

For line art, report numbers are one-based positions in the alphabetically sorted PNG filenames after filtering out layers below 200 pixels. For legacy styles, they refer to the SVG's revealable elements. The protected JSON API returns the same positions as zero-based `visibleElementIndices`, which can be used directly by the game code.

The device ID identifies a browser installation rather than a person. Clearing browser data, changing browsers, or using private browsing creates a new ID. Different people sharing one browser use the same ID.

View a summary and the 50 most recent sessions directly on the server:

```bash
npm run report
```

Or use the protected reporting API:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/admin/summary

curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "http://localhost:8080/api/admin/sessions?limit=100"
```

Individual event timelines are available at `/api/admin/sessions/SESSION_ID/events` with the same authorization header.

## Deployment storage

The SQLite database is a good fit for a DigitalOcean Droplet because its filesystem is persistent. Keep `DATA_DIR` on persistent storage and back it up.

Do not use the default ephemeral filesystem of a stateless app host for this database: a redeploy could erase it. For a platform without persistent storage, replace SQLite with a managed database before collecting real activity.
