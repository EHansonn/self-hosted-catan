import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import {
  Anchor,
  ArrowRight,
  ArrowLeftRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Dices,
  Eye,
  Flag,
  HelpCircle,
  LockKeyhole,
  Link2,
  LogOut,
  MessageCircle,
  Moon,
  Palette,
  Pause,
  Play,
  Plus,
  Route,
  Settings2,
  Shield,
  Shuffle,
  Sparkles,
  Sun,
  Timer,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Check,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BoardPreview, BoardView, TERRAIN } from "./Board";
import { getAppName } from "./branding";
import { affordableBuildOptions } from "./buildDiscovery";
import { addCardToSelection } from "./cardSelection";
import { isNearLatest } from "./chatScroll";
import {
  developmentCardCounts,
  developmentResourceChoiceCount,
  isResourceChoiceDevelopmentCard,
  type ResourceChoiceDevelopmentCard,
} from "./developmentCards";
import { GameplayEffects } from "./GameplayEffects";
import { formatGameDuration } from "./duration";
import {
  deriveGameplayAnimation,
  type GameplayAnimationCue,
} from "./gameAnimations";
import { groupGameLog } from "./gameLog";
import { ActionTile, Avatar, CardRow, DevelopmentCard, Dice, EndTurnIcon, GameCard, LogMessage, OfferPanel, Sprite, TradeComposer } from "./GameUI";
import {
  getTurnAttention,
  playTurnNotification,
  shouldBringOwnTurnIntoView,
} from "./turnNotifications";
import { hasRemainingTurnAction } from "./turnActions";
import { orderPlayersForViewer } from "./playerOrder";
import {
  type RoomView,
  type ResumeRoomView,
  type GameResults,
  type Resource,
  type Hand,
  type Options,
  type Action,
  type Dev,
  type Phase,
  DEFAULT_OPTIONS,
  COLORS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  RESOURCES,
  COSTS,
  boardProfileForPlayers,
  makeBoard,
  mapGenerationRules,
  emptyHand,
  total,
} from "../shared/game";
import {
  type CommunityView,
  type PublicSheepNamingRight,
} from "../shared/community";

type Room = RoomView & { paused: boolean };
type Build = "road" | "settlement" | "city";
type Command = Record<string, unknown>;
type CommandResponse = {
  ok: boolean;
  error?: string;
  reason?: "stale";
  version?: number;
};
type CommandOptions = { retryStale?: boolean };
const PLAYER_COUNTS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, index) => MIN_PLAYERS + index,
);
const PLAYER_COLORS = [
  "Orange",
  "Aqua",
  "Coral",
  "Purple",
  "Green",
  "Ivory",
  "Blue",
  "Pink",
  "Yellow",
  "Teal",
  "Brown",
  "Slate",
].map((label, index) => ({ label, value: COLORS[index] }));
const gameModeName = (seats: number) =>
  seats <= 4 ? "Base game" : seats <= 6 ? "Expanded game" : `${seats}-player game`;
const EMPTY_COMMUNITY: CommunityView = {
  totalGames: 0,
  leaderboard: [],
  flock: [],
  pendingSheep: [],
};
const communityDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const devNames: Record<Dev, string> = {
  knight: "Knight",
  roadBuilding: "Road building",
  plenty: "Year of plenty",
  monopoly: "Monopoly",
  victory: "Victory point",
};
function LabelSelect({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <NativeSelect
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {children}
      </NativeSelect>
    </label>
  );
}
function CardPicker({
  value,
  onChange,
  max,
  maxTotal,
  label,
}: {
  value: Hand;
  onChange: (v: Hand) => void;
  max?: Hand;
  maxTotal?: number;
  label: string;
}) {
  const selectedTotal = total(value);
  return (
    <div className="card-picker">
      <h3>{label}</h3>
      <div className="discard-palette cream-tray">
        {RESOURCES.map((r) => {
          const resourceLimit = max?.[r] ?? 19;
          const selectionFull = maxTotal !== undefined && selectedTotal >= maxTotal;
          return (
            <GameCard
              key={r}
              resource={r}
              count={resourceLimit - value[r]}
              disabled={value[r] >= resourceLimit || selectionFull}
              label={`Add ${TERRAIN[r].label} to ${label}`}
              onClick={() =>
                onChange(
                  addCardToSelection(value, r, resourceLimit, maxTotal),
                )
              }
            />
          );
        })}
      </div>
      <div className="discard-selection cream-tray">
        <CardRow hand={value} label={label} onRemove={r => onChange({ ...value, [r]: Math.max(0, value[r] - 1) })} />
        {!total(value) && <span>Select cards above</span>}
      </div>
    </div>
  );
}
const actionClockLabels: Partial<Record<Phase, string>> = {
  setupSettlement: "place a settlement",
  setupRoad: "place a road",
  roll: "roll the dice",
  discard: "discard cards",
  robber: "move the robber",
  steal: "choose a player",
  freeRoad: "place a free road",
};
function Clock({
  deadline,
  phase,
  tradeOpen = false,
}: {
  deadline: number | null;
  phase: Phase;
  tradeOpen?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const actionLabel = tradeOpen ? "finish the trade" : actionClockLabels[phase];
  const urgentAt = actionLabel ? 3 : 10;
  const warningAt = actionLabel ? 5 : 30;
  return (
    <time
      className={`turn-clock ${remaining <= urgentAt ? "urgent" : remaining <= warningAt ? "warning" : ""}`}
      dateTime={`PT${remaining}S`}
      role="timer"
      aria-label={`${minutes} minutes ${seconds} seconds remaining ${actionLabel ? `to ${actionLabel}` : "in this turn"}`}
      title={actionLabel ? `Time remaining to ${actionLabel}` : "Turn time remaining"}
    >
      {display}
    </time>
  );
}

export function App() {
  const appName = getAppName();
  const [authenticated, setAuthenticated] = useState(false),
    [loading, setLoading] = useState(true),
    [connected, setConnected] = useState(false),
    [room, setRoom] = useState<Room | null>(null),
    [resumeRooms, setResumeRooms] = useState<ResumeRoomView[]>([]),
    [community, setCommunity] = useState<CommunityView>(EMPTY_COMMUNITY),
    [gameResults, setGameResults] = useState<GameResults | null>(null),
    [pending, setPending] = useState(false);
  const [name, setName] = useState(""),
    [creationPassword, setCreationPassword] = useState(""),
    [code, setCode] = useState(
      () => new URLSearchParams(location.search).get("room") || "",
    ),
    [entry, setEntry] = useState<"host" | "join">(() =>
      new URLSearchParams(location.search).get("room") ? "join" : "host",
    );
  const [mode, setMode] = useState<"2d" | "3d">(() =>
      localStorage.getItem("harbor-mode") === "3d" ? "3d" : "2d",
    ),
    [build, setBuild] = useState<Build | null>(null),
    [selection, setSelection] = useState<{
      type: Build | "robber";
      id: number;
    } | null>(null),
    [modal, setModal] = useState<
      | "trade"
      | "cards"
      | "rules"
      | "settings"
      | "close"
      | "sheep"
      | "identity"
      | "color"
      | "remove-player"
      | null
    >(null),
    [turnAlerts, setTurnAlerts] = useState(
      () => localStorage.getItem("game-turn-alerts") === "on",
    ),
    [turnAlertVolume, setTurnAlertVolume] = useState(() => {
      const stored = localStorage.getItem("game-turn-alert-volume");
      if (stored === null) return 60;
      const saved = Number(stored);
      return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : 60;
    }),
    [animationsEnabled, setAnimationsEnabled] = useState(
      () => localStorage.getItem("gameplay-animations") !== "off",
    ),
    [darkMode, setDarkMode] = useState(
      () => localStorage.getItem("game-color-theme") === "dark",
    ),
    [reducedMotion, setReducedMotion] = useState(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [animationCue, setAnimationCue] = useState<GameplayAnimationCue | null>(
      null,
    ),
    [sideTab, setSideTab] = useState<"log" | "chat">("log");
  const [give, setGive] = useState<Hand>(emptyHand),
    [want, setWant] = useState<Hand>(emptyHand),
    [discard, setDiscard] = useState<Hand>(emptyHand),
    [counterId, setCounterId] = useState<number | null>(null),
    [devChoice, setDevChoice] = useState<Resource[]>(["wheat", "ore"]),
    [devChoiceCard, setDevChoiceCard] =
      useState<ResourceChoiceDevelopmentCard | null>(null),
    [chat, setChat] = useState(""),
    [sheepName, setSheepName] = useState(""),
    [sheepClaimId, setSheepClaimId] = useState<string | null>(null),
    [removePlayerId, setRemovePlayerId] = useState<string | null>(null);
  const socket = useRef<Socket | null>(null),
    roomRef = useRef<Room | null>(null),
    activityScroll = useRef<HTMLDivElement | null>(null),
    activityContent = useRef<HTMLDivElement | null>(null),
    pregameChatScroll = useRef<HTMLDivElement | null>(null),
    activityPinned = useRef(true),
    pregameChatPinned = useRef(true),
    audio = useRef<AudioContext | null>(null),
    animationsEnabledRef = useRef(animationsEnabled && !reducedMotion),
    lastAttention = useRef<string | null>(null);
  const game = room?.game,
    spectator = !!room?.spectator,
    me = room?.players.find((p) => p.id === room.me),
    myTurn = !!game && game.players[game.current].id === room?.me,
    host = room?.host === room?.me,
    hand = me?.resources || emptyHand(),
    motionEnabled = animationsEnabled && !reducedMotion;
  const playerToRemove = room?.players.find(
    (player) => player.id === removePlayerId,
  );
  const latestLogId = game?.log.at(-1)?.id,
    latestChatId = room?.chat.at(-1)?.id,
    roomCode = room?.code,
    gameStarted = !!game;
  const ownedResourceChoiceCards = Array.from(
    new Set(
      (me?.dev || [])
        .map(({ type }) => type)
        .filter(isResourceChoiceDevelopmentCard),
    ),
  );
  const activeResourceChoiceCard =
    devChoiceCard && ownedResourceChoiceCards.includes(devChoiceCard)
      ? devChoiceCard
      : ownedResourceChoiceCards.length === 1
        ? ownedResourceChoiceCards[0]
        : null;
  const activeResourceChoiceCount = activeResourceChoiceCard
    ? developmentResourceChoiceCount(activeResourceChoiceCard)
    : 0;
  const activeResourceCardIsPlayable = !!me?.dev?.some(
    ({ type, bought }) =>
      type === activeResourceChoiceCard && bought !== game?.turn,
  );
  const attention = spectator
    ? null
    : getTurnAttention(
        game || null,
        room?.code,
        room?.me,
        !!room?.paused,
        !!me?.automated,
      );
  const ensureAudio = useCallback(async () => {
    if (!audio.current) audio.current = new AudioContext();
    await audio.current.resume();
    return audio.current;
  }, []);
  const updateTurnAlerts = async (enabled: boolean) => {
    setTurnAlerts(enabled);
    localStorage.setItem("game-turn-alerts", enabled ? "on" : "off");
    if (!enabled) return;
    try {
      const context = await ensureAudio();
      playTurnNotification(context, turnAlertVolume / 100);
    } catch {
      setTurnAlerts(false);
      localStorage.setItem("game-turn-alerts", "off");
      toast.error("Turn notification audio is unavailable in this browser.");
    }
  };
  const updateTurnAlertVolume = (value: number) => {
    const next = Math.min(100, Math.max(0, Math.round(value)));
    setTurnAlertVolume(next);
    localStorage.setItem("game-turn-alert-volume", String(next));
  };
  const previewTurnAlert = async () => {
    try {
      const context = await ensureAudio();
      playTurnNotification(context, turnAlertVolume / 100);
    } catch {
      toast.error("Turn notification audio is unavailable in this browser.");
    }
  };
  const updateAnimations = (enabled: boolean) => {
    animationsEnabledRef.current = enabled && !reducedMotion;
    setAnimationsEnabled(enabled);
    localStorage.setItem("gameplay-animations", enabled ? "on" : "off");
    if (!enabled) setAnimationCue(null);
  };
  const updateDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    localStorage.setItem("game-color-theme", enabled ? "dark" : "light");
  };
  useLayoutEffect(() => {
    const theme = darkMode ? "dark" : "light";
    document.documentElement.dataset.colorTheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", darkMode ? "#071b2a" : "#29649e");
  }, [darkMode]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(preference.matches);
      animationsEnabledRef.current = animationsEnabled && !preference.matches;
      if (preference.matches) setAnimationCue(null);
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, [animationsEnabled]);
  useEffect(() => {
    if (!animationCue) return;
    const cueId = animationCue.id;
    const timeout = window.setTimeout(
      () =>
        setAnimationCue((current) =>
          current?.id === cueId ? null : current,
        ),
      1_800,
    );
    return () => window.clearTimeout(timeout);
  }, [animationCue]);
  const command = useCallback(async (
    input: Command,
    options: CommandOptions = {},
  ) => {
    const activeSocket = socket.current;
    if (!activeSocket?.connected) {
      toast.error("Reconnecting to the table…");
      return false;
    }
    setPending(true);
    const send = (value: Command) =>
      new Promise<{ error: Error | null; response?: CommandResponse }>(
        (resolve) =>
          activeSocket
            .timeout(6000)
            .emit(
              "command",
              value,
              (error: Error | null, response: CommandResponse) =>
                resolve({ error, response }),
            ),
      );
    let result = await send(input);
    if (
      !result.error &&
      !result.response?.ok &&
      result.response?.reason === "stale" &&
      options.retryStale &&
      Number.isInteger(result.response.version)
    ) {
      result = await send({ ...input, version: result.response.version });
    }
    setPending(false);
    if (result.error || !result.response?.ok) {
      if (result.response?.reason === "stale") return false;
      toast.error(
        result.error
          ? "The server did not respond. Your game is saved."
          : result.response?.error || "Action failed.",
      );
      return false;
    }
    return true;
  }, []);
  const act = useCallback(
    async (action: Action) => {
      const g = roomRef.current?.game;
      if (!g) return false;
      return command(
        { type: "action", version: g.version, action },
        {
          retryStale: [
            "road",
            "settlement",
            "city",
            "robber",
            "steal",
            "discard",
          ].includes(action.type),
        },
      );
    },
    [command],
  );
  const updateDiscardSelection = useCallback((cards: Hand) => {
    setDiscard(cards);
    const activeRoom = roomRef.current;
    const activeGame = activeRoom?.game;
    const activeSocket = socket.current;
    if (
      !activeRoom ||
      !activeGame ||
      activeGame.phase !== "discard" ||
      !activeGame.discards[activeRoom.me] ||
      !activeSocket?.connected
    )
      return;
    activeSocket.emit(
      "command",
      {
        type: "discardSelection",
        turn: activeGame.turn,
        cards,
      },
      () => {},
    );
  }, []);
  useEffect(() => {
    fetch("/api/session")
      .then(async (response) => {
        const session = (await response.json()) as {
          authenticated?: boolean;
          error?: string;
        };
        if (!response.ok)
          throw new Error(session.error || "Unable to start a player session.");
        setAuthenticated(session.authenticated === true);
      })
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Waiting for the local game server.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    const s = io({
      transports: ["websocket"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socket.current = s;
    s.on("connect", () => {
      setConnected(true);
      const active = roomRef.current;
      const reconnectCommand = active
        ? {
            type: active.spectator ? "spectate" : "resume",
            code: active.code,
          }
        : { type: "home" };
      s.emit(
        "command",
        reconnectCommand,
        (response: { ok: boolean }) => {
          if (!response?.ok && active) {
            roomRef.current = null;
            setRoom(null);
            s.emit("command", { type: "home" }, () => {});
          }
        },
      );
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", (e) => {
      setConnected(false);
      if (e.message.includes("Sign in")) setAuthenticated(false);
    });
    s.on("resume-options", (games: ResumeRoomView[]) =>
      setResumeRooms(games.filter((saved) => saved.phase !== "finished")),
    );
    s.on("community", (view: CommunityView) => setCommunity(view));
    s.on("game-results", (results: GameResults) => setGameResults(results));
    s.on("room", (r: Room | null) => {
      const previous = roomRef.current;
      const ownLobbyPlayer = r && !r.game
        ? r.players.find((player) => player.id === r.me)
        : undefined;
      if (ownLobbyPlayer)
        localStorage.setItem("game-player-color", ownLobbyPlayer.color);
      if (previous?.code !== r?.code || !previous?.game || !r?.game)
        setAnimationCue(null);
      else if (animationsEnabledRef.current) {
        const cue = deriveGameplayAnimation(previous.game, r.game);
        if (cue) setAnimationCue(cue);
      }
      if (previous?.game?.version !== r?.game?.version || r?.paused)
        setSelection(null);
      if (previous?.game?.offer?.id !== r?.game?.offer?.id) setBuild(null);
      if (
        previous?.game?.turn !== r?.game?.turn ||
        previous?.game?.phase !== r?.game?.phase
      ) {
        setBuild(null);
        setDiscard(emptyHand());
      }
      if (
        r?.game?.phase === "discard" &&
        r.game.discards[r.me] &&
        r.discardSelection
      )
        setDiscard(r.discardSelection);
      if (!!previous?.game !== !!r?.game)
        window.scrollTo({ top: 0, behavior: "instant" });
      roomRef.current = r;
      setRoom(r);
    });
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, [authenticated]);
  useEffect(() => {
    if (!turnAlerts) {
      lastAttention.current = attention?.key || null;
      return;
    }
    if (!attention || lastAttention.current === attention.key) return;
    lastAttention.current = attention.key;
    const context = audio.current;
    if (context?.state === "running")
      playTurnNotification(context, turnAlertVolume / 100);
  }, [attention, turnAlerts, turnAlertVolume]);
  useEffect(() => {
    document.title = turnAlerts && attention ? `${attention.label} · ${appName}` : appName;
  }, [appName, attention, turnAlerts]);
  useEffect(() => {
    if (!turnAlerts || audio.current?.state === "running") return;
    const armAudio = () => {
      void ensureAudio().catch(() => {});
    };
    window.addEventListener("pointerdown", armAudio, {
      once: true,
      capture: true,
    });
    window.addEventListener("keydown", armAudio, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", armAudio, { capture: true });
      window.removeEventListener("keydown", armAudio, { capture: true });
    };
  }, [ensureAudio, turnAlerts]);
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => Promise<void> | void;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "read_game_table",
        description:
          "Read your visible room, turn, hand, and legal build locations. Other players’ hands remain private.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => roomRef.current,
      },
      {
        name: "set_game_view",
        description:
          "Switch the visible board between 2D and Three.js 3D. Does not make a game move.",
        inputSchema: {
          type: "object",
          properties: { mode: { type: "string", enum: ["2d", "3d"] } },
          required: ["mode"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: { mode: string }) => {
          if (!["2d", "3d"].includes(input?.mode))
            throw new Error("Expected 2d or 3d.");
          setMode(input.mode as "2d" | "3d");
          localStorage.setItem("harbor-mode", input.mode);
          return { mode: input.mode };
        },
      },
    ];
    tools.forEach((t) => {
      try {
        Promise.resolve(
          context.registerTool(t, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    });
    return () => lifecycle.abort();
  }, []);
  const setView = (v: "2d" | "3d") => {
    setMode(v);
    localStorage.setItem("harbor-mode", v);
  };
  const createOrJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const savedColor = localStorage.getItem("game-player-color");
    const color = savedColor && COLORS.includes(savedColor) ? savedColor : undefined;
    const succeeded = await command(
      entry === "host"
        ? { type: "create", name, password: creationPassword, color }
        : { type: "join", name, code: code.toUpperCase(), color },
    );
    if (succeeded) {
      setName("");
      if (entry === "host") setCreationPassword("");
    }
  };
  const resumeGame = async (roomCode: string) => {
    await command({ type: "resume", code: roomCode });
  };
  const goHome = async () => {
    if (!(await command({ type: "home" }))) return false;
    history.replaceState(null, "", location.pathname);
    setModal(null);
    return true;
  };
  const startFreshIdentity = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/session/new", { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error || "Unable to start a fresh player identity.",
        );
      localStorage.removeItem("harbor-name");
      location.reload();
    } catch (error) {
      setPending(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start a fresh player identity.",
      );
    }
  };
  const openSheepNaming = (right: PublicSheepNamingRight) => {
    setSheepClaimId(right.matchId);
    setSheepName("");
    setModal("sheep");
  };
  const submitSheepName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      sheepClaimId &&
      (await command({
        type: "nameSheep",
        matchId: sheepClaimId,
        name: sheepName,
      }))
    ) {
      setModal(null);
      setSheepClaimId(null);
      setSheepName("");
      toast.success("Your sheep joined the flock.");
    }
  };
  const copyRoom = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?room=${room!.code}`,
      );
      toast.success("Invite link copied. Guests do not need the creator password.");
    } catch {
      toast.info(`Room code: ${room!.code}`);
    }
  };
  const choose = async (id: number) => {
    if (!game || !myTurn || room?.paused || pending) return;
    const type =
      game.phase === "setupSettlement"
        ? "settlement"
        : game.phase === "setupRoad" || game.phase === "freeRoad"
          ? "road"
          : game.phase === "robber"
            ? "robber"
            : build;
    if (type) setSelection({ type, id });
  };
  const confirmPlacement = async () => {
    if (!selection || pending) return;
    if (await act({ type: selection.type, id: selection.id })) {
      setBuild(null);
      setSelection(null);
    }
  };
  const kind =
    game && myTurn && !room?.paused
      ? game.phase === "setupSettlement"
        ? "vertex"
        : game.phase === "setupRoad" || game.phase === "freeRoad"
          ? "edge"
          : game.phase === "robber"
            ? "tile"
            : game.phase === "main" && build
              ? build === "road"
                ? "edge"
                : "vertex"
              : null
      : null;
  const highlights = useMemo(() => {
    if (!game || !kind) return [];
    return kind === "tile"
      ? game.legal.robber
      : kind === "edge"
        ? game.legal.roads
        : build === "city"
          ? game.legal.cities
          : game.legal.settlements;
  }, [game, kind, build]);
  const current = game?.players[game.current];
  const currentPlayerCard = useRef<HTMLDivElement | null>(null);
  const bringOwnTurnIntoView = shouldBringOwnTurnIntoView(
    game || null,
    room?.me,
  );
  const rosterPlayers = useMemo(
    () =>
      room
        ? game
          ? orderPlayersForViewer(room.players, room.me)
          : room.players
        : [],
    [game, room],
  );
  useEffect(() => {
    if (!bringOwnTurnIntoView || !currentPlayerCard.current) return;
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    currentPlayerCard.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [bringOwnTurnIntoView, current?.id]);
  const gameLogGroups = useMemo(
    () => (game ? groupGameLog(game.log) : []),
    [game],
  );
  const activeActivityId = sideTab === "log" ? latestLogId : latestChatId;
  useEffect(() => {
    activityPinned.current = true;
    pregameChatPinned.current = true;
  }, [roomCode]);
  const scrollActivityToLatest = useCallback(() => {
    const viewport = activityScroll.current;
    if (!viewport || !activityPinned.current) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    scrollActivityToLatest();
  }, [roomCode, sideTab, activeActivityId, scrollActivityToLatest]);
  useEffect(() => {
    const content = activityContent.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(scrollActivityToLatest);
    observer.observe(content);
    return () => observer.disconnect();
  }, [roomCode, sideTab, gameStarted, scrollActivityToLatest]);
  useEffect(() => {
    const viewport = pregameChatScroll.current;
    if (!viewport || game || !pregameChatPinned.current) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [roomCode, game, latestChatId]);
  const selectedSheepRight = community.pendingSheep.find(
    (right) => right.matchId === sheepClaimId,
  );
  const active =
    !!game &&
    myTurn &&
    game.phase === "main" &&
    !game.offer &&
    !room?.paused &&
    connected &&
    !pending;
  const canAfford = (cost: Partial<Hand>) =>
    RESOURCES.every((r) => hand[r] >= (cost[r] || 0));
  const boardBuildOptions: Record<Build, number[]> | undefined =
    active && game
      ? affordableBuildOptions(hand, game.legal)
      : undefined;
  const promptEndTurn = !!(
    active &&
    game &&
    me &&
    !hasRemainingTurnAction(game, me)
  );
  const chooseBuildSite = (type: Build, id: number) => {
    if (!active || !game || !boardBuildOptions?.[type].includes(id)) return;
    setBuild(type);
    setSelection({ type, id });
    setModal(null);
  };
  const phaseText = room?.paused
    ? `Game paused by ${room.players.find((player) => player.id === room.host)?.name || "host"}`
    : !game
      ? "Your next game starts here"
      : game.phase === "finished"
        ? `${game.players.find((p) => p.id === game.winner)?.name} wins`
        : game.offer
          ? game.offer.from === room!.me
            ? "Your trade offer is open"
            : `${game.players.find((player) => player.id === game.offer?.from)?.name || "Player"}'s trade offer is open`
        : game.phase === "discard"
          ? game.discards[room!.me]
            ? `Discard ${game.discards[room!.me]} cards`
            : "Waiting for discards"
          : !myTurn
            ? game.secondary
              ? `${current?.name}'s special build phase`
              : game.phase === "roll"
              ? `${current?.name} is rolling`
              : game.phase === "setupSettlement"
                ? `${current?.name} is placing a settlement`
                : game.phase === "setupRoad"
                  ? `${current?.name} is placing a road`
                  : game.phase === "robber"
                    ? `${current?.name} is moving the robber`
                    : game.phase === "steal"
                      ? `${current?.name} is choosing a player`
                      : game.phase === "freeRoad"
                        ? `${current?.name} is placing free roads`
                        : `${current?.name}'s turn`
            : game.phase === "setupSettlement"
              ? "Place settlement"
              : game.phase === "setupRoad"
                ? "Place road"
                : game.phase === "roll"
                  ? "Roll dice"
                  : game.phase === "robber"
                    ? "Move robber"
                    : game.phase === "steal"
                      ? "Choose player"
                      : game.phase === "freeRoad"
                        ? "Place free roads"
                        : build
                          ? `Place ${build}`
                          : game.secondary
                            ? "Special build phase"
                            : "Your turn";
  const lobbySeats = room?.options.seats ?? DEFAULT_OPTIONS.seats;
  const lobbyMapSeed = room?.mapSeed ?? 2026;
  const lobbyBalanced = room?.options.balanced ?? DEFAULT_OPTIONS.balanced;
  const lobbyAllowSixEightTouch =
    room?.options.allowSixEightTouch ??
    DEFAULT_OPTIONS.allowSixEightTouch;
  const lobbyAllowTwoTwelveTouch =
    room?.options.allowTwoTwelveTouch ??
    DEFAULT_OPTIONS.allowTwoTwelveTouch;
  const lobbyAllowSameNumbersTouch =
    room?.options.allowSameNumbersTouch ??
    DEFAULT_OPTIONS.allowSameNumbersTouch;
  const lobbyAllowSameResourcesTouch =
    room?.options.allowSameResourcesTouch ??
    DEFAULT_OPTIONS.allowSameResourcesTouch;
  const lobbyMapRules = useMemo(
    () =>
      mapGenerationRules({
        balanced: lobbyBalanced,
        allowSixEightTouch: lobbyAllowSixEightTouch,
        allowTwoTwelveTouch: lobbyAllowTwoTwelveTouch,
        allowSameNumbersTouch: lobbyAllowSameNumbersTouch,
        allowSameResourcesTouch: lobbyAllowSameResourcesTouch,
      }),
    [
      lobbyAllowSameNumbersTouch,
      lobbyAllowSameResourcesTouch,
      lobbyAllowSixEightTouch,
      lobbyAllowTwoTwelveTouch,
      lobbyBalanced,
    ],
  );
  const generatedBoard = useMemo(
    () => makeBoard(lobbySeats, lobbyMapSeed, lobbyMapRules),
    [lobbyMapRules, lobbyMapSeed, lobbySeats],
  );
  const board = game?.board || generatedBoard;
  const boardPlayers = room?.players || [];
  const specialBuildQueued = !!(
    game &&
    room &&
    (game.specialBuildRequests || []).includes(room.me)
  );
  const specialBuildPlayerIndex =
    game && room
      ? game.players.findIndex((player) => player.id === room.me)
      : -1;
  const specialBuildPartner =
    game && specialBuildPlayerIndex >= 0
      ? game.players[
          (specialBuildPlayerIndex - 3 + game.players.length) %
            game.players.length
        ]
      : undefined;
  const showSpecialBuildFlag = !!(
    game &&
    room &&
    !spectator &&
    game.options.paired &&
    game.players.length > 4 &&
    !game.secondary &&
    !game.phase.startsWith("setup") &&
    game.phase !== "finished" &&
    current?.id !== room.me
  );
  const specialBuildLabel = specialBuildQueued
    ? `Cancel special build phase queued after ${specialBuildPartner?.name || "your paired player's"} turn`
    : `Queue a special build phase after ${specialBuildPartner?.name || "your paired player's"} turn`;
  const roster = (
    <aside className={`crew-panel ${room && !game ? "pregame-players" : ""}`}>
      <div className="panel-title">
        <span>PLAYERS</span>
        <span>
          {room ? `${room.players.length}/${room.options.seats}` : "2–12"}
        </span>
      </div>
      {room ? (
        rosterPlayers.map((p) => (
          <div
            className={`player-card ${current?.id === p.id ? "is-current" : ""} ${p.id === room.me ? "is-you" : ""}`}
            key={p.id}
            data-animation-player={p.id}
            style={{ "--player": p.color } as React.CSSProperties}
            aria-current={current?.id === p.id ? "true" : undefined}
            ref={current?.id === p.id ? currentPlayerCard : undefined}
          >
            {game ? <>
              <div className="player-name">{p.name}{p.id === room.host && <Crown size={12} />}</div>
              <div className="player-score-avatar"><Avatar player={p} score={p.points} /></div>
              <div className="player-card-stats">
                <GameCard resource="unknown" count={p.cardCount} label={`${p.cardCount} resource cards`} />
                <GameCard resource="development" count={p.devCount} label={`${p.devCount} development cards`} />
                <span className={`achievement ${game.army === p.id ? "earned" : ""}`} title="Knights played"><Sprite name="people" /><b>{p.knights}</b></span>
                <span className={`achievement ${game.longest === p.id ? "earned" : ""}`} title="Longest road length"><Sprite name="route" /><b>{p.roadLength}</b></span>
              </div>
              {(!p.connected && !p.bot || p.automated) && <small className="player-presence">{p.automated ? "Bot assistance" : "Disconnected"}</small>}
            </> : <>
              {p.id === room.me && !p.bot ? (
                <button
                  className="player-color-trigger"
                  type="button"
                  aria-label={`Choose your player color. Current color: ${PLAYER_COLORS.find(({ value }) => value === p.color)?.label || p.color}`}
                  title="Choose your color"
                  disabled={pending}
                  onClick={() => setModal("color")}
                >
                  <Avatar player={p} />
                  <span className="player-color-edit" aria-hidden="true">
                    <Palette />
                  </span>
                </button>
              ) : <Avatar player={p} />}
              <div className="player-info"><strong>{p.name}{p.id === room.me && <small> YOU</small>}</strong><span>{p.bot ? `${p.difficulty} bot` : "At the table"}</span></div>
              <span className={`pregame-ready ${!p.bot && !p.connected ? "offline" : ""}`}>
                {p.bot ? "BOT" : p.connected ? "READY" : "OFFLINE"}
              </span>
              {host && p.id !== room.host && <button className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => command({ type: "remove", id: p.id })}><X size={14} /></button>}
            </>}
          </div>
        ))
      ) : (
        <div className="empty-crew">
          <Users size={28} />
          <p>A seat for every friend.</p>
          <span>Bring your crew, or fill the table with bots.</span>
        </div>
      )}
      {room &&
        !game &&
        Array.from(
          { length: room.options.seats - room.players.length },
          (_, i) => (
            <button
              key={i}
              className="empty-seat"
              disabled={!host || pending}
              onClick={() => command({ type: "bot" })}
            >
              <span className="seat-action">
                {host ? <Bot size={18} /> : <Plus size={18} />}
                <span>{host ? "Add Bot" : "Open seat"}</span>
              </span>
            </button>
          ),
        )}
      <div className="crew-bottom">
        <div className="small-label">THE OBJECTIVE</div>
        <p>
          First to <b>{room?.options.target || 10} victory points</b> wins.
        </p>
        <div className="award-row">
          <Route size={17} />
          <span>Longest road</span>
          <b>+2</b>
        </div>
        <div className="award-row">
          <Shield size={17} />
          <span>Largest army</span>
          <b>+2</b>
        </div>
        {game && (
          <p className="fine-print">Opponents’ victory cards stay hidden.</p>
        )}
        <button className="text-btn" onClick={() => setModal("rules")}>
          Rules & building costs <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
  const activity =
    game && room ? (
      <div className="activity">
        <div className="activity-tabs">
          <button
            className={sideTab === "log" ? "active" : ""}
            onClick={() => {
              activityPinned.current = true;
              setSideTab("log");
            }}
          >
            Game log
          </button>
          <button
            className={sideTab === "chat" ? "active" : ""}
            onClick={() => {
              activityPinned.current = true;
              setSideTab("chat");
            }}
          >
            <MessageCircle size={14} />
            Chat
          </button>
        </div>
        {sideTab === "log" ? (
          <div
            className="log-list game-log-list"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            ref={activityScroll}
            onScroll={(event) => {
              activityPinned.current = isNearLatest(event.currentTarget);
            }}
          >
            <div className="activity-feed-content" ref={activityContent}>
              {gameLogGroups.map((group) => (
                <section className="log-turn-group" key={group.key}>
                  {group.entries.map((entry) => {
                    const actor = entry.player
                      ? game.players.find((player) => player.id === entry.player)
                      : game.players.find((player) =>
                          entry.text.startsWith(`${player.name} `),
                        );
                    return (
                      <div
                        className={`log-entry ${entry.kind} ${actor ? "" : "no-actor"}`}
                        key={entry.id}
                      >
                        {actor && (
                          <span
                            className="log-actor"
                            style={{ "--player": actor.color } as React.CSSProperties}
                            aria-hidden="true"
                          >
                            <Sprite name={actor.bot ? "bot" : "person"} />
                          </span>
                        )}
                        <p><LogMessage text={entry.text} actor={actor} /></p>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div
              className="log-list chat-list"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              ref={activityScroll}
              onScroll={(event) => {
                activityPinned.current = isNearLatest(event.currentTarget);
              }}
            >
              <div className="activity-feed-content" ref={activityContent}>
                {room.chat.length ? (
                  room.chat.map((c) => (
                    <p key={c.id}>
                      <b>{c.name}</b>
                      {c.text}
                    </p>
                  ))
                ) : (
                  <p className="muted">A little friendly negotiation?</p>
                )}
              </div>
            </div>
            {spectator ? (
              <div className="spectator-chat-note">
                <Eye size={16} /> Spectators can read chat
              </div>
            ) : (
              <form
                className="chat-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await command({ type: "chat", text: chat })) setChat("");
                }}
              >
                <input
                  aria-label="Chat message"
                  value={chat}
                  onChange={(e) => setChat(e.target.value)}
                  maxLength={240}
                  placeholder="Say something…"
                />
                <button
                  className="icon-btn"
                  aria-label="Send message"
                  disabled={!chat.trim()}
                >
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
          </>
        )}
      </div>
    ) : null;
  const openTrade = (resource?: Resource) => {
    setCounterId(null);
    setGive(resource ? { ...emptyHand(), [resource]: 1 } : emptyHand());
    setWant(emptyHand());
    setModal("trade");
  };
  const tradeInteractionEnabled = !!(
    game &&
    !spectator &&
    !room?.paused &&
    connected &&
    !pending &&
    game.phase === "main" &&
    (myTurn || counterId !== null)
  );
  const selectHandResourceForTrade = (resource: Resource) => {
    if (modal !== "trade") {
      openTrade(resource);
      return;
    }
    if (!tradeInteractionEnabled || want[resource] || give[resource] >= hand[resource])
      return;
    setGive({ ...give, [resource]: give[resource] + 1 });
  };
  const editOffer = () => {
    if (!game?.offer || !room) return;
    const mine = game.offer.from === room.me;
    setCounterId(mine && myTurn ? null : game.offer.id);
    setGive({ ...(mine ? game.offer.give : game.offer.want) });
    setWant({ ...(mine ? game.offer.want : game.offer.give) });
    setModal("trade");
  };
  const controls = game && room ? (
    <div className="game-actions">
      <ActionTile label={modal === "trade" ? "Cancel trade" : "Trade"} disabled={!active && modal !== "trade"} onClick={() => modal === "trade" ? setModal(null) : openTrade()}>
        {modal === "trade" ? <X /> : <span className="trade-action-art"><GameCard resource="wheat" /><ArrowLeftRight /><GameCard resource="brick" /></span>}
      </ActionTile>
      <ActionTile label="Buy development card · 1 sheep, 1 wheat, 1 ore" disabled={!active || !canAfford(COSTS.development) || !game.deckCount} onClick={() => act({ type: "buyDev" })}><GameCard resource="development" /></ActionTile>
      {(["road", "settlement", "city"] as const).map(type => {
        const legal = type === "road" ? game.legal.roads : type === "city" ? game.legal.cities : game.legal.settlements;
        const count = type === "road" ? 15 - board.edges.filter(e => e.owner === room.me).length : type === "city" ? 4 - board.vertices.filter(v => v.owner === room.me && v.city).length : 5 - board.vertices.filter(v => v.owner === room.me && !v.city).length;
        return <ActionTile key={type} label={`Build ${type} · ${RESOURCES.filter(r => COSTS[type][r]).map(r => `${COSTS[type][r]} ${r}`).join(", ")}`} count={count} selected={build === type} disabled={!active || !canAfford(COSTS[type]) || !legal.length} onClick={() => { setBuild(build === type ? null : type); setSelection(null); setModal(null); }}>
          <Sprite name={type} />
        </ActionTile>;
      })}
      <ActionTile className={promptEndTurn ? "end-turn-prompt" : ""} label="End turn" disabled={!active} onClick={() => { setModal(null); act({ type: "end" }); }}><EndTurnIcon /></ActionTile>
    </div>
  ) : null;
  const updateRoomOptions = (changes: Partial<Options>) => {
    if (!room || !host || game) return;
    void command({
      type: "options",
      options: { ...room.options, ...changes },
    });
  };
  const fillWithBots = async () => {
    if (!room || !host || game) return;
    for (let i = room.players.length; i < room.options.seats; i++)
      if (!(await command({ type: "bot" }))) break;
  };
  const pregameCenter = room && !game ? (
    <section className="pregame-center" aria-labelledby="pregame-room-title">
      <div className="pregame-room-heading">
        <div>
          <span>ROOM ID</span>
          <h1 id="pregame-room-title">{room.code}</h1>
        </div>
        <button
          className="icon-btn"
          aria-label="Leave room"
          title="Leave room"
          onClick={() => void command({ type: "leave" })}
        >
          <X size={24} />
        </button>
      </div>

      <section className="pregame-invite" aria-labelledby="invite-friends">
        <h2 id="invite-friends">Invite Friends</h2>
        <button onClick={copyRoom} className="invite-link">
          <span>{`${location.origin}/?room=${room.code}`}</span>
          <strong><Copy size={16} /> Copy</strong>
        </button>
      </section>

      <fieldset className="pregame-section">
        <legend>Players &amp; Board</legend>
        <div className="seat-count-setting">
          <div className="seat-count-summary">
            <span className="mode-art"><Sprite name="settlement" /><b>{room.options.seats}</b></span>
            <span>
              <strong>{gameModeName(room.options.seats)}</strong>
              <small>
                {boardProfileForPlayers(room.options.seats).name} ·{" "}
                {boardProfileForPlayers(room.options.seats).tiles} hexes
              </small>
            </span>
          </div>
          <LabelSelect
            label="Players"
            value={room.options.seats}
            disabled={!host || pending}
            onChange={(value) => {
              const seats = Number(value);
              updateRoomOptions({
                seats,
                paired: seats > 4 ? room.options.paired : false,
              });
            }}
          >
            {PLAYER_COUNTS.map((seats) => (
              <option key={seats} value={seats} disabled={seats < room.players.length}>
                {seats} players
              </option>
            ))}
          </LabelSelect>
        </div>
      </fieldset>

      <fieldset className="pregame-section">
        <legend>Map</legend>
        <div className="setup-choice-grid two-up">
          <button
            type="button"
            className={`setup-choice horizontal ${room.options.balanced ? "selected" : ""}`}
            aria-pressed={room.options.balanced}
            disabled={!host || pending}
            onClick={() => updateRoomOptions({ balanced: true })}
          >
            <Dices size={28} />
            <span><strong>Balanced Island</strong><small>Customize neighboring tiles</small></span>
          </button>
          <button
            type="button"
            className={`setup-choice horizontal ${!room.options.balanced ? "selected" : ""}`}
            aria-pressed={!room.options.balanced}
            disabled={!host || pending}
            onClick={() => updateRoomOptions({ balanced: false })}
          >
            <Shuffle size={28} />
            <span><strong>Random Island</strong><small>Shuffle every tile and number</small></span>
          </button>
        </div>
        <section
          className={`map-generation-rules ${room.options.balanced ? "" : "is-disabled"}`}
          aria-labelledby="map-generation-rules-title"
        >
          <div className="map-generation-rules-heading">
            <Settings2 size={21} aria-hidden="true" />
            <span>
              <strong id="map-generation-rules-title">Generation rules</strong>
              <small>
                {room.options.balanced
                  ? "Choose which neighboring tiles are allowed."
                  : "Select Balanced Island to use these rules."}
              </small>
            </span>
          </div>
          <div className="map-generation-rules-grid">
            <label className="map-generation-rule">
              <span>
                <strong>6 &amp; 8 can touch</strong>
                <small>Allow red numbers to share an edge.</small>
              </span>
              <Switch
                checked={room.options.allowSixEightTouch}
                disabled={!host || pending || !room.options.balanced}
                onCheckedChange={(checked) =>
                  updateRoomOptions({ allowSixEightTouch: checked })
                }
                aria-label="6 and 8 can touch"
              />
            </label>
            <label className="map-generation-rule">
              <span>
                <strong>2 &amp; 12 can touch</strong>
                <small>Allow rare numbers to share an edge.</small>
              </span>
              <Switch
                checked={room.options.allowTwoTwelveTouch}
                disabled={!host || pending || !room.options.balanced}
                onCheckedChange={(checked) =>
                  updateRoomOptions({ allowTwoTwelveTouch: checked })
                }
                aria-label="2 and 12 can touch"
              />
            </label>
            <label className="map-generation-rule">
              <span>
                <strong>Same numbers can touch</strong>
                <small>Allow matching number tokens together.</small>
              </span>
              <Switch
                checked={room.options.allowSameNumbersTouch}
                disabled={!host || pending || !room.options.balanced}
                onCheckedChange={(checked) =>
                  updateRoomOptions({ allowSameNumbersTouch: checked })
                }
                aria-label="Same numbers can touch"
              />
            </label>
            <label className="map-generation-rule">
              <span>
                <strong>Same resources can touch</strong>
                <small>Allow matching terrain types together.</small>
              </span>
              <Switch
                checked={room.options.allowSameResourcesTouch}
                disabled={!host || pending || !room.options.balanced}
                onCheckedChange={(checked) =>
                  updateRoomOptions({ allowSameResourcesTouch: checked })
                }
                aria-label="Same resources can touch"
              />
            </label>
          </div>
        </section>
        <div className="map-preview-card">
          <BoardPreview board={board} seed={room.mapSeed} />
          <div className="map-seed-controls">
            <span className="map-seed-copy">
              <small>MAP SEED</small>
              <strong aria-live="polite">
                {room.mapSeed.toString(16).padStart(8, "0").toUpperCase()}
              </strong>
            </span>
            <div className="map-seed-actions" aria-label="Map seed controls">
              <button
                type="button"
                className="icon-btn"
                aria-label="Previous map"
                title="Previous map"
                disabled={!host || pending}
                onClick={() => void command({ type: "mapSeed", direction: "previous" })}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                className="shuffle-map"
                disabled={!host || pending}
                onClick={() => void command({ type: "mapSeed", direction: "shuffle" })}
              >
                <Shuffle size={17} /> Shuffle map
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Next map"
                title="Next map"
                disabled={!host || pending}
                onClick={() => void command({ type: "mapSeed", direction: "next" })}
              >
                <ChevronRight size={19} />
              </button>
            </div>
            {!host && <small className="map-seed-waiting">Host selects the map</small>}
          </div>
        </div>
      </fieldset>

      <fieldset className="pregame-section">
        <legend>Rules</legend>
        <div className="setup-choice-grid rules-grid">
          <div className="setup-choice horizontal selected fixed-choice">
            <LockKeyhole size={25} />
            <span><strong>Private Game</strong><small>Creator password required</small></span>
          </div>
          <button
            type="button"
            className={`setup-choice horizontal ${room.options.friendlyRobber ? "selected" : ""}`}
            aria-pressed={room.options.friendlyRobber}
            disabled={!host || pending}
            onClick={() => updateRoomOptions({ friendlyRobber: !room.options.friendlyRobber })}
          >
            <span className="rule-sprite"><Sprite name="knight" /></span>
            <span><strong>Friendly Robber</strong><small>Protect players at 2 points</small></span>
          </button>
          <button
            type="button"
            className={`setup-choice horizontal ${room.options.linkedTwoTwelve ? "selected" : ""}`}
            aria-pressed={room.options.linkedTwoTwelve}
            disabled={!host || pending}
            onClick={() => updateRoomOptions({ linkedTwoTwelve: !room.options.linkedTwoTwelve })}
          >
            <Link2 size={27} />
            <span><strong>Link 2 &amp; 12</strong><small>Either roll produces both numbers</small></span>
          </button>
          <button
            type="button"
            className={`setup-choice horizontal ${room.options.showDiscardedCards ? "selected" : ""}`}
            aria-pressed={room.options.showDiscardedCards}
            disabled={!host || pending}
            onClick={() => updateRoomOptions({ showDiscardedCards: !room.options.showDiscardedCards })}
          >
            <Eye size={27} />
            <span><strong>Visible Discards</strong><small>Show the cards players return to the bank</small></span>
          </button>
          {room.options.seats > 4 && (
            <button
              type="button"
              className={`setup-choice horizontal ${room.options.paired ? "selected" : ""}`}
              aria-pressed={room.options.paired}
              disabled={!host || pending}
              onClick={() => updateRoomOptions({ paired: !room.options.paired })}
            >
              <Users size={27} />
              <span><strong>Special Build</strong><small>Players flag an extra build phase in advance</small></span>
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className="pregame-section advanced-settings">
        <legend>Advanced Settings</legend>
        <div className="advanced-grid">
          <LabelSelect
            label="Victory points"
            value={room.options.target}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ target: Number(value) as Options["target"] })}
          >
            <option value={8}>8 points · quick</option>
            <option value={10}>10 points · standard</option>
          </LabelSelect>
          <LabelSelect
            label="Turn timer"
            value={room.options.timer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ timer: Number(value) as Options["timer"] })}
          >
            <option value={0}>No timer</option>
            <option value={60}>60 seconds</option>
            <option value={120}>2 minutes</option>
            <option value={180}>3 minutes</option>
            <option value={360}>6 minutes</option>
          </LabelSelect>
          <LabelSelect
            label="Time bonus after builds/cards"
            value={room.options.turnActionBonus ?? DEFAULT_OPTIONS.turnActionBonus}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ turnActionBonus: Number(value) as Options["turnActionBonus"] })}
          >
            <option value={0}>Off</option>
            <option value={5}>+5 seconds</option>
            <option value={10}>+10 seconds</option>
            <option value={15}>+15 seconds</option>
            <option value={20}>+20 seconds</option>
            <option value={30}>+30 seconds</option>
            <option value={60}>+60 seconds</option>
          </LabelSelect>
          <LabelSelect
            label="Player trade timer"
            value={room.options.tradeTimer ?? DEFAULT_OPTIONS.tradeTimer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ tradeTimer: Number(value) as Options["tradeTimer"] })}
          >
            <option value={0}>No trade limit</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
            <option value={90}>90 seconds</option>
          </LabelSelect>
          <LabelSelect
            label="Minimum time after a trade"
            value={room.options.postTradeTimer ?? DEFAULT_OPTIONS.postTradeTimer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ postTradeTimer: Number(value) as Options["postTradeTimer"] })}
          >
            <option value={0}>No minimum</option>
            <option value={5}>At least 5 seconds</option>
            <option value={10}>At least 10 seconds</option>
            <option value={15}>At least 15 seconds</option>
            <option value={20}>At least 20 seconds</option>
            <option value={30}>At least 30 seconds</option>
            <option value={60}>At least 60 seconds</option>
          </LabelSelect>
          <LabelSelect
            label="Opening settlement timer"
            value={room.options.setupSettlementTimer ?? DEFAULT_OPTIONS.setupSettlementTimer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ setupSettlementTimer: Number(value) as Options["setupSettlementTimer"] })}
          >
            <option value={0}>No settlement limit</option>
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
            <option value={90}>90 seconds</option>
            <option value={120}>2 minutes</option>
          </LabelSelect>
          <LabelSelect
            label="Opening road timer"
            value={room.options.setupRoadTimer ?? DEFAULT_OPTIONS.setupRoadTimer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ setupRoadTimer: Number(value) as Options["setupRoadTimer"] })}
          >
            <option value={0}>No road limit</option>
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
          </LabelSelect>
          <LabelSelect
            label="Robber placement timer"
            value={room.options.robberTimer ?? DEFAULT_OPTIONS.robberTimer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ robberTimer: Number(value) as Options["robberTimer"] })}
          >
            <option value={0}>No robber limit</option>
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
          </LabelSelect>
          <LabelSelect
            label="Action timer"
            value={room.options.actionTimer ?? DEFAULT_OPTIONS.actionTimer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ actionTimer: Number(value) as Options["actionTimer"] })}
          >
            <option value={0}>No action limit</option>
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
          </LabelSelect>
          <LabelSelect
            label="Discard timer"
            value={room.options.discardTimer ?? DEFAULT_OPTIONS.discardTimer}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ discardTimer: Number(value) as Options["discardTimer"] })}
          >
            <option value={0}>No discard limit</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
          </LabelSelect>
          <LabelSelect
            label="Bot difficulty"
            value={room.options.difficulty}
            disabled={!host || pending}
            onChange={(value) => updateRoomOptions({ difficulty: value as Options["difficulty"] })}
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </LabelSelect>
        </div>
      </fieldset>

      <div className="pregame-start-bar">
        {host ? (
          <>
            <button
              className="btn bot-fill"
              disabled={pending || room.players.length === room.options.seats}
              onClick={() => void fillWithBots()}
            >
              <Bot size={17} /> Fill Empty Seats
            </button>
            <button
              className="btn start-game"
              disabled={pending || room.players.length !== room.options.seats}
              onClick={() => void command({ type: "start" })}
            >
              <Play size={18} /> Start Game
            </button>
          </>
        ) : (
          <div className="waiting"><Users size={20} /> Waiting for the host to start the game</div>
        )}
      </div>
    </section>
  ) : null;
  const pregameChat = room && !game ? (
    <aside className="pregame-chat" aria-labelledby="pregame-chat-title">
      <div className="pregame-chat-heading">
        <MessageCircle size={19} />
        <h2 id="pregame-chat-title">Chat</h2>
      </div>
      <div
        className="pregame-chat-list"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        ref={pregameChatScroll}
        onScroll={(event) => {
          pregameChatPinned.current = isNearLatest(event.currentTarget);
        }}
      >
        {room.chat.length ? (
          room.chat.map((message) => (
            <p key={message.id}>
              <b>{message.name}</b>
              <span>{message.text}</span>
            </p>
          ))
        ) : (
          <div className="pregame-chat-empty">
            <MessageCircle size={26} />
            <p>Invite the crew, then plan your opening move.</p>
          </div>
        )}
      </div>
      <form
        className="pregame-chat-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await command({ type: "chat", text: chat })) setChat("");
        }}
      >
        <input
          aria-label="Lobby chat message"
          value={chat}
          onChange={(event) => setChat(event.target.value)}
          maxLength={240}
          placeholder="Send a message"
        />
        <button aria-label="Send lobby message" disabled={!chat.trim() || pending}>
          <ArrowRight size={18} />
        </button>
      </form>
    </aside>
  ) : null;
  return (
    <main className={`app ${game ? "in-game" : "in-lobby"} ${room && !game ? "pregame" : ""} ${!room ? "home" : ""}`}>
      <Toaster theme={darkMode ? "dark" : "light"} position="top-center" richColors closeButton />
      {motionEnabled && <GameplayEffects cue={animationCue} />}
      <header className="app-header">
        <a
          className="brand"
          href="/"
          aria-label={`${appName} home`}
          onClick={(e) => {
            if (room) {
              e.preventDefault();
              void goHome();
            }
          }}
        >
          <span className="brand-word">{appName}</span>
        </a>
        <div className="header-center">
          {room ? (
            <button className="room-code" onClick={copyRoom}>
              <span>ROOM</span> {room.code}
              <Copy size={14} />
            </button>
          ) : (
            <span className="server-badge">
              <LockKeyhole size={14} /> Private server
            </span>
          )}
        </div>
        <div className="header-actions">
          {authenticated && (
            <span
              className={`connection ${connected ? "online" : ""}`}
              title={connected ? "Connected" : "Reconnecting"}
            >
              {connected ? "Connected" : "Reconnecting…"}
            </span>
          )}
          <button
            className="icon-btn"
            title="How to play"
            aria-label="How to play"
            onClick={() => setModal("rules")}
          >
            <HelpCircle size={20} />
          </button>
          <button
            className="icon-btn sound-btn"
            title={turnAlerts ? "Turn notifications on" : "Turn notifications off"}
            aria-label={turnAlerts ? "Disable turn notifications" : "Enable turn notifications"}
            aria-pressed={turnAlerts}
            onClick={() => void updateTurnAlerts(!turnAlerts)}
          >
            {turnAlerts ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button
            className="icon-btn"
            aria-label="Settings"
            title="Settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>
      <div className="workspace">
        {authenticated && !room && resumeRooms.length > 0 && (
          <section className="resume-shelf" aria-labelledby="ongoing-games">
            <div className="resume-heading">
              <span className="eyebrow">ONGOING GAMES</span>
              <h2 id="ongoing-games">Continue playing</h2>
            </div>
            <div className="resume-list">
              {resumeRooms.map((saved) => {
                const status = saved.paused
                  ? "Paused"
                  : saved.started
                    ? saved.currentPlayer
                      ? `${saved.currentPlayer}'s turn`
                      : "Game in progress"
                    : "Waiting in lobby";
                return (
                  <form
                    className="resume-card"
                    key={saved.code}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void resumeGame(saved.code);
                    }}
                  >
                    <span className="resume-code">{saved.code}</span>
                    <span className="resume-copy">
                      <strong>
                        {boardProfileForPlayers(saved.options.seats).name}
                      </strong>
                      <small>
                        {saved.players.map((p) => p.name).join(", ")}
                      </small>
                    </span>
                    <span className="resume-meta">
                      {status}
                      <small>
                        {saved.players.length}/{saved.options.seats} seats ·{" "}
                        {saved.options.target} points
                      </small>
                    </span>
                    <span className="resume-controls">
                      <button
                        type="submit"
                        className="resume-action"
                        disabled={pending || !connected}
                      >
                        <Play size={16} /> Reconnect
                      </button>
                      <button
                        type="button"
                        className="resume-switch"
                        disabled={pending}
                        onClick={() => setModal("identity")}
                      >
                        Use a different identity
                      </button>
                    </span>
                  </form>
                );
              })}
            </div>
          </section>
        )}
        {room && !game && roster}
        {game && <section className={`table-area ${spectator ? "is-spectating" : ""}`}>
          <div className="table-heading">
            <div>
              <span className="eyebrow">
                {game
                  ? `ROUND ${Math.ceil(game.turn / (game.players.length * (game.options.paired && game.players.length > 4 ? 2 : 1))) || 1}${game.secondary ? " · SPECIAL BUILD PHASE" : ""}`
                  : `PLAY ${appName.toLocaleUpperCase()}`}
              </span>
              <h1>
                {game ? gameModeName(room?.options.seats || 4) : appName}
              </h1>
              {spectator && (
                <span className="spectator-badge">
                  <Eye size={14} /> Spectating
                </span>
              )}
            </div>
            <span className="table-format">
              {boardProfileForPlayers(room?.options.seats || 4).name}
              <small>
                {room?.options.seats || 4} seats · {room?.options.target || 10}{" "}
                points
              </small>
            </span>
          </div>
          <BoardView
            board={board}
            players={boardPlayers}
            robber={
              game?.robber ??
              board.tiles.find((t) => t.terrain === "desert")!.id
            }
            highlights={highlights}
            kind={kind}
            onPick={choose}
            roll={game?.dice.reduce((a, b) => a + b, 0)}
            animation={motionEnabled ? animationCue : null}
            mode={mode}
            onMode={setView}
            selected={selection?.id}
            buildOptions={boardBuildOptions}
            onBuildPick={chooseBuildSite}
            overlay={game && room ? <>
              <div className="board-dice-cluster">
                {showSpecialBuildFlag && (
                  <button
                    className={`special-build-flag ${specialBuildQueued ? "is-queued" : ""}`}
                    type="button"
                    aria-label={specialBuildLabel}
                    aria-pressed={specialBuildQueued}
                    title={specialBuildLabel}
                    disabled={pending || room.paused || !connected}
                    onClick={() =>
                      command({ type: "specialBuild", version: game.version })
                    }
                  >
                    <Flag size={25} fill={specialBuildQueued ? "currentColor" : "none"} />
                  </button>
                )}
                <Dice
                  values={game.dice}
                  onRoll={myTurn && game.phase === "roll" ? () => act({ type: "roll" }) : undefined}
                  disabled={pending || room.paused || !connected}
                />
              </div>
              {!spectator && game.offer && modal !== "trade" && !game.offer.rejected.includes(room.me) && <OfferPanel offer={game.offer} players={room.players} me={room.me} enabled={connected && !pending && !room.paused} act={act} onEdit={editOffer} />}
              {myTurn && game.phase === "steal" && <div className="steal-panel cream-tray"><h3>Steal from</h3>{game.victims.map(id => <button className="victim-choice" key={id} disabled={pending || room.paused} onClick={() => act({ type: "steal", player: id })}><Avatar player={room.players.find(p => p.id === id)!} /><span>{room.players.find(p => p.id === id)?.name}</span></button>)}</div>}
            </> : undefined}
            confirmation={
              selection
                ? {
                    label:
                      selection.type === "robber"
                        ? "Move robber"
                        : `Build ${selection.type}`,
                    onConfirm: confirmPlacement,
                    onCancel: () => setSelection(null),
                    disabled:
                      pending || !connected || !!room?.paused || !!game.offer,
                  }
                : undefined
            }
          />
          {game ? (
            <>
              <div className={`turn-row ${game.deadline && !room?.paused ? "has-clock" : ""}`}>
                <div className={`turn-banner ${myTurn ? "your-turn" : ""}`}>
                  {current && <Avatar player={current} />}
                  <div>
                    <strong>{phaseText}</strong>
                  </div>
                  {myTurn && game.phase === "roll" && (
                    <button
                      className="btn primary roll-btn"
                      disabled={pending || room?.paused || !connected}
                      onClick={() => act({ type: "roll" })}
                    >
                      <Dices size={18} /> Roll dice
                    </button>
                  )}
                  {game.phase === "freeRoad" && myTurn && (
                    <button
                      className="btn subtle"
                      onClick={() => act({ type: "skipRoad" })}
                    >
                      Skip
                    </button>
                  )}
                </div>
                {!room?.paused && (
                  <Clock
                    key={game.deadline ?? "untimed"}
                    deadline={game.deadline}
                    phase={game.phase}
                    tradeOpen={!!game.offer}
                  />
                )}
              </div>
              {spectator ? (
                <>
                  <div className="hand-area spectator-hand">
                    <Eye size={28} />
                    <span>
                      <strong>Watching live</strong>
                      <small>Every player&apos;s hand stays private.</small>
                    </span>
                  </div>
                  <div className="action-dock spectator-actions">
                    <button
                      className="btn spectator-leave"
                      onClick={() => void goHome()}
                    >
                      <LogOut size={18} /> Leave game view
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="hand-area">
                    <div className="resource-hand" aria-label={`Your hand: ${total(hand)} resource cards`}>
                      <CardRow
                        hand={hand}
                        label={modal === "trade" ? "Your resources; select cards to offer" : "Your resources"}
                        onSelect={active || (modal === "trade" && tradeInteractionEnabled) ? selectHandResourceForTrade : undefined}
                      />
                      {!total(hand) && <span className="empty-hand-label">Your resource cards</span>}
                      {!!me?.devCount && (() => {
                        const ownedDevelopment = developmentCardCounts(me.dev || []);
                        return <button className="hand-development-cards" type="button" onClick={() => setModal("cards")} aria-label="View your development cards" style={{ "--development-types": Math.max(ownedDevelopment.length, 1) } as React.CSSProperties}>
                          {ownedDevelopment.map(({ type, count }) => <DevelopmentCard key={type} type={type} count={count} />)}
                        </button>;
                      })()}
                      {!me?.devCount && <button className="empty-dev-button" onClick={() => setModal("cards")} aria-label="View development cards"><Sprite name="development" /></button>}
                    </div>
                  </div>
                  <div className="action-dock">{controls}</div>
                </>
              )}
            </>
          ) : (
            <div className="table-note">
              <Anchor size={17} />
              <span>
                A private table. Familiar rules. Room for the whole crew.
              </span>
              <span>2D & 3D</span>
            </div>
          )}
        </section>}
        {game && (
          <aside className="game-sidebar">
            {activity}
            <section className="bank-strip" aria-label="Bank resource supply">
              <Sprite name="bank" />
              {RESOURCES.map(r => <GameCard key={r} resource={r} count={game.bank[r]} label={`${game.bank[r]} ${TERRAIN[r].label} in bank`} />)}
              <GameCard resource="development" count={game.deckCount} label={`${game.deckCount} development cards in bank`} />
            </section>
            {roster}
          </aside>
        )}
        {pregameCenter}
        {pregameChat}
        {!game && !room && (
          <aside className="action-panel">
            {!authenticated ? (
              <div className="entry-loading" role="status" aria-live="polite">
                <div className="eyebrow">{appName.toLocaleUpperCase()}</div>
                <h2>{loading ? "Pulling up a chair…" : "Unable to connect"}</h2>
                <p className="muted">
                  {loading
                    ? "Starting a private player session."
                    : "Refresh when the local game server is available."}
                </p>
              </div>
            ) : (
              <>
                <div className="eyebrow">NEW GAME</div>
                <h2>Create or join</h2>
                <Tabs
                  value={entry}
                  onValueChange={(v) => setEntry(v as "host" | "join")}
                >
                  <TabsList className="entry-tabs">
                    <TabsTrigger value="host">Host a game</TabsTrigger>
                    <TabsTrigger value="join">Join friends</TabsTrigger>
                  </TabsList>
                </Tabs>
                <form className="entry-form" onSubmit={createOrJoin}>
                  <label className="field">
                    <span>
                      Your name
                    </span>
                    <input
                      aria-label="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={20}
                      placeholder="What should we call you?"
                      autoComplete="off"
                    />
                  </label>
                  {entry === "join" ? (
                    <>
                      <label className="field">
                        <span>Room code</span>
                        <input
                          aria-label="Room code"
                          className="code-field"
                          value={code}
                          onChange={(e) =>
                            setCode(e.target.value.toUpperCase().slice(0, 16))
                          }
                          required
                          pattern="[A-F0-9]{16}"
                          placeholder="A1B2C3D4E5F60718"
                        />
                      </label>
                      <p className="fine-print watch-note">
                        If the game is underway, you&apos;ll enter as a read-only spectator.
                      </p>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        <span>Creator password</span>
                        <input
                          aria-label="Creator password"
                          type="text"
                          value={creationPassword}
                          onChange={(e) => setCreationPassword(e.target.value)}
                          autoComplete="off"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          required
                          minLength={12}
                          maxLength={256}
                          placeholder="Required to create a game"
                        />
                      </label>
                      <div className="private-note">
                        <Shield size={18} />
                        <span>
                          Only people with this password can create a room.
                          Guests join with the room code—no password needed.
                        </span>
                      </div>
                    </>
                  )}
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={
                      pending ||
                      !connected ||
                      (entry === "host" && resumeRooms.length > 0)
                    }
                  >
                    {entry === "host"
                      ? "Create private room"
                      : "Join or watch"}
                    <ArrowRight size={17} />
                  </button>
                  {resumeRooms.length > 0 && (
                    <p className="fine-print ongoing-note">
                      Reconnect to your ongoing table above before starting
                      another game.
                    </p>
                  )}
                </form>
              </>
            )}
          </aside>
        )}
        {authenticated && !room && (
          <section className="community-hall" aria-labelledby="community-title">
            <header className="community-heading">
              <span className="community-emblem" aria-hidden="true">
                <Trophy size={22} />
              </span>
              <div>
                <span className="eyebrow">SHARED HISTORY</span>
                <h2 id="community-title">Leaderboard &amp; Flock</h2>
                <p>
                  Games that begin with at least three human players are
                  official. Disconnects, bot takeovers and automated turns do
                  not remove them from the record.
                </p>
              </div>
              <strong>{community.totalGames} official games</strong>
            </header>
            {community.pendingSheep.length > 0 && (
              <div className="sheep-rights" aria-label="Sheep naming rewards">
                <Sprite name="sheep" />
                <div>
                  <strong>
                    You earned {community.pendingSheep.length === 1 ? "a sheep" : `${community.pendingSheep.length} sheep`}!
                  </strong>
                  <span>Name one for each official game you won.</span>
                </div>
                <div className="sheep-right-actions">
                  {community.pendingSheep.map((right) => (
                    <button
                      className="btn primary"
                      key={right.matchId}
                      disabled={pending}
                      onClick={() => openSheepNaming(right)}
                    >
                      Name sheep · {right.roomCode}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="community-grid">
              <article className="community-panel leaderboard-panel">
                <div className="community-panel-title">
                  <div>
                    <span className="eyebrow">OFFICIAL GAMES</span>
                    <h3>Global leaderboard</h3>
                  </div>
                  <Trophy size={24} aria-hidden="true" />
                </div>
                {community.leaderboard.length ? (
                  <div className="leaderboard-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Player</th>
                          <th>Wins</th>
                          <th>Games</th>
                          <th>Win rate</th>
                          <th>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {community.leaderboard.map((entry) => (
                          <tr key={entry.name.toLocaleLowerCase()}>
                            <td>
                              <span className={`leaderboard-rank rank-${Math.min(entry.rank, 4)}`}>
                                {entry.rank}
                              </span>
                            </td>
                            <th scope="row">{entry.name}</th>
                            <td><b>{entry.wins}</b></td>
                            <td>{entry.games}</td>
                            <td>{entry.winRate}%</td>
                            <td>{entry.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="community-empty">
                    <Trophy size={30} />
                    <strong>The first crown is waiting.</strong>
                    <span>Finish a game that starts with at least three human players to begin the standings.</span>
                  </div>
                )}
              </article>
              <article className="community-panel flock-panel">
                <div className="community-panel-title">
                  <div>
                    <span className="eyebrow">NAMED BY CHAMPIONS</span>
                    <h3>The Flock</h3>
                  </div>
                  <Sprite name="sheep" />
                </div>
                {community.flock.length ? (
                  <div className="flock-grid">
                    {community.flock.map((sheep) => (
                      <div className="flock-card" key={sheep.id}>
                        <span className="flock-sheep">
                          <Sprite name="sheep" />
                        </span>
                        <div>
                          <strong>{sheep.name}</strong>
                          <span>Named by {sheep.winner}</span>
                          <small>
                            {sheep.score} points · {sheep.players} players ·{" "}
                            {communityDate.format(sheep.wonAt)}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="community-empty flock-empty">
                    <Sprite name="sheep" />
                    <strong>The pasture is ready.</strong>
                    <span>Each official winner gets to name one sheep.</span>
                  </div>
                )}
              </article>
            </div>
          </section>
        )}
      </div>
      <footer className="app-footer">
        <span>
          <Shield size={12} /> Private game
        </span>
        <span>{appName}</span>
        <button onClick={() => setModal("rules")}>Rules & costs</button>
      </footer>
      {gameResults && (() => {
        const winner = gameResults.players.find(
          (player) => player.id === gameResults.winnerId,
        );
        return <section className="game-results-screen" role="dialog" aria-modal="true" aria-labelledby="game-results-title">
          <div className="game-results-card">
            <header className="game-results-heading">
              <span className="game-results-trophy" aria-hidden="true"><Trophy /></span>
              <div>
                <span className="eyebrow">FINAL RESULTS</span>
                <h2 id="game-results-title">{winner?.name || "The winner"} wins!</h2>
                <p>
                  {gameResults.official
                    ? `Official game ${gameResults.roomCode}. The winner earned a sheep to name.`
                    : `Friendly game ${gameResults.roomCode}. Games need at least three human players at the start to count.`}
                </p>
                <div
                  className="game-results-runtime"
                  aria-label={`Total game time ${formatGameDuration(gameResults.durationMs)}`}
                >
                  <Timer aria-hidden="true" />
                  <span>Total game time</span>
                  <strong>{formatGameDuration(gameResults.durationMs)}</strong>
                </div>
              </div>
            </header>
            <div className="game-results-table" role="table" aria-label="Final victory point breakdown">
              <div className="game-results-row game-results-labels" role="row">
                <span role="columnheader">Player</span>
                <span role="columnheader">Settlements</span>
                <span role="columnheader">Cities</span>
                <span role="columnheader">Longest road</span>
                <span role="columnheader">Largest army</span>
                <span role="columnheader">Victory cards</span>
                <span role="columnheader">Total</span>
              </div>
              {gameResults.players.map((player, index) => {
                const won = player.id === gameResults.winnerId;
                return <div className={`game-results-row ${won ? "is-winner" : ""}`} role="row" key={player.id}>
                  <div className="game-results-player" role="cell">
                    <b className="game-results-rank">{index + 1}</b>
                    <Avatar player={player} />
                    <strong>{player.name}</strong>
                    {won && <Crown aria-label="Winner" />}
                  </div>
                  <span className="game-results-source" data-label="Settlements" role="cell"><Sprite name="settlement" /><b>{player.settlements}</b></span>
                  <span className="game-results-source" data-label="Cities" role="cell" aria-label={`${player.cities} cities worth ${player.cities * 2} points`}><Sprite name="city" /><b>{player.cities * 2}</b></span>
                  <span className="game-results-source" data-label="Longest road" role="cell"><Sprite name="route" /><b>{player.longestRoad}</b></span>
                  <span className="game-results-source" data-label="Largest army" role="cell"><Sprite name="knight" /><b>{player.largestArmy}</b></span>
                  <span className="game-results-source" data-label="Victory cards" role="cell"><Trophy /><b>{player.victoryCards}</b></span>
                  <span className="game-results-total" data-label="Total" role="cell"><b>{player.total}</b></span>
                </div>;
              })}
            </div>
            <div className="game-results-actions">
              <button className="btn primary" autoFocus onClick={() => setGameResults(null)}>Done</button>
            </div>
          </div>
        </section>;
      })()}
      {game && me && <TradeComposer open={modal === "trade"} onClose={() => setModal(null)} game={game} me={me} hand={hand} give={give} want={want} setGive={setGive} setWant={setWant} counterId={counterId} enabled={tradeInteractionEnabled} act={act} />}
      <Dialog
        open={modal === "color"}
        onOpenChange={(open) => !open && setModal(null)}
      >
        <DialogContent className="game-dialog player-color-dialog">
          <DialogTitle>Choose your color</DialogTitle>
          <DialogDescription>
            Your color is used for your roads, settlements, cities, and player card.
          </DialogDescription>
          <div className="player-color-grid">
            {PLAYER_COLORS.map(({ label, value }) => {
              const owner = room?.players.find(
                (player) => player.id !== room.me && player.color === value,
              );
              const selected = me?.color === value;
              return (
                <button
                  key={value}
                  className={`player-color-option ${selected ? "is-selected" : ""}`}
                  type="button"
                  style={{ "--swatch": value } as React.CSSProperties}
                  aria-label={`${label}${owner ? `, taken by ${owner.name}` : ""}`}
                  aria-pressed={selected}
                  title={owner ? `${label} is taken by ${owner.name}` : label}
                  disabled={!!owner || pending || !!game}
                  onClick={async () => {
                    if (await command({ type: "color", color: value })) {
                      localStorage.setItem("game-player-color", value);
                      setModal(null);
                    }
                  }}
                >
                  <span className="player-color-swatch" />
                  <span>{label}</span>
                  {selected && <Check aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "identity"}
        onOpenChange={(open) => !open && setModal(null)}
      >
        <DialogContent className="game-dialog identity-dialog">
          <DialogTitle>Who is using this browser?</DialogTitle>
          <DialogDescription>
            This browser has a private key for reconnecting to an existing seat.
            It is not based on your Wi-Fi or IP address, and your name is never
            filled in automatically.
          </DialogDescription>
          <div className="identity-explainer">
            <Shield size={28} aria-hidden="true" />
            <p>
              Starting fresh replaces the key only in this browser. The old seat
              stays safely in its game and remains available anywhere that still
              has its original key.
            </p>
          </div>
          <div className="identity-actions">
            <button className="btn subtle" onClick={() => setModal(null)}>
              Keep this identity
            </button>
            <button
              className="btn primary"
              disabled={pending}
              onClick={() => void startFreshIdentity()}
            >
              Start as someone else
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "sheep"}
        onOpenChange={(open) => !open && setModal(null)}
      >
        <DialogContent className="game-dialog sheep-dialog">
          <div className="sheep-dialog-hero" aria-hidden="true">
            <Sprite name="sheep" />
          </div>
          <DialogTitle>Name your champion sheep</DialogTitle>
          <DialogDescription>
            This sheep celebrates your {selectedSheepRight?.score || "winning"}-point
            victory at table {selectedSheepRight?.roomCode || "—"}. Its name will
            be visible to everyone in the Flock.
          </DialogDescription>
          <form className="sheep-name-form" onSubmit={submitSheepName}>
            <label className="field">
              <span>Sheep name</span>
              <input
                autoFocus
                value={sheepName}
                onChange={(event) => setSheepName(event.target.value)}
                maxLength={24}
                required
                placeholder="Wooliam"
                autoComplete="off"
              />
              <small>{[...sheepName].length}/24 characters</small>
            </label>
            <button
              className="btn primary"
              type="submit"
              disabled={pending || !connected || !sheepName.trim() || !selectedSheepRight}
            >
              Add to the Flock
            </button>
          </form>
          <p className="fine-print">
            Names must include a letter or number and cannot duplicate another
            sheep in the Flock. Each win can name exactly one sheep.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={!!game?.discards[room?.me || ""]}>
        <DialogContent
          className="game-dialog"
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogTitle>Discard cards</DialogTitle>
          <DialogDescription>
            Select {game?.discards[room?.me || ""]} cards to return to the bank.
          </DialogDescription>
          <CardPicker
            value={discard}
            onChange={updateDiscardSelection}
            max={hand}
            maxTotal={game?.discards[room?.me || ""]}
            label="Discard"
          />
          <button
            className="btn primary"
            disabled={
              pending ||
              !connected ||
              room?.paused ||
              total(discard) !== game?.discards[room?.me || ""]
            }
            onClick={() => act({ type: "discard", cards: discard })}
          >
            Discard {total(discard)} / {game?.discards[room?.me || ""]}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "cards"}
        onOpenChange={(v) => {
          if (!v) {
            setModal(null);
            setDevChoiceCard(null);
          }
        }}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>Your development cards</DialogTitle>
          <DialogDescription>
            Play one per turn. New cards become available on your next turn.
            Victory points count automatically.
          </DialogDescription>
          {me?.dev?.length ? (
            <div className="dev-list">
              {me.dev.map((d, i) => (
                <div
                  key={i}
                  className={`dev-card${activeResourceChoiceCard === d.type ? " resource-selected" : ""}`}
                >
                  <DevelopmentCard type={d.type} />
                  <div>
                    <b>{devNames[d.type]}</b>
                    <small>
                      {d.type === "victory"
                        ? "+1 secret victory point"
                        : d.bought === game?.turn
                          ? "Available next turn"
                          : d.type === "knight"
                            ? "Move the robber and grow your army"
                            : d.type === "roadBuilding"
                              ? "Build up to two roads for free"
                              : d.type === "plenty"
                                ? "Take two resources from the bank"
                                : "Take all of one resource from the crew"}
                    </small>
                  </div>
                  {d.type !== "victory" && (
                    <button
                      className="btn subtle"
                      disabled={
                        !myTurn ||
                        pending ||
                        !connected ||
                        room?.paused ||
                        !!game?.offer ||
                        me.playedDev ||
                        d.bought === game?.turn ||
                        !["roll", "main"].includes(game?.phase || "")
                      }
                      onClick={async () => {
                        if (isResourceChoiceDevelopmentCard(d.type)) {
                          setDevChoiceCard(d.type);
                          return;
                        }
                        if (
                          await act({
                            type: "dev",
                            card: d.type as Exclude<Dev, "victory">,
                          })
                        ) {
                          setDevChoiceCard(null);
                          setModal(null);
                        }
                      }}
                      aria-pressed={
                        isResourceChoiceDevelopmentCard(d.type)
                          ? activeResourceChoiceCard === d.type
                          : undefined
                      }
                    >
                      {isResourceChoiceDevelopmentCard(d.type)
                        ? activeResourceChoiceCard === d.type
                          ? "Choosing"
                          : "Choose"
                        : "Play"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              No cards yet. Buy one for a sheep, wheat, and ore.
            </p>
          )}
          {activeResourceChoiceCard && (
            <div className="dev-resource-choice">
              <div className="dev-resource-heading">
                <h3>
                  {activeResourceChoiceCard === "monopoly"
                    ? "Choose one resource"
                    : "Choose two resources"}
                </h3>
                <p>
                  {activeResourceChoiceCard === "monopoly"
                    ? "Take every card of this type from the other players."
                    : "Take these two cards from the bank. You may choose the same type twice."}
                </p>
              </div>
              <div className="cards-row">
                {RESOURCES.map((resource) => (
                  <GameCard
                    key={resource}
                    resource={resource}
                    selected={devChoice[0] === resource}
                    label={`Choose ${TERRAIN[resource].label}`}
                    onClick={() => setDevChoice([resource, devChoice[1]])}
                  />
                ))}
              </div>
              {activeResourceChoiceCount === 2 && (
                <>
                  <h3>Second resource</h3>
                  <div className="cards-row">
                    {RESOURCES.map((resource) => (
                      <GameCard
                        key={resource}
                        resource={resource}
                        selected={devChoice[1] === resource}
                        label={`Choose ${TERRAIN[resource].label} as the second resource`}
                        onClick={() => setDevChoice([devChoice[0], resource])}
                      />
                    ))}
                  </div>
                </>
              )}
              <button
                className="btn primary dev-resource-play"
                disabled={
                  !activeResourceCardIsPlayable ||
                  !myTurn ||
                  pending ||
                  !connected ||
                  room?.paused ||
                  !!game?.offer ||
                  me?.playedDev ||
                  !["roll", "main"].includes(game?.phase || "")
                }
                onClick={async () => {
                  if (
                    await act({
                      type: "dev",
                      card: activeResourceChoiceCard,
                      resources: devChoice.slice(0, activeResourceChoiceCount),
                    })
                  ) {
                    setDevChoiceCard(null);
                    setModal(null);
                  }
                }}
              >
                Play {devNames[activeResourceChoiceCard]}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "settings"}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            {room ? (
              <>
                {room.code} · {room.options.seats} seats · {room.options.target}{" "}
                points ·{" "}
                {room.options.timer ? `${room.options.timer}s turns` : "Untimed turns"}
                {" · "}
                {(room.options.turnActionBonus ?? DEFAULT_OPTIONS.turnActionBonus)
                  ? `+${room.options.turnActionBonus ?? DEFAULT_OPTIONS.turnActionBonus}s after builds/cards`
                  : "No action time bonus"}
                {" · "}
                {(room.options.tradeTimer ?? DEFAULT_OPTIONS.tradeTimer)
                  ? `${room.options.tradeTimer ?? DEFAULT_OPTIONS.tradeTimer}s player trades`
                  : "Untimed player trades"}
                {" · "}
                {(room.options.postTradeTimer ?? DEFAULT_OPTIONS.postTradeTimer)
                  ? `at least ${room.options.postTradeTimer ?? DEFAULT_OPTIONS.postTradeTimer}s after trades`
                  : "No post-trade minimum"}
                {" · "}
                {(room.options.setupSettlementTimer ?? DEFAULT_OPTIONS.setupSettlementTimer)
                  ? `${room.options.setupSettlementTimer ?? DEFAULT_OPTIONS.setupSettlementTimer}s opening settlements`
                  : "Untimed opening settlements"}
                {" · "}
                {(room.options.setupRoadTimer ?? DEFAULT_OPTIONS.setupRoadTimer)
                  ? `${room.options.setupRoadTimer ?? DEFAULT_OPTIONS.setupRoadTimer}s opening roads`
                  : "Untimed opening roads"}
                {" · "}
                {(room.options.robberTimer ?? DEFAULT_OPTIONS.robberTimer)
                  ? `${room.options.robberTimer ?? DEFAULT_OPTIONS.robberTimer}s robber placements`
                  : "Untimed robber placements"}
                {" · "}
                {(room.options.actionTimer ?? DEFAULT_OPTIONS.actionTimer)
                  ? `${room.options.actionTimer ?? DEFAULT_OPTIONS.actionTimer}s actions`
                  : "Untimed actions"}
                {" · "}
                {(room.options.discardTimer ?? DEFAULT_OPTIONS.discardTimer)
                  ? `${room.options.discardTimer ?? DEFAULT_OPTIONS.discardTimer}s discards`
                  : "Untimed discards"}
                {room.options.showDiscardedCards ? " · visible discards" : " · anonymous discards"}
                {room.options.linkedTwoTwelve ? " · 2 and 12 linked" : ""}
              </>
            ) : (
              "These preferences apply only to this browser."
            )}
          </DialogDescription>
          <section
            className="client-alert-settings client-theme-settings"
            aria-labelledby="appearance-settings"
          >
            <div className="client-alert-heading">
              {darkMode ? <Moon size={22} aria-hidden="true" /> : <Sun size={22} aria-hidden="true" />}
              <span>
                <h3 id="appearance-settings">Dark mode</h3>
                <small>Use darker panels and controls on this browser.</small>
              </span>
              <Switch
                checked={darkMode}
                onCheckedChange={updateDarkMode}
                aria-label="Dark mode"
              />
            </div>
          </section>
          <section
            className="client-alert-settings"
            aria-labelledby="turn-notification-settings"
          >
            <div className="client-alert-heading">
              <span>
                <h3 id="turn-notification-settings">Turn notifications</h3>
                <small>
                  Play an alert when this browser needs your attention. Off by
                  default and never changes another player&apos;s settings.
                </small>
              </span>
              <Switch
                checked={turnAlerts}
                onCheckedChange={(enabled) => void updateTurnAlerts(enabled)}
                aria-label="Turn notifications"
              />
            </div>
            <div className="client-alert-volume">
              <VolumeX size={18} aria-hidden="true" />
              <div>
                <label htmlFor="turn-alert-volume">
                  Volume <output>{turnAlertVolume}%</output>
                </label>
                <Slider
                  id="turn-alert-volume"
                  value={[turnAlertVolume]}
                  min={0}
                  max={100}
                  step={5}
                  disabled={!turnAlerts}
                  onValueChange={(values) => updateTurnAlertVolume(values[0])}
                  aria-label="Turn notification volume"
                />
              </div>
              <Volume2 size={18} aria-hidden="true" />
            </div>
            <button
              className="btn subtle client-alert-preview"
              disabled={!turnAlerts || turnAlertVolume === 0}
              onClick={() => void previewTurnAlert()}
            >
              Test sound
            </button>
          </section>
          <section
            className="client-alert-settings client-animation-settings"
            aria-labelledby="gameplay-animation-settings"
          >
            <div className="client-alert-heading">
              <Sparkles size={22} aria-hidden="true" />
              <span>
                <h3 id="gameplay-animation-settings">Gameplay animations</h3>
                <small>
                  {reducedMotion
                    ? "Your device’s reduced-motion setting is active, so movement is paused."
                    : "Animate dice production, resource deliveries, building placement and robber movement on this browser."}
                </small>
              </span>
              <Switch
                checked={animationsEnabled}
                onCheckedChange={updateAnimations}
                aria-label="Gameplay animations"
              />
            </div>
          </section>
          {host && game && (
            <>
              <button
                className="btn subtle"
                disabled={pending || !connected}
                onClick={() => command({ type: "pause" })}
              >
                {room?.paused ? <Play size={17} /> : <Pause size={17} />}{" "}
                {room?.paused ? "Resume game" : "Pause game"}
              </button>
              <h3>Bot assistance</h3>
              <p className="fine-print">
                A seat switches to bot control after its player is disconnected
                for two minutes while others remain. Reconnecting automatically
                returns control. You can also manage assistance here.
              </p>
              {room?.players
                .filter(
                  (p) =>
                    !p.bot && (p.id === room.me || !p.connected || p.automated),
                )
                .map((p) => (
                  <label className="switch-row" key={p.id}>
                    <span>{p.name}</span>
                    <Switch
                      checked={!!p.automated}
                      onCheckedChange={() =>
                        command({ type: "takeover", id: p.id })
                      }
                      aria-label={`Bot assistance for ${p.name}`}
                    />
                  </label>
                ))}
              <h3>Player management</h3>
              <p className="fine-print">
                Removing a player ends their access to this seat immediately.
                A bot keeps their cards, pieces, score, and place in the turn
                order.
              </p>
              {room?.players
                .filter((player) => !player.bot && player.id !== room.host)
                .map((player) => (
                  <div className="player-management-row" key={player.id}>
                    <span>
                      <strong>{player.name}</strong>
                      <small>
                        {player.connected ? "Connected" : "Disconnected"}
                      </small>
                    </span>
                    <button
                      className="btn danger"
                      disabled={pending}
                      onClick={() => {
                        setRemovePlayerId(player.id);
                        setModal("remove-player");
                      }}
                    >
                      Replace with bot
                    </button>
                  </div>
                ))}
            </>
          )}
          {spectator ? (
            <div className="spectator-settings-note">
              <Eye size={22} aria-hidden="true" />
              <span>
                <strong>You&apos;re watching this game.</strong>
                <small>Spectators cannot see hands, send chat messages, or make moves.</small>
              </span>
              <button
                className="btn subtle"
                onClick={() => void goHome()}
              >
                <LogOut size={17} /> Leave game view
              </button>
            </div>
          ) : host && game ? (
            <button className="btn danger" onClick={() => setModal("close")}>
              Close this table
            </button>
          ) : game ? (
            <p className="muted">
              Only the host can pause or close this table. The Home screen
              keeps a reconnect option for your saved seat.
            </p>
          ) : null}
          {!spectator && (
            <p className="fine-print">
              Games save automatically. Closing the browser keeps your seat for
              seven days.
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "remove-player" && !!playerToRemove}
        onOpenChange={(open) => {
          if (!open) {
            setModal("settings");
            setRemovePlayerId(null);
          }
        }}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>Replace {playerToRemove?.name} with a bot?</DialogTitle>
          <DialogDescription>
            This immediately removes the player from their seat. A bot will
            continue with the same cards, pieces, score, and turn position.
          </DialogDescription>
          <div className="move-buttons">
            <button
              className="btn subtle"
              onClick={() => {
                setModal("settings");
                setRemovePlayerId(null);
              }}
            >
              Keep player
            </button>
            <button
              className="btn danger"
              disabled={pending}
              onClick={async () => {
                if (
                  removePlayerId &&
                  await command({ type: "remove", id: removePlayerId })
                ) {
                  setModal("settings");
                  setRemovePlayerId(null);
                }
              }}
            >
              Replace with bot
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "close"}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>Close the table?</DialogTitle>
          <DialogDescription>
            This ends the room for everyone and removes its saved game. This
            cannot be undone.
          </DialogDescription>
          <div className="move-buttons">
            <button className="btn subtle" onClick={() => setModal("settings")}>
              Keep playing
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                if (await command({ type: "close" })) setModal(null);
              }}
            >
              Close table
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "rules"}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="game-dialog rules-dialog">
          <DialogTitle>Welcome to {appName}</DialogTitle>
          <DialogDescription>
            A private island trading game for your crew.
          </DialogDescription>
          <div className="rules-content">
            <h3>Initial placement</h3>
            <p>
              Place a settlement and connected road, then place another in
              reverse player order. Keep at least one empty corner between
              settlements. Your second settlement gives you its adjacent
              starting resources.
            </p>
            <h3>Roll, trade, build</h3>
            <p>
              Two dice produce resources on matching numbers. Each adjacent
              settlement receives one card; each city receives two. The robber
              blocks its hex. Trade with the bank at 4:1, general ports at 3:1,
              or resource ports at 2:1. Player trades must involve the active
              primary player. Other players approve a public offer, then its
              creator chooses which approving player to trade with. When Link
              2 &amp; 12 is enabled, rolling either number produces resources
              from both 2 and 12 hexes.
            </p>
            <div className="rules-costs">
              {Object.entries(COSTS).map(([name, cost]) => (
                <div key={name}>
                  <b>{name}</b>
                  <CardRow hand={{ ...emptyHand(), ...cost }} label={`${name} cost`} />
                </div>
              ))}
            </div>
            <h3>Seven & the robber</h3>
            <p>
              Players holding more than seven resources discard half, rounded
              down. The active player moves the robber to a different hex and
              steals one random card from an adjacent opponent. Friendly robber
              protects opponents on two or fewer visible points.
            </p>
            <h3>Development cards</h3>
            <p>
              Knights move the robber. Road Building gives up to two free roads.
              Year of Plenty takes two available bank cards. Monopoly collects a
              chosen resource from opponents. Victory cards are secret points.
              Play one card per turn, never one bought that turn; cards may be
              played before rolling.
            </p>
            <h3>Win the island</h3>
            <p>
              Settlements score 1; cities score 2. A connected road of at least
              five edges can earn Longest Road (+2); three played knights can
              earn Largest Army (+2). Ties leave the award with its current
              holder. Roads cannot pass through opponents’ settlements. Reach
              the target on your own turn to win.
            </p>
            <h3>Five or more players</h3>
            <p>
              The island, bank, ports and development deck grow with the table,
              from 2 up to 12 players. With special build enabled at tables of
              five or more, use the flag beside the dice during another
              player&apos;s turn to request your next eligible phase. A request
              is used once: when the player three seats behind you finishes,
              you may build, trade with the bank and play an older development
              card, but cannot roll or trade with players.
            </p>
            <h3>Bots & controls</h3>
            <p>
              Easy bots choose more varied starting sites. Normal bots
              prioritize production and expansion. Hard bots also balance
              resource coverage. Bots use legal moves and public board
              information. Switch between 2D and 3D at any time; drag 3D to
              orbit and pinch to zoom. Required actions use their own short
              clock, discards use a separate longer clock, and both are separate
              from the normal turn clock. An expired action is completed with a
              random legal choice; an expired turn is finished with bot
              assistance.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
