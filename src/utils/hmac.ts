async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPayload(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await signPayload(payload, secret);
  if (expected.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return ok === 0;
}

export async function hashId(value: string): Promise<string> {
  return sha256Hex(value);
}

export interface CallbackPayload {
  gameId: string;
  userId: number;
  action: string;
  targetId?: string;
  target2Id?: string;
}

/** Compact signed callback_data. Telegram hard-limits this to 64 bytes. */
export async function encodeCallback(
  payload: CallbackPayload,
  secret: string,
): Promise<string> {
  const body = [
    payload.action,
    String(payload.userId),
    payload.gameId.slice(-10),
    payload.targetId ?? "",
    payload.target2Id ?? "",
  ].join("|");
  const sig = (await signPayload(body, secret)).slice(0, 8);
  const packed = `${sig}|${body}`;
  if (packed.length > 64) {
    throw new Error(`callback_data ${packed.length} bytes exceeds Telegram's 64-byte limit`);
  }
  return packed;
}

export async function decodeCallback(
  data: string,
  secret: string,
  userId: number,
): Promise<CallbackPayload | null> {
  const parts = data.split("|");
  if (parts.length !== 6) return null;
  const [sig, action, uid, gameId, targetId, target2Id] = parts;
  if (!sig || !action || !uid || gameId === undefined) return null;
  const body = [action, uid, gameId, targetId ?? "", target2Id ?? ""].join("|");
  const expected = (await signPayload(body, secret)).slice(0, 8);
  if (expected !== sig) return null;
  const parsedUser = Number(uid);
  if (parsedUser !== userId) return null;
  return {
    gameId,
    userId: parsedUser,
    action,
    targetId: targetId || undefined,
    target2Id: target2Id || undefined,
  };
}
