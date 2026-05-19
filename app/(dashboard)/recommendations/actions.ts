"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function getRecommendations() {
  const supabase = await createClient();
  
  // Fetch recommendations and join with blocks to get the block name
  const { data, error } = await supabase
    .from("recommendations")
    .select(`
      *,
      blocks (
        name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching recommendations:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function updateRecommendationStatus(id: string, status: "pending" | "accepted" | "edited" | "skipped") {
  const supabase = await createClient();

  const { error } = await supabase
    .from("recommendations")
    .update({ 
      status,
      acted_at: status !== "pending" ? new Date().toISOString() : null,
      // For a real app, acted_by would be set to the user ID
    })
    .eq("id", id);

  if (error) {
    console.error("Error updating recommendation status:", error);
    throw new Error(error.message);
  }

  revalidatePath("/recommendations");
}

export async function generateMockRecommendations() {
  const supabase = await createClient();

  // First, get some blocks to assign recommendations to
  const { data: blocks, error: blocksError } = await supabase
    .from("blocks")
    .select("id")
    .limit(5);

  if (blocksError || !blocks || blocks.length === 0) {
    console.error("Error fetching blocks for mock data:", blocksError);
    throw new Error("Could not fetch blocks to assign recommendations.");
  }

  const categories = ["irrigate", "fertilize", "spray", "scout", "prune", "other"] as const;
  
  const mockTemplates = [
    {
      category: "irrigate",
      title: "High soil moisture deficit detected",
      rationale: "Soil moisture sensors in this block show a deficit approaching wilting point. High temperatures expected in the next 3 days.",
      confidence: 92,
    },
    {
      category: "spray",
      title: "Spidermite risk high",
      rationale: "Recent hot, dry conditions are ideal for spidermite outbreaks. Nearby blocks have reported increased pressure.",
      confidence: 85,
    },
    {
      category: "fertilize",
      title: "Nitrogen top-up required",
      rationale: "Tissue samples show N levels dropping below optimal threshold for the current nut-development stage.",
      confidence: 78,
    },
    {
      category: "scout",
      title: "Monitor for Navel Orangeworm",
      rationale: "Hull split is beginning in this variety. NOW flights have been detected in the region.",
      confidence: 88,
    },
    {
      category: "prune",
      title: "Remove shaded lower branches",
      rationale: "Canopy density has reduced light penetration below 30% in the lower third, reducing fruiting wood viability.",
      confidence: 65,
    }
  ];

  const newRecommendations = [];

  for (let i = 0; i < 5; i++) {
    const template = mockTemplates[i];
    const block = blocks[Math.floor(Math.random() * blocks.length)];
    
    newRecommendations.push({
      block_id: block.id,
      category: template.category as any,
      title: template.title,
      rationale: template.rationale,
      confidence: template.confidence,
      status: "pending" as any,
    });
  }

  const { error: insertError } = await supabase
    .from("recommendations")
    .insert(newRecommendations);

  if (insertError) {
    console.error("Error inserting mock recommendations:", insertError);
    throw new Error(insertError.message);
  }

  revalidatePath("/recommendations");
}
