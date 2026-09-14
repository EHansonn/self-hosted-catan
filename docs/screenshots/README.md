# Screenshot automation

Run `npm run screenshots` from the repository root to rebuild the app and
replace all README screenshots. The script uses temporary, deterministic lobby
and mid-game data, forces light mode, and does not read or modify `data/`.

The generated files are:

- `home.png`
- `lobby-light.png`
- `game-2d-light.png`
- `game-3d-light.png`
- `mobile-light.png`, a phone-sized 2D game capture in a simple iPhone outline

If Chromium has not been installed for Playwright yet, run
`npx playwright install chromium` once.
