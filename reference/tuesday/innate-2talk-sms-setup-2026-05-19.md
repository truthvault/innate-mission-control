# Innate 2talk SMS setup

Date: 2026-05-19
Status: code-side foundation prepared; portal approval/token still manual.

Update 2026-06-25: the Slack shared-inbox bridge artifact is documented in
`reference/tuesday/innate-2talk-slack-sms-bridge-2026-06-25.md`, with the
additional Supabase mapping schema in
`reference/tuesday/supabase-sms-slack-threads-schema-2026-06-25.sql`.

## Purpose

Set up 2talk Business Messaging for Innate administrative/customer-service SMS:

- customer replies
- quote follow-ups
- production updates
- delivery coordination
- service replies

Not for marketing campaigns.

## Known account details

- 2talk portal: https://now.2talk.co.nz
- Account: Innate Furniture / Guido Loeffler
- Account number: 15986315
- Intended main number: 03 327 5012 / `6433275012`
- Extra accidental number to consider removing later: 03 327 7250 / `6433277250`
- Business Messaging request was pending after submission on 2026-05-18 22:17:36.

## Implemented app pieces

- Inbound webhook route: `POST /api/sms/2talk/inbound`
- Health/config probe: `GET /api/sms/2talk/inbound`
- Middleware excludes the inbound webhook from Tuesday login, but the route requires its own shared secret.
- Inbound parser accepts JSON, form-urlencoded, multipart form, and raw form bodies.
- Normalizes sender/recipient numbers to E.164-ish form, e.g. `0273502083` -> `+64273502083`.
- Stores inbound SMS in Supabase table `public.sms_messages`.
- Attempts simple lead matching by comparing normalized sender number to `public.leads.phone`.
- Outbound 2talk utility exists but is env-gated and not exposed in UI. It cannot send unless `TWOTALK_SMS_SEND_ENABLED=1` plus token/gateway env vars are configured.

## Supabase setup

Apply after review:

- `reference/tuesday/supabase-sms-messages-schema-2026-05-19.sql`

This creates `public.sms_messages` with indexes and optional `lead_id` reference to `public.leads(id)`.

## Required environment variables

Inbound webhook:

- `TWOTALK_SMS_WEBHOOK_SECRET`: random shared secret. Put the same value in the 2talk webhook URL/header if supported.
- Existing Supabase vars:
  - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`

Outbound SMS, disabled by default:

- `TWOTALK_SMS_SEND_ENABLED=1` only after Guido explicitly approves live sending.
- `TWOTALK_SMS_GATEWAY_URL`: secret-bearing/API gateway URL from 2talk SMS settings after approval.
- `TWOTALK_SMS_API_TOKEN`: 2talk SMS API token from the portal.
- `TWOTALK_SMS_FROM_NUMBER=6433275012`

Do not paste the API token or secret-bearing gateway URL into chat or reference notes.

## 2talk portal steps after approval

1. Log in to https://now.2talk.co.nz.
2. Go to Cloud PBX.
3. Select the Business Messaging number, expected `03 327 5012` / `6433275012`.
4. Open the SMS settings/navigation item.
5. Click **Get Token** if needed. Store token only in Vercel/env secrets.
6. Set the inbound webhook URL:
   - Production placeholder: `https://<tuesday-domain>/api/sms/2talk/inbound?secret=<TWOTALK_SMS_WEBHOOK_SECRET>`
   - Prefer a header secret if 2talk supports custom headers; otherwise use query secret.
7. Save and send a small test SMS to the Innate number.
8. Check `public.sms_messages` for the inbound row and whether it matched a lead.

## Dummy curl tests

Replace host/secret before testing.

```bash
curl -i -X POST 'https://<host>/api/sms/2talk/inbound?secret=<secret>' \
  -H 'content-type: application/json' \
  --data '{"from":"0273502083","to":"6433275012","message":"Test inbound from 2talk","message_id":"dummy-001"}'
```

```bash
curl -i -X POST 'https://<host>/api/sms/2talk/inbound' \
  -H 'x-innate-sms-webhook-secret: <secret>' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'From=0273502083&To=6433275012&Body=Test+form+payload&message_id=dummy-002'
```

Expected success:

```json
{"ok":true,"id":"<uuid>","leadId":null,"status":"unmatched"}
```

`leadId` will be set when the sender phone matches a Tuesday/Supabase lead phone.

## Current manual blockers

- Hermes could reach the 2talk login page but cannot inspect approval status without portal login.
- Guido needs to confirm Business Messaging approval and either add the webhook in the portal or provide the non-secret endpoint requirements.
- Supabase SQL must be applied before inbound messages can be stored.
- Deploy/env configuration still needs approval before live use.
