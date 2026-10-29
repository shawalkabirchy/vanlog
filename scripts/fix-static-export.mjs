import { readdir, copyFile, readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import assert from "node:assert/strict";

// Next 16.4 exports Windows segment separators as directories; the router requests dots.
const output = resolve("out");
let copied = 0;
for (const entry of await readdir(output, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
  const source = resolve(entry.parentPath, entry.name);
  const parts = relative(output, source).split(sep);
  const start = parts.findIndex((part) => part.startsWith("__next."));
  if (start < 0 || start === parts.length - 1) continue;
  const destination = resolve(
    output,
    ...parts.slice(0, start),
    parts.slice(start).join("."),
  );
  assert(
    source.startsWith(output + sep) && destination.startsWith(output + sep),
  );
  await copyFile(source, destination);
  assert.deepEqual(await readFile(source), await readFile(destination));
  copied++;
}
console.log(
  `Static export verified; ${copied} Windows prefetch aliases added.`,
);
