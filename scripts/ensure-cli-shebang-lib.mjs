import { readFile, writeFile } from "node:fs/promises";

const shebang = "#!/usr/bin/env node";

export default async function ensureCliShebang(entrypointPath) {
  const contents = await readFile(entrypointPath, "utf8");

  if (contents.startsWith(`${shebang}\n`)) {
    return;
  }

  const withoutMisplacedShebang = contents.replace(/^#!\/usr\/bin\/env node\r?\n/m, "");
  await writeFile(entrypointPath, `${shebang}\n${withoutMisplacedShebang}`);
}
