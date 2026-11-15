/**
 * LIVE TEST - calls Amazon Bedrock ConverseStream (paid). Skipped unless LIVE_BEDROCK_CHAT=1.
 * Four small requests through BedrockChatModel. AWS credentials come from the default
 * provider chain (AWS_PROFILE, SSO, environment or role); they are never read by this file.
 * See docs/REAL_PROVIDER_VERIFICATION.md, step 4.
 */
import { afterAll } from "vitest";
import { BedrockChatModel } from "../../packages/ai/src/index.ts";
import { bedrockRegion, defineChatModelChecks, liveGate, liveSuite, Observations, requiredEnv } from "./helpers.ts";

const gate = liveGate(
  "Amazon Bedrock chat adapter",
  "LIVE_BEDROCK_CHAT",
  ["AWS_REGION|BEDROCK_REGION", "LLM_MODEL_ID"],
  "LLM_MODEL_ID must be a Bedrock model ID or inference-profile ID; AWS credentials from the default chain.",
);

liveSuite(gate, () => {
  const observations = new Observations("bedrock-chat");
  afterAll(() => observations.write());

  defineChatModelChecks({
    suite: "bedrock-chat",
    observations,
    create: () => new BedrockChatModel({ region: bedrockRegion(), modelId: requiredEnv("LLM_MODEL_ID") }),
  });
});
