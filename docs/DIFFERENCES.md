# Intentional differences from @werewolfbot (GreyWolfDev/Werewolf)

This project is a **solo** rebuild, not a port of the C# node. Mechanics below were checked against `Werewolf Node/Werewolf.cs`, `Shared/Roles.cs`, `Shared/GameBalancing.cs`, and the English locale strings. Where we diverge, it is on purpose.

## Architecture

- One human player plus AI NPCs. Upstream is a human group chat.
- Cloudflare Workers + Durable Objects instead of Windows services / SQL Server.
- Private chat is the default (and only) surface in v1. Group mode is structured for later, not implemented.

## Role pool

v1 implements: Villager, Werewolf, Seer, Guardian Angel, Hunter, Tanner, Fool, Cultist, Serial Killer, Cupid.

Not in v1: Drunk, Harlot, Traitor, Detective, Cursed, Gunner, Wild Child, Beholder, Apprentice Seer, Cultist Hunter, Mason, Doppelgänger, Sorcerer, Alpha Wolf, Wolf Cub, Blacksmith, Clumsy Guy, Mayor, Prince, Lycan, Pacifist, Wise Elder, Oracle, Sandman, Wolf Man, Thief, Grave Digger, Augur, Arsonist, and later experimental roles.

## Confirmed-aligned behavior

- Wolf count: `min(max(floor(n / 5), 1), 5)` from `GameBalancing.cs`.
- Village win: no living wolf, cultist, or serial killer.
- Wolf win: living wolves ≥ living non-wolves, and no serial killer remains.
- Tanner wins **only** on lynch; game ends immediately.
- Cult wins when every living player is a cultist.
- Lovers win when every living player is in love.
- Lovers die of sorrow when their partner dies.
- Guardian Angel: 50% death watching a wolf, 100% watching the Serial Killer.
- Wolves vs Serial Killer: 20% SK dies, 80% a random attacking wolf dies.
- Hunter eaten: `30% + 20% per extra wolf` chance to kill a random wolf; no aimed shot.
- Hunter lynched: aimed death shot.
- Fool is told they are Seer and sees a random role from the game's pool.
- Cult cannot convert wolves or the Serial Killer. Hunter resists 50%.
- Default lynch ties: no lynch (`RandomLynch` off). Optional random break.

## Documented solo changes

1. **Human wolf kill.** If the human is a Werewolf, their night target is one pack vote, counted equally with AI wolves (majority, RNG on tie). Upstream humans all vote in a shared wolf chat.
2. **Discussion.** AI speech is a bounded set of messages, not a free-for-all Telegram group.
3. **Timers.** Web client is button-driven. Telegram uses Durable Object alarms for delayed NPC lines; night/vote can be advanced by action rather than a hard timeout when the human has acted.
4. **Role reveal on death** defaults to off (upstream group setting varies).
5. **Cultist** is classic-only at 15 players; Chaos may add them from 12, matching the upstream “cult from larger games” idea without copying the full 10+ hunter/cult package (no Cultist Hunter in v1).
6. **Doctor** is not a separate role. Guardian Angel is the canonical protective role.

## AI

Upstream has no AI players. NPC decisions are strategic choices among engine-legal actions. The LLM never resolves deaths, votes, ties, or winners.
