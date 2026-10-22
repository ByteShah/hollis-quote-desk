# Quote Desk: AI-drafted quotes for small contractors

Someone at a contractor pastes in a customer enquiry. The app drafts a quote from **that company's own price list**, a person checks and edits it, and nothing is approved without an owner or manager clicking Approve. It's built for Hollis Groundworks and runs any number of companies, each with its own data, team and AI key.

- **Live app:** https://hollis-quote-desk.vercel.app
- **Logins:** sent in the submission email. Hollis Groundworks (owner, plus an estimator), Chase Landscapes (the made-up second firm), and a platform admin.
- **Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres, Auth, Row Level Security), Vercel, and OpenAI or Anthropic per company.

## What's in it

| Area | What it does |
|---|---|
| **Quotes** | Paste an enquiry, get a draft. Review, edit lines, approve or reject. A customer-facing preview to print. Full history. |
| **Price list** | Search, filter, group by category. Item form with an Odoo-style status bar. Prices are **dated versions**: change a price with a start date and a reason, schedule a rise, see the history. "Not reviewed in 6 months" warnings and bulk "mark reviewed". Archive instead of delete. |
| **Customers** | Search and tags. Customer form with their quotes, approved value and history. "Save as new customer" from an unmatched quote. Duplicate email or phone detection. Archive and restore. |
| **CSV import and export** | A wizard for price lists and customers: upload, match columns, preview every row (new / update / unchanged / error), apply in one transaction. **House rules** clean messy lists automatically (duplicates, "check ??" notes, "included in", minimum-charge items, +£ extras, categories from names) and show every decision. Import history with **undo**. Templates. Exports that are safe to open in Excel. |
| **Team and roles** | Owner, Manager, Estimator. Invite by one-time link, change role, deactivate. A company always keeps an owner. |
| **Onboarding** | A platform admin creates a company and invites its owner. The owner gets a setup checklist (rules, AI key, price list, customers, team, first quote). |
| **History** | Every create, change, archive and price version is logged **by database triggers** with before and after values. People can add notes. Nobody can edit or fake history. |

## How a quote is made

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
   └─► code builds the draft: only items in use with a price in effect today,
       feet/sq ft → metric, quantities from dimensions, prices from the database,
       extras (herringbone, road permit), whole loads, "included in", site-visit items,
       minimum charge, VAT, site-visit size limit,
       stale-price warnings
                     │
                     ▼
              DRAFT ──► anyone edits ──► owner/manager approves (stamped by the database) / rejects
```

### What the AI decides, and what it deliberately doesn't

| AI decides | Code decides | Only a person decides |
|---|---|---|
| What the job is | Every price, line total, VAT, minimum charge | Approving or rejecting (owner/manager) |
| Which price-list items apply | Unit conversion and quantity maths | Any price override on a quote |
| The measurements the customer gave, in their units | Rejecting unknown, archived or unpriced items | Pricing a site-visit job after the visit |
| Whether it needs a site visit or can't be priced | Forcing a site visit above the company's size limit | Which customer a quote belongs to (the AI never matches customers) |
| Assumptions and questions for the customer | Flagging text aimed at automated systems | Price list, customers, team, settings |

**Cost:**
- Customer matching is plain code and costs nothing.
- The rules and price list form a stable prompt prefix, so OpenAI's `prompt_cache_key` and Anthropic's `cache_control` bill repeat enquiries at the cached rate.
- Price lists over 150 items are narrowed by a cheap first call that picks categories.
- Each quote shows the tokens it used and how much came from cache.

When an enquiry comes from someone new, the AI also reads their phone, site address and postcode, so **Save as new customer** is pre-filled.

The model's output schema **has no field** for price, discount, VAT or status, so nothing written in an enquiry can change them. The enquiry is passed as untrusted data, and code also checks it separately for instructions aimed at an AI and shows any it finds to the reviewer in red. Enquiry 3 contains exactly this kind of instruction.

## Who can do what

| | Owner | Manager | Estimator | Platform admin |
|---|:-:|:-:|:-:|:-:|
| Draft and edit quotes, add and edit customers | ✓ | ✓ | ✓ | |
| Approve or reject quotes | ✓ | ✓ | | |
| Change prices, archive items, import and undo, export | ✓ | ✓ | | |
| AI key, company settings, team | ✓ | | | |
| Create companies, invite their first owner | | | | ✓ |

Every rule is enforced **in the database** (RLS policies, `has_role()` checks in functions and triggers). The screens only hide what would fail anyway. The platform admin sees company names and counts, never quotes, prices or customers.

## Security

- **Tenant isolation in the database.**
  - Every company-owned table has `company_id` and Row Level Security. The app queries as the signed-in user, so a bug in a page still can't return another company's rows.
  - Composite foreign keys `(id, company_id)` stop a record pointing at another company's record.
  - The company always comes from the user's active membership, never from the request. Another company's URL returns 404.
- **Bring your own key.**
  - Keys are tested with a real call, then encrypted with AES-256-GCM using a server-only secret. The company id is bound in, so a ciphertext copied to another company's row won't decrypt.
  - The key table has RLS on, no policies and all grants revoked, so no client can read it. Only `lib/ai-settings.ts` reads it, with the service role, for the caller's own company. The UI shows the last 4 characters.
- **Integrity.**
  - New quotes are always drafts. Approval is stamped from the session, and approved quotes are frozen.
  - Prices are append-only versions.
  - Edits carry a version number, so two people can't silently overwrite each other.
  - Item codes and record identities are immutable.
  - Clients can only update the specific columns the app edits (column-level grants).
- **History** is written by triggers. Users can only add notes.
- **Imports** are re-validated on the server at apply time (the preview is never trusted), applied all-or-nothing, rate-limited, and capped at 2 MB / 5,000 rows.
- **Invitations** are 256-bit random tokens stored only as a hash, single-use, expire after 7 days, rate-limited. Existing accounts must sign in to accept, so a link can't take over an account. The page doesn't reveal whether an email already has an account.
- **Everything else:**
  - Zod validation on every server action.
  - Safe post-login redirects.
  - CSV exports neutralise spreadsheet formulas.
  - Security headers (CSP, frame-ancestors none, HSTS, nosniff).
  - No enquiry text or keys in logs.
  - Per-company rate limits on AI calls, imports and invitations.
- **Tested against the real database** (`tests/rls.test.ts`, 23 tests). Each one signs in as different companies and roles and tries to cross the line: reading, writing, approving, importing, undoing another company's import, reading invitation tokens, changing protected columns, setting or changing quote numbers, and the platform admin reading tenant data.

## The messy data

Shaz's CSVs are loaded exactly as sent. The same cleaning rules run in the seed script and in the in-app importer (`lib/import/`). I sent Dave and Shaz my questions about the price list, and every Hollis-specific decision now follows their answers. Each one is in `lib/import/hollis-decisions.ts` with who confirmed it, listed in [`docs/import-report.md`](docs/import-report.md), and shown on the item's page.

**Rates**
- The file starts with a byte-order mark; it's stripped.
- `m2 / sqm / m²` and `lin m / m` are normalised.
- `"£1,250"` is parsed; `TBC` means no price.
- PT01 is the only price entered *inc VAT*. It's stored as £70.83 ex VAT (confirmed by Shaz).
- Old and duplicate prices are **archived** and never offered to the AI. After the March increase, Shaz confirmed:
  - SB03, not SB02.
  - BP01, not BP02.
  - EX05 per load, not EX06 per tonne.
  - KB01 at £28/m. KB02 is the same kerb listed twice.
- **CO02 concrete is £1,250 per load of about 6 m³** (Dave). Items can have a load size: the AI gives the volume, code rounds up to whole loads, and a part load is charged as a full load.
- **BP04 kiln-dried sand is included in BP01** (Dave). It's still in use for re-sanding jobs. Items can be marked "already included in" other codes, so code removes BP04 from any quote that also has block paving.
- **Site-visit items:**
  - TM03 resin (no price; all resin goes to Dave).
  - DR03 soakaways (they depend on a perc test).
  - TM02 tarmac overlays (they need a sound base).
  - Any quote using one of these becomes "site visit needed", with no price and the reason shown.
- KB04 dropped kerbs are marked **not offered**: tell the customer to go to the council.
- Extras:
  - "Herringbone +£4" becomes an extra the AI can select, only when the customer asks for it.
  - "Road permit +£60" becomes an extra too, only when the skip goes on the road.
  - Code prices both. If an extra wasn't added, the reviewer gets a reminder, for example "skip permit not added: check whether the skip goes on the road".
- MI01, the £450 minimum as an item, is archived. The app applies the minimum itself (£450 + VAT) as a visible top-up line, so it can't be charged twice.

**The same rules work on any company's file.** Rules the importer applies automatically, each shown as a warning in the preview:
- "Included in X" → never charged with X.
- "Subject to…", "must be…" or "ask Dave" → needs a site visit.
- "??" or "check" → no price until confirmed.
- Duplicates → the new or higher price wins.

**What the file can't say, the importer asks.** It doesn't guess. Some answers only exist in Dave's head, so the preview asks the person importing, and their answers are applied in the same import and recorded on each item:
- **CO02, "think this is per load?? check":** asks whether it's per load and how many m³ a load holds. Unanswered, it has no price.
- **BP04, "included in BP01":** asks whether it's also included in similar items still in use (BP03).

With Dave's two answers (6 m³, BP03), importing Shaz's raw file gives exactly the confirmed setup. A unit test checks this, and a browser test runs it in a new company.

**Customers:** 13 rows became 9 customers.
- Merged when they share an email (Sandhu), a phone number (Doyle), a surname and address (Okafor: "14 Linden Ave" = "14 Linden Avenue"), or a surname and company email domain (Hale).
- Kestrel Row's "send invoices here" and "30 day terms" became structured fields that show on the quote.

## Confirmed with Hollis, and remaining assumptions

Confirmed by Dave and Shaz:
- Quotes are ex VAT, with VAT at 20% shown separately. The £450 minimum is before VAT and shows as a top-up line.
- Car parks, anything commercial, and anything over about 150 m² get "Dave needs to see this", with no price. Resin, soakaways and tarmac overlays get a site visit too. The size limit is a company setting.
- We don't do dropped kerbs: tell the customer to go to the council.
- Herringbone only when the customer asks for it. The skip permit only when the skip goes on the road. If the enquiry doesn't say, it's flagged.

My own assumptions:
- EX01 "excavate & **cart away**" and EX03 "break out & **remove**" already include taking the material away, so no muck away or skip is added for them. Disposal is only added for work that doesn't include it, such as EX04 "break out concrete". The AI states the assumption on the draft. (To confirm with Dave.)
- "Approve" means "OK to send". The app doesn't send emails.
- A price counts as stale after 6 months (a company setting).
- "Today" for a price means today in the UK, so a price "from 1 March" starts at UK midnight.
- Invitations are copyable links rather than emails, because Supabase's free email allowance is a few messages an hour.

## Running it

```bash
cp .env.example .env.local      # Supabase URL/keys, KEY_ENCRYPTION_SECRET (openssl rand -base64 32), SEED_PASSWORD
supabase link --project-ref <ref> && supabase db push   # applies supabase/migrations in order (0001…0024)
npm install
npm run seed                    # companies, logins, platform admin, Hollis price list and customers
npm run dev
```

Then sign in as an owner, open **Settings → AI provider**, and paste an OpenAI or Anthropic key.

**Tests**
- `npm test`: 71 tests. 48 are unit tests: pricing, units, loads, "included in" and site-visit items, customer matching, the importer run on Shaz's real files (including proof that, with Dave's answers, it reaches exactly the confirmed setup), price-list narrowing, UK dates and CSV safety. The other 23 test RLS against the live database and run when `.env.local` is present.
- `npm run e2e` (with `npm run dev` running): 31 browser steps covering the price list, customers, CSV import and undo, importing Shaz's raw file with the importer's questions, onboarding, roles and lockout. It uses your installed Chrome and cleans up after itself.

## What I'd do next

- **An evaluation set:** real past enquiries alongside the quotes Dave actually sent, so prompt changes are measured rather than eyeballed.
- **PDF quotes** and sending from the app, with the approved version locked.
- **Email invitations** through a proper email provider. **Multi-company users** (an accountant in two firms): the schema allows it; the company switcher is still to build.
- **Key encryption** in a KMS or Supabase Vault, with rotation.
- **UK GDPR tools:** export a person's data, or erase it while keeping quote figures.
- **Hosting:** move the database to a London region; it's in Singapore today. Add backups and monitoring.
- **Faster lists:** keyset pagination and full-text search once a company has tens of thousands of records.

## How I used AI tools

_(to be written before submission)_
