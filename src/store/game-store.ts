import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createGame } from "@/game/setup.ts";
import { freshEntropySeed } from "@/game/rng.ts";
import { applyEngineAction, startGame } from "@/game/engine.ts";
import { buildPrivateView } from "@/game/isolation.ts";
import { fallbackProvider } from "@/ai/fallback.ts";
import { withFallback, type AIProvider } from "@/ai/index.ts";
import { driveNpcsUntilHuman } from "@/ai/npc-engine.ts";
import { generateNpcDecision } from "@/lib/npc-ai.ts";
import type { AiDecisionRequest } from "@/ai/provider.ts";
import type { GameMode, GameState, Phase, PlayerCount, PlayerView } from "@/game/types.ts";

export type Screen = "lobby" | "table";
export type SidePanel = "none" | "players" | "role" | "history" | "help";

interface GameStore {
  screen: Screen;
  state: GameState | null;
  view: PlayerView | null;
  busy: boolean;
  error: string | null;
  humanName: string;
  playerCount: PlayerCount;
  mode: GameMode;
  useLlm: boolean;
  sidePanel: SidePanel;
  composer: string;
  cupidFirstId: string | null;
  confirmLeave: boolean;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  setName: (name: string) => void;
  setCount: (n: PlayerCount) => void;
  setMode: (mode: GameMode) => void;
  setUseLlm: (v: boolean) => void;
  setComposer: (v: string) => void;
  setSidePanel: (p: SidePanel) => void;
  setConfirmLeave: (v: boolean) => void;
  start: () => Promise<void>;
  resume: () => void;
  leave: () => void;
  say: () => Promise<void>;
  pickTarget: (id: string) => Promise<void>;
  skipOrAdvance: () => Promise<void>;
}

function snapshot(state: GameState): { state: GameState; view: PlayerView } {
  const copy = structuredClone(state);
  return { state: copy, view: buildPrivateView(copy, copy.humanPlayerId) };
}

function webProvider(useLlm: boolean): AIProvider {
  if (!useLlm) return fallbackProvider;
  const llm: AIProvider = {
    id: "web-xai",
    async generatePlayerDecision(req: AiDecisionRequest) {
      const talk =
        req.kind === "discussion" || req.kind === "accusation" || req.kind === "defense";
      if (!talk) return fallbackProvider.generatePlayerDecision(req);
      try {
        return await generateNpcDecision({ data: { req, useLlm: true } });
      } catch {
        return fallbackProvider.generatePlayerDecision(req);
      }
    },
    generatePlayerDialogue: (req) => llm.generatePlayerDecision(req),
    generateNightAction: (req) => fallbackProvider.generateNightAction(req),
    generateVote: (req) => fallbackProvider.generateVote(req),
    summarizeMemory: (view, memory) => fallbackProvider.summarizeMemory(view, memory),
  };
  return withFallback(llm);
}

async function playNpcs(
  state: GameState,
  useLlm: boolean,
  replies?: number,
  startedPhase?: Phase,
): Promise<GameState> {
  return driveNpcsUntilHuman(state, {
    provider: webProvider(useLlm),
    discussionReplies: replies,
    startedPhase: startedPhase ?? state.phase,
  });
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      screen: "lobby",
      state: null,
      view: null,
      busy: false,
      error: null,
      humanName: "Zack",
      playerCount: 10,
      mode: "chaos",
      useLlm: true,
      sidePanel: "none",
      composer: "",
      cupidFirstId: null,
      confirmLeave: false,
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      setName: (humanName) => set({ humanName }),
      setCount: (playerCount) => set({ playerCount }),
      setMode: (mode) => set({ mode }),
      setUseLlm: (useLlm) => set({ useLlm }),
      setComposer: (composer) => set({ composer }),
      setSidePanel: (sidePanel) => set({ sidePanel }),
      setConfirmLeave: (confirmLeave) => set({ confirmLeave }),
      async start() {
        if (get().busy) return;
        const { humanName, playerCount, mode, useLlm } = get();
        set({ busy: true, error: null, cupidFirstId: null, confirmLeave: false });
        let working: GameState | null = null;
        try {
          working = createGame({
            humanName: humanName.trim() || "Zack",
            playerCount,
            mode,
            seed: freshEntropySeed(),
          });
          working = startGame(working).state;
          set({ screen: "table", ...snapshot(working), busy: true, sidePanel: "none" });
          working = await playNpcs(working, useLlm);
          if (get().screen !== "table") return;
          set({ ...snapshot(working), busy: false, error: null });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not start";
          if (working && get().screen === "table") {
            set({ screen: "table", ...snapshot(working), busy: false, error: message });
          } else {
            set({ busy: false, error: message });
          }
        }
      },
      resume() {
        const { state } = get();
        if (!state) return;
        set({ screen: "table", confirmLeave: false, sidePanel: "none" });
      },
      leave() {
        set({
          screen: "lobby",
          state: null,
          view: null,
          cupidFirstId: null,
          sidePanel: "none",
          error: null,
          confirmLeave: false,
          busy: false,
          composer: "",
        });
      },
      async say() {
        const { state, composer, useLlm } = get();
        if (!state || !composer.trim()) return;
        const text = composer.trim();
        set({ busy: true, composer: "", error: null });
        let working = structuredClone(state);
        try {
          working = applyEngineAction(working, {
            type: "say",
            actorId: working.humanPlayerId,
            text,
          }).state;
          set({ ...snapshot(working), busy: true });
          working = await playNpcs(working, useLlm, 2, "discussion");
          set({ ...snapshot(working), busy: false });
        } catch (err) {
          set({
            ...snapshot(working),
            busy: false,
            error: err instanceof Error ? err.message : "The table stalled",
          });
        }
      },
      async pickTarget(id: string) {
        const { state, cupidFirstId, useLlm } = get();
        if (!state) return;
        const kind = state.humanPrompt?.kind;
        const fromPhase = state.phase;
        set({ busy: true, error: null });
        let working = structuredClone(state);
        try {
          if (kind === "cupid") {
            if (!cupidFirstId) {
              set({ cupidFirstId: id, busy: false });
              return;
            }
            working = applyEngineAction(working, {
              type: "nightCupid",
              actorId: working.humanPlayerId,
              targetId: cupidFirstId,
              target2Id: id,
            }).state;
            set({ cupidFirstId: null });
          } else if (kind === "night") {
            working = applyEngineAction(working, {
              type: "nightTarget",
              actorId: working.humanPlayerId,
              targetId: id,
            }).state;
          } else if (kind === "vote") {
            working = applyEngineAction(working, {
              type: "vote",
              actorId: working.humanPlayerId,
              targetId: id,
            }).state;
          } else if (kind === "hunterShot") {
            working = applyEngineAction(working, {
              type: "hunterShot",
              actorId: working.humanPlayerId,
              targetId: id,
            }).state;
          } else {
            set({ busy: false });
            return;
          }
          set({ ...snapshot(working), busy: true });
          working = await playNpcs(working, useLlm, undefined, fromPhase);
          set({ ...snapshot(working), busy: false });
        } catch (err) {
          set({
            ...snapshot(working),
            busy: false,
            error: err instanceof Error ? err.message : "Action failed",
          });
        }
      },
      async skipOrAdvance() {
        const { state, useLlm } = get();
        if (!state) return;
        const fromPhase = state.phase;
        set({ busy: true, error: null });
        let working = structuredClone(state);
        try {
          working = applyEngineAction(working, {
            type: working.phase === "discussion" ? "advance" : "skip",
            actorId: working.humanPlayerId,
          }).state;
          set({ ...snapshot(working), busy: true });
          working = await playNpcs(working, useLlm, undefined, fromPhase);
          set({ ...snapshot(working), busy: false });
        } catch (err) {
          set({
            ...snapshot(working),
            busy: false,
            error: err instanceof Error ? err.message : "Could not continue",
          });
        }
      },
    }),
    {
      name: "solo-werewolf-save",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        screen: s.screen,
        state: s.state,
        view: s.view,
        humanName: s.humanName,
        playerCount: s.playerCount,
        mode: s.mode,
        useLlm: s.useLlm,
      }),
    },
  ),
);
