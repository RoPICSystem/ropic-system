"use client";

import { Button, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { ExportPopover, FilterOption, ExportOption } from "@/components/export-popover/export-popover";
import { format } from "date-fns";
import { InventoryStatus } from "./actions";

interface ReorderPointExportPopoverProps {
  user: any;
  warehouses: any[];
  warehouseInventoryItems: any[];
  isPdfGenerating: boolean;
  onExport: (data: {
    selectedItems: string[];
    searchQuery: string;
    filters: Record<string, any>;
    dateFilters: Record<string, any>;
    exportOptions: Record<string, any>;
    allFilteredItems: any[];
  }) => Promise<void>;
}

export function ReorderPointExportPopover({
  user,
  warehouses,
  warehouseInventoryItems,
  isPdfGenerating,
  onExport
}: ReorderPointExportPopoverProps) {
  // Helper function to get status color
  const getStatusColor = (status: InventoryStatus): "success" | "warning" | "danger" | "default" => {
    switch (status) {
      case "IN_STOCK": return "success";
      case "WARNING": return "warning";
      case "CRITICAL": return "danger";
      case "OUT_OF_STOCK": return "danger";
      default: return "default";
    }
  };

  // Format date helper function
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  // Define filters for reorder points
  const reorderPointFilters: Record<string, FilterOption> = {
    warehouse_filter: {
      name: "Warehouse",
      valueName: "warehouse_uuid",
      color: "primary",
      filters: warehouses.reduce(
        (acc, warehouse) => ({
          ...acc,
          [warehouse.uuid]: warehouse.name
        }),
        { "": "All Warehouses" }
      )
    },
    status_filter: {
      name: "Status",
      valueName: "status",
      color: "secondary",
      filters: {
        "": "All Statuses",
        "IN_STOCK": "In Stock",
        "WARNING": "Warning",
        "CRITICAL": "Critical",
        "OUT_OF_STOCK": "Out of Stock"
      }
    }
  };

  // Define export options
  const exportOptions: ExportOption[] = [
    {
      key: "pageSize",
      label: "Page Size",
      description: "Select the page size for the PDF export",
      type: "select",
      defaultValue: "A4",
      options: [
        { key: "A4", label: "A4 (210 × 297 mm)" },
        { key: "A3", label: "A3 (297 × 420 mm)" },
        { key: "LETTER", label: "Letter (8.5 × 11 in)" },
        { key: "LEGAL", label: "Legal (8.5 × 14 in)" }
      ]
    }
  ];

  return (
    <ExportPopover
      title="Export Reorder Point Report"
      description="Select items to include in the PDF report"
      tableName="reorder_point_logs"
      searchPlaceholder="Search reorder point items..."
      filters={reorderPointFilters}
      dateFilters={["dateRange", "weekFilter", "specificDate"]}
      exportOptions={exportOptions}
      companyUuid={user?.company_uuid}
      supabaseFunction="get_reorder_point_logs_filtered"
      onExport={onExport}
      getItemId={(log) => log.uuid}
      getItemDisplayName={(log) =>
        warehouseInventoryItems.find(i => i.uuid === log.warehouse_inventory_uuid)?.name || 'Unknown Item'
      }
      renderItem={(log) => (
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-small truncate">
              {warehouseInventoryItems.find(i => i.uuid === log.warehouse_inventory_uuid)?.name || 'Unknown Item'}
            </div>
            <div className="text-tiny text-default-400 truncate">
              {warehouses.find(w => w.uuid === log.warehouse_uuid)?.name || 'Unknown Warehouse'} • {formatDate(log.updated_at)}
            </div>
          </div>
          <Chip color={getStatusColor(log.status)} size="sm" variant="flat">
            {log.status.replaceAll('_', ' ')}
          </Chip>
        </div>
      )}
      isExporting={isPdfGenerating}
      enableSelectAll={true}
      defaultSelectedItems={[]}
      maxHeight="max-h-64"
    >
      <Button
        color="secondary"
        variant="shadow"
        startContent={!isPdfGenerating && <Icon icon="mdi:file-pdf-box" />}
        isLoading={isPdfGenerating}
        isDisabled={isPdfGenerating}
      >
        Export PDF
      </Button>
    </ExportPopover>
  );
}