import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type SlackPostMessageResponse = {
  ok?: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

function trimEnv(value: string | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

function configuredSecret(): string | null {
  return trimEnv(process.env.SMS_CONTEXT_POST_SECRET);
}

function configuredSlackToken(): string | null {
  return trimEnv(process.env.SMS_SLACK_BOT_TOKEN) || trimEnv(process.env.SLACK_BOT_TOKEN);
}

function configuredSlackChannel(): string | null {
  return trimEnv(process.env.SMS_SLACK_CHANNEL_ID);
}

function safeText(value: unknown, max = 3000): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    contextPostSecretConfigured: Boolean(configuredSecret()),
    slackPostingConfigured: Boolean(configuredSlackToken() && configuredSlackChannel()),
  });
}

export async function POST(request: NextRequest) {
  const secret = configuredSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "SMS context post secret is not configured" }, { status: 503 });
  }

  const suppliedSecret = request.headers.get("x-innate-sms-context-secret") || request.nextUrl.searchParams.get("secret") || "";
  if (suppliedSecret !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = configuredSlackToken();
  const defaultChannel = configuredSlackChannel();
  if (!token || !defaultChannel) {
    return NextResponse.json({ ok: false, error: "Slack posting is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = safeText(body?.text);
  const threadTs = safeText(body?.thread_ts, 80) || safeText(body?.threadTs, 80);
  const channel = safeText(body?.channel_id, 80) || safeText(body?.channelId, 80) || defaultChannel;

  if (!text || !threadTs) {
    return NextResponse.json({ ok: false, error: "Missing text or thread_ts" }, { status: 400 });
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: ["Bearer", token].join(" "),
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as SlackPostMessageResponse;
  if (!response.ok || data.ok !== true) {
    return NextResponse.json({ ok: false, error: data.error || `Slack HTTP ${response.status}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, channel: data.channel || channel, ts: data.ts || null });
}
