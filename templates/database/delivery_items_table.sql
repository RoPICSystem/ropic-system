-- Create delivery_items table
CREATE TABLE IF NOT EXISTS public.delivery_items (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  warehouse_uuid UUID NOT NULL REFERENCES public.warehouses(uuid) ON DELETE SET NULL,
  inventory_item_uuid UUID NOT NULL REFERENCES public.inventory(uuid) ON DELETE CASCADE,
  name TEXT,
  delivery_address TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  locations JSONB[] DEFAULT '{}'::jsonb[],
  operator_uuids uuid[],
  notes TEXT,
  
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CONFIRMED', 'CANCELLED')),
  status_history JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_delivery_items
BEFORE UPDATE ON public.delivery_items
FOR EACH ROW
EXECUTE FUNCTION update_status_history();
