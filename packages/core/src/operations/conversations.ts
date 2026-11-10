import { z } from "zod";
import { api, enc } from "./http.js";
import type { AnyZod, Operation } from "./types.js";

export const conversationOperations = [
  {
    name: "conversations.models.list",
    summary: "List conversation models",
    description: "List conversational search (RAG) models.",
    category: "conversations",
    input: z.object({}),
    execute: async (client) => api(client).get("/conversations/models"),
  },
  {
    name: "conversations.models.create",
    summary: "Create a conversation model",
    category: "conversations",
    input: z.object({ value: z.record(z.string(), z.unknown()) }),
    execute: async (client, input) =>
      api(client).post("/conversations/models", input.value),
  },
  {
    name: "conversations.models.retrieve",
    summary: "Retrieve a conversation model",
    description: "Get one conversational search (RAG) model by id.",
    category: "conversations",
    input: z.object({ id: z.string() }),
    execute: async (client, input) =>
      api(client).get(`/conversations/models/${enc(input.id)}`),
  },
  {
    name: "conversations.models.delete",
    summary: "Delete a conversation model",
    category: "conversations",
    input: z.object({ id: z.string() }),
    execute: async (client, input) =>
      api(client).delete(`/conversations/models/${enc(input.id)}`),
  },
  {
    name: "conversations.history.retrieve",
    summary: "Retrieve conversation history",
    description:
      "Get the stored history of one conversation by conversation_id.",
    category: "conversations",
    input: z.object({ conversation_id: z.string().optional() }),
    execute: async (client, input) =>
      api(client).get(
        "/conversations/history",
        input.conversation_id
          ? { conversation_id: input.conversation_id }
          : undefined,
      ),
  },
] satisfies Operation<AnyZod, unknown>[];
