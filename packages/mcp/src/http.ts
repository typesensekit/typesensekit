import { createMcpHttpServer, readHttpConfig } from "./http-server.js";

const config = readHttpConfig();
const httpServer = createMcpHttpServer(config);

httpServer.listen(config.port, config.host, () => {
  console.error(
    `TypesenseKit MCP HTTP server listening on http://${config.host}:${config.port}${config.path}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
  });
}
