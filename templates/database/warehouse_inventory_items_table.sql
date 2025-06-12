-- Create iwarehouse_nventory_items table
CREATE TABLE IF NOT EXISTS public.warehouse_inventory_items (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  warehouse_uuid UUID NOT NULL REFERENCES public.warehouses(uuid) ON DELETE CASCADE,
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  inventory_uuid UUID NOT NULL REFERENCES public.inventory(uuid) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_value TEXT NOT NULL,
  packaging_unit TEXT NOT NULL,
  cost NUMERIC DEFAULT 0,
  description TEXT,
  properties JSONB DEFAULT '{}'::jsonb,
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  status TEXT DEFAULT 'AVAILABLE' check (
    status in ('AVAILABLE', 'USED')
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