export function randomId(prefix = "g"): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return (
    prefix +
    "-" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export function eventId(gameId: string, seq: number): string {
  return `${gameId}-e${seq}`;
}
