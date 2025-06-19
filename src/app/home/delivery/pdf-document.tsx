"use client";

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';

// Helper function to convert image URL to base64, with WebP to PNG conversion
const convertImageToBase64 = async (url: string, cropToSquare: boolean = false): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch image');

    const blob = await response.blob();

    // Check if the image is WebP format
    const isWebP = blob.type === 'image/webp' || url.toLowerCase().includes('.webp');

    if (isWebP || cropToSquare) {
      console.log(isWebP ? 'Converting WebP to PNG format...' : 'Cropping image to square...');

      // Create a canvas to convert WebP to PNG and/or crop to square
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error('Failed to create canvas context');
        return null;
      }

      const img = new window.Image();

      return new Promise((resolve, reject) => {
        img.onload = () => {
          // Handle cropping if needed
          const size = cropToSquare ? Math.min(img.width, img.height) : Math.max(img.width, img.height);
          const offsetX = cropToSquare ? (img.width - size) / 2 : 0;
          const offsetY = cropToSquare ? (img.height - size) / 2 : 0;

          // Set canvas dimensions
          canvas.width = cropToSquare ? size : img.width;
          canvas.height = cropToSquare ? size : img.height;

          // Draw the image with cropping if needed
          ctx.drawImage(
            img,
            offsetX, offsetY, // Source offset
            cropToSquare ? size : img.width, cropToSquare ? size : img.height, // Source dimensions
            0, 0, // Destination offset
            canvas.width, canvas.height // Destination dimensions
          );

          // Convert canvas to PNG base64
          try {
            const pngDataUrl = canvas.toDataURL('image/png', 1.0);
            console.log(isWebP && cropToSquare ? 'Successfully converted WebP to PNG and cropped to square' :
              isWebP ? 'Successfully converted WebP to PNG' :
                'Successfully cropped image to square');
            resolve(pngDataUrl);
          } catch (error) {
            console.error('Error converting canvas to PNG:', error);
            reject(error);
          }
        };

        img.onerror = (error) => {
          console.error('Error loading image for conversion:', error);
          reject(error);
        };

        // Create object URL from blob for image loading
        const objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;

        // Clean up object URL after image loads or fails
        const originalOnLoad = img.onload;
        const originalOnError = img.onerror;

        img.onload = (event) => {
          URL.revokeObjectURL(objectUrl);
          if (originalOnLoad) originalOnLoad.call(img, event);
        };

        img.onerror = (event) => {
          URL.revokeObjectURL(objectUrl);
          if (originalOnError) originalOnError.call(img, event);
        };
      });
    } else {
      // For non-WebP images that don't need cropping, use the original method
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch (error) {
    console.error('Error converting image to base64:', error);
    return null;
  }
};

const generateQRCodeDataURL = async (text: string): Promise<string> => {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(text, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    // Return a fallback QR code or placeholder
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  }
};

// Define styles for the PDF
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
    flexDirection: 'column',
    minHeight: '100%',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  leftHeaderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoContainer: {
    width: 40,
    height: 40,
    marginRight: 10,
    flexShrink: 0,
  },
  companyLogo: {
    width: '100%',
    height: '100%',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    color: '#4A5568',
  },
  metadataContainer: {
    backgroundColor: '#F7FAFC',
    padding: 10,
    borderRadius: 4,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#3182CE',
  },
  metadataHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  metadataContent: {
    flex: 1,
    paddingRight: 10,
  },
  metadataLogoContainer: {
    width: 60,
    height: 60,
    flexShrink: 0,
  },
  metadataLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metadataRow: {
    flexDirection: 'row',
    marginBottom: 3,
    alignItems: 'flex-start',
  },
  metadataLabel: {
    fontSize: 11,
    color: '#4A5568',
    width: 100,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  metadataValue: {
    fontSize: 11,
    color: '#1A202C',
    flex: 1,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  deliveriesContainer: {
    flex: 1,
    marginBottom: 30, // Space for footer
  },
  deliveryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  deliveryCard: {
    width: '48%',
    marginBottom: 15,
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 200,
  },
  deliveryHeader: {
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  deliveryTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  deliveryStatus: {
    fontSize: 8,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    textAlign: 'center',
    color: '#000000',
    minWidth: 60,
    flexShrink: 0,
  },
  deliveryHeaderLeft: {
    flex: 1,
    paddingRight: 8,
  },
  deliveryHeaderRight: {
    flexShrink: 0,
  },
  deliveryName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2D3748',
    flex: 1,
    paddingRight: 8,
  },
  deliveryId: {
    fontSize: 7, // Made smaller - was 9
    color: '#718096',
    marginBottom: 0,
    fontStyle: 'italic', // Added italic for distinction
  },
  deliveryUuid: {
    fontSize: 6, // Very small for UUID
    color: '#A0AEC0',
    fontFamily: 'Courier', // Monospace for UUIDs
    marginTop: 2,
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginVertical: 8,
    padding: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 4,
  },
  qrCodeImage: {
    width: 130,
    height: 130,
    marginBottom: 6,
  },
  qrCodeLabel: {
    fontSize: 8,
    color: '#4A5568',
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: 'bold',
  },
  deliveryDetail: {
    flexDirection: 'row',
    marginBottom: 3,
    alignItems: 'flex-start',
  },
  deliveryDetailLabel: {
    fontSize: 9,
    color: '#4A5568',
    width: 55, // Reduced from 60 to fit better
    fontWeight: 'bold',
    flexShrink: 0,
  },
  inventoryTypeLabel: {
    fontSize: 7,
    color: '#2D3748',
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginBottom: 4,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  groupTypeLabel: {
    backgroundColor: '#E6FFFA',
    color: '#2D3748',
  },
  itemTypeLabel: {
    backgroundColor: '#FFF5F5',
    color: '#2D3748',
  },
  deliveryDetailValue: {
    fontSize: 9,
    color: '#1A202C',
    flex: 1,
    lineHeight: 1.2, // Better line spacing
  },
  urlText: {
    fontSize: 5,
    color: '#3182CE',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: '100%',
    lineHeight: 1.3,
    wordBreak: 'break-all', // Force breaking of long words
    overflowWrap: 'break-word', // Modern CSS property for word breaking
  },
  statusAvailable: {
    backgroundColor: '#9ad0a9', // success.500
    color: '#000000',
  },
  statusOnDelivery: {
    backgroundColor: '#8ac7be', // secondary.500
    color: '#000000',
  },
  statusInWarehouse: {
    backgroundColor: '#c7b098', // default.500
    color: '#000000',
  },
  statusUsed: {
    backgroundColor: '#f89e8f', // danger.500
    color: '#000000',
  },
  statusMixed: {
    backgroundColor: '#ffdf60', // warning.500
    color: '#000000',
  },
  statusUnknown: {
    backgroundColor: '#e5e7eb', // gray.200
    color: '#000000',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    textAlign: 'center',
    fontSize: 9,
    color: '#718096',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    fontSize: 9,
    color: '#718096',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#3182CE',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  companyLogoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F7FAFC',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyLogoPlaceholderText: {
    color: '#718096',
    fontSize: 7,
    textAlign: 'center',
  },
  // Status colors matching your theme
  statusPending: {
    backgroundColor: '#d7ac82', // primary.500
    color: '#000000',
  },
  statusProcessing: {
    backgroundColor: '#ffdf60', // warning.500
    color: '#000000',
  },
  statusInTransit: {
    backgroundColor: '#8ac7be', // secondary.500
    color: '#000000',
  },
  statusDelivered: {
    backgroundColor: '#9ad0a9', // success.500
    color: '#000000',
  },
  statusCancelled: {
    backgroundColor: '#f89e8f', // danger.500
    color: '#000000',
  },
  statusDefault: {
    backgroundColor: '#c7b098', // default.500
    color: '#000000',
  },
  deliveryPriority: {
    fontSize: 8,
    color: '#4A5568',
    marginBottom: 3,
    fontWeight: 'bold',
  },
  priorityHigh: {
    color: '#f89e8f', // danger.500
  },
  priorityMedium: {
    color: '#ffdf60', // warning.500
  },
  priorityLow: {
    color: '#9ad0a9', // success.500
  },
});

// Update the getStatusStyle function to handle inventory item statuses
const getStatusStyle = (status: string, isInventoryItem: boolean = false) => {
  const normalizedStatus = status?.toLowerCase() || '';

  if (isInventoryItem) {
    // Handle inventory item statuses
    switch (normalizedStatus) {
      case 'available':
        return [styles.deliveryStatus, styles.statusAvailable];
      case 'on_delivery':
      case 'on-delivery':
        return [styles.deliveryStatus, styles.statusOnDelivery];
      case 'in_warehouse':
      case 'in-warehouse':
        return [styles.deliveryStatus, styles.statusInWarehouse];
      case 'used':
        return [styles.deliveryStatus, styles.statusUsed];
      case 'mixed':
      case 'mixed_available':
      case 'mixed_on_delivery':
      case 'mixed_in_warehouse':
      case 'mixed_used':
        return [styles.deliveryStatus, styles.statusMixed];
      default:
        return [styles.deliveryStatus, styles.statusUnknown];
    }
  }

  // Handle delivery statuses (existing logic)
  switch (normalizedStatus) {
    case 'pending':
    case 'awaiting':
      return [styles.deliveryStatus, styles.statusPending];
    case 'processing':
      return [styles.deliveryStatus, styles.statusProcessing];
    case 'in_transit':
    case 'in-transit':
    case 'shipped':
    case 'on_way':
      return [styles.deliveryStatus, styles.statusInTransit];
    case 'delivered':
    case 'completed':
    case 'received':
      return [styles.deliveryStatus, styles.statusDelivered];
    case 'cancelled':
    case 'canceled':
    case 'failed':
      return [styles.deliveryStatus, styles.statusCancelled];
    default:
      return [styles.deliveryStatus, styles.statusDefault];
  }
};

const getPriorityStyle = (priority: string) => {
  const normalizedPriority = priority?.toLowerCase() || '';

  switch (normalizedPriority) {
    case 'high':
    case 'urgent':
      return [styles.deliveryPriority, styles.priorityHigh];
    case 'medium':
    case 'normal':
      return [styles.deliveryPriority, styles.priorityMedium];
    case 'low':
      return [styles.deliveryPriority, styles.priorityLow];
    default:
      return [styles.deliveryPriority];
  }
};

const formatStatusText = (status: string, isInventoryItem: boolean = false) => {
  if (!status) return 'UNKNOWN';

  if (isInventoryItem) {
    // Handle mixed statuses for groups
    if (status.startsWith('MIXED_')) {
      const baseStatus = status.replace('MIXED_', '');
      return `MIXED (${baseStatus.replace('_', ' ')})`;
    }

    // Format individual item statuses
    return status.replace('_', ' ').toUpperCase();
  }

  // Format delivery statuses
  return status.replace('_', ' ').toUpperCase();
};


interface DeliveryQRPDFProps {
  deliveries: any[];
  companyName: string;
  companyLogoUrl?: string;
  dateGenerated: string;
  companyLogoBase64?: string;
  ropicLogoBase64?: string;
  pageSize?: "A4" | "A3" | "LETTER" | "LEGAL";
  qrCodeDataUrls?: { [key: string]: string };
  inventoryInclusionType?: string; // Updated prop name and type
}

// PDF Document Component
export const DeliveryQRPDF = ({
  deliveries,
  companyName,
  companyLogoUrl,
  dateGenerated,
  companyLogoBase64,
  ropicLogoBase64,
  pageSize = "A4",
  qrCodeDataUrls = {},
  inventoryInclusionType = "warehouse_inventories_only" // Updated prop with default value
}: DeliveryQRPDFProps) => {
  // Calculate total items for metadata
  const totalDeliveries = deliveries.length;
  const totalInventoryItems = inventoryInclusionType !== 'warehouse_inventories_only'
    ? deliveries.reduce((sum, delivery) => sum + (delivery.inventoryItemsForExport?.length || 0), 0)
    : 0;
  const grandTotal = totalDeliveries + totalInventoryItems;

  // Get inclusion type description
  const getInclusionTypeDescription = (type: string) => {
    switch (type) {
      case 'warehouse_inventories_only': return 'Warehouse Inventory QR Codes Only';
      case 'all_items': return 'with All Individual Items';
      case 'all_groups': return 'with All Groups Only';
      case 'items_and_groups': return 'with All Items + All Groups';
      case 'grouped_items': return 'with Grouped Items';
      default: return '';
    }
  };

  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <View style={styles.leftHeaderSection}>
            {/* RoPIC Logo */}
            <View style={styles.logoContainer}>
              {ropicLogoBase64 ? (
                <Image
                  style={styles.companyLogo}
                  src={ropicLogoBase64}
                  cache={false}
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoPlaceholderText}>RoPIC</Text>
                </View>
              )}
            </View>

            <View style={styles.headerContent}>
              <Text style={styles.title}>
                Warehouse Inventory QR Code Report
              </Text>
              <Text style={styles.subtitle}>
                {getInclusionTypeDescription(inventoryInclusionType)} • Reorder Point Inventory Control Management System
              </Text>
            </View>
          </View>
        </View>

        {/* Metadata Section with Company Logo */}
        <View style={styles.metadataContainer}>
          <View style={styles.metadataHeader}>
            <View style={styles.metadataContent}>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Company:</Text>
                <Text style={styles.metadataValue}>{companyName || 'Unknown Company'}</Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Deliveries:</Text>
                <Text style={styles.metadataValue}>{totalDeliveries}</Text>
              </View>
              {inventoryInclusionType !== 'warehouse_inventories_only' && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Inventory Items:</Text>
                  <Text style={styles.metadataValue}>{totalInventoryItems}</Text>
                </View>
              )}
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Total QR Codes:</Text>
                <Text style={styles.metadataValue}>{grandTotal}</Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Inclusion Type:</Text>
                <Text style={styles.metadataValue}>{getInclusionTypeDescription(inventoryInclusionType)}</Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Generated:</Text>
                <Text style={styles.metadataValue}>{dateGenerated}</Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Page Size:</Text>
                <Text style={styles.metadataValue}>{pageSize}</Text>
              </View>
            </View>

            {/* Company Logo in Metadata Section */}
            <View style={styles.metadataLogoContainer}>
              {companyLogoBase64 ? (
                <Image
                  style={styles.metadataLogo}
                  src={companyLogoBase64}
                  cache={false}
                />
              ) : (
                <View style={styles.companyLogoPlaceholder}>
                  <Text style={styles.companyLogoPlaceholderText}>Company{'\n'}Logo</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Deliveries Section - Fixed */}
        <View style={styles.deliveriesContainer}>
          <Text style={styles.sectionHeader}>
            QR Codes ({grandTotal} total{inventoryInclusionType !== 'warehouse_inventories_only' ? ` - ${totalDeliveries} deliveries + ${totalInventoryItems} items` : ` deliveries`})
          </Text>

          <View style={styles.deliveryGrid}>
            {deliveries.map((delivery, deliveryIndex) => {
              const deliveryId = delivery.uuid || `DEL-${deliveryIndex + 1}`;
              const qrCodeDataUrl = qrCodeDataUrls[deliveryId] || '';

              // Create an array to hold all QR codes for this delivery
              const allQRCodes = [];

              // Add the main delivery QR code
              allQRCodes.push({
                id: deliveryId,
                type: 'delivery',
                title: delivery.itemName || delivery.name || "Delivery Item",
                subtitle: `Delivery: ${delivery.itemName || delivery.name || "Unknown"}`,
                uuid: deliveryId,
                qrUrl: delivery.qrUrl,
                qrCodeDataUrl,
                delivery,
                status: delivery.status || delivery.delivery_status
              });

              // Add inventory item/group QR codes based on inclusion type
              if (inventoryInclusionType !== 'warehouse_inventories_only' && delivery.inventoryItemsForExport && Array.isArray(delivery.inventoryItemsForExport)) {
                delivery.inventoryItemsForExport.forEach((item: any, itemIndex: number) => {
                  // Safety checks for undefined items
                  if (!item || !item.id || !item.qrUrl) {
                    console.warn(`Skipping invalid inventory item at index ${itemIndex}:`, item);
                    return;
                  }

                  const itemQrCodeDataUrl = qrCodeDataUrls[`${deliveryId}_${item.type}_${item.id}`] || '';

                  allQRCodes.push({
                    id: `${deliveryId}_${item.type}_${item.id}`,
                    type: item.type || 'item',
                    title: item.name || item.itemCode || `${item.type === 'group' ? 'Group' : 'Item'} ${item.id}`,
                    subtitle: `${item.type === 'group' ? 'Inventory Group' : 'Inventory Item'} from ${delivery.itemName || delivery.name || "Unknown"}`,
                    uuid: item.id,
                    qrUrl: item.qrUrl,
                    qrCodeDataUrl: itemQrCodeDataUrl,
                    delivery,
                    status: item.status || 'UNKNOWN', // UPDATED: Use actual item/group status
                    inventoryItem: {
                      ...item,
                      itemCount: item.itemCount || (item.items ? item.items.length : undefined),
                      groupId: item.groupId || item.group_id,
                      unitValue: item.unitValue || item.unit_value,
                      unit: item.unit || '',
                      itemCode: item.itemCode || item.item_code || 'N/A',
                      status: item.status || 'UNKNOWN'
                    }
                  });
                });
              }

              // Render all QR codes for this delivery
              return allQRCodes.map((qrCode: any, qrIndex) => (
                <View key={qrCode.id} style={styles.deliveryCard} wrap={false}>
                  <View style={styles.deliveryHeader}>
                    {/* Inventory Type Label for non-delivery items */}
                    {qrCode.type !== 'delivery' && (
                      <Text style={[
                        styles.inventoryTypeLabel,
                        qrCode.type === 'group' ? styles.groupTypeLabel : styles.itemTypeLabel
                      ]}>
                        {qrCode.type === 'group' ? 'INVENTORY GROUP' : 'INVENTORY ITEM'}
                      </Text>
                    )}

                    {/* Title and status on same row */}
                    <View style={styles.deliveryTitleRow}>
                      <Text style={styles.deliveryName}>
                        {qrCode.title}
                      </Text>
                      <Text style={getStatusStyle(
                        qrCode.type === 'delivery'
                          ? (delivery.status || delivery.delivery_status || 'Unknown')
                          : qrCode.status,
                        qrCode.type !== 'delivery' // isInventoryItem flag
                      )}>
                        {qrCode.type === 'delivery'
                          ? formatStatusText(delivery.status || delivery.delivery_status || 'Unknown', false)
                          : formatStatusText(qrCode.status, true) // UPDATED: Use actual status with proper formatting
                        }
                      </Text>
                    </View>

                    {/* Subtitle */}
                    <Text style={styles.deliveryId}>
                      {qrCode.subtitle}
                    </Text>

                    {/* UUID - Made smaller and less prominent */}
                    <Text style={styles.deliveryUuid}>
                      {qrCode.type === 'delivery' ? 'Delivery' : qrCode.type === 'group' ? 'Group' : 'Item'} ID: {qrCode.uuid}
                    </Text>
                  </View>

                  {/* Additional Item Details */}
                  {qrCode.type === 'item' && qrCode.inventoryItem && (
                    <>
                      {qrCode.inventoryItem.itemCode && qrCode.inventoryItem.itemCode !== 'N/A' && (
                        <View style={styles.deliveryDetail}>
                          <Text style={styles.deliveryDetailLabel}>Code:</Text>
                          <Text style={styles.deliveryDetailValue}>
                            {qrCode.inventoryItem.itemCode}
                          </Text>
                        </View>
                      )}

                      {qrCode.inventoryItem.unitValue && qrCode.inventoryItem.unit && (
                        <View style={styles.deliveryDetail}>
                          <Text style={styles.deliveryDetailLabel}>Amount:</Text>
                          <Text style={styles.deliveryDetailValue}>
                            {qrCode.inventoryItem.unitValue} {qrCode.inventoryItem.unit}
                          </Text>
                        </View>
                      )}

                      {qrCode.inventoryItem.groupId && (
                        <View style={styles.deliveryDetail}>
                          <Text style={styles.deliveryDetailLabel}>Group:</Text>
                          <Text style={styles.deliveryDetailValue}>
                            Group {qrCode.inventoryItem.groupId}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {/* Group Details */}
                  {qrCode.type === 'group' && qrCode.inventoryItem && (
                    <>
                      {qrCode.inventoryItem.itemCount && (
                        <View style={styles.deliveryDetail}>
                          <Text style={styles.deliveryDetailLabel}>Items:</Text>
                          <Text style={styles.deliveryDetailValue}>
                            {qrCode.inventoryItem.itemCount} items in group
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {/* Common Delivery Details */}
                  <View style={styles.deliveryDetail}>
                    <Text style={styles.deliveryDetailLabel}>Date:</Text>
                    <Text style={styles.deliveryDetailValue}>
                      {delivery.deliveryDate || delivery.delivery_date
                        ? new Date(delivery.deliveryDate || delivery.delivery_date).toLocaleDateString()
                        : 'N/A'}
                    </Text>
                  </View>

                  <View style={styles.deliveryDetail}>
                    <Text style={styles.deliveryDetailLabel}>Location:</Text>
                    <Text style={styles.deliveryDetailValue}>
                      {delivery.warehouse_name || delivery.delivery_address || 'N/A'}
                    </Text>
                  </View>

                  {/* QR Code Section with improved URL wrapping */}
                  <View style={styles.qrCodeContainer}>
                    <Text style={styles.qrCodeLabel}>
                      {qrCode.type === 'delivery'
                        ? 'Scan to Mark Warehouse Inventory as Used'
                        : qrCode.type === 'group'
                          ? 'Scan to Mark Group as Used'
                          : 'Scan to Mark Item as Used'
                      }
                    </Text>
                    {qrCode.qrCodeDataUrl ? (
                      <Image
                        style={styles.qrCodeImage}
                        src={qrCode.qrCodeDataUrl}
                        cache={false}
                      />
                    ) : (
                      <View style={[styles.qrCodeImage, { backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 8, color: '#666' }}>QR Code{'\n'}Not Available</Text>
                      </View>
                    )}
                    {/* UPDATED: Improved URL text wrapping */}
                    <Text style={styles.urlText}>
                      {/* Break the URL at logical points and add line breaks */}
                      {(qrCode.qrUrl || 'No URL available')
                        .replace(/([?&])/g, '$1\n') // Add line breaks after ? and &
                        .replace(/(.{30})/g, '$1\n') // Break every 30 characters as fallback
                        .replace(/\n+/g, '\n') // Remove multiple consecutive line breaks
                        .trim()
                      }
                    </Text>
                  </View>
                </View>
              ));
            })}
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated on {dateGenerated} • RoPIC Delivery Management System • Page Size: {pageSize}
          {inventoryInclusionType !== 'warehouse_inventories_only' ? ` • ${getInclusionTypeDescription(inventoryInclusionType)}` : ''}
        </Text>

        {/* Page Number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
};

// Helper function to create a blob for download
export const generatePdfBlob = async (props: DeliveryQRPDFProps) => {
  let updatedProps = { ...props };

  try {
    // Convert RoPIC logo URL to base64
    const ropicLogoUrl = 'https://ropic.vercel.app/logo.png';
    const ropicLogoBase64 = await convertImageToBase64(ropicLogoUrl);

    if (ropicLogoBase64) {
      console.log('Successfully converted RoPIC logo to base64');
      (updatedProps as any).ropicLogoBase64 = ropicLogoBase64;
    } else {
      console.log('Failed to convert RoPIC logo to base64, will use placeholder');
    }

    // Convert company logo URL to base64 if provided and crop to square
    if (props.companyLogoUrl && !props.companyLogoBase64) {
      const base64Image = await convertImageToBase64(props.companyLogoUrl, true);

      if (base64Image) {
        console.log('Successfully converted company logo to base64 and cropped to square');
        updatedProps.companyLogoBase64 = base64Image;
      } else {
        console.log('Failed to convert company logo to base64, will use placeholder');
      }
    }

    // Generate QR codes for all deliveries and their inventory items
    const qrCodeDataUrls: { [key: string]: string } = {};

    for (const delivery of props.deliveries) {
      const deliveryId = delivery.uuid || `DEL-${props.deliveries.indexOf(delivery) + 1}`;

      // Generate main delivery QR code
      const qrUrl = delivery.qrUrl || '';
      if (qrUrl) {
        try {
          const qrCodeDataUrl = await generateQRCodeDataURL(qrUrl);
          qrCodeDataUrls[deliveryId] = qrCodeDataUrl;
          console.log(`Generated QR code for delivery ${deliveryId}`);
        } catch (error) {
          console.error(`Failed to generate QR code for delivery ${deliveryId}:`, error);
        }
      }

      // Generate QR codes for inventory items if inclusion type is not warehouse_inventories_only
      if (props.inventoryInclusionType !== 'warehouse_inventories_only' && delivery.inventoryItemsForExport && Array.isArray(delivery.inventoryItemsForExport)) {
        for (const item of delivery.inventoryItemsForExport) {
          // Safety check for item validity
          if (!item || !item.id || !item.qrUrl) {
            console.warn('Skipping invalid item for QR generation:', item);
            continue;
          }

          const itemKey = `${deliveryId}_${item.type}_${item.id}`;
          try {
            const itemQrCodeDataUrl = await generateQRCodeDataURL(item.qrUrl);
            qrCodeDataUrls[itemKey] = itemQrCodeDataUrl;
            console.log(`Generated QR code for ${item.type} ${item.id} in delivery ${deliveryId}`);
          } catch (error) {
            console.error(`Failed to generate QR code for ${item.type} ${item.id} in delivery ${deliveryId}:`, error);
          }
        }
      }
    }

    updatedProps.qrCodeDataUrls = qrCodeDataUrls;

    return await pdf(<DeliveryQRPDF {...updatedProps} />).toBlob();
  } catch (error) {
    console.error('Error generating PDF blob:', error);
    // Return PDF without images if conversion fails
    return await pdf(<DeliveryQRPDF {...updatedProps} />).toBlob();
  }
};