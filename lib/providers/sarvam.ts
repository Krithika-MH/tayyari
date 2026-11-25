import { createHash } from "crypto";
import {
  AgentModelOutputSchema,
  ExtractedIntentSchema,
  type AgentModelOutput,
  type EventType,
  type ExtractedIntent,
  type LanguageCode,
  type LlmProvider,
  type MessageRecipientType,
  type SpeechProvider,
} from "@/lib/contracts";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const REQUEST_TIMEOUT_MS = 20_000;

const ttsCache = new Map<string, { audioBase64: string; mimeType: string }>();

async function fetchWithRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Sarvam API request failed");
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export class SarvamSpeechProvider implements SpeechProvider {
  async transcribe(input: {
    audioBytes: Uint8Array;
    mimeType: string;
    fileName: string;
    languageCode: LanguageCode | "unknown";
    keyterms?: string[];
  }): Promise<{
    transcript: string;
    languageCode: string;
    provider: "sarvam";
  }> {
    const apiKey = process.env.SARVAM_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY is not configured.");
    }
    const model = process.env.SARVAM_STT_MODEL?.trim() || "saaras:v4";

    const form = new FormData();
    const blob = new Blob([Buffer.from(input.audioBytes)], {
      type: input.mimeType || "audio/webm",
    });
    form.append("file", blob, input.fileName || "audio.webm");
    form.append("model", model);
    form.append("language_code", input.languageCode || "unknown");
    form.append("mode", "codemix");
    if (input.keyterms && input.keyterms.length > 0 && model.includes("v4")) {
      form.append("keyterms", JSON.stringify(input.keyterms.slice(0, 50)));
    }

    const res = await fetchWithRetry(SARVAM_STT_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
      },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Sarvam STT failed (HTTP ${res.status})${errText ? `: ${errText.slice(0, 120)}` : ""}`
      );
    }

    const data = (await res.json()) as {
      transcript?: string;
      language_code?: string;
    };

    const transcript = (data.transcript ?? "").trim();
    if (!transcript) {
      throw new Error("Audio sounded silent or unclear. Please type your request.");
    }

    return {
      transcript,
      languageCode: data.language_code ?? input.languageCode,
      provider: "sarvam",
    };
  }

  async synthesize(input: {
    text: string;
    languageCode: LanguageCode;
  }): Promise<{ audioBase64: string; mimeType: string }> {
    const apiKey = process.env.SARVAM_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY is not configured.");
    }

    const model = process.env.SARVAM_TTS_MODEL?.trim() || "bulbul:v4-flash";
    const cacheKey = createHash("sha256")
      .update(`${model}:${input.languageCode}:${input.text}`)
      .digest("hex");
    const cached = ttsCache.get(cacheKey);
    if (cached) return cached;

    const speakerByLang: Record<LanguageCode, string> = {
      "en-IN": model.includes("v4") ? "simran_en_customer" : "simran",
      "kn-IN": model.includes("v4") ? "kavya_hi_conversational" : "ritu",
      "hi-IN": model.includes("v4") ? "kavya_hi_conversational" : "ritu",
    };

    const res = await fetchWithRetry(SARVAM_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        text: input.text.slice(0, 500),
        target_language_code: input.languageCode,
        model,
        speaker: speakerByLang[input.languageCode],
      }),
    });

    if (!res.ok) {
      throw new Error(`Sarvam TTS failed (HTTP ${res.status})`);
    }

    const data = (await res.json()) as { audios?: string[] };
    const audioBase64 = data.audios?.[0];
    if (!audioBase64) {
      throw new Error("Sarvam TTS returned no audio data");
    }

    const result = { audioBase64, mimeType: "audio/wav" };
    ttsCache.set(cacheKey, result);
    return result;
  }
}

export class SarvamLlmProvider implements LlmProvider {
  private getConfig() {
    const apiKey = process.env.SARVAM_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY is not configured.");
    }
    const baseUrl = (
      process.env.SARVAM_LLM_BASE_URL?.trim() || "https://api.sarvam.ai/v1"
    ).replace(/\/$/, "");
    const model = process.env.SARVAM_LLM_MODEL?.trim() || "sarvam-105b";
    return { apiKey, baseUrl, model };
  }

  private async chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    temperature = 0.1
  ): Promise<string> {
    const { apiKey, baseUrl, model } = this.getConfig();
    const res = await fetchWithRetry(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    });
    if (!res.ok) {
      throw new Error(`Sarvam LLM failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Sarvam LLM returned an empty response");
    }
    return content;
  }

  async extractIntent(input: {
    text: string;
    languageCode: LanguageCode;
    expenseTitles: string[];
  }): Promise<ExtractedIntent> {
    const system = `You extract family event planning requests into strict JSON.
Extract ONLY what is explicitly stated. Never invent prices, consent, or approvals.
Output JSON only with keys:
{ "intent": "change_quantity" | "add_expense" | "add_task" | "unknown", "item": string|null, "newQuantity": number|null, "unitPriceINR": number|null, "missing": string[] }
Known event expense items: ${input.expenseTitles.join(", ") || "none"}.`;

    const raw = await this.chat([
      { role: "system", content: system },
      {
        role: "user",
        content: `Language: ${input.languageCode}\nRequest: ${input.text}`,
      },
    ]);

    const parsed = ExtractedIntentSchema.safeParse(
      JSON.parse(stripCodeFences(raw))
    );
    if (parsed.success) return parsed.data;
    return {
      intent: "unknown",
      item: null,
      newQuantity: null,
      unitPriceINR: null,
      missing: ["Please clarify the item and new quantity."],
    };
  }

  async draftMessage(input: {
    recipientType: MessageRecipientType;
    recipientName: string;
    purpose: string;
    language: LanguageCode;
    facts: Record<string, string | number | null>;
  }): Promise<string> {
    const langName =
      input.language === "kn-IN"
        ? "Kannada (simple conversational Kannada)"
        : input.language === "hi-IN"
        ? "Hindi (polite conversational Hindi)"
        : "English (warm Indian English)";

    const system = `You write short, polite family event coordination messages in ${langName}.
Use ONLY the facts provided. Never invent prices, confirmations, or food-safety guarantees.
If recipientType is "ngo", state clearly that this is an enquiry asking if they can collect food today.
Return only the message body text (no markdown, no quotes).`;

    const text = await this.chat(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            recipientType: input.recipientType,
            recipientName: input.recipientName,
            purpose: input.purpose,
            facts: input.facts,
          }),
        },
      ],
      0.3
    );

    return text.trim();
  }

  async agentStep(input: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<AgentModelOutput> {
    const firstRaw = await this.chat([
      { role: "system", content: input.systemPrompt },
      ...input.messages,
    ]);

    try {
      const parsed = AgentModelOutputSchema.safeParse(
        JSON.parse(stripCodeFences(firstRaw))
      );
      if (parsed.success) return parsed.data;
    } catch {
      // One repair retry
    }

    const retryRaw = await this.chat([
      { role: "system", content: input.systemPrompt },
      ...input.messages,
      { role: "assistant", content: firstRaw },
      {
        role: "user",
        content:
          'Reply ONLY with valid JSON matching {"say": string|null, "tool": string|null, "args": object|null}.',
      },
    ]);

    const retryParsed = AgentModelOutputSchema.safeParse(
      JSON.parse(stripCodeFences(retryRaw))
    );
    if (retryParsed.success) return retryParsed.data;

    return {
      say: "I could not understand that step cleanly. Could you rephrase in one short sentence?",
      tool: null,
      args: null,
    };
  }

  async festiveIdeas(input: {
    eventType: EventType;
    category: string;
    vibe: string;
    language: LanguageCode;
  }): Promise<string[]> {
    const system = `Suggest exactly 5 practical, budget-friendly ideas for an Indian ${input.eventType} (${input.category}, vibe: ${input.vibe}).
Never mention any rupee prices or currency amounts. Output a JSON array of 5 short strings only.`;

    const raw = await this.chat(
      [
        { role: "system", content: system },
        { role: "user", content: `Language preference: ${input.language}` },
      ],
      0.5
    );
    try {
      const arr = JSON.parse(stripCodeFences(raw));
      if (Array.isArray(arr)) {
        return arr
          .map((x) => String(x).replace(/₹\s?[\d,]+/g, "(price varies by vendor)"))
          .slice(0, 5);
      }
    } catch {
      // fall through
    }
    return [
      "Use marigold and mango leaf garlands at the entrance for warm colour.",
      "Group brass diyas or earthen lamps near the welcome table.",
      "Print a single reusable welcome board instead of individual flyers.",
      "Choose seasonal local flowers from the morning market.",
      "Pack return gifts in reusable cotton potli bags.",
    ];
  }
}

export const sarvamSpeechProvider = new SarvamSpeechProvider();
export const sarvamLlmProvider = new SarvamLlmProvider();
