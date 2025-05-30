"use client";

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';

// Helper function to convert image URL to base64
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
      
      if (!ctx) throw new Error('Failed to get canvas context');
      
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const objectUrl = URL.createObjectURL(blob);
        
        const originalOnLoad = img.onload;
        const originalOnError = img.onerror;
        
        img.onload = function(event) {
          try {
            const size = cropToSquare ? Math.min(img.width, img.height) : Math.max(img.width, img.height);
            canvas.width = size;
            canvas.height = size;
            
            if (cropToSquare) {
              const offsetX = (img.width - size) / 2;
              const offsetY = (img.height - size) / 2;
              ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);
            } else {
              ctx.drawImage(img, 0, 0, size, size);
            }
            
            const base64 = canvas.toDataURL('image/png');
            URL.revokeObjectURL(objectUrl);
            resolve(base64);
          } catch (error) {
            URL.revokeObjectURL(objectUrl);
            reject(error);
          }
          
          if (originalOnLoad) originalOnLoad.call(img, event);
        };
        
        img.onerror = (event) => {
          URL.revokeObjectURL(objectUrl);
          if (originalOnError) originalOnError.call(img, event);
        };
        
        img.src = objectUrl;
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
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedText}`;
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
    borderBottom: '2px solid #E2E8F0',
  },
  leftHeaderSection: {
    flex: 1,
    marginRight: 15,
  },
  logoContainer: {
    width: 60,
    height: 60,
    marginBottom: 10,
  },
  companyLogo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerContent: {
    flex: 1,
  },
  headerTextContainer: {
    marginBottom: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#4A5568',
    fontStyle: 'italic',
  },
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
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 15,
    marginTop: 25,
    paddingBottom: 8,
    borderBottom: '2px solid #E2E8F0',
  },
  deliveryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 15,
  },
  deliveryCard: {
    width: '48%',
    marginBottom: 15,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 280,
  },
  deliveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  deliveryName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1A202C',
    flex: 1,
    marginRight: 6,
  },
  statusChip: {
    padding: '3 6',
    borderRadius: 3,
    fontSize: 9,
    alignSelf: 'flex-start',
  },
  successStatus: {
    backgroundColor: '#C6F6D5',
    color: '#22543D',
  },
  warningStatus: {
    backgroundColor: '#FEEBC8',
    color: '#C05621',
  },
  dangerStatus: {
    backgroundColor: '#FED7D7',
    color: '#C53030',
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginVertical: 10,
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
  },
  qrCodeImage: {
    width: 120,
    height: 120,
    marginBottom: 8,
  },
  qrCodeLabel: {
    fontSize: 8,
    color: '#4A5568',
    textAlign: 'center',
    marginBottom: 4,
  },
  deliveryDetail: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  deliveryDetailLabel: {
    fontSize: 10,
    color: '#4A5568',
    width: 80,
    fontWeight: 'bold',
  },
  deliveryDetailValue: {
    fontSize: 10,
    color: '#1A202C',
    flex: 1,
  },
  urlText: {
    fontSize: 8,
    color: '#3182CE',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
    lineHeight: 1.2,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 10,
    color: '#718096',
    borderTop: '1px solid #E2E8F0',
    paddingTop: 10,
  },
  pageNumber: {
    position: 'absolute',
    fontSize: 10,
    bottom: 30,
    right: 30,
    color: '#718096',
  },
});

// Helper function to get status styling
const getStatusStyle = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':
    case 'DELIVERED':
      return styles.successStatus;
    case 'PENDING':
    case 'IN_PROGRESS':
      return styles.warningStatus;
    case 'CANCELLED':
    case 'FAILED':
      return styles.dangerStatus;
    default: 
      return styles.warningStatus;
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
              <Text style={styles.title}>Delivery QR Code Report</Text>
            </View>
            <Text style={styles.subtitle}>Delivery Management & QR Code System</Text>
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
      </View>

      {/* Deliveries Section */}
      <View>
        <Text style={styles.sectionHeader}>Delivery QR Codes</Text>

        <View style={styles.deliveryGrid}>
          {deliveries.map((delivery, index) => (
            <View key={index} style={styles.deliveryCard}>
              <View style={styles.deliveryHeader}>
                <Text style={styles.deliveryName}>{delivery.name || `Delivery #${index + 1}`}</Text>
                <View style={[styles.statusChip, getStatusStyle(delivery.status)]}>
                  <Text>{delivery.status || 'PENDING'}</Text>
                </View>
              </View>

              <View style={styles.deliveryDetail}>
                <Text style={styles.deliveryDetailLabel}>Item:</Text>
                <Text style={styles.deliveryDetailValue}>{delivery.itemName || 'N/A'}</Text>
              </View>

              <View style={styles.deliveryDetail}>
                <Text style={styles.deliveryDetailLabel}>Code:</Text>
                <Text style={styles.deliveryDetailValue}>{delivery.itemCode || 'N/A'}</Text>
              </View>

              <View style={styles.deliveryDetail}>
                <Text style={styles.deliveryDetailLabel}>Location:</Text>
                <Text style={styles.deliveryDetailValue}>
                  {Array.isArray(delivery.locationCodes) ? delivery.locationCodes.join(', ') : delivery.locationCodes || 'N/A'}
                </Text>
              </View>

              <View style={styles.deliveryDetail}>
                <Text style={styles.deliveryDetailLabel}>Date:</Text>
                <Text style={styles.deliveryDetailValue}>
                  {delivery.deliveryDate ? new Date(delivery.deliveryDate).toLocaleDateString() : 'N/A'}
                </Text>
              </View>

              {/* QR Code Section */}
              <View style={styles.qrCodeContainer}>
                <Text style={styles.qrCodeLabel}>Scan to Open Delivery</Text>
                <Image
                  style={styles.qrCodeImage}
                  src={generateQRCodeURL(delivery.qrUrl || '')}
                  cache={false}
                />
                <Text style={styles.urlText}>
                  {delivery.qrUrl || ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Generated on {dateGenerated} • RoPIC Delivery System</Text>
      </View>

      {/* Page Number */}
      <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
        `${pageNumber} / ${totalPages}`
      )} fixed />
    </Page>
  </Document>
);

// Helper function to create a blob for download
export const generatePdfBlob = async (props: DeliveryQRPDFProps) => {
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

  return await pdf(<DeliveryQRPDF {...updatedProps} />).toBlob();
};