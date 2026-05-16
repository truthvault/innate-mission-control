type EnquiryEmailInput = {
  logId?: string;
  name: string;
  email?: string;
  phone?: string;
  preferredContact?: string;
  message?: string;
  productTitle: string;
  selectedOptions: string;
  deliveryAddress: string;
  estimateText: string;
  pageUrl?: string;
  source?: string;
};

type RenderedEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailSendStatus = {
  attempted: boolean;
  sent: boolean;
  skippedReason?: string;
  mode: string;
  to?: string;
  subject?: string;
  providerMessageId?: string;
};

type EnquiryEmailResult = {
  mode: string;
  customer: EmailSendStatus;
  internal: EmailSendStatus;
  previews: {
    customerSubject: string;
    internalSubject: string;
  };
};

const DEFAULT_FROM = "Innate Furniture <website@innatefurniture.co.nz>";
const DEFAULT_INTERNAL_TO = "sales@innatefurniture.co.nz";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraph(value?: string): string {
  return value ? `<p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>` : "";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

function renderShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-NZ">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f7f5f0;color:#283229;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">
    <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #e5dfd3;border-radius:12px;padding:26px;">
        ${body}
      </div>
      <p style="font-size:12px;color:#6f746d;margin:16px 4px 0;">Innate Furniture · Christchurch, New Zealand</p>
    </div>
  </body>
</html>`;
}

export function renderCustomerEnquiryEmail(input: EnquiryEmailInput): RenderedEmail | undefined {
  if (!input.email) return undefined;

  const subject = `We’ve got your ${input.productTitle} enquiry`;
  const introName = firstName(input.name);
  const text = [
    `Hi ${introName},`,
    "",
    "Thanks — we’ve got your table enquiry. No order or payment has been placed.",
    "",
    `Table: ${input.productTitle}`,
    `Options: ${input.selectedOptions}`,
    `Delivery: ${input.deliveryAddress}`,
    `Freight: ${input.estimateText}`,
    "",
    "We’ll confirm the best freight option, timing, and any details before anything goes ahead.",
    "",
    "Thanks,",
    "Innate Furniture",
  ].join("\n");

  const html = renderShell(
    subject,
    `
      <h1 style="font-size:24px;margin:0 0 14px;">Thanks — we’ve got your table enquiry.</h1>
      <p>Hi ${escapeHtml(introName)},</p>
      <p>Thanks for sending this through. No order or payment has been placed.</p>
      <div style="border:1px solid #e5dfd3;border-radius:10px;padding:16px;margin:20px 0;background:#fbfaf7;">
        <p style="margin:0 0 8px;"><strong>Table:</strong> ${escapeHtml(input.productTitle)}</p>
        <p style="margin:0 0 8px;"><strong>Options:</strong> ${escapeHtml(input.selectedOptions)}</p>
        <p style="margin:0 0 8px;"><strong>Delivery:</strong> ${escapeHtml(input.deliveryAddress)}</p>
        <p style="margin:0;"><strong>Freight:</strong> ${escapeHtml(input.estimateText)}</p>
      </div>
      <p>We’ll confirm the best freight option, timing, and any details before anything goes ahead.</p>
      <p>Thanks,<br>Innate Furniture</p>
    `,
  );

  return { to: input.email, subject, text, html };
}

export function renderInternalEnquiryEmail(input: EnquiryEmailInput): RenderedEmail {
  const subject = `Dining enquiry: ${input.productTitle} — ${input.deliveryAddress}`;
  const contactLines = [
    `Name: ${input.name}`,
    input.email ? `Email: ${input.email}` : undefined,
    input.phone ? `Phone: ${input.phone}` : undefined,
    input.preferredContact ? `Preferred contact: ${input.preferredContact}` : undefined,
  ].filter(Boolean) as string[];

  const text = [
    "New dining table enquiry from the website.",
    "",
    ...contactLines,
    "",
    `Table: ${input.productTitle}`,
    `Options: ${input.selectedOptions}`,
    `Delivery: ${input.deliveryAddress}`,
    `Freight: ${input.estimateText}`,
    input.message ? `Message: ${input.message}` : undefined,
    "",
    input.logId ? `Mission Control log: ${input.logId}` : undefined,
    input.pageUrl ? `Page: ${input.pageUrl}` : undefined,
    input.source ? `Source: ${input.source}` : undefined,
  ].filter(Boolean).join("\n");

  const html = renderShell(
    subject,
    `
      <h1 style="font-size:24px;margin:0 0 14px;">New dining table enquiry</h1>
      <div style="border:1px solid #e5dfd3;border-radius:10px;padding:16px;margin:16px 0;background:#fbfaf7;">
        <p style="margin:0 0 8px;"><strong>Name:</strong> ${escapeHtml(input.name)}</p>
        ${input.email ? `<p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(input.email)}</p>` : ""}
        ${input.phone ? `<p style="margin:0 0 8px;"><strong>Phone:</strong> ${escapeHtml(input.phone)}</p>` : ""}
        ${input.preferredContact ? `<p style="margin:0;"><strong>Preferred contact:</strong> ${escapeHtml(input.preferredContact)}</p>` : ""}
      </div>
      <div style="border:1px solid #e5dfd3;border-radius:10px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;"><strong>Table:</strong> ${escapeHtml(input.productTitle)}</p>
        <p style="margin:0 0 8px;"><strong>Options:</strong> ${escapeHtml(input.selectedOptions)}</p>
        <p style="margin:0 0 8px;"><strong>Delivery:</strong> ${escapeHtml(input.deliveryAddress)}</p>
        <p style="margin:0;"><strong>Freight:</strong> ${escapeHtml(input.estimateText)}</p>
      </div>
      ${paragraph(input.message)}
      ${input.logId ? `<p><strong>Mission Control log:</strong> ${escapeHtml(input.logId)}</p>` : ""}
      ${input.pageUrl ? `<p><strong>Page:</strong> <a href="${escapeHtml(input.pageUrl)}">${escapeHtml(input.pageUrl)}</a></p>` : ""}
    `,
  );

  return { to: process.env.FREIGHT_ENQUIRY_INTERNAL_TO || DEFAULT_INTERNAL_TO, subject, text, html };
}

async function sendWithResend(email: RenderedEmail): Promise<{ sent: boolean; providerMessageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.FREIGHT_ENQUIRY_FROM || DEFAULT_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
  if (!response.ok) return { sent: false, error: data.message || data.error || `Resend HTTP ${response.status}` };
  return { sent: true, providerMessageId: data.id };
}

async function maybeSend(email: RenderedEmail | undefined, mode: string, kind: "customer" | "internal"): Promise<EmailSendStatus> {
  if (!email) {
    return { attempted: false, sent: false, mode, skippedReason: "No customer email supplied" };
  }

  if (mode === "live") {
    const sendResult = await sendWithResend(email);
    if (!sendResult.sent) {
      return { attempted: true, sent: false, mode, to: email.to, subject: email.subject, skippedReason: sendResult.error };
    }
    return {
      attempted: true,
      sent: true,
      mode,
      to: email.to,
      subject: email.subject,
      providerMessageId: sendResult.providerMessageId,
    };
  }

  if (mode !== "test_to_guido") {
    return { attempted: false, sent: false, mode, to: email.to, subject: email.subject, skippedReason: "Email mode is not enabled" };
  }

  const testRecipient = process.env.FREIGHT_ENQUIRY_TEST_RECIPIENT;
  if (!testRecipient) {
    return { attempted: false, sent: false, mode, to: email.to, subject: email.subject, skippedReason: "FREIGHT_ENQUIRY_TEST_RECIPIENT not configured" };
  }

  const testEmail = {
    ...email,
    to: testRecipient,
    subject: `[TEST ${kind.toUpperCase()}] ${email.subject}`,
    text: [`TEST MODE — original recipient would be: ${email.to}`, "", email.text].join("\n"),
    html: renderShell(
      `[TEST ${kind.toUpperCase()}] ${email.subject}`,
      `<p><strong>TEST MODE</strong> — original recipient would be: ${escapeHtml(email.to)}</p>${email.html}`,
    ),
  };

  const sendResult = await sendWithResend(testEmail);
  if (!sendResult.sent) {
    return { attempted: true, sent: false, mode, to: testRecipient, subject: testEmail.subject, skippedReason: sendResult.error };
  }

  return {
    attempted: true,
    sent: true,
    mode,
    to: testRecipient,
    subject: testEmail.subject,
    providerMessageId: sendResult.providerMessageId,
  };
}

export async function sendEnquiryEmails(input: EnquiryEmailInput): Promise<EnquiryEmailResult> {
  const mode = process.env.FREIGHT_ENQUIRY_EMAIL_MODE || "off";
  const customerEmail = renderCustomerEnquiryEmail(input);
  const internalEmail = renderInternalEnquiryEmail(input);

  const [customer, internal] = await Promise.all([
    maybeSend(customerEmail, mode, "customer"),
    maybeSend(internalEmail, mode, "internal"),
  ]);

  return {
    mode,
    customer,
    internal,
    previews: {
      customerSubject: customerEmail?.subject || "No customer email rendered",
      internalSubject: internalEmail.subject,
    },
  };
}
