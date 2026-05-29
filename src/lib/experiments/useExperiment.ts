"use client";

import { useEffect, useState } from "react";
import {
  getExperimentVariant,
  type ExperimentId,
  type ExperimentVariant,
} from "./flags";
import { trackEvent } from "../analytics/track-client";

export function useExperiment<T extends ExperimentId>(
  id: T,
): ExperimentVariant<T> {
  const [variant, setVariant] = useState<string>(() => getExperimentVariant(id));

  useEffect(() => {
    const v = getExperimentVariant(id);
    setVariant(v);
    trackEvent({
      name: "experiment_exposure",
      properties: { experiment: id, variant: v },
    });
  }, [id]);

  return variant as ExperimentVariant<T>;
}
