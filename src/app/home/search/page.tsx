"use client";

import {
  Accordion,
  AccordionItem,
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Snippet,
  Spinner
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { motionTransition, motionTransitionScale } from "@/utils/anim";
import { getUserFromCookies } from "@/utils/supabase/server/user";
import { copyToClipboard, formatDate } from "@/utils/tools";

import { updateDeliveryItem, updateInventoryItemBulksStatus, createWarehouseInventoryItems } from "../delivery/actions";

import CardList from "@/components/card-list";
import ListLoadingAnimation from "@/components/list-loading-animation";
import { format, parseISO } from "date-fns";
import { markWarehouseBulkAsUsed } from "../warehouse-items/actions";
import {
  getBulkUnitsDetails,
  getItemDetailsByUuid,
  getWarehouseItemsByDelivery,
  GoPageDeliveryDetails,
  GoPageInventoryDetails,
  GoPageWarehouseDetails,
  markWarehouseItemsAsUsed,
} from "./actions";
import CustomScrollbar from "@/components/custom-scrollbar";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // Item details states
  const [itemType, setItemType] = useState<'delivery' | 'inventory' | 'warehouse_inventory' | 'warehouse_bulk' | null>(null);
  const [itemDetails, setItemDetails] = useState<GoPageDeliveryDetails | GoPageInventoryDetails | GoPageWarehouseDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Bulk details state for lazy loading
  const [loadedBulkUnits, setLoadedBulkUnits] = useState<Map<string, any[]>>(new Map());
  const [loadingBulkUnits, setLoadingBulkUnits] = useState<Set<string>>(new Set());

  // Delivery acceptance states
  const [isAcceptingDelivery, setIsAcceptingDelivery] = useState(false);
  const [acceptDeliveryError, setAcceptDeliveryError] = useState<string | null>(null);
  const [acceptDeliverySuccess, setAcceptDeliverySuccess] = useState(false);
  const [isOperatorAssigned, setIsOperatorAssigned] = useState<boolean>(false);

  // Modal state
  const [showAcceptStatusModal, setShowAcceptStatusModal] = useState(false);

  // State for warehouse bulk handling
  const [targetWarehouseBulkUuid, setTargetWarehouseBulkUuid] = useState<string | null>(null);
  const [showAutoMarkStatusModal, setShowAutoMarkStatusModal] = useState(false);
  const [autoMarkSuccess, setAutoMarkSuccess] = useState(false);
  const [autoMarkError, setAutoMarkError] = useState<string | null>(null);

  // Add ref to track processed auto-actions
  const processedAutoActions = useRef<Set<string>>(new Set());

  const [showAcceptDeliveryLoadingModal, setShowAcceptDeliveryLoadingModal] = useState(false);
  const [showAutoMarkLoadingModal, setShowAutoMarkLoadingModal] = useState(false);

  // Add new state for show options modal
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [optionsDeliveryDetails, setOptionsDeliveryDetails] = useState<GoPageDeliveryDetails | null>(null);
  const [warehouseBulkItems, setWarehouseBulkItems] = useState<any[]>([]);
  const [selectedWarehouseBulks, setSelectedWarehouseBulks] = useState<string[]>([]);
  const [selectedWarehouseUnits, setSelectedWarehouseUnits] = useState<string[]>([]);
  const [isLoadingWarehouseItems, setIsLoadingWarehouseItems] = useState(false);
  const [isMarkingAsUsed, setIsMarkingAsUsed] = useState(false);

  // Add new state for property details modal
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<{ key: string, value: any } | null>(null);


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
    }).format(value);
  }

  const renderProperties = (properties: Record<string, any> | undefined, className: string = "grid grid-cols-1 md:grid-cols-2 gap-3") => {
    if (!properties || Object.keys(properties).length === 0) return null;

    return (
      <div className="mt-4">
        <p className="text-sm font-medium text-default-500 mb-3">Custom Properties</p>
        <div className={className}>
          {Object.entries(properties).map(([key, value]) => (
            <div key={key} className="bg-default-50 rounded-lg p-3 border border-default-100">
              <p className="text-sm font-medium text-default-700">{String(key).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
              <p className="text-default-900">{value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Load user and check for UUID in URL
  useEffect(() => {
    const initPage = async () => {
      setIsLoading(true);
      setError(null);

      const query = searchParams.get("q");
      const isDeliveryAutoAccept = searchParams.get("deliveryAutoAccept") === "true";
      const isItemAutoMarkAsUsed = searchParams.get("itemAutoMarkAsUsed") === "true";
      const isShowOptions = searchParams.get("showOptions") === "true";

      try {
        const userData = await getUserFromCookies();
        if (!userData) {
          router.push('/auth/login');
          return;
        }

        setUser(userData);

        if (query) {
          const resultLoadItemDetails = await loadItemDetails(query, userData);

          // Create unique keys for auto-actions to prevent duplicates
          const autoAcceptKey = `delivery-${query}-autoAccept`;
          const autoMarkKey = `warehouse-${query}-autoMark`;
          const showOptionsKey = `options-${query}-show`;


          if (resultLoadItemDetails) {
            if (resultLoadItemDetails.type === 'delivery') {
              // Auto-accept delivery if parameter is set and item is a delivery
              if (isDeliveryAutoAccept &&
                !processedAutoActions.current.has(autoAcceptKey)) {

                processedAutoActions.current.add(autoAcceptKey);
                await handleAcceptDelivery(resultLoadItemDetails.data as GoPageDeliveryDetails, userData);
              }

              if (isShowOptions &&
                !processedAutoActions.current.has(showOptionsKey)) {
                processedAutoActions.current.add(showOptionsKey);

                // Show options modal for delivery items
                if (resultLoadItemDetails.type === 'delivery') {
                  setOptionsDeliveryDetails(resultLoadItemDetails.data as GoPageDeliveryDetails);
                  setShowOptionsModal(true);

                  // Load warehouse items for this delivery if it's delivered
                  if ((resultLoadItemDetails.data as GoPageDeliveryDetails).status === 'DELIVERED') {
                    loadWarehouseItemsForDelivery((resultLoadItemDetails.data as GoPageDeliveryDetails).uuid);
                  }
                }
              }

            }
            else if (resultLoadItemDetails.type === 'warehouse_bulk') {
              // Auto-mark warehouse bulk as used if parameter is set and item is a warehouse bulk
              if (isItemAutoMarkAsUsed &&
                !processedAutoActions.current.has(autoMarkKey)) {

                processedAutoActions.current.add(autoMarkKey);
                await handleAutoMarkWarehouseBulk(resultLoadItemDetails.warehouseBulkUuid!, userData);
              }
            } else if (resultLoadItemDetails.type === 'warehouse_bulk') {
              setTargetWarehouseBulkUuid(resultLoadItemDetails.warehouseBulkUuid!);
              await loadBulkUnits(resultLoadItemDetails.warehouseBulkUuid!, true);
            }
          }
        }
      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to initialize page");
      } finally {
        setIsLoading(false);
      }
    };

    initPage();
  }, [router, searchParams]);


  const loadItemDetails = async (uuid: string, customUser?: any) => {
    setIsSearching(true);
    setError(null);

    const userData = customUser || user; // Use provided user or current user state

    let result: any = null;
    try {
      result = await getItemDetailsByUuid(uuid);

      if (result.success && result.data && result.type) {
        // Check if user is trying to access inventory details without admin privileges
        if (result.type === 'inventory' && userData && userData.is_admin === false) {
          setError("Access denied: Only administrators can view inventory item details");
          setItemDetails(null);
          setItemType(null);
          return null;
        }

        setItemType(result.type);
        setItemDetails(result.data);
        setSearchQuery(uuid);

        if (result.type === 'delivery') {
          const deliveryDetails = result.data as GoPageDeliveryDetails;

          setIsOperatorAssigned(deliveryDetails.operator_uuids?.includes(userData?.uuid) || deliveryDetails.operator_uuids === null || deliveryDetails.operator_uuids?.length === 0);
        } else {
          setIsOperatorAssigned(false);
        }
      } else {
        setError(result.error || "Item not found");
        setItemDetails(null);
        setItemType(null);
        return null;
      }
    } catch (error: any) {
      console.error("Error loading item details:", error);
      setError("Failed to load item details");
      return null;
    } finally {
      setIsSearching(false);
      return result;
    }
  };


  const loadBulkUnits = async (bulkUuid: string, isWarehouseBulk: boolean = false) => {
    if (loadedBulkUnits.has(bulkUuid) || loadingBulkUnits.has(bulkUuid)) {
      return; // Already loaded or loading
    }

    setLoadingBulkUnits(prev => new Set(prev).add(bulkUuid));

    try {
      const result = await getBulkUnitsDetails(bulkUuid, isWarehouseBulk);
      if (result.success) {
        setLoadedBulkUnits(prev => new Map(prev).set(bulkUuid, result.data || []));
      }
    } catch (error) {
      console.error("Error loading bulk units:", error);
    } finally {
      setLoadingBulkUnits(prev => {
        const newSet = new Set(prev);
        newSet.delete(bulkUuid);
        return newSet;
      });
    }
  };

  // Function to load warehouse items for a delivered delivery
  const loadWarehouseItemsForDelivery = async (deliveryUuid: string) => {
    setIsLoadingWarehouseItems(true);
    try {
      const result = await getWarehouseItemsByDelivery(deliveryUuid);
      if (result.success) {
        setWarehouseBulkItems(result.data || []);
      }
    } catch (error) {
      console.error("Error loading warehouse items:", error);
    } finally {
      setIsLoadingWarehouseItems(false);
    }
  };

  // Handle warehouse bulk selection
  const handleWarehouseBulkSelection = (bulkUuid: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedWarehouseBulks(prev => [...prev, bulkUuid]);

      // Automatically select all units in this bulk
      const bulkUnits = warehouseBulkItems
        .find(item => item.bulk_uuid === bulkUuid)?.units || [];
      const unitUuids = bulkUnits.map((unit: any) => unit.uuid);
      setSelectedWarehouseUnits(prev => [...prev, ...unitUuids]);
    } else {
      setSelectedWarehouseBulks(prev => prev.filter(id => id !== bulkUuid));

      // Also remove any units from this bulk
      const bulkUnits = warehouseBulkItems
        .find(item => item.bulk_uuid === bulkUuid)?.units || [];
      const unitUuids = bulkUnits.map((unit: any) => unit.uuid);
      setSelectedWarehouseUnits(prev => prev.filter(id => !unitUuids.includes(id)));
    }
  };

  // Handle warehouse unit selection
  const handleWarehouseUnitSelection = (unitUuid: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedWarehouseUnits(prev => [...prev, unitUuid]);
    } else {
      setSelectedWarehouseUnits(prev => prev.filter(id => id !== unitUuid));
    }
  };

  // Mark selected items as used
  const handleMarkSelectedAsUsed = async () => {
    if (selectedWarehouseBulks.length === 0 && selectedWarehouseUnits.length === 0) {
      return;
    }

    setIsMarkingAsUsed(true);
    try {
      const result = await markWarehouseItemsAsUsed(selectedWarehouseBulks, selectedWarehouseUnits);
      if (result.success) {
        // Refresh the warehouse items
        if (optionsDeliveryDetails) {
          await loadWarehouseItemsForDelivery(optionsDeliveryDetails.uuid);
        }
        // Clear selections
        setSelectedWarehouseBulks([]);
        setSelectedWarehouseUnits([]);
      }
    } catch (error) {
      console.error("Error marking items as used:", error);
    } finally {
      setIsMarkingAsUsed(false);
    }
  };

  // Accept delivery function (adapted from delivery page)
  const handleAcceptDelivery = async (deliveryDetails: GoPageDeliveryDetails, customUser?: any) => {
    if (!deliveryDetails) return;

    console.log("Accepting delivery:", deliveryDetails.uuid);

    setIsAcceptingDelivery(true);
    setAcceptDeliveryError(null);
    setAcceptDeliverySuccess(false);
    setShowAcceptDeliveryLoadingModal(true); // Show loading modal

    try {
      // THis is for operators only
      if (!customUser && !user) {
        setAcceptDeliveryError("User information is missing");
        setShowAcceptDeliveryLoadingModal(false);
        setShowAcceptStatusModal(true);
        return;
      }

      const userDetails = customUser || user;
      // Check if the user is an operator
      if (!userDetails || !userDetails.uuid || userDetails.is_admin) {
        setAcceptDeliveryError("You are not authorized to accept this delivery");
        setShowAcceptDeliveryLoadingModal(false);
        setShowAcceptStatusModal(true);
        return;
      }

      // Check if the delivery status is IN_TRANSIT
      if (deliveryDetails.status !== "IN_TRANSIT") {
        if (deliveryDetails.status === "DELIVERED") {
          setAcceptDeliveryError("This delivery has already been delivered");
        } else {
          setAcceptDeliveryError("This delivery cannot be accepted because it is not in transit");
        }
        setShowAcceptDeliveryLoadingModal(false);
        setShowAcceptStatusModal(true);
        console.warn("Delivery is not in transit:", deliveryDetails.status);
        return;
      }

      // Check if the operator is assigned to this delivery
      if (deliveryDetails.operator_uuids?.includes(userDetails?.uuid) ||
        deliveryDetails.operator_uuids === null ||
        deliveryDetails.operator_uuids?.length === 0) {

        // Update delivery status to DELIVERED
        const currentTimestamp = new Date().toISOString();
        const updatedStatusHistory = {
          ...(deliveryDetails.status_history || {}),
          [currentTimestamp]: "DELIVERED"
        };

        const updatedFormData = {
          status: "DELIVERED",
          status_history: updatedStatusHistory
        };

        const result = await updateDeliveryItem(deliveryDetails.uuid, updatedFormData);

        if (result.success && deliveryDetails.inventory_item?.uuid) {
          // Update inventory item bulks status
          if (deliveryDetails.inventory_bulks && deliveryDetails.inventory_bulks.length > 0) {
            const bulkUuids = deliveryDetails.inventory_bulks.map(bulk => bulk.uuid);
            await updateInventoryItemBulksStatus(bulkUuids, "IN_WAREHOUSE");
          }

          // Create warehouse inventory items if locations are available
          if (deliveryDetails.locations && deliveryDetails.locations.length > 0 &&
            deliveryDetails.inventory_bulks && deliveryDetails.inventory_bulks.length > 0) {
            try {
              if (!deliveryDetails.warehouse || !deliveryDetails.warehouse.uuid) {
                setAcceptDeliveryError("Warehouse information is missing");
                setShowAcceptDeliveryLoadingModal(false);
                setShowAcceptStatusModal(true);
                return;
              }

              await createWarehouseInventoryItems(
                deliveryDetails.inventory_item.uuid,
                deliveryDetails.warehouse.uuid,
                deliveryDetails.uuid,
                deliveryDetails.inventory_bulks.map(bulk => bulk.uuid),
                deliveryDetails.locations,
                deliveryDetails.location_codes || []
              );
            } catch (error) {
              console.error("Error creating warehouse inventory items:", error);
              setAcceptDeliveryError("Delivery accepted but failed to create warehouse items");
              setShowAcceptDeliveryLoadingModal(false);
              setShowAcceptStatusModal(true);
              return;
            }
          }

          setAcceptDeliverySuccess(true);
          setShowAcceptDeliveryLoadingModal(false);
          setShowAcceptStatusModal(true);

        } else {
          setAcceptDeliveryError("Failed to update delivery status");
          setShowAcceptDeliveryLoadingModal(false);
          setShowAcceptStatusModal(true);
        }
      } else {
        setAcceptDeliveryError("You are not assigned to this delivery");
        setShowAcceptDeliveryLoadingModal(false);
        setShowAcceptStatusModal(true);
        console.warn("User not assigned to this delivery:", user?.uuid, deliveryDetails.operator_uuids);
      }
    } catch (error) {
      console.error("Error accepting delivery:", error);
      setAcceptDeliveryError("Failed to accept delivery");
      setShowAcceptDeliveryLoadingModal(false);
      setShowAcceptStatusModal(true);
    } finally {
      setIsAcceptingDelivery(false);
    }
  };

  // Add new function to handle auto-marking warehouse bulk as used
  const handleAutoMarkWarehouseBulk = async (bulkUuid: string, userDetails: any) => {
    setIsLoading(true);
    setAutoMarkError(null);
    setAutoMarkSuccess(false);
    setShowAutoMarkLoadingModal(true); // Show loading modal

    try {
      // Update the bulk status to USED
      const result = await markWarehouseBulkAsUsed(bulkUuid);

      if (result.success) {
        setAutoMarkSuccess(true);
        setShowAutoMarkLoadingModal(false);
        setShowAutoMarkStatusModal(true);

        // Refresh the page data to show updated status
        const query = searchParams.get("q");
        if (query) {
          await loadItemDetails(query);
        }
      } else {
        setAutoMarkError(result.message || "Failed to mark item as used");
        setShowAutoMarkLoadingModal(false);
        setShowAutoMarkStatusModal(true);
      }

    } catch (error) {
      console.error("Error marking warehouse bulk as used:", error);
      setAutoMarkError("An unexpected error occurred");
      setShowAutoMarkLoadingModal(false);
      setShowAutoMarkStatusModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    // check if the search query changed from the current URL
    const currentQuery = searchParams.get("q");
    if (currentQuery === searchQuery.trim()) {
      return; // No change in search query
    }

    setIsSearching(true);

    if (!searchQuery.trim()) {
      setItemDetails(null);
      setItemType(null);
      setError(null);

      // Clear the search parameter from URL
      router.push('/home/search');
      return;
    }

    // Update URL with search query
    router.push(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);

  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  function getStatusColor(status: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
    switch (status?.toUpperCase()) {
      case "PENDING": return "primary";
      case "PROCESSING": return "warning";
      case "IN_TRANSIT": return "secondary";
      case "DELIVERED": return "success";
      case "CANCELLED": return "danger";
      case "AVAILABLE": return "success";
      case "IN_WAREHOUSE": return "primary";
      case "USED": return "secondary";
      default: return "default";
    }
  }


  const inputStyle = {
    inputWrapper: "bg-default-100 border-2 border-default-200 hover:border-default-300 focus-within:!border-primary-500 !cursor-text",
    input: "text-default-500",
    label: "text-default-600"
  };

  const renderDeliveryDetails = (details: GoPageDeliveryDetails) => (
    <div className="space-y-4">
      {/* Details Type */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <h1 className="text-2xl font-bold">Delivery Details</h1>
        <div className="flex gap-2">
          <Button
            variant="flat"
            color="success"
            size="sm"
            onPress={() => handleAcceptDelivery(details)}
            isLoading={isAcceptingDelivery}
            isDisabled={isAcceptingDelivery}
            className={(details.status !== "IN_TRANSIT" || !isOperatorAssigned) ? "hidden" : ""}
            startContent={!isAcceptingDelivery && <Icon icon="mdi:check" />}
          >
            {isAcceptingDelivery ? "Accepting..." : "Accept Delivery"}
          </Button>
          <Button
            variant="flat"
            color="primary"
            size="sm"
            onPress={() => router.push(`/home/delivery?deliveryId=${details.uuid}`)}
          >
            View Delivery
          </Button>
        </div>
      </div>

      {/* Accept Delivery Status Modal */}
      <Modal
        isOpen={showAcceptStatusModal}
        onClose={() => {
          setShowAcceptStatusModal(false);
          setAcceptDeliveryError(null);
          setAcceptDeliverySuccess(false);

          const searchQuery = searchParams.get("q") || "";
          router.replace(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }}
        placement="center"
        backdrop="blur"
        size="md"
        classNames={{ backdrop: "bg-background/50" }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            {acceptDeliverySuccess ? (
              <>
                <Icon icon="mdi:check-circle" className="text-success" width={24} />
                <span>Delivery Accepted Successfully</span>
              </>
            ) : (
              <>
                <Icon icon="mdi:alert-circle" className="text-danger" width={24} />
                <span>Delivery Acceptance Failed</span>
              </>
            )}
          </ModalHeader>
          <ModalBody>
            {acceptDeliverySuccess ? (
              <div className="text-center py-4">
                <div className="flex items-center justify-center w-16 h-16 bg-success-100 rounded-full mx-auto mb-4">
                  <Icon icon="mdi:check-circle" className="text-success" width={32} />
                </div>
                <p className="text-default-700">
                  The delivery has been marked as delivered and inventory items have been added to the warehouse.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="flex items-center justify-center w-16 h-16 bg-danger-100 rounded-full mx-auto mb-4">
                  <Icon icon="mdi:alert-circle" className="text-danger" width={32} />
                </div>
                <p className="text-default-700">
                  {acceptDeliveryError}
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              color={acceptDeliverySuccess ? "success" : "danger"}
              variant="solid"
              onPress={() => {
                setShowAcceptStatusModal(false);
                setAcceptDeliveryError(null);
                setAcceptDeliverySuccess(false);

                const searchQuery = searchParams.get("q") || "";
                router.replace(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }}
            >
              {acceptDeliverySuccess ? "Great!" : "Close"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Header */}
      <Card className="bg-background">
        <CardHeader className="p-4 justify-between flex-wrap bg-warning-50/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center lg:w-16 lg:h-16 w-12 h-12 bg-warning-100 rounded-lg">
              <Icon icon="mdi:truck-delivery" className="text-warning-600" width={24} />
            </div>
            <div className="flex-1 flex flex-row lg:flex-col gap-2">
              <h2 className="text-lg font-semibold">
                {details.name || "Delivery Item"}
              </h2>
              <div className="flex items-center gap-2">
                <div
                  className="lg:block hidden">
                  <Snippet
                    symbol=""
                    variant="flat"
                    color="warning"
                    size="sm"
                    className="text-xs p-1 pl-2"
                    classNames={{ copyButton: "bg-warning-100 hover:!bg-warning-200 text-sm p-0 h-6 w-6" }}
                    codeString={details.uuid}
                    checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                    copyIcon={<Icon icon="fluent:copy-16-regular" className="text-warning-500" />}
                    onCopy={() => copyToClipboard(details.uuid)}
                  >
                    {details.uuid}
                  </Snippet>
                </div>
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  isIconOnly
                  className="lg:hidden"
                  onPress={() => copyToClipboard(details.uuid)}
                >
                  <Icon icon="fluent:copy-16-regular" className="text-warning-500 text-sm" />
                </Button>
              </div>
            </div>
          </div>
          <Chip size='sm' color={getStatusColor(details.status)} variant="flat">
            {details.status}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="p-4 bg-warning-50/30">
          <div className="grid grid-cols-1 lg:grid-rows-2 gap-3">
            <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
              <p className="text-sm font-medium text-warning-700">Delivery Address</p>
              <p className="text-warning-900">{details.delivery_address}</p>
            </div>
            <div className="grid sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
                <p className="text-sm font-medium text-warning-700">Delivery Date</p>
                <p className="text-warning-900">{formatDate(details.delivery_date)}</p>
              </div>
              <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
                <p className="text-sm font-medium text-warning-700">Created At</p>
                <p className="text-warning-900">{formatDate(details.created_at)}</p>
              </div>
              <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
                <p className="text-sm font-medium text-warning-700">Last Updated</p>
                <p className="text-warning-900">{formatDate(details.updated_at)}</p>
              </div>
            </div>
          </div>

          {details.notes && (
            <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
              <p className="text-sm font-medium text-warning-700">Notes</p>
              <p className="text-warning-900">{details.notes}</p>
            </div>
          )}

          {/* Status History */}
          {details.status_history && Object.keys(details.status_history).length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-default-500 mb-3">Status History</p>
              <div className=" border-2 border-default-200 rounded-xl p-4 bg-default-50">
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[calc((3rem/2)-0.1rem)] top-0 bottom-1 w-0.5 bg-default-100 rounded-full"></div>
                  <div className="space-y-5">
                    {Object.entries(details.status_history)
                      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()) // Sort by timestamp descending
                      .map(([timestamp, status]) => {
                        // Determine icon based on status
                        const statusIcon =
                          status === "PENDING" ? "mdi:clock-outline" :
                            status === "PROCESSING" ? "mdi:clock-start" :
                              status === "IN_TRANSIT" ? "mdi:truck-fast" :
                                status === "DELIVERED" ? "mdi:check" :
                                  status === "CANCELLED" ? "mdi:close" :
                                    "mdi:help-circle";

                        return (
                          <div key={timestamp} className="flex items-start group">
                            <div className={`w-12 h-12 rounded-full flex-shrink-0 bg-${getStatusColor(status)}-100 flex items-center justify-center shadow-sm z-10`}>
                              <Icon
                                icon={statusIcon}
                                className={`text-${getStatusColor(status)}-900 text-[1.25rem]`}
                              />
                            </div>
                            <div className="ml-4 bg-default-100/50 p-3 rounded-xl border border-default-200 shadow-sm flex-grow">
                              <div className="flex justify-between items-center flex-wrap gap-2">
                                <Chip
                                  color={getStatusColor(status)}
                                  size="sm"
                                  variant="flat"
                                  className="font-medium"
                                >
                                  {status.replaceAll('_', ' ')}
                                </Chip>
                                <div className="text-xs text-default-500 flex items-center">
                                  <Icon icon="mdi:calendar-clock" className="mr-1" />
                                  {format(parseISO(timestamp), "MMM d, yyyy 'at' h:mm a")}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Alert
              variant="faded"
              color="danger"
              className="text-center mt-4"
              icon={<Icon icon="mdi:history" className="text-default-500" />}
            >
              No status history available.
            </Alert>
          )}

          {/* Location Information */}
          {details.locations && details.locations.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-default-500 mb-3">Location Information</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {details.locations.map((location, index) => (
                  <Card key={index} className="bg-primary-50 border-2 border-primary-100">
                    <CardBody className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center w-14 h-14 bg-primary-300 rounded-lg">
                          <Icon icon="mdi:map-marker" className="text-white" width={22} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-primary-900">Location #{index + 1}</h4>
                          {details.location_codes && details.location_codes[index] && (
                            <Snippet
                              symbol=""
                              variant="flat"
                              color="primary"
                              size="sm"
                              className="text-xs p-1 pl-2 mt-1"
                              classNames={{ copyButton: "bg-primary-200 hover:!bg-primary-300 text-sm p-0 h-6 w-6" }}
                              codeString={details.location_codes[index]}
                              checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                              copyIcon={<Icon icon="fluent:copy-16-regular" className="text-primary-600" />}
                              onCopy={() => copyToClipboard(details.location_codes![index])}
                            >
                              {details.location_codes[index]}
                            </Snippet>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
                        <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon icon="mdi:layers" className="text-primary-600" width={16} />
                            <span className="text-sm font-medium text-primary-700">Floor</span>
                          </div>
                          <p className="font-semibold text-primary-900">{location.floor}</p>
                        </div>

                        <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon icon="mdi:group" className="text-primary-600" width={16} />
                            <span className="text-sm font-medium text-primary-700">Group</span>
                          </div>
                          <p className="font-semibold text-primary-900">{location.group}</p>
                        </div>

                        <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon icon="mdi:view-grid" className="text-primary-600" width={16} />
                            <span className="text-sm font-medium text-primary-700">Row</span>
                          </div>
                          <p className="font-semibold text-primary-900">{location.row}</p>
                        </div>

                        <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon icon="mdi:view-column" className="text-primary-600" width={16} />
                            <span className="text-sm font-medium text-primary-700">Column</span>
                          </div>
                          <p className="font-semibold text-primary-900">{location.column}</p>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Related Information */}
      <div className={`grid grid-cols-1 ${user && user.is_admin ? 'lg:grid-cols-2' : ''} gap-4`}>
        {/* Original Inventory Item - Only show for admin users */}
        {details.inventory_item && user && user.is_admin && (
          <Card className="bg-background">
            <CardHeader className="p-4 bg-secondary-50/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center sm:w-16 sm:h-16 lg:w-12 lg:h-12 xl:w-16 xl:h-16 w-12 h-12 bg-secondary-100 rounded-lg">
                  <Icon icon="mdi:package-variant" className="text-secondary" width={22} />
                </div>
                <div className="flex-1 flex flex-row sm:flex-col lg:flex-row xl:flex-col gap-2">
                  <h3 className="text-lg font-semibold">Original Inventory</h3>
                  <div className="flex items-center gap-2">
                    <div
                      className="sm:block lg:hidden xl:block hidden">
                      <Snippet
                        symbol=""
                        variant="flat"
                        color="secondary"
                        size="sm"
                        className="text-xs p-1 pl-2"
                        classNames={{ copyButton: "bg-secondary-100 hover:!bg-secondary-200 text-sm p-0 h-6 w-6" }}
                        codeString={details.inventory_item.uuid}
                        onCopy={() => copyToClipboard(details.inventory_item!.uuid)}
                        checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                        copyIcon={<Icon icon="fluent:copy-16-regular" className="text-secondary-500" />}
                      >
                        {details.inventory_item.uuid}
                      </Snippet>
                    </div>
                    <div
                      className="sm:hidden lg:block xl:hidden">
                      <Button
                        size="sm"
                        variant="flat"
                        color="secondary"
                        isIconOnly
                        onPress={() => copyToClipboard(details.inventory_item!.uuid)}
                      >
                        <Icon icon="fluent:copy-16-regular" className="text-secondary-500 text-sm" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4 bg-secondary-50/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                  <p className="text-sm font-medium text-secondary-700">Name</p>
                  <p className="font-semibold text-secondary-900">{details.inventory_item.name}</p>
                </div>
                <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                  <p className="text-sm font-medium text-secondary-700">Unit</p>
                  <p className="font-semibold text-secondary-900">{details.inventory_item.unit}</p>
                </div>
              </div>
              {details.inventory_item.description && (
                <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                  <p className="text-sm font-medium text-secondary-700">Description</p>
                  <p className="font-semibold text-secondary-900">{details.inventory_item.description}</p>
                </div>
              )}
              {renderProperties(details.inventory_item.properties)}
            </CardBody>
            <CardFooter className="p-4 bg-secondary-50/30">
              <Button
                className="w-full"
                size="sm"
                color="secondary"
                variant="flat"
                onPress={() => router.push(`/home/inventory?itemId=${details.inventory_item!.uuid}`)}
              >
                View Details
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Warehouse Info */}
        {details.warehouse && (
          <Card className="bg-background mt-4">
            <CardHeader className="p-4 bg-success-50/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center sm:w-16 sm:h-16 lg:w-12 lg:h-12 xl:w-16 xl:h-16 w-12 h-12 bg-success-100 rounded-lg">
                  <Icon icon="mdi:warehouse" className="text-success" width={22} />
                </div>
                <div className="flex-1 flex flex-row sm:flex-col lg:flex-row xl:flex-col gap-2">
                  <h3 className="text-lg font-semibold">Warehouse</h3>
                  <div className="flex items-center gap-2">
                    <div
                      className="sm:block lg:hidden xl:block hidden">
                      <Snippet
                        symbol=""
                        variant="flat"
                        color="success"
                        size="sm"
                        className="text-xs p-1 pl-2"
                        classNames={{ copyButton: "bg-success-100 hover:!bg-success-200 text-sm p-0 h-6 w-6" }}
                        codeString={details.warehouse.uuid}
                        onCopy={() => copyToClipboard(details.warehouse!.uuid)}
                        checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                        copyIcon={<Icon icon="fluent:copy-16-regular" className="text-success-500" />}
                      >
                        {details.warehouse.uuid}
                      </Snippet>
                    </div>
                    <div
                      className="sm:hidden lg:block xl:hidden">
                      <Button
                        size="sm"
                        variant="flat"
                        color="success"
                        isIconOnly
                        onPress={() => copyToClipboard(details.warehouse!.uuid)}
                      >
                        <Icon icon="fluent:copy-16-regular" className="text-success-500 text-sm" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4 bg-success-50/30">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-success-50 rounded-lg p-3 border border-success-100">
                  <p className="text-sm font-medium text-success-700">Name</p>
                  <p className="text-success-900">{details.warehouse.name}</p>
                </div>
                <div className="bg-success-50 rounded-lg p-3 border border-success-100">
                  <p className="text-sm font-medium text-success-700">Address</p>
                  <p className="text-success-900">
                    {details.warehouse.address?.fullAddress || "Address not available"}
                  </p>
                </div>
              </div>
            </CardBody>
            <CardFooter className="p-4 bg-success-50/30">
              <Button
                className="w-full"
                size="sm"
                color="success"
                variant="flat"
                onPress={() => router.push(`/home/warehouses?warehouseId=${details.warehouse!.uuid}`)}
              >
                View Details
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>

      {/* Operators */}
      {
        details.operators && details.operators.length > 0 && (
          <Card className="bg-background mt-4">
            <CardHeader className="p-4 bg-danger-50/30">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 bg-danger-100 rounded-lg">
                    <Icon icon="mdi:account-group" className="text-danger" width={22} />
                  </div>
                  <h3 className="text-lg font-semibold">Assigned Operators</h3>
                </div>
                <Chip size="sm" variant="flat" color="danger">
                  {details.operators.length}
                </Chip>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="p-4 bg-danger-50/30">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {details.operators.map((operator) => (
                  <div key={operator.uuid} className="flex items-center gap-3 p-3 bg-danger-50 border-2 border-danger-100 rounded-xl shadow-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Avatar
                          name={operator.full_name}
                          size="lg"
                          src={operator.profile_image}
                        />
                        <div className="flex-1 flex flex-row sm:flex-col md:flex-row lg:flex-col gap-2">
                          <p className="font-medium text-default-900">{operator.full_name}</p>
                          <div className="flex items-center gap-2">
                            <div className="sm:block md:hidden lg:block hidden">
                              <Snippet
                                symbol=""
                                variant="flat"
                                color="danger"
                                size="sm"
                                className="text-xs p-1 pl-2"
                                classNames={{ copyButton: "bg-danger-100 hover:!bg-danger-200 text-sm p-0 h-6 w-6" }}
                                codeString={operator.uuid}
                                onCopy={() => copyToClipboard(operator.uuid)}
                                checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                copyIcon={<Icon icon="fluent:copy-16-regular" className="text-danger-500" />}
                              >
                                {operator.uuid}
                              </Snippet>
                            </div>
                            <div className="sm:hidden md:block lg:hidden">
                              <Button
                                size="sm"
                                variant="flat"
                                color="danger"
                                isIconOnly
                                onPress={() => copyToClipboard(operator.uuid)}
                              >
                                <Icon icon="fluent:copy-16-regular" className="text-danger-500 text-sm" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-default-600">
                        <Icon icon="mdi:email-outline" className="inline text-default-500 mr-1" width={16} />
                        {operator.email}
                      </p>
                      {operator.phone_number && (
                        <p className="text-sm text-default-600">
                          <Icon icon="mdi:phone-outline" className="inline text-default-500 mr-1" width={16} />
                          +63{operator.phone_number}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )
      }

      {/* Inventory Bulks - Only show for admin users */}
      {details.inventory_bulks && details.inventory_bulks.length > 0 && user && user.is_admin && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4 bg-primary-50/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-lg">
                  <Icon icon="mdi:cube-outline" className="text-primary" width={22} />
                </div>
                <h3 className="text-lg font-semibold">Inventory Bulks</h3>
              </div>
              <Chip size="sm" variant="flat" color="primary">
                {details.inventory_bulks.length}
              </Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="px-2 py-4 bg-primary-50/30">
            <Accordion
              selectionMode="multiple"
              variant="splitted"
              itemClasses={{
                base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                title: "font-normal text-lg font-semibold",
                trigger: "p-4 data-[hover=true]:bg-default-100 h-18 flex items-center transition-colors",
                indicator: "text-medium",
                content: "text-small p-0",
              }}
              onSelectionChange={(keys) => {
                // Load units for opened accordion items
                if (keys instanceof Set) {
                  keys.forEach(key => {
                    const bulkIndex = parseInt(key.toString());
                    if (details.inventory_bulks && details.inventory_bulks[bulkIndex]) {
                      const bulk = details.inventory_bulks[bulkIndex];
                      loadBulkUnits(bulk.uuid, false);
                    }
                  });
                }
              }}>
              {details.inventory_bulks.map((bulk, index) => (
                <AccordionItem
                  key={index}
                  title={
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 flex flex-row xl:flex-col gap-2">
                          <h3 className="text-lg font-semibold">
                            Bulk #{index + 1}
                          </h3>
                          <div className="flex items-center gap-2">
                            <div className="xl:block hidden">
                              <Snippet
                                symbol=""
                                variant="flat"
                                color="primary"
                                size="sm"
                                className="text-xs p-1 pl-2"
                                classNames={{ copyButton: "bg-primary-100 hover:!bg-primary-200 text-sm p-0 h-6 w-6" }}
                                codeString={bulk.uuid}
                                checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                copyIcon={<Icon icon="fluent:copy-16-regular" className="text-primary-500" />}
                                onCopy={() => copyToClipboard(bulk.uuid)}
                              >
                                {bulk.uuid}
                              </Snippet>
                            </div>
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              isIconOnly
                              className="xl:hidden"
                              onPress={() => copyToClipboard(bulk.uuid)}
                            >
                              <Icon icon="fluent:copy-16-regular" className="text-primary-500 text-sm" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="items-center gap-2 ml-2 md hidden sm:flex md:hidden lg:flex">
                        <Chip size="sm" color={getStatusColor(bulk.status || "AVAILABLE")} variant="flat">
                          {bulk.status || "AVAILABLE"}
                        </Chip>
                        <Chip size="sm" variant="flat" color="default">
                          {bulk.unit_value} {bulk.unit}
                        </Chip>
                        <Chip size="sm" variant="flat" color="default">
                          {formatCurrency(bulk.cost)}
                        </Chip>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-4 p-4">
                    {/* Bulk ID */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Unit Value</p>
                        <p className="text-primary-900">{bulk.unit_value} {bulk.unit}</p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Bulk Unit</p>
                        <p className="text-primary-900">{bulk.bulk_unit}</p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Cost</p>
                        <p className="text-primary-900">{formatCurrency(bulk.cost)}</p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Type</p>
                        <p className="text-primary-900">{bulk.is_single_item ? "Single Item" : "Multiple Items"}</p>
                      </div>
                    </div>

                    {/* Custom Properties */}
                    {renderProperties(bulk.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2")}

                    {/* Units */}
                    <div>
                      <h4 className="font-semibold text-default-900 mb-3">
                        Units {loadingBulkUnits.has(bulk.uuid) ? "(Loading...)" :
                          loadedBulkUnits.has(bulk.uuid) ? `(${loadedBulkUnits.get(bulk.uuid)?.length || 0})` : ""}
                      </h4>

                      <ListLoadingAnimation
                        skeleton=
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-20 rounded-lg" />
                        ))}
                        containerClassName="space-y-3"
                        condition={loadingBulkUnits.has(bulk.uuid) && !loadedBulkUnits.has(bulk.uuid)}
                      >
                        {loadedBulkUnits.get(bulk.uuid)?.map((unit: any) => (
                          <div key={unit.uuid} className="p-3 bg-default-100 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex-1 flex flex-row xl:flex-col gap-2">
                                <span className="text-lg font-semibold">{unit.name || unit.code}</span>
                                <div className="flex items-center gap-2">
                                  <div className="xl:block hidden">
                                    <Snippet
                                      symbol=""
                                      variant="flat"
                                      color="default"
                                      size="sm"
                                      className="text-xs p-1 pl-2"
                                      classNames={{ copyButton: "bg-default-100 hover:!bg-default-200 text-sm p-0 h-6 w-6" }}
                                      codeString={unit.uuid}
                                      checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                      copyIcon={<Icon icon="fluent:copy-16-regular" className="text-default-500" />}
                                      onCopy={() => copyToClipboard(unit.uuid)}
                                    >
                                      {unit.uuid}
                                    </Snippet>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    color="default"
                                    isIconOnly
                                    className="xl:hidden"
                                    onPress={() => copyToClipboard(unit.uuid)}
                                  >
                                    <Icon icon="fluent:copy-16-regular" className="text-default-500 text-sm" />
                                  </Button>
                                </div>
                              </div>
                              <div className="items-center gap-2 ml-2 md hidden sm:flex md:hidden lg:flex">
                                <Chip size="sm" color={getStatusColor(unit.status || "AVAILABLE")} variant="flat">
                                  {unit.status || "AVAILABLE"}
                                </Chip>
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Code</p>
                                <p className="text-default-900">{unit.code}</p>
                              </div>
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Value</p>
                                <p className="text-default-900">{unit.unit_value} {unit.unit}</p>
                              </div>
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Cost</p>
                                <p className="text-default-900">{formatCurrency(unit.cost)}</p>
                              </div>
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Status</p>
                                <p className="text-default-900">{unit.status || "AVAILABLE"}</p>
                              </div>
                            </div>
                            {renderProperties(unit.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2")}
                          </div>
                        )) || [<p className="text-default-600 text-center py-4">No units found</p>]}
                      </ListLoadingAnimation>

                    </div>
                  </div>
                </AccordionItem>
              ))}
            </Accordion>
          </CardBody>
        </Card>
      )
      }
    </div >
  );

  const renderInventoryDetails = (details: GoPageInventoryDetails) => (
    <div className="space-y-4">
      {/* Details Type */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <h1 className="text-2xl font-bold">Inventory Details</h1>
        <Button
          size="sm"
          variant="flat"
          color="primary"
          onPress={() => router.push(`/home/inventory?itemId=${details.uuid}`)}
        >
          View Inventory
        </Button>
      </div>


      {/* Header */}
      <Card className="bg-background">
        <CardHeader className="p-4 justify-between flex-wrap bg-secondary-50/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center lg:w-16 lg:h-16 w-12 h-12 bg-secondary-100 rounded-lg">
              <Icon icon="mdi:package-variant" className="text-secondary-600" width={24} />
            </div>
            <div className="flex-1 flex flex-row lg:flex-col gap-2">
              <h2 className="text-lg font-semibold">
                {details.name || "Inventory Item"}
              </h2>
              <div className="flex items-center gap-2">
                <div
                  className="lg:block hidden">
                  <Snippet
                    symbol=""
                    variant="flat"
                    color="secondary"
                    size="sm"
                    className="text-xs p-1 pl-2"
                    classNames={{ copyButton: "bg-secondary-100 hover:!bg-secondary-200 text-sm p-0 h-6 w-6" }}
                    codeString={details.uuid}
                    checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                    copyIcon={<Icon icon="fluent:copy-16-regular" className="text-secondary-500" />}
                    onCopy={() => copyToClipboard(details.uuid)}
                  >
                    {details.uuid}
                  </Snippet>
                </div>
                <Button
                  size="sm"
                  variant="flat"
                  color="secondary"
                  isIconOnly
                  className="lg:hidden"
                  onPress={() => copyToClipboard(details.uuid)}
                >
                  <Icon icon="fluent:copy-16-regular" className="text-secondary-500 text-sm" />
                </Button>
              </div>
            </div>
          </div>
          <Chip size='sm' color={getStatusColor(details.status || "AVAILABLE")} variant="flat">
            {details.status || "AVAILABLE"}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="p-4 bg-secondary-50/30">
          <div className="grid grid-cols-1 lg:grid-rows-2 gap-3">
            <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
              <p className="text-sm font-medium text-secondary-700">Description</p>
              <p className="text-secondary-900">{details.description || "No description available"}</p>
            </div>
            <div className="grid sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                <p className="text-sm font-medium text-secondary-700">Unit</p>
                <p className="text-secondary-900">{details.unit}</p>
              </div>
              <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                <p className="text-sm font-medium text-secondary-700">Created At</p>
                <p className="text-secondary-900">{formatDate(details.created_at)}</p>
              </div>
              <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                <p className="text-sm font-medium text-secondary-700">Last Updated</p>
                <p className="text-secondary-900">{formatDate(details.updated_at)}</p>
              </div>
            </div>
          </div>

          {/* Custom Properties */}
          {renderProperties(details.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3")}
        </CardBody>
      </Card>

      {/* Inventory Bulks - Using Accordion like delivery details */}
      {details.inventory_item_bulks && details.inventory_item_bulks.length > 0 && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4 bg-primary-50/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-lg">
                  <Icon icon="mdi:cube-outline" className="text-primary" width={22} />
                </div>
                <h3 className="text-lg font-semibold">Inventory Bulks</h3>
              </div>
              <Chip size="sm" variant="flat" color="primary">
                {details.inventory_item_bulks.length}
              </Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="px-2 py-4 bg-primary-50/30">
            <Accordion
              selectionMode="multiple"
              variant="splitted"
              itemClasses={{
                base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                title: "font-normal text-lg font-semibold",
                trigger: "p-4 data-[hover=true]:bg-default-100 h-18 flex items-center transition-colors",
                indicator: "text-medium",
                content: "text-small p-0",
              }}
              onSelectionChange={(keys) => {
                // Load units for opened accordion items
                if (keys instanceof Set) {
                  keys.forEach(key => {
                    const bulkIndex = parseInt(key.toString());
                    if (details.inventory_item_bulks && details.inventory_item_bulks[bulkIndex]) {
                      const bulk = details.inventory_item_bulks[bulkIndex];
                      loadBulkUnits(bulk.uuid, false);
                    }
                  });
                }
              }}>
              {details.inventory_item_bulks.map((bulk, index) => (
                <AccordionItem
                  key={index}
                  title={
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 flex flex-row xl:flex-col gap-2">
                          <h3 className="text-lg font-semibold">
                            Bulk #{index + 1}
                          </h3>
                          <div className="flex items-center gap-2">
                            <div className="xl:block hidden">
                              <Snippet
                                symbol=""
                                variant="flat"
                                color="primary"
                                size="sm"
                                className="text-xs p-1 pl-2"
                                classNames={{ copyButton: "bg-primary-100 hover:!bg-primary-200 text-sm p-0 h-6 w-6" }}
                                codeString={bulk.uuid}
                                checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                copyIcon={<Icon icon="fluent:copy-16-regular" className="text-primary-500" />}
                                onCopy={() => copyToClipboard(bulk.uuid)}
                              >
                                {bulk.uuid}
                              </Snippet>
                            </div>
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              isIconOnly
                              className="xl:hidden"
                              onPress={() => copyToClipboard(bulk.uuid)}
                            >
                              <Icon icon="fluent:copy-16-regular" className="text-primary-500 text-sm" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="items-center gap-2 ml-2 md hidden sm:flex md:hidden lg:flex">
                        <Chip size="sm" color={getStatusColor(bulk.status || "AVAILABLE")} variant="flat">
                          {bulk.status || "AVAILABLE"}
                        </Chip>
                        <Chip size="sm" variant="flat" color="default">
                          {bulk.unit_value} {bulk.unit}
                        </Chip>
                        <Chip size="sm" variant="flat" color="default">
                          {formatCurrency(bulk.cost)}
                        </Chip>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-4 p-4">
                    {/* Bulk ID */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Unit Value</p>
                        <p className="text-primary-900">{bulk.unit_value} {bulk.unit}</p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Bulk Unit</p>
                        <p className="text-primary-900">{bulk.bulk_unit}</p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Cost</p>
                        <p className="text-primary-900">{formatCurrency(bulk.cost)}</p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                        <p className="text-sm font-medium text-primary-700">Type</p>
                        <p className="text-primary-900">{bulk.is_single_item ? "Single Item" : "Multiple Items"}</p>
                      </div>
                    </div>

                    {/* Custom Properties */}
                    {renderProperties(bulk.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2")}

                    {/* Units */}
                    <div>
                      <h4 className="font-semibold text-default-900 mb-3">
                        Units {loadingBulkUnits.has(bulk.uuid) ? "(Loading...)" :
                          loadedBulkUnits.has(bulk.uuid) ? `(${loadedBulkUnits.get(bulk.uuid)?.length || 0})` : ""}
                      </h4>

                      <ListLoadingAnimation
                        skeleton=
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-20 rounded-lg" />
                        ))}
                        containerClassName="space-y-3"
                        condition={loadingBulkUnits.has(bulk.uuid) && !loadedBulkUnits.has(bulk.uuid)}
                      >
                        {loadedBulkUnits.get(bulk.uuid)?.map((unit: any) => (
                          <div key={unit.uuid} className="p-3 bg-default-100 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex-1 flex flex-row xl:flex-col gap-2">
                                <span className="text-lg font-semibold">{unit.name || unit.code}</span>
                                <div className="flex items-center gap-2">
                                  <div className="xl:block hidden">
                                    <Snippet
                                      symbol=""
                                      variant="flat"
                                      color="default"
                                      size="sm"
                                      className="text-xs p-1 pl-2"
                                      classNames={{ copyButton: "bg-default-100 hover:!bg-default-200 text-sm p-0 h-6 w-6" }}
                                      codeString={unit.uuid}
                                      checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                      copyIcon={<Icon icon="fluent:copy-16-regular" className="text-default-500" />}
                                      onCopy={() => copyToClipboard(unit.uuid)}
                                    >
                                      {unit.uuid}
                                    </Snippet>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    color="default"
                                    isIconOnly
                                    className="xl:hidden"
                                    onPress={() => copyToClipboard(unit.uuid)}
                                  >
                                    <Icon icon="fluent:copy-16-regular" className="text-default-500 text-sm" />
                                  </Button>
                                </div>
                              </div>
                              <div className="items-center gap-2 ml-2 md hidden sm:flex md:hidden lg:flex">
                                <Chip size="sm" color={getStatusColor(unit.status || "AVAILABLE")} variant="flat">
                                  {unit.status || "AVAILABLE"}
                                </Chip>
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Code</p>
                                <p className="text-default-900">{unit.code}</p>
                              </div>
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Value</p>
                                <p className="text-default-900">{unit.unit_value} {unit.unit}</p>
                              </div>
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Cost</p>
                                <p className="text-default-900">{formatCurrency(unit.cost)}</p>
                              </div>
                              <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                                <p className="text-sm font-medium text-default-700">Status</p>
                                <p className="text-default-900">{unit.status || "AVAILABLE"}</p>
                              </div>
                            </div>
                            {renderProperties(unit.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2")}
                          </div>
                        )) || [<p className="text-default-600 text-center py-4">No units found</p>]}
                      </ListLoadingAnimation>

                    </div>
                  </div>
                </AccordionItem>
              ))}
            </Accordion>
          </CardBody>
        </Card>
      )}

      {/* Delivery History */}
      {details.delivery_history && details.delivery_history.length > 0 && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4 bg-warning-50/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 bg-warning-100 rounded-lg">
                  <Icon icon="mdi:truck-delivery" className="text-warning" width={22} />
                </div>
                <h3 className="text-lg font-semibold">Delivery History</h3>
              </div>
              <Chip size="sm" variant="flat" color="warning">
                {details.delivery_history.length}
              </Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="p-4 bg-warning-50/30">
            <div className="space-y-3">
              {details.delivery_history.map((delivery) => (
                <div key={delivery.uuid} className="flex items-center gap-3 p-3 bg-warning-50 border-2 border-warning-100 rounded-xl shadow-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center justify-center w-14 h-14 bg-warning-300 rounded-lg">
                        <Icon icon="mdi:truck-delivery" className="text-white" width={22} />
                      </div>
                      <div className="flex-1 flex flex-row sm:flex-col md:flex-row lg:flex-col gap-2">
                        <p className="font-medium text-default-900">{delivery.delivery_address}</p>
                        <div className="flex items-center gap-2">
                          <div className="sm:block md:hidden lg:block hidden">
                            <Snippet
                              symbol=""
                              variant="flat"
                              color="warning"
                              size="sm"
                              className="text-xs p-1 pl-2"
                              classNames={{ copyButton: "bg-warning-100 hover:!bg-warning-200 text-sm p-0 h-6 w-6" }}
                              codeString={delivery.uuid}
                              onCopy={() => copyToClipboard(delivery.uuid)}
                              checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                              copyIcon={<Icon icon="fluent:copy-16-regular" className="text-warning-500" />}
                            >
                              {delivery.uuid}
                            </Snippet>
                          </div>
                          <div className="sm:hidden md:block lg:hidden">
                            <Button
                              size="sm"
                              variant="flat"
                              color="warning"
                              isIconOnly
                              onPress={() => copyToClipboard(delivery.uuid)}
                            >
                              <Icon icon="fluent:copy-16-regular" className="text-warning-500 text-sm" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-default-600">
                      <Icon icon="mdi:calendar-outline" className="inline text-default-500 mr-1" width={16} />
                      {formatDate(delivery.delivery_date)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <Chip size="sm" color={getStatusColor(delivery.status)} variant="flat">
                        {delivery.status}
                      </Chip>
                      <Button
                        size="sm"
                        color="warning"
                        variant="flat"
                        onPress={() => router.push(`/home/delivery?deliveryId=${delivery.uuid}`)}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );

  const renderWarehouseDetails = (details: GoPageWarehouseDetails) => (
    <div className="space-y-4">
      {/* Details Type */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <h1 className="text-2xl font-bold">Warehouse Inventory Details</h1>
        <Button
          variant="flat"
          color="primary"
          size="sm"
          onPress={() => router.push(`/home/warehouse-items?warehouseItemId=${details.uuid}`)}
        >
          View Warehouse
        </Button>
      </div>

      {/* Header */}
      <Card className="bg-background">
        <CardHeader className="p-4 justify-between flex-wrap bg-success-50/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center lg:w-16 lg:h-16 w-12 h-12 bg-success-100 rounded-lg">
              <Icon icon="mdi:warehouse" className="text-success-600" width={24} />
            </div>
            <div className="flex-1 flex flex-row lg:flex-col gap-2">
              <h2 className="text-lg font-semibold">
                {details.name || "Warehouse Item"}
              </h2>
              <div className="flex items-center gap-2">
                <div
                  className="lg:block hidden">
                  <Snippet
                    symbol=""
                    variant="flat"
                    color="success"
                    size="sm"
                    className="text-xs p-1 pl-2"
                    classNames={{ copyButton: "bg-success-100 hover:!bg-success-200 text-sm p-0 h-6 w-6" }}
                    codeString={details.uuid}
                    checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                    copyIcon={<Icon icon="fluent:copy-16-regular" className="text-success-500" />}
                    onCopy={() => copyToClipboard(details.uuid)}
                  >
                    {details.uuid}
                  </Snippet>
                </div>
                <Button
                  size="sm"
                  variant="flat"
                  color="success"
                  isIconOnly
                  className="lg:hidden"
                  onPress={() => copyToClipboard(details.uuid)}
                >
                  <Icon icon="fluent:copy-16-regular" className="text-success-500 text-sm" />
                </Button>
              </div>
            </div>
          </div>
          <Chip size='sm' color={getStatusColor(details.status)} variant="flat">
            {details.status}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="p-4 bg-success-50/30">
          <div className="grid grid-cols-1 lg:grid-rows-2 gap-3">
            <div className="bg-success-50 rounded-lg p-3 border border-success-100">
              <p className="text-sm font-medium text-success-700">Description</p>
              <p className="text-success-900">{details.description || "No description available"}</p>
            </div>
            <div className="grid sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="bg-success-50 rounded-lg p-3 border border-success-100">
                <p className="text-sm font-medium text-success-700">Unit</p>
                <p className="text-success-900">{details.unit}</p>
              </div>
              <div className="bg-success-50 rounded-lg p-3 border border-success-100">
                <p className="text-sm font-medium text-success-700">Created At</p>
                <p className="text-success-900">{formatDate(details.created_at || "")}</p>
              </div>
              <div className="bg-success-50 rounded-lg p-3 border border-success-100">
                <p className="text-sm font-medium text-success-700">Last Updated</p>
                <p className="text-success-900">{formatDate(details.updated_at || "")}</p>
              </div>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div className="bg-success-50 rounded-lg p-3 border border-success-100">
              <p className="text-sm font-medium text-success-700">Total Bulks</p>
              <p className="text-success-900">{details.bulks.length}</p>
            </div>
            <div className="bg-success-50 rounded-lg p-3 border border-success-100">
              <p className="text-sm font-medium text-success-700">Total Units</p>
              <p className="text-success-900">
                {details.bulks.reduce((sum, bulk) => sum + (bulk.unit_count || bulk.units?.length || 0), 0)}
              </p>
            </div>
          </div>

          {/* Custom Properties */}
          {renderProperties(details.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3")}
        </CardBody>
      </Card>

      {/* Related Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original Inventory Item */}
        {details.inventory_item && (
          <Card className="bg-background">
            <CardHeader className="p-4 bg-secondary-50/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center sm:w-16 sm:h-16 lg:w-12 lg:h-12 xl:w-16 xl:h-16 w-12 h-12 bg-secondary-100 rounded-lg">
                  <Icon icon="mdi:package-variant" className="text-secondary" width={22} />
                </div>
                <div className="flex-1 flex flex-row sm:flex-col lg:flex-row xl:flex-col gap-2">
                  <h3 className="text-lg font-semibold">Original Inventory</h3>
                  <div className="flex items-center gap-2">
                    <div
                      className="sm:block lg:hidden xl:block hidden">
                      <Snippet
                        symbol=""
                        variant="flat"
                        color="secondary"
                        size="sm"
                        className="text-xs p-1 pl-2"
                        classNames={{ copyButton: "bg-secondary-100 hover:!bg-secondary-200 text-sm p-0 h-6 w-6" }}
                        codeString={details.inventory_item.uuid}
                        onCopy={() => copyToClipboard(details.inventory_item!.uuid)}
                        checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                        copyIcon={<Icon icon="fluent:copy-16-regular" className="text-secondary-500" />}
                      >
                        {details.inventory_item.uuid}
                      </Snippet>
                    </div>
                    <div
                      className="sm:hidden lg:block xl:hidden">
                      <Button
                        size="sm"
                        variant="flat"
                        color="secondary"
                        isIconOnly
                        onPress={() => copyToClipboard(details.inventory_item!.uuid)}
                      >
                        <Icon icon="fluent:copy-16-regular" className="text-secondary-500 text-sm" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4 bg-secondary-50/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                  <p className="text-sm font-medium text-secondary-700">Name</p>
                  <p className="font-semibold text-secondary-900">{details.inventory_item.name}</p>
                </div>
                <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                  <p className="text-sm font-medium text-secondary-700">Unit</p>
                  <p className="font-semibold text-secondary-900">{details.inventory_item.unit}</p>
                </div>
              </div>
              {details.inventory_item.description && (
                <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                  <p className="text-sm font-medium text-secondary-700">Description</p>
                  <p className="font-semibold text-secondary-900">{details.inventory_item.description}</p>
                </div>
              )}
              {renderProperties(details.inventory_item.properties)}
            </CardBody>
            <CardFooter className="p-4 bg-secondary-50/30">
              <Button
                className="w-full"
                size="sm"
                color="secondary"
                variant="flat"
                onPress={() => router.push(`/home/inventory?itemId=${details.inventory_item!.uuid}`)}
              >
                View Details
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Warehouse Info */}
        {details.warehouse && (
          <Card className="bg-background">
            <CardHeader className="p-4 bg-primary-50/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center sm:w-16 sm:h-16 lg:w-12 lg:h-12 xl:w-16 xl:h-16 w-12 h-12 bg-primary-100 rounded-lg">
                  <Icon icon="mdi:warehouse" className="text-primary" width={22} />
                </div>
                <div className="flex-1 flex flex-row sm:flex-col lg:flex-row xl:flex-col gap-2">
                  <h3 className="text-lg font-semibold">Warehouse</h3>
                  <div className="flex items-center gap-2">
                    <div
                      className="sm:block lg:hidden xl:block hidden">
                      <Snippet
                        symbol=""
                        variant="flat"
                        color="primary"
                        size="sm"
                        className="text-xs p-1 pl-2"
                        classNames={{ copyButton: "bg-primary-100 hover:!bg-primary-200 text-sm p-0 h-6 w-6" }}
                        codeString={details.warehouse.uuid}
                        onCopy={() => copyToClipboard(details.warehouse!.uuid)}
                        checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                        copyIcon={<Icon icon="fluent:copy-16-regular" className="text-primary-500" />}
                      >
                        {details.warehouse.uuid}
                      </Snippet>
                    </div>
                    <div
                      className="sm:hidden lg:block xl:hidden">
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        isIconOnly
                        onPress={() => copyToClipboard(details.warehouse!.uuid)}
                      >
                        <Icon icon="fluent:copy-16-regular" className="text-primary-500 text-sm" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4 bg-primary-50/30">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                  <p className="text-sm font-medium text-primary-700">Name</p>
                  <p className="text-primary-900">{details.warehouse.name}</p>
                </div>
                <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                  <p className="text-sm font-medium text-primary-700">Address</p>
                  <p className="text-primary-900">
                    {details.warehouse.address?.fullAddress || "Address not available"}
                  </p>
                </div>
              </div>
            </CardBody>
            <CardFooter className="p-4 bg-primary-50/30">
              <Button
                className="w-full"
                size="sm"
                color="primary"
                variant="flat"
                onPress={() => router.push(`/home/warehouses?warehouseId=${details.warehouse!.uuid}`)}
              >
                View Details
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>

      {/* Delivery Information */}
      {details.delivery_item && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4 bg-warning-50/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 bg-warning-100 rounded-lg">
                  <Icon icon="mdi:truck-delivery" className="text-warning" width={22} />
                </div>
                <h3 className="text-lg font-semibold">Delivery Information</h3>
              </div>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="p-4 bg-warning-50/30">
            <div className="flex items-center gap-3 p-3 bg-warning-50 border-2 border-warning-100 rounded-xl shadow-lg">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center justify-center w-14 h-14 bg-warning-300 rounded-lg">
                    <Icon icon="mdi:truck-delivery" className="text-white" width={22} />
                  </div>
                  <div className="flex-1 flex flex-row sm:flex-col md:flex-row lg:flex-col gap-2">
                    <p className="font-medium text-default-900">{details.delivery_item.delivery_address}</p>
                    <div className="flex items-center gap-2">
                      <div className="sm:block md:hidden lg:block hidden">
                        <Snippet
                          symbol=""
                          variant="flat"
                          color="warning"
                          size="sm"
                          className="text-xs p-1 pl-2"
                          classNames={{ copyButton: "bg-warning-100 hover:!bg-warning-200 text-sm p-0 h-6 w-6" }}
                          codeString={details.delivery_item.uuid}
                          onCopy={() => copyToClipboard(details.delivery_item!.uuid)}
                          checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                          copyIcon={<Icon icon="fluent:copy-16-regular" className="text-warning-500" />}
                        >
                          {details.delivery_item.uuid}
                        </Snippet>
                      </div>
                      <div className="sm:hidden md:block lg:hidden">
                        <Button
                          size="sm"
                          variant="flat"
                          color="warning"
                          isIconOnly
                          onPress={() => copyToClipboard(details.delivery_item!.uuid)}
                        >
                          <Icon icon="fluent:copy-16-regular" className="text-warning-500 text-sm" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-default-600">
                  <Icon icon="mdi:calendar-outline" className="inline text-default-500 mr-1" width={16} />
                  {formatDate(details.delivery_item.delivery_date)}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <Chip size="sm" color={getStatusColor(details.delivery_item.status)} variant="flat">
                    {details.delivery_item.status}
                  </Chip>
                  <Button
                    size="sm"
                    color="warning"
                    variant="flat"
                    onPress={() => router.push(`/home/delivery?deliveryId=${details.delivery_item!.uuid}`)}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Warehouse Bulks with Units - Using Accordion */}
      <Card className="bg-background mt-4">
        <CardHeader className="p-4 bg-danger-50/30">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 bg-danger-100 rounded-lg">
                <Icon icon="mdi:cube-outline" className="text-danger" width={22} />
              </div>
              <h3 className="text-lg font-semibold">Storage Bulks</h3>
            </div>
            <Chip size="sm" variant="flat" color="danger">
              {details.bulks.length}
            </Chip>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="px-2 py-4 bg-danger-50/30">
          <Accordion
            selectionMode="multiple"
            variant="splitted"
            defaultExpandedKeys={targetWarehouseBulkUuid ? [targetWarehouseBulkUuid] : []}
            itemClasses={{
              base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-danger-50",
              title: "font-normal text-lg font-semibold",
              trigger: "p-4 data-[hover=true]:bg-danger-50 h-18 flex items-center transition-colors",
              indicator: "text-medium",
              content: "text-small p-0",
            }}
            onSelectionChange={(keys) => {
              // Load units for opened accordion items
              if (keys instanceof Set) {
                keys.forEach((key) => {
                  const bulkIndex = details.bulks.findIndex(bulk => bulk.uuid === key);
                  if (bulkIndex !== -1 && details.bulks[bulkIndex]) {
                    const bulk = details.bulks[bulkIndex];
                    loadBulkUnits(bulk.uuid, true);
                  }
                });
              }
            }}
          >
            {details.bulks.map((bulk, index) => (
              <AccordionItem
                key={bulk.uuid}
                title={
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 flex flex-row xl:flex-col gap-2">
                        <h3 className={`text-lg font-semibold ${targetWarehouseBulkUuid === bulk.uuid ? 'text-danger' : ''
                          }`}>
                          Bulk #{index + 1}
                          {targetWarehouseBulkUuid === bulk.uuid && (
                            <span className="ml-2 text-danger">← Target</span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="xl:block hidden">
                            <Snippet
                              symbol=""
                              variant="flat"
                              color="danger"
                              size="sm"
                              className="text-xs p-1 pl-2"
                              classNames={{ copyButton: "bg-danger-100 hover:!bg-danger-200 text-sm p-0 h-6 w-6" }}
                              codeString={bulk.uuid}
                              checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-danger" />}
                              copyIcon={<Icon icon="fluent:copy-16-regular" className="text-danger-500" />}
                              onCopy={() => copyToClipboard(bulk.uuid)}
                            >
                              {bulk.uuid}
                            </Snippet>
                          </div>
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            isIconOnly
                            className="xl:hidden"
                            onPress={() => copyToClipboard(bulk.uuid)}
                          >
                            <Icon icon="fluent:copy-16-regular" className="text-danger-500 text-sm" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="items-center gap-2 ml-2 md hidden sm:flex md:hidden lg:flex">
                      <Chip size="sm" color={getStatusColor(bulk.status)} variant="flat">
                        {bulk.status}
                      </Chip>
                      <Chip size="sm" variant="flat" color="default">
                        {bulk.unit_value} {bulk.unit}
                      </Chip>
                      <Chip size="sm" variant="flat" color="default">
                        {formatCurrency(bulk.cost)}
                      </Chip>
                    </div>
                  </div>
                }
              >
                <div className="space-y-4 p-4">
                  {/* Bulk Details */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-danger-50 rounded-lg p-3 border border-danger-100">
                      <p className="text-sm font-medium text-danger-700">Unit Value</p>
                      <p className="text-danger-900">{bulk.unit_value} {bulk.unit}</p>
                    </div>
                    <div className="bg-danger-50 rounded-lg p-3 border border-danger-100">
                      <p className="text-sm font-medium text-danger-700">Bulk Unit</p>
                      <p className="text-danger-900">{bulk.bulk_unit}</p>
                    </div>
                    <div className="bg-danger-50 rounded-lg p-3 border border-danger-100">
                      <p className="text-sm font-medium text-danger-700">Cost</p>
                      <p className="text-danger-900">{formatCurrency(bulk.cost)}</p>
                    </div>
                    <div className="bg-danger-50 rounded-lg p-3 border border-danger-100">
                      <p className="text-sm font-medium text-danger-700">Type</p>
                      <p className="text-danger-900">{bulk.is_single_item ? "Single Item" : "Multiple Items"}</p>
                    </div>
                  </div>

                  {/* Location Details */}
                  {(bulk.location) && (
                    <Card className="bg-primary-50 border-2 border-primary-100">
                      <CardBody className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center justify-center w-14 h-14 bg-primary-300 rounded-lg">
                            <Icon icon="mdi:map-marker" className="text-white" width={22} />
                          </div>
                          <div>
                            <h4 className="font-semibold text-primary-900">Storage Location</h4>
                            <p className="text-sm text-primary-700">{bulk.location_code}</p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
                          <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                            <div className="flex items-center gap-2 mb-1">
                              <Icon icon="mdi:layers" className="text-primary-600" width={16} />
                              <span className="text-sm font-medium text-primary-700">Floor</span>
                            </div>
                            <p className="font-semibold text-primary-900">{bulk.location.floor}</p>
                          </div>

                          <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                            <div className="flex items-center gap-2 mb-1">
                              <Icon icon="mdi:group" className="text-primary-600" width={16} />
                              <span className="text-sm font-medium text-primary-700">Group</span>
                            </div>
                            <p className="font-semibold text-primary-900">{bulk.location.group}</p>
                          </div>

                          <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                            <div className="flex items-center gap-2 mb-1">
                              <Icon icon="mdi:view-grid" className="text-primary-600" width={16} />
                              <span className="text-sm font-medium text-primary-700">Row</span>
                            </div>
                            <p className="font-semibold text-primary-900">{bulk.location.row}</p>
                          </div>

                          <div className="bg-primary-100 rounded-lg p-3 border border-primary-200">
                            <div className="flex items-center gap-2 mb-1">
                              <Icon icon="mdi:view-column" className="text-primary-600" width={16} />
                              <span className="text-sm font-medium text-primary-700">Column</span>
                            </div>
                            <p className="font-semibold text-primary-900">{bulk.location.column}</p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {/* Custom Properties */}
                  {renderProperties(bulk.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2")}

                  {/* Units */}
                  <div>
                    <h4 className="font-semibold text-default-900 mb-3">
                      Units {loadingBulkUnits.has(bulk.uuid) ? "(Loading...)" :
                        loadedBulkUnits.has(bulk.uuid) ? `(${loadedBulkUnits.get(bulk.uuid)?.length || 0})` :
                          bulk.unit_count ? `(${bulk.unit_count})` : ""}
                    </h4>

                    <ListLoadingAnimation
                      skeleton=
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-lg" />
                      ))}
                      containerClassName="space-y-3"
                      condition={loadingBulkUnits.has(bulk.uuid) && !loadedBulkUnits.has(bulk.uuid)}
                    >
                      {loadedBulkUnits.get(bulk.uuid)?.map((unit: any) => (
                        <div key={unit.uuid} className="p-3 bg-default-100 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1 flex flex-row xl:flex-col gap-2">
                              <span className="text-lg font-semibold">{unit.name || unit.code}</span>
                              <div className="flex items-center gap-2">
                                <div className="xl:block hidden">
                                  <Snippet
                                    symbol=""
                                    variant="flat"
                                    color="default"
                                    size="sm"
                                    className="text-xs p-1 pl-2"
                                    classNames={{ copyButton: "bg-default-100 hover:!bg-default-200 text-sm p-0 h-6 w-6" }}
                                    codeString={unit.uuid}
                                    checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                    copyIcon={<Icon icon="fluent:copy-16-regular" className="text-default-500" />}
                                    onCopy={() => copyToClipboard(unit.uuid)}
                                  >
                                    {unit.uuid}
                                  </Snippet>
                                </div>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  color="default"
                                  isIconOnly
                                  className="xl:hidden"
                                  onPress={() => copyToClipboard(unit.uuid)}
                                >
                                  <Icon icon="fluent:copy-16-regular" className="text-default-500 text-sm" />
                                </Button>
                              </div>
                            </div>
                            <div className="items-center gap-2 ml-2 md hidden sm:flex md:hidden lg:flex">
                              <Chip size="sm" color={getStatusColor(unit.status)} variant="flat">
                                {unit.status}
                              </Chip>
                            </div>
                          </div>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                            <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                              <p className="text-sm font-medium text-default-700">Code</p>
                              <p className="text-default-900">{unit.code}</p>
                            </div>
                            <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                              <p className="text-sm font-medium text-default-700">Value</p>
                              <p className="text-default-900">{unit.unit_value} {unit.unit}</p>
                            </div>
                            <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                              <p className="text-sm font-medium text-default-700">Cost</p>
                              <p className="text-default-900">{formatCurrency(unit.cost)}</p>
                            </div>
                            <div className="bg-default-50 rounded-lg p-3 border border-default-100">
                              <p className="text-sm font-medium text-default-700">Location</p>
                              <p className="text-default-900">{unit.location_code || "Not set"}</p>
                            </div>
                          </div>
                          {renderProperties(unit.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2")}
                        </div>
                      )) || [<p className="text-default-600 text-center py-4">No units found</p>]}
                    </ListLoadingAnimation>

                  </div>
                </div>
              </AccordionItem>
            ))}
          </Accordion>
        </CardBody>
      </Card>
    </div>
  );

  return (
    <div className="container mx-auto p-2 max-w-5xl">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <motion.div
          {...motionTransitionScale}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Search for Item Details</h1>
            {(isLoading) ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading item details</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Enter an identifier to view detailed information about any item in your system.</p>
            )}
          </div>

          {/* Search Bar */}
          <CardList>
            <div className="flex gap-3 items-center w-full relative">
              <Input
                placeholder="Enter UUID (delivery, inventory, or warehouse item)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isSearching}
                onKeyPress={handleKeyPress}
                classNames={{
                  inputWrapper: "bg-default-100 border-2 border-default-200 hover:border-default-300 focus-within:!border-primary-500 !cursor-text rounded-lg pr-24",
                  input: "text-default-500",
                  label: "text-default-600"
                }}
                size="lg"
                className="flex-1"
              />
              <Button
                color="primary"
                variant="shadow"
                onPress={handleSearch}
                className="rounded-lg absolute right-2 -translate-y-1/2 top-1/2 z-10"
                size="sm"
                isLoading={isSearching}
                startContent={!isSearching && <Icon icon="mdi:magnify" />}
                disabled={isSearching || !searchQuery.trim()}
              >
                Search
              </Button>
            </div>
          </CardList>
        </motion.div>
        <AnimatePresence mode="wait">
          {/* Error Message */}
          {error && (
            <motion.div
              key="error"
              {...motionTransition}
            >
              <Alert
                color="danger"
                variant="solid"
                className="shadow-danger-500/30 shadow-xl"
                icon={
                  <Icon icon="mdi:alert-circle" width={24} />
                }
                endContent={
                  <Button
                    color="danger"
                    variant="solid"
                    isIconOnly
                    onPress={() => setError(null)}
                  >
                    <Icon icon="mdi:close" />
                  </Button>
                }
                title="Error"
                description={error}
              />
            </motion.div>
          )}

          {/* Loading State */}
          {isSearching && !error && (
            <motion.div
              key="loading"
              {...motionTransition}
            >
              <Card className="bg-background">
                <CardBody className="p-6">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full">
                      <Icon icon="mdi:magnify" className="text-primary-600 animate-pulse" width={32} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-default-900 mb-2">
                        Searching for Item Details
                      </h3>
                      <p className="text-default-500 mb-4">
                        Please wait while we retrieve the information...
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <Spinner size="sm" color="primary" />
                        <span className="text-sm text-default-600">Processing your request</span>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}

          {/* Item Delivery Details */}
          {itemDetails && itemType && itemType === 'delivery' && (
            <motion.div
              key="delivery-details"
              {...motionTransition}
            >
              <div className={`transition-opacity transition-blur ${isSearching && !error && 'opacity-75 blur-sm'}`}>
                {renderDeliveryDetails(itemDetails as GoPageDeliveryDetails)}
              </div>
            </motion.div>
          )}

          {/* Item Inventory Details */}
          {itemDetails && itemType && itemType === 'inventory' && (
            <motion.div
              key="inventory-details"
              {...motionTransition}
            >
              <div className={`transition-opacity transition-blur ${isSearching && !error && 'opacity-75 blur-sm'}`}>
                {renderInventoryDetails(itemDetails as GoPageInventoryDetails)}
              </div>
            </motion.div>
          )}

          {/* Item Warehouse Invenrtory Details */}
          {itemDetails && itemType && (itemType === 'warehouse_inventory' || itemType === 'warehouse_bulk') && (
            <motion.div
              key="warehouse-details"
              {...motionTransition}
            >
              <div className={`transition-opacity transition-blur ${isSearching && !error && 'opacity-75 blur-sm'}`}>
                {renderWarehouseDetails(itemDetails as GoPageWarehouseDetails)}
              </div>
            </motion.div>
          )}

          {/* Instructions */}
          {!itemDetails && !error && !isSearching && (
            <motion.div
              key="instructions"
              {...motionTransition}
            >
              <Card className="bg-background">
                <CardBody className="text-center py-12">
                  <Icon icon="mdi:information-outline" className="text-default-400 mx-auto mb-4" width={48} />
                  <h3 className="text-xl font-semibold text-default-900 mb-2">
                    How to Use Go to Item Details
                  </h3>
                  <p className="text-default-600 mb-6 max-w-md mx-auto">
                    Enter any UUID from your delivery items, inventory items, or warehouse items to view comprehensive details.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto px-4">
                    <div className="text-center max-w-xs mx-auto">
                      <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Icon icon="mdi:truck-delivery" className="text-warning" width={24} />
                      </div>
                      <p className="font-medium text-default-900">Delivery Items</p>
                      <p className="text-sm text-default-600">View delivery details, operators, and locations</p>
                    </div>

                    <div className="text-center max-w-xs mx-auto">
                      <div className="w-12 h-12 bg-secondary-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Icon icon="mdi:package-variant" className="text-secondary" width={24} />
                      </div>
                      <p className="font-medium text-default-900">Inventory Items</p>
                      <p className="text-sm text-default-600">View bulks, units, delivery history {user && !user.is_admin && "(Admin only)"}</p>
                    </div>

                    <div className="text-center max-w-xs mx-auto">
                      <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Icon icon="mdi:warehouse" className="text-success" width={24} />
                      </div>
                      <p className="font-medium text-default-900">Warehouse Inventory Items</p>
                      <p className="text-sm text-default-600">View storage locations, bulks and units. You can search by warehouse bulk UUID also.</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div >

      {/* Accept Delivery Status Modal - place outside the main content */}
      <Modal
        isOpen={showAcceptStatusModal}
        onClose={() => {
          setShowAcceptStatusModal(false);
          setAcceptDeliveryError(null);
          setAcceptDeliverySuccess(false);

          const searchQuery = searchParams.get("q") || "";
          router.replace(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }}
        placement="center"
        backdrop="blur"
        size="md"
        classNames={{ backdrop: "bg-background/50" }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            {acceptDeliverySuccess ? (
              <>
                <Icon icon="mdi:check-circle" className="text-success" width={24} />
                <span>Delivery Accepted Successfully</span>
              </>
            ) : (
              <>
                <Icon icon="mdi:alert-circle" className="text-danger" width={24} />
                <span>Delivery Acceptance Failed</span>
              </>
            )}
          </ModalHeader>
          <ModalBody>
            {acceptDeliverySuccess ? (
              <div className="text-center py-4">
                <div className="flex items-center justify-center w-16 h-16 bg-success-100 rounded-full mx-auto mb-4">
                  <Icon icon="mdi:check-circle" className="text-success" width={32} />
                </div>
                <p className="text-default-700">
                  The delivery has been marked as delivered and inventory items have been added to the warehouse.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="flex items-center justify-center w-16 h-16 bg-danger-100 rounded-full mx-auto mb-4">
                  <Icon icon="mdi:alert-circle" className="text-danger" width={32} />
                </div>
                <p className="text-default-700">
                  {acceptDeliveryError}
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              color={acceptDeliverySuccess ? "success" : "danger"}
              variant="solid"
              onPress={() => {
                setShowAcceptStatusModal(false);
                setAcceptDeliveryError(null);
                setAcceptDeliverySuccess(false);

                const searchQuery = searchParams.get("q") || "";
                router.replace(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }}
            >
              {acceptDeliverySuccess ? "Great!" : "Close"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Auto Mark Status Modal */}
      <Modal
        isOpen={showAutoMarkStatusModal}
        backdrop="blur"
        size="md"
        classNames={{ backdrop: "bg-background/50" }}
        onClose={() => {
          setShowAutoMarkStatusModal(false)
          setAutoMarkError("");
          setAutoMarkSuccess(false);

          const searchQuery = searchParams.get("q") || "";
          router.replace(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }}>
        <ModalContent>
          <ModalHeader>
            <h3 className="text-lg font-semibold">
              {autoMarkSuccess ? "Success" : "Error"}
            </h3>
          </ModalHeader>
          <ModalBody>
            {autoMarkSuccess ? (
              <div className="flex items-center gap-3">
                <Icon icon="mdi:check-circle" className="w-6 h-6" />
                <p>Item has been successfully marked as used.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Icon icon="mdi:alert-circle" className="w-6 h-6" />
                <p>{autoMarkError}</p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              color="primary"
              onPress={() => {
                setShowAutoMarkStatusModal(false)
                setAutoMarkError("");
                setAutoMarkSuccess(false);

                const searchQuery = searchParams.get("q") || "";
                router.replace(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }}>
              OK
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Accept Delivery Loading Modal */}
      <Modal
        isOpen={showAcceptDeliveryLoadingModal}
        backdrop="blur"
        size="md"
        hideCloseButton
        isDismissable={false}
        classNames={{ backdrop: "bg-background/50" }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Icon icon="mdi:truck-delivery" className="text-warning" width={24} />
            <span>Processing Delivery</span>
          </ModalHeader>
          <ModalBody className="text-center py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center w-16 h-16 bg-warning-100 rounded-full">
                <Spinner size="lg" color="warning" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-default-900 mb-2">
                  Accepting Delivery
                </h3>
                <p className="text-default-600">
                  Please wait while we process the delivery acceptance and update warehouse inventory...
                </p>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Auto Mark Loading Modal */}
      <Modal
        isOpen={showAutoMarkLoadingModal}
        backdrop="blur"
        size="md"
        hideCloseButton
        isDismissable={false}
        classNames={{ backdrop: "bg-background/50" }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Icon icon="mdi:cube-outline" className="text-danger" width={24} />
            <span>Processing Item</span>
          </ModalHeader>
          <ModalBody className="text-center py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center w-16 h-16 bg-danger-100 rounded-full">
                <Spinner size="lg" color="danger" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-default-900 mb-2">
                  Marking Item as Used
                </h3>
                <p className="text-default-600">
                  Please wait while we update the warehouse bulk status...
                </p>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

            {/* Show Options Modal */}
      <Modal
        isOpen={showOptionsModal}
        onClose={() => {
          setShowOptionsModal(false);
          setOptionsDeliveryDetails(null);
          setWarehouseBulkItems([]);
          setSelectedWarehouseBulks([]);
          setSelectedWarehouseUnits([]);
        }}
        size="5xl"
        backdrop="blur"
        classNames={{
          backdrop: "bg-background/50",
          base: "bg-background h-[calc(100vh-150px)]",
          header: "border-b border-divider",
          body: "py-6",
          footer: "border-t border-divider"
        }}
      >
        <ModalContent className="flex flex-col">
          <ModalHeader className="flex-shrink-0 flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-warning-100 rounded-lg">
                <Icon icon="mdi:truck-delivery" className="text-warning-600" width={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Delivery Options</h2>
                {optionsDeliveryDetails && (
                  <p className="text-sm text-default-500 font-normal">
                    Viewing options for delivery: {optionsDeliveryDetails.name || "Delivery Item"}
                  </p>
                )}
              </div>
            </div>
          </ModalHeader>
          <ModalBody className="flex-1 p-0 overflow-hidden">
            <CustomScrollbar className="h-full p-6">
              {optionsDeliveryDetails && (
                <div className="space-y-6">
                  {/* Delivery Brief Details */}
                  <Card className="bg-background">
                    <CardHeader className="p-4 justify-between flex-wrap bg-warning-50/30">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center lg:w-16 lg:h-16 w-12 h-12 bg-warning-100 rounded-lg">
                          <Icon icon="mdi:truck-delivery" className="text-warning-600" width={24} />
                        </div>
                        <div className="flex-1 flex flex-row lg:flex-col gap-2">
                          <h2 className="text-lg font-semibold">
                            {optionsDeliveryDetails.name || "Delivery Item"}
                          </h2>
                          <div className="flex items-center gap-2">
                            <div className="lg:block hidden">
                              <Snippet
                                symbol=""
                                variant="flat"
                                color="warning"
                                size="sm"
                                className="text-xs p-1 pl-2"
                                classNames={{ copyButton: "bg-warning-100 hover:!bg-warning-200 text-sm p-0 h-6 w-6" }}
                                codeString={optionsDeliveryDetails.uuid}
                                checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                copyIcon={<Icon icon="fluent:copy-16-regular" className="text-warning-500" />}
                                onCopy={() => copyToClipboard(optionsDeliveryDetails.uuid)}
                              >
                                {optionsDeliveryDetails.uuid}
                              </Snippet>
                            </div>
                            <Button
                              size="sm"
                              variant="flat"
                              color="warning"
                              isIconOnly
                              className="lg:hidden"
                              onPress={() => copyToClipboard(optionsDeliveryDetails.uuid)}
                            >
                              <Icon icon="fluent:copy-16-regular" className="text-warning-500 text-sm" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <Chip size='sm' color={getStatusColor(optionsDeliveryDetails.status)} variant="flat">
                        {optionsDeliveryDetails.status}
                      </Chip>
                    </CardHeader>
                    <Divider />
                    <CardBody className="p-4 bg-warning-50/30">
                      <div className="grid grid-cols-1 lg:grid-rows-2 gap-3">
                        <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
                          <p className="text-sm font-medium text-warning-700">Delivery Address</p>
                          <p className="text-warning-900">{optionsDeliveryDetails.delivery_address}</p>
                        </div>
                        <div className="grid sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 gap-3">
                          <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
                            <p className="text-sm font-medium text-warning-700">Delivery Date</p>
                            <p className="text-warning-900">{formatDate(optionsDeliveryDetails.delivery_date)}</p>
                          </div>
                          <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
                            <p className="text-sm font-medium text-warning-700">Created At</p>
                            <p className="text-warning-900">{formatDate(optionsDeliveryDetails.created_at)}</p>
                          </div>
                          <div className="bg-warning-50 rounded-lg p-3 border border-warning-100">
                            <p className="text-sm font-medium text-warning-700">Last Updated</p>
                            <p className="text-warning-900">{formatDate(optionsDeliveryDetails.updated_at)}</p>
                          </div>
                        </div>
                      </div>
      
                      {optionsDeliveryDetails.notes && (
                        <div className="bg-warning-50 rounded-lg p-3 border border-warning-100 mt-3">
                          <p className="text-sm font-medium text-warning-700">Notes</p>
                          <p className="text-warning-900">{optionsDeliveryDetails.notes}</p>
                        </div>
                      )}
                    </CardBody>
                  </Card>
      
                  {/* Related Information */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Original Inventory Item */}
                    {optionsDeliveryDetails.inventory_item && (
                      <Card className="bg-background">
                        <CardHeader className="p-4 bg-secondary-50/30">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-12 h-12 bg-secondary-100 rounded-lg">
                              <Icon icon="mdi:package-variant" className="text-secondary" width={22} />
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold">Inventory Item</h3>
                              <p className="text-sm text-secondary-600">{optionsDeliveryDetails.inventory_item.name}</p>
                            </div>
                          </div>
                        </CardHeader>
                        <Divider />
                        <CardBody className="p-4 bg-secondary-50/30">
                          <div className="grid grid-cols-1 gap-3">
                            <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                              <p className="text-sm font-medium text-secondary-700">Unit</p>
                              <p className="text-secondary-900">{optionsDeliveryDetails.inventory_item.unit}</p>
                            </div>
                            {optionsDeliveryDetails.inventory_item.description && (
                              <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                                <p className="text-sm font-medium text-secondary-700">Description</p>
                                <p className="text-secondary-900">{optionsDeliveryDetails.inventory_item.description}</p>
                              </div>
                            )}
                          </div>
                        </CardBody>
                      </Card>
                    )}
      
                    {/* Warehouse Info */}
                    {optionsDeliveryDetails.warehouse && (
                      <Card className="bg-background">
                        <CardHeader className="p-4 bg-success-50/30">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-12 h-12 bg-success-100 rounded-lg">
                              <Icon icon="mdi:warehouse" className="text-success" width={22} />
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold">Warehouse</h3>
                              <p className="text-sm text-success-600">{optionsDeliveryDetails.warehouse.name}</p>
                            </div>
                          </div>
                        </CardHeader>
                        <Divider />
                        <CardBody className="p-4 bg-success-50/30">
                          <div className="bg-success-50 rounded-lg p-3 border border-success-100">
                            <p className="text-sm font-medium text-success-700">Address</p>
                            <p className="text-success-900">
                              {optionsDeliveryDetails.warehouse.address?.fullAddress || "Address not available"}
                            </p>
                          </div>
                        </CardBody>
                      </Card>
                    )}
                  </div>
      
                  {/* Accept Delivery or Warehouse Items Management */}
                  {optionsDeliveryDetails.status === "IN_TRANSIT" ? (
                    <Card className="bg-background">
                      <CardHeader className="p-4 bg-success-50/30">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-12 h-12 bg-success-100 rounded-lg">
                            <Icon icon="mdi:check-circle" className="text-success-600" width={22} />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold">Accept Delivery</h3>
                            <p className="text-sm text-default-600">Mark this delivery as delivered</p>
                          </div>
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="p-4 bg-success-50/30">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-3 p-4 bg-success-100 rounded-lg">
                            <Icon icon="mdi:information" className="text-success-600" width={20} />
                            <p className="text-success-900">
                              This will mark the delivery as delivered and add items to warehouse inventory.
                            </p>
                          </div>
                          <Button
                            color="success"
                            size="lg"
                            variant="shadow"
                            startContent={<Icon icon="mdi:check" />}
                            onPress={() => {
                              setShowOptionsModal(false);
                              handleAcceptDelivery(optionsDeliveryDetails);
                            }}
                            isDisabled={!user || user.is_admin || !isOperatorAssigned}
                            className="px-8"
                          >
                            Accept Delivery
                          </Button>
                          {(!user || user.is_admin || !isOperatorAssigned) && (
                            <Alert
                              color="danger"
                              variant="flat"
                              icon={<Icon icon="mdi:alert-circle" />}
                            >
                              {!user ? "User not logged in" :
                                user.is_admin ? "Only operators can accept deliveries" :
                                  "You are not assigned to this delivery"}
                            </Alert>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  ) : optionsDeliveryDetails.status === "DELIVERED" ? (
                    <Card className="bg-background">
                      <CardHeader className="p-4 bg-primary-50/30">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-lg">
                              <Icon icon="mdi:warehouse" className="text-primary-600" width={22} />
                            </div>
                            <h3 className="text-lg font-semibold">Warehouse Items Management</h3>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              color="primary"
                              variant="flat"
                              size="sm"
                              onPress={() => {
                                if (optionsDeliveryDetails) {
                                  loadWarehouseItemsForDelivery(optionsDeliveryDetails.uuid);
                                }
                              }}
                              isLoading={isLoadingWarehouseItems}
                              startContent={<Icon icon="mdi:refresh" />}
                            >
                              Refresh
                            </Button>
                            <Button
                              color="primary"
                              variant="flat"
                              size="sm"
                              onPress={() => {
                                if (warehouseBulkItems.length > 0) {
                                  const firstBulk = warehouseBulkItems[0];
                                  router.push(`/home/warehouse-items?warehouseItemId=${firstBulk.warehouse_item_uuid}`);
                                }
                              }}
                              startContent={<Icon icon="mdi:eye" />}
                            >
                              View Warehouse
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="px-2 py-4 bg-primary-50/30">
                        <ListLoadingAnimation
                          skeleton={
                            [
                              <Alert
                                color="primary"
                                variant="flat"
                                icon={<Icon icon="mdi:information-outline" />}
                                className="mb-4"
                              >
                                Select bulk items or individual units to mark as used. Selecting a bulk will automatically select all its units.
                              </Alert>,
                              ...[...Array(3)].map((_, index) => (
                                <Card key={index} className="border-2 border-primary-100 bg-background">
                                  <CardBody className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-3">
                                        <Skeleton className="w-5 h-5 rounded" />
                                        <div className="flex items-center gap-2">
                                          <Skeleton className="h-6 w-20 rounded" />
                                          <Skeleton className="h-5 w-16 rounded" />
                                        </div>
                                      </div>
                                      <Skeleton className="h-6 w-32 rounded" />
                                    </div>
                                    <div className="space-y-3">
                                      {[...Array(2)].map((_, unitIndex) => (
                                        <div key={unitIndex} className="p-3 bg-primary-50 rounded-lg border border-primary-100">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                              <Skeleton className="w-4 h-4 rounded" />
                                              <Skeleton className="h-5 w-16 rounded" />
                                            </div>
                                            <Skeleton className="h-6 w-28 rounded" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </CardBody>
                                </Card>
                              ))
                            ]
                          }
                          containerClassName="space-y-4"
                          condition={isLoadingWarehouseItems}
                        >
                          {warehouseBulkItems.length > 0 ? (
                            [
                              <Alert
                                color="primary"
                                variant="flat"
                                icon={<Icon icon="mdi:information-outline" />}
                                className="mb-4"
                              >
                                Select bulk items or individual units to mark as used. Selecting a bulk will automatically select all its units.
                              </Alert>,
                              ...warehouseBulkItems.map((item, index) => (
                                <Card key={item.bulk_uuid} className="p-0 bg-transparent rounded-xl overflow-hidden border-2 border-primary-100">
                                  <CardBody className="p-4 bg-background">
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-3">
                                        <Checkbox
                                          size="lg"
                                          isSelected={selectedWarehouseBulks.includes(item.bulk_uuid)}
                                          onValueChange={(isSelected) =>
                                            handleWarehouseBulkSelection(item.bulk_uuid, isSelected)
                                          }
                                          isDisabled={item.bulk_status === 'USED'}
                                          color="primary"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold text-lg">Bulk #{index + 1}</span>
                                            <Chip
                                              size="sm"
                                              color={getStatusColor(item.bulk_status)}
                                              variant="flat"
                                            >
                                              {item.bulk_status}
                                            </Chip>
                                          </div>
                                        </Checkbox>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Chip size="sm" variant="flat" color="default">
                                          {item.units?.length || 0} units
                                        </Chip>
                                        <div className="lg:block hidden">
                                          <Snippet
                                            symbol=""
                                            variant="flat"
                                            color="primary"
                                            size="sm"
                                            className="text-xs p-1 pl-2"
                                            classNames={{ copyButton: "bg-primary-100 hover:!bg-primary-200 text-sm p-0 h-6 w-6" }}
                                            codeString={item.bulk_uuid}
                                            checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                            copyIcon={<Icon icon="fluent:copy-16-regular" className="text-primary-500" />}
                                            onCopy={() => copyToClipboard(item.bulk_uuid)}
                                          >
                                            {item.bulk_uuid}
                                          </Snippet>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="flat"
                                          color="primary"
                                          isIconOnly
                                          className="lg:hidden"
                                          onPress={() => copyToClipboard(item.bulk_uuid)}
                                        >
                                          <Icon icon="fluent:copy-16-regular" className="text-primary-500 text-sm" />
                                        </Button>
                                      </div>
                                    </div>
      
                                    {/* Units */}
                                    {item.units && item.units.length > 0 && (
                                      <div>
                                        <h4 className="font-semibold text-default-900 mb-3">
                                          Units ({item.units.length})
                                        </h4>
                                        <div className="space-y-3">
                                          {item.units.map((unit: any, unitIndex: number) => (
                                            <div key={unit.uuid} className="p-3 bg-primary-50 rounded-lg border border-primary-100">
                                              <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                  <Checkbox
                                                    size="md"
                                                    isSelected={selectedWarehouseUnits.includes(unit.uuid)}
                                                    onValueChange={(isSelected) =>
                                                      handleWarehouseUnitSelection(unit.uuid, isSelected)
                                                    }
                                                    isDisabled={unit.status === 'USED' || selectedWarehouseBulks.includes(item.bulk_uuid)}
                                                    color="secondary"
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      <span className="font-medium">Unit #{unitIndex + 1}</span>
                                                      <Chip
                                                        size="sm"
                                                        color={getStatusColor(unit.status)}
                                                        variant="flat"
                                                      >
                                                        {unit.status}
                                                      </Chip>
                                                    </div>
                                                  </Checkbox>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <div className="lg:block hidden">
                                                    <Snippet
                                                      symbol=""
                                                      variant="flat"
                                                      color="secondary"
                                                      size="sm"
                                                      className="text-xs p-1 pl-2"
                                                      classNames={{ copyButton: "bg-secondary-100 hover:!bg-secondary-200 text-sm p-0 h-5 w-5" }}
                                                      codeString={unit.uuid}
                                                      checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                                                      copyIcon={<Icon icon="fluent:copy-16-regular" className="text-secondary-500" />}
                                                      onCopy={() => copyToClipboard(unit.uuid)}
                                                    >
                                                      {unit.uuid}
                                                    </Snippet>
                                                  </div>
                                                  <Button
                                                    size="sm"
                                                    variant="flat"
                                                    color="secondary"
                                                    isIconOnly
                                                    className="lg:hidden"
                                                    onPress={() => copyToClipboard(unit.uuid)}
                                                  >
                                                    <Icon icon="fluent:copy-16-regular" className="text-secondary-500 text-sm" />
                                                  </Button>
                                                </div>
                                              </div>
                                              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                <div className="bg-secondary-50 rounded-lg p-2 border border-secondary-100">
                                                  <p className="text-xs font-medium text-secondary-700">Code</p>
                                                  <p className="text-secondary-900 text-sm">{unit.code || "N/A"}</p>
                                                </div>
                                                <div className="bg-secondary-50 rounded-lg p-2 border border-secondary-100">
                                                  <p className="text-xs font-medium text-secondary-700">Location</p>
                                                  <p className="text-secondary-900 text-sm">{unit.location_code || "Not set"}</p>
                                                </div>
                                                <div className="bg-secondary-50 rounded-lg p-2 border border-secondary-100">
                                                  <p className="text-xs font-medium text-secondary-700">Created</p>
                                                  <p className="text-secondary-900 text-sm">{formatDate(unit.created_at)}</p>
                                                </div>
                                                <div className="bg-secondary-50 rounded-lg p-2 border border-secondary-100">
                                                  <p className="text-xs font-medium text-secondary-700">Updated</p>
                                                  <p className="text-secondary-900 text-sm">{formatDate(unit.updated_at)}</p>
                                                </div>
                                              </div>
                                              {unit.properties && Object.keys(unit.properties).length > 0 && (
                                                <div className="mt-3">
                                                  {renderProperties(unit.properties, "grid sm:grid-cols-2 lg:grid-cols-4 gap-2")}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </CardBody>
                                </Card>
                              )),
      
                              // Selection Summary
                              (selectedWarehouseBulks.length > 0 || selectedWarehouseUnits.length > 0) && (
                                <Card className="bg-warning-50/50 border-2 border-warning-200">
                                  <CardBody className="p-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <Icon icon="mdi:information" className="text-warning-600" width={20} />
                                        <div>
                                          <p className="font-medium text-warning-900">Selection Summary</p>
                                          <p className="text-sm text-warning-700">
                                            {selectedWarehouseBulks.length} bulk(s) and {selectedWarehouseUnits.length} individual unit(s) selected
                                          </p>
                                        </div>
                                      </div>
                                      <Button
                                        color="warning"
                                        variant="shadow"
                                        onPress={handleMarkSelectedAsUsed}
                                        isLoading={isMarkingAsUsed}
                                        startContent={<Icon icon="mdi:check-circle" />}
                                      >
                                        Confirm Mark as Used
                                      </Button>
                                    </div>
                                  </CardBody>
                                </Card>
                              )
                            ]
                          ) : (
                            [
                              <div className="text-center py-12">
                                <div className="flex items-center justify-center w-16 h-16 bg-default-100 rounded-full mx-auto mb-4">
                                  <Icon icon="mdi:package-variant-closed" className="text-default-400" width={32} />
                                </div>
                                <h3 className="text-lg font-semibold text-default-900 mb-2">
                                  No Warehouse Items Found
                                </h3>
                                <p className="text-default-500">
                                  No warehouse items were found for this delivery. Items may not have been processed yet.
                                </p>
                              </div>
                            ]
                          )}
                        </ListLoadingAnimation>
                      </CardBody>
                    </Card>
                  ) : (
                    // Other status states
                    <Card className="bg-background">
                      <CardBody className="text-center py-8">
                        <div className="flex items-center justify-center w-16 h-16 bg-default-100 rounded-full mx-auto mb-4">
                          <Icon icon="mdi:information-outline" className="text-default-400" width={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-default-900 mb-2">
                          No Actions Available
                        </h3>
                        <p className="text-default-500">
                          This delivery is in {optionsDeliveryDetails.status} status. No actions are currently available.
                        </p>
                      </CardBody>
                    </Card>
                  )}
                </div>
              )}
            </CustomScrollbar>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div >
  );
}