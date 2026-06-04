"use client";

import { useEffect, useRef } from "react";
import {
  getExperimentVariant,
  type ExperimentId,
  type ExperimentVariant,
} from "./flags";
import { trackEvent } from "../analytics/track-client";

export function useExperiment<T extends ExperimentId>(
  id: T,
): ExperimentVariant<T> {
  const variant = getExperimentVariant(id);
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackEvent({
      name: "experiment_exposure",
      properties: { experiment: id, variant },
    });
  }, [id, variant]);

  return variant as ExperimentVariant<T>;
}
