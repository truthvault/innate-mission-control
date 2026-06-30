import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { register } from "node:module";

register(new URL("./ts-extension-loader.mjs", import.meta.url), import.meta.url);

const { normalizeInbound2talkSms, parseSmsWebhookPayload } = await import("../lib/sms/twotalk.ts");
const { storeInboundSms } = await import("../lib/sms/supabase-sms.ts");
const {
  buildInboundSmsSlackPayload,
  classifySlackReplyEvent,
  postInboundSmsToSlackThread,
  processSlackReplyEvent,
  processSlackSmsCommand,
  verifySlackRequestSignature,
} = await import("../lib/sms/slack-bridge.ts");
const { triggerSmsDeepContext } = await import("../lib/sms/deep-context-trigger.ts");

const envKeys = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SMS_SLACK_BOT_TOKEN",
  "SLACK_BOT_TOKEN",
  "SMS_SLACK_CHANNEL_ID",
  "SMS_SLACK_SIGNING_SECRET",
  "SMS_SLACK_ALLOWED_USER_IDS",
  "SLACK_SIGNING_SECRET",
  "TWOTALK_SMS_SEND_ENABLED",
  "TWOTALK_SMS_GATEWAY_URL",
  "TWOTALK_SMS_API_TOKEN",
  "TWOTALK_SMS_FROM_NUMBER",
  "SMS_CONTEXT_TRIGGER_URL",
  "SMS_CONTEXT_TRIGGER_SECRET",
];

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function resetTestState() {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseBody(init) {
  assert.equal(typeof init?.body, "string", "fetch body should be JSON text");
  return JSON.parse(init.body);
}

async function testInboundStorageWithoutSlackEnv() {
  resetTestState();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/rest/v1/leads?")) {
      return jsonResponse([
        {
          id: "lead-1",
          customer_name: "Dylan Test Customer",
          contact_name: "Dylan",
          phone: "027 350 2083",
        },
      ]);
    }
    if (String(url).includes("/rest/v1/sms_messages")) {
      const body = parseBody(init);
      assert.equal(body.direction, "inbound");
      assert.equal(body.provider, "2talk");
      assert.equal(body.lead_id, "lead-1");
      assert.equal(body.status, "matched");
      assert.equal(body.from_number_normalized, "+64273502083");
      return jsonResponse([{ ...body, id: "sms-1" }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const request = new Request("https://tuesday.test/api/sms/2talk/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      from: "027 350 2083",
      to: "028 256 10137",
      message: "Checking the table order",
      message_id: "2talk-in-1",
    }),
  });

  const payload = await parseSmsWebhookPayload(request);
  const normalized = normalizeInbound2talkSms(payload);
  const stored = await storeInboundSms(normalized);
  const slack = await postInboundSmsToSlackThread(stored);

  assert.equal(stored.id, "sms-1");
  assert.equal(stored.lead_customer_name, "Dylan Test Customer");
  assert.equal(slack.status, "not_configured");
  assert.equal(calls.some((call) => call.url.includes("slack.com")), false);
}

async function testSlackPostAndMappingAreMocked() {
  resetTestState();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env["SMS_SLACK_BOT_TOKEN"] = ["test", "slack", "value"].join("-");
  process.env.SMS_SLACK_CHANNEL_ID = "C123SMS";

  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/rest/v1/sms_messages?")) {
      assert.equal(init.method, "GET");
      return jsonResponse([
        {
          id: "sms-old-1",
          direction: "inbound",
          status: "matched",
          created_at: "2026-06-24T20:00:00Z",
          message_body: "Earlier question about the dining table delivery window",
        },
      ]);
    }
    if (String(url) === "https://slack.com/api/chat.postMessage") {
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization.startsWith("Bearer "), true);
      assert.equal(init.headers.Authorization.slice("Bearer ".length), process.env.SMS_SLACK_BOT_TOKEN);
      const payload = parseBody(init);
      const blockText = JSON.stringify(payload.blocks);
      assert.equal(payload.channel, "C123SMS");
      assert.match(payload.text, /New SMS from/);
      assert.match(blockText, /Reply in this thread/);
      assert.match(blockText, /sms-1/);
      assert.match(blockText, /Dylan Test Customer/);
      assert.match(blockText, /Likely person/);
      assert.match(blockText, /Supabase context/);
      assert.match(blockText, /Recent SMS context/);
      assert.match(blockText, /Earlier question about the dining table delivery window/);
      return jsonResponse({ ok: true, channel: "C123SMS", ts: "1719300000.000100" });
    }
    if (String(url).includes("/rest/v1/sms_slack_threads?on_conflict=slack_channel_id,slack_thread_ts")) {
      const body = parseBody(init);
      assert.equal(body.inbound_sms_id, "sms-1");
      assert.equal(body.slack_channel_id, "C123SMS");
      assert.equal(body.slack_thread_ts, "1719300000.000100");
      assert.equal(body.customer_number_normalized, "+64273502083");
      assert.equal(body.service_number_normalized, "+642825610137");
      return jsonResponse([{ ...body, id: "map-1" }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await postInboundSmsToSlackThread({
    id: "sms-1",
    lead_id: "lead-1",
    lead_customer_name: "Dylan Test Customer",
    lead_contact_name: "Dylan",
    direction: "inbound",
    provider: "2talk",
    provider_message_id: "2talk-in-1",
    from_number: "027 350 2083",
    from_number_normalized: "+64273502083",
    to_number: "028 256 10137",
    to_number_normalized: "+642825610137",
    message_body: "Checking the table order",
    status: "matched",
  });

  assert.deepEqual(
    { status: result.status, channelId: result.channelId, messageTs: result.messageTs, mappingId: result.mappingId },
    { status: "posted", channelId: "C123SMS", messageTs: "1719300000.000100", mappingId: "map-1" }
  );
  assert.equal(calls.length, 3);
}

function testUnmatchedInboundPayloadIsActionable() {
  resetTestState();
  const payload = buildInboundSmsSlackPayload(
    {
      id: "sms-unmatched-1",
      direction: "inbound",
      provider: "2talk",
      from_number: "029 111 2222",
      from_number_normalized: "+64291112222",
      to_number: "028 256 10137",
      to_number_normalized: "+642825610137",
      message_body: "Hi, can you tell me about a table?",
      status: "unmatched",
      recent_sms_context: [],
    },
    "C123SMS"
  );
  const blockText = JSON.stringify(payload.blocks);
  assert.match(blockText, /Unmatched sender/);
  assert.match(blockText, /create or update the lead record/);
  assert.match(blockText, /No earlier SMS history found/);
}

function testEnrichedMatchedPayloadShowsContext() {
  resetTestState();
  const payload = buildInboundSmsSlackPayload(
    {
      id: "sms-context-1",
      lead_id: "lead-1",
      lead_customer_name: "Acme Joinery",
      lead_contact_name: "Alex",
      lead_status: "quoted",
      lead_priority: "hot",
      lead_source: "website",
      lead_product_category: "dining table",
      lead_last_interaction_summary: "Asked for oak slab lead time",
      lead_next_action: "Send updated freight estimate",
      lead_match_confidence: "high",
      lead_match_source: "leads.phone",
      recent_sms_context: [
        { id: "old-1", direction: "outbound", status: "sent", occurred_at: "2026-06-24T19:00:00Z", summary: "We sent pricing options." },
      ],
      direction: "inbound",
      provider: "2talk",
      from_number: "027 350 2083",
      from_number_normalized: "+64273502083",
      to_number: "028 256 10137",
      to_number_normalized: "+642825610137",
      message_body: "Thanks, what is the delivery ETA?",
      status: "matched",
    },
    "C123SMS"
  );
  const blockText = JSON.stringify(payload.blocks);
  assert.match(blockText, /Alex \/ Acme Joinery/);
  assert.match(blockText, /high confidence via leads.phone/);
  assert.match(blockText, /Status: quoted \/ hot/);
  assert.match(blockText, /Asked for oak slab lead time/);
  assert.match(blockText, /We sent pricing options/);
}

function testSlackSignatureVerification() {
  resetTestState();
  const secret = "unit-signing-secret";
  const timestamp = "1719300000";
  const rawBody = JSON.stringify({ type: "url_verification", challenge: "abc123" });
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;

  assert.deepEqual(
    verifySlackRequestSignature({
      rawBody,
      timestamp,
      signature,
      signingSecret: secret,
      nowMs: Number(timestamp) * 1000,
    }),
    { ok: true }
  );
  assert.equal(
    verifySlackRequestSignature({
      rawBody,
      timestamp,
      signature: "v0=bad",
      signingSecret: secret,
      nowMs: Number(timestamp) * 1000,
    }).ok,
    false
  );
}

function testSlackReplyEventIgnoresUnsafeEvents() {
  resetTestState();
  assert.equal(
    classifySlackReplyEvent({ type: "message", channel: "C123SMS", bot_id: "B1", text: "bot", ts: "1.2", thread_ts: "1.1" }, "C123SMS")
      .shouldProcess,
    false
  );
  assert.equal(
    classifySlackReplyEvent({ type: "message", channel: "C123SMS", user: "U1", text: "top-level", ts: "1.1" }, "C123SMS").shouldProcess,
    false
  );
  assert.equal(
    classifySlackReplyEvent({ type: "message", channel: "COTHER", user: "U1", text: "wrong", ts: "1.2", thread_ts: "1.1" }, "C123SMS")
      .shouldProcess,
    false
  );

  const valid = classifySlackReplyEvent(
    { type: "message", channel: "C123SMS", user: "U1", text: "Please call me", ts: "1.2", thread_ts: "1.1" },
    "C123SMS"
  );
  assert.equal(valid.shouldProcess, true);
}

async function testSlackReplyOutboundStaysDisabledByDefault() {
  resetTestState();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.SMS_SLACK_CHANNEL_ID = "C123SMS";
  process.env.TWOTALK_SMS_GATEWAY_URL = "https://2talk.test/send";
  process.env.TWOTALK_SMS_API_TOKEN = "test-api-token";
  delete process.env.TWOTALK_SMS_SEND_ENABLED;

  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    assert.equal(String(url).includes("2talk.test"), false, "2talk gateway must not be called while disabled");

    if (String(url).includes("/rest/v1/sms_slack_threads?")) {
      return jsonResponse([
        {
          id: "map-1",
          inbound_sms_id: "sms-1",
          lead_id: "lead-1",
          slack_channel_id: "C123SMS",
          slack_message_ts: "1719300000.000100",
          slack_thread_ts: "1719300000.000100",
          customer_number: "027 350 2083",
          customer_number_normalized: "+64273502083",
          service_number: "028 256 10137",
          service_number_normalized: "+642825610137",
          status: "active",
        },
      ]);
    }

    if (String(url).includes("/rest/v1/sms_messages")) {
      const body = parseBody(init);
      assert.equal(body.direction, "outbound");
      assert.equal(body.status, "not_sent_outbound_disabled");
      assert.equal(body.to_number, "+64273502083");
      return jsonResponse([{ ...body, id: "out-1" }]);
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await processSlackReplyEvent({
    type: "event_callback",
    team_id: "T1",
    event_id: "Ev1",
    event: {
      type: "message",
      channel: "C123SMS",
      user: "U1",
      text: "Please call me",
      ts: "1719300001.000200",
      thread_ts: "1719300000.000100",
    },
  });

  assert.deepEqual(result, { ok: true, action: "outbound_disabled", storedId: "out-1" });
  assert.equal(calls.some((call) => call.url.includes("2talk.test")), false);
}

async function testKnownInternalNumberGetsContextBeforeSlackPost() {
  resetTestState();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env["SMS_SLACK_BOT_TOKEN"] = ["test", "slack", "value"].join("-");
  process.env.SMS_SLACK_CHANNEL_ID = "C123SMS";
  const guidoNumber = ["+64", "273", "502", "083"].join("");

  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/rest/v1/sms_messages?")) {
      assert.equal(init.method, "GET");
      return jsonResponse([]);
    }
    if (String(url) === "https://slack.com/api/chat.postMessage") {
      const payload = parseBody(init);
      const blockText = JSON.stringify(payload.blocks);
      assert.match(blockText, /Guido Loeffler/);
      assert.match(blockText, /known Innate internal contact number/);
      assert.match(blockText, /Innate owner \/ primary business contact/);
      return jsonResponse({ ok: true, channel: "C123SMS", ts: "1719300002.000100" });
    }
    if (String(url).includes("/rest/v1/sms_slack_threads?on_conflict=slack_channel_id,slack_thread_ts")) {
      const body = parseBody(init);
      assert.equal(body.customer_number_normalized, guidoNumber);
      return jsonResponse([{ ...body, id: "map-known-1" }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await postInboundSmsToSlackThread({
    id: "sms-known-1",
    direction: "inbound",
    provider: "2talk",
    from_number: "64273502083",
    from_number_normalized: guidoNumber,
    to_number: "028 256 10137",
    to_number_normalized: ["+64", "282", "561", "0137"].join(""),
    message_body: "Hey",
    status: "unmatched",
  });

  assert.equal(result.status, "posted");
}

async function testDeepContextTriggerIsMockedAndNonBlocking() {
  resetTestState();
  process.env.SMS_CONTEXT_TRIGGER_URL = "https://context-trigger.test/trigger";
  process.env.SMS_CONTEXT_TRIGGER_SECRET = "unit-trigger-secret";
  const calls = [];
  const result = await triggerSmsDeepContext({
    smsId: "sms-1",
    slack: { status: "posted", channelId: "C123SMS", messageTs: "1719300000.000100", mappingId: "map-1" },
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const payload = parseBody(init);
      assert.equal(String(url), "https://context-trigger.test/trigger");
      assert.equal(init.headers["x-innate-sms-context-trigger-secret"], "unit-trigger-secret");
      assert.equal(payload.sms_id, "sms-1");
      assert.equal(payload.slack.channel_id, "C123SMS");
      return jsonResponse({ ok: true, status: "queued" }, 202);
    },
  });
  assert.deepEqual(result, { status: "triggered", httpStatus: 202 });
  assert.equal(calls.length, 1);

  assert.deepEqual(
    await triggerSmsDeepContext({
      smsId: "sms-1",
      slack: { status: "post_failed", warning: "no Slack" },
    }),
    { status: "skipped", reason: "slack_post_failed" }
  );
}

async function testSlackSmsCommandDisabledStoresAuditOnly() {
  resetTestState();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.SMS_SLACK_CHANNEL_ID = "C123SMS";
  process.env.TWOTALK_SMS_GATEWAY_URL = "https://2talk.test/send";
  process.env.TWOTALK_SMS_API_TOKEN = "test-api-token";
  delete process.env.TWOTALK_SMS_SEND_ENABLED;

  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    assert.equal(String(url).includes("2talk.test"), false, "2talk gateway must not be called while disabled");
    if (String(url).includes("/rest/v1/sms_messages")) {
      const body = parseBody(init);
      assert.equal(body.direction, "outbound");
      assert.equal(body.status, "not_sent_outbound_disabled");
      assert.equal(body.to_number_normalized, "+64273502083");
      assert.equal(body.message_body, "New outbound command test");
      assert.equal(body.raw_payload.started_from_slack_command, true);
      return jsonResponse([{ ...body, id: "cmd-disabled-1" }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await processSlackSmsCommand({
    channelId: "C123SMS",
    userId: "U-GUIDO",
    command: "/sms",
    text: "027 350 2083 New outbound command test",
  });

  assert.deepEqual(result, { ok: true, action: "outbound_disabled", storedId: "cmd-disabled-1", toNumber: "+64273502083" });
  assert.equal(calls.length, 1);
}

async function testSlackSmsCommandSendsAndCreatesThreadMapping() {
  resetTestState();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.SMS_SLACK_CHANNEL_ID = "C123SMS";
  process.env.SMS_SLACK_BOT_TOKEN = "test-slack-token";
  process.env.SMS_SLACK_ALLOWED_USER_IDS = "U-GUIDO";
  process.env.TWOTALK_SMS_SEND_ENABLED = "1";
  process.env.TWOTALK_SMS_GATEWAY_URL = "https://2talk.test/send";
  process.env.TWOTALK_SMS_API_TOKEN = "test-api-token";
  process.env.TWOTALK_SMS_FROM_NUMBER = "642825610137";

  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://2talk.test/send") {
      const body = parseBody(init);
      assert.equal(init.method, "POST");
      assert.equal(body.from, "642825610137");
      assert.equal(body.to, "64273502083");
      assert.equal(body.text, "Hello from Slack command");
      return new Response("accepted", { status: 202 });
    }
    if (String(url).includes("/rest/v1/sms_messages")) {
      const body = parseBody(init);
      assert.equal(body.direction, "outbound");
      assert.equal(body.status, "sent");
      assert.equal(body.to_number_normalized, "+64273502083");
      return jsonResponse([{ ...body, id: "cmd-out-1" }]);
    }
    if (String(url) === "https://slack.com/api/chat.postMessage") {
      const payload = parseBody(init);
      const blockText = JSON.stringify(payload.blocks);
      assert.equal(payload.channel, "C123SMS");
      assert.match(payload.text, /SMS sent to/);
      assert.match(blockText, /Reply in this thread/);
      assert.match(blockText, /cmd-out-1/);
      return jsonResponse({ ok: true, channel: "C123SMS", ts: "1719301000.000200" });
    }
    if (String(url).includes("/rest/v1/sms_slack_threads?on_conflict=slack_channel_id,slack_thread_ts")) {
      const body = parseBody(init);
      assert.equal(body.last_outbound_sms_id, "cmd-out-1");
      assert.equal(body.slack_thread_ts, "1719301000.000200");
      assert.equal(body.customer_number_normalized, "+64273502083");
      assert.equal(body.service_number_normalized, "+642825610137");
      return jsonResponse([{ ...body, id: "cmd-map-1" }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await processSlackSmsCommand({
    channelId: "C123SMS",
    userId: "U-GUIDO",
    command: "/sms",
    text: "new 0273502083 Hello from Slack command",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "sent",
    storedId: "cmd-out-1",
    threadTs: "1719301000.000200",
    toNumber: "+64273502083",
  });
  assert.equal(calls.length, 4);

  assert.equal(
    (await processSlackSmsCommand({ channelId: "COTHER", userId: "U-GUIDO", command: "/sms", text: "0273502083 no" })).ok,
    false
  );
  assert.equal(
    (await processSlackSmsCommand({ channelId: "C123SMS", userId: "U-NOT", command: "/sms", text: "0273502083 no" })).ok,
    false
  );
}

try {
  await testInboundStorageWithoutSlackEnv();
  await testSlackPostAndMappingAreMocked();
  testUnmatchedInboundPayloadIsActionable();
  testEnrichedMatchedPayloadShowsContext();
  await testKnownInternalNumberGetsContextBeforeSlackPost();
  await testDeepContextTriggerIsMockedAndNonBlocking();
  testSlackSignatureVerification();
  testSlackReplyEventIgnoresUnsafeEvents();
  await testSlackReplyOutboundStaysDisabledByDefault();
  await testSlackSmsCommandDisabledStoresAuditOnly();
  await testSlackSmsCommandSendsAndCreatesThreadMapping();
  console.log("OK: SMS Slack bridge unit checks passed.");
} finally {
  resetTestState();
}
