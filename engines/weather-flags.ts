/**
 * The heat-stress flag stored on each weather row. It is a flag for the
 * dashboard and the AI prompt, not an alert: no alert is raised from it. The
 * value is not from a source and is not crop-specific; the crop pack has no
 * heat-stress limit yet.
 */
export const HEAT_STRESS_FLAG_ABOVE_C = 38
