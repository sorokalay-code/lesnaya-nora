/** Параметры обзора, короткой погони и устойчивости выбора добычи сокола. */
export const HAWK_HUNT = {
  playerRadius: 24,
  preyRadius: 18,
  disengageRadius: 26,
  playerPriority: 2.6,
  pursuitSeconds: 6,
  retrySeconds: 8,
  searchSeconds: 0.6,
  retargetRatio: 0.75,
} as const;
