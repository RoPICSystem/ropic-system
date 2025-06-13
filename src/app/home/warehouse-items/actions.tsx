"use server";

import { ShelfLocation } from "@/components/shelf-selector-3d";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export type StatusHistory = Record<string, string>; 

interface WarehouseInventoryItem {
  uuid: string;
  company_uuid: string;
  admin_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string;
  group_id: string | null;
  item_code: string;
  unit: string;
  unit_value: string;
  packaging_unit: string;
  cost: number;
  properties: Record<string, any>;
  location: Record<string, any>;
  status: 'AVAILABLE' | 'USED' | 'TRANSFERRED';
  status_history: StatusHistory;
  created_at: string;
  updated_at: string;
}

interface WarehouseInventory {
  uuid: string;
  company_uuid: string;
  admin_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string;
  name: string;
  description?: string;
  measurement_unit: string;
  standard_unit: string;
  unit_values: {
    available: number;
    used: number;
    transferred: number;
    total: number;
  };
  count: {
    available: number;
    used: number;
    transferred: number;
    total: number;
  };
  properties: Record<string, any>;
  status: 'AVAILABLE' | 'WARNING' | 'CRITICAL' | 'USED';
  status_history: StatusHistory;
  created_at: string;
  updated_at: string;
}


