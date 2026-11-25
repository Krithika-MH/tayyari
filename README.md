# Tayyari — Calm Family Event Planning

> *"Run your own event like you hired a planner, for the price of a small pass."*

Tayyari is a mobile-first web portal where Indian families plan weddings, engagements, birthdays, festival gatherings, and housewarmings together without hiring an event manager. It combines deterministic rupee budgeting, owner-assigned tasks, voice-to-decision approvals, local vendor/NGO discovery, and multilingual communication.

## How the Three Hackathon Sponsors Work in Tayyari

| Sponsor | Role in Tayyari |
|---|---|
| **Sarvam AI** | Speech-to-text (`saaras:v4`, `mode=codemix`, domain `keyterms`) for Kannada, Hindi, and English voice notes; structured intent extraction & Planning Agent reasoning (`sarvam-105b`); multilingual message drafting; text-to-speech (`bulbul:v4-flash`) **Listen** playback on decisions and the run sheet. |
| **NudgeBee** | Powers the real human-approval workflow for both **budget-changing requests** (`kind: "change_request"`) and **leftover-food NGO outreach** (`kind: "leftover_outreach"`). Approved/rejected branches call Tayyari's authenticated `/api/nudgebee/callback` endpoint. |
| **Flagsmith** | Server-side evaluation per `event_id` with traits (`plan`, `city`, `event_type`, `language`). Toggles modules (`module_vendor_finder`, `module_leftover_food`, `module_planning_agent`), switches `decision_card_style` (`impact_first` \| `compact`) live, and serves `plan_limits` remote config. |

## Architecture & Scalability

- **Framework**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + Radix Dialog + Framer Motion.
- **Database**: Supabase Postgres accessed strictly from Next.js server route handlers via `SUPABASE_SERVICE_ROLE_KEY`. Row-level security (RLS) is enabled on all tables with zero public policies. Every list table is indexed on `(event_id, created_at)`.
- **Tenancy & Access Links**: Members join via `/e/{eventId}?t={access_token}`. Server routes resolve the member from the token, enforce roles, and strip all rupee fields from API JSON responses when `can_see_amounts` is `false`.
- **Provider Abstraction**: `lib/providers/` (`sarvam.ts`, `nudgebee.ts`, `flagsmith.ts`, `places.ts`) behind interfaces in `lib/contracts.ts`.
- **Caching & Rate Limits**: Google Places results cached 24h in `place_cache`; per-event usage & daily caps enforced server-side in `usage`.
- *Honest note*: This is a clean, stateless, horizontally scalable architecture — not a load-tested production system.

---

## Setup from a Clean Clone

### 1. Install dependencies & configure environment

```bash
git clone <your-repo-url>
cd tayyari
npm install
cp .env.example .env.local
```

Fill in the server-side variables in `.env.local` (never commit `.env.local`):

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `SARVAM_API_KEY`, `SARVAM_STT_MODEL`, `SARVAM_LLM_BASE_URL`, `SARVAM_LLM_MODEL`, `SARVAM_TTS_MODEL`
- `FLAGSMITH_SERVER_KEY`
- `NUDGEBEE_WEBHOOK_URL`, `CALLBACK_SECRET`, `PUBLIC_BASE_URL`
- `GOOGLE_PLACES_API_KEY` (optional; falls back to clearly labelled sample listings if omitted)

### 2. Supabase Database Setup

1. Create a free project in Supabase.
2. Open the **SQL Editor** and run the entire contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Copy the Project URL (`SUPABASE_URL`) and Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`) into your environment variables.
4. Optionally seed the demo engagement from CLI:
   ```bash
   npm run seed
   ```
   Or click **Load demo event** directly in the app UI.

### 3. Flagsmith Flags Setup

Create a project and environment in Flagsmith, copy the **Server-side Environment Key** (`FLAGSMITH_SERVER_KEY`), and create these flags:

| Flag Name | Type | Default Value | Purpose |
|---|---|---|---|
| `decision_card_style` | Multivariate string | `impact_first` (variants: `impact_first`, `compact`) | Switches DecisionCard layout live |
| `module_vendor_finder` | Boolean | `true` | Shows/hides Vendors tab & gates write routes |
| `module_leftover_food` | Boolean | `true` | Shows/hides Leftovers tab & gates write routes |
| `module_planning_agent` | Boolean | `true` | Shows/hides Ask Tayyari agent panel |
| `free_voice_requests_limit` | Remote config number | `5` | Voice requests per free event |
| `free_agent_messages_limit` | Remote config number | `20` | Agent messages per free event |
| `plan_limits` | Remote config JSON | See below | Plan limits per tier (`free`, `pass_30`, `pass_60`) |

Example `plan_limits` JSON:
```json
{
  "free": { "members": 4, "voice_requests": 5, "agent_messages": 20, "vendor_searches": 10, "leftover_outreach": 1 },
  "pass_30": { "members": 15, "voice_requests": 60, "agent_messages": 300, "vendor_searches": 100, "leftover_outreach": 3 },
  "pass_60": { "members": 25, "voice_requests": 120, "agent_messages": 600, "vendor_searches": 200, "leftover_outreach": 3 }
}
```

### 4. NudgeBee Workflow Setup

Create **one workflow** in the NudgeBee Workflow Builder that handles both approval flows:

1. **Trigger**: Webhook integration (`workflow_webhook`). Copy the generated webhook URL to `NUDGEBEE_WEBHOOK_URL`.
   - Incoming payload from Tayyari:
     ```json
     {
       "kind": "change_request | leftover_outreach",
       "refId": "<uuid>",
       "summary": "Approve: 150 to 200 plates (+₹17,500, ₹5,500 over budget)",
       "eventName": "Ananya & Rohan Engagement",
       "decisionOwnerName": "Aunt Lakshmi",
       "deltaINR": 17500,
       "projectedOverUnderINR": 5500
     }
     ```
2. **Approval Task**: Title from `Inputs.summary`, set task timeout (e.g., 30 minutes) and automation timeout.
3. **Branch on Approval Result**:
   - **Approved branch** — HTTP `POST` to `{PUBLIC_BASE_URL}/api/nudgebee/callback`:
     - Header: `Authorization: Bearer {CALLBACK_SECRET}`
     - Body:
       ```json
       {
         "kind": "{{Inputs.kind}}",
         "refId": "{{Inputs.refId}}",
         "decision": "approved",
         "idempotencyKey": "{{Inputs.refId}}:approved"
       }
       ```
   - **Rejected branch** — HTTP `POST` to `{PUBLIC_BASE_URL}/api/nudgebee/callback` with `"decision": "rejected"` and `"idempotencyKey": "{{Inputs.refId}}:rejected"`.

Verify the callback endpoint before connecting NudgeBee:
```bash
# Expect 401
curl -i -X POST "$PUBLIC_BASE_URL/api/nudgebee/callback" \
  -H "Authorization: Bearer wrong-secret" -H "Content-Type: application/json" \
  -d '{"kind":"change_request","refId":"00000000-0000-0000-0000-000000000000","decision":"approved","idempotencyKey":"test:1"}'
```

---

## Verification & Tests

```bash
npm run typecheck
npm run selftest
npm run build
```

`npm run selftest` verifies:
- Golden budget test (`150 -> 200` plates @ `₹350`: `+₹17,500`, `₹1,25,500` projected, `₹5,500` over `₹1,20,000`; `170` option: `+₹7,000`, `₹1,15,000`)
- Category summaries with `price unknown` expenses (never treated as zero)
- Zod input & callback validation rejections
- NudgeBee callback `401` auth, idempotency (`200`), conflicting decision (`409`), and stale baseline detection
- Role-based amount redaction (`can_see_amounts = false` removes rupee values from API JSON)
- One-pending-proposal-per-expense rule and pending-proposal expense deletion guard
- Planning agent permission enforcement (unknown tools and forbidden actions rejected in code)

---

## Deployment (Firebase App Hosting / Vercel)

Because Tayyari uses Next.js 15 server route handlers to keep API keys and `CALLBACK_SECRET` off the client, deploy using a Node.js SSR target:

- **Firebase App Hosting**: `apphosting.yaml` and `firebase.json` are included. Connect your GitHub repo or run `firebase deploy` with Blaze billing enabled and configure runtime secrets in Firebase App Hosting / Secret Manager.
- **Vercel**: Import the GitHub repo, set all environment variables from `.env.example`, and copy the resulting `https://...` URL to `PUBLIC_BASE_URL`.

---

## Known Honest Limits

1. **No live vendor prices**: Google Places returns real operational business listings; prices come strictly from quotes typed by the family.
2. **Unverified NGO listings**: Food donation listings carry *"Unverified listing. Contact to confirm they can accept food today."* Tayyari never certifies food safety or NGO acceptance.
3. **Pricing numbers are unvalidated test figures**: The Free / ₹299 / ₹499 Event Pass page is a demo activation flow without real payment collection.
4. **NudgeBee approver identity**: The NudgeBee workflow owner approves in NudgeBee on the named family decision owner's behalf, displayed honestly as *"Approved in NudgeBee workflow"*.
