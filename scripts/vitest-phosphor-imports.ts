import { existsSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

const BARREL_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']@phosphor-icons\/react["'];?/g;

/**
 * Per-icon imports in place of the `@phosphor-icons/react` barrel, for Vitest only.
 *
 * The barrel loads every icon module, several seconds per test file. A statement naming anything
 * other than an `*Icon` with a matching file stays on the barrel.
 */
export function phosphorIconImports(root: string): Plugin {
  const iconDir = path.join(root, "node_modules", "@phosphor-icons", "react", "dist", "csr");

  const deepImport = (specifier: string): string | undefined => {
    const [imported, local = imported] = specifier.split(/\s+as\s+/);
    const base = imported.endsWith("Icon") ? imported.slice(0, -"Icon".length) : "";

    if (!base || !existsSync(path.join(iconDir, `${base}.es.js`))) {
      return undefined;
    }

    return `import { ${imported} as ${local} } from "@phosphor-icons/react/dist/csr/${base}";`;
  };

  return {
    name: "ltk-phosphor-icon-imports",
    enforce: "post",
    transform(code, id) {
      if (id.includes("node_modules") || !code.includes("@phosphor-icons/react")) {
        return;
      }

      return code.replace(BARREL_IMPORT, (statement, list: string) => {
        const specifiers = list
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("type "));
        const imports = specifiers.map(deepImport);

        if (imports.length === 0 || imports.some((i) => i === undefined)) {
          return statement;
        }

        return imports.join(" ");
      });
    },
  };
}
