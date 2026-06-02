// Netlify Scheduled Function — runs daily at midnight.
// Calls the Next.js compute-fields cron route which calculates ETo, GDD,
// chill hours, and 7-day water deficit for every farm block using
// Open-Meteo daily temperature data.

export default async function handler() {
  const secret = process.env.CRON_SECRET ?? "";
  const baseUrl = process.env.URL ?? "http://localhost:3000";
  const qs = secret ? `?secret=${encodeURIComponent(secret)}` : "";
  const res = await fetch(`${baseUrl}/api/cron/compute-fields${qs}`);
  const data = await res.json();
  console.log("[cron-compute-fields]", JSON.stringify(data));
}

export const config = {
  // Daily at midnight
  schedule: "0 0 * * *",
};
