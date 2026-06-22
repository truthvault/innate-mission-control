# Lead-to-Quote Loop v0.1 Prototype

Created: 2026-06-20

## Purpose

Daily read-only control strip for Innate's Lead-to-Quote + Quote Learning operating loop. It gives Guido a compact view of hot leads, quote prep candidates, quote follow-ups, missing quote/order facts, and early learning patterns without writing to Supabase, Xero, Gmail, Monday, Shopify, or Drive.

## Command

```bash
npm run lead-to-quote:strip -- --limit 5
```

Useful options:

- `--limit N`: rows per section.
- `--json`: JSON output instead of markdown.
- `--owner-brief`: show customer/lead names for internal Guido-only review.
- `--quote-packet LEAD_ID`: append a local draft quote-prep packet shape for one lead.
- `--verify-counts`: read Supabase row counts before and after generation.
- `--fixture`: run against local fake data when Supabase env is unavailable.

## Safety Boundary

- Read-only by design. Supabase access uses REST `GET` requests only.
- Default output redacts names, emails, phone numbers, addresses, raw snippets, long notes, and raw Monday item IDs.
- Quote-prep packet is a local draft shape only. It does not create or send Xero quotes, emails, or records.
- If quote spine tables are empty, the report states `quote-spine-empty` and falls back to lead-based sections.

## Verification

```bash
npm run test:lead-to-quote
```

The test statically checks for mutation-method patterns and runs fixture output to confirm the default report and JSON quote packet remain redacted.
