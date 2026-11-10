import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node22",
  shims: false,
  noExternal: ["@typesensekit/core"],
  banner: { js: "#!/usr/bin/env node" },
});
