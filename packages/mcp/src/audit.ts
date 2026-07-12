export type McpAuditEvent = {
  timestamp: string;
  operation: string;
  outcome: "started" | "succeeded" | "failed";
  durationMs?: number;
  errorName?: string;
};

export type McpAuditLogger = {
  record: (event: McpAuditEvent) => void;
};

const disabledLogger: McpAuditLogger = { record: () => undefined };

export function createMcpAuditLogger(
  env: NodeJS.ProcessEnv = process.env,
  sink: (line: string) => void = console.error,
): McpAuditLogger {
  const enabled = ["1", "true", "yes", "on"].includes(
    (env.TYPESENSEKIT_MCP_AUDIT_LOG ?? "").toLowerCase(),
  );
  if (!enabled) return disabledLogger;
  return {
    record(event) {
      sink(JSON.stringify({ type: "typesensekit.mcp.tool", ...event }));
    },
  };
}
