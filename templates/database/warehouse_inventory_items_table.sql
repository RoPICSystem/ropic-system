-- Create warehouse_inventory_items table
CREATE TABLE IF NOT EXISTS public.warehouse_inventory_items (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  warehouse_uuid UUID NOT NULL REFERENCES public.warehouses(uuid) ON DELETE CASCADE,
  inventory_uuid UUID NOT NULL REFERENCES public.inventory(uuid) ON DELETE CASCADE,
  inventory_item_uuid UUID NOT NULL REFERENCES public.inventory_items(uuid) ON DELETE CASCADE,
  delivery_uuid UUID not null REFERENCES public.delivery_items (uuid) on DELETE CASCADE,
  group_id TEXT,
  item_code TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_value TEXT NOT NULL,
  packaging_unit TEXT NOT NULL,
  cost NUMERIC DEFAULT 0,
  properties JSONB DEFAULT '{}'::jsonb,
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  status TEXT DEFAULT 'AVAILABLE' check (
    status in ('AVAILABLE', 'USED', 'TRANSFERRED')
  ),
  status_history JSONB DEFAULT '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

ALTER TABLE public.warehouse_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_inventory_items REPLICA IDENTITY FULL;

CREATE TRIGGER trg_update_status_history_warehouse_inventory_items
BEFORE UPDATE ON public.warehouse_inventory_items
FOR EACH ROW
EXECUTE FUNCTION update_status_history();

-- Add policies for warehouse inventory items
CREATE POLICY "warehouse_inventory_items_select_policy" ON public.warehouse_inventory_items
FOR SELECT TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "warehouse_inventory_items_insert_policy" ON public.warehouse_inventory_items
FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

CREATE POLICY "warehouse_inventory_items_update_policy" ON public.warehouse_inventory_items
FOR UPDATE TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "warehouse_inventory_items_delete_policy" ON public.warehouse_inventory_items
FOR DELETE TO authenticated
USING (
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);
