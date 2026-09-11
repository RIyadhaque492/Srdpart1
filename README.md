# SRD loan operations

Entries 01 and 02 of the SRD system: the member register, and loan proposals. Members can be added
one at a time through a form, or many at once by uploading the existing Excel
workbook. Runs on Vercel with a Neon Postgres database.

Feasibility (Entry 03), loan management (Entry 04) and collections come later. The tables for them already exist
in the schema, but nothing in the interface touches them yet.

---

## Setup, in order

### 1. Database

Create a project at [neon.tech](https://neon.tech), pick the region closest to
your users, then open the **SQL Editor** and run these three files in order:

| File | What it does |
|---|---|
| `db/1-schema.sql` | Creates every table and view |
| `db/2-seed_lookups.sql` | Loads areas, zones, categories, business types, employees, holidays and the rate schedule, extracted from the `0.Lookup` sheet. Also replaces the installment calculation with a lookup against the real rate table |
| `db/3-fix_ids.sql` | Only needed if data was loaded from generated SQL that wrote IDs as `100001.0`. Harmless to run otherwise |

Then copy the **pooled** connection string from Neon's Connect dialog — the
hostname must contain `-pooler`.

### 2. Deploy

Push this folder to a GitHub repository, import it at
[vercel.com/new](https://vercel.com/new), and before deploying add an environment
variable `DATABASE_URL` set to that connection string, ticked for Production,
Preview and Development.

### 3. Protect it

The app has **no authentication**. Before any real member data goes in, turn on
Settings → Deployment Protection → Password Protection. That is a stopgap;
proper login is the next thing to build.

### 4. Local development

```bash
npm install
cp .env.example .env      # paste the connection string
npm run dev
```

---

## How it works

### Adding a member

`/members/new`. The Profile ID is assigned automatically — one above the highest
on file — so nobody types one. Name and contact are required, everything else is
optional and can be filled in later.

The dropdowns narrow as you go: choosing an area limits zones to that area rather
than listing all 845, and choosing a category limits business types. If the
contact number or NID already belongs to someone, the form names them and asks
whether to save anyway, instead of quietly creating a second record.

### Uploading a workbook

`/import`. Only the `1.DB_Member` sheet is imported at this stage; other sheets
are listed and skipped.

The file is read **in the browser**, not on the server. Rows are validated
locally, then sent in batches sized to about 60 KB each. This is what makes a
large workbook or a slow connection work — the server never receives a big upload
and never runs a long request. A batch that fails retries twice on its own.

Header rows are found automatically by scanning the first six rows and scoring
them against known column names, so sheets with titles or totals above the header
still import.

Every write is an upsert on the Profile ID, and a blank incoming cell leaves the
stored value alone rather than wiping it. Re-uploading a corrected file is always
safe.

### Cleaning that happens on the way in

- `#REF!`, `#N/A`, `--` and `NA` become empty
- `2,04,000` becomes `204000`; `6 Months` becomes `6`
- `0204-জিইসি-সেন্ট্রাল প্লাজা` becomes zone code `0204`
- Zone codes are padded back to four digits — Excel stores `0102` as `102`
- `মায়ের দোয়া / Mayer Doya` is split into Bangla and English columns

### Derived fields are never stored

The SRD marks several fields Auto or PortFolio — No of Portfolios, Last
Portfolio, Pf Status. Storing those as columns means they drift out of date. They
live in views (`v_member_portfolio`, `v_proposals`, `v_fprc`, `v_lmc`) and are
computed on read.

`db/2-seed_lookups.sql` replaces the views so installments come from
`rate_schedule` rather than a formula. The schedule is not linear — 2 months
carries 2.80% per month, 6 months carries 3.00% — and it covers about 79% of
historical proposals. Anything outside it falls back to a 3% monthly estimate, so
those figures should be checked by hand.

---

## Adding a column later

1. `db/1-schema.sql` — add it, and run the `alter table` in Neon
2. `lib/columns.ts` — add a `Field` listing every spreadsheet header ever used for it
3. The relevant view, if it should appear on a form

`lib/columns.ts` is the contract between spreadsheets and the database. Add an
alias there rather than renaming columns in Excel — that is what keeps older
workbooks importable.

---

## Known gaps

- **No authentication.** Anyone with the URL can read and write everything.
- **Two business type codes** used by members, `1471097` and `1601090`, are
  missing from the lookup sheet and import as empty.
- **The rate schedule covers 2–6 months only**, but 1-month and 12-month loans
  exist in the data.
- **The scores marked "Need To Create"** in the SRD — CR Score, Regularity Score,
  Performance Score — are not implemented. The collections table holds the
  repayment history they would need; write them as SQL functions so they
  recompute as payments arrive.
