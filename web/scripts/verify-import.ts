import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importFromFileText } from "../src/lib/import/index";
import { countAllRequests } from "../src/lib/collectionTree";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, "..", "testdata");
const files = [
  "postman-v2.1-min.json",
  "openapi-3-min.json",
  "openapi-3-min.yaml",
];
for (const f of files) {
  const text = readFileSync(join(dir, f), "utf8");
  const doc = importFromFileText(text);
  console.log(`${f}\t→\t${doc.name}\trequests=${countAllRequests(doc)}`);
}
