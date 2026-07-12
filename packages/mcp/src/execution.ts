export type McpExecutionConfig = {
  timeoutMs: number;
  maxConcurrency: number;
  rateLimitPerMinute: number;
  maxResponseBytes: number;
};

const DEFAULT_CONFIG: McpExecutionConfig = {
  timeoutMs: 30_000,
  maxConcurrency: 8,
  rateLimitPerMinute: 120,
  maxResponseBytes: 1024 * 1024,
};

export class McpExecutionLimitError extends Error {}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

export function readMcpExecutionConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpExecutionConfig {
  return {
    timeoutMs: positiveInteger(
      env.TYPESENSEKIT_MCP_TOOL_TIMEOUT_MS,
      DEFAULT_CONFIG.timeoutMs,
      "MCP tool timeout",
    ),
    maxConcurrency: positiveInteger(
      env.TYPESENSEKIT_MCP_MAX_CONCURRENCY,
      DEFAULT_CONFIG.maxConcurrency,
      "MCP concurrency limit",
    ),
    rateLimitPerMinute: positiveInteger(
      env.TYPESENSEKIT_MCP_RATE_LIMIT_PER_MINUTE,
      DEFAULT_CONFIG.rateLimitPerMinute,
      "MCP rate limit",
    ),
    maxResponseBytes: positiveInteger(
      env.TYPESENSEKIT_MCP_MAX_RESPONSE_BYTES,
      DEFAULT_CONFIG.maxResponseBytes,
      "MCP response limit",
    ),
  };
}

export class McpExecutionController {
  readonly config: McpExecutionConfig;
  private active = 0;
  private starts: number[] = [];
  private readonly clock: () => number;

  constructor(config: McpExecutionConfig, clock: () => number = Date.now) {
    this.config = config;
    this.clock = clock;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const now = this.clock();
    this.starts = this.starts.filter((started) => now - started < 60_000);

    if (this.starts.length >= this.config.rateLimitPerMinute) {
      throw new McpExecutionLimitError(
        `MCP tool rate limit exceeded (${this.config.rateLimitPerMinute} calls per minute).`,
      );
    }
    if (this.active >= this.config.maxConcurrency) {
      throw new McpExecutionLimitError(
        `MCP tool concurrency limit exceeded (${this.config.maxConcurrency} active calls).`,
      );
    }

    this.starts.push(now);
    this.active += 1;
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        task(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new McpExecutionLimitError(
                  `MCP tool timed out after ${this.config.timeoutMs}ms.`,
                ),
              ),
            this.config.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.active -= 1;
    }
  }

  serialize(value: unknown): string {
    const text = JSON.stringify(value, null, 2);
    const bytes = Buffer.byteLength(text);
    if (bytes > this.config.maxResponseBytes) {
      throw new McpExecutionLimitError(
        `MCP tool response is ${bytes} bytes, exceeding the ${this.config.maxResponseBytes}-byte limit. Narrow the request or increase TYPESENSEKIT_MCP_MAX_RESPONSE_BYTES.`,
      );
    }
    return text;
  }
}

let sharedController: McpExecutionController | undefined;

export function sharedMcpExecutionController(): McpExecutionController {
  sharedController ??= new McpExecutionController(readMcpExecutionConfig());
  return sharedController;
}
