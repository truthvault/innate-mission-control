/**
 * Step derivation — DISPLAY-ONLY.
 *
 * `currentStep` and `stepNote` are INFERRED UI PRESENTATION fields derived from
 * Monday's raw enum columns (Status + Top/Panel + Legs). They are NOT source of
 * truth. The raw Monday values are preserved on every transformed order so the
 * underlying state is always inspectable.
 *
 * The source of truth is Monday.com. This function is a best-effort translation
 * into the existing app's step-timeline UI so Dylan/Nick get a clean visual.
 * When derivation is ambiguous, the function picks a safe default and logs a
 * warning via the onUnknown callback.
 */

// TABLE_STEPS indices (must match lib/steps.ts constants — kept in sync):
// 0 confirmed, 1 pos, 2 timber, 3 matWait, 4 received, 5 stress, 6 sand,
// 7 coat1, 8 coat2, 9 cure, 10 qc, 11 assemble, 12 freight
//
// PANEL_STEPS indices:
// 0 confirmed, 1 pos, 2 matWait, 3 received, 4 cut, 5 sand,
// 6 coat1, 7 coat2, 8 cure, 9 qc, 10 wrap

type DeriveArgs = {
  product: "Table" | "Panel" | "Other";
  rawMondayStatus: string | null;
  rawMondayTopPanel: string | null;
  rawMondayLegs: string | null;
  onUnknown: (detail: string) => void;
};

export function computeCurrentStep(args: DeriveArgs): number {
  if (args.product === "Other") {
    // No step timeline shown — caller hides it. Return 0 harmlessly.
    return 0;
  }
  if (args.product === "Table") {
    return computeTableStep(args);
  }
  return computePanelStep(args);
}

function computeTableStep(args: DeriveArgs): number {
  const { rawMondayStatus: status, rawMondayTopPanel: top, rawMondayLegs: legs } =
    args;

  // Terminal states first.
  if (status === "Finished" || status === "Collected") return 12;

  // Pre-production.
  if (status === "Quoting" || status === "To Process") return 0;
  if (status === "Materials Ordered") return 1;

  // Coating progression — Top drives.
  if (top === "Bottom coat" || top === "1st coat" || top === "1st Colour") return 7;
  if (top === "2nd Colour" || top === "coated-check over") return 8;
  if (top === "Final coat") return 9;
  if (top === "Repair") return 10;

  // Post-coating.
  const bothDone = top === "Done / NA" && legs === "Done / NA";
  if (bothDone && status === "Booked") return 11;
  if (bothDone && status === "In production") return 10;

  // Materials-ready but coating not started.
  if (status === "Materials Ready" && top === "Unstarted") return 4;
  if (status === "In production" && top === "Unstarted") return 4;

  args.onUnknown(
    `Table: unexpected combo Status="${status}" Top="${top}" Legs="${legs}" — defaulting currentStep=0`
  );
  return 0;
}

function computePanelStep(args: DeriveArgs): number {
  const { rawMondayStatus: status, rawMondayTopPanel: top } = args;

  // Terminal states.
  if (status === "Finished" || status === "Collected") return 10;

  if (status === "Quoting" || status === "To Process") return 0;
  if (status === "Materials Ordered") return 1;

  // Coating progression — panels have no Legs.
  if (top === "Bottom coat" || top === "1st coat" || top === "1st Colour") return 6;
  if (top === "2nd Colour" || top === "coated-check over") return 7;
  if (top === "Final coat") return 8;

  if (top === "Done / NA" && status === "Booked") return 10;
  if (top === "Done / NA" && status === "In production") return 9;

  if (status === "Materials Ready" && top === "Unstarted") return 3;
  if (status === "In production" && top === "Unstarted") return 4;

  args.onUnknown(
    `Panel: unexpected combo Status="${status}" Top="${top}" — defaulting currentStep=0`
  );
  return 0;
}

export function deriveStepNote(args: {
  product: "Table" | "Panel" | "Other";
  status: "Not Started" | "In Production" | "Finished" | "Collected";
  rawMondayTopPanel: string | null;
  rawMondayLegs: string | null;
}): string {
  if (args.status === "Collected") return "Collected";
  if (args.status === "Finished") return "Shipped";
  if (args.status === "Not Started") return "Awaiting order confirmation";

  const top = args.rawMondayTopPanel;
  if (top === "Repair") return "In repair";
  if (top === "Final coat") return "Curing final coat";
  if (top === "1st coat" || top === "Bottom coat" || top === "1st Colour") {
    return "1st coat applied";
  }
  if (top === "2nd Colour" || top === "coated-check over") return "2nd coat applied";
  if (top === "Unstarted") {
    return args.product === "Panel" ? "Materials ready, starting CNC" : "Materials ready, starting build";
  }
  if (top === "Done / NA") return "Finishing complete, booked";

  return "In production";
}
