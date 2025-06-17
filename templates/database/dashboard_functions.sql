-- Dashboard function to get inventory statistics
CREATE OR REPLACE FUNCTION public.get_dashboard_inventory_stats(company_id UUID)
RETURNS TABLE(
  total_items INTEGER,
  active_groups INTEGER,
  active_items INTEGER,
  available_groups INTEGER,
  available_items INTEGER,
  reserved_groups INTEGER,
  reserved_items INTEGER,
  in_warehouse_groups INTEGER,
  in_warehouse_items INTEGER,
  top_items JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH inventory_stats AS (
    SELECT 
      -- Total inventory groups
      COUNT(DISTINCT inv.uuid) as total_inventory_groups,
      
      -- Active groups (have items)
      COUNT(DISTINCT CASE WHEN (inv.count->>'total')::INTEGER > 0 THEN inv.uuid END) as active_groups_count,
      
      -- Total items across all groups
      COALESCE(SUM((inv.count->>'total')::INTEGER), 0) as total_items_count,
      
      -- Available items (not in warehouse or used)
      COALESCE(SUM((inv.count->>'available')::INTEGER), 0) as available_items_count,
      
      -- Items in warehouse
      COALESCE(SUM((inv.count->>'warehouse')::INTEGER), 0) as warehouse_items_count,
      
      -- Available groups (have available items)
      COUNT(DISTINCT CASE WHEN (inv.count->>'available')::INTEGER > 0 THEN inv.uuid END) as available_groups_count,
      
      -- Reserved/Used groups and items
      COUNT(DISTINCT CASE WHEN (inv.count->>'inventory')::INTEGER > (inv.count->>'available')::INTEGER THEN inv.uuid END) as reserved_groups_count,
      COALESCE(SUM((inv.count->>'inventory')::INTEGER - (inv.count->>'available')::INTEGER), 0) as reserved_items_count,
      
      -- Warehouse groups (have items in warehouse)
      COUNT(DISTINCT CASE WHEN (inv.count->>'warehouse')::INTEGER > 0 THEN inv.uuid END) as warehouse_groups_count
    FROM inventory inv
    WHERE inv.company_uuid = company_id
  ),
  top_inventory_items AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'uuid', inv.uuid,
        'name', inv.name,
        'unit', inv.standard_unit,
        'group_count', (inv.count->>'total')::INTEGER,
        'total_group_value', (inv.unit_values->>'total')::NUMERIC,
        'available_count', (inv.count->>'available')::INTEGER,
        'item_statuses', CASE 
          WHEN (inv.count->>'available')::INTEGER = 0 THEN 'OUT_OF_STOCK'
          WHEN (inv.count->>'available')::INTEGER <= 5 THEN 'LOW_STOCK' 
          ELSE 'IN_STOCK'
        END
      ) ORDER BY (inv.count->>'total')::INTEGER DESC
    ) as top_items_json
    FROM inventory inv
    WHERE inv.company_uuid = company_id
      AND (inv.count->>'total')::INTEGER > 0
    LIMIT 10
  )
  SELECT 
    s.total_items_count::INTEGER,
    s.active_groups_count::INTEGER,
    s.total_items_count::INTEGER as active_items_total,
    s.available_groups_count::INTEGER,
    s.available_items_count::INTEGER,
    s.reserved_groups_count::INTEGER,
    s.reserved_items_count::INTEGER,
    s.warehouse_groups_count::INTEGER,
    s.warehouse_items_count::INTEGER,
    COALESCE(t.top_items_json, '[]'::jsonb)
  FROM inventory_stats s
  CROSS JOIN top_inventory_items t;
END;
$$;

-- Dashboard function to get delivery counts
CREATE OR REPLACE FUNCTION public.get_dashboard_delivery_counts(company_id UUID)
RETURNS TABLE(
  total_deliveries INTEGER,
  pending_deliveries INTEGER,
  in_transit_deliveries INTEGER,
  delivered_deliveries INTEGER,
  recent_deliveries JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH delivery_stats AS (
    SELECT 
      COUNT(*)::INTEGER as total_count,
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::INTEGER as pending_count,
      COUNT(CASE WHEN status IN ('PROCESSING', 'IN_TRANSIT') THEN 1 END)::INTEGER as in_transit_count,
      COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END)::INTEGER as delivered_count
    FROM delivery_items
    WHERE company_uuid = company_id
  ),
  recent_delivery_list AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'uuid', di.uuid,
        'name', di.name,
        'delivery_address', di.delivery_address,
        'delivery_date', di.delivery_date,
        'status', di.status,
        'created_at', di.created_at,
        'items_count', jsonb_object_length(di.inventory_items)
      ) ORDER BY di.created_at DESC
    ) as recent_deliveries_json
    FROM delivery_items di
    WHERE di.company_uuid = company_id
    ORDER BY di.created_at DESC
    LIMIT 5
  )
  SELECT 
    s.total_count,
    s.pending_count,
    s.in_transit_count,
    s.delivered_count,
    COALESCE(r.recent_deliveries_json, '[]'::jsonb)
  FROM delivery_stats s
  CROSS JOIN recent_delivery_list r;
END;
$$;

-- Dashboard function to get delivery performance metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_delivery_performance(company_id UUID)
RETURNS TABLE(
  on_time_percentage NUMERIC,
  average_delivery_time_days NUMERIC,
  total_delivered_this_month INTEGER,
  delivery_trends JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH delivery_performance AS (
    SELECT 
      -- On-time delivery percentage (delivered on or before scheduled date)
      CASE 
        WHEN COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) > 0
        THEN ROUND(
          COUNT(CASE WHEN status = 'DELIVERED' AND updated_at::date <= delivery_date THEN 1 END)::NUMERIC 
          / COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END)::NUMERIC * 100, 2
        )
        ELSE 0
      END as on_time_pct,
      
      -- Average delivery time in days
      COALESCE(AVG(
        CASE WHEN status = 'DELIVERED' 
        THEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400 
        END
      ), 0) as avg_delivery_days,
      
      -- Deliveries this month
      COUNT(CASE 
        WHEN status = 'DELIVERED' 
        AND EXTRACT(MONTH FROM updated_at) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM updated_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        THEN 1 
      END)::INTEGER as this_month_delivered
    FROM delivery_items
    WHERE company_uuid = company_id
  ),
  monthly_trends AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'month', TO_CHAR(date_trunc('month', updated_at), 'YYYY-MM'),
        'delivered_count', COUNT(*)
      ) ORDER BY date_trunc('month', updated_at) DESC
    ) as trends_json
    FROM delivery_items
    WHERE company_uuid = company_id
      AND status = 'DELIVERED'
      AND updated_at >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY date_trunc('month', updated_at)
    LIMIT 6
  )
  SELECT 
    p.on_time_pct,
    ROUND(p.avg_delivery_days, 2),
    p.this_month_delivered,
    COALESCE(t.trends_json, '[]'::jsonb)
  FROM delivery_performance p
  CROSS JOIN monthly_trends t;
END;
$$;

-- Dashboard function to get monthly revenue
CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_revenue(company_id UUID)
RETURNS TABLE(
  current_month_revenue NUMERIC,
  previous_month_revenue NUMERIC,
  revenue_change_percentage NUMERIC,
  monthly_breakdown JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH monthly_revenue AS (
    SELECT 
      -- Current month revenue from delivered items
      COALESCE(SUM(
        CASE 
          WHEN EXTRACT(MONTH FROM di.updated_at) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM di.updated_at) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND di.status = 'DELIVERED'
          THEN (
            SELECT SUM((ii.cost * ii.unit_value))
            FROM jsonb_object_keys(di.inventory_items) as item_key
            JOIN inventory_items ii ON ii.uuid = item_key::uuid
          )
          ELSE 0
        END
      ), 0) as current_month,
      
      -- Previous month revenue
      COALESCE(SUM(
        CASE 
          WHEN date_trunc('month', di.updated_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
          AND di.status = 'DELIVERED'
          THEN (
            SELECT SUM((ii.cost * ii.unit_value))
            FROM jsonb_object_keys(di.inventory_items) as item_key
            JOIN inventory_items ii ON ii.uuid = item_key::uuid
          )
          ELSE 0
        END
      ), 0) as previous_month
    FROM delivery_items di
    WHERE di.company_uuid = company_id
  ),
  revenue_breakdown AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'month', TO_CHAR(date_trunc('month', di.updated_at), 'YYYY-MM'),
        'revenue', SUM(
          (SELECT SUM((ii.cost * ii.unit_value))
           FROM jsonb_object_keys(di.inventory_items) as item_key
           JOIN inventory_items ii ON ii.uuid = item_key::uuid)
        ),
        'deliveries_count', COUNT(*)
      ) ORDER BY date_trunc('month', di.updated_at) DESC
    ) as breakdown_json
    FROM delivery_items di
    WHERE di.company_uuid = company_id
      AND di.status = 'DELIVERED'
      AND di.updated_at >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY date_trunc('month', di.updated_at)
    LIMIT 12
  )
  SELECT 
    r.current_month,
    r.previous_month,
    CASE 
      WHEN r.previous_month > 0 
      THEN ROUND(((r.current_month - r.previous_month) / r.previous_month * 100), 2)
      ELSE 0
    END as change_pct,
    COALESCE(b.breakdown_json, '[]'::jsonb)
  FROM monthly_revenue r
  CROSS JOIN revenue_breakdown b;
END;
$$;

-- Dashboard function to get recent notifications
CREATE OR REPLACE FUNCTION public.get_dashboard_recent_notifications(company_id UUID)
RETURNS TABLE(
  unread_count INTEGER,
  critical_notifications JSONB,
  recent_notifications JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH notification_stats AS (
    SELECT 
      COUNT(CASE WHEN NOT read THEN 1 END)::INTEGER as unread_total
    FROM notifications
    WHERE company_uuid = company_id
  ),
  critical_notifs AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'type', n.type,
        'action', n.action,
        'entity_name', n.entity_name,
        'details', n.details,
        'created_at', n.created_at,
        'is_admin_only', n.is_admin_only
      ) ORDER BY n.created_at DESC
    ) as critical_json
    FROM notifications n
    WHERE n.company_uuid = company_id
      AND (
        n.type = 'reorder_point_logs' OR
        (n.action = 'status_change' AND n.details->>'new_status' IN ('CRITICAL', 'OUT_OF_STOCK'))
      )
      AND n.created_at >= CURRENT_DATE - INTERVAL '7 days'
    LIMIT 5
  ),
  recent_notifs AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'type', n.type,
        'action', n.action,
        'entity_name', n.entity_name,
        'user_name', n.user_name,
        'created_at', n.created_at,
        'read', n.read
      ) ORDER BY n.created_at DESC
    ) as recent_json
    FROM notifications n
    WHERE n.company_uuid = company_id
    ORDER BY n.created_at DESC
    LIMIT 10
  )
  SELECT 
    s.unread_total,
    COALESCE(c.critical_json, '[]'::jsonb),
    COALESCE(r.recent_json, '[]'::jsonb)
  FROM notification_stats s
  CROSS JOIN critical_notifs c
  CROSS JOIN recent_notifs r;
END;
$$;

-- Dashboard function to get reorder point alerts
CREATE OR REPLACE FUNCTION public.get_dashboard_reorder_points(company_id UUID)
RETURNS TABLE(
  critical_count INTEGER,
  warning_count INTEGER,
  out_of_stock_count INTEGER,
  items JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH reorder_stats AS (
    SELECT 
      COUNT(CASE WHEN status = 'CRITICAL' THEN 1 END)::INTEGER as critical_total,
      COUNT(CASE WHEN status = 'WARNING' THEN 1 END)::INTEGER as warning_total,
      COUNT(CASE WHEN status = 'OUT_OF_STOCK' THEN 1 END)::INTEGER as out_of_stock_total
    FROM reorder_point_logs rpl
    WHERE rpl.company_uuid = company_id
  ),
  reorder_items AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'uuid', rpl.uuid,
        'warehouse_name', w.name,
        'inventory_name', COALESCE(inv.name, wi.name),
        'current_stock', rpl.current_stock,
        'reorder_point', rpl.reorder_point,
        'status', rpl.status,
        'unit', rpl.unit,
        'updated_at', rpl.updated_at
      ) ORDER BY 
        CASE 
          WHEN rpl.status = 'OUT_OF_STOCK' THEN 1
          WHEN rpl.status = 'CRITICAL' THEN 2
          WHEN rpl.status = 'WARNING' THEN 3
          ELSE 4
        END,
        rpl.updated_at DESC
    ) as items_json
    FROM reorder_point_logs rpl
    LEFT JOIN warehouses w ON rpl.warehouse_uuid = w.uuid
    LEFT JOIN inventory inv ON rpl.inventory_uuid = inv.uuid
    LEFT JOIN warehouse_inventory wi ON rpl.warehouse_inventory_uuid = wi.uuid
    WHERE rpl.company_uuid = company_id
      AND rpl.status IN ('CRITICAL', 'WARNING', 'OUT_OF_STOCK')
    LIMIT 20
  )
  SELECT 
    s.critical_total,
    s.warning_total,
    s.out_of_stock_total,
    COALESCE(i.items_json, '[]'::jsonb)
  FROM reorder_stats s
  CROSS JOIN reorder_items i;
END;
$$;

-- Dashboard function to get warehouse items statistics
CREATE OR REPLACE FUNCTION public.get_dashboard_warehouse_items_stats(company_id UUID)
RETURNS TABLE(
  total_count INTEGER,
  available_count INTEGER,
  used_count INTEGER,
  transferred_count INTEGER,
  by_warehouse JSONB,
  by_status JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH warehouse_stats AS (
    SELECT 
      COUNT(*)::INTEGER as total_items,
      COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END)::INTEGER as available_items,
      COUNT(CASE WHEN status = 'USED' THEN 1 END)::INTEGER as used_items,
      COUNT(CASE WHEN status = 'TRANSFERRED' THEN 1 END)::INTEGER as transferred_items
    FROM warehouse_inventory_items wii
    WHERE wii.company_uuid = company_id
  ),
  warehouse_breakdown AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'warehouse_uuid', w.uuid,
        'warehouse_name', w.name,
        'item_count', COUNT(wii.uuid),
        'available_count', COUNT(CASE WHEN wii.status = 'AVAILABLE' THEN 1 END),
        'used_count', COUNT(CASE WHEN wii.status = 'USED' THEN 1 END)
      ) ORDER BY COUNT(wii.uuid) DESC
    ) as warehouse_json
    FROM warehouses w
    LEFT JOIN warehouse_inventory_items wii ON w.uuid = wii.warehouse_uuid AND wii.company_uuid = company_id
    WHERE w.company_uuid = company_id
    GROUP BY w.uuid, w.name
    HAVING COUNT(wii.uuid) > 0
  ),
  status_breakdown AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'status', wii.status,
        'count', COUNT(*),
        'percentage', ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () * 100, 2)
      ) ORDER BY COUNT(*) DESC
    ) as status_json
    FROM warehouse_inventory_items wii
    WHERE wii.company_uuid = company_id
    GROUP BY wii.status
  )
  SELECT 
    s.total_items,
    s.available_items,
    s.used_items,
    s.transferred_items,
    COALESCE(w.warehouse_json, '[]'::jsonb),
    COALESCE(st.status_json, '[]'::jsonb)
  FROM warehouse_stats s
  CROSS JOIN warehouse_breakdown w
  CROSS JOIN status_breakdown st;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_dashboard_inventory_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_delivery_counts TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_delivery_performance TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_monthly_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_reorder_points TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_warehouse_items_stats TO authenticated;