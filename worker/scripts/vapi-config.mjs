/**
 * The Vapi assistant definition: single source of truth.
 *
 * Vapi is only the call orchestrator (phone line, speech-to-text, text-to-speech, turn-taking, barge-in); the model is a
 * `custom-llm` pointing at this Worker, so all thinking happens in the AgriBot brain. Every field was checked against
 * Vapi's published OpenAPI schema (https://api.vapi.ai/api-json; test/vapi-config.test.ts validates it), because Vapi
 * rejects unknown properties with HTTP 400.
 */
export const ASSISTANT_NAME = "AgriBot Copilot";

export const KEYTERMS = [
  "Yolo", "Woodland", "Esparto", "Capay", "Dunnigan", "Zamora", "Clarksburg", "Winters", "Knights Landing", "West Sacramento", "Davis",
  "almonds", "pistachios", "walnuts", "tomatoes", "grapes", "rice", "wind", "spray", "spraying", "mites", "aphids", "irrigation",
  "evapotranspiration", "hull split", "harvest", "frost", "forecast",
];

export function buildAssistantConfig({
  baseUrl,
  secret,
  name = ASSISTANT_NAME,
  // Credit-conscious defaults: Deepgram Aura-2 (natural, ~$0.007/min of speech - cheaper than Vapi's own voices, which
  // measured $0.05 per 1k characters and sound synthetic), calls capped at 5 minutes, no optional add-ons.
  // voiceProvider: "deepgram" | "vapi" | "11labs" | "openai" | "cartesia" | "rime-ai".  denoise:true for noisy fields.
  voiceProvider = "deepgram",
  voiceId = { deepgram: "thalia", vapi: "Elliot", "11labs": "21m00Tcm4TlvDq8ikWAM", openai: "nova", cartesia: "", "rime-ai": "cove" }[voiceProvider] ?? "thalia",
  maxDurationSeconds = 300,
  personalizedGreeting = false,
  denoise = false,
}) {
  const base = baseUrl.replace(/\/+$/, "");
  const headers = { "X-Vapi-Secret": secret };

  const voice =
    voiceProvider === "deepgram"
      ? { provider: "deepgram", model: "aura-2", voiceId, fallbackPlan: { voices: [{ provider: "vapi", voiceId: "Elliot" }] } }
      : voiceProvider === "vapi"
      ? { provider: "vapi", voiceId }
      : voiceProvider === "openai"
      ? { provider: "openai", model: "tts-1", voiceId }
      : voiceProvider !== "11labs"
      ? { provider: voiceProvider, voiceId }
      : {
          provider: "11labs",
          voiceId,
          model: "eleven_flash_v2_5", // lowest-latency ElevenLabs model
          stability: 0.5,
          similarityBoost: 0.75,
          optimizeStreamingLatency: 3,
          fallbackPlan: { voices: [{ provider: "vapi", voiceId: "Elliot" }] },
        };

  const config = {
    name,
    // Static greeting = most reliable. `personalizedGreeting` lets the brain say "Welcome back, last time we talked about
    // walnuts near Esparto" by generating the first message itself.
    ...(personalizedGreeting
      ? { firstMessageMode: "assistant-speaks-first-with-model-generated-message" }
      : {
          // No brand name here: TTS engines read "Deep Ag" as "Deepak". Say what the caller needs to hear.
          firstMessage: "Hi, this is your Yolo County farm advisor. What can I help you with?",
          firstMessageMode: "assistant-speaks-first",
        }),
    firstMessageInterruptionsEnabled: true,
    model: {
      provider: "custom-llm",
      url: `${base}/api/vapi-llm`, // Vapi appends /chat/completions
      model: "agribot",
      temperature: 0.3,
      maxTokens: 200,
      timeoutSeconds: 30,
      metadataSendMode: "variable", // adds `call` and `customer` (phone number) to each request
      headers,
    },
    server: {
      url: `${base}/webhook/vapi`,
      timeoutSeconds: 20,
      backoffPlan: { type: "fixed", maxRetries: 1, baseDelaySeconds: 1 },
      headers,
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "en",
      smartFormat: true,
      numerals: true, // "county road ninety eight" -> "county road 98"
      keyterm: KEYTERMS,
      fallbackPlan: { transcribers: [{ provider: "assembly-ai", language: "en" }] },
    },
    voice,
    // --- turn-taking: fast endpointing, quick barge-in
    startSpeakingPlan: { waitSeconds: 0.3, smartEndpointingPlan: { provider: "livekit" } },
    stopSpeakingPlan: { numWords: 0, voiceSeconds: 0.2, backoffSeconds: 1 },
    backgroundSound: "off",
    ...(denoise ? { backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } } } : {}), // tractors, wind
    // --- call lifetime (credits are finite: cap runaway calls)
    maxDurationSeconds,
    hooks: [
      {
        on: "customer.speech.timeout",
        options: { timeoutSeconds: 12, triggerMaxCount: 2, triggerResetMode: "onUserSpeech" },
        do: [{ type: "say", exact: "Are you still there? I'm happy to keep helping." }],
      },
    ],
    serverMessages: ["status-update", "transcript", "end-of-call-report", "hang"],
    metadata: { app: "agribot" },
  };
  return config;
}
