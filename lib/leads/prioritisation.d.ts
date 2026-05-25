import type { Lead } from "./types";

export type LeadSort = "priority" | "follow_up_asc" | "follow_up_desc" | "value_desc" | "value_asc" | "updated_desc" | "name_asc";
export const SORT_OPTIONS: Array<[LeadSort, string]>;
export function todayKey(now?: Date): string;
export function addDaysKey(days: number, fromKey?: string): string;
export function dateKey(value?: string): string | undefined;
export function isClosed(lead: Lead): boolean;
export function isDue(lead: Lead, today?: string): boolean;
export function isDueThisWeek(lead: Lead, today?: string): boolean;
export function needsNextStep(lead: Lead): boolean;
export function isHighValue(lead: Lead): boolean;
export function hasLiveQuoteValue(lead: Lead): boolean;
export function isCashflowQuote(lead: Lead): boolean;
export function doToday(lead: Lead, today?: string): boolean;
export function sortByUrgency(a: Lead, b: Lead): number;
export function sortByCashflow(a: Lead, b: Lead): number;
export function sortLeads(leads: Lead[], sortMode?: LeadSort): Lead[];
