export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          block_id: string | null
          calendar_event_id: string | null
          created_at: string
          description: string | null
          details: Json | null
          id: string
          performed_at: string
          performed_by: string | null
          title: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          block_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          description?: string | null
          details?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          title: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          block_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          description?: string | null
          details?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      block_alerts: {
        Row: {
          block_id: string
          created_at: string
          domain: Database["public"]["Enums"]["agro_domain"]
          id: string
          message: string
          resolved: boolean
          resolved_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          source: Database["public"]["Enums"]["data_source"]
        }
        Insert: {
          block_id: string
          created_at?: string
          domain: Database["public"]["Enums"]["agro_domain"]
          id?: string
          message: string
          resolved?: boolean
          resolved_at?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          source: Database["public"]["Enums"]["data_source"]
        }
        Update: {
          block_id?: string
          created_at?: string
          domain?: Database["public"]["Enums"]["agro_domain"]
          id?: string
          message?: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          source?: Database["public"]["Enums"]["data_source"]
        }
        Relationships: [
          {
            foreignKeyName: "block_alerts_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          area: number
          area_unit: string
          created_at: string
          created_by: string | null
          crop_type: string
          field_capacity: number | null
          id: string
          map_col: number
          map_col_span: number
          map_row: number
          map_row_span: number
          name: string
          notes: string | null
          planting_year: number
          rootstock: string
          row_spacing: number
          tree_count: number
          tree_spacing: number
          updated_at: string
          variety: string
          wilting_point: number | null
        }
        Insert: {
          area: number
          area_unit?: string
          created_at?: string
          created_by?: string | null
          crop_type?: string
          field_capacity?: number | null
          id: string
          map_col?: number
          map_col_span?: number
          map_row?: number
          map_row_span?: number
          name: string
          notes?: string | null
          planting_year: number
          rootstock: string
          row_spacing: number
          tree_count: number
          tree_spacing: number
          updated_at?: string
          variety: string
          wilting_point?: number | null
        }
        Update: {
          area?: number
          area_unit?: string
          created_at?: string
          created_by?: string | null
          crop_type?: string
          field_capacity?: number | null
          id?: string
          map_col?: number
          map_col_span?: number
          map_row?: number
          map_row_span?: number
          name?: string
          notes?: string | null
          planting_year?: number
          rootstock?: string
          row_spacing?: number
          tree_count?: number
          tree_spacing?: number
          updated_at?: string
          variety?: string
          wilting_point?: number | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          block: string | null
          block_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          details: Json | null
          end_date: string
          id: string
          notes: string | null
          start_date: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          block?: string | null
          block_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          details?: Json | null
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          title: string
          type: string
          user_id?: string
        }
        Update: {
          block?: string | null
          block_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          details?: Json | null
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_materials: {
        Row: {
          id: string
          calendar_event_id: string
          consumable_id: string
          planned_quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          calendar_event_id: string
          consumable_id: string
          planned_quantity: number
          created_at?: string
        }
        Update: {
          id?: string
          calendar_event_id?: string
          consumable_id?: string
          planned_quantity?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_materials_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_materials_consumable_id_fkey"
            columns: ["consumable_id"]
            isOneToOne: false
            referencedRelation: "consumables"
            referencedColumns: ["id"]
          },
        ]
      }
      consumable_usage_log: {
        Row: {
          id: string
          consumable_id: string
          quantity: number
          calendar_event_id: string | null
          block: string | null
          notes: string | null
          logged_by: string | null
          usage_date: string
          created_at: string
        }
        Insert: {
          id?: string
          consumable_id: string
          quantity: number
          calendar_event_id?: string | null
          block?: string | null
          notes?: string | null
          logged_by?: string | null
          usage_date: string
          created_at?: string
        }
        Update: {
          id?: string
          consumable_id?: string
          quantity?: number
          calendar_event_id?: string | null
          block?: string | null
          notes?: string | null
          logged_by?: string | null
          usage_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumable_usage_log_consumable_id_fkey"
            columns: ["consumable_id"]
            isOneToOne: false
            referencedRelation: "consumables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_usage_log_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      consumables: {
        Row: {
          id: string
          name: string
          category: string
          unit: string
          starting_balance: number
          current_balance: number
          minimum_stock: number | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          unit: string
          starting_balance: number
          current_balance: number
          minimum_stock?: number | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          unit?: string
          starting_balance?: number
          current_balance?: number
          minimum_stock?: number | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      fertigation_log: {
        Row: {
          amount_kg_per_tree: number
          applied_at: string
          block_id: string
          calendar_event_id: string | null
          created_at: string
          entered_by: string | null
          fertilizer_type: string
          growth_stage_note: string | null
          id: string
          notes: string | null
        }
        Insert: {
          amount_kg_per_tree: number
          applied_at: string
          block_id: string
          calendar_event_id?: string | null
          created_at?: string
          entered_by?: string | null
          fertilizer_type: string
          growth_stage_note?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          amount_kg_per_tree?: number
          applied_at?: string
          block_id?: string
          calendar_event_id?: string | null
          created_at?: string
          entered_by?: string | null
          fertilizer_type?: string
          growth_stage_note?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fertigation_log_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fertigation_log_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      pest_observations: {
        Row: {
          block_id: string
          common_name: string
          created_at: string
          id: string
          last_seen: string
          note: string | null
          observed_count: string | null
          pest_name: string
          report_id: string
          risk_level: Database["public"]["Enums"]["health_status"]
          source: Database["public"]["Enums"]["data_source"]
          stage: Database["public"]["Enums"]["pest_stage"]
        }
        Insert: {
          block_id: string
          common_name: string
          created_at?: string
          id?: string
          last_seen?: string
          note?: string | null
          observed_count?: string | null
          pest_name: string
          report_id: string
          risk_level?: Database["public"]["Enums"]["health_status"]
          source?: Database["public"]["Enums"]["data_source"]
          stage?: Database["public"]["Enums"]["pest_stage"]
        }
        Update: {
          block_id?: string
          common_name?: string
          created_at?: string
          id?: string
          last_seen?: string
          note?: string | null
          observed_count?: string | null
          pest_name?: string
          report_id?: string
          risk_level?: Database["public"]["Enums"]["health_status"]
          source?: Database["public"]["Enums"]["data_source"]
          stage?: Database["public"]["Enums"]["pest_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "pest_observations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pest_observations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "scouting_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pest_observations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "scouting_reports_latest"
            referencedColumns: ["id"]
          },
        ]
      }
      phenology_records: {
        Row: {
          block_id: string
          bud_break_date: string | null
          chill_hours: number | null
          created_at: string
          cumulative_gdd: number | null
          current_stage: Database["public"]["Enums"]["growth_stage"]
          days_to_hull_split: number | null
          estimated_harvest_end: string | null
          estimated_harvest_start: string | null
          id: string
          recorded_at: string
          source: Database["public"]["Enums"]["data_source"]
          stage_description: string | null
        }
        Insert: {
          block_id: string
          bud_break_date?: string | null
          chill_hours?: number | null
          created_at?: string
          cumulative_gdd?: number | null
          current_stage: Database["public"]["Enums"]["growth_stage"]
          days_to_hull_split?: number | null
          estimated_harvest_end?: string | null
          estimated_harvest_start?: string | null
          id?: string
          recorded_at?: string
          source?: Database["public"]["Enums"]["data_source"]
          stage_description?: string | null
        }
        Update: {
          block_id?: string
          bud_break_date?: string | null
          chill_hours?: number | null
          created_at?: string
          cumulative_gdd?: number | null
          current_stage?: Database["public"]["Enums"]["growth_stage"]
          days_to_hull_split?: number | null
          estimated_harvest_end?: string | null
          estimated_harvest_start?: string | null
          id?: string
          recorded_at?: string
          source?: Database["public"]["Enums"]["data_source"]
          stage_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phenology_records_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          activity_log_id: string | null
          block_id: string | null
          category: Database["public"]["Enums"]["recommendation_category"]
          confidence: number | null
          created_at: string
          expires_at: string | null
          farm_id: string
          id: string
          llm_model: string | null
          llm_prompt_hash: string | null
          manager_note: string | null
          rationale: string
          status: Database["public"]["Enums"]["recommendation_status"]
          title: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          activity_log_id?: string | null
          block_id?: string | null
          category: Database["public"]["Enums"]["recommendation_category"]
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          farm_id: string
          id?: string
          llm_model?: string | null
          llm_prompt_hash?: string | null
          manager_note?: string | null
          rationale: string
          status?: Database["public"]["Enums"]["recommendation_status"]
          title: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          activity_log_id?: string | null
          block_id?: string | null
          category?: Database["public"]["Enums"]["recommendation_category"]
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          farm_id?: string
          id?: string
          llm_model?: string | null
          llm_prompt_hash?: string | null
          manager_note?: string | null
          rationale?: string
          status?: Database["public"]["Enums"]["recommendation_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_activity_log_id_fkey"
            columns: ["activity_log_id"]
            isOneToOne: false
            referencedRelation: "activity_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
      scouting_reports: {
        Row: {
          block_id: string
          created_at: string
          id: string
          next_scouting: string | null
          notes: string | null
          overall_risk: Database["public"]["Enums"]["health_status"]
          scout_id: string | null
          scouted_at: string
        }
        Insert: {
          block_id: string
          created_at?: string
          id?: string
          next_scouting?: string | null
          notes?: string | null
          overall_risk?: Database["public"]["Enums"]["health_status"]
          scout_id?: string | null
          scouted_at?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          id?: string
          next_scouting?: string | null
          notes?: string | null
          overall_risk?: Database["public"]["Enums"]["health_status"]
          scout_id?: string | null
          scouted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouting_reports_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      soil_water_readings: {
        Row: {
          block_id: string | null
          created_at: string
          eto: number | null
          file_url: string | null
          id: string
          lab_reference: string | null
          notes: string | null
          parameters: Record<string, unknown> | null
          ph: number | null
          recorded_at: string
          root_zone_temp: number | null
          soil_ec: number | null
          soil_moisture: number | null
          source: Database["public"]["Enums"]["data_source"]
          test_type: string
          water_deficit: number | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          eto?: number | null
          file_url?: string | null
          id?: string
          lab_reference?: string | null
          notes?: string | null
          parameters?: Record<string, unknown> | null
          ph?: number | null
          recorded_at?: string
          root_zone_temp?: number | null
          soil_ec?: number | null
          soil_moisture?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          test_type?: string
          water_deficit?: number | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          eto?: number | null
          file_url?: string | null
          id?: string
          lab_reference?: string | null
          notes?: string | null
          parameters?: Record<string, unknown> | null
          ph?: number | null
          recorded_at?: string
          root_zone_temp?: number | null
          soil_ec?: number | null
          soil_moisture?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          test_type?: string
          water_deficit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "soil_water_readings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      tissue_samples: {
        Row: {
          block_id: string
          created_at: string
          entered_by: string | null
          id: string
          lab_reference: string | null
          notes: string | null
          nutrients: Json
          sampled_at: string
        }
        Insert: {
          block_id: string
          created_at?: string
          entered_by?: string | null
          id?: string
          lab_reference?: string | null
          notes?: string | null
          nutrients?: Json
          sampled_at: string
        }
        Update: {
          block_id?: string
          created_at?: string
          entered_by?: string | null
          id?: string
          lab_reference?: string | null
          notes?: string | null
          nutrients?: Json
          sampled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tissue_samples_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      weather_snapshots: {
        Row: {
          block_id: string | null
          created_at: string
          forecast_json: Json | null
          frost_risk: boolean
          heat_stress_risk: boolean
          humidity_pct: number | null
          id: string
          rainfall_7d_mm: number | null
          rainfall_mm: number | null
          recorded_at: string
          source: Database["public"]["Enums"]["data_source"]
          temp_c: number | null
          wind_direction: string | null
          wind_kmh: number | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          forecast_json?: Json | null
          frost_risk?: boolean
          heat_stress_risk?: boolean
          humidity_pct?: number | null
          id?: string
          rainfall_7d_mm?: number | null
          rainfall_mm?: number | null
          recorded_at?: string
          source?: Database["public"]["Enums"]["data_source"]
          temp_c?: number | null
          wind_direction?: string | null
          wind_kmh?: number | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          forecast_json?: Json | null
          frost_risk?: boolean
          heat_stress_risk?: boolean
          humidity_pct?: number | null
          id?: string
          rainfall_7d_mm?: number | null
          rainfall_mm?: number | null
          recorded_at?: string
          source?: Database["public"]["Enums"]["data_source"]
          temp_c?: number | null
          wind_direction?: string | null
          wind_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_snapshots_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      phenology_latest: {
        Row: {
          block_id: string | null
          bud_break_date: string | null
          chill_hours: number | null
          created_at: string | null
          cumulative_gdd: number | null
          current_stage: Database["public"]["Enums"]["growth_stage"] | null
          days_to_hull_split: number | null
          estimated_harvest_end: string | null
          estimated_harvest_start: string | null
          id: string | null
          recorded_at: string | null
          source: Database["public"]["Enums"]["data_source"] | null
          stage_description: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phenology_records_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      scouting_reports_latest: {
        Row: {
          block_id: string | null
          created_at: string | null
          id: string | null
          next_scouting: string | null
          notes: string | null
          overall_risk: Database["public"]["Enums"]["health_status"] | null
          scout_id: string | null
          scouted_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scouting_reports_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      soil_water_latest: {
        Row: {
          block_id: string | null
          created_at: string | null
          eto: number | null
          field_capacity: number | null
          file_url: string | null
          id: string | null
          lab_reference: string | null
          notes: string | null
          parameters: Record<string, unknown> | null
          ph: number | null
          recorded_at: string | null
          root_zone_temp: number | null
          soil_ec: number | null
          soil_moisture: number | null
          source: Database["public"]["Enums"]["data_source"] | null
          test_type: string | null
          water_deficit: number | null
          wilting_point: number | null
        }
        Relationships: [
          {
            foreignKeyName: "soil_water_readings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      tissue_samples_latest: {
        Row: {
          block_id: string | null
          created_at: string | null
          entered_by: string | null
          id: string | null
          lab_reference: string | null
          notes: string | null
          nutrients: Json | null
          sampled_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tissue_samples_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_latest: {
        Row: {
          block_id: string | null
          created_at: string | null
          forecast_json: Json | null
          frost_risk: boolean | null
          heat_stress_risk: boolean | null
          humidity_pct: number | null
          id: string | null
          rainfall_7d_mm: number | null
          rainfall_mm: number | null
          recorded_at: string | null
          source: Database["public"]["Enums"]["data_source"] | null
          temp_c: number | null
          wind_direction: string | null
          wind_kmh: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_snapshots_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_type:
        | "irrigation"
        | "fertigation"
        | "spraying"
        | "pruning"
        | "scouting"
        | "pollinating"
        | "tilling"
        | "plowing"
        | "weeding"
        | "tissue-sample"
        | "other"
      agro_domain:
        | "soil-water"
        | "phenology"
        | "nutrition"
        | "pest-disease"
        | "weather"
      alert_severity: "info" | "warning" | "critical"
      data_source: "sensor" | "manual" | "computed" | "forecast"
      growth_stage:
        | "dormancy"
        | "bud-swell"
        | "bud-break"
        | "bloom"
        | "petal-fall"
        | "nut-development"
        | "hull-split"
        | "harvest"
        | "post-harvest"
      health_status: "green" | "amber" | "red"
      pest_stage: "Active" | "Monitoring" | "Resolved"
      recommendation_category:
        | "irrigate"
        | "fertilize"
        | "spray"
        | "scout"
        | "prune"
        | "other"
      recommendation_status: "pending" | "accepted" | "edited" | "skipped"
      user_role: "admin" | "supervisor" | "worker"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "irrigation",
        "fertigation",
        "spraying",
        "pruning",
        "scouting",
        "pollinating",
        "tilling",
        "plowing",
        "weeding",
        "tissue-sample",
        "other",
      ],
      agro_domain: [
        "soil-water",
        "phenology",
        "nutrition",
        "pest-disease",
        "weather",
      ],
      alert_severity: ["info", "warning", "critical"],
      data_source: ["sensor", "manual", "computed", "forecast"],
      growth_stage: [
        "dormancy",
        "bud-swell",
        "bud-break",
        "bloom",
        "petal-fall",
        "nut-development",
        "hull-split",
        "harvest",
        "post-harvest",
      ],
      health_status: ["green", "amber", "red"],
      pest_stage: ["Active", "Monitoring", "Resolved"],
      recommendation_category: [
        "irrigate",
        "fertilize",
        "spray",
        "scout",
        "prune",
        "other",
      ],
      recommendation_status: ["pending", "accepted", "edited", "skipped"],
      user_role: ["admin", "supervisor", "worker"],
    },
  },
} as const
