import type { SessionState } from "../types";

export const defaultSession = (): SessionState => ({
  phase: "idle",
  intent: {},
  asked: [],
});
