# Quote Desk: AI-drafted quotes for small contractors

Someone at a contractor pastes in a customer enquiry. The app drafts a quote from **that company's own price list**, a person checks and edits it, and nothing is approved without them clicking Approve. Built for Hollis Groundworks; works for any number of companies, each with its own data and its own AI key.

- **Live app:** https://hollis-quote-desk.vercel.app
- **Logins:** sent in the email (one for Hollis Groundworks, one for Chase Landscapes, the made-up second firm)
- **Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Postgres, Auth, RLS) · Vercel · OpenAI or Anthropic (per company)

## How it works

```
enquiry text
   │
   ├─► customer match (code: email / phone / name+address)       ─┐
   │                                                              │
   ├─► AI (company's own key) proposes:                           │
   │     job summary, outcome (quote / site visit / can't quote), │
   │     rate CODES + raw measurements, exclusions, assumptions,  │
   │     questions for the customer, suspicious text              │
   │                                                              ▼
   └─► code builds the draft: validates codes against this company's active rates,
       converts feet/sq ft → metric, multiplies out dimensions, looks up prices,
       applies modifiers, £450 minimum, 20% VAT, area limit → site visit
                     │
                     ▼
              DRAFT quote ──► person reviews / edits ──► Approve (stamped by DB) / Reject
```

### What the AI decides, and what it deliberately doesn't

| AI decides | Code decides | Only a person decides |
|---|---|---|
| What the job is | Every price, line total, VAT, minimum charge | Approving or rejecting |
| Which rate codes apply | Unit conversion (ft → m) and quantity maths | Any price override |
| The measurements the customer gave (in their units) | Rejecting unknown, superseded or unpriced codes | Pricing a site-visit job after the visit |
| Whether it needs a site visit / can't be priced | Forcing a site visit above the area limit (150 m²) | Which customer record it belongs to (AI never matches customers) |
| Assumptions and questions for the customer | Flagging text in the enquiry aimed at automated systems | |

The model's output schema **has no field** for price, discount, VAT or status, so nothing in an enquiry can talk it into changing them. The prompt also treats the enquiry as untrusted data, and code separately checks for text aimed at automated systems and shows it to the reviewer in red.

When the model isn't sure it should say so: excluded items are listed with a reason (*we don't do this*, *no price in the rate list*, *outside our trade*), and quantities it had to estimate are flagged for checking.

## Multi-tenancy and security

- **Isolation in the database, not just the app.** Every tenant table has `company_id` with Row Level Security (`is_member(company_id)`). The app queries as the signed-in user, so even a bug in a page can't return another company's rows. Composite foreign keys `(id, company_id)` stop a quote pointing at another company's customer.
- **The company is never taken from the request.** It's resolved from the verified user's membership (`lib/tenant.ts`). Another company's quote URL returns 404.
- **Bring your own key.** Keys are validated with a test call, then encrypted with AES-256-GCM (`lib/crypto.ts`) using a server-only secret, with the company id as additional authenticated data (a ciphertext copied to another company's row won't decrypt). The key table has RLS on, **no policies, and all grants revoked**, so no client can read it at all. The server reads it with the service role in one file (`lib/ai-settings.ts`), only for the caller's own company. The UI shows the last 4 characters only. Provider errors are mapped to friendly messages, never echoed back raw.
- **Approval integrity in the database.** Triggers force every new quote to `draft`, stamp `approved_by`/`approved_at` from the session, and make approved quotes (and their lines) read-only.
- **Other basics:** Zod validation on every server action, enquiry size limit, per-company rate limit on AI calls, security headers (CSP, frame-ancestors none, HSTS), no enquiry text or keys in logs, append-only audit log.
- **Tests:** `tests/rls.test.ts` signs in as each company against the real database and tries to read and write across the boundary.

## The messy data

`scripts/seed.ts` imports Shaz's CSVs exactly as sent. The cleaning is in `lib/import/` and every decision is listed in [`docs/import-report.md`](docs/import-report.md) and on the Rates page.

**Rates:** byte-order mark at the start of the file; `m2 / sqm / m²` and `lin m / m` normalised; `"£1,250"` parsed; `TBC` → no price.
- PT01 was entered *inc VAT*, so we store £70.83 ex VAT.
- Duplicates and old prices are marked **superseded** and never offered to the AI: BP02, SB02 (March price SB03 wins), KB02 (KB01 kept; where unsure we keep the **higher** price, because under-quoting is what Dave can't afford), EX06.
- CO02 (£1,250 "per m³, probably per load") is **not used** until Dave confirms.
- KB04 dropped kerbs → **not offered**, refer to the council. TM03 resin → no price, ask Dave.
- "herringbone +£4" and "road permit +£60" became modifiers the AI can select, priced by code.
- BP04 (sand, "usually included in BP01??") is excluded so it isn't double-charged.

**Customers:** 13 rows → 9 customers. Merged by same email (Sandhu), same phone (Doyle), same surname + address (Okafor: "14 Linden Ave" = "14 Linden Avenue"), and same surname + company email domain (Hale). Kestrel Row's "send invoices here" and "30 day terms" become structured fields shown on the quote.

## Assumptions

_(to be updated with Dave/Shaz's answers)_
- Quotes are ex VAT with VAT at 20% shown separately; the £450 minimum applies to the ex-VAT subtotal and shows as a visible top-up line.
- More than 150 m² of surface area, car parks, or commercial sites → site visit, never priced from an email.
- Herringbone is only added when asked for.
- Material dug out needs disposal (muck away or skip); the AI includes it with its reasoning and the reviewer can remove it.
- "Approve" means "OK to send"; the app doesn't send emails.

## Running it

```bash
cp .env.example .env.local      # fill in Supabase + KEY_ENCRYPTION_SECRET (openssl rand -base64 32) + SEED_PASSWORD
supabase link --project-ref <ref> && supabase db push   # apply supabase/migrations
npm install
npm run seed                    # both companies, logins, Hollis rates + customers
npm run dev
npm test                        # unit tests; RLS tests run when .env.local is present
```

Then sign in, open **Settings**, and paste an OpenAI or Anthropic key.

## What I'd do next

- Upload CSVs in the app with a preview/diff, and let Shaz edit rates (with effective dates, so old quotes keep old prices).
- PDF quote output and sending from the app, with the approved version locked.
- An evaluation set of real past enquiries and Dave's actual quotes, to measure prompt changes rather than eyeball them.
- Invitations and roles per company (owner/staff are modelled already).
- Move key encryption to a KMS / Supabase Vault with key rotation.
- Audit logging via database triggers instead of the app.

## How I used AI tools

_(to be written)_
