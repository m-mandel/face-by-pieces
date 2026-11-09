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

The **Ink** interface shows **Face x of 5** above the centered **Guess Who?** title, with a step counter at the top right. Every round uses **Sequence** mode and **Line art**, drawing from all available faces. The counter starts at **Step 1**, increases with each clue reveal, and resets for a new round. On narrow screens, the centered title sits just below the step counter. The sketch fills the space between the header and the bottom controls: a green **next clue** button and a name field that reveals a blue **Submit** button while editing. On desktop, the centered name field is at most 520px wide with more space below it; mobile keeps the full-width layout.

New players first see a **How to play** popup explaining that the goal is to guess each face in as few steps as possible and that each game has **5 faces**. **Start playing** (or Escape) opens the first face directly. No portrait loads or game session starts while the instructions are open. Instructions appear once per browser player ID; a new ID or cleared browser storage shows them again. The modal keeps keyboard focus inside until the player starts.

There is no category picker or category button. Returning players who completed the old category setup continue straight into the game, and their saved category no longer filters the faces. Each game uses five distinct faces when enough portraits are available.

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

Each game has five faces. Submitting a name ends that face and advances to the next; scores and names are shown in the results gallery after the fifth face. Steps count the drawing clues used.

In the results gallery, **Retrace your steps** replays the selected face's drawing clues. The stars remain in face order, and **Play again** starts a new five-face game.

At the last drawing clue, **I don't know :(** immediately opens the current face's source photo and asks whether the player recognizes the person. **Yes** keeps the photo visible and opens another name input. The round stays **Incorrect** even if the photo answer is correct: stars and scores reflect identification from the sketch. The result subtitle reports **Photo answer: Correct** or **Photo answer: Incorrect** for submitted names. **No**, or **I still don't know**, displays **Photo answer: did not know**. Names and scores stay hidden until the final gallery, and the clue count still reflects drawing clues.

Photos are discovered from `data/sources/<subject-id>/source.png` (also `.jpg`, `.jpeg`, or `.webp`). Rebuild after adding photos and include the source-photo directory when deploying. Missing or failed photos allow the player to continue, with an unavailable recognition response rather than a false No; failed downloads can also be retried. A pending download offers **Continue without photo**.

## Answer aliases

Additional accepted spellings are listed by subject ID in [`src/config/subject-aliases.json`](src/config/subject-aliases.json). Every catalog subject has a curated list, including the 88 playable line-art subjects. These variants are added to the subject's canonical name and existing aliases. For example, Serena Williams accepts both `Wiliams` and `Serena Wiliams`; Albert Einstein accepts `Einstien` and `Albert Einstien`.

Matching ignores capitalization, accents, spaces, and punctuation. Name words can appear in any order: **Pitt Brad** is Correct for **Brad Pitt**. Canonical names, correctly spelled surnames, original correctly spelled aliases, and the nicknames in [`src/config/subject-correct-aliases.json`](src/config/subject-correct-aliases.json) receive **Correct**. For example, **The Rock**, **Johnson**, and **J.Lo** are valid aliases. Reordered misspellings in the typo list remain Inaccurate. Suffixes such as `Jr` are not valid answers by themselves. The original submitted text is retained in activity records.

Misspellings listed in `subject-aliases.json` and new close spellings receive **Inaccurate**, a blue star in that face's position, and **Did you mean Novak Djokovic? You guessed Jokoviz**. For example, `Einstien` is now Inaccurate rather than Correct. Correct answers keep gold stars; incorrect or skipped answers keep outline stars. The five-face summary counts correct and inaccurate answers separately.

Similarity uses Damerau–Levenshtein distance: at most two edits and a distance of at most 25% of the longer normalized name, with at least four characters in both names (so `bolts` can match `Bolt`). Only correctly spelled aliases are fuzzy-matched, never the generated typo list. A new fuzzy guess that matches another catalog subject as well or better is Incorrect. These rules estimate spelling similarity, not a player's intent. Adjust defaults in `src/nameSimilarity.js`; the CLI uses the same rules:

```bash
npm run compare:names -- "Jokoviz" "Novak Djokovic" "Djokovic"
```

Add legitimate nicknames to `subject-correct-aliases.json` and known misspellings to `subject-aliases.json`, then rebuild. Add full-name and surname variants separately when both should count. `npm test` checks spelling classification, catalog coverage, normalization, photo recognition and round transitions.

## Activity recording

The browser creates two pseudonymous identifiers:

- A persistent device ID in local storage links rounds played in the same browser.
- A new session ID identifies each game round.

The server records the portrait, mode, exact elements shown initially and after every refresh, submitted response, outcome, and canonical step count. A step is one refresh or the final submitted guess. Data is stored in `storage/game-activity.sqlite` by default.

The API returns only `correct`, `inaccurate`, and `incorrect`, with an `inaccurateSessions` summary count. Old clients submitting `partial` are accepted as `inaccurate`. Existing `partial_match` flags are presented as inaccurate without rewriting historical rows; raw SQL must check this flag because the original binary `outcome` column stores these answers as `incorrect`.

`photoRecognized` records the player's Yes/No response, separately from whether their photo guess was right. `photoOutcome` preserves the photo grade (`correct`, `inaccurate`, `incorrect`, or null if unavailable/unanswered). `answeredFromPhoto` identifies a name entered after recognizing the photo. `resultCategory` is stored as **incorrect sketch-correct photo** or **incorrect sketch-incorrect photo**; inaccurate photo guesses go in the second category while retaining their detailed spelling grade. Missing/unavailable photos have no photo category. Both categories count toward `incorrectSessions`, with their own counts in the summary.

Skipping a photo and submitting a wrong photo guess both retain the `incorrect` photo grade and **incorrect sketch-incorrect photo** category. The stored fields distinguish them: **No** has `photoRecognized: false` and an empty `submittedAnswer`; **I still don't know** has `photoRecognized: true` and an empty `submittedAnswer`; a wrong photo guess has `photoRecognized: true` and the submitted name. The results subtitle uses this distinction without changing sketch scores or historical records.

`npm run report` includes the result category and photo grade. Deploy the rebuilt frontend and restart the updated server. Startup adds `photo_outcome` and `result_category`, preserves the photo grade of identifiable historical photo rounds, and corrects those rounds' sketch scores to Incorrect. Historical sketch-only rows and raw events remain unchanged. The server also enforces this scoring for cached clients using the previous format.

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
