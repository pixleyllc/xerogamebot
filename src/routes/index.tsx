import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LobbyScreen } from "@/components/game/lobby-screen.tsx";
import { HelpCopy, TableScreen } from "@/components/game/table-screen.tsx";
import { useGameStore } from "@/store/game-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { X } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const screen = useGameStore((s) => s.screen);
  const state = useGameStore((s) => s.state);
  const panel = useGameStore((s) => s.sidePanel);
  const hydrated = useGameStore((s) => s.hydrated);
  const setSidePanel = useGameStore((s) => s.setSidePanel);

  useEffect(() => {
    let alive = true;
    const done = Promise.resolve(useGameStore.persist.rehydrate());
    void done.finally(() => {
      if (!alive) return;
      useGameStore.setState({ busy: false, confirmLeave: false, hydrated: true });
    });
    return () => {
      alive = false;
    };
  }, []);

  const atTable = hydrated && screen === "table" && state != null;

  return (
    <>
      {atTable ? <TableScreen /> : <LobbyScreen />}
      {!atTable && panel === "help" ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setSidePanel("none")}>
          <div
            className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-border bg-bg-elevated p-6 shadow-[var(--shadow-panel)] sm:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">How to play</h2>
              <Button variant="ghost" size="icon" onClick={() => setSidePanel("none")} aria-label="Close">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-4">
              <HelpCopy />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
