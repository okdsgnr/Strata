## Meridian NLP/AI Chatbot for Token Analytics — Detailed Project Plan

Audience: engineering. Purpose: capture full scope and implementation details for an "ask anything" chatbot that answers questions about token analytics using data in Supabase/Postgres with strong safety and accuracy guarantees.


### Goals
- Natural language in, accurate and source-grounded answers out.
- Zero hallucinations about facts; every numeric statement comes from SQL query results.
- Answers cite snapshot time, token(s), and include the executed SQL and row counts for transparency and caching.
- Works over existing Supabase tables: `token_snapshots`, `token_top_holders`, `wallet_labels`, `whale_durations`, `token_profiles`, `token_searches` (and our latest schema variants).
- Guardrailed NL→SQL with an allowlist of read-only views; SELECT-only; tight LIMITS.
- Session memory for follow-ups: keep token(s) and temporal context.
- Short-term caching by normalized question + parameters.
- Observability for model and SQL performance.


### Current repo and data notes (constraints and pitfalls to address)
- We observed a historical mismatch where `token_snapshots.total_holders` sometimes stored “eligible holders” instead of total holders. Fix forward: future snapshots must store true total holders (all holders), and views must disambiguate fields.
- We compute tier counts (whale/shark/dolphin/fish/shrimp) and supply concentration (top N) per snapshot. Live vs cached must remain structurally consistent. We created a shared formatter to normalize output.
- Liquidity pool (LP) detection: we now rely on DexScreener only (disabled aggressive heuristics). Labels may appear in `wallet_labels` or be applied to notable holders (LP mapping used in cached/live endpoints).
- Known database connectivity issue locally (ECONNREFUSED 5432) must be resolved before bot execution (Supabase or Postgres direct). The chatbot depends on DB connectivity to run SQL.


### High-level architecture
```
User Query → Query Understanding → NL→SQL (guardrailed) → SQL Execution → Answer Composer
           ↘ Session Context (token, timeframe) ↗         ↘ Observability, Cache
```

Components:
- Semantic layer
  - A metrics dictionary (`backend/ai/metrics.json`) defining metrics, arguments, units, and canonical SQL exemplars.
  - Read-only SQL views exposing clean, pre-joined, stable shapes for the chatbot to query.
- NL→SQL generation with guardrails
  - Prompt includes dictionary + view definitions + strict rules (SELECT-only, allowlist, LIMIT ≤ 200, qualify by token).
  - Model returns JSON `{ sql, params, notes }` or `{ error: "OUT_OF_SCOPE" }`.
- SQL safety filter
  - Enforce SELECT-only, allowlist of views (and possibly a minimal set of base tables), bound parameters, required LIMIT.
- Execution
  - Execute parameterized queries via Supabase RPC or direct query layer (read-only role). Return rows + row_count.
- Answer composer
  - Compose concise, trustworthy text with numeric citations and short tables. Always include snapshot time if present.
  - Always include executed SQL, parameters, and row count in API response.
- Session memory
  - Store last N questions + resolved token(s) + inferred timeframe.
- Cache
  - Cache by normalized question + parameters for 2–10 minutes (configurable by token profile/size).
- Observability
  - Log: question, generated SQL, params, execution time, row count, numeric presence flag, model latency.


### Supabase/Postgres: read-only analytical views (must-have)
Create safe views the chatbot is allowed to query. These abstract schema drift and correct historical inconsistencies.

1) Latest snapshot per token (clean, unambiguous fields)
```
create or replace view v_latest_snapshot as
select distinct on (token_address)
  token_address,
  captured_at as snapshot_at,
  price_usd,
  market_cap_usd,            -- optional; compute as price_usd * total_supply if not stored
  liquidity_usd,             -- optional; may be null
  total_holders,             -- must represent ALL holders; ensure future snapshots store this correctly
  -- expose eligible holders separately to avoid confusion:
  (coalesce(whale_count,0) + coalesce(shark_count,0) + coalesce(dolphin_count,0) + coalesce(fish_count,0) + coalesce(shrimp_count,0))::bigint as eligible_holders,
  whale_count as whales,
  shark_count as sharks,
  dolphin_count as dolphins,
  fish_count as fish,
  shrimp_count as shrimp,
  -- precomputed supply concentration percentages if stored; otherwise compute from balances and total supply
  (nullif(top1_balance,0)  / nullif(top100_balance,0)) as top1_pct_supply,   -- adjust if we store uiSupply separately
  (nullif(top10_balance,0) / nullif(top100_balance,0)) as top10_pct_supply,
  (nullif(top50_balance,0) / nullif(top100_balance,0)) as top50_pct_supply,
  1.0 as top100_pct_supply  -- if denominator is total supply, set accordingly; else recompute properly in future migration
from token_snapshots
order by token_address, captured_at desc;
```

Notes:
- If `topN_balance` fields are raw balances, consider adding `total_supply_ui` to snapshots to compute precise `topN_pct_supply` in-view.
- If historic snapshots are inconsistent, the view can coalesce or compute robustly. For v1, keep as-is and tighten later.

2) Labeled notable holders for the latest snapshot
```
create or replace view v_notable_holders as
with latest as (
  select token_address, max(captured_at) as max_ts
  from token_snapshots
  group by token_address
)
select th.token_address,
       th.rank,
       th.address,
       th.balance,
       th.usd_value,
       coalesce(wl.label, 'Unlabeled') as label
from token_top_holders th
join latest s
  on s.token_address = th.token_address
join token_snapshots ts
  on ts.token_address = th.token_address and ts.captured_at = s.max_ts and ts.id = th.snapshot_id
left join wallet_labels wl
  on wl.address = th.address
where th.rank <= 100
order by th.token_address, th.rank asc;
```

3) Whale retention rollup (one row per token)
```
create or replace view whale_retention_latest as
select token_address,
       avg(case when consecutive_days >= 7  then 1 else 0 end)::float / nullif(count(*),0) as pct_7d,
       avg(case when consecutive_days >= 30 then 1 else 0 end)::float / nullif(count(*),0) as pct_30d,
       avg(case when consecutive_days >= 90 then 1 else 0 end)::float / nullif(count(*),0) as pct_90d
from whale_durations
group by token_address;
```

Optional future: `token_overlap_summary(a,b)` if overlap is ported to SQL; otherwise mark OUT_OF_SCOPE for v1.


### Semantic layer: metrics dictionary (hard context for NL→SQL)
File: `backend/ai/metrics.json`
```
{
  "entities": {
    "token": {"pk": "token_address"},
    "snapshot": {"pk": "id", "table": "token_snapshots"},
    "holder": {"table": "token_top_holders"},
    "label": {"table": "wallet_labels"},
    "whale_duration": {"table": "whale_durations"}
  },
  "metrics": {
    "current_price": {
      "sql": "SELECT price_usd, snapshot_at FROM v_latest_snapshot WHERE token_address = $1 LIMIT 1",
      "args": ["token_address"],
      "unit": "USD"
    },
    "eligible_holders": {
      "sql": "SELECT eligible_holders, snapshot_at FROM v_latest_snapshot WHERE token_address = $1 LIMIT 1",
      "args": ["token_address"],
      "unit": "count"
    },
    "tier_counts": {
      "sql": "SELECT whales, sharks, dolphins, fish, shrimp, snapshot_at FROM v_latest_snapshot WHERE token_address = $1 LIMIT 1",
      "args": ["token_address"]
    },
    "topN_supply": {
      "sql": "SELECT top1_pct_supply, top10_pct_supply, top50_pct_supply, top100_pct_supply, snapshot_at FROM v_latest_snapshot WHERE token_address = $1 LIMIT 1",
      "args": ["token_address"],
      "unit": "percent"
    },
    "whale_retention": {
      "sql": "SELECT pct_7d, pct_30d, pct_90d FROM whale_retention_latest WHERE token_address = $1",
      "args": ["token_address"],
      "unit": "percent"
    },
    "notable_holders": {
      "sql": "SELECT rank, address, label, balance, usd_value FROM v_notable_holders WHERE token_address = $1 ORDER BY rank ASC LIMIT 20",
      "args": ["token_address"]
    }
  },
  "vocab": {
    "tiers": ["whale","shark","dolphin","fish","shrimp"],
    "synonyms": {
      "owners": "holders",
      "supply in whales": "topN_supply",
      "concentration": "topN_supply",
      "retention": "whale_retention"
    }
  }
}
```


### NL→SQL with guardrails
Prompt file: `backend/ai/prompts/sql.txt`
```
You translate user questions about Solana token analytics into a single safe SQL query.

Rules:
- SELECT only. No INSERT/UPDATE/DELETE/DDL.
- Only query these objects: v_latest_snapshot, v_notable_holders, whale_retention_latest, token_snapshots (for last-two comparisons if needed).
- Always require token_address for single-token questions. If given a ticker, ask for the mint unless a resolver exists.
- Always include LIMIT 200 or less.
- Do not compute prices off chain. Use price_usd from v_latest_snapshot.
- If request spans time deltas, compare the latest two snapshots for that token from token_snapshots; otherwise use v_latest_snapshot.

Return JSON:
{"sql": "...", "params": ["...","..."], "notes": "assumptions"}

If not answerable with the allowlisted objects, return:
{"error":"OUT_OF_SCOPE"}
```

Allowlist and safety checks (server):
- Enforce query begins with `SELECT`.
- Reject any mutation or DDL keywords.
- Enforce allowlist of relations: `v_latest_snapshot`, `v_notable_holders`, `whale_retention_latest`, and optionally `token_snapshots`.
- Require bound parameters for token addresses; never interpolate.
- Require `LIMIT <= 200`.


### Backend API
Routes: `POST /ai/ask` and `POST /ai/ask/:mint`

Responsibilities:
- Accept `{ question, token_address, token_b }` (token_b optional for overlap later).
- Build prompt with: views (text schema excerpts), metrics.json, question, token(s).
- Call LLM to generate SQL plan.
- Validate plan with safety checks.
- Execute SQL via Supabase (read-only) with bound params.
- Compose answer: short headline, optional compact table (3–10 rows), citation including `snapshot_at` when present.
- Return payload: `{ ok, question, sql, params, notes, rows, row_count, answer }`.

Example pseudo-code:
```
POST /ai/ask
  parse body
  load metrics.json + view schemas
  call LLM with guardrailed prompt
  parse JSON
  if OUT_OF_SCOPE or unsafe → 400
  exec param SQL (read-only)
  compose answer (markdown-safe), include snapshot_at if available
  return response with SQL and row_count for transparency & caching
```

Answer composer rules:
- Be concise but exact; every number must exist in rows.
- Include timestamp: “Based on snapshot at <timestamp>.”
- For small lists (≤10), render a tight table; else summarize and include row_count.
- Always include executed SQL and params (collapsible in the UI).
- Never predict prices; state analytics-only scope.


### Session memory and caching
- Session memory (in-memory or Redis): keep last N user messages per session with resolved token(s) and inferred timeframe. Enables follow-ups like “what about last week?”
- Cache key: normalized question + sorted params + view version. TTL: 2–10 minutes (config by token liquidity/volatility).
- Cache store: in-memory (L1) + Redis (L2) optional.


### Observability
- Log per request: timestamp, user/session id (if available), question, generated SQL, params, execution time, row_count, model latency, cache hit/miss, numeric_presence flag.
- Add lightweight analytics for most common questions per token.
- Alert on unsafe SQL attempts or > N timeouts.


### Frontend UI
- Minimal “Ask Strata” drawer on Audit and Compare pages:
  - Collapsed bar at bottom: “Ask analytics about this token…”
  - Opens a drawer with:
    - Text input
    - Token selector (prefilled from current page state; supports manual override)
    - Results card: headline sentence; tiny table; snapshot time; “Show SQL” toggle; copy CSV/image buttons
    - Note: respect auth/subscription if we later gate advanced queries


### Test plan
- Unit tests: 20 canned questions; verify:
  - SQL touches only allowlisted views/tables.
  - SELECT-only and LIMIT ≤ 200.
  - Token qualification present when required.
  - For time-delta requests, ensure last-two snapshots logic used.
- Live smoke:
  - “What percent of supply is in whale hands for <mint>?”
  - “How many eligible holders does it have?”
  - “Show top 5 labeled holders.”
  - “7-day whale retention.”
- Edge cases:
  - Missing mint → ask for mint / return OUT_OF_SCOPE.
  - Token with no `whale_durations` yet → return zeros/none gracefully.
  - Overlap question when function not exposed → OUT_OF_SCOPE with one-line explanation.


### Security & safety
- Read-only database role for the executor; no mutation privileges.
- Strict server-side validation of SQL (never trust model blindly).
- Parameterized queries only; reject string interpolation.
- Rate limiting and abuse protection on `/ai/ask`.
- PII-free responses (we don’t store PII; wallet addresses are public data but still omit unnecessary exposure).


### Rollout plan
1) Prereqs
   - Fix DB connectivity (ECONNREFUSED 5432) and confirm Supabase creds in `backend/.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`).
   - Ensure new snapshots store true `total_holders` (ALL holders). Keep `eligible_holders` derived as sum of tier counts.
2) DB changes
   - Create views: `v_latest_snapshot`, `v_notable_holders`, `whale_retention_latest`.
3) Repo changes
   - Add `backend/ai/metrics.json` and `backend/ai/prompts/sql.txt`.
   - Add `backend/routes/ai.js` (POST /ai/ask and /ai/ask/:mint) with guardrails.
   - Add answer composer, cache, session memory (lightweight first pass).
4) Frontend
   - Add minimal drawer UI to audit/compare pages.
5) QA
   - Run canned questions; validate SQL; compare numbers with dashboard.
6) Launch
   - Feature flag + rate limits. Monitor logs and iterate.


### Environment configuration
- Backend `.env`:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE` (read role sufficient for views; keep secure)
  - `OPENAI_API_KEY` (or preferred LLM provider key)
  - `AI_MODEL` (default: `gpt-4o-mini`; alternatives welcome)
- Frontend `.env`:
  - Ensure `NEXT_PUBLIC_BACKEND_URL` is set for API calls if needed.


### Implementation blueprint (server)
Files:
- `backend/ai/metrics.json` (dictionary)
- `backend/ai/prompts/sql.txt` (prompt)
- `backend/routes/ai.js` (routes)
- Optional: `backend/lib/ai/sqlGuard.js`, `backend/lib/ai/answerComposer.js`, `backend/lib/ai/sessionCache.js`

Pseudo for `/ai/ask`:
```
router.post('/ai/ask', async (req, res) => {
  const { question, token_address, token_b } = req.body || {};
  const views = loadViewSchemasText(); // static text or pulled from repo files
  const metrics = require('../ai/metrics.json');

  const prompt = buildSqlPrompt({ question, token_address, token_b, views, metrics });
  const plan = await callLLM(prompt); // returns { sql, params, notes } or OUT_OF_SCOPE
  if (!plan || plan.error) return res.status(400).json(plan || { error: 'Bad plan' });

  if (!isSafe(plan.sql)) return res.status(400).json({ error: 'Unsafe SQL rejected', sql: plan.sql });

  const { rows, rowCount, error } = await execReadOnly(plan.sql, plan.params);
  if (error) return res.status(400).json({ error: error.message, sql: plan.sql, params: plan.params });

  const answer = composeAnswer(question, rows);
  return res.json({ ok: true, question, sql: plan.sql, params: plan.params || [], notes: plan.notes || '', rows, row_count: rowCount, answer });
});
```


### Implementation blueprint (frontend)
- Component: `frontend/components/AIChatbotDrawer.js`
  - Props: `defaultTokenAddress`
  - State: messages, input, busy
  - Calls `POST /ai/ask` with `{ question, token_address }`
  - Renders answer with small table + “Show SQL” collapsible
  - Copy to CSV / Copy as image buttons
- Integration: add to audit/compare pages with a bottom bar trigger


### Future enhancements
- Ticker→mint resolver (`token_aliases(symbol, token_address)`) so users can type BONK.
- pgvector semantic search over `wallet_labels` and notes for queries like “find MEXC wallets holding X.”
- Saved questions per user with rerun one-tap.
- Add overlap SQL function to allow bot to answer overlap questions; until then, respond OUT_OF_SCOPE.
- Model routing: trivial queries → deterministic SQL templates; complex → LLM.
- Cost/latency optimizations: cache, small models (where viable), batch precomputation.


### Known blockers to start implementation
- Local DB connectivity shows ECONNREFUSED:5432. Confirm we are hitting Supabase (not localhost) in backend and that `.env` is loaded. Without DB access, bot cannot run SQL.
- Ensure snapshots store `total_holders` (ALL holders). Views will rely on this; otherwise we must compute from on-chain holder counts.


### Acceptance criteria (v1)
- Ask: “What percent of supply is in whale hands for <mint>?” → returns a number from SQL with snapshot timestamp and SQL shown.
- Ask: “How many eligible holders?” → returns counts from `v_latest_snapshot`.
- Ask: “Show top 5 labeled holders” → returns small table from `v_notable_holders`.
- Ask: “7-day whale retention” → returns percentages from `whale_retention_latest`.
- All returned SQL touches only allowlisted views/tables and has a LIMIT.
- Errors and OUT_OF_SCOPE handled cleanly with a one-line explanation.


