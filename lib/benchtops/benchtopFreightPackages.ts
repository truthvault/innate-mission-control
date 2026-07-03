export type PackType = "ITEM";

export interface BenchtopPanelInput {
  length: number;
  width: number;
  thickness?: number;
  quantity?: number;
}

export interface BenchtopPackageLine {
  code: "BT";
  description: string;
  quantity: number;
  packType: PackType;
  lengthMetres: number;
  widthMetres: number;
  heightMetres: number;
  cubicMetres: number;
  weightKg: number;
}

export interface BenchtopFreightPackageResult {
  lines: BenchtopPackageLine[];
  totals: {
    items: number;
    cubicMetres: number;
    weightKg: number;
  };
  pricingRules: typeof BENCHTOP_FREIGHT_PRICING_RULES;
  notes: string[];
}

const TABLETOP_PACKED_HEIGHT_MM = 100;
const TABLETOP_LENGTH_BUFFER_MM = 40;
const TABLETOP_WIDTH_BUFFER_MM = 30;
const BASE_TABLETOP_WEIGHT_KG = 50;
const BASE_TABLETOP_LENGTH_MM = 2200;
const BASE_TABLETOP_WIDTH_MM = 1000;

export const BENCHTOP_FREIGHT_PRICING_RULES = {
  outsideChristchurchMarkupPerOrder: 100,
  christchurchMarkup: 0,
  roundCustomerEstimateUpToNearest: 10,
  highFreightManualCheckThreshold: 600,
  minimumDeliveryInclGst: 150,
} as const;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function metres(mm: number): number {
  return round3(mm / 1000);
}

function cube(lengthMetres: number, widthMetres: number, heightMetres: number): number {
  return round3(lengthMetres * widthMetres * heightMetres);
}

function roundWeightUpToNearest5(weightKg: number): number {
  return Math.ceil(weightKg / 5) * 5;
}

export function estimateBenchtopWeightKg(lengthMm: number, widthMm: number): number {
  const scaledWeight =
    BASE_TABLETOP_WEIGHT_KG *
    ((lengthMm * widthMm) / (BASE_TABLETOP_LENGTH_MM * BASE_TABLETOP_WIDTH_MM));

  return roundWeightUpToNearest5(scaledWeight);
}

function asPositiveNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return number;
}

function asPositiveInteger(value: unknown, field: string): number {
  if (value === undefined || value === null || value === "") return 1;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return number;
}

function packageLine(input: BenchtopPanelInput, index: number): BenchtopPackageLine {
  const lengthMm = asPositiveNumber(input.length, `panels[${index}].length`);
  const widthMm = asPositiveNumber(input.width, `panels[${index}].width`);
  const quantity = asPositiveInteger(input.quantity, `panels[${index}].quantity`);

  const lengthMetres = metres(lengthMm + TABLETOP_LENGTH_BUFFER_MM);
  const widthMetres = metres(widthMm + TABLETOP_WIDTH_BUFFER_MM);
  const heightMetres = metres(TABLETOP_PACKED_HEIGHT_MM);

  return {
    code: "BT",
    description: "TIMBER BENCHTOP",
    quantity,
    packType: "ITEM",
    lengthMetres,
    widthMetres,
    heightMetres,
    cubicMetres: cube(lengthMetres, widthMetres, heightMetres),
    weightKg: estimateBenchtopWeightKg(lengthMm, widthMm),
  };
}

export function buildBenchtopFreightPackages(panels: BenchtopPanelInput[]): BenchtopFreightPackageResult {
  if (!Array.isArray(panels) || panels.length === 0) {
    throw new Error("panels must be a non-empty array");
  }

  const lines = panels.map((panel, index) => packageLine(panel, index));
  const totals = lines.reduce(
    (acc, line) => {
      acc.items += line.quantity;
      acc.cubicMetres += line.cubicMetres * line.quantity;
      acc.weightKg += line.weightKg * line.quantity;
      return acc;
    },
    { items: 0, cubicMetres: 0, weightKg: 0 },
  );

  return {
    lines,
    totals: {
      items: totals.items,
      cubicMetres: round3(totals.cubicMetres),
      weightKg: totals.weightKg,
    },
    pricingRules: BENCHTOP_FREIGHT_PRICING_RULES,
    notes: [
      "Benchtops use the same physical package model as dining tabletops: length +40mm, width +30mm, height 100mm.",
      "Weight is a conservative area-scaled estimate from 2200x1000mm = 50kg, rounded up to nearest 5kg.",
      "Outside Christchurch customer estimate adds $100 per benchtop order, then rounds up to nearest $10.",
      "Every delivery estimate is floored at $150 incl GST.",
    ],
  };
}

export function roundCustomerFreightEstimate(rawInclGst: number, isChristchurch = false): number {
  const markup = isChristchurch
    ? BENCHTOP_FREIGHT_PRICING_RULES.christchurchMarkup
    : BENCHTOP_FREIGHT_PRICING_RULES.outsideChristchurchMarkupPerOrder;
  const subtotal = rawInclGst + markup;
  const roundTo = BENCHTOP_FREIGHT_PRICING_RULES.roundCustomerEstimateUpToNearest;
  const rounded = Math.ceil(subtotal / roundTo) * roundTo;
  return Math.max(BENCHTOP_FREIGHT_PRICING_RULES.minimumDeliveryInclGst, rounded);
}

export function shouldOfferManualFreightCheck(customerEstimateInclGst: number): boolean {
  return customerEstimateInclGst >= BENCHTOP_FREIGHT_PRICING_RULES.highFreightManualCheckThreshold;
}
