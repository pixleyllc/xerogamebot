/**
 * Minimal Cloudflare Worker / Durable Object typings so the Telegram
 * worker sources typecheck in this repo without @cloudflare/workers-types.
 * Wrangler injects the real types at deploy time.
 */

export {};

declare global {
  interface DurableObjectId {
    toString(): string;
    equals(other: DurableObjectId): boolean;
    readonly name?: string;
  }

  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
    put<T>(key: string, value: T): Promise<void>;
    put<T>(entries: Record<string, T>): Promise<void>;
    delete(key: string): Promise<boolean>;
    delete(keys: string[]): Promise<number>;
    list<T = unknown>(options?: {
      prefix?: string;
      start?: string;
      end?: string;
      reverse?: boolean;
      limit?: number;
    }): Promise<Map<string, T>>;
    setAlarm(scheduledTime: number | Date): Promise<void>;
    getAlarm(): Promise<number | null>;
    deleteAlarm(): Promise<void>;
    transaction<T>(closure: (txn: DurableObjectStorage) => Promise<T>): Promise<T>;
  }

  interface DurableObjectState {
    readonly id: DurableObjectId;
    readonly storage: DurableObjectStorage;
    waitUntil(promise: Promise<unknown>): void;
    acceptWebSocket(ws: WebSocket, tags?: string[]): void;
    getWebSockets(tag?: string): WebSocket[];
    setHibernatableWebSocketEventTimeout(timeoutMs?: number): void;
  }

  interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    idFromString(id: string): DurableObjectId;
    newUniqueId(): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
  }

  interface DurableObjectStub {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }

  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }

  interface Ai {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  }

  interface WorkerEnv {
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    CALLBACK_SIGNING_SECRET?: string;
    AI_PROVIDER?: string;
    AI_API_KEY?: string;
    AI_BASE_URL?: string;
    AI_MODEL?: string;
    XAI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    GAME: DurableObjectNamespace;
    AI?: Ai;
  }
}
