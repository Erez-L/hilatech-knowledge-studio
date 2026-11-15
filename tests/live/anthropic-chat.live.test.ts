/**
 * LIVE TEST - calls the Anthropic API (paid). Skipped unless LIVE_ANTHROPIC_CHAT=1.
 * Four small requests through AnthropicChatModel. See docs/REAL_PROVIDER_VERIFICATION.md, step 3.
 */
import { afterAll } from "vitest";
import { AnthropicChatModel } from "../../packages/ai/src/index.ts";
import { defineChatModelChecks, liveGate, liveSuite, Observations, requiredEnv } from "./helpers.ts";

const gate = liveGate("Anthropic API chat adapter", "LIVE_ANTHROPIC_CHAT", ["ANTHROPIC_API_KEY", "LLM_MODEL_ID"]);

liveSuite(gate, () => {
  const observations = new Observations("anthropic-chat");
  afterAll(() => observations.write());

  defineChatModelChecks({
    suite: "anthropic-chat",
    observations,
    create: () =>
      new AnthropicChatModel({
        apiKey: requiredEnv("ANTHROPIC_API_KEY"),
        // An Anthropic API model ID here, not a Bedrock ID.
        modelId: requiredEnv("LLM_MODEL_ID"),
        timeoutMs: 60_000,
      }),
  });
});
