# Crossroads

A slop-AI-coded, self-hosted way to play a hex-based trading and settlement
game for free with friends and coworkers—without carrying a physical set or
depending on a hosted browser service.

## Screenshots

### Home screen

![Crossroads home screen in light mode](docs/screenshots/home.png)

### Game lobby

![A Crossroads lobby in light mode with a map preview and four seats](docs/screenshots/lobby.png)

### Game in progress

![A Crossroads game in progress using the 2D board in light mode](docs/screenshots/game-2d.png)

![A Crossroads game in progress using the 3D board in light mode](docs/screenshots/game-3d.png)

### Mobile

![Crossroads home and in-progress game views shown inside phone frames](docs/screenshots/mobile.png)

## Commands

Start or rebuild the game:

```sh
docker compose up -d --build
```

Open `http://localhost:8080`.

Show the room-creation password:

```sh
docker compose exec -T game cat /app/data/access-key
```

View logs:

```sh
docker compose logs -f game
```

Stop the game without deleting its data:

```sh
docker compose stop
```

For LAN, remote, HTTPS, update and backup options, see
[`HOSTING.md`](HOSTING.md).
