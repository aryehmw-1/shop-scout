export interface BlockingClassCounter {
  className: string;
  blocked: number;
  allowed: number;
  estimatedSavedKb: number;
}

const memory = new Map<string, BlockingClassCounter>();

const DEFAULT_EST_BYTES: Record<string, number> = {
  image: 120_000,
  font: 45_000,
  media: 400_000,
  analytics: 25_000,
  tracker: 15_000,
  other: 18_000,
};

function ensure(className: string): BlockingClassCounter {
  const key = className || "other";
  const row = memory.get(key);
  if (row) return row;
  const created: BlockingClassCounter = {
    className: key,
    blocked: 0,
    allowed: 0,
    estimatedSavedKb: 0,
  };
  memory.set(key, created);
  return created;
}

export function recordBlockingEvent(input: {
  className: string;
  blocked: boolean;
  estimatedBytes?: number;
}): void {
  const row = ensure(input.className);
  if (input.blocked) {
    row.blocked += 1;
    const est = input.estimatedBytes ?? DEFAULT_EST_BYTES[row.className] ?? DEFAULT_EST_BYTES.other;
    row.estimatedSavedKb += est / 1024;
  } else {
    row.allowed += 1;
  }
}

export function blockingReportSummary() {
  const classes = [...memory.values()].map((r) => ({
    ...r,
    estimatedSavedKb: Math.round(r.estimatedSavedKb * 100) / 100,
  }));
  const totals = classes.reduce(
    (acc, r) => {
      acc.blocked += r.blocked;
      acc.allowed += r.allowed;
      acc.estimatedSavedKb += r.estimatedSavedKb;
      return acc;
    },
    { blocked: 0, allowed: 0, estimatedSavedKb: 0 },
  );
  return {
    classes,
    totals: {
      ...totals,
      blockedPct:
        totals.blocked + totals.allowed > 0 ?
          Math.round((totals.blocked / (totals.blocked + totals.allowed)) * 1000) / 10
        : 0,
      estimatedSavedMb: Math.round((totals.estimatedSavedKb / 1024) * 1000) / 1000,
    },
  };
}
