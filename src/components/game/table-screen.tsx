import { useEffect, useMemo, useRef } from "react";
import {
  BookOpen,
  History,
  Moon,
  ScrollText,
  Sun,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useGameStore } from "@/store/game-store.ts";
import { cn } from "@/lib/cn.ts";
import { getRole, roleLabel } from "@/roles/index.ts";
import type { ChatMessage, PlayerState } from "@/game/types.ts";
import { APP_NAME, BOT_NAME } from "@/brand.ts";

const TONES = [
  "bg-[#3d3730]",
  "bg-[#4a4038]",
  "bg-[#3a433c]",
  "bg-[#403a44]",
  "bg-[#4a3838]",
  "bg-[#384044]",
];

function tone(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % TONES.length;
  return TONES[h];
}

function Avatar({ name, dead }: { name: string; dead?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-fg",
        tone(name),
        dead && "opacity-40",
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function PhaseChip({ phase, day, night }: { phase: string; day: number; night: number }) {
  const nightish = phase === "night" || phase === "dawn";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-subtle px-3 py-1 text-xs uppercase tracking-[0.14em] text-fg-muted">
      {nightish ? <Moon className="size-3" /> : <Sun className="size-3" />}
      {phase} · n{night} · d{day}
    </span>
  );
}

function MessageBubble({ msg, you }: { msg: ChatMessage; you: string }) {
  if (msg.kind === "moderator" || msg.kind === "system") {
    return (
      <div className="mx-auto max-w-lg whitespace-pre-wrap rounded-[20px] border border-border bg-bg-elevated px-4 py-3 text-center text-sm leading-relaxed text-fg-muted">
        <p className="mb-1.5 font-display text-xs tracking-wide text-fg">{msg.authorName}</p>
        {msg.text}
      </div>
    );
  }
  if (msg.kind === "whisper") {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md border border-accent/20 bg-bg-subtle px-4 py-3 text-sm leading-relaxed">
        <p className="mb-1 font-display text-[11px] text-fg-subtle">{msg.authorName} · private</p>
        {msg.text}
      </div>
    );
  }
  const mine = msg.authorId === you;
  return (
    <div className={cn("flex max-w-[90%] gap-2", mine ? "ml-auto flex-row-reverse" : "")}>
      <Avatar name={msg.authorName} />
      <div
        className={cn(
          "rounded-[20px] px-3.5 py-2.5 text-sm leading-relaxed",
          mine ? "rounded-br-md bg-accent text-accent-fg" : "rounded-bl-md bg-bg-elevated",
        )}
      >
        {!mine ? (
          <p className="mb-0.5 text-[11px] font-medium text-fg-muted">{msg.authorName}</p>
        ) : null}
        {msg.text}
      </div>
    </div>
  );
}

function PlayerRow({ p, reveal }: { p: PlayerState; reveal: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={p.name} dead={!p.isAlive} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", !p.isAlive && "text-fg-subtle line-through")}>
          {p.name}
          {p.isHuman ? " · you" : ""}
        </p>
        <p className="text-xs text-fg-subtle">
          {p.isAlive ? "Alive" : "Dead"}
          {reveal ? ` · ${roleLabel(p.originalRoleId)}` : ""}
        </p>
      </div>
    </li>
  );
}

function SideSheet() {
  const panel = useGameStore((s) => s.sidePanel);
  const setSidePanel = useGameStore((s) => s.setSidePanel);
  const state = useGameStore((s) => s.state);
  const view = useGameStore((s) => s.view);
  if (panel === "none" || !state) return null;
  const title =
    panel === "players" ? "Table" : panel === "role" ? "Your role" : panel === "history" ? "History" : "How to play";
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setSidePanel("none")}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-bg-elevated p-5 shadow-[var(--shadow-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">{title}</h2>
          <Button variant="ghost" size="icon" onClick={() => setSidePanel("none")} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {panel === "players" ? (
            <ul>
              {state.players.map((p) => (
                <PlayerRow key={p.id} p={p} reveal={state.phase === "gameOver"} />
              ))}
            </ul>
          ) : null}
          {panel === "role" && view ? (
            <RolePanel />
          ) : null}
          {panel === "history" ? (
            <ol className="space-y-3 text-sm leading-relaxed text-fg-muted">
              {state.events.slice(-20).map((e) => (
                <li key={e.id} className="border-b border-border pb-3">
                  {e.text}
                </li>
              ))}
            </ol>
          ) : null}
          {panel === "help" ? <HelpCopy /> : null}
        </div>
      </aside>
    </div>
  );
}

function RolePanel() {
  const view = useGameStore((s) => s.view);
  if (!view) return null;
  const role = getRole(view.shownRoleId);
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-fg-subtle">Private</p>
      <h3 className="mt-1 font-display text-3xl">
        {role.emoji} {role.displayName}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{role.description}</p>
      <p className="mt-3 text-sm text-fg">{role.winCondition}</p>
      {view.packMates.length ? (
        <p className="mt-4 text-sm">Pack: {view.packMates.map((p) => p.name).join(", ")}</p>
      ) : null}
      {view.cultMates.length ? (
        <p className="mt-2 text-sm">Cult: {view.cultMates.map((p) => p.name).join(", ")}</p>
      ) : null}
      {view.loverName ? (
        <p className="mt-2 text-sm">In love with {view.loverName}.</p>
      ) : null}
      {view.investigations.length ? (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-[0.16em] text-fg-subtle">Visions</p>
          <ul className="mt-2 space-y-1 text-sm">
            {view.investigations.map((i) => (
              <li key={`${i.night}-${i.targetId}`}>
                Night {i.night}: {i.targetName} → {roleLabel(i.shownRoleId)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function HelpCopy() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-fg-muted">
      <p>
        You are the only human. Real roles are dealt by {BOT_NAME} AI players receive
        only what their character would know — a Seer does not see the Fool's lie,
        wolves know their pack, lovers know each other but not roles.
      </p>
      <p>
        Night: special roles act. Day: talk, then vote. Ties default to no lynch. Tanner
        wins if executed. Serial Killer wins last standing. Cult wins if everyone living
        is converted. Lovers win if they are the only people left.
      </p>
      <p>
        The same engine runs in Telegram as {BOT_NAME} This table is the solo
        client so you can play without leaving the page.
      </p>
    </div>
  );
}

export function TableScreen() {
  const state = useGameStore((s) => s.state);
  const view = useGameStore((s) => s.view);
  const busy = useGameStore((s) => s.busy);
  const error = useGameStore((s) => s.error);
  const composer = useGameStore((s) => s.composer);
  const cupidFirstId = useGameStore((s) => s.cupidFirstId);
  const confirmLeave = useGameStore((s) => s.confirmLeave);
  const setComposer = useGameStore((s) => s.setComposer);
  const setSidePanel = useGameStore((s) => s.setSidePanel);
  const setConfirmLeave = useGameStore((s) => s.setConfirmLeave);
  const say = useGameStore((s) => s.say);
  const pickTarget = useGameStore((s) => s.pickTarget);
  const skipOrAdvance = useGameStore((s) => s.skipOrAdvance);
  const leave = useGameStore((s) => s.leave);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visibleChat = useMemo(
    () =>
      (state?.chat ?? []).filter(
        (m) => !m.privateToPlayerId || m.privateToPlayerId === state?.humanPlayerId,
      ),
    [state?.chat, state?.humanPlayerId],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleChat.length, state?.phase]);

  if (!state || !view) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-6 text-center">
        <p className="text-sm text-fg-muted">Dealing the table…</p>
      </div>
    );
  }

  const prompt = state.humanPrompt;
  const canTalk = state.phase === "discussion" && view.isAlive;
  const stuck =
    !busy &&
    state.phase !== "gameOver" &&
    !prompt &&
    (state.phase === "night" || state.phase === "voting" || state.phase === "hunterShot");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-bg/95 px-3 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-[12px] border border-border bg-bg-elevated">
            <Moon className="size-4" />
          </span>
          <span className="hidden font-display text-base sm:block">{APP_NAME}</span>
        </div>
        <PhaseChip phase={state.phase} day={state.day} night={state.night} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setSidePanel("players")} aria-label="Players">
            <Users className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSidePanel("role")} aria-label="Role">
            <ScrollText className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSidePanel("history")} aria-label="History">
            <History className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSidePanel("help")} aria-label="Help">
            <BookOpen className="size-4" />
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 pb-44 pt-5 sm:px-4">
        <div className="flex flex-col gap-3">
          {visibleChat.map((m) => (
            <MessageBubble key={m.id} msg={m} you={state.humanPlayerId} />
          ))}
          {busy ? (
            <p className="text-center text-xs uppercase tracking-[0.16em] text-fg-subtle">
              The table is thinking…
            </p>
          ) : null}
          {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-elevated/95 px-3 pt-3 pb-16 backdrop-blur-sm sm:px-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {prompt && prompt.targets.length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-fg-subtle">
                {prompt.title}
                {prompt.kind === "cupid" && cupidFirstId ? " · pick the second" : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {prompt.targets
                  .filter((t) => t.id !== cupidFirstId)
                  .map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      variant={cupidFirstId === t.id ? "primary" : "secondary"}
                      size="sm"
                      disabled={busy}
                      onClick={() => void pickTarget(t.id)}
                    >
                      {t.name}
                    </Button>
                  ))}
              </div>
            </div>
          ) : null}

          {prompt?.kind === "discussion" || prompt?.kind === "continue" ? (
            <div className="flex gap-2">
              {canTalk ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void say();
                  }}
                >
                  <input
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    placeholder="Speak to the village…"
                    className="h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-bg px-3 text-sm outline-none ring-ring/60 focus:ring-2"
                    maxLength={400}
                    disabled={busy}
                  />
                  <Button type="submit" disabled={busy || !composer.trim()}>
                    Say
                  </Button>
                </form>
              ) : (
                <div className="flex-1" />
              )}
              <Button variant="secondary" onClick={() => void skipOrAdvance()} disabled={busy}>
                Call the vote
              </Button>
            </div>
          ) : null}

          {prompt?.allowSkip && prompt.kind !== "discussion" && prompt.kind !== "continue" ? (
            <Button variant="ghost" onClick={() => void skipOrAdvance()} disabled={busy}>
              Skip
            </Button>
          ) : null}

          {stuck ? (
            <Button variant="secondary" onClick={() => void skipOrAdvance()} disabled={busy}>
              Continue
            </Button>
          ) : null}

          {state.phase === "gameOver" ? (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={leave}>
                New game
              </Button>
              <Button variant="secondary" onClick={() => setSidePanel("players")}>
                Roles
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 pt-1">
              {confirmLeave ? (
                <>
                  <p className="text-xs text-fg-muted">Leave this table?</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>
                      Stay
                    </Button>
                    <Button size="sm" variant="danger" onClick={leave}>
                      Leave
                    </Button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="text-xs text-fg-subtle hover:text-fg-muted"
                  onClick={() => setConfirmLeave(true)}
                >
                  Leave table
                </button>
              )}
            </div>
          )}
        </div>
      </footer>

      <SideSheet />
    </div>
  );
}
