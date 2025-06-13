-- Create wearehosue_inventory table
CREATE TABLE IF NOT EXISTS public.warehouse_inventory (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  warehouse_uuid UUID not null REFERENCES public.warehouses (uuid) on delete CASCADE,
  inventory_uuid UUID not null REFERENCES public.inventory (uuid) on delete CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  measurement_unit TEXT NOT NULL,
  standard_unit TEXT NOT NULL,
  unit_values JSONB DEFAULT '{"available": 0, "used": 0, "transferred": 0, "total": 0}'::jsonb, -- Aggregated unit values
  count JSONB DEFAULT '{"available": 0, "used": 0, "transferred": 0, "total": 0}'::jsonb, -- Aggregated counts
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

-- Function to update warehouse inventory aggregations
CREATE OR REPLACE FUNCTION update_warehouse_inventory_aggregations(p_warehouse_inventory_uuid uuid)
RETURNS VOID AS $$
DECLARE
    wh_inv_record RECORD;
    total_unit_values RECORD;
    total_counts RECORD;
    total_costs RECORD;
BEGIN
    -- Skip if warehouse inventory UUID is null
    IF p_warehouse_inventory_uuid IS NULL THEN
        RETURN;
    END IF;

    -- Get warehouse inventory record to access standard_unit
    SELECT standard_unit INTO wh_inv_record FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid;
    
    IF wh_inv_record IS NULL THEN
        RETURN;
    END IF;

    -- Calculate aggregated unit values (converted to standard unit)
    SELECT 
        COALESCE(SUM(CASE 
            WHEN wii.status = 'AVAILABLE' 
            THEN public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit) 
            ELSE 0 
        END), 0) as available,
        COALESCE(SUM(CASE 
            WHEN wii.status = 'USED' 
            THEN public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit) 
            ELSE 0 
        END), 0) as used,
        COALESCE(SUM(CASE 
            WHEN wii.status = 'TRANSFERRED' 
            THEN public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit) 
            ELSE 0 
        END), 0) as transferred,
        COALESCE(SUM(public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit)), 0) as total
    INTO total_unit_values
    FROM warehouse_inventory_items wii
    WHERE wii.warehouse_uuid = (SELECT warehouse_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid)
      AND wii.inventory_uuid = (SELECT inventory_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid);

    -- Calculate aggregated counts
    SELECT 
        COALESCE(COUNT(CASE WHEN wii.status = 'AVAILABLE' THEN 1 END), 0) as available,
        COALESCE(COUNT(CASE WHEN wii.status = 'USED' THEN 1 END), 0) as used,
        COALESCE(COUNT(CASE WHEN wii.status = 'TRANSFERRED' THEN 1 END), 0) as transferred,
        COALESCE(COUNT(*), 0) as total
    INTO total_counts
    FROM warehouse_inventory_items wii
    WHERE wii.warehouse_uuid = (SELECT warehouse_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid)
      AND wii.inventory_uuid = (SELECT inventory_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid);

    -- Calculate aggregated costs
    SELECT 
        COALESCE(SUM(CASE WHEN wii.status = 'AVAILABLE' THEN wii.cost ELSE 0 END), 0) as available,
        COALESCE(SUM(CASE WHEN wii.status = 'USED' THEN wii.cost ELSE 0 END), 0) as used,
        COALESCE(SUM(CASE WHEN wii.status = 'TRANSFERRED' THEN wii.cost ELSE 0 END), 0) as transferred,
        COALESCE(SUM(wii.cost), 0) as total
    INTO total_costs
    FROM warehouse_inventory_items wii
    WHERE wii.warehouse_uuid = (SELECT warehouse_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid)
      AND wii.inventory_uuid = (SELECT inventory_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid);

    -- Update the warehouse inventory table with aggregated values
    UPDATE warehouse_inventory 
    SET 
        unit_values = jsonb_build_object(
            'available', total_unit_values.available,
            'used', total_unit_values.used,
            'transferred', total_unit_values.transferred,
            'total', total_unit_values.total
        ),
        count = jsonb_build_object(
            'available', total_counts.available,
            'used', total_counts.used,
            'transferred', total_counts.transferred,
            'total', total_counts.total
        ),
        properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
            'total_cost', jsonb_build_object(
                'available', total_costs.available,
                'used', total_costs.used,
                'transferred', total_costs.transferred,
                'total', total_costs.total
            )
        ),
        updated_at = NOW()
    WHERE uuid = p_warehouse_inventory_uuid;
END;
$$ LANGUAGE plpgsql;

-- Add trigger function for warehouse inventory items
CREATE OR REPLACE FUNCTION update_warehouse_inventory_aggregations_trigger()
RETURNS TRIGGER AS $$
DECLARE
    target_warehouse_inventory_uuid UUID;
BEGIN
    -- Find the warehouse inventory UUID for this warehouse and inventory combination
    IF TG_OP = 'DELETE' THEN
        SELECT uuid INTO target_warehouse_inventory_uuid
        FROM warehouse_inventory
        WHERE warehouse_uuid = OLD.warehouse_uuid AND inventory_uuid = OLD.inventory_uuid;
    ELSE
        SELECT uuid INTO target_warehouse_inventory_uuid
        FROM warehouse_inventory
        WHERE warehouse_uuid = NEW.warehouse_uuid AND inventory_uuid = NEW.inventory_uuid;
    END IF;

    -- Update aggregations if warehouse inventory exists
    IF target_warehouse_inventory_uuid IS NOT NULL THEN
        PERFORM update_warehouse_inventory_aggregations(target_warehouse_inventory_uuid);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for warehouse inventory items aggregation
DROP TRIGGER IF EXISTS trg_warehouse_inventory_items_aggregation ON warehouse_inventory_items;
CREATE TRIGGER trg_warehouse_inventory_items_aggregation
    AFTER INSERT OR UPDATE OR DELETE ON warehouse_inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION update_warehouse_inventory_aggregations_trigger();

-- Add policies for warehouse inventory
CREATE POLICY "warehouse_inventory_select_policy" ON public.warehouse_inventory
FOR SELECT TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "warehouse_inventory_insert_policy" ON public.warehouse_inventory
FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

CREATE POLICY "warehouse_inventory_update_policy" ON public.warehouse_inventory
FOR UPDATE TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "warehouse_inventory_delete_policy" ON public.warehouse_inventory
FOR DELETE TO authenticated
USING (
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);
