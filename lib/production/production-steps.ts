export type ProductionStep = {
  key: string;
  label: string;
  who: string | null;
  wait: boolean;
  waitLabel?: string;
};

export const TABLE_STEPS: ProductionStep[] = [
  { key: "confirmed", label: "Order confirmed", who: "Guido", wait: false },
  { key: "timber-spec", label: "Spec/timber confirmed", who: "Nick", wait: false },
  { key: "tube-fab-po", label: "Tube Fab PO sent", who: "Nick", wait: false },
  { key: "westimber-po", label: "Westimber PO confirmed", who: "Nick", wait: false },
  { key: "timber", label: "Timber pulled", who: "Dylan", wait: false },
  { key: "westimber-send", label: "Timber to Westimber", who: "Nick", wait: false },
  { key: "westimber-wait", label: "Westimber wait", who: null, wait: true, waitLabel: "~2 weeks" },
  { key: "received", label: "Laminated top received", who: "Nick", wait: false },
  { key: "stress-c-channels", label: "Stress cuts + C-channels", who: "Nick", wait: false },
  { key: "bottom-prep", label: "Bottom prep", who: "Dylan", wait: false },
  { key: "bottom-coat", label: "Bottom coat", who: "Dylan", wait: false },
  { key: "sand-top", label: "Sand top/sides/edges", who: "Dylan", wait: false },
  { key: "coat1", label: "1st coat", who: "Dylan", wait: false },
  { key: "coat2", label: "2nd coat", who: "Dylan", wait: false },
  { key: "coat3", label: "3rd/final coat", who: "Dylan", wait: false },
  { key: "cure", label: "Curing", who: null, wait: true, waitLabel: "~1 week" },
  { key: "qc", label: "QC + photos", who: "Nick", wait: false },
  { key: "frame-assembly", label: "Frame/base checked", who: "Nick", wait: false },
  { key: "wrap", label: "Box / pack / wrap", who: "Dylan", wait: false },
  { key: "payment-release", label: "Balance/payment release", who: "Guido", wait: false },
  { key: "freight", label: "Freight/collection booked", who: "Guido", wait: false },
  { key: "customer-update", label: "Customer updated", who: "Guido", wait: false },
];

export const PANEL_STEPS: ProductionStep[] = [
  { key: "confirmed", label: "Order confirmed", who: "Guido", wait: false },
  { key: "pos", label: "POs sent", who: "Nick", wait: false },
  { key: "matWait", label: "Materials wait", who: null, wait: true, waitLabel: "~2 weeks" },
  { key: "received", label: "Materials received", who: "Dylan", wait: false },
  { key: "cut", label: "Cut / prep", who: "Workshop", wait: false },
  { key: "sand", label: "Sand", who: "Workshop", wait: false },
  { key: "coat1", label: "1st coat", who: "Workshop", wait: false },
  { key: "coat2", label: "2nd coat", who: "Workshop", wait: false },
  { key: "cure", label: "Curing", who: null, wait: true, waitLabel: "~1 week" },
  { key: "qc", label: "QC + photos", who: "Workshop", wait: false },
  { key: "wrap", label: "Wrap + dispatch", who: "Workshop", wait: false },
];

export const SAMPLE_STEPS: ProductionStep[] = [
  { key: "received", label: "Request received", who: "Workshop", wait: false },
  { key: "species", label: "Species selected", who: "Workshop", wait: false },
  { key: "cut", label: "Samples cut", who: "Workshop", wait: false },
  { key: "sand", label: "Sanded", who: "Workshop", wait: false },
  { key: "coat", label: "Coated", who: "Workshop", wait: false },
  { key: "pack", label: "Packed", who: "Workshop", wait: false },
  { key: "sent", label: "Sent / collected", who: null, wait: false },
  { key: "followup", label: "Follow-up due", who: "Customer follow-up", wait: false },
];
