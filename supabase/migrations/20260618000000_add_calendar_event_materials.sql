-- Junction table: planned consumable materials for calendar tasks
CREATE TABLE IF NOT EXISTS public.calendar_event_materials (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id  UUID        NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  consumable_id      UUID        NOT NULL REFERENCES public.consumables(id)      ON DELETE CASCADE,
  planned_quantity   NUMERIC     NOT NULL CHECK (planned_quantity > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX calendar_event_materials_event_idx
  ON public.calendar_event_materials (calendar_event_id);

ALTER TABLE public.calendar_event_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_members_select_event_materials"
  ON public.calendar_event_materials FOR SELECT
  USING (
    calendar_event_id IN (
      SELECT ce.id FROM public.calendar_events ce
      LEFT JOIN public.blocks b ON b.id = ce.block_id
      WHERE b.farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
         OR ce.block_id IS NULL
    )
  );

CREATE POLICY "farm_members_write_event_materials"
  ON public.calendar_event_materials FOR ALL
  USING (
    calendar_event_id IN (
      SELECT ce.id FROM public.calendar_events ce
      LEFT JOIN public.blocks b ON b.id = ce.block_id
      WHERE b.farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
         OR ce.block_id IS NULL
    )
  );
