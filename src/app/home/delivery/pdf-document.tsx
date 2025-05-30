"use client";

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';

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

// QR Code generation function
const generateQRCodeURL = (text: string): string => {
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedText}`;
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
    fontSize: 9,
    color: '#718096',
    marginBottom: 0,
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
    width: 60,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  deliveryDetailValue: {
    fontSize: 9,
    color: '#1A202C',
    flex: 1,
  },
  urlText: {
    fontSize: 7,
    color: '#3182CE',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: '100%',
    lineHeight: 1.3,
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

// Helper function to get status style - updated to match your theme colors
const getStatusStyle = (status: string) => {
  const normalizedStatus = status?.toLowerCase() || '';

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

// Helper function to get priority style - updated to match your theme colors
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

interface DeliveryQRPDFProps {
  deliveries: any[];
  companyName: string;
  companyLogoUrl?: string;
  dateGenerated: string;
  companyLogoBase64?: string;
  ropicLogoBase64?: string;
}

// PDF Document Component
export const DeliveryQRPDF = ({
  deliveries,
  companyName,
  companyLogoUrl,
  dateGenerated,
  companyLogoBase64,
  ropicLogoBase64
}: DeliveryQRPDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
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
            <Text style={styles.title}>Delivery QR Code Report</Text>
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
              <Text style={styles.metadataValue}>{companyName || 'Unknown Company'}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Total Items:</Text>
              <Text style={styles.metadataValue}>{deliveries.length}</Text>
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
      </View>

      {/* Deliveries Section */}
      <View style={styles.deliveriesContainer}>
        <Text style={styles.sectionHeader}>Delivery QR Codes ({deliveries.length} items)</Text>

        <View style={styles.deliveryGrid}>
          {deliveries.map((delivery, index) => {
            return (
              <View key={delivery.uuid || index} style={styles.deliveryCard} wrap={false}>
                <View style={styles.deliveryHeader}>
                  {/* Delivery name and status on same row */}
                  <View style={styles.deliveryTitleRow}>
                    <Text style={styles.deliveryName}>
                      {delivery.itemName || delivery.name || "Delivery Item"}
                    </Text>
                    <Text style={getStatusStyle(delivery.status || delivery.delivery_status)}>
                      {(delivery.status || delivery.delivery_status || 'Unknown').toUpperCase()}
                    </Text>
                  </View>

                  {/* ID on separate row */}
                  <Text style={styles.deliveryId}>
                    ID: {delivery.uuid || `DEL-${index + 1}`}
                  </Text>
                </View>

                {/* Priority (if available) - moved below header */}
                {(delivery.priority || delivery.delivery_priority) && (
                  <Text style={getPriorityStyle(delivery.priority || delivery.delivery_priority)}>
                    Priority: {(delivery.priority || delivery.delivery_priority).toUpperCase()}
                  </Text>
                )}

                {/* Delivery Details */}
                <View style={styles.deliveryDetail}>
                  <Text style={styles.deliveryDetailLabel}>Date:</Text>
                  <Text style={styles.deliveryDetailValue}>
                    {delivery.deliveryDate || delivery.delivery_date
                      ? new Date(delivery.deliveryDate || delivery.delivery_date).toLocaleDateString()
                      : 'N/A'}
                  </Text>
                </View>

                <View style={styles.deliveryDetail}>
                  <Text style={styles.deliveryDetailLabel}>Warehouse:</Text>
                  <Text style={styles.deliveryDetailValue}>
                    {delivery.warehouse_name || delivery.delivery_address || 'N/A'}
                  </Text>
                </View>

                {/* Add Expected Delivery Time if available */}
                {(delivery.expectedDelivery || delivery.expected_delivery) && (
                  <View style={styles.deliveryDetail}>
                    <Text style={styles.deliveryDetailLabel}>Expected:</Text>
                    <Text style={styles.deliveryDetailValue}>
                      {new Date(delivery.expectedDelivery || delivery.expected_delivery).toLocaleDateString()}
                    </Text>
                  </View>
                )}

                {/* Add Tracking Number if available */}
                {(delivery.trackingNumber || delivery.tracking_number) && (
                  <View style={styles.deliveryDetail}>
                    <Text style={styles.deliveryDetailLabel}>Tracking:</Text>
                    <Text style={styles.deliveryDetailValue}>
                      {delivery.trackingNumber || delivery.tracking_number}
                    </Text>
                  </View>
                )}

                {/* Add Quantity if available */}
                {(delivery.quantity || delivery.qty) && (
                  <View style={styles.deliveryDetail}>
                    <Text style={styles.deliveryDetailLabel}>Quantity:</Text>
                    <Text style={styles.deliveryDetailValue}>
                      {delivery.quantity || delivery.qty}
                    </Text>
                  </View>
                )}

                {/* QR Code Section */}
                <View style={styles.qrCodeContainer}>
                  <Text style={styles.qrCodeLabel}>Scan to Accept Delivery</Text>
                  <Image
                    style={styles.qrCodeImage}
                    src={generateQRCodeURL(delivery.qrUrl || '')}
                    cache={false}
                  />
                  <Text style={styles.urlText}>
                    {(delivery.qrUrl || 'No URL available').replace('search?', 'search?\n')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Generated on {dateGenerated} • RoPIC Delivery Management System
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

// Helper function to create a blob for download
export const generatePdfBlob = async (props: DeliveryQRPDFProps) => {
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
      const base64Image = await convertImageToBase64(props.companyLogoUrl, true);

      if (base64Image) {
        console.log('Successfully converted company logo to base64 and cropped to square');
        updatedProps.companyLogoBase64 = base64Image;
      } else {
        console.log('Failed to convert company logo to base64, will use placeholder');
      }
    }

    return await pdf(<DeliveryQRPDF {...updatedProps} />).toBlob();
  } catch (error) {
    console.error('Error generating PDF blob:', error);
    // Return PDF without images if conversion fails
    return await pdf(<DeliveryQRPDF {...updatedProps} />).toBlob();
  }
};