# Face by Pieces

A mobile-first portrait guessing game built from transparent PNG layers in `data/line-art/`, with one layer revealed at a time and server-side session and activity recording.

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

The **Ink** interface shows **Guess Who?** with a **Categories** dropdown at the top left and a simple step counter at the top right. Every round uses **Sequence** mode and **Line art**; there are no mode or style selectors. The counter starts at **Step 1**, increases with each clue reveal, and resets for a new round. On narrow screens, the centered title sits just below these controls. The sketch fills the space between the header and the bottom controls: a round clue button and a name field with a submit button.

Players without a saved category choice for their browser's player ID first see a **Choose a category** popup. **All** is selected by default, and **Start playing** confirms the choice. No portrait loads or game session starts until confirmation. This popup appears once per player ID, rather than once per round; a new ID or cleared browser storage shows it again. Existing players also see it once when they first use this version. The modal supports keyboard selection and keeps focus inside until the player starts.

Categories filters line-art subjects using their `labels.json`: **All** includes every line-art subject; **Politics** matches `politics`; **Science & Technology** matches `science` or `technology`; **Film, Art & Music** matches `film`, `art`, or `music`; **Sports** matches `sports`. The choice is remembered per player ID for subsequent rounds and reloads, including changes made with the Categories dropdown during play. Changing category starts a new round and resets the non-repeating deck within that category. Subjects with multiple labels can appear in multiple groups, while unlabeled subjects remain available under All. Categories with no matching line-art portraits are disabled.

Line-art portraits fit the combined visible bounds of every eligible PNG layer. Transparent and pure-white margins are removed from the displayed viewport, with one source pixel of padding for edge antialiasing. All layers retain their original alignment, and the viewport stays fixed as clues change. `npm run dev:client` and `npm run build` automatically generate a small bounds manifest from the PNGs, so the browser only needs to download and decode the selected clues before displaying the drawing. The clue button is disabled and grey while those layers load. After the first clue, the current drawing stays visible until the next layer set is ready. Sequence additions fade in over 180 ms while existing layers stay in place. The fade respects reduced-motion preferences. A failed download keeps the current drawing visible and enables a retry of the same step without adding to the step count. Original PNG files remain unchanged.

After the first clue appears, the remaining eligible layers for that portrait preload in the background, two at a time with low fetch priority. Selecting a layer that is still preloading shares its pending download. Background failures do not interrupt play, and selecting a failed layer retries it normally. Changing portraits or leaving the view stops queued preloads; in-flight downloads may finish, and decoded images are not retained by the loader after completion.

The generated manifest in `src/generated/` is ignored by Git and recreated during each build using the pure JavaScript `pngjs` development dependency. Run `npm run prepare:portraits` (or restart the dev client) after changing PNGs or pixel-count reports during development. If the layer list no longer matches the manifest, the browser measures that portrait as a fallback; unusable bounds retain the full image canvas.

The previous colorful interface remains archived in `src/legacy/LegacyApp.jsx` and `src/legacy/styles.css`. It is no longer loaded by the app. Old `?ux=legacy` links and saved interface, mode, or style preferences open the same Sequence/Line art game.

## Sequence mode

Reveal order is configured in [`src/config/layer-order.json`](src/config/layer-order.json). Groups run from top to bottom. Within each group, `"ordered"` follows the listed order and `"random"` chooses an unrevealed layer at random until that group is exhausted:

1. `face-outline`
2. Random core features: `eyes`, `eyebrows`, `nose`, `mouth`, `hair`, `ears`
3. `facial-hair`, then `eyewear`
4. `face-details`
5. `body`
6. `headwear`, `earrings`, `necklace`, `face-piercings`, `accessories`, `unassigned`

The first clue follows the same order as subsequent clues. Missing layers and layers excluded by the pixel-count filter are skipped; a portrait without an eligible outline starts in the first available group. New layer names omitted from the configuration are revealed last, in catalog order. Edit the JSON and rebuild to change the deployed order. `npm test` checks the selection rules and coverage of every current portrait.

**Next clue** adds one previously hidden layer and keeps every existing layer visible. Once all eligible layers are revealed, the clue button is disabled. The catalog's layer indices and stacking order remain unchanged for activity recording and replay. Activity records use the existing `progressive` mode ID and `line-art` style ID.

## Line-art portraits

The game automatically discovers portraits in `data/line-art/`. Each PNG in a portrait's `transparent/` folder is a separate layer, aligned at its original aspect ratio over a pure white background. Layers with fewer than 200 pixels in `report.json`'s `class_pixels` are excluded entirely, including the initial clue, subsequent clues, the full reveal, and replay. Exactly 200 pixels is eligible. Files in `masks/`, `white/`, and contact sheets are not used. Archived SVG assets remain in `data/vector-lines/` and `data/svg/`, but subjects without line-art layers are not selected for play.

Add new line-art portraits as `data/line-art/<person-name>/transparent/*.png`, alongside their `report.json` pixel counts. All layers for a portrait should share the same canvas dimensions. Both hyphens and underscores in folder names are supported. The catalog is discovered at build time; rebuild the app and restart the server after adding portraits. If a report or a layer's pixel count is missing, that PNG remains eligible.

Steps are counted during the round and displayed on the result screen. Each refresh is a step, and the submitted guess is the final step. Submitting an incorrect name ends the round and reveals the answer; the next portrait can then be started with **Play another face**.

After a round, **Retrace your clues** opens **Round Replay**, with a large portrait between a compact header and the playback controls. Every frame uses **Step 1**, **Step 2**, and so on, matching the in-game counter. The caption shows the current step, total steps, and cumulative number of unique clues shown through the selected step. Moving backward excludes clues first shown at later steps. The portrait displays the original layer set for that step. Players can select a numbered step or move backward or forward. The back button returns to the reveal screen, where **Play another face** starts the next round.

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
