# Innate 2talk SMS Slack bridge operator checklist

Date: 2026-06-25
Status: code artifact prepared; do not deploy, configure webhooks, or enable outbound SMS until Guido approves each gate.

## Desired flow

1. Customer texts Innate at `028 256 10137`.
2. 2talk posts the inbound SMS to Tuesday at `/api/sms/2talk/inbound`.
3. Tuesday stores the SMS in `public.sms_messages`.
4. If Slack env is configured, Tuesday posts the SMS into the shared Slack SMS inbox.
5. Guido or an approved teammate replies in the Slack thread.
6. Tuesday verifies Slack's request signature, maps the Slack thread back to the customer number, and sends through 2talk only when `TWOTALK_SMS_SEND_ENABLED=1`.

## Slack setup

Recommended first channel:

- Create private channel `#innate-sms`.
- Add only Guido and the Slack app for the first test.
- Invite Nick only after Guido approves shared-inbox rollout.

Slack app settings:

- Bot token scopes:
  - `chat:write`
  - `groups:history` for a private `#innate-sms` channel
  - `channels:history` only if the channel is public instead
- Event Subscriptions request URL:
  - `https://<tuesday-domain>/api/sms/slack/events`
- Bot events:
  - `message.groups` for private channel replies
  - `message.channels` only if using a public channel
- Install the app to the workspace, then invite the bot into `#innate-sms`.

## Supabase setup

Apply only after review:

- Existing message log: `reference/tuesday/supabase-sms-messages-schema-2026-05-19.sql`
- Slack thread mapping: `reference/tuesday/supabase-sms-slack-threads-schema-2026-06-25.sql`

## Vercel environment variables

Set names only; do not paste real secret values into chat or repo files.

Inbound 2talk:

- `TWOTALK_SMS_WEBHOOK_SECRET`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`

Slack inbox:

- `SMS_SLACK_BOT_TOKEN` or `SLACK_BOT_TOKEN`
- `SMS_SLACK_CHANNEL_ID`
- `SMS_SLACK_SIGNING_SECRET` or `SLACK_SIGNING_SECRET`

Outbound 2talk, leave disabled until the final approval gate:

- `TWOTALK_SMS_SEND_ENABLED=0` or unset
- `TWOTALK_SMS_GATEWAY_URL`
- `TWOTALK_SMS_API_TOKEN`
- `TWOTALK_SMS_FROM_NUMBER=642825610137`

## 2talk webhook

Paste only after deploy and secret setup:

```text
https://<tuesday-domain>/api/sms/2talk/inbound?secret=<TWOTALK_SMS_WEBHOOK_SECRET>
```

Use the Business Messaging settings for `028 256 10137`. Prefer a header secret if 2talk supports custom headers; otherwise use the query secret above.

## Dylan test plan

1. With outbound still disabled, send a dummy HTTPS request to the deployed inbound endpoint using a non-customer test number. Confirm the SMS stores in Supabase and appears in `#innate-sms`.
2. Reply in the Slack thread while `TWOTALK_SMS_SEND_ENABLED` is unset. Confirm no SMS is sent and the outbound audit row is marked `not_sent_outbound_disabled`.
3. After Guido approves the 2talk webhook save, Dylan sends a live inbound SMS to `028 256 10137`. Confirm Slack receives it and the mapping row exists.
4. After Guido approves outbound enablement, set `TWOTALK_SMS_SEND_ENABLED=1`.
5. Guido sends one short Slack thread reply to Dylan. Confirm Dylan receives the SMS from `028 256 10137`, then keep monitoring Slack and Supabase for duplicates or failures.

## Approval gates

- Slack app install and first private channel creation.
- Inviting Nick or any wider team member to `#innate-sms`.
- Supabase schema application.
- Vercel env var changes and deployment.
- Saving the 2talk Business Messaging webhook URL.
- Setting `TWOTALK_SMS_SEND_ENABLED=1`.
- First live test send to Dylan.
