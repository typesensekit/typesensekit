import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node22",
  shims: false,
  // Bundle the SDK and its dependency graph to avoid resolving/loading hundreds
  // of small files for each short-lived shell invocation.
  noExternal: [/.*/],
  minify: true,
  // Bundled CommonJS SDK dependencies still require Node built-ins in ESM.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
});
