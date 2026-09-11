import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyCommunity,
  hydrateCommunity,
  nameWinnerSheep,
  recordOfficialGame,
  viewCommunity,
  type OfficialGameResult,
} from "../shared/community";

const result = (changes: Partial<OfficialGameResult> = {}): OfficialGameResult => ({
  matchId: "match-1",
  roomCode: "ABC123",
  completedAt: 1_700_000_000_000,
  eligible: true,
  winnerId: "p1",
  players: [
    { id: "p1", name: "Casey", points: 10, bot: false },
    { id: "p2", name: "Maya", points: 7, bot: false },
    { id: "p3", name: "Noah", points: 6, bot: false },
    { id: "p4", name: "Ari", points: 5, bot: false },
  ],
  ...changes,
});

test("official results update the global leaderboard exactly once", () => {
  const community = emptyCommunity();
  assert.equal(recordOfficialGame(community, result()), true);
  assert.equal(recordOfficialGame(community, result()), false);
  assert.equal(community.totalGames, 1);
  const view = viewCommunity(community, "p2");
  assert.deepEqual(
    view.leaderboard.map(({ name, wins, games, points }) => ({
      name,
      wins,
      games,
      points,
    })),
    [
      { name: "Casey", wins: 1, games: 1, points: 10 },
      { name: "Maya", wins: 0, games: 1, points: 7 },
      { name: "Noah", wins: 0, games: 1, points: 6 },
      { name: "Ari", wins: 0, games: 1, points: 5 },
    ],
  );
  assert.equal(view.pendingSheep.length, 0);
  assert.equal(viewCommunity(community, "p1").pendingSheep.length, 1);
});

test("bot takeovers do not disqualify an official game", () => {
  const community = emptyCommunity();
  assert.equal(
    recordOfficialGame(
      community,
      result({ players: [...result().players.slice(0, 3), { id: "bot", name: "Mira", points: 4, bot: true }] }),
    ),
    true,
  );
  assert.equal(community.totalGames, 1);
  assert.equal(community.scores.find((score) => score.name === "Mira")?.games, 1);
});

test("ineligible and two-player games stay out of community history", () => {
  const community = emptyCommunity();
  assert.equal(recordOfficialGame(community, result({ eligible: false })), false);
  assert.equal(
    recordOfficialGame(
      community,
      result({
        matchId: "match-2",
        players: result().players.slice(0, 2),
      }),
    ),
    false,
  );
  assert.equal(community.totalGames, 0);
  assert.deepEqual(community.scores, []);
});

test("only the winner can use a naming right and each sheep is named once", () => {
  const community = emptyCommunity();
  recordOfficialGame(community, result());
  assert.throws(
    () => nameWinnerSheep(community, "p2", "match-1", "Wooliam", 2),
    /Only this game's winner/,
  );
  const sheep = nameWinnerSheep(
    community,
    "p1",
    "match-1",
    "  Wooliam  ",
    2,
  );
  assert.equal(sheep.name, "Wooliam");
  assert.equal(sheep.winner, "Casey");
  assert.equal(viewCommunity(community, "p1").pendingSheep.length, 0);
  assert.throws(
    () => nameWinnerSheep(community, "p1", "match-1", "Again", 3),
    /Only this game's winner/,
  );
});

test("sheep names are bounded, meaningful, unique and restart-safe", () => {
  const community = emptyCommunity();
  recordOfficialGame(community, result());
  assert.throws(
    () => nameWinnerSheep(community, "p1", "match-1", "---", 2),
    /letter or number/,
  );
  nameWinnerSheep(community, "p1", "match-1", "Baa-rbara", 2);
  recordOfficialGame(
    community,
    result({ matchId: "match-2", completedAt: 3_000 }),
  );
  assert.throws(
    () => nameWinnerSheep(community, "p1", "match-2", "baa-RBARA", 4),
    /already in the flock/,
  );
  const restored = hydrateCommunity(JSON.parse(JSON.stringify(community)));
  assert.equal(restored.totalGames, 2);
  assert.equal(restored.flock[0].name, "Baa-rbara");
  assert.equal(viewCommunity(restored, "p1").pendingSheep.length, 1);
});
