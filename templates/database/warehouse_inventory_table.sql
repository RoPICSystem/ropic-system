-- Create wearehosue_inventory table
CREATE TABLE IF NOT EXISTS public.warehouse_inventory (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  warehouse_uuid UUID not null REFERENCES public.warehouses (uuid) on delete CASCADE,
  inventory_uuid UUID not null REFERENCES public.inventory (uuid) on delete CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  measurement_unit TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  
  status TEXT DEFAULT 'AVAILABLE' check (
    status in ('AVAILABLE', 'WARNING', 'CRITICAL', 'USED')
  ),
  status_history JSONB DEFAULT '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_inventory REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_warehouse_inventory
BEFORE UPDATE ON public.warehouse_inventory
FOR EACH ROW
EXECUTE FUNCTION update_status_history();
