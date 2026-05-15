export type DiningBaseFamily = "steel_legs" | "asterix_crossroads" | "tabletop_only";

export type DiningPackageCode = "TT" | "TL" | "AB" | "B";

export type PackType = "ITEM";

export interface DiningPackageLine {
  code: DiningPackageCode;
  description: string;
  quantity: number;
  packType: PackType;
  lengthMetres: number;
  widthMetres: number;
  heightMetres: number;
  cubicMetres: number;
  weightKg: number;
}

export interface DiningFreightInput {
  productHandle: string;
  tableLengthMm: number;
  tableWidthMm?: number;
  benchCount?: number;
  baseFamily?: DiningBaseFamily;
}

export interface DiningFreightPackageResult {
  productHandle: string;
  tableLengthMm: number;
  tableWidthMm: number;
  benchCount: number;
  baseFamily: DiningBaseFamily;
  lines: DiningPackageLine[];
  totals: {
    items: number;
    cubicMetres: number;
    weightKg: number;
  };
  pricingRules: {
    outsideChristchurchMarkupPerTable: number;
    outsideChristchurchMarkupPerBench: number;
    christchurchMarkup: number;
    roundCustomerEstimateUpToNearest: number;
    highFreightManualCheckThreshold: number;
  };
  notes: string[];
}

const DEFAULT_TABLE_WIDTH_MM = 1000;
const TABLETOP_PACKED_HEIGHT_MM = 100;
const TABLETOP_LENGTH_BUFFER_MM = 40;
const TABLETOP_WIDTH_BUFFER_MM = 30;
const BASE_TABLETOP_WEIGHT_KG = 50;
const BASE_TABLETOP_LENGTH_MM = 2200;
const BASE_TABLETOP_WIDTH_MM = 1000;

const BENCH_LENGTH_LESS_THAN_TABLE_MM = 100;
const BENCH_PACKED_LENGTH_BUFFER_MM = 10;
const BENCH_PACKED_WIDTH_MM = 350;
const BENCH_PACKED_HEIGHT_MM = 155;
const BENCH_WEIGHT_KG = 37;

export const DINING_FREIGHT_PRICING_RULES = {
  outsideChristchurchMarkupPerTable: 100,
  outsideChristchurchMarkupPerBench: 50,
  christchurchMarkup: 0,
  roundCustomerEstimateUpToNearest: 10,
  highFreightManualCheckThreshold: 600,
} as const;

export const DINING_PRODUCT_BASE_FAMILIES: Record<string, DiningBaseFamily> = {
  "custom-crossroads-dining-table": "asterix_crossroads",
  "steel-asterix-dining-table": "asterix_crossroads",
  "round-asterix-dining-table": "asterix_crossroads",
  "straight-steel-dining-table": "steel_legs",
  "angled-steel-dining-table": "steel_legs",
  "reverse-angled-steel-dining-table": "steel_legs",
  "reverse-angled-timber-dining-table": "steel_legs",
  "modern-homestead-dining-table": "steel_legs",
  "oval-solid-wood-dining-table-nz": "tabletop_only",
};

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

export function estimateTabletopWeightKg(tableLengthMm: number, tableWidthMm = DEFAULT_TABLE_WIDTH_MM): number {
  const scaledWeight =
    BASE_TABLETOP_WEIGHT_KG *
    ((tableLengthMm * tableWidthMm) / (BASE_TABLETOP_LENGTH_MM * BASE_TABLETOP_WIDTH_MM));

  return roundWeightUpToNearest5(scaledWeight);
}

function packageLine(
  code: DiningPackageCode,
  description: string,
  quantity: number,
  lengthMetres: number,
  widthMetres: number,
  heightMetres: number,
  weightKg: number,
): DiningPackageLine {
  return {
    code,
    description,
    quantity,
    packType: "ITEM",
    lengthMetres,
    widthMetres,
    heightMetres,
    cubicMetres: cube(lengthMetres, widthMetres, heightMetres),
    weightKg,
  };
}

export function buildDiningFreightPackages(input: DiningFreightInput): DiningFreightPackageResult {
  const tableWidthMm = input.tableWidthMm ?? DEFAULT_TABLE_WIDTH_MM;
  const benchCount = input.benchCount ?? 0;
  const baseFamily = input.baseFamily ?? DINING_PRODUCT_BASE_FAMILIES[input.productHandle] ?? "steel_legs";

  if (!Number.isFinite(input.tableLengthMm) || input.tableLengthMm <= 0) {
    throw new Error("tableLengthMm must be a positive number");
  }

  if (!Number.isFinite(tableWidthMm) || tableWidthMm <= 0) {
    throw new Error("tableWidthMm must be a positive number");
  }

  if (!Number.isInteger(benchCount) || benchCount < 0) {
    throw new Error("benchCount must be a non-negative integer");
  }

  const lines: DiningPackageLine[] = [];

  const tabletopLengthMetres = metres(input.tableLengthMm + TABLETOP_LENGTH_BUFFER_MM);
  const tabletopWidthMetres = metres(tableWidthMm + TABLETOP_WIDTH_BUFFER_MM);
  const tabletopHeightMetres = metres(TABLETOP_PACKED_HEIGHT_MM);

  lines.push(
    packageLine(
      "TT",
      "DINING TABLETOP",
      1,
      tabletopLengthMetres,
      tabletopWidthMetres,
      tabletopHeightMetres,
      estimateTabletopWeightKg(input.tableLengthMm, tableWidthMm),
    ),
  );

  if (baseFamily === "steel_legs") {
    lines.push(packageLine("TL", "DINING TABLE LEGS", 1, 0.98, 0.78, 0.23, 40));
  }

  if (baseFamily === "asterix_crossroads") {
    lines.push(packageLine("AB", "ASTERIX BASE", 1, 0.85, 0.85, 0.8, 40));
  }

  if (benchCount > 0) {
    const benchLengthMm = input.tableLengthMm - BENCH_LENGTH_LESS_THAN_TABLE_MM;
    const packedBenchLengthMm = benchLengthMm + BENCH_PACKED_LENGTH_BUFFER_MM;

    lines.push(
      packageLine(
        "B",
        "BENCH",
        benchCount,
        metres(packedBenchLengthMm),
        metres(BENCH_PACKED_WIDTH_MM),
        metres(BENCH_PACKED_HEIGHT_MM),
        BENCH_WEIGHT_KG,
      ),
    );
  }

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
    productHandle: input.productHandle,
    tableLengthMm: input.tableLengthMm,
    tableWidthMm,
    benchCount,
    baseFamily,
    lines,
    totals: {
      items: totals.items,
      cubicMetres: round3(totals.cubicMetres),
      weightKg: totals.weightKg,
    },
    pricingRules: DINING_FREIGHT_PRICING_RULES,
    notes: [
      "Tabletop dimensions are wrapped dimensions from Guido: length +40mm, width +30mm, height 100mm.",
      "Tabletop weight is a conservative area-scaled estimate from 2200x1000mm = 50kg, rounded up to nearest 5kg.",
      "Bench weight is fixed at 37kg for v1; bench length is table length -100mm, packed length +10mm.",
      "Outside Christchurch customer estimate should add $100 per table and $50 per bench, then round up to nearest $10.",
      "Show remote/rural/high-price estimates, but offer an easy manual-check handoff when freight is steep or remote.",
    ],
  };
}

export function roundCustomerFreightEstimate(rawInclGst: number, benchCount = 0, isChristchurch = false): number {
  const markup = isChristchurch
    ? DINING_FREIGHT_PRICING_RULES.christchurchMarkup
    : DINING_FREIGHT_PRICING_RULES.outsideChristchurchMarkupPerTable +
      DINING_FREIGHT_PRICING_RULES.outsideChristchurchMarkupPerBench * benchCount;

  const subtotal = rawInclGst + markup;
  const roundTo = DINING_FREIGHT_PRICING_RULES.roundCustomerEstimateUpToNearest;
  return Math.ceil(subtotal / roundTo) * roundTo;
}

export function shouldOfferManualFreightCheck(customerEstimateInclGst: number): boolean {
  return customerEstimateInclGst >= DINING_FREIGHT_PRICING_RULES.highFreightManualCheckThreshold;
}
