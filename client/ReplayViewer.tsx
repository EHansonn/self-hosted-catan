import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { BoardView } from "./Board";
import { DevelopmentCard, GameCard } from "./GameUI";
import { developmentCardCounts } from "./developmentCards";
import { RESOURCES, type PublicPlayer } from "../shared/game";
import { resourceName } from "../shared/resources";
import type { ReplayPayload } from "../shared/replay";

export function ReplayViewer({ replay, onClose }: { replay: ReplayPayload; onClose: () => void }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const logRef = useRef<HTMLOListElement>(null);
  const frame = replay.frames[position];
  const last = replay.frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPosition((current) => Math.min(current + 1, last));
    }, 650 / speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, last]);
  useEffect(() => {
    if (position >= last && playing) setPlaying(false);
  }, [position, last, playing]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  const board = useMemo(() => ({
    ...replay.board,
    vertices: replay.board.vertices.map((vertex, index) => ({
      ...vertex,
      owner: frame.buildings[index][0] === null ? null : `p${frame.buildings[index][0]}`,
      city: frame.buildings[index][1],
    })),
    edges: replay.board.edges.map((edge, index) => ({
      ...edge,
      owner: frame.roadOwners[index] === null ? null : `p${frame.roadOwners[index]}`,
    })),
  }), [replay.board, frame]);
  const players = useMemo<PublicPlayer[]>(() => replay.players.map((player, index) => ({
    id: `p${index}`,
    name: player.name,
    color: player.color,
    bot: frame.players[index].bot,
    difficulty: "normal",
    connected: false,
    knights: frame.players[index].knights,
    roadLength: frame.players[index].roadLength,
    playedDev: false,
    points: frame.players[index].points,
    cardCount: frame.players[index].cardCount,
    devCount: frame.players[index].devCount,
  })), [replay.players, frame]);
  const history = useMemo(() => replay.frames.slice(0, position + 1).flatMap((item) => item.entries), [replay.frames, position]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [position]);
  const active = players[frame.current];
  const inspected = frame.players[selectedPlayer];
  const inspectedName = replay.players[selectedPlayer].name;
  const developmentCards = developmentCardCounts(inspected.developmentCards.map((type) => ({ type })));

  return <section className="replay-screen" role="dialog" aria-modal="true" aria-labelledby="replay-title">
    <header className="replay-header">
      <div>
        <small>SERVER-VERIFIED REPLAY · {replay.roomCode}</small>
        <h2 id="replay-title">Game replay</h2>
      </div>
      <button className="icon-btn" type="button" aria-label="Close replay" onClick={onClose}><X /></button>
    </header>
    <div className="replay-main">
      <div className="replay-board">
        <BoardView board={board} players={players} robber={frame.robber} highlights={[]} kind={null}
          onPick={() => {}} roll={frame.dice.reduce((a, b) => a + b, 0)} mode={mode} onMode={setMode} />
      </div>
      <aside className="replay-sidebar">
        <div className="replay-turn">
          <strong>{frame.phase === "finished" ? `${replay.players[replay.winner!].name} wins` : `${active.name}'s turn`}</strong>
          <span>Turn {frame.turn || "setup"} · {frame.phase.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
        </div>
        <h3>Players</h3>
        <ol className="replay-players">{players.map((player, index) => <li key={player.id}>
          <button className="replay-player-button" type="button" aria-label={`Inspect ${player.name}'s hand`}
            aria-pressed={selectedPlayer === index} onClick={() => setSelectedPlayer(index)}>
            <span className="replay-player-color" style={{ backgroundColor: player.color }} />
            <span>{player.name}{player.bot ? " (bot)" : ""}</span>
            <b>{player.points} pts</b>
            <small>{player.cardCount} cards · {player.devCount} development</small>
          </button>
        </li>)}</ol>
        <section className="replay-hand" aria-label={`${inspectedName}'s hand at step ${position + 1}`}>
          <h3>{inspectedName}'s hand</h3>
          <small>At this step · {inspected.cardCount} resources · {inspected.devCount} development</small>
          <div className="replay-hand-group" aria-label="Resource cards">
            {RESOURCES.filter((resource) => inspected.resources[resource] > 0).map((resource) =>
              <GameCard key={resource} resource={resource} count={inspected.resources[resource]}
                label={`${inspected.resources[resource]} ${resourceName(resource)}`} />)}
            {inspected.cardCount === 0 && <span className="replay-hand-empty">No resource cards</span>}
          </div>
          <div className="replay-hand-group" aria-label="Development cards">
            {developmentCards.map(({ type, count }) => <DevelopmentCard key={type} type={type} count={count} />)}
            {inspected.devCount === 0 && <span className="replay-hand-empty">No development cards</span>}
          </div>
        </section>
        <h3>Game log</h3>
        <ol ref={logRef} className="replay-log" aria-label="Game log through selected step">
          {history.map((entry) => <li key={entry.id}>{entry.text}</li>)}
        </ol>
      </aside>
    </div>
    <footer className="replay-controls">
      <button type="button" aria-label="Previous step" disabled={position === 0} onClick={() => { setPlaying(false); setPosition(position - 1); }}><ChevronLeft /></button>
      <button type="button" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => { if (position === last) setPosition(0); setPlaying(!playing); }}>{playing ? <Pause /> : <Play />}</button>
      <button type="button" aria-label="Next step" disabled={position === last} onClick={() => { setPlaying(false); setPosition(position + 1); }}><ChevronRight /></button>
      <input type="range" min={0} max={last} value={position} aria-label="Replay step" onChange={(event) => { setPlaying(false); setPosition(Number(event.target.value)); }} />
      <span>Step {position + 1} / {replay.frames.length}</span>
      <label>Speed <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
        <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
      </select></label>
    </footer>
  </section>;
}
