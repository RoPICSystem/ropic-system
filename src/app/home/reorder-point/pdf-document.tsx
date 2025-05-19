"use client";

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import { ReorderPointLog } from './actions';

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
    marginBottom: 20,
    paddingBottom: 15,
    borderBottom: '1px solid #EAEAEA',
  },
  logoContainer: {
    width: 80,
    height: 80,
    marginRight: 20,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#4A5568',
  },
  metadataContainer: {
    backgroundColor: '#F7FAFC',
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
    borderLeft: '4px solid #3182CE',
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
  itemCard: {
    marginBottom: 15,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A202C',
    flex: 1,
  },
  itemDetail: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  itemDetailLabel: {
    fontSize: 11,
    color: '#4A5568',
    width: 130,
    fontWeight: 'bold',
  },
  itemDetailValue: {
    fontSize: 11,
    color: '#1A202C',
    flex: 1,
  },
  notes: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#718096',
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px dashed #E2E8F0',
  },
  calculationContainer: {
    backgroundColor: '#F0FFF4',
    padding: 8,
    borderRadius: 4,
    marginTop: 10,
  },
  calculationText: {
    fontSize: 10,
    color: '#2F855A',
  },
  statusChip: {
    padding: '4 8',
    borderRadius: 4,
    fontSize: 10,
    alignSelf: 'flex-start',
  },
  tableContainer: {
    marginTop: 10,
    marginBottom: 20,
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
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
  dateGenerated: string;
}

// PDF Document Component
export const ReorderPointPDF = ({ 
  logs,
  deliveryHistory,
  warehouseName,
  companyName,
  dateGenerated
}: ReorderPointPDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header Section */}
      <View style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Reorder Point Report</Text>
          <Text style={styles.subtitle}>Inventory Management Analysis</Text>
        </View>
      </View>
      
      {/* Metadata Section */}
      <View style={styles.metadataContainer}>
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
        
        <View style={styles.formulaContainer}>
          <Text style={styles.formula}>
            Reorder Point = (Average Daily Sales × Lead Time) + Safety Stock
          </Text>
        </View>
      </View>
      
      {/* Inventory Items Section */}
      <View>
        <Text style={styles.sectionHeader}>Inventory Items</Text>
        
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
              <Text style={styles.itemDetailValue}>{log.current_stock} {log.unit}</Text>
            </View>
            
            <View style={styles.itemDetail}>
              <Text style={styles.itemDetailLabel}>Average Daily Sales:</Text>
              <Text style={styles.itemDetailValue}>{log.average_daily_unit_sales?.toFixed(2) || "0"} {log.unit}</Text>
            </View>
            
            <View style={styles.itemDetail}>
              <Text style={styles.itemDetailLabel}>Lead Time:</Text>
              <Text style={styles.itemDetailValue}>{log.lead_time_days?.toFixed(1) || "0"} days</Text>
            </View>
            
            <View style={styles.itemDetail}>
              <Text style={styles.itemDetailLabel}>Safety Stock:</Text>
              <Text style={styles.itemDetailValue}>
                {log.safety_stock?.toFixed(2) || "0"} {log.unit}
                {log.custom_safety_stock !== null ? " (Custom)" : ""}
              </Text>
            </View>
            
            <View style={styles.itemDetail}>
              <Text style={styles.itemDetailLabel}>Reorder Point:</Text>
              <Text style={styles.itemDetailValue}>{Math.ceil(log.reorder_point || 0)} {log.unit}</Text>
            </View>
            
            {log.notes && (
              <Text style={styles.notes}>Notes: {log.notes}</Text>
            )}
            
            <View style={styles.calculationContainer}>
              <Text style={styles.calculationText}>
                Calculation: ({log.average_daily_unit_sales?.toFixed(2) || "0"} × {log.lead_time_days?.toFixed(1) || "0"}) + {log.safety_stock?.toFixed(2) || "0"} = {Math.ceil(log.reorder_point || 0)}
              </Text>
            </View>
          </View>
        ))}
      </View>
      
      {/* Delivery History Section */}
      {deliveryHistory.length > 0 && (
        <View>
          <Text style={styles.sectionHeader}>Delivery History</Text>
          
          <View style={styles.tableContainer}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <View style={[styles.tableHeaderCell, { flex: 1 }]}>
                  <Text>Date</Text>
                </View>
                <View style={[styles.tableHeaderCell, { flex: 1 }]}>
                  <Text>Status</Text>
                </View>
                <View style={[styles.tableHeaderCell, { flex: 1.5 }]}>
                  <Text>Location</Text>
                </View>
                <View style={[styles.tableHeaderCell, { flex: 1 }]}>
                  <Text>Recipient</Text>
                </View>
              </View>
              
              {deliveryHistory.map((delivery, index) => (
                <View key={index} style={[
                  styles.tableRow,
                  index % 2 === 1 ? { backgroundColor: '#F7FAFC' } : {}
                ]}>
                  <View style={[styles.tableCell, { flex: 1 }]}>
                    <Text>{new Date(delivery.delivery_date).toLocaleDateString()}</Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 1 }]}>
                    <Text>{formatStatus(delivery.status)}</Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 1.5 }]}>
                    <Text>{Array.isArray(delivery.location_codes) && delivery.location_codes.length > 0 
                      ? delivery.location_codes.join(', ') 
                      : 'N/A'}</Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 1 }]}>
                    <Text>{delivery.recipient_name || 'N/A'}</Text>
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

// Helper function to create a blob for download
export const generatePdfBlob = async (props: ReorderPointPDFProps) => {
  return await pdf(<ReorderPointPDF {...props} />).toBlob();
};