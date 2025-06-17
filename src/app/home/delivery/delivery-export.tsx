"use client";

import { ExportOption, ExportPopover, FilterOption } from "@/components/export-popover/export-popover";
import { getStatusColor } from "@/utils/colors";
import { Button, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { format } from "date-fns";

interface DeliveryExportPopoverProps {
  user: any;
  warehouses: any[];
  operators: any[];
  inventoryItems: any[];
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

export function DeliveryExportPopover({
  user,
  warehouses,
  operators,
  inventoryItems,
  isPdfGenerating,
  onExport
}: DeliveryExportPopoverProps) {
  // Define filters for deliveries - same as in the original DeliveryPage
  const deliveryFilters: Record<string, FilterOption> = {
    warehouse_filter: {
      name: "Warehouse",
      valueName: "warehouse_uuid",
      color: "danger",
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
      color: "primary",
      filters: {
        "": "All Statuses",
        PENDING: "Pending",
        PROCESSING: "Processing",
        IN_TRANSIT: "In Transit",
        DELIVERED: "Delivered",
        CANCELLED: "Cancelled"
      }
    },
    operator_filter: {
      name: "Operator",
      valueName: "operator_uuids",
      color: "secondary",
      filters: operators.reduce(
        (acc, operator) => ({
          ...acc,
          [operator.uuid]: operator.full_name
        }),
        { "": "All Operators" }
      )
    },
    inventory_filter: {
      name: "Inventory",
      valueName: "inventory_uuid",
      color: "success",
      filters: inventoryItems.reduce(
        (acc, item) => ({
          ...acc,
          [item.uuid]: item.name
        }),
        { "": "All Items" }
      )
    }
  };

  // Define export options with the new comprehensive inventory inclusion options
  const exportOptions: ExportOption[] = [
    {
      key: "pageSize",
      label: "Page Size",
      type: "select",
      defaultValue: "A4",
      options: [
        { key: "A4", label: "A4 (210 × 297 mm)" },
        { key: "A3", label: "A3 (297 × 420 mm)" },
        { key: "LETTER", label: "Letter (8.5 × 11 in)" },
        { key: "LEGAL", label: "Legal (8.5 × 14 in)" }
      ]
    },
    {
      key: "includeAutoAccept",
      label: "Auto Accept Delivery",
      description: "Automatically accept delivery when QR code is scanned",
      type: "switch",
      defaultValue: false
    },
    {
      key: "includeShowOptions",
      label: "Show Options",
      description: "Display additional options when QR code is scanned",
      type: "switch",
      defaultValue: true
    },
    {
      key: "inventoryInclusionType",
      label: "Inventory QR Codes",
      description: "What inventory items to include in addition to delivery QR codes",
      type: "select",
      defaultValue: "delivery_only",
      options: [
        { key: "delivery_only", label: "Delivery QR Only" },
        { key: "all_items", label: "All Individual Items" },
        { key: "all_groups", label: "All Groups Only (no individual items)" },
        { key: "items_and_groups", label: "All Items + All Groups" },
        { key: "grouped_items", label: "Grouped Items (groups + ungrouped items)" }
      ]
    }
  ];

  // Format date helper function
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  return (
    <ExportPopover
      title="Export Delivery QR Report"
      description="Select deliveries to include in the PDF report"
      tableName="delivery_items"
      searchPlaceholder="Search deliveries..."
      filters={deliveryFilters}
      dateFilters={["dateRange", "weekFilter", "specificDate"]}
      exportOptions={exportOptions}
      companyUuid={user?.company_uuid}
      supabaseFunction="get_delivery_filtered"
      onExport={onExport}
      getItemId={(delivery) => delivery.uuid}
      getItemDisplayName={(delivery) =>
        delivery.itemName || delivery.name || delivery.item_name || 'Unknown Item'
      }
      renderItem={(delivery) => (
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-small truncate">
              {delivery.itemName || delivery.name || delivery.item_name || 'Unknown Item'}
            </div>
            <div className="text-tiny text-default-400 truncate">
              {warehouses.find(w => w.uuid === delivery.warehouse_uuid)?.name || 'Unknown Warehouse'} • {formatDate(delivery.delivery_date)}
            </div>
          </div>
          <Chip color={getStatusColor(delivery.status)} size="sm" variant="flat">
            {delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1).toLowerCase().replace('_', ' ')}
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
        Export QR PDF
      </Button>
    </ExportPopover>
  );
}