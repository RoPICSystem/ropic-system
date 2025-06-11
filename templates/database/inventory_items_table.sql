-- Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  inventory_uuid UUID NOT NULL REFERENCES public.inventory(uuid) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_value TEXT NOT NULL,
  packaging_unit TEXT NOT NULL,
  cost NUMERIC DEFAULT 0,
  properties JSONB DEFAULT '{}'::jsonb,

  status TEXT DEFAULT 'AVAILABLE' check (
    status in ('AVAILABLE', 'ON_DELIVERY', 'IN_WAREHOUSE', 'USED')
  ),
  status_history JSONB DEFAULT '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_inventory_items
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION update_status_history();



CREATE POLICY "Users can delete their company's inventory items" 
ON public.inventory_items FOR DELETE 
USING ((company_uuid IN ( SELECT profiles.company_uuid
  FROM public.profiles
WHERE (profiles.uuid = auth.uid()))));

CREATE POLICY "Users can insert their company's inventory items" 
ON public.inventory_items FOR INSERT 
WITH CHECK ((company_uuid IN (
   SELECT profiles.company_uuid
   FROM public.profiles
  WHERE (profiles.uuid = auth.uid()))));

CREATE POLICY "Users can update their company's inventory items" 
ON public.inventory_items FOR UPDATE 
USING ((company_uuid IN ( 
  SELECT profiles.company_uuid
   FROM public.profiles
  WHERE (profiles.uuid = auth.uid())))) 
WITH CHECK ((company_uuid IN ( SELECT profiles.company_uuid
   FROM public.profiles
  WHERE (profiles.uuid = auth.uid()))));


CREATE POLICY "Users can view their company's inventory items" 
ON public.inventory_items FOR SELECT 
USING ((company_uuid IN ( 
  SELECT profiles.company_uuid
   FROM public.profiles
  WHERE (profiles.uuid = auth.uid()))));