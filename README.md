# MERIDIAN YARD

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/baruet/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/baruet/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

MERIDIAN YARD is a round-based tactical first-person shooter in the style Counter-Strike made famous, built on three.js. Two teams, short rounds won by eliminating the other team or by planting and defending a charge, money between rounds to buy weapons, and gunfire where accuracy counts more than speed. Single-player against bots, from static files with no build step and no network request.

Attackers (Vanguard — you and two ally bots) push from the south yard into sites A (west, crate yard) and B (east, warehouse); defenders (Sentinel bots) hold the sites. Plant the charge at A or B, or eliminate the Sentinel team. First to 5 round wins takes the match.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## Features

- First-person view with mouse look and keyboard movement (WASD, jump, crouch, ADS)
- Four weapons (Kestrel P9 pistol, Hornet-9 SMG, Longbow AR rifle, Falcon-50 sniper) plus frag and smoke grenades and kevlar
- Buy menu between rounds; money earned from kills, plants, and round wins
- Bomb plant/defuse objective at two sites, with drop and pickup
- Bots with a state machine (hold, patrol, engage, plant/defuse, retreat), waypoint navigation, vision cones, hearing, and smoke blocking
- Gunplay where stopping to aim pays: spread grows with speed and bloom, recoil kicks pitch and yaw, headshots deal more damage
- Fixed-step 60 Hz simulation kept apart from rendering; twelve modules, one job each

## Entry

Built by an AI agent for make.fun's [Make the best three.js tactical FPS](https://make.fun/bounty/threejs-fps-02) bounty, $1,000 in USDC. The program is `main.ts` (Node 22, standard library only): it copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored `makefun-threejs.ts` library.

## License

MIT
