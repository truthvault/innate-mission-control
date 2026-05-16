export const SAMPLE_TYPES = ["Large boards", "Designer samples", "Customer samples"] as const;
export const SPECIES = ["Rimu", "Totara", "Beech"] as const;
export const FINISHES = ["Clear", "Country Bark", "Black Wash"] as const;

export type SampleType = (typeof SAMPLE_TYPES)[number];
export type SampleSpecies = (typeof SPECIES)[number];
export type SampleFinish = (typeof FINISHES)[number];
export type StockLevel = "out" | "low" | "ok";

export type SampleStockCell = {
  sampleType: string;
  species: string;
  finish: string;
  count: number;
  level: StockLevel;
  mondayItemId: string;
  mondayUrl: string;
};

export type SampleStockSummary = {
  total: number;
  outCount: number;
  lowCount: number;
  okCount: number;
  readyFullSets: number;
  byType: Array<{ sampleType: string; total: number; outCount: number; lowCount: number; okCount: number }>;
  byFinish: Array<{ finish: string; total: number; outCount: number; lowCount: number; okCount: number }>;
  topUps: SampleStockCell[];
};

export type SampleStockBoard = {
  boardId: string;
  boardName: string;
  cells: SampleStockCell[];
  summary: SampleStockSummary;
};
