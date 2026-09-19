import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const file = path.join(root, "src", specifier.slice(2));
    return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
