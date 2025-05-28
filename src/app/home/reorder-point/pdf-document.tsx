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
      const img = new window.Image();
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          let sourceX = 0;
          let sourceY = 0;
          let sourceSize = Math.min(img.width, img.height);
          
          if (cropToSquare) {
            // Calculate center crop coordinates for square
            sourceX = (img.width - sourceSize) / 2;
            sourceY = (img.height - sourceSize) / 2;
            
            // Set canvas to square dimensions
            canvas.width = sourceSize;
            canvas.height = sourceSize;
          } else {
            // Use original dimensions if not cropping
            canvas.width = img.width;
            canvas.height = img.height;
            sourceSize = img.width;
          }
          
          // Draw image on canvas (cropped to square if requested)
          ctx?.drawImage(
            img,
            sourceX, sourceY, sourceSize, cropToSquare ? sourceSize : img.height,
            0, 0, canvas.width, canvas.height
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

// Define styles for the PDF
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottom: '1px solid #EAEAEA',
  },
  leftHeaderSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  logoContainer: {
    width: 50,
    height: 50,
    marginRight: 15,
    flexShrink: 0,
  },
  companyLogo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  headerContent: {
    flex: 1,
  },
  headerTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A202C',
    marginRight: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#4A5568',
  },
  // Updated metadata styles to include logo
  metadataContainer: {
    backgroundColor: '#F7FAFC',
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
    borderLeft: '4px solid #3182CE',
  },
  metadataHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  metadataContent: {
    flex: 1,
  },
  metadataLogoContainer: {
    width: 60,
    height: 60,
    marginLeft: 15,
    flexShrink: 0,
  },
  metadataLogo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metadataRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  metadataLabel: {
    fontSize: 12,
    color: '#4A5568',
    width: 100,
    fontWeight: 'bold',
  },
  metadataValue: {
    fontSize: 12,
    color: '#1A202C',
    flex: 1,
  },
  formulaContainer: {
    backgroundColor: '#EBF8FF',
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
    borderLeft: '4px solid #4299E1',
  },
  formula: {
    fontSize: 12,
    color: '#2C5282',
    fontStyle: 'italic',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 15,
    marginTop: 25,
    paddingBottom: 8,
    borderBottom: '2px solid #E2E8F0',
  },
  itemsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemCard: {
    width: '48%',
    marginBottom: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1A202C',
    flex: 1,
    marginRight: 6,
  },
  itemDetail: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  itemDetailLabel: {
    fontSize: 10,
    color: '#4A5568',
    width: 85,
    fontWeight: 'bold',
  },
  itemDetailValue: {
    fontSize: 10,
    color: '#1A202C',
    flex: 1,
  },
  notes: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#718096',
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px dashed #E2E8F0',
  },
  calculationContainer: {
    backgroundColor: '#F0FFF4',
    padding: 6,
    borderRadius: 4,
    marginTop: 6,
  },
  calculationText: {
    fontSize: 9,
    color: '#2F855A',
  },
  statusChip: {
    padding: '3 6',
    borderRadius: 3,
    fontSize: 9,
    alignSelf: 'flex-start',
  },
  metricsContainer: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  metricLabel: {
    fontSize: 8,
    color: '#718096',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 10,
    color: '#2D3748',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.2,
  },
  metricValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  metricMainValue: {
    fontSize: 10,
    color: '#2D3748',
    fontWeight: 'bold',
  },
  metricUnit: {
    fontSize: 7,
    color: '#718096',
    marginLeft: 2,
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
    fontSize: 11,
    padding: 8,
    fontWeight: 'bold',
    color: '#4A5568',
  },
  tableCell: {
    fontSize: 10,
    padding: 8,
    color: '#2D3748',
  },
  warningStatus: {
    backgroundColor: '#FEFCBF',
    color: '#744210',
  },
  criticalStatus: {
    backgroundColor: '#FED7D7',
    color: '#822727',
  },
  successStatus: {
    backgroundColor: '#C6F6D5',
    color: '#22543D',
  },
  deliverySection: {
    breakInside: 'avoid',
    marginTop: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    fontSize: 10,
    color: '#718096',
    textAlign: 'center',
    paddingTop: 10,
    borderTop: '1px solid #E2E8F0',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    fontSize: 10,
    color: '#A0AEC0',
  },
});

// Helper function to format status
const formatStatus = (status: string) => {
  return status.replaceAll('_', ' ');
};

// Helper function to get status style
const getStatusStyle = (status: string) => {
  switch (status) {
    case 'IN_STOCK': return styles.successStatus;
    case 'WARNING': return styles.warningStatus;
    case 'CRITICAL':
    case 'OUT_OF_STOCK':
      return styles.criticalStatus;
    default: return {};
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
  companyLogoBase64?: string; // Add this prop for base64 image
  ropicLogoBase64?: string; // Add this prop for RoPIC logo base64
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
      {/* Header Section - Simplified without company logo */}
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
              <View style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#3182CE',
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 'bold'
                }}>RoPIC</Text>
              </View>
            )}
          </View>

          <View style={styles.headerContent}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Reorder Point Report</Text>
            </View>
            <Text style={styles.subtitle}>Reorder Point Inventory Control Management System</Text>
          </View>
        </View>
      </View>

      {/* Metadata Section with Company Logo */}
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
              <View style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#F7FAFC',
                borderRadius: 4,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text style={{
                  color: '#718096',
                  fontSize: 9,
                  textAlign: 'center'
                }}>Company{'\n'}Logo</Text>
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

      {/* Inventory Items Section */}
      <View>
        <Text style={styles.sectionHeader}>Inventory Items</Text>

        <View style={styles.itemsContainer}>
          {logs.map((log, index) => (
            <View key={index} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{log.inventoryItemName}</Text>
                <View style={[styles.statusChip, getStatusStyle(log.status)]}>
                  <Text>{formatStatus(log.status)}</Text>
                </View>
              </View>

              <View style={styles.itemDetail}>
                <Text style={styles.itemDetailLabel}>Warehouse:</Text>
                <Text style={styles.itemDetailValue}>{log.warehouseName}</Text>
              </View>

              <View style={styles.itemDetail}>
                <Text style={styles.itemDetailLabel}>Current Stock:</Text>
                <Text style={styles.itemDetailValue}>{log.current_stock || 0} {log.unit}</Text>
              </View>

              <View style={styles.itemDetail}>
                <Text style={styles.itemDetailLabel}>Reorder Point:</Text>
                <Text style={styles.itemDetailValue}>{Math.ceil(log.reorder_point || 0)} {log.unit}</Text>
              </View>

              <View style={styles.metricsContainer}>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Average Daily Sales</Text>
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
                    <Text style={styles.metricValue}>{log.unit}</Text>
                  </View>
                </View>
              </View>

              {log.notes && (
                <Text style={styles.notes}>Notes: {log.notes}</Text>
              )}

              <View style={styles.calculationContainer}>
                <Text style={styles.calculationText}>
                  Calculation: ({log.average_daily_unit_sales?.toFixed(2) || "0.00"} × {log.lead_time_days?.toFixed(1) || "0.0"}) + {log.safety_stock?.toFixed(2) || "0.00"} = {Math.ceil(log.reorder_point || 0)}
                </Text>
              </View>
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
                ]}>
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

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Generated on {dateGenerated} • RoPIC System</Text>
      </View>

      {/* Page Number */}
      <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
        `${pageNumber} / ${totalPages}`
      )} fixed />
    </Page>
  </Document>
);

// Updated helper function to create a blob for download with improved image conversion
export const generatePdfBlob = async (props: ReorderPointPDFProps) => {
  let updatedProps = { ...props };

  // Convert RoPIC logo URL to base64
  const ropicLogoUrl = 'https://ropic.vercel.app/logo.png';
  console.log('Converting RoPIC logo URL to base64:', ropicLogoUrl);
  const ropicLogoBase64 = await convertImageToBase64(ropicLogoUrl);

  if (ropicLogoBase64) {
    console.log('Successfully converted RoPIC logo to base64');
    (updatedProps as any).ropicLogoBase64 = ropicLogoBase64;
  } else {
    console.log('Failed to convert RoPIC logo to base64');
  }

  // Convert company logo URL to base64 if provided and crop to square
  if (props.companyLogoUrl && !props.companyLogoBase64) {
    console.log('Converting company logo URL to base64 and cropping to square:', props.companyLogoUrl);
    const base64Image = await convertImageToBase64(props.companyLogoUrl, true); // Enable square cropping

    if (base64Image) {
      console.log('Successfully converted company logo to base64 and cropped to square');
      updatedProps.companyLogoBase64 = base64Image;
    } else {
      console.log('Failed to convert company logo to base64');
    }
  }

  return await pdf(<ReorderPointPDF {...updatedProps} />).toBlob();
};