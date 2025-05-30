"use client";

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import { ReorderPointLog } from './actions';

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

// Define styles for the PDF - Updated to match DeliveryQRPDF
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
    width: 50,
    height: 50,
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
    width: 80,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  metadataValue: {
    fontSize: 11,
    color: '#1A202C',
    flex: 1,
  },
  formulaContainer: {
    backgroundColor: '#EBF8FF',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4299E1',
  },
  formula: {
    fontSize: 10,
    color: '#2C5282',
    fontStyle: 'italic',
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
  itemsContainer: {
    flex: 1,
    marginBottom: 30, // Space for footer
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  itemCard: {
    width: '48%',
    marginBottom: 15,
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 200,
  },
  itemHeader: {
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  itemName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2D3748',
    flex: 1,
    paddingRight: 8,
  },
  itemWarehouse: {
    fontSize: 9,
    color: '#718096',
    marginBottom: 3,
  },
  statusChip: {
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
  itemDetail: {
    flexDirection: 'row',
    marginBottom: 3,
    alignItems: 'flex-start',
  },
  itemDetailLabel: {
    fontSize: 9,
    color: '#4A5568',
    width: 70,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  itemDetailValue: {
    fontSize: 9,
    color: '#1A202C',
    flex: 1,
  },
  metricsContainer: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  metricLabel: {
    fontSize: 7,
    color: '#718096',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
  },
  metricValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  metricMainValue: {
    fontSize: 9,
    color: '#2D3748',
    fontWeight: 'bold',
  },
  metricUnit: {
    fontSize: 6,
    color: '#718096',
    marginLeft: 1,
  },
  calculationContainer: {
    backgroundColor: '#F0FFF4',
    padding: 5,
    borderRadius: 4,
    marginTop: 6,
  },
  calculationText: {
    fontSize: 8,
    color: '#2F855A',
  },
  notes: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#718096',
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderTopStyle: 'dashed',
  },
  tableContainer: {
    marginTop: 10,
    marginBottom: 20,
    breakInside: 'avoid',
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    breakInside: 'avoid',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    borderBottomStyle: 'solid',
    minHeight: 24,
  },
  tableHeader: {
    backgroundColor: '#F7FAFC',
  },
  tableHeaderCell: {
    fontSize: 10,
    padding: 6,
    fontWeight: 'bold',
    color: '#4A5568',
  },
  tableCell: {
    fontSize: 9,
    padding: 6,
    color: '#2D3748',
  },
  warningStatus: {
    backgroundColor: '#ffdf60', // warning.500
    color: '#000000',
  },
  criticalStatus: {
    backgroundColor: '#f89e8f', // danger.500
    color: '#000000',
  },
  successStatus: {
    backgroundColor: '#9ad0a9', // success.500
    color: '#000000',
  },
  defaultStatus: {
    backgroundColor: '#c7b098', // default.500
    color: '#000000',
  },
  deliverySection: {
    breakInside: 'avoid',
    marginTop: 15,
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
});

// Helper function to format status
const formatStatus = (status: string) => {
  return status.replaceAll('_', ' ');
};

// Helper function to get status style
const getStatusStyle = (status: string) => {
  switch (status) {
    case 'IN_STOCK':
      return [styles.statusChip, styles.successStatus];
    case 'WARNING':
      return [styles.statusChip, styles.warningStatus];
    case 'CRITICAL':
    case 'OUT_OF_STOCK':
      return [styles.statusChip, styles.criticalStatus];
    default:
      return [styles.statusChip, styles.defaultStatus];
  }
};


interface ReorderPointPDFProps {
  logs: (ReorderPointLog & {
    inventoryItemName: string;
    warehouseName: string;
  })[];
  deliveryHistory: any[];
  warehouseName: string;
  companyName: string;
  companyLogoUrl?: string;
  dateGenerated: string;
  inventoryNameMap?: Record<string, string>;
  companyLogoBase64?: string;
  ropicLogoBase64?: string;
}

// PDF Document Component
export const ReorderPointPDF = ({
  logs,
  deliveryHistory,
  warehouseName,
  companyName,
  companyLogoUrl,
  dateGenerated,
  inventoryNameMap,
  companyLogoBase64,
  ropicLogoBase64
}: ReorderPointPDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header Section - Consistent with DeliveryQRPDF */}
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
            <Text style={styles.title}>Reorder Point Report</Text>
            <Text style={styles.subtitle}>Reorder Point Inventory Control Management System</Text>
          </View>
        </View>
      </View>

      {/* Metadata Section with Company Logo - Consistent with DeliveryQRPDF */}
      <View style={styles.metadataContainer}>
        <View style={styles.metadataHeader}>
          <View style={styles.metadataContent}>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Company:</Text>
              <Text style={styles.metadataValue}>{companyName}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Warehouse:</Text>
              <Text style={styles.metadataValue}>{warehouseName}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Total Items:</Text>
              <Text style={styles.metadataValue}>{logs.length}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Generated:</Text>
              <Text style={styles.metadataValue}>{dateGenerated}</Text>
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

        <View style={styles.formulaContainer}>
          <Text style={styles.formula}>
            Reorder Point = (Average Daily Sales × Lead Time) + Safety Stock
          </Text>
        </View>
      </View>

      {/* Inventory Items Section - Grid layout like DeliveryQRPDF */}
      <View style={styles.itemsContainer}>
        <Text style={styles.sectionHeader}>Inventory Items ({logs.length} items)</Text>

        <View style={styles.itemsGrid}>
          {logs.map((log, index) => (
            <View key={index} style={styles.itemCard} wrap={false}>
              <View style={styles.itemHeader}>
                {/* Item name and status on same row */}
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemName}>
                    {log.inventoryItemName}
                  </Text>
                  <Text style={getStatusStyle(log.status)}>
                    {formatStatus(log.status)}
                  </Text>
                </View>

                {/* Warehouse on separate row */}
                <Text style={styles.itemWarehouse}>
                  Warehouse: {log.warehouseName}
                </Text>
              </View>

              <View style={styles.itemDetail}>
                <Text style={styles.itemDetailLabel}>Current:</Text>
                <Text style={styles.itemDetailValue}>{log.current_stock || 0} {log.unit}</Text>
              </View>

              <View style={styles.itemDetail}>
                <Text style={styles.itemDetailLabel}>Reorder:</Text>
                <Text style={styles.itemDetailValue}>{Math.ceil(log.reorder_point || 0)} {log.unit}</Text>
              </View>

              <View style={styles.metricsContainer}>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Avg Daily Sales</Text>
                    <View style={styles.metricValueContainer}>
                      <Text style={styles.metricMainValue}>
                        {log.average_daily_unit_sales?.toFixed(2) || "0.00"}
                      </Text>
                      <Text style={styles.metricUnit}>
                        {log.unit}/day
                      </Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Lead Time</Text>
                    <View style={styles.metricValueContainer}>
                      <Text style={styles.metricMainValue}>
                        {log.lead_time_days?.toFixed(1) || "0.0"}
                      </Text>
                      <Text style={styles.metricUnit}>
                        days
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Safety Stock</Text>
                    <View style={styles.metricValueContainer}>
                      <Text style={styles.metricMainValue}>
                        {log.safety_stock?.toFixed(2) || "0.00"}
                      </Text>
                      <Text style={styles.metricUnit}>
                        {log.unit}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Unit Type</Text>
                    <Text style={styles.metricMainValue}>{log.unit}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.calculationContainer}>
                <Text style={styles.calculationText}>
                  Calc: ({log.average_daily_unit_sales?.toFixed(2) || "0.00"} × {log.lead_time_days?.toFixed(1) || "0.0"}) + {log.safety_stock?.toFixed(2) || "0.00"} = {Math.ceil(log.reorder_point || 0)}
                </Text>
              </View>

              {log.notes && (
                <Text style={styles.notes}>Notes: {log.notes}</Text>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Delivery History Section */}
      {deliveryHistory.length > 0 && (
        <View style={styles.deliverySection}>
          <Text style={styles.sectionHeader}>Delivery History</Text>

          <View style={styles.tableContainer}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <View style={[styles.tableHeaderCell, { flex: 1.65 }]}>
                  <Text>Item</Text>
                </View>
                <View style={[styles.tableHeaderCell, { flex: 0.6 }]}>
                  <Text>Date</Text>
                </View>
                <View style={[styles.tableHeaderCell, { flex: 0.85 }]}>
                  <Text>Status</Text>
                </View>
                <View style={[styles.tableHeaderCell, { flex: 1.1 }]}>
                  <Text>Location</Text>
                </View>
                <View style={[styles.tableHeaderCell, { flex: 1.65 }]}>
                  <Text>Operators</Text>
                </View>
              </View>

              {deliveryHistory.map((delivery, index) => (
                <View key={index} style={[
                  styles.tableRow,
                  index % 2 === 1 ? { backgroundColor: '#F7FAFC' } : {}
                ]} wrap={false}>
                  <View style={[styles.tableCell, { flex: 1.65 }]}>
                    <Text>{delivery.inventoryItemName || inventoryNameMap?.[delivery.inventory_uuid] || "Unknown Item"}</Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 0.6 }]}>
                    <Text>{new Date(delivery.delivery_date).toLocaleDateString()}</Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 0.85 }]}>
                    <Text>{delivery.status}</Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 1.1 }]}>
                    <Text>{Array.isArray(delivery.location_codes) ? delivery.location_codes.join(", ") : delivery.location_codes || "N/A"}</Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 1.65 }]}>
                    <Text>
                      {delivery.recipient_name || 'No Operators Assigned'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Footer - Consistent with DeliveryQRPDF */}
      <Text style={styles.footer}>
        Generated on {dateGenerated} • RoPIC System
      </Text>

      {/* Page Number - Consistent with DeliveryQRPDF */}
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        fixed
      />
    </Page>
  </Document>
);

// Updated helper function to create a blob for download with improved image conversion
export const generatePdfBlob = async (props: ReorderPointPDFProps) => {
  let updatedProps = { ...props };

  try {
    // Convert RoPIC logo URL to base64
    const ropicLogoUrl = 'https://ropic.vercel.app/logo.png';
    console.log('Converting RoPIC logo URL to base64:', ropicLogoUrl);
    const ropicLogoBase64 = await convertImageToBase64(ropicLogoUrl);

    if (ropicLogoBase64) {
      console.log('Successfully converted RoPIC logo to base64');
      (updatedProps as any).ropicLogoBase64 = ropicLogoBase64;
    } else {
      console.log('Failed to convert RoPIC logo to base64, will use placeholder');
    }

    // Convert company logo URL to base64 if provided and crop to square
    if (props.companyLogoUrl && !props.companyLogoBase64) {
      console.log('Converting company logo URL to base64 and cropping to square:', props.companyLogoUrl);
      const base64Image = await convertImageToBase64(props.companyLogoUrl, true); // Enable square cropping

      if (base64Image) {
        console.log('Successfully converted company logo to base64 and cropped to square');
        updatedProps.companyLogoBase64 = base64Image;
      } else {
        console.log('Failed to convert company logo to base64, will use placeholder');
      }
    }

    return await pdf(<ReorderPointPDF {...updatedProps} />).toBlob();
  } catch (error) {
    console.error('Error generating PDF blob:', error);
    // Return PDF without images if conversion fails
    return await pdf(<ReorderPointPDF {...updatedProps} />).toBlob();
  }
};