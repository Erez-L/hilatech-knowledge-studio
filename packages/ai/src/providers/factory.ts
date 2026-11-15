import { AppError, type Config } from "@hks/shared";
import { AnthropicChatModel } from "./anthropic.ts";
import { BedrockChatModel, BedrockCohereEmbeddings } from "./bedrock.ts";
import { DeterministicChatModel, DeterministicEmbeddings } from "./deterministic.ts";
import type { ChatModelProvider, EmbeddingsProvider } from "./types.ts";

/**
 * Builds providers from configuration. Returns null for a provider set to
 * "none": callers must then report that the feature is not configured.
 * Config validation has already refused test doubles in production.
 */
export function createEmbeddingsProvider(config: Config): EmbeddingsProvider | null {
  switch (config.EMBEDDINGS_PROVIDER) {
    case "none":
      return null;
    case "deterministic":
      return new DeterministicEmbeddings(config.EMBEDDINGS_DIMENSIONS);
    case "bedrock-cohere":
      return new BedrockCohereEmbeddings({
        region: region(config),
        modelId: config.EMBEDDINGS_MODEL_ID!,
        dimensions: config.EMBEDDINGS_DIMENSIONS,
        batchSize: config.EMBEDDINGS_BATCH_SIZE,
      });
  }
}

export function createChatModel(config: Config): ChatModelProvider | null {
  switch (config.LLM_PROVIDER) {
    case "none":
      return null;
    case "deterministic":
      return new DeterministicChatModel();
    case "anthropic":
      return new AnthropicChatModel({
        apiKey: config.ANTHROPIC_API_KEY!,
        modelId: config.LLM_MODEL_ID!,
        timeoutMs: config.LLM_TIMEOUT_MS,
      });
    case "bedrock":
      return new BedrockChatModel({ region: region(config), modelId: config.LLM_MODEL_ID! });
  }
}

function region(config: Config): string {
  const value = config.BEDROCK_REGION ?? config.AWS_REGION;
  if (!value) throw new AppError("not_configured", "AWS region is not set");
  return value;
}

/** "live" only when both providers are real; anything involving a test double is "sample". */
export function pipelineModeOf(chat: ChatModelProvider, embeddings: EmbeddingsProvider): "live" | "sample" {
  return chat.descriptor.kind === "live" && embeddings.descriptor.kind === "live" ? "live" : "sample";
}
