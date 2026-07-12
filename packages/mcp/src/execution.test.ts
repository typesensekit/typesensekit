import { describe, expect, it, vi } from "vitest";
import { McpExecutionController, readMcpExecutionConfig } from "./execution.js";

const baseConfig = {
  timeoutMs: 100,
  maxConcurrency: 2,
  rateLimitPerMinute: 10,
  maxResponseBytes: 1024,
};

describe("MCP execution configuration", () => {
  it("uses bounded defaults", () => {
    expect(readMcpExecutionConfig({})).toEqual({
      timeoutMs: 30_000,
      maxConcurrency: 8,
      rateLimitPerMinute: 120,
      maxResponseBytes: 1024 * 1024,
    });
  });
});

describe("MCP execution controller", () => {
  it("limits active calls", async () => {
    const controller = new McpExecutionController({
      ...baseConfig,
      maxConcurrency: 1,
    });
    let release: (() => void) | undefined;
    const first = controller.run(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await expect(controller.run(async () => undefined)).rejects.toThrow(
      "concurrency limit exceeded",
    );
    release?.();
    await first;
  });

  it("limits calls in a rolling minute", async () => {
    let now = 1_000;
    const controller = new McpExecutionController(
      { ...baseConfig, rateLimitPerMinute: 1 },
      () => now,
    );
    await controller.run(async () => "first");
    await expect(controller.run(async () => "second")).rejects.toThrow(
      "rate limit exceeded",
    );
    now += 60_000;
    await expect(controller.run(async () => "third")).resolves.toBe("third");
  });

  it("times out stalled operations", async () => {
    vi.useFakeTimers();
    const controller = new McpExecutionController({
      ...baseConfig,
      timeoutMs: 50,
    });
    const result = controller.run(() => new Promise(() => undefined));
    const rejection = expect(result).rejects.toThrow("timed out after 50ms");
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    vi.useRealTimers();
  });

  it("rejects oversized serialized responses", () => {
    const controller = new McpExecutionController({
      ...baseConfig,
      maxResponseBytes: 10,
    });
    expect(() => controller.serialize({ result: "too large" })).toThrow(
      "exceeding the 10-byte limit",
    );
  });
});
