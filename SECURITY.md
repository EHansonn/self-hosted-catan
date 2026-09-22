# Security

## Supported version

Security fixes are made on the current `main` branch and included in subsequent
versioned container releases. Self-hosters should keep the application, Docker
Engine and host operating system current.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting when it is available. If
the repository has not enabled it yet, open a public issue asking for a private
contact channel without including vulnerability details. Do not disclose a
vulnerability publicly when it could put a running server or its players at
risk.

Include the affected version, deployment method, reproduction steps and likely
impact. Remove room-creation passwords, session cookies, tunnel tokens, saved
game data and other private values from screenshots and logs.

## Deployment boundary

The application is intended for a trusted group rather than hostile public
matchmaking. Anyone with a room code can enter its lobby or spectate an active
game. Six-character room codes are invitations, not passwords; avoid sharing
them publicly. Use HTTPS for access over untrusted networks, keep the room-creation
password private, and do not expose the application container directly when
proxy-header trust is enabled.
