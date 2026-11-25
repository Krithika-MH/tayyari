# AI Coding Tools Disclosure

In compliance with Festive Hacks submission guidelines, here is a transparent disclosure of the AI tools and models used in building **Tayyari**:

1. **Google Antigravity (AI Coding Assistant)**:
   - Used for scaffolding the Next.js 15 / TypeScript / Tailwind CSS architecture, writing `supabase/schema.sql`, designing the deterministic budget engine (`lib/domain/budget.ts`), implementing API route handlers, building UI components, and generating `scripts/selftest.ts` and documentation.
   - Multi-agent parallel delegation was used inside Antigravity across core shell/budget, sponsor integrations, and vendor/agent discovery workstreams.
2. **Runtime AI Services (Product Features)**:
   - **Sarvam AI**: Used inside the live product for Kannada/Hindi/English speech-to-text (`saaras:v4` / configured `SARVAM_STT_MODEL`), structured intent extraction, multilingual message drafting, planning agent reasoning (`sarvam-105b` / configured `SARVAM_LLM_MODEL`), and text-to-speech (`bulbul:v4-flash` / configured `SARVAM_TTS_MODEL`).

All money math, role-based access control, amount redaction, stale-proposal checks, and NudgeBee approval state transitions are implemented in deterministic server-side TypeScript code — never delegated to an LLM.
