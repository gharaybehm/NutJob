// Netlify Scheduled Function — runs every 3 hours.
// Calls the Next.js weather cron route which fetches Open-Meteo data and
// stores weather_snapshots for every farm that has GPS coordinates.

export default async function handler() {
  const secret = process.env.CRON_SECRET ?? "";
  const baseUrl = process.env.URL ?? "http://localhost:3000";
  const qs = secret ? `?secret=${encodeURIComponent(secret)}` : "";
  const res = await fetch(`${baseUrl}/api/cron/weather${qs}`);
  const data = await res.json();
  console.log("[cron-weather]", JSON.stringify(data));
}

export const config = {
  // Every 3 hours at the top of the hour
  schedule: "0 0,3,6,9,12,15,18,21 * * *",
};
