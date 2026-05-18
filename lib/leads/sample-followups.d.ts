import type { Lead } from "./types";

export function isRecentSampleFollowUp(lead: Lead, now?: Date): boolean;
export function sortSampleFollowUps<T extends Lead>(leads: T[], now?: Date): T[];
export function sampleFollowUpLabel(lead: Lead): string;
export function sampleDraftPrompt(lead: Lead): string;
