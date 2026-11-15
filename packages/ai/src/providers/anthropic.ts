import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@hks/shared";
import type { ChatEvent, ChatModelProvider, ChatRequest, ProviderDescriptor } from "./types.ts";

/**
 * Claude through the Anthropic API (development).
 *
 * NOT YET VERIFIED AGAINST THE LIVE API: no API key was available when this
 * was written. The request shape follows the SDK's typed `messages.stream`
 * call. Sampling parameters are deliberately not sent; the model ID comes
 * from configuration only.
 */
export class AnthropicChatModel implements ChatModelProvider {
  readonly descriptor: ProviderDescriptor;
  private readonly client: Anthropic;

  constructor(options: { apiKey: string; modelId: string; timeoutMs: number; client?: Anthropic }) {
    this.descriptor = { provider: "anthropic", modelId: options.modelId, kind: "live" };
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 1 });
  }

  async *streamAnswer(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.descriptor.modelId,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: "done",
        inputTokens: final.usage?.input_tokens ?? null,
        outputTokens: final.usage?.output_tokens ?? null,
        stopReason: final.stop_reason ?? null,
      };
    } catch (error) {
      if (signal?.aborted) return;
      // Provider messages can echo request content; keep only the status.
      const status = (error as { status?: number }).status;
      throw new AppError("provider_error", `Anthropic request failed${status ? ` (HTTP ${status})` : ""}`, { cause: error });
    }
  }
}
