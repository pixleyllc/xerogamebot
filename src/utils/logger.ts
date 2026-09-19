export type LogLevel = "debug" | "info" | "warn" | "error";

export function log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  const line = extra ? `${message} ${JSON.stringify(extra)}` : message;
  if (level === "error") console.error(`[werewolf] ${line}`);
  else if (level === "warn") console.warn(`[werewolf] ${line}`);
  else console.log(`[werewolf] ${line}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
