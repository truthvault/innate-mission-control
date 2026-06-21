# Call intelligence mobile overview, 2026-06-10

## Prototype purpose

Turn useful calls into a simple Tuesday flow Guido can scan on a phone:

1. Call capture
2. Extracted nuggets
3. This week tasks
4. Waiting items
5. Research queue
6. Explore opportunities

The Mark Hollis MPI call is the first seeded example.

## Mobile view

Route: `/call-intelligence`

Sections:

- Inbox: most recent source capture, transcript path, source date and short summary.
- This week actions: small practical next moves.
- Waiting: things dependent on someone else.
- Research queue: questions to resolve before committing.
- Explore: bigger opportunities that should not clutter today's task list.
- Recent nuggets: contacts, knowledge, opportunities, waiting items and updates.

The first version is read-only. This is deliberate. It proves the spine and scan layout before adding editing.

## Supabase schema

Migration file:

- `reference/tuesday/supabase-call-intelligence-schema-2026-06-10.sql`

Tables:

### `source_captures`

One row per call, meeting, voice memo, email, document or internal note.

Key fields:

- `source_key`: stable unique key for upserts.
- `source_type`: `call`, `meeting`, `voice_memo`, `email`, `document`, `internal_note`, `other`.
- `source_date`, `title`, `summary`.
- `transcript_path`, `audio_path`, `source_url`.
- `metadata`: extra paths or processing details.

Store transcript/audio paths by default, not huge raw transcript blobs.

### `extracted_nuggets`

Typed extracted items linked to `source_capture_id`.

Types:

- `contact`
- `action`
- `research`
- `knowledge`
- `opportunity`
- `waiting`
- `update`

Each row has `title`, optional `detail`, optional `person_or_org`, `priority`, `status` and `metadata`.

### `action_items`

Light Tuesday action queue generated from source captures. This stays separate from production work tasks until deliberately integrated.

Buckets:

- `today`
- `this_week`
- `waiting`
- `research`
- `explore`
- `later`

Action types:

- `task`
- `waiting`
- `research`
- `follow_up`
- `decision`
- `other`

## Mark Hollis MPI seed

Source capture:

- Mark Hollis MPI call, 10 Jun 2026.
- Transcript path: `/Users/mack-mini/.hermes/tmp/call-recordings/mark-hollis-transcript/mark-hollis-mpi-call-2026-06-10.txt`
- Audio path: `/Users/mack-mini/.hermes/tmp/call-recordings/mark-hollis-mpi-call-2026-06-10.m4a`

Seeded buckets:

- Contacts: Mark Hollis, Brendan Horrell, Stephen Rolls, Justin from Logs to Lumber, Chris Ensor, Gerald/Gerry Dysart, Mosaic Aotearoa, IFS Growth.
- Waiting: Mark to send Brendan and Stephen contact details.
- This week: contact Brendan, contact Stephen, check Mosaic Forest Register, follow up Justin.
- Research: tawa viability, West Coast beech supply map, native timber provenance/legal checklist.
- Knowledge: beech movement concerns may be outdated, tawa borer/treatment risk, rimu remains customer search gateway, tōtara grading/recovery needs a practical Innate-grade definition.
- Explore: native hardwood supply chain rebuild, three-species native timber strategy.

## Next safe extensions

1. Add small edit controls for action status and bucket only.
2. Add a source detail page for one call.
3. Link selected contact nuggets into the relationship spine after schema and UX review.
4. Link selected research/opportunity nuggets into `exploration_items` only after Guido confirms the boundary.
5. Add a transcript processing script that emits the seed payload format, with human review before writes.
