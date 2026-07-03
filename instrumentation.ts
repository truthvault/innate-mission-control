import type { Instrumentation } from "next";

/**
 * Server error alerting without a new vendor: unhandled request errors are
 * posted to the existing ops Slack channel (same bot as the SMS bridge).
 * Deduped in-memory per error digest for 10 minutes so a hot loop cannot
 * flood the channel. If Slack is unconfigured or down we only console.error —
 * alerting must never take the app down.
 */

const recentDigests = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest = (error as { digest?: string })?.digest || message.slice(0, 120);

  const now = Date.now();
  const last = recentDigests.get(digest);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recentDigests.set(digest, now);
  if (recentDigests.size > 200) {
    for (const [key, ts] of recentDigests) if (now - ts > DEDUPE_WINDOW_MS) recentDigests.delete(key);
  }

  console.error(`[tuesday-error] ${request.method} ${request.path} (${context.routerKind}/${context.routeType}): ${message}`);

  const token = process.env.SMS_SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
  const channel = process.env.TUESDAY_ALERTS_SLACK_CHANNEL_ID || process.env.SMS_SLACK_CHANNEL_ID;
  if (!token || !channel) return;

  const env = process.env.VERCEL_ENV || "local";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "unknown";
  const text =
    `:rotating_light: Tuesday ${env} error on \`${request.method} ${request.path}\`\n` +
    `> ${message.slice(0, 400)}\n` +
    `commit \`${commit}\` · ${context.routerKind} ${context.routeType} · digest \`${digest.slice(0, 60)}\``;

  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (postError) {
    console.error(`[tuesday-error] Slack alert failed: ${postError instanceof Error ? postError.message : String(postError)}`);
  }
};
