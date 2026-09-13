import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { ArrowBigDown as ArrowDown, ArrowBigUp as ArrowUp, Check, ChevronsRight, Landmark, Pencil, Route, Trophy, Wheat, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RESOURCES, bankTradeUnits, total, type Action, type Dev, type GameView, type Hand, type Offer, type PublicPlayer, type Resource } from "../shared/game";
import { spriteBackgroundPosition, type SpriteName } from "./sprites";

export type { SpriteName } from "./sprites";
export const resourceNames = { wood: "Wood", brick: "Brick", sheep: "Sheep", wheat: "Wheat", ore: "Ore" };
export function Sprite({ name, className = "" }: { name: SpriteName; className?: string }) {
  return <span aria-hidden="true" className={`game-sprite ${className}`} style={{ backgroundPosition: spriteBackgroundPosition(name) }} />;
}
export function GameCard({ resource, count, label, onClick, disabled, selected = false }: {
  resource: Resource | "unknown" | "development"; count?: number; label?: string;
  onClick?: () => void; disabled?: boolean; selected?: boolean;
}) {
  const title = label || `${count ?? ""} ${resource === "unknown" ? "Resource cards" : resource === "development" ? "Development cards" : resourceNames[resource]}`.trim();
  const className = `game-card ${resource} ${count && count > 1 ? "stacked" : ""} ${selected ? "selected" : ""}`;
  const contents = <><span className="card-face"><Sprite name={resource} /></span>{count !== undefined && <b className="card-count">{count}</b>}</>;
  return onClick ? <button className={className} type="button" onClick={onClick} disabled={disabled} aria-label={title} title={title} aria-pressed={selected}>{contents}</button>
    : <span className={className} role="img" aria-label={title} title={title}>{contents}</span>;
}
const developmentCardNames: Record<Dev, string> = {
  knight: "Knight",
  roadBuilding: "Road Building",
  plenty: "Year of Plenty",
  monopoly: "Monopoly",
  victory: "Victory Point",
};
export function DevelopmentCard({ type, count, label }: { type: Dev; count?: number; label?: string }) {
  const title = label || `${count && count > 1 ? `${count} ` : ""}${developmentCardNames[type]}`;
  const icon = type === "knight" ? <Sprite name="knight" />
    : type === "roadBuilding" ? <Route />
      : type === "plenty" ? <Wheat />
        : type === "monopoly" ? <Landmark />
          : <Trophy />;
  return <span className={`game-card development known-development-card dev-${type}`} role="img" aria-label={title} title={title}>
    <span className="card-face"><span className="development-emblem">{icon}</span></span>
    {count !== undefined && <b className="card-count">{count}</b>}
  </span>;
}
type LogIcon = { sprite: SpriteName; count?: number; label: string; card: boolean; development?: Dev };
const logAction = /\b(?:begins|got|gets|builds|upgrades|moves|plays|buys|claims|discards|steals|trades|offers|makes|wins|bank)\b/i;
const logNoun = /\b(?:(\d+)\s+)?(development cards?|dev cards?|year of plenty|road building|largest army|longest road|monopoly|knights?|robber|settlements?|cities|city|roads?|wood|bricks?|sheep|wheat|ore|cards?|bank)\b/gi;
function logIcon(term: string, count?: number): LogIcon {
  const noun = term.toLowerCase();
  if (noun === "wood" || noun === "sheep" || noun === "wheat" || noun === "ore")
    return { sprite: noun, count, label: resourceNames[noun], card: true };
  if (noun === "brick" || noun === "bricks")
    return { sprite: "brick", count, label: resourceNames.brick, card: true };
  if (noun === "year of plenty")
    return { sprite: "development", label: term, card: true, development: "plenty" };
  if (noun === "road building")
    return { sprite: "development", label: term, card: true, development: "roadBuilding" };
  if (noun === "monopoly")
    return { sprite: "development", label: term, card: true, development: "monopoly" };
  if (noun === "knight" || noun === "knights")
    return { sprite: "development", label: term, card: true, development: "knight" };
  if (noun.includes("development") || noun.startsWith("dev "))
    return { sprite: "development", count, label: term, card: true };
  if (noun === "card" || noun === "cards")
    return { sprite: "unknown", count, label: "Resource card", card: true };
  if (noun === "robber" || noun === "largest army")
    return { sprite: "knight", count, label: term, card: false };
  if (noun === "longest road") return { sprite: "route", count, label: term, card: false };
  if (noun === "settlement" || noun === "settlements") return { sprite: "settlement", count, label: term, card: false };
  if (noun === "city" || noun === "cities") return { sprite: "city", count, label: term, card: false };
  if (noun === "road" || noun === "roads") return { sprite: "road", count, label: term, card: false };
  return { sprite: "bank", count, label: term, card: false };
}
export function LogMessage({
  text,
  actor,
}: {
  text: string;
  actor?: Pick<PublicPlayer, "name" | "color">;
}) {
  const actionAt = logAction.exec(text)?.index;
  if (actionAt === undefined) return <>{text}</>;
  const prefix = text.slice(0, actionAt);
  const action = text.slice(actionAt).replace(/\.$/, "");
  const visual: ReactNode[] = actor && prefix.startsWith(actor.name)
    ? [
        <strong
          className="log-player-name"
          key="player"
          style={{ "--player": actor.color } as CSSProperties}
        >
          {actor.name}
        </strong>,
        prefix.slice(actor.name.length),
      ]
    : [prefix];
  let cursor = 0;
  for (const match of action.matchAll(logNoun)) {
    const index = match.index;
    if (index > cursor) visual.push(action.slice(cursor, index));
    const count = match[1] ? Number(match[1]) : undefined;
    const icon = logIcon(match[2], count);
    visual.push(icon.development
      ? <span className="log-card-token" key={`${index}-${match[0]}`} title={match[0]}><DevelopmentCard type={icon.development} label={match[0]} /></span>
      : icon.card
      ? <span className="log-card-token" key={`${index}-${match[0]}`} title={match[0]}><GameCard resource={icon.sprite as Resource | "unknown" | "development"} count={count} label={match[0]} /></span>
      : <span className="log-piece-token" key={`${index}-${match[0]}`} role="img" aria-label={match[0]} title={match[0]}><Sprite name={icon.sprite} />{count && count > 1 ? <b>{count}</b> : null}</span>);
    cursor = index + match[0].length;
  }
  visual.push(action.slice(cursor));
  return <><span className="sr-only">{text}</span><span className="log-rich-text" aria-hidden="true">{visual}</span></>;
}
export function Avatar({ player, score }: { player: Pick<PublicPlayer, "name" | "color" | "bot">; score?: number }) {
  return <span className="avatar-badge" style={{ "--player": player.color } as CSSProperties} title={player.name}>
    <span className="avatar-disc"><Sprite name={player.bot ? "bot" : "person"} /></span>
    {score !== undefined && <span className="score-ribbon" aria-label={`${score} victory points`}>{score}</span>}
  </span>;
}
export function ActionTile({ label, children, count, selected, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; count?: number; selected?: boolean }) {
  return <TooltipProvider delayDuration={250}><Tooltip><TooltipTrigger asChild>
    <button {...props} className={`action-tile ${selected ? "selected" : ""} ${className}`} type="button" aria-label={label} aria-pressed={selected} title={label}>
      {children}{count !== undefined && <span className="action-count">{count}</span>}
    </button>
  </TooltipTrigger><TooltipContent className="game-tooltip" side="top">{label}</TooltipContent></Tooltip></TooltipProvider>;
}
export function Dice({ values, onRoll, disabled = false }: { values: number[]; onRoll?: () => void; disabled?: boolean }) {
  const pips: Record<number, number[]> = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const displayValues = values.length ? values : [1, 1];
  const dice = <>
    {displayValues.map((n, i) => <span className={`die ${values.length ? "rolled" : "unrolled"}`} key={`${i}-${n}`}>
      {Array.from({ length: 9 }, (_, j) => <i key={j} className={pips[n]?.includes(j) ? "pip" : ""} />)}
    </span>)}
  </>;
  return onRoll ? <button className="game-dice dice-roll-control" type="button" onClick={onRoll} disabled={disabled} aria-label="Roll dice" title="Roll dice">{dice}</button>
    : <div className="game-dice" role="img" aria-label={values.length ? `Dice ${values.join(" and ")}` : "Dice not rolled"}>{dice}</div>;
}
export function CardRow({ hand, onRemove, onSelect, label }: { hand: Hand; onRemove?: (r: Resource) => void; onSelect?: (r: Resource) => void; label: string }) {
  return <div className="cards-row" role="group" aria-label={label}>{RESOURCES.filter(r => hand[r] > 0).map(r => <GameCard key={r} resource={r} count={hand[r]} label={onRemove ? `Remove ${resourceNames[r]} from ${label}` : onSelect ? `Trade ${resourceNames[r]}` : `${hand[r]} ${resourceNames[r]}`} onClick={onRemove ? () => onRemove(r) : onSelect ? () => onSelect(r) : undefined} />)}</div>;
}
export function TradeComposer({ open, onClose, game, me, hand, give, want, setGive, setWant, enabled, act, counterId }: {
  open: boolean; onClose: () => void; game: GameView; me: PublicPlayer; hand: Hand; give: Hand; want: Hand;
  setGive: (v: Hand) => void; setWant: (v: Hand) => void; enabled: boolean; act: (a: Action) => Promise<boolean>; counterId: number | null;
}) {
  const giving = RESOURCES.filter(r => give[r] > 0);
  const valid = total(give) > 0 && total(want) > 0 && RESOURCES.every(r => give[r] <= hand[r] && !(give[r] && want[r]));
  const bankUnits = bankTradeUnits(give, game.legal.ratios);
  const bankAvailable = RESOURCES.every(r => game.bank[r] >= want[r]);
  const bankValid = valid && counterId === null && bankUnits === total(want) && bankAvailable;
  const bankLabel = bankValid
    ? `Trade with bank: ${total(give)} for ${total(want)}`
    : bankUnits === null
      ? "Offer complete sets at your bank or harbor rates"
      : bankUnits !== total(want)
        ? `This offer buys ${bankUnits} bank card${bankUnits === 1 ? "" : "s"}; request ${bankUnits}`
        : !bankAvailable
          ? "The bank is short of one or more requested cards"
          : "Choose different resources to give and receive";
  const counterValid = counterId === null || game.offer?.id === counterId;
  const availableHand = Object.fromEntries(
    RESOURCES.map(resource => [resource, Math.max(0, hand[resource] - give[resource])]),
  ) as Hand;
  const submit = async (bank: boolean) => {
    if (!enabled || !valid || (bank ? !bankValid : !counterValid || game.secondary)) return;
    const action: Action = bank ? { type: "bank", give, want }
      : counterId !== null ? { type: "counter", offerId: counterId, give, want } : { type: "offer", give, want };
    if (await act(action)) onClose();
  };
  return <Dialog open={open} modal={false} onOpenChange={v => !v && onClose()}>
    <DialogContent className="trade-dialog" showCloseButton={false} onInteractOutside={e => e.preventDefault()}>
      <DialogTitle className="sr-only">{counterId === null ? "Make a trade" : "Counteroffer"}</DialogTitle>
      <DialogDescription className="sr-only">Select cards to offer from your hand and cards to request from the bank. Click a selected card to remove it, then submit the trade to the bank or players.</DialogDescription>
      <div className="trade-composer">
        <div className="trade-palette cream-tray" aria-label="Choose resources to receive">
          <span className="trade-palette-label">Request</span>
          {RESOURCES.map(r => <GameCard key={r} resource={r} label={`Request ${resourceNames[r]}`} disabled={give[r] > 0 || want[r] >= 19} onClick={() => setWant({ ...want, [r]: want[r] + 1 })} />)}
          <span className="trade-bank-mark" title="Bank rates depend on your harbors"><Sprite name="bank" /></span>
        </div>
        <div className="trade-hand-palette cream-tray" aria-label="Choose resources from your hand to offer">
          <span className="trade-palette-label">Your cards</span>
          <CardRow
            hand={availableHand}
            label="Your available cards; tap a card to offer it"
            onSelect={resource => {
              if (!enabled || want[resource] || give[resource] >= hand[resource]) return;
              setGive({ ...give, [resource]: give[resource] + 1 });
            }}
          />
          {!total(availableHand) && <span className="trade-hand-empty">All available cards are selected</span>}
        </div>
        <div className="trade-selection cream-tray">
          <div className="trade-line receiving"><Sprite name="people" /><ArrowDown className="trade-arrow" /><span className="trade-line-label">You get</span><CardRow hand={want} label="You receive" onRemove={r => setWant({ ...want, [r]: want[r] - 1 })} />{!total(want) && <span className="trade-line-empty">Tap a request card</span>}</div>
          <div className="trade-line giving"><Avatar player={me} /><ArrowUp className="trade-arrow" /><span className="trade-line-label">You give</span><CardRow hand={give} label="You give" onRemove={r => setGive({ ...give, [r]: give[r] - 1 })} />{!total(give) && <span className="trade-line-empty">Tap one of your cards</span>}</div>
        </div>
        <div className="trade-rail">
          <ActionTile label={bankLabel} disabled={!enabled || !bankValid} onClick={() => submit(true)}><Sprite name="bank" /><Check className="tile-check" /><span className="trade-action-copy">Bank</span></ActionTile>
          <ActionTile label={counterId !== null ? "Send counteroffer" : game.secondary ? "Player trades unavailable during paired turns" : "Offer to players"} disabled={!enabled || !valid || !counterValid || game.secondary} onClick={() => submit(false)}><Sprite name="people" /><Check className="tile-check" /><span className="trade-action-copy">{counterId !== null ? "Counter" : "Players"}</span></ActionTile>
          <ActionTile label="Cancel trade" onClick={onClose}><X /><span className="trade-action-copy">Cancel</span></ActionTile>
        </div>
        <p className="trade-status" aria-live="polite">{!counterValid ? "This offer has changed. Close and reopen it." : total(give) || total(want) ? `${total(give)} offered · ${total(want)} requested${giving.length === 1 ? ` · bank rate ${game.legal.ratios[giving[0]]}:1` : bankUnits !== null ? ` · bank value ${bankUnits}` : ""}` : "Choose cards to offer and request"}</p>
      </div>
    </DialogContent>
  </Dialog>;
}
export function OfferPanel({ offer, players, me, enabled, act, onEdit }: { offer: Offer; players: PublicPlayer[]; me: string; enabled: boolean; act: (a: Action) => Promise<boolean>; onEdit: () => void }) {
  const from = players.find(p => p.id === offer.from)!;
  const mine = offer.from === me, recipient = players.find(p => p.id === me)!;
  const canRespond = !mine && (!offer.to || offer.to === me);
  const canPay = RESOURCES.every(r => (recipient.resources?.[r] || 0) >= offer.want[r]);
  const missingCards = RESOURCES.flatMap(resource => {
    const missing = offer.want[resource] - (recipient.resources?.[resource] || 0);
    return missing > 0 ? [`${missing} ${resourceNames[resource]}`] : [];
  });
  const broadcast = !offer.to;
  const approvedByMe = offer.approved.includes(me);
  const responders = players.filter(p => p.id !== offer.from && (!offer.to || p.id === offer.to));
  if (mine) return <section className="offer-panel offer-panel-owner" aria-label="Your trade offer">
    <div className="offer-owner-heading cream-tray">
      <div className="offer-owner-audience" aria-label="Players considering your offer">
        {responders.map(p => {
          const status = offer.approved.includes(p.id) ? "accepted" : offer.rejected.includes(p.id) ? "declined" : "waiting";
          return <span className={`offer-owner-avatar is-${status}`} key={p.id} title={`${p.name}: ${status}`}>
            <Avatar player={p} />
          </span>;
        })}
      </div>
    </div>
    <div className="offer-owner-body cream-tray">
      <div className="offer-owner-lines">
        <div className="trade-line receiving"><Sprite name="people" /><ArrowDown className="trade-arrow" /><CardRow hand={offer.give} label="Resources they receive" /></div>
        <div className="trade-line giving"><Avatar player={from} /><ArrowUp className="trade-arrow" /><CardRow hand={offer.want} label="Resources you receive" /></div>
      </div>
      <div className="offer-owner-side">
        <div className="offer-owner-response-rail" aria-label="Player responses">
          {responders.map(p => {
            const approved = offer.approved.includes(p.id);
            const rejected = offer.rejected.includes(p.id);
            const status = approved ? "accepted" : rejected ? "declined" : "waiting";
            const canChoose = approved && broadcast;
            const label = canChoose ? `Trade with ${p.name}` : `${p.name}: ${status}`;
            return <button
              className={`offer-response-tile is-${status}`}
              style={{ "--player": p.color } as CSSProperties}
              type="button"
              key={p.id}
              disabled={!enabled || !canChoose}
              aria-label={label}
              title={label}
              onClick={() => canChoose && act({ type: "accept", offerId: offer.id, player: p.id })}
            >
              {approved ? <Check /> : rejected ? <X /> : <span aria-hidden="true">…</span>}
            </button>;
          })}
        </div>
        <div className="offer-actions offer-owner-controls">
          <ActionTile label="Edit offer" disabled={!enabled} onClick={onEdit}><Pencil /></ActionTile>
          <ActionTile label="Cancel offer" disabled={!enabled} onClick={() => act({ type: "cancelTrade" })}><X /></ActionTile>
        </div>
      </div>
    </div>
  </section>;
  return <section className="offer-panel" aria-label={`${from.name}'s trade offer`}>
    <div className="offer-heading cream-tray"><Avatar player={from} /><span>{from.name} offers</span><div className="offer-responses">{responders.map(p => {
      const approved = offer.approved.includes(p.id);
      return <span key={p.id}><Avatar player={p} />{approved
          ? <Check className="offer-approved" aria-label={`${p.name} approved`} />
          : offer.rejected.includes(p.id) && <X className="offer-declined" aria-label={`${p.name} declined`} />}</span>;
    })}</div></div>
    <div className="offer-body cream-tray">
      <div className="trade-line receiving"><Avatar player={from} /><ArrowDown className="trade-arrow" /><CardRow hand={offer.give} label="Offered resources" /></div>
      <div className="trade-line giving"><Sprite name="people" /><ArrowUp className="trade-arrow" /><CardRow hand={offer.want} label="Requested resources" /></div>
      {broadcast && approvedByMe && <p className="offer-guidance">Approved — waiting for {from.name} to choose.</p>}
      {canRespond && !canPay && <p className="offer-guidance offer-unavailable">You cannot accept this trade. You are missing {missingCards.join(", ")}.</p>}
      <div className="offer-actions">
        {canRespond && <ActionTile label="Edit counteroffer" disabled={!enabled} onClick={onEdit}><Pencil /></ActionTile>}
        {canRespond && <ActionTile label="Reject offer" disabled={!enabled} onClick={() => act({ type: "reject", offerId: offer.id })}><X /></ActionTile>}
        {canRespond && <ActionTile label={!canPay ? `Cannot accept; missing ${missingCards.join(", ")}` : broadcast ? approvedByMe ? "Offer approved" : "Approve offer" : "Accept counteroffer"} disabled={!enabled || !canPay || (broadcast && approvedByMe)} onClick={() => act({ type: "accept", offerId: offer.id })}><Check /></ActionTile>}
      </div>
    </div>
  </section>;
}
export function EndTurnIcon() { return <ChevronsRight />; }
