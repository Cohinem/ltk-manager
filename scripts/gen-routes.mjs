// Regenerates src/routeTree.gen.ts without a vite run.
//
// Mirrors the vite plugin's full-generation path
// (@tanstack/router-plugin/dist/esm/core/router-generator-plugin.js: configResolved
// → initConfigAndGenerator → generator.run()) using the same generator version the
// plugin resolves, with the same inline options as vite.config.ts. A mismatched
// generator would reorder routes and turn every upstream merge into churn here.
import { Generator, getConfig } from "@tanstack/router-generator";

const root = process.cwd();
const config = getConfig({ target: "react", autoCodeSplitting: true }, root);
await new Generator({ config, root }).run();
