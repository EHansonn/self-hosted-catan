# Crossroads operations

This page is a concise runbook for an existing Docker installation. See
[`HOSTING.md`](HOSTING.md) for initial setup, access choices and proxy guidance.

## Start, stop and inspect

```sh
docker compose up -d
docker compose stop
docker compose ps
docker compose logs --tail=100 game
docker stats self-hosted-crossroads-game-1 --no-stream
```

The health endpoint is `/api/health`. The container restarts automatically when
Docker starts. Sleeping or shutting down the host also stops access to the
game.

## Persistent data

The `self-hosted-crossroads_game-data` volume stores:

- `state.json`: rooms, anonymous session identifiers, standings, winner claims
  and the named Flock
- `access-key`: the generated room-creation password when no password is set in
  the environment

Writes replace the state snapshot atomically. Games and community history
survive ordinary process and container restarts. The same private browser
cookie and hostname restore the same identity; `localhost` and `127.0.0.1` are
different cookie hosts.

## Backup

Create a consistent private backup while the application is stopped:

```sh
mkdir -p backups
docker compose stop game
docker compose cp game:/app/data ./backups/crossroads-data
docker compose start game
```

The backup contains private game state and credentials. Do not commit or share
it. Do not run `docker compose down -v` unless all saved data should be erased.

## Recovery

If the server reports corrupt or unreadable data, keep a copy of the current
volume before restoring a known-good backup. Restore only while the application
is stopped. Copy `state.json` and `access-key` into `/app/data` and ensure they
are writable by the container's `node` user, UID 1000.

The server stops on invalid saved JSON instead of silently discarding games.
Atomic writes reduce the risk of partial snapshots but do not replace backups.

## Capacity and lifecycle

The supplied Compose files default to 256 MiB of memory, half a CPU core and 64
processes. The application supports 2–12 seats per room and limits rooms,
sessions, incoming messages and retained history. Increase the optional image
Compose limits with `GAME_MEMORY_LIMIT` and `GAME_CPU_LIMIT` if the host needs
different allocations.

Started games close after every human has been away for three minutes. A human
returning during that grace period cancels cleanup. Waiting lobbies remain
available. A disconnected player's seat can receive bot assistance while other
humans remain at the table.

Completed games record eligible results, close their room and show each active
player a final score breakdown until that player chooses **Done**. Spectators
can enter an in-progress game using its room code without receiving a seat or
private cards.

## Security and privacy

- The application is for trusted groups rather than hostile public
  matchmaking.
- The operator can read saved private hands and must be trusted.
- Room creation is protected by `ROOM_CREATE_PASSWORD`; joining and spectating
  use unpredictable room codes.
- Browser identities use anonymous private cookies and are not inferred from
  shared office or household IP addresses.
- Search crawler directives discourage indexing but are not access control.
- For public access, use HTTPS and configure the proxy settings described in
  [`HOSTING.md`](HOSTING.md).

## Updating

Update between games. For a source installation:

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
```

For a published image installation, follow the versioned update and rollback
instructions in [`HOSTING.md`](HOSTING.md).
