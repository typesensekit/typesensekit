import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: true,
    clean: true,
    target: "node22",
    shims: false,
    noExternal: ["@typesensekit/core"],
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { server: "src/server.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
    target: "node22",
    shims: false,
    noExternal: ["@typesensekit/core"],
  },
]);
