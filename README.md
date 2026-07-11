# Face by Pieces

A mobile-first portrait guessing game built from the SVG artwork in `data/vector-lines/`, with server-side session and activity recording.

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

## Game modes

- **1 element:** shows one random top-level SVG element per refresh.
- **2 elements:** shows two random elements per refresh.
- **4 elements:** shows four random elements per refresh.
- **Progressive:** begins with one element and reveals one additional random element on every refresh.

## Portrait styles

- **Vector lines:** uses all six portraits in `data/vector-lines/` and preserves the original top-level-element reveal behavior.
- **Abstract color:** uses the available portraits in `data/svg/`. The background, face base, and clothing base are always visible at step 0. All direct children from `face-details` and `clothing-details` form one shared, uniformly sampled clue pool. A refresh can therefore reveal face details, clothing details, or any mixture according to the selected mode.

Changing style starts a new round, resets the non-repeating face deck, and limits the deck to portraits available in that style.

Steps are counted during the round and displayed on the result screen. Each refresh is a step, and the submitted guess is the final step. Submitting an incorrect name ends the round and reveals the answer; the next portrait can then be started with **Play another face**.

After a round, **Retrace your clues** opens an optional visual timeline of the initial element set and every refresh. Players can move through the reconstructed SVG frames and return to the normal result screen.

## Activity recording

The browser creates two pseudonymous identifiers:

- A persistent device ID in local storage links rounds played in the same browser.
- A new session ID identifies each game round.

The server records the portrait, mode, exact elements shown initially and after every refresh, submitted response, outcome, and canonical step count. A step is one refresh or the final submitted guess. Data is stored in `storage/game-activity.sqlite` by default.

`npm run report` displays element history in chronological form:

```text
Initial [#3, #6] → R1 [#2, #5] → R2 [#1, #7]
```

The report numbers are one-based positions in the portrait SVG's top-level revealable elements. The protected JSON API returns the same positions as zero-based `visibleElementIndices`, which can be used directly by the game code.

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
