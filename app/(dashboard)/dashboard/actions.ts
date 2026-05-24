"use server";

import { createClient } from "@/utils/supabase/server";

export interface DashboardData {
  avgSoilMoisture: number | null;
  rainForecastMm: number;
  activeAlertsCount: number;
  nextIrrigationStr: string;
  alerts: {
    id: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    created_at: string;
    domain: 'soil-water' | 'phenology' | 'nutrition' | 'pest-disease' | 'weather';
    blockName: string | null;
  }[];
  blocks: {
    id: string;
    name: string;
    variety: string;
    area: number;
    areaUnit: string;
    status: 'green' | 'amber' | 'red';
    moisture: string;
    issue: string | null;
  }[];
  events: {
    id: string;
    title: string;
    startDate: string;
    type: string;
  }[];
  activities: {
    id: string;
    action: string;
    blockName: string | null;
    user: string;
    time: string;
    type: string;
  }[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      avgSoilMoisture: 0,
      rainForecastMm: 0,
      activeAlertsCount: 0,
      nextIrrigationStr: "None scheduled",
      alerts: [],
      blocks: [],
      events: [],
      activities: []
    };
  }

  // Fetch Blocks, latest soil moisture, and active alerts in parallel
  const [
    { data: dbBlocks },
    { data: activeAlerts },
    { data: soilLatest },
    { data: calendarEvents },
    { data: activityLogs }
  ] = await Promise.all([
    supabase.from("blocks").select("id, name, variety, area, area_unit"),
    supabase.from("block_alerts").select("id, message, severity, created_at, domain, source, block_id, blocks(name)").eq("resolved", false).order("created_at", { ascending: false }),
    supabase.from("soil_water_latest").select("block_id, soil_moisture"),
    supabase.from("calendar_events").select("id, title, start_date, type, block_id").gte("start_date", new Date().toISOString()).order("start_date", { ascending: true }).limit(5),
    supabase.from("activity_log").select("id, title, activity_type, block_id, performed_at, performed_by, blocks(name)").order("performed_at", { ascending: false }).limit(5)
  ]);

  // Calculations:
  // KPI 1: Soil Moisture Average
  const validMoisture = (soilLatest ?? [])
    .map(r => r.soil_moisture)
    .filter((v): v is number => v !== null);
  const avgSoilMoisture = validMoisture.length > 0
    ? Math.round(validMoisture.reduce((sum, v) => sum + v, 0) / validMoisture.length)
    : null;

  // KPI 2: Rain Forecast
  let rainForecastMm = 0;
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=38.08&longitude=33.57&daily=precipitation_sum,precipitation_probability_max&timezone=auto",
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const data = await res.json();
      const sum = data.daily.precipitation_sum?.reduce((acc: number, val: number) => acc + (val || 0), 0) || 0;
      rainForecastMm = Math.round(sum);
    }
  } catch (err) {
    console.error("Error fetching weather forecast for KPI:", err);
  }

  // KPI 3: Active Alerts Count
  const activeAlertsCount = (activeAlerts ?? []).length;

  // KPI 4: Next Irrigation Description
  const nextIrrig = (calendarEvents ?? []).find(e => e.type === "irrigation");
  let nextIrrigationStr = "None scheduled";
  if (nextIrrig) {
    const start = new Date(nextIrrig.start_date);
    const diffMs = start.getTime() - Date.now();
    const diffHrs = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHrs <= 0) {
      nextIrrigationStr = "Ongoing";
    } else if (diffHrs < 24) {
      nextIrrigationStr = `In ${diffHrs}h`;
    } else {
      const days = Math.round(diffHrs / 24);
      nextIrrigationStr = `In ${days}d`;
    }
  }

  // Alerts Mapped
  const mappedAlerts = (activeAlerts ?? []).map(a => {
    const blockName = (a.blocks as { name: string } | null)?.name || null;
    return {
      id: a.id,
      message: a.message,
      severity: a.severity as 'info' | 'warning' | 'critical',
      created_at: a.created_at,
      domain: a.domain as 'soil-water' | 'phenology' | 'nutrition' | 'pest-disease' | 'weather',
      blockName
    };
  });

  // Blocks Grid Mapped
  const mappedBlocks = (dbBlocks ?? []).map(b => {
    // Find moisture for this block
    const moistureRow = (soilLatest ?? []).find(s => s.block_id === b.id);
    const moisture = moistureRow && moistureRow.soil_moisture !== null
      ? `${moistureRow.soil_moisture}%`
      : "N/A";

    // Find alerts for this block
    const blockAlertsList = (activeAlerts ?? []).filter(a => a.block_id === b.id);
    let status: 'green' | 'amber' | 'red' = 'green';
    let issue: string | null = null;

    if (blockAlertsList.some(a => a.severity === 'critical')) {
      status = 'red';
      const worstAlert = blockAlertsList.find(a => a.severity === 'critical');
      issue = worstAlert ? worstAlert.message : null;
    } else if (blockAlertsList.some(a => a.severity === 'warning')) {
      status = 'amber';
      const worstAlert = blockAlertsList.find(a => a.severity === 'warning');
      issue = worstAlert ? worstAlert.message : null;
    }

    return {
      id: b.id,
      name: b.name,
      variety: b.variety,
      area: Number(b.area),
      areaUnit: b.area_unit || "Dunm",
      status,
      moisture,
      issue
    };
  });

  // Calendar Events Mapped
  const mappedEvents = (calendarEvents ?? []).map(e => ({
    id: e.id,
    title: e.title,
    startDate: e.start_date,
    type: e.type
  }));

  // Activity Log Mapped
  const mappedActivities = (activityLogs ?? []).map(act => {
    const blockName = (act.blocks as { name: string } | null)?.name || null;
    
    // Relative time calculation
    const performedAt = new Date(act.performed_at);
    const diffMs = Date.now() - performedAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    
    let timeStr = "Just now";
    if (diffHrs >= 24) {
      const days = Math.floor(diffHrs / 24);
      timeStr = days === 1 ? "Yesterday" : `${days} days ago`;
    } else if (diffHrs > 0) {
      timeStr = `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      timeStr = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    }

    return {
      id: act.id,
      action: act.title,
      blockName,
      user: act.performed_by || "System",
      time: timeStr,
      type: act.activity_type
    };
  });

  return {
    avgSoilMoisture,
    rainForecastMm,
    activeAlertsCount,
    nextIrrigationStr,
    alerts: mappedAlerts,
    blocks: mappedBlocks,
    events: mappedEvents,
    activities: mappedActivities
  };
}
