import fs from "node:fs/promises";

/** @type {import("type-fest").TsConfigJson} */
const tsconfig = {
  extends: "../mk/tsconfig-base.json",
  include: [],
  references: [],
};

const dir = await fs.readdir("pkg", { withFileTypes: true });
for (const direct of dir) {
  if (!direct.isDirectory()) {
    continue;
  }
  tsconfig.references.push({ path: `../pkg/${direct.name}` });
}

await fs.writeFile("mk/tsconfig-solution.json", JSON.stringify(tsconfig, undefined, 2));
