import { recordLearningEvent } from "../db/search-repository";
import type { AnalyticsEvent } from "./events";

/** Server-side analytics — persists to LearningEvent (lightweight, no new tables). */
export async function recordAnalyticsEvent(
  event: AnalyticsEvent,
  userId?: string,
): Promise<void> {
  try {
    await recordLearningEvent(userId, event.name, {
      ...event.properties,
      timestamp: event.timestamp ?? Date.now(),
      sessionId: event.sessionId,
    });
  } catch (e) {
    console.error("[analytics] record failed", event.name, e);
  }
}
