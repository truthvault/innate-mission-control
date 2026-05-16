import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import type { DiningPackageLine } from "@/lib/freight/diningFreightPackages";

export interface MainfreightDestinationAddress {
  suburb: string;
  postCode?: string;
  city?: string;
  countryCode?: "NZ";
}

export interface MainfreightRateChargeMap {
  FreightAmount?: number;
  FuelAmount?: number;
  FuelPercentage?: number;
  OtherFeeAmount?: number;
  TotalExcludingGSTAmount?: number;
  TotalIncludingGSTAmount?: number;
  [name: string]: number | undefined;
}

export interface MainfreightRateResult {
  ok: boolean;
  status: number;
  charges: MainfreightRateChargeMap;
  totalExcludingGst?: number;
  totalIncludingGst?: number;
  response: unknown;
}

const MAINFREIGHT_RATE_URL = "https://api.mainfreight.com/transport/1.0/customer/rate?region=NZ";
const DEFAULT_ACCOUNT_CODE = "INNATE2H84";
const DEFAULT_SERVICE_LEVEL = "M2H";

function resolveMainfreightAccountCode(value?: string): string {
  const accountCode = (value || "").trim().toUpperCase();
  // Customer-facing dining freight estimates must use the Mainfreight 2 Home
  // account. Plain INNATE prices materially higher and should never leak into
  // the website estimator, even if a stale env var or caller passes it in.
  return accountCode === DEFAULT_ACCOUNT_CODE ? DEFAULT_ACCOUNT_CODE : DEFAULT_ACCOUNT_CODE;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function tomorrowAtTenNzIsoLike(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const formatter = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T10:00:00`;
}

function toMainfreightFreightDetails(lines: DiningPackageLine[]) {
  return lines.map((line) => ({
    units: String(line.quantity),
    packTypeCode: line.packType,
    height: line.heightMetres.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""),
    width: line.widthMetres.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""),
    length: line.lengthMetres.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""),
    weight: String(line.weightKg),
    volume: (line.cubicMetres * line.quantity).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""),
    description: line.description,
  }));
}

function extractCharges(response: unknown): MainfreightRateChargeMap {
  if (!response || typeof response !== "object") return {};
  const maybeCharges = (response as { charges?: unknown }).charges;
  if (!Array.isArray(maybeCharges)) return {};

  return maybeCharges.reduce<MainfreightRateChargeMap>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const charge = item as { name?: unknown; value?: unknown };
    if (typeof charge.name !== "string") return acc;
    const value = numberOrUndefined(charge.value);
    if (value !== undefined) acc[charge.name] = value;
    return acc;
  }, {});
}

function readSecretFromLocalFile(key: string): string | undefined {
  try {
    const envPath = path.join(process.cwd(), ".secrets", "mainfreight_rate_api.env");
    if (!fs.existsSync(envPath)) return undefined;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [rawKey, ...rest] = trimmed.split("=");
      if (rawKey.trim() !== key) continue;
      return rest.join("=").trim().replace(/^['\"]|['\"]$/g, "");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function getServerSecret(key: string): string | undefined {
  return process.env[key] || readSecretFromLocalFile(key);
}

function postJsonWithNodeHttps(params: {
  url: string;
  headers: Record<string, string>;
  payload: unknown;
}): Promise<{ ok: boolean; status: number; text: string }> {
  const body = JSON.stringify(params.payload);
  const url = new URL(params.url);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          ...params.headers,
          "Content-Length": Buffer.byteLength(body).toString(),
        },
        timeout: 30_000,
        // Mainfreight's current chain can fail local Node CA validation on this Mac.
        // Keep production strict; local dev can still exercise the endpoint safely.
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Mainfreight Rate API request timed out"));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

export function hasMainfreightRateConfig(): boolean {
  return Boolean(getServerSecret("MAINFREIGHT_RATE_API_KEY"));
}

export async function requestMainfreightRate(params: {
  destination: MainfreightDestinationAddress;
  lines: DiningPackageLine[];
  accountCode?: string;
  serviceLevel?: string;
}): Promise<MainfreightRateResult> {
  const apiKey = getServerSecret("MAINFREIGHT_RATE_API_KEY");
  if (!apiKey) {
    throw new Error("MAINFREIGHT_RATE_API_KEY is not configured");
  }

  const destination = {
    suburb: params.destination.suburb,
    postCode: params.destination.postCode,
    city: params.destination.city || params.destination.suburb,
    countryCode: params.destination.countryCode || "NZ",
  };

  const payload = {
    account: { code: resolveMainfreightAccountCode(params.accountCode || getServerSecret("MAINFREIGHT_ACCOUNT_CODE")) },
    serviceLevel: { code: params.serviceLevel || getServerSecret("MAINFREIGHT_SERVICE_LEVEL") || DEFAULT_SERVICE_LEVEL },
    origin: {
      freightRequiredDateTime: tomorrowAtTenNzIsoLike(),
      freightRequiredDateTimeZone: "New Zealand Standard Time",
      address: {
        suburb: "Mairehau",
        postCode: "8013",
        city: "Christchurch",
        countryCode: "NZ",
      },
    },
    destination: { address: destination },
    freightDetails: toMainfreightFreightDetails(params.lines),
  };

  const rateResponse = await postJsonWithNodeHttps({
    url: MAINFREIGHT_RATE_URL,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Secret ${apiKey}`,
      "User-Agent": "InnateDiningFreightEstimator/0.1",
    },
    payload,
  });

  let parsed: unknown;
  try {
    parsed = rateResponse.text ? JSON.parse(rateResponse.text) : null;
  } catch {
    parsed = { raw: rateResponse.text };
  }

  const charges = extractCharges(parsed);
  const totalExcludingGst = numberOrUndefined(charges.TotalExcludingGSTAmount);
  const totalIncludingGst =
    numberOrUndefined(charges.TotalIncludingGSTAmount) ??
    (totalExcludingGst === undefined ? undefined : Math.round(totalExcludingGst * 1.15 * 100) / 100);

  return {
    ok: rateResponse.ok,
    status: rateResponse.status,
    charges,
    totalExcludingGst,
    totalIncludingGst,
    response: parsed,
  };
}
