import { EMPTY_RECORD, type GameRecord } from "@/storage/types.ts";

const records = new Map<string, GameRecord>();

export function memoryRecord(ownerId: number): GameRecord {
  const key = String(ownerId);
  let rec = records.get(key);
  if (!rec) {
    rec = EMPTY_RECORD(ownerId);
    records.set(key, rec);
  }
  return rec;
}

export function resetMemoryStore() {
  records.clear();
}
