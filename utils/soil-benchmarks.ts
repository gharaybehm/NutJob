/**
 * Reference bands for soil-test values, in the units a Turkish lab reports
 * (P2O5 and K2O in kg/da, EC in mS/cm, micronutrients in ppm). One copy, used by
 * the test-entry form, the lab history and the AI context; there were two copies
 * that could drift apart.
 *
 * These are display and hint bands. They agree with A Kalite Analiz's own limit
 * labels on 10 of the 13 parameters it grades (potassium, calcium and magnesium
 * differ in severity), and none is specific to almond: an agronomist should
 * confirm them before they drive fertilizer advice.
 */

export type BS = 'green' | 'amber' | 'red';
export interface Benchmark { status: BS; label: string }

export function getBenchmark(key: string, v: number): Benchmark {
  switch (key) {
    case 'ph_water':
      if (v < 6.5) return { status: 'amber', label: 'Acidic' };
      if (v <= 8.5) return { status: 'green', label: 'Good' };
      return { status: 'amber', label: 'Alkaline' };
    case 'ph_soil':
    case 'ph':
      if (v < 6.0) return { status: 'amber', label: 'Very Acidic' };
      if (v < 6.5) return { status: 'amber', label: 'Slightly Acidic' };
      if (v <= 7.5) return { status: 'green', label: 'Optimal' };
      if (v <= 8.5) return { status: 'amber', label: 'Slightly Alkaline' };
      return { status: 'red', label: 'Very Alkaline' };
    case 'ec_soil':
      if (v < 1.0) return { status: 'green', label: 'Non-saline' };
      if (v < 1.5) return { status: 'amber', label: 'Low Salinity' };
      if (v < 4.0) return { status: 'amber', label: 'Moderate' };
      return { status: 'red', label: 'High Salinity' };
    case 'ec_water':
      if (v < 750)  return { status: 'green', label: 'Good' };
      if (v < 2000) return { status: 'amber', label: 'Moderate' };
      return { status: 'red', label: 'Poor' };
    case 'organic_matter':
      if (v < 1)  return { status: 'red',   label: 'Very Low' };
      if (v < 2)  return { status: 'amber', label: 'Low' };
      if (v < 4)  return { status: 'green', label: 'Medium' };
      if (v < 8)  return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'phosphorus':
      if (v < 3)  return { status: 'red',   label: 'Very Low' };
      if (v < 6)  return { status: 'amber', label: 'Low' };
      if (v < 9)  return { status: 'green', label: 'Medium' };
      if (v < 12) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'potassium':
      if (v < 20)  return { status: 'red',   label: 'Very Low' };
      if (v < 40)  return { status: 'amber', label: 'Low' };
      if (v < 80)  return { status: 'green', label: 'Medium' };
      if (v < 160) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'lime':
      if (v < 1)  return { status: 'green', label: 'Non-calcareous' };
      if (v < 5)  return { status: 'green', label: 'Slightly Calcareous' };
      if (v < 15) return { status: 'amber', label: 'Calcareous' };
      if (v < 25) return { status: 'amber', label: 'Very Calcareous' };
      return { status: 'red', label: 'Extremely Calcareous' };
    case 'calcium':
      if (v < 1000) return { status: 'amber', label: 'Low' };
      if (v < 3000) return { status: 'green', label: 'Sufficient' };
      if (v < 6000) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'magnesium':
      if (v < 300)  return { status: 'red',   label: 'Low' };
      if (v < 1000) return { status: 'green', label: 'Sufficient' };
      if (v < 2000) return { status: 'amber', label: 'High' };
      return { status: 'red', label: 'Very High' };
    case 'iron':
      if (v < 5)  return { status: 'red',   label: 'Deficient' };
      if (v < 20) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'zinc':
      if (v < 0.5) return { status: 'red',   label: 'Deficient' };
      if (v < 1.0) return { status: 'amber', label: 'Marginal' };
      if (v < 3.0) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'copper':
      if (v < 0.5) return { status: 'red',   label: 'Deficient' };
      if (v < 2.0) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'manganese':
      if (v < 2)  return { status: 'red',   label: 'Deficient' };
      if (v < 15) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'cec':
      if (v < 5)  return { status: 'red',   label: 'Very Low' };
      if (v < 15) return { status: 'amber', label: 'Low' };
      if (v < 25) return { status: 'green', label: 'Medium' };
      if (v < 40) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'boron':
      if (v < 0.5) return { status: 'red',   label: 'Deficient' };
      if (v < 1.5) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    default:
      return { status: 'green', label: '' };
  }
}
