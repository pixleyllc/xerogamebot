import { Moon, Users, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { PLAYER_COUNTS, type GameMode, type PlayerCount } from "@/game/types.ts";
import { useGameStore } from "@/store/game-store.ts";
import { APP_NAME, BOT_NAME } from "@/brand.ts";
import { cn } from "@/lib/cn.ts";

const MODES: Array<{ id: GameMode; title: string; body: string }> = [
  {
    id: "classic",
    title: "Classic",
    body: "Balanced village table. Wolf count follows the original bot: one wolf per five players.",
  },
  {
    id: "chaos",
    title: "Chaos",
    body: "A legal but unruly mix. Tanner, Fool, Cupid, Cult, and Serial Killer can all crash the same game.",
  },
];

export function LobbyScreen() {
  const humanName = useGameStore((s) => s.humanName);
  const playerCount = useGameStore((s) => s.playerCount);
  const mode = useGameStore((s) => s.mode);
  const useLlm = useGameStore((s) => s.useLlm);
  const busy = useGameStore((s) => s.busy);
  const error = useGameStore((s) => s.error);
  const setName = useGameStore((s) => s.setName);
  const setCount = useGameStore((s) => s.setCount);
  const setMode = useGameStore((s) => s.setMode);
  const setUseLlm = useGameStore((s) => s.setUseLlm);
  const start = useGameStore((s) => s.start);
  const resume = useGameStore((s) => s.resume);
  const setSidePanel = useGameStore((s) => s.setSidePanel);
  const existing = useGameStore((s) => s.state);
  const canResume = existing != null && existing.phase !== "gameOver";

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[14px] border border-border bg-bg-elevated">
            <Moon className="size-4 text-accent" strokeWidth={1.6} />
          </span>
          <div>
            <p className="font-display text-xs tracking-wide text-fg-subtle">{BOT_NAME}</p>
            <p className="font-display text-lg leading-tight">{APP_NAME}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSidePanel("help")}>
          <BookOpen className="size-4" />
          How to play
        </Button>
      </header>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <h1 className="max-w-xl font-display text-[clamp(2.4rem,7vw,4.4rem)] font-medium leading-[1.05] tracking-[-0.04em]">
            One human.
            <br />
            A full table of liars.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-fg-muted">
            The moderator is {BOT_NAME} Everyone else is an AI with a role, a secret,
            and a vote. Same bones as the original Telegram Werewolf — rebuilt for
            a solo private game.
          </p>
        </div>

        <form
          className="rounded-[28px] border border-border bg-bg-elevated p-5 shadow-[var(--shadow-panel)] sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <label className="block text-xs font-medium uppercase tracking-[0.16em] text-fg-subtle">
            Your name
            <input
              value={humanName}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-border bg-bg px-3 text-sm text-fg outline-none ring-ring/60 placeholder:text-fg-subtle focus:ring-2"
              placeholder="Zack"
              maxLength={24}
            />
          </label>

          <p className="mt-5 text-xs font-medium uppercase tracking-[0.16em] text-fg-subtle">Mode</p>
          <div className="mt-2 grid gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-[18px] border px-4 py-3 text-left transition-colors",
                  mode === m.id
                    ? "border-accent/50 bg-bg-subtle"
                    : "border-border bg-bg hover:border-border-strong",
                )}
              >
                <div className="flex items-center gap-2">
                  {m.id === "chaos" ? (
                    <Sparkles className="size-3.5 text-fg-muted" />
                  ) : (
                    <Moon className="size-3.5 text-fg-muted" />
                  )}
                  <span className="text-sm font-medium">{m.title}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-fg-muted">{m.body}</p>
              </button>
            ))}
          </div>

          <p className="mt-5 text-xs font-medium uppercase tracking-[0.16em] text-fg-subtle">
            Table size
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PLAYER_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n as PlayerCount)}
                className={cn(
                  "h-10 min-w-10 rounded-full border px-3 text-sm tabular-nums",
                  playerCount === n
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border text-fg-muted hover:text-fg",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
            <Users className="size-3.5" />
            1 human · {playerCount - 1} AI
          </p>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[16px] border border-border bg-bg px-3 py-3">
            <input
              type="checkbox"
              checked={useLlm}
              onChange={(e) => setUseLlm(e.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium">Smart NPCs</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                Use Grok for dialogue when available. If the model is busy, the table
                still plays with heuristic reads so the game never stalls.
              </span>
            </span>
          </label>

          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

          {canResume ? (
            <Button type="button" size="lg" className="mt-5 w-full" onClick={resume}>
              Resume table
            </Button>
          ) : null}

          <Button type="submit" size="lg" className={canResume ? "mt-2 w-full" : "mt-5 w-full"} disabled={busy} variant={canResume ? "secondary" : "primary"}>
            {busy ? "Dealing roles…" : canResume ? "Start a new table" : "Take a seat"}
          </Button>
        </form>
      </div>
    </div>
  );
}
