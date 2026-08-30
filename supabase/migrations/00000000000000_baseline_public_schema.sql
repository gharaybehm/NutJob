-- =============================================================================
-- BASELINE — the public schema as it actually existed in Supabase Cloud,
-- captured 2026-08-30 by `pg_dump --schema-only --schema=public` from project
-- icvkilnyvoyujzxgumhs (PostgreSQL 17.6).
--
-- WHY THIS FILE EXISTS
-- Most of this schema was never in version control. The migrations in this
-- directory contain only 11 CREATE TABLE statements; the live database has 26
-- tables, 71 RLS policies and 5 views. Everything else was written by hand in
-- the Supabase SQL editor, which meant the schema existed in exactly one place
-- — the running cloud database — and nowhere else. This file closes that gap.
--
-- It is a RECORD, not a migration to replay on an existing database. The
-- objects here already exist in any environment restored from the same source.
--
-- WHAT THIS FILE DOES *NOT* CONTAIN
-- `--schema=public` excludes the auth, storage and realtime schemas. Most
-- importantly it omits the trigger `on_auth_user_created` on `auth.users`,
-- which creates the `user_profiles` row for a new signup. That trigger is real
-- and load-bearing: without it, new users authenticate into an account with no
-- profile. It is preserved only in the full dump. See SECURITY.md / the
-- migration notes before rebuilding an environment from this file alone.
-- =============================================================================

--
-- PostgreSQL database dump
--

\restrict ZGjdcvTISJprNEjGBW65gtRBl9K5oCuECcFDS3dhNvInRUTWPjsDjYBTzGjA69U

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: activity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_type AS ENUM (
    'irrigation',
    'fertigation',
    'spraying',
    'pruning',
    'scouting',
    'tissue-sample',
    'other'
);


--
-- Name: agro_domain; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agro_domain AS ENUM (
    'soil-water',
    'phenology',
    'nutrition',
    'pest-disease',
    'weather'
);


--
-- Name: alert_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
);


--
-- Name: data_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.data_source AS ENUM (
    'sensor',
    'manual',
    'computed',
    'forecast'
);


--
-- Name: growth_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.growth_stage AS ENUM (
    'dormancy',
    'bud-swell',
    'bud-break',
    'bloom',
    'petal-fall',
    'nut-development',
    'hull-split',
    'harvest',
    'post-harvest'
);


--
-- Name: health_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.health_status AS ENUM (
    'green',
    'amber',
    'red'
);


--
-- Name: pest_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pest_stage AS ENUM (
    'Active',
    'Monitoring',
    'Resolved'
);


--
-- Name: recommendation_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recommendation_category AS ENUM (
    'irrigate',
    'fertilize',
    'spray',
    'scout',
    'prune',
    'other'
);


--
-- Name: recommendation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recommendation_status AS ENUM (
    'pending',
    'accepted',
    'edited',
    'skipped'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'supervisor',
    'worker',
    'super_admin'
);


--
-- Name: get_user_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role(user_id uuid) RETURNS public.user_role
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role FROM user_profiles WHERE id = user_id;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: match_knowledge_base(public.vector, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_knowledge_base(query_embedding public.vector, match_count integer DEFAULT 5, filter_crop_type text DEFAULT NULL::text, filter_category text DEFAULT NULL::text) RETURNS TABLE(id uuid, source_title text, source_section text, source_url text, page_number integer, content text, crop_type text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    id, source_title, source_section, source_url, page_number, content, crop_type,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base_chunks
  WHERE (filter_crop_type IS NULL OR lower(crop_type) = lower(filter_crop_type) OR crop_type IS NULL)
    AND (filter_category IS NULL OR category = filter_category)
  ORDER BY (crop_type IS NULL), embedding <=> query_embedding
  LIMIT match_count;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text,
    calendar_event_id uuid,
    activity_type public.activity_type NOT NULL,
    title text NOT NULL,
    description text,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    performed_by uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_maintenance_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_maintenance_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    maintenance_date date NOT NULL,
    maintenance_type text NOT NULL,
    description text NOT NULL,
    cost numeric,
    performed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asset_maintenance_log_maintenance_type_check CHECK ((maintenance_type = ANY (ARRAY['routine'::text, 'repair'::text, 'inspection'::text])))
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    status text NOT NULL,
    purchase_date date,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    farm_id uuid NOT NULL,
    CONSTRAINT assets_category_check CHECK ((category = ANY (ARRAY['machinery'::text, 'vehicle'::text, 'tool'::text, 'equipment'::text, 'other'::text]))),
    CONSTRAINT assets_status_check CHECK ((status = ANY (ARRAY['operational'::text, 'needs-maintenance'::text, 'out-of-service'::text])))
);


--
-- Name: block_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text NOT NULL,
    domain public.agro_domain NOT NULL,
    severity public.alert_severity NOT NULL,
    message text NOT NULL,
    source public.data_source NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    id text NOT NULL,
    name text NOT NULL,
    variety text NOT NULL,
    area numeric(6,2) NOT NULL,
    planting_year smallint NOT NULL,
    rootstock text NOT NULL,
    tree_count integer NOT NULL,
    row_spacing numeric(4,1) NOT NULL,
    tree_spacing numeric(4,1) NOT NULL,
    map_col smallint DEFAULT 0 NOT NULL,
    map_row smallint DEFAULT 0 NOT NULL,
    map_col_span smallint DEFAULT 1 NOT NULL,
    map_row_span smallint DEFAULT 1 NOT NULL,
    field_capacity numeric(5,2),
    wilting_point numeric(5,2),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    area_unit text DEFAULT 'Dunm'::text,
    crop_type text DEFAULT 'Almond'::text NOT NULL,
    boundary jsonb,
    farm_id uuid
);


--
-- Name: calendar_event_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_event_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calendar_event_id uuid NOT NULL,
    consumable_id uuid NOT NULL,
    planned_quantity numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_event_materials_planned_quantity_check CHECK ((planned_quantity > (0)::numeric))
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    block text,
    notes text,
    completed_at timestamp with time zone,
    details jsonb,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_by uuid,
    block_id text
);


--
-- Name: consumable_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumable_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consumable_id uuid NOT NULL,
    quantity numeric NOT NULL,
    calendar_event_id uuid,
    block text,
    notes text,
    logged_by uuid,
    usage_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: consumables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    unit text NOT NULL,
    starting_balance numeric DEFAULT 0 NOT NULL,
    current_balance numeric DEFAULT 0 NOT NULL,
    minimum_stock numeric,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    farm_id uuid NOT NULL
);


--
-- Name: farm_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.farm_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    farm_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.user_role DEFAULT 'worker'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: farms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.farms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    gps_lat double precision,
    gps_lng double precision,
    gps_zoom smallint DEFAULT 14,
    address text,
    total_area numeric(10,2),
    area_unit text DEFAULT 'Dunm'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    climate_profile jsonb,
    climate_fetched_at timestamp with time zone,
    sensecap_api_id text,
    sensecap_access_key text,
    organization_id uuid
);


--
-- Name: fertigation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fertigation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text NOT NULL,
    calendar_event_id uuid,
    applied_at timestamp with time zone NOT NULL,
    fertilizer_type text NOT NULL,
    amount_kg_per_tree numeric(6,3) NOT NULL,
    growth_stage_note text,
    notes text,
    entered_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_base_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_title text NOT NULL,
    source_section text,
    source_url text,
    page_number integer,
    content text NOT NULL,
    category text,
    crop_type text,
    embedding public.vector(1536) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    billing_email text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_status text DEFAULT 'trialing'::text NOT NULL,
    farm_seats integer DEFAULT 3 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizations_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text])))
);


--
-- Name: pest_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pest_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    block_id text NOT NULL,
    pest_name text NOT NULL,
    common_name text NOT NULL,
    risk_level public.health_status DEFAULT 'green'::public.health_status NOT NULL,
    observed_count text,
    stage public.pest_stage DEFAULT 'Monitoring'::public.pest_stage NOT NULL,
    source public.data_source DEFAULT 'manual'::public.data_source NOT NULL,
    last_seen date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: phenology_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phenology_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.data_source DEFAULT 'computed'::public.data_source NOT NULL,
    current_stage public.growth_stage NOT NULL,
    stage_description text,
    cumulative_gdd numeric(7,1),
    chill_hours numeric(7,1),
    bud_break_date date,
    estimated_harvest_start date,
    estimated_harvest_end date,
    days_to_hull_split smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: phenology_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.phenology_latest WITH (security_invoker='true') AS
 SELECT DISTINCT ON (block_id) id,
    block_id,
    recorded_at,
    source,
    current_stage,
    stage_description,
    cumulative_gdd,
    chill_hours,
    bud_break_date,
    estimated_harvest_start,
    estimated_harvest_end,
    days_to_hull_split,
    created_at
   FROM public.phenology_records
  ORDER BY block_id, recorded_at DESC;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    farm_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text,
    category public.recommendation_category NOT NULL,
    title text NOT NULL,
    rationale text NOT NULL,
    confidence numeric(4,3),
    status public.recommendation_status DEFAULT 'pending'::public.recommendation_status NOT NULL,
    manager_note text,
    acted_by uuid,
    acted_at timestamp with time zone,
    activity_log_id uuid,
    llm_model text,
    llm_prompt_hash text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    farm_id uuid NOT NULL,
    sources jsonb,
    CONSTRAINT recommendations_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- Name: scouting_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scouting_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text NOT NULL,
    scouted_at timestamp with time zone DEFAULT now() NOT NULL,
    next_scouting date,
    overall_risk public.health_status DEFAULT 'green'::public.health_status NOT NULL,
    scout_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scouting_reports_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.scouting_reports_latest WITH (security_invoker='true') AS
 SELECT DISTINCT ON (block_id) id,
    block_id,
    scouted_at,
    next_scouting,
    overall_risk,
    scout_id,
    notes,
    created_at
   FROM public.scouting_reports
  ORDER BY block_id, scouted_at DESC;


--
-- Name: sensors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sensors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    farm_id uuid NOT NULL,
    block_id text,
    name text NOT NULL,
    device_id text NOT NULL,
    sensor_type text NOT NULL,
    api_key text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_seen_at timestamp with time zone,
    location_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sensors_sensor_type_check CHECK ((sensor_type = ANY (ARRAY['soil_moisture'::text, 'soil_ec'::text, 'soil_temp'::text, 'air_humidity'::text, 'wind'::text, 'rainfall'::text, 'multi'::text]))),
    CONSTRAINT sensors_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'unknown'::text])))
);


--
-- Name: soil_water_readings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soil_water_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.data_source DEFAULT 'sensor'::public.data_source NOT NULL,
    soil_moisture numeric(5,2),
    soil_ec numeric(5,2),
    root_zone_temp numeric(5,2),
    eto numeric(5,2),
    water_deficit numeric(7,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    test_type text DEFAULT 'soil'::text NOT NULL,
    ph numeric,
    lab_reference text,
    file_url text,
    notes text,
    parameters jsonb,
    sensor_id uuid
);


--
-- Name: soil_water_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.soil_water_latest AS
 SELECT DISTINCT ON (swr.block_id) swr.id,
    swr.block_id,
    swr.recorded_at,
    swr.source,
    swr.soil_moisture,
    swr.soil_ec,
    swr.root_zone_temp,
    swr.eto,
    swr.water_deficit,
    swr.created_at,
    b.field_capacity,
    b.wilting_point,
    swr.file_url,
    swr.lab_reference,
    swr.notes,
    swr.parameters,
    swr.ph,
    swr.test_type
   FROM (public.soil_water_readings swr
     JOIN public.blocks b ON ((b.id = swr.block_id)))
  ORDER BY swr.block_id, swr.recorded_at DESC;


--
-- Name: stripe_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_invoices (
    id text NOT NULL,
    organization_id uuid NOT NULL,
    amount_paid integer NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    hosted_invoice_url text,
    created_at timestamp with time zone NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tissue_samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tissue_samples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text NOT NULL,
    sampled_at date NOT NULL,
    lab_reference text,
    nutrients jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    entered_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tissue_samples_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tissue_samples_latest WITH (security_invoker='true') AS
 SELECT DISTINCT ON (block_id) id,
    block_id,
    sampled_at,
    lab_reference,
    nutrients,
    notes,
    entered_by,
    created_at
   FROM public.tissue_samples
  ORDER BY block_id, sampled_at DESC;


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    full_name text,
    phone text,
    role public.user_role DEFAULT 'worker'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weather_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.data_source DEFAULT 'forecast'::public.data_source NOT NULL,
    temp_c numeric(5,2),
    humidity_pct numeric(5,2),
    wind_kmh numeric(5,2),
    wind_direction text,
    rainfall_mm numeric(6,2),
    frost_risk boolean DEFAULT false NOT NULL,
    heat_stress_risk boolean DEFAULT false NOT NULL,
    forecast_json jsonb,
    rainfall_7d_mm numeric(6,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sensor_id uuid
);


--
-- Name: weather_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.weather_latest WITH (security_invoker='true') AS
 SELECT DISTINCT ON (COALESCE(block_id, '_farm'::text)) id,
    block_id,
    recorded_at,
    source,
    temp_c,
    humidity_pct,
    wind_kmh,
    wind_direction,
    rainfall_mm,
    frost_risk,
    heat_stress_risk,
    forecast_json,
    rainfall_7d_mm,
    created_at
   FROM public.weather_snapshots
  ORDER BY COALESCE(block_id, '_farm'::text), recorded_at DESC;


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: asset_maintenance_log asset_maintenance_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance_log
    ADD CONSTRAINT asset_maintenance_log_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: block_alerts block_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_alerts
    ADD CONSTRAINT block_alerts_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: calendar_event_materials calendar_event_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_materials
    ADD CONSTRAINT calendar_event_materials_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: consumable_usage_log consumable_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumable_usage_log
    ADD CONSTRAINT consumable_usage_log_pkey PRIMARY KEY (id);


--
-- Name: consumables consumables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumables
    ADD CONSTRAINT consumables_pkey PRIMARY KEY (id);


--
-- Name: farm_members farm_members_farm_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_members
    ADD CONSTRAINT farm_members_farm_id_user_id_key UNIQUE (farm_id, user_id);


--
-- Name: farm_members farm_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_members
    ADD CONSTRAINT farm_members_pkey PRIMARY KEY (id);


--
-- Name: farms farms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farms
    ADD CONSTRAINT farms_pkey PRIMARY KEY (id);


--
-- Name: fertigation_log fertigation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fertigation_log
    ADD CONSTRAINT fertigation_log_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_chunks knowledge_base_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_chunks
    ADD CONSTRAINT knowledge_base_chunks_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: organizations organizations_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: organizations organizations_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: pest_observations pest_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pest_observations
    ADD CONSTRAINT pest_observations_pkey PRIMARY KEY (id);


--
-- Name: phenology_records phenology_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phenology_records
    ADD CONSTRAINT phenology_records_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);


--
-- Name: scouting_reports scouting_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scouting_reports
    ADD CONSTRAINT scouting_reports_pkey PRIMARY KEY (id);


--
-- Name: sensors sensors_api_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensors
    ADD CONSTRAINT sensors_api_key_key UNIQUE (api_key);


--
-- Name: sensors sensors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensors
    ADD CONSTRAINT sensors_pkey PRIMARY KEY (id);


--
-- Name: soil_water_readings soil_water_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soil_water_readings
    ADD CONSTRAINT soil_water_readings_pkey PRIMARY KEY (id);


--
-- Name: stripe_invoices stripe_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_invoices
    ADD CONSTRAINT stripe_invoices_pkey PRIMARY KEY (id);


--
-- Name: tissue_samples tissue_samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tissue_samples
    ADD CONSTRAINT tissue_samples_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: weather_snapshots weather_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_snapshots
    ADD CONSTRAINT weather_snapshots_pkey PRIMARY KEY (id);


--
-- Name: blocks_farm_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocks_farm_id_idx ON public.blocks USING btree (farm_id);


--
-- Name: calendar_event_materials_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_event_materials_event_idx ON public.calendar_event_materials USING btree (calendar_event_id);


--
-- Name: farm_members_farm_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX farm_members_farm_id_idx ON public.farm_members USING btree (farm_id);


--
-- Name: farm_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX farm_members_user_id_idx ON public.farm_members USING btree (user_id);


--
-- Name: farms_creator_slug_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX farms_creator_slug_uidx ON public.farms USING btree (created_by, slug);


--
-- Name: idx_activity_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_block ON public.activity_log USING btree (block_id, performed_at DESC);


--
-- Name: idx_activity_performed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_performed ON public.activity_log USING btree (performed_at DESC);


--
-- Name: idx_activity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_type ON public.activity_log USING btree (activity_type, performed_at DESC);


--
-- Name: idx_asset_maintenance_log_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_maintenance_log_asset_id ON public.asset_maintenance_log USING btree (asset_id);


--
-- Name: idx_assets_farm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_farm_id ON public.assets USING btree (farm_id);


--
-- Name: idx_block_alerts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_alerts_active ON public.block_alerts USING btree (block_id) WHERE (resolved = false);


--
-- Name: idx_block_alerts_block_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_alerts_block_id ON public.block_alerts USING btree (block_id);


--
-- Name: idx_consumable_usage_log_consumable_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumable_usage_log_consumable_id ON public.consumable_usage_log USING btree (consumable_id);


--
-- Name: idx_consumables_farm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumables_farm_id ON public.consumables USING btree (farm_id);


--
-- Name: idx_farms_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_farms_organization_id ON public.farms USING btree (organization_id);


--
-- Name: idx_fertigation_block_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fertigation_block_date ON public.fertigation_log USING btree (block_id, applied_at DESC);


--
-- Name: idx_knowledge_base_chunks_crop_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_chunks_crop_type ON public.knowledge_base_chunks USING btree (crop_type);


--
-- Name: idx_knowledge_base_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_chunks_embedding ON public.knowledge_base_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_organization_members_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_org_id ON public.organization_members USING btree (organization_id);


--
-- Name: idx_organization_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_user_id ON public.organization_members USING btree (user_id);


--
-- Name: idx_pest_obs_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pest_obs_block ON public.pest_observations USING btree (block_id);


--
-- Name: idx_pest_obs_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pest_obs_report ON public.pest_observations USING btree (report_id);


--
-- Name: idx_phenology_block_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phenology_block_time ON public.phenology_records USING btree (block_id, recorded_at DESC);


--
-- Name: idx_ps_ep; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ps_ep ON public.push_subscriptions USING btree (endpoint);


--
-- Name: idx_ps_farm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ps_farm ON public.push_subscriptions USING btree (farm_id);


--
-- Name: idx_ps_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ps_user ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_recommendations_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_block ON public.recommendations USING btree (block_id, created_at DESC);


--
-- Name: idx_recommendations_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_category ON public.recommendations USING btree (category, status);


--
-- Name: idx_recommendations_farm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_farm_id ON public.recommendations USING btree (farm_id);


--
-- Name: idx_recommendations_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_pending ON public.recommendations USING btree (status, created_at DESC) WHERE (status = 'pending'::public.recommendation_status);


--
-- Name: idx_scouting_block_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scouting_block_date ON public.scouting_reports USING btree (block_id, scouted_at DESC);


--
-- Name: idx_sensors_api_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sensors_api_key ON public.sensors USING btree (api_key);


--
-- Name: idx_sensors_block_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sensors_block_id ON public.sensors USING btree (block_id);


--
-- Name: idx_sensors_farm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sensors_farm_id ON public.sensors USING btree (farm_id);


--
-- Name: idx_soil_water_block_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_soil_water_block_time ON public.soil_water_readings USING btree (block_id, recorded_at DESC);


--
-- Name: idx_stripe_invoices_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_invoices_organization_id ON public.stripe_invoices USING btree (organization_id);


--
-- Name: idx_swr_sensor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_swr_sensor_id ON public.soil_water_readings USING btree (sensor_id);


--
-- Name: idx_tissue_block_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tissue_block_date ON public.tissue_samples USING btree (block_id, sampled_at DESC);


--
-- Name: idx_weather_block_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weather_block_time ON public.weather_snapshots USING btree (block_id, recorded_at DESC);


--
-- Name: idx_weather_farmwide_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weather_farmwide_time ON public.weather_snapshots USING btree (recorded_at DESC) WHERE (block_id IS NULL);


--
-- Name: idx_ws_sensor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ws_sensor_id ON public.weather_snapshots USING btree (sensor_id);


--
-- Name: blocks blocks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blocks_updated_at BEFORE UPDATE ON public.blocks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: farms farms_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER farms_set_updated_at BEFORE UPDATE ON public.farms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_profiles user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_log activity_log_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: activity_log activity_log_calendar_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES public.calendar_events(id) ON DELETE SET NULL;


--
-- Name: activity_log activity_log_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id);


--
-- Name: asset_maintenance_log asset_maintenance_log_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance_log
    ADD CONSTRAINT asset_maintenance_log_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: assets assets_farm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;


--
-- Name: block_alerts block_alerts_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_alerts
    ADD CONSTRAINT block_alerts_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: blocks blocks_farm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;


--
-- Name: calendar_event_materials calendar_event_materials_calendar_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_materials
    ADD CONSTRAINT calendar_event_materials_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES public.calendar_events(id) ON DELETE CASCADE;


--
-- Name: calendar_event_materials calendar_event_materials_consumable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_materials
    ADD CONSTRAINT calendar_event_materials_consumable_id_fkey FOREIGN KEY (consumable_id) REFERENCES public.consumables(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id);


--
-- Name: calendar_events calendar_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: consumable_usage_log consumable_usage_log_calendar_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumable_usage_log
    ADD CONSTRAINT consumable_usage_log_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES public.calendar_events(id) ON DELETE SET NULL;


--
-- Name: consumable_usage_log consumable_usage_log_consumable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumable_usage_log
    ADD CONSTRAINT consumable_usage_log_consumable_id_fkey FOREIGN KEY (consumable_id) REFERENCES public.consumables(id) ON DELETE CASCADE;


--
-- Name: consumable_usage_log consumable_usage_log_logged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumable_usage_log
    ADD CONSTRAINT consumable_usage_log_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES auth.users(id);


--
-- Name: consumables consumables_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumables
    ADD CONSTRAINT consumables_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: consumables consumables_farm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumables
    ADD CONSTRAINT consumables_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;


--
-- Name: farm_members farm_members_farm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_members
    ADD CONSTRAINT farm_members_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;


--
-- Name: farm_members farm_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_members
    ADD CONSTRAINT farm_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: farms farms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farms
    ADD CONSTRAINT farms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: farms farms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farms
    ADD CONSTRAINT farms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: fertigation_log fertigation_log_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fertigation_log
    ADD CONSTRAINT fertigation_log_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: fertigation_log fertigation_log_calendar_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fertigation_log
    ADD CONSTRAINT fertigation_log_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES public.calendar_events(id) ON DELETE SET NULL;


--
-- Name: fertigation_log fertigation_log_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fertigation_log
    ADD CONSTRAINT fertigation_log_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES auth.users(id);


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pest_observations pest_observations_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pest_observations
    ADD CONSTRAINT pest_observations_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: pest_observations pest_observations_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pest_observations
    ADD CONSTRAINT pest_observations_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.scouting_reports(id) ON DELETE CASCADE;


--
-- Name: phenology_records phenology_records_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phenology_records
    ADD CONSTRAINT phenology_records_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_farm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recommendations recommendations_acted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_acted_by_fkey FOREIGN KEY (acted_by) REFERENCES auth.users(id);


--
-- Name: recommendations recommendations_activity_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_activity_log_id_fkey FOREIGN KEY (activity_log_id) REFERENCES public.activity_log(id) ON DELETE SET NULL;


--
-- Name: recommendations recommendations_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: recommendations recommendations_farm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;


--
-- Name: scouting_reports scouting_reports_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scouting_reports
    ADD CONSTRAINT scouting_reports_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: scouting_reports scouting_reports_scout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scouting_reports
    ADD CONSTRAINT scouting_reports_scout_id_fkey FOREIGN KEY (scout_id) REFERENCES auth.users(id);


--
-- Name: sensors sensors_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensors
    ADD CONSTRAINT sensors_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE SET NULL;


--
-- Name: sensors sensors_farm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensors
    ADD CONSTRAINT sensors_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;


--
-- Name: soil_water_readings soil_water_readings_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soil_water_readings
    ADD CONSTRAINT soil_water_readings_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: soil_water_readings soil_water_readings_sensor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soil_water_readings
    ADD CONSTRAINT soil_water_readings_sensor_id_fkey FOREIGN KEY (sensor_id) REFERENCES public.sensors(id) ON DELETE SET NULL;


--
-- Name: stripe_invoices stripe_invoices_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_invoices
    ADD CONSTRAINT stripe_invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tissue_samples tissue_samples_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tissue_samples
    ADD CONSTRAINT tissue_samples_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: tissue_samples tissue_samples_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tissue_samples
    ADD CONSTRAINT tissue_samples_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES auth.users(id);


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: weather_snapshots weather_snapshots_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_snapshots
    ADD CONSTRAINT weather_snapshots_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: weather_snapshots weather_snapshots_sensor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_snapshots
    ADD CONSTRAINT weather_snapshots_sensor_id_fkey FOREIGN KEY (sensor_id) REFERENCES public.sensors(id) ON DELETE SET NULL;


--
-- Name: soil_water_readings Admins and supervisors can insert soil water readings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can insert soil water readings" ON public.soil_water_readings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: block_alerts Admins and supervisors can manage alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can manage alerts" ON public.block_alerts TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: fertigation_log Admins and supervisors can manage fertigation log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can manage fertigation log" ON public.fertigation_log TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: phenology_records Admins and supervisors can manage phenology; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can manage phenology" ON public.phenology_records FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: tissue_samples Admins and supervisors can manage tissue samples; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can manage tissue samples" ON public.tissue_samples TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: scouting_reports Admins and supervisors can update scouting reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can update scouting reports" ON public.scouting_reports FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: activity_log Admins can delete activity log entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete activity log entries" ON public.activity_log FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::public.user_role)))));


--
-- Name: weather_snapshots Admins can manage weather snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage weather snapshots" ON public.weather_snapshots TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::public.user_role)))));


--
-- Name: activity_log Authenticated users can create activity log entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create activity log entries" ON public.activity_log FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: calendar_events Authenticated users can insert events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert events" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: blocks Authenticated users can manage blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage blocks" ON public.blocks USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: activity_log Authenticated users can view activity log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view activity log" ON public.activity_log FOR SELECT TO authenticated USING (true);


--
-- Name: block_alerts Authenticated users can view alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view alerts" ON public.block_alerts FOR SELECT TO authenticated USING (true);


--
-- Name: calendar_events Authenticated users can view all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all events" ON public.calendar_events FOR SELECT TO authenticated USING (true);


--
-- Name: blocks Authenticated users can view blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view blocks" ON public.blocks FOR SELECT TO authenticated USING (true);


--
-- Name: fertigation_log Authenticated users can view fertigation log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view fertigation log" ON public.fertigation_log FOR SELECT TO authenticated USING (true);


--
-- Name: pest_observations Authenticated users can view pest observations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view pest observations" ON public.pest_observations FOR SELECT TO authenticated USING (true);


--
-- Name: phenology_records Authenticated users can view phenology; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view phenology" ON public.phenology_records FOR SELECT TO authenticated USING (true);


--
-- Name: scouting_reports Authenticated users can view scouting reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view scouting reports" ON public.scouting_reports FOR SELECT TO authenticated USING (true);


--
-- Name: soil_water_readings Authenticated users can view soil water readings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view soil water readings" ON public.soil_water_readings FOR SELECT TO authenticated USING (true);


--
-- Name: tissue_samples Authenticated users can view tissue samples; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view tissue samples" ON public.tissue_samples FOR SELECT TO authenticated USING (true);


--
-- Name: weather_snapshots Authenticated users can view weather; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view weather" ON public.weather_snapshots FOR SELECT TO authenticated USING (true);


--
-- Name: calendar_events Users can insert their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own events" ON public.calendar_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: calendar_events Users can update their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own events" ON public.calendar_events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.user_profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: calendar_events Users can view their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own events" ON public.calendar_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.user_profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: pest_observations Workers and above can create pest observations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workers and above can create pest observations" ON public.pest_observations FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: scouting_reports Workers and above can create scouting reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workers and above can create scouting reports" ON public.scouting_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: sensors admins_write_sensors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_write_sensors ON public.sensors USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: asset_maintenance_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_maintenance_log ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: soil_water_readings auth_select_soil_water; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_select_soil_water ON public.soil_water_readings FOR SELECT TO authenticated USING (true);


--
-- Name: consumables authenticated_all_consumables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_all_consumables ON public.consumables TO authenticated USING (true);


--
-- Name: calendar_event_materials authenticated_all_event_materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_all_event_materials ON public.calendar_event_materials TO authenticated USING (true);


--
-- Name: consumable_usage_log authenticated_all_usage_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_all_usage_log ON public.consumable_usage_log TO authenticated USING (true);


--
-- Name: knowledge_base_chunks authenticated_read_knowledge_base; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read_knowledge_base ON public.knowledge_base_chunks FOR SELECT TO authenticated USING (true);


--
-- Name: block_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.block_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks blocks_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_delete ON public.blocks FOR DELETE USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE ((farm_members.user_id = auth.uid()) AND (farm_members.role = 'admin'::public.user_role)))));


--
-- Name: blocks blocks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_insert ON public.blocks FOR INSERT WITH CHECK ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE ((farm_members.user_id = auth.uid()) AND (farm_members.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: blocks blocks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_select ON public.blocks FOR SELECT USING (((farm_id IS NULL) OR (farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid())))));


--
-- Name: blocks blocks_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_update ON public.blocks FOR UPDATE USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE ((farm_members.user_id = auth.uid()) AND (farm_members.role = ANY (ARRAY['admin'::public.user_role, 'supervisor'::public.user_role]))))));


--
-- Name: calendar_event_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_event_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: consumable_usage_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumable_usage_log ENABLE ROW LEVEL SECURITY;

--
-- Name: consumables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumables ENABLE ROW LEVEL SECURITY;

--
-- Name: farm_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.farm_members ENABLE ROW LEVEL SECURITY;

--
-- Name: farm_members farm_members: admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farm_members: admin can delete" ON public.farm_members FOR DELETE USING ((farm_id IN ( SELECT fm2.farm_id
   FROM public.farm_members fm2
  WHERE ((fm2.user_id = auth.uid()) AND (fm2.role = 'admin'::public.user_role)))));


--
-- Name: farm_members farm_members: admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farm_members: admin can update" ON public.farm_members FOR UPDATE USING ((farm_id IN ( SELECT fm2.farm_id
   FROM public.farm_members fm2
  WHERE ((fm2.user_id = auth.uid()) AND (fm2.role = 'admin'::public.user_role)))));


--
-- Name: farm_members farm_members: auth can insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farm_members: auth can insert" ON public.farm_members FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: farm_members farm_members: own rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farm_members: own rows" ON public.farm_members FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: soil_water_readings farm_members_insert_soil_water; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_insert_soil_water ON public.soil_water_readings FOR INSERT TO authenticated WITH CHECK (((block_id IS NULL) OR (block_id IN ( SELECT b.id
   FROM (public.blocks b
     JOIN public.farm_members fm ON ((fm.farm_id = b.farm_id)))
  WHERE (fm.user_id = auth.uid())))));


--
-- Name: asset_maintenance_log farm_members_read_asset_maintenance_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_read_asset_maintenance_log ON public.asset_maintenance_log FOR SELECT USING ((asset_id IN ( SELECT assets.id
   FROM public.assets
  WHERE (assets.farm_id IN ( SELECT farm_members.farm_id
           FROM public.farm_members
          WHERE (farm_members.user_id = auth.uid()))))));


--
-- Name: assets farm_members_read_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_read_assets ON public.assets FOR SELECT USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: consumable_usage_log farm_members_read_consumable_usage_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_read_consumable_usage_log ON public.consumable_usage_log FOR SELECT USING ((consumable_id IN ( SELECT consumables.id
   FROM public.consumables
  WHERE (consumables.farm_id IN ( SELECT farm_members.farm_id
           FROM public.farm_members
          WHERE (farm_members.user_id = auth.uid()))))));


--
-- Name: consumables farm_members_read_consumables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_read_consumables ON public.consumables FOR SELECT USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: recommendations farm_members_read_recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_read_recommendations ON public.recommendations FOR SELECT USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: sensors farm_members_read_sensors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_read_sensors ON public.sensors FOR SELECT USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: soil_water_readings farm_members_select_soil_water; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_select_soil_water ON public.soil_water_readings FOR SELECT TO authenticated USING (((block_id IS NULL) OR (block_id IN ( SELECT b.id
   FROM (public.blocks b
     JOIN public.farm_members fm ON ((fm.farm_id = b.farm_id)))
  WHERE (fm.user_id = auth.uid())))));


--
-- Name: asset_maintenance_log farm_members_write_asset_maintenance_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_write_asset_maintenance_log ON public.asset_maintenance_log USING ((asset_id IN ( SELECT assets.id
   FROM public.assets
  WHERE (assets.farm_id IN ( SELECT farm_members.farm_id
           FROM public.farm_members
          WHERE (farm_members.user_id = auth.uid()))))));


--
-- Name: assets farm_members_write_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_write_assets ON public.assets USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: consumable_usage_log farm_members_write_consumable_usage_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_write_consumable_usage_log ON public.consumable_usage_log USING ((consumable_id IN ( SELECT consumables.id
   FROM public.consumables
  WHERE (consumables.farm_id IN ( SELECT farm_members.farm_id
           FROM public.farm_members
          WHERE (farm_members.user_id = auth.uid()))))));


--
-- Name: consumables farm_members_write_consumables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_write_consumables ON public.consumables USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: recommendations farm_members_write_recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farm_members_write_recommendations ON public.recommendations USING ((farm_id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: farms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;

--
-- Name: farms farms: admin can delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farms: admin can delete" ON public.farms FOR DELETE USING ((id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE ((farm_members.user_id = auth.uid()) AND (farm_members.role = 'admin'::public.user_role)))));


--
-- Name: farms farms: admin can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farms: admin can update" ON public.farms FOR UPDATE USING ((id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE ((farm_members.user_id = auth.uid()) AND (farm_members.role = 'admin'::public.user_role)))));


--
-- Name: farms farms: auth can create; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farms: auth can create" ON public.farms FOR INSERT WITH CHECK ((auth.uid() = created_by));


--
-- Name: farms farms: members can read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "farms: members can read" ON public.farms FOR SELECT USING ((id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: farms farms_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farms_delete ON public.farms FOR DELETE USING ((id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE ((farm_members.user_id = auth.uid()) AND (farm_members.role = 'admin'::public.user_role)))));


--
-- Name: farms farms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farms_insert ON public.farms FOR INSERT WITH CHECK ((created_by = auth.uid()));


--
-- Name: farms farms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farms_select ON public.farms FOR SELECT USING ((id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE (farm_members.user_id = auth.uid()))));


--
-- Name: farms farms_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY farms_update ON public.farms FOR UPDATE USING ((id IN ( SELECT farm_members.farm_id
   FROM public.farm_members
  WHERE ((farm_members.user_id = auth.uid()) AND (farm_members.role = 'admin'::public.user_role)))));


--
-- Name: fertigation_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fertigation_log ENABLE ROW LEVEL SECURITY;

--
-- Name: farm_members fm_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fm_delete ON public.farm_members FOR DELETE USING (((user_id = auth.uid()) OR (farm_id IN ( SELECT fm2.farm_id
   FROM public.farm_members fm2
  WHERE ((fm2.user_id = auth.uid()) AND (fm2.role = 'admin'::public.user_role))))));


--
-- Name: farm_members fm_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fm_insert_self ON public.farm_members FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: farm_members fm_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fm_select ON public.farm_members FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: farm_members fm_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fm_update_admin ON public.farm_members FOR UPDATE USING ((farm_id IN ( SELECT fm2.farm_id
   FROM public.farm_members fm2
  WHERE ((fm2.user_id = auth.uid()) AND (fm2.role = 'admin'::public.user_role)))));


--
-- Name: knowledge_base_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members members_read_organization_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_read_organization_members ON public.organization_members FOR SELECT USING ((organization_id IN ( SELECT organization_members_1.organization_id
   FROM public.organization_members organization_members_1
  WHERE (organization_members_1.user_id = auth.uid()))));


--
-- Name: organizations members_read_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_read_organizations ON public.organizations FOR SELECT USING ((id IN ( SELECT organization_members.organization_id
   FROM public.organization_members
  WHERE (organization_members.user_id = auth.uid()))));


--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: pest_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pest_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: phenology_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.phenology_records ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: scouting_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scouting_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: sensors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sensors ENABLE ROW LEVEL SECURITY;

--
-- Name: soil_water_readings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.soil_water_readings ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: tissue_samples; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tissue_samples ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions users_own_push_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_own_push_subscriptions ON public.push_subscriptions USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: weather_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weather_snapshots ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict ZGjdcvTISJprNEjGBW65gtRBl9K5oCuECcFDS3dhNvInRUTWPjsDjYBTzGjA69U

