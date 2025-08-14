# RoPIC System - Reorder Point Inventory Control Management System

A comprehensive inventory management system built with Next.js, featuring real-time tracking, automated reorder point calculations, delivery management, and role-based access control.

## 🚀 Features

### Core Functionality
- **Inventory Management**: Track warehouse items with detailed metadata and location codes
- **Reorder Point Calculations**: Automated calculations based on sales data, lead times, and safety stock
- **Delivery Management**: Complete delivery workflow with QR code generation and status tracking
- **Warehouse Management**: Multi-warehouse support with 3D layout visualization using [`shelf-selector-3d.tsx`](src/components/shelf-selector-3d.tsx)
- **Real-time Notifications**: Live updates for inventory changes and system events via [`notification-listener.tsx`](src/components/notification-listener.tsx)

### User Management
- **Role-based Access Control**: Admin and operator roles with different permissions
- **Company Profiles**: Multi-tenant architecture with company-specific data
- **User Profiles**: Complete user management with address and contact information

### Advanced Features
- **PDF Generation**: Export delivery QR codes and reorder point reports using [`@react-pdf/renderer`](src/app/home/delivery/pdf-document.tsx)
- **Search & Filtering**: Advanced search capabilities across all modules with global search in [`search/page.tsx`](src/app/home/search/page.tsx)
- **Responsive Design**: Mobile-first design with dark/light theme support via [`theme-switcher.tsx`](src/components/theme-switcher.tsx)
- **Real-time Updates**: Live data synchronization using Supabase subscriptions
- **3D Warehouse Visualization**: Interactive warehouse layout with shelf selection using Three.js
- **Bulk Operations**: Batch processing for deliveries and inventory management

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript 5
- **UI Framework**: HeroUI v2.7.8 (previously known as NextUI), Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Real-time)
- **State Management**: React hooks with server-side data fetching
- **PDF Generation**: @react-pdf/renderer v4.3.0
- **3D Graphics**: Three.js, @react-three/fiber, @react-three/drei
- **Animation**: Framer Motion v12.6.3
- **Icons**: Heroicons, Iconify
- **Date Handling**: date-fns v4.1.0
- **Charts**: Recharts v2.15.3
- **Custom Hooks**: [`useMousePosition`](src/hooks/useMousePosition.tsx)

## 📁 Project Structure

```
src/
├── app/                            # Next.js App Router pages
│   ├── account/                    # Authentication pages
│   │   └── layout.tsx              # Auth layout wrapper
│   ├── auth/                       # Authentication handlers
│   ├── home/                       # Main application pages (protected)
│   │   ├── dashboard/              # Dashboard and analytics
│   │   ├── inventory/              # Inventory management
│   │   ├── warehouse-items/        # Warehouse item management
│   │   ├── warehouses/             # Warehouse management with 3D layouts
│   │   ├── delivery/               # Delivery management with QR codes
│   │   │   └── pdf-document.tsx    # PDF generation for delivery QR codes
│   │   ├── reorder-point/          # Reorder point calculations
│   │   │   └── pdf-document.tsx    # PDF generation for reorder reports
│   │   ├── profile/                # User profile management
│   │   ├── company/                # Company profile management
│   │   │   └── edit/               # Company editing with logo upload
│   │   ├── search/                 # Global search functionality
│   │   └── notifications/          # Notification center with real-time updates
│   ├── layout.tsx                  # Root layout with providers
│   ├── page.tsx                    # Landing page
│   ├── providers.tsx               # Context providers setup
│   └── globals.css                 # Global styles
├── components/                     # Reusable UI components
│   ├── breadcrumbs.tsx             # Dynamic breadcrumb navigation
│   ├── card-list.tsx               # Reusable card container
│   ├── custom-properties.tsx       # CSS custom properties
│   ├── custom-scrollbar.tsx        # Styled scrollbar component
│   ├── list-loading-animation.tsx  # List-specific loading states
│   ├── loading-animation.tsx       # Loading states with skeletons
│   ├── notification-listener.tsx   # Real-time notification handler
│   ├── shelf-selector-3d.tsx       # 3D warehouse visualization
│   ├── sidebar.tsx                 # Main navigation sidebar
│   ├── space-background.tsx        # Animated background component
│   ├── splashscreen.tsx            # Application loading screen
│   └── theme-switcher.tsx          # Dark/light theme toggle
├── hooks/                          # Custom React hooks
│   └── useMousePosition.tsx        # Mouse tracking for 3D interactions
├── utils/                          # Utility functions and helpers
│   ├── anim.tsx                    # Framer Motion animation presets
│   ├── colors.ts                   # Color utility functions
│   ├── tools.tsx                   # General utility functions
│   ├── floorplan.ts                # Warehouse floorplan utilities
│   ├── is-chrome.ts                # Browser detection
│   └── supabase/                   # Supabase client and server functions
└── middleware.ts                   # Authentication middleware for route protection
```

## 🚦 Getting Started

### Prerequisites
- Node.js 18+ 
- npm, yarn, pnpm, or bun
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/RoPICSystem/ropic-system
   cd ropic-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun install
   ```

3. **Environment Setup**
   
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Database Setup**
   
   Set up your Supabase database with the required tables:
   ```sql
   -- Core tables
   users                   -- User profiles and authentication
   companies               -- Company information and settings
   warehouses              -- Warehouse locations and layouts
   inventory               -- Inventory items and stock levels
   deliveries              -- Delivery tracking and management
   reorder_point_logs      -- Historical reorder point calculations
   notifications           -- System notifications
   notification_reads      -- Read status tracking for notifications
   
   -- Address tables (for location management)
   regions, provinces, cities, barangays
   ```

5. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   # or
   bun dev
   ```

6. **Open the application**
   
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## 📋 Key Features Guide

### Authentication & Authorization
- **Secure Authentication**: Supabase Auth with email/password
- **Role-based Access**: Admin and Operator roles with different permissions
- **Protected Routes**: [`middleware.ts`](src/middleware.ts) handles route protection
- **Session Management**: Persistent sessions with secure cookies
- **User Profiles**: Complete profile management with address information

### Inventory Management
- **Item Tracking**: Detailed inventory with metadata and location codes
- **Warehouse Integration**: Items linked to specific warehouse locations
- **Real-time Monitoring**: Live stock level updates
- **Advanced Search**: Global search across all inventory items in [`search/page.tsx`](src/app/home/search/page.tsx)
- **Bulk Operations**: Batch import/export capabilities
- **Status Tracking**: Multiple inventory states (IN_STOCK, WARNING, CRITICAL, OUT_OF_STOCK)

### Reorder Point System
- **Automated Calculations**: 
  ```
  Reorder Point = (Average Daily Sales × Lead Time) + Safety Stock
  ```
- **Historical Tracking**: Complete audit trail of reorder point changes
- **PDF Reports**: Exportable reports with company branding via [`reorder-point/pdf-document.tsx`](src/app/home/reorder-point/pdf-document.tsx)
- **Multiple Formats**: A4, A3, Letter, Legal page sizes supported
- **Smart Filtering**: Filter by warehouse, status, date ranges
- **Real-time Calculations**: Automatic recalculation based on sales data

### Delivery Management
- **Complete Workflow**: From creation to delivery completion
- **QR Code Generation**: Unique QR codes for each delivery using external QR API
- **Status Tracking**: Real-time status updates (Pending → Processing → In Transit → Delivered)
- **Operator Assignment**: Assign deliveries to specific operators
- **PDF Export**: Batch QR code generation with company branding via [`delivery/pdf-document.tsx`](src/app/home/delivery/pdf-document.tsx)
- **Bulk Operations**: Process multiple deliveries simultaneously
- **Auto-Accept Options**: Configurable QR code auto-acceptance

### Warehouse Management
- **3D Visualization**: Interactive warehouse layouts with [`shelf-selector-3d.tsx`](src/components/shelf-selector-3d.tsx)
- **Multi-warehouse Support**: Manage multiple warehouse locations
- **Location Codes**: Specific shelf and bin location tracking
- **Floor Planning**: Visual warehouse layout management using Three.js
- **Mouse Interaction**: Real-time mouse tracking for 3D interactions via [`useMousePosition.tsx`](src/hooks/useMousePosition.tsx)

### Notification System
- **Real-time Updates**: Live notifications via Supabase subscriptions in [`notification-listener.tsx`](src/components/notification-listener.tsx)
- **Role-based Notifications**: Admin-only and general notifications
- **Category Filtering**: Filter by inventory, delivery, profile, company changes
- **Mark as Read**: Individual and bulk read status management
- **Persistent History**: Complete notification audit trail
- **Toast Integration**: Real-time toast notifications with HeroUI

### PDF Generation System
Both delivery QR codes and reorder point reports support:
- **Company Branding**: Automatic logo integration with fallback placeholders
- **Multiple Page Sizes**: A4, A3, Letter, Legal formats
- **WebP Conversion**: Automatic image format conversion for compatibility
- **Batch Export**: Export multiple items in a single PDF
- **Professional Styling**: Consistent branding and formatting
- **Base64 Image Handling**: Secure image processing for PDFs

### Company Profile Management
- **Logo Upload**: Company logo management with 2MB size limit
- **Address Management**: Complete address system with regions, provinces, cities, and barangays
- **Profile Editing**: Comprehensive company information editing in [`company/edit/page.tsx`](src/app/home/company/edit/page.tsx)
- **Real-time Updates**: Live profile synchronization

## 🎨 UI/UX Features

### Design System
- **Responsive Design**: Mobile-first approach with breakpoint optimization
- **Theme Support**: Dark/light themes with system preference detection via [`theme-switcher.tsx`](src/components/theme-switcher.tsx)
- **Loading States**: Comprehensive skeleton loaders via [`loading-animation.tsx`](src/components/loading-animation.tsx) and [`list-loading-animation.tsx`](src/components/list-loading-animation.tsx)
- **Error Handling**: User-friendly error boundaries and feedback
- **Accessibility**: ARIA labels and keyboard navigation support

### Visual Components
- **3D Warehouse Viewer**: Interactive warehouse layouts using Three.js
- **Animated Backgrounds**: Dynamic space-themed backgrounds via [`space-background.tsx`](src/components/space-background.tsx)
- **Custom Scrollbars**: Styled scrollbars for better UX via [`custom-scrollbar.tsx`](src/components/custom-scrollbar.tsx)
- **Motion Animations**: Smooth transitions using Framer Motion
- **Breadcrumb Navigation**: Context-aware navigation paths via [`breadcrumbs.tsx`](src/components/breadcrumbs.tsx)
- **Splash Screen**: Loading screen with [`splashscreen.tsx`](src/components/splashscreen.tsx)

### Interactive Elements
- **Search Interface**: Global search with advanced filtering
- **Card-based Layout**: Consistent card system for data display via [`card-list.tsx`](src/components/card-list.tsx)
- **Modal Dialogs**: Rich modal interactions for forms and confirmations
- **Toast Notifications**: Real-time feedback system
- **Infinite Scroll**: Efficient data loading with HeroUI's infinite scroll

## 📊 Data Flow

1. **Authentication**: Users authenticate via Supabase Auth
2. **Profile Setup**: Complete user and company profile creation
3. **Warehouse Configuration**: Set up warehouses with 3D layouts
4. **Inventory Management**: Add and categorize inventory items
5. **Reorder Monitoring**: Automated reorder point calculations
6. **Delivery Processing**: Create, track, and complete deliveries
7. **Reporting**: Generate comprehensive PDF reports
8. **Real-time Updates**: Live data synchronization across all modules

## 🔧 Configuration

### Theme Configuration
Themes are configured in [`src/app/layout.tsx`](src/app/layout.tsx) using NextThemesProvider:
```tsx
<NextThemesProvider attribute="class" defaultTheme="system">
  {children}
</NextThemesProvider>
```

### Navigation System
Navigation is dynamically generated based on user roles:
- **Sidebar**: [`src/components/sidebar.tsx`](src/components/sidebar.tsx) - Main navigation
- **Breadcrumbs**: [`src/components/breadcrumbs.tsx`](src/components/breadcrumbs.tsx) - Context navigation

### Real-time Subscriptions
Real-time updates are handled via Supabase subscriptions in:
- **Notifications**: [`src/components/notification-listener.tsx`](src/components/notification-listener.tsx)
- **Data Updates**: Individual page components with subscription management
- **Live Sync**: Real-time data synchronization across all modules

### PDF Configuration
PDF generation supports multiple formats and company branding:
```tsx
// Example PDF export for deliveries
const pdfBlob = await generatePdfBlob({
  deliveries: selectedDeliveries,
  companyName: company.name,
  companyLogoUrl: company.logo_url,
  pageSize: "A4", // A4, A3, LETTER, LEGAL
  dateGenerated: new Date().toLocaleDateString(),
  companyLogoBase64: convertedLogo,
  ropicLogoBase64: ropicLogo
});

// Example PDF export for reorder points
const reorderPdf = await generatePdfBlob({
  logs: reorderPointLogs,
  deliveryHistory: deliveries,
  warehouseName: warehouse.name,
  companyName: company.name,
  companyLogoUrl: company.logo_url,
  pageSize: "A4",
  inventoryNameMap: itemMapping
});
```

### 3D Warehouse Configuration
Three.js warehouse visualization configuration with comprehensive customization options:

```tsx
// Example 3D warehouse setup with full configuration
import { ShelfSelector3D } from '@/components/shelf-selector-3d';

<Canvas>
  <ShelfSelector3D
    // Required props
    floors={warehouseLayout}
    onSelect={handleShelfSelection}
    
    // Visual and layout props
    className="w-full h-full"
    highlightedFloor={selectedFloor}
    onHighlightFloor={setHighlightedFloor}
    
    // Animation controls
    isFloorChangeAnimate={true}
    isShelfChangeAnimate={true}
    isGroupChangeAnimate={false}
    
    // Selection and interaction
    externalSelection={currentSelectedLocation}
    occupiedLocations={occupiedShelfLocations}
    canSelectOccupiedLocations={false}
    
    // Camera positioning
    cameraOffsetX={0}
    cameraOffsetY={-0.25}
    
    // Color customization
    backgroundColor="#f8fafc"
    floorColor="#e2e8f0"
    floorHighlightedColor="#cbd5e1"
    groupColor="#94a3b8"
    groupSelectedColor="#475569"
    shelfColor="#64748b"
    shelfHoverColor="#334155"
    shelfSelectedColor="#0f172a"
    occupiedShelfColor="#ef4444"
    occupiedHoverShelfColor="#dc2626"
    textColor="#1e293b"
    
    // Advanced color assignments
    shelfSelectorColors={{
      primary: "#3b82f6",
      secondary: "#8b5cf6", 
      tertiary: "#f59e0b",
      quaternary: "#10b981"
    }}
    shelfColorAssignments={[
      {
        floor: 0,
        group: 1,
        row: 2,
        column: 3,
        depth: 0,
        colorType: 'primary'
      },
      {
        floor: 0,
        group: 1,
        row: 3,
        column: 3,
        depth: 0,
        colorType: 'secondary'
      }
    ]}
  />
</Canvas>

// Floor configuration structure
const warehouseLayout: FloorConfig[] = [
  {
    floor: 0,
    groups: [
      {
        id: 0,
        name: "Group A",
        shelves: [
          {
            row: 0,
            column: 0,
            depth: 2,
            position: { x: 0, y: 0, z: 0 }
          }
        ]
      }
    ]
  }
];

// Selection handler with location details
const handleShelfSelection = (location: ShelfLocation) => {
  console.log('Selected shelf:', {
    floor: location.floor,
    group: location.group,
    row: location.row,
    column: location.column,
    depth: location.depth,
    position: location.position
  });
  
  // Update your application state
  setSelectedLocation(location);
};

// Color assignment for specific shelves
const shelfColorAssignments: ShelfSelectorColorAssignment[] = [
    {
      floor: 0,
      group: 0,
      row: 0,
      column: 0,
      depth: 0,
      colorType: 'primary' // Highlights this shelf in primary color
    },
    {
      floor: 0,
      group: 0,
      row: 1,
      column: 0,
      depth: 0,
      colorType: 'secondary' // Highlights this shelf in secondary color
    }
];

// Custom color scheme
const customColors: ShelfSelectorColors = {
  primary: "#6366f1",     // Indigo
  secondary: "#8b5cf6",   // Violet  
  tertiary: "#f59e0b",    // Amber
  quaternary: "#10b981"   // Emerald
};
```

#### Advanced Features

**Animation Controls:**
- `isFloorChangeAnimate`: Smooth transitions between floors
- `isShelfChangeAnimate`: Animated shelf selection feedback
- `isGroupChangeAnimate`: Group highlighting animations
- `onAnimationToggle`: Callback for animation state changes

**Selection Management:**
- `externalSelection`: Programmatically select shelves from outside
- `occupiedLocations`: Mark shelves as occupied/unavailable
- `canSelectOccupiedLocations`: Allow/prevent selection of occupied shelves

**Camera Controls:**
- `cameraOffsetX`: Horizontal camera position adjustment
- `cameraOffsetY`: Vertical camera position adjustment
- Supports mouse orbit, zoom, and pan controls
- Keyboard navigation with WASD and arrow keys

**Color System:**
- Individual color props for each element type
- `shelfSelectorColors`: Predefined color scheme object
- `shelfColorAssignments`: Array to assign specific colors to individual shelves
- Support for primary, secondary, tertiary, and quaternary color types

**Responsive Design:**
- Automatically adjusts to container dimensions
- Touch-friendly controls for mobile devices
- Optimized rendering for different screen sizes

#### Integration Example in Delivery Management

```tsx
// Real-world usage in delivery page
const DeliveryLocationSelector = () => {
  const [selectedShelves, setSelectedShelves] = useState<ShelfLocation[]>([]);
  const [occupiedLocations, setOccupiedLocations] = useState<ShelfLocation[]>([]);
  
  useEffect(() => {
    // Load occupied shelf locations from warehouse data
    const loadOccupiedLocations = async () => {
      const result = await getOccupiedShelfLocations(warehouseId);
      setOccupiedLocations(result.data || []);
    };
    
    loadOccupiedLocations();
  }, [warehouseId]);
  
  const handleShelfSelect = (location: ShelfLocation) => {
    // Add to selected shelves for bulk delivery assignment
    setSelectedShelves(prev => [...prev, location]);
    
    // Update form data with location
    setFormData(prev => ({
      ...prev,
      locations: [...prev.locations, location],
      location_codes: [...prev.location_codes, formatLocationCode(location)]
    }));
  };
  
  // Color assignments for delivery visualization
  const deliveryColorAssignments = selectedShelves.map((shelf, index) => ({
    ...shelf,
    colorType: index === currentBulkIndex ? 'primary' : 'secondary'
  }));
  
  return (
    <div className="h-[80vh] bg-primary-50 rounded-md overflow-hidden">
      <ShelfSelector3D
        floors={warehouseLayout}
        onSelect={handleShelfSelect}
        occupiedLocations={occupiedLocations}
        canSelectOccupiedLocations={false}
        shelfColorAssignments={deliveryColorAssignments}
        cameraOffsetY={-0.25}
        className="w-full h-full"
      />
    </div>
  );
};
```

#### Performance Optimizations

**Rendering Efficiency:**
- Lazy loading with React.Suspense
- Optimized mesh generation for large warehouses
- LOD (Level of Detail) system for distant objects
- Efficient raycasting for shelf selection

**Memory Management:**
- Automatic cleanup of Three.js resources
- Optimized texture usage
- Instanced rendering for repeated shelf geometries

**Browser Compatibility:**
- WebGL support detection
- Graceful fallback for older browsers
- Hardware acceleration optimization

## 📝 Development

### Code Architecture
- **TypeScript**: Full type safety across the application
- **Component Architecture**: Reusable, composable components
- **Custom Hooks**: Shared logic via custom React hooks
- **Server Actions**: Next.js server actions for data mutations
- **Error Boundaries**: Comprehensive error handling
- **Modular Design**: Clear separation of concerns

### State Management
- **Server State**: Supabase with React hooks
- **Client State**: React hooks for UI state
- **Real-time Updates**: Supabase subscriptions for live data
- **Form State**: Form validation and submission handling
- **Global State**: Context providers for shared state

### Styling System
- **Tailwind CSS**: Utility-first CSS framework
- **HeroUI Components**: Pre-built component library (NextUI fork)
- **Custom Properties**: CSS custom properties via [`custom-properties.tsx`](src/components/custom-properties.tsx)
- **Responsive Design**: Mobile-first breakpoint system
- **Theme Variables**: Dynamic theme switching support

### Performance Optimizations
- **Code Splitting**: Dynamic imports for large components
- **Image Optimization**: Next.js Image component with WebP conversion
- **Lazy Loading**: Deferred loading for non-critical components
- **Caching**: Strategic caching for API responses
- **Bundle Optimization**: Turbopack for faster development builds

### Animation System
Framer Motion animations configured in [`utils/anim.tsx`](src/utils/anim.tsx):


## 🧪 Testing & Quality

### Code Quality
- **ESLint**: Code linting and formatting
- **TypeScript**: Static type checking with strict mode
- **Prettier**: Consistent code formatting (via package manager)
- **Git Hooks**: Pre-commit quality checks

### Browser Support
- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **Mobile Support**: iOS Safari, Chrome Mobile
- **WebGL Support**: Required for 3D warehouse visualization
- **Progressive Enhancement**: Graceful degradation for older browsers

### Browser Detection
Chrome-specific optimizations via [`is-chrome.ts`](src/utils/is-chrome.ts):
```typescript
export const isChrome = () => {
  return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
};
```

## 🚀 Deployment

### Vercel Deployment (Recommended)
The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme):

1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Configure Environment Variables**: Set up required environment variables
3. **Deploy**: Automatic deployment on every push to main branch
4. **Domain Setup**: Configure custom domain if needed

### Environment Variables
Ensure all required environment variables are set:

**Required Variables:**
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Optional Variables:**
```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://ropic.vercel.app
```

### Build Configuration
The project uses Next.js 15 with Turbopack for development:
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### Alternative Deployment Options
- **Docker**: Containerized deployment with multi-stage builds
- **AWS**: Deploy to AWS with appropriate services (EC2, Lambda, etc.)
- **Google Cloud**: Deploy using Google Cloud Run or App Engine
- **Self-hosted**: Deploy on your own infrastructure with PM2 or similar

### Database Migration
For production deployment:
1. Set up Supabase project with proper configuration
2. Run database migrations and seed data
3. Configure Row Level Security (RLS) policies
4. Set up authentication providers (email, OAuth)
5. Configure storage buckets for file uploads (company logos)
6. Set up real-time subscriptions and triggers

## 📚 API Reference

### Supabase Schema
```sql
-- Core company table
CREATE TABLE companies (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inventory management
CREATE TABLE inventory (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  quantity DECIMAL,
  unit TEXT,
  location_code TEXT,
  warehouse_uuid UUID REFERENCES warehouses(uuid),
  company_uuid UUID REFERENCES companies(uuid),
  status inventory_status DEFAULT 'IN_STOCK',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Delivery tracking
CREATE TABLE deliveries (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status delivery_status DEFAULT 'PENDING',
  delivery_date TIMESTAMP WITH TIME ZONE,
  recipient_name TEXT,
  delivery_address TEXT,
  notes TEXT,
  inventory_uuid UUID REFERENCES inventory(uuid),
  operator_uuid UUID REFERENCES users(uuid),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reorder point logging
CREATE TABLE reorder_point_logs (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_uuid UUID REFERENCES inventory(uuid),
  reorder_point DECIMAL,
  current_stock DECIMAL,
  average_daily_unit_sales DECIMAL,
  lead_time_days DECIMAL,
  safety_stock DECIMAL,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time notifications
CREATE TABLE notifications (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_uuid UUID REFERENCES companies(uuid),
  user_uuid UUID REFERENCES users(uuid),
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  details JSONB,
  is_admin_only BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification read tracking
CREATE TABLE notification_reads (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_uuid UUID REFERENCES notifications(uuid),
  user_uuid UUID REFERENCES users(uuid),
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Key Functions

#### Authentication Functions
```typescript
// Get authenticated user from cookies
const getUserFromCookies = async (): Promise<AdminUser | null>

// Get user profile data
const getUserProfile = async (uuid: string): Promise<UserProfile>
```

#### Inventory Functions
```typescript
// Fetch inventory with filtering
const getInventoryItems = async (filters: InventoryFilters): Promise<Inventory[]>

// Update inventory status
const updateInventoryStatus = async (uuid: string, status: InventoryStatus): Promise<void>
```

#### Delivery Functions
```typescript
// Create new delivery with QR code
const createDelivery = async (deliveryData: DeliveryInput): Promise<Delivery>

// Generate QR code URL
const generateQRCodeURL = (text: string): string

// Accept delivery via QR scan
const acceptDelivery = async (deliveryId: string): Promise<void>
```

#### Reorder Point Functions
```typescript
// Calculate reorder points for items
const calculateReorderPoint = async (inventoryId: string): Promise<ReorderPointCalculation>

// Get reorder point logs with filtering
const getReorderPointLogs = async (filters: ReorderFilters): Promise<ReorderPointLog[]>
```

#### PDF Generation Functions
```typescript
// Generate delivery QR PDF
const generatePdfBlob = async (props: DeliveryQRPDFProps): Promise<Blob>

// Generate reorder point PDF
const generateReorderPdf = async (props: ReorderPointPDFProps): Promise<Blob>

// Convert image to base64 with WebP support
const convertImageToBase64 = async (url: string, cropToSquare?: boolean): Promise<string | null>
```

#### Notification Functions
```typescript
// Get notifications with filtering
const getNotifications = async (filters: NotificationFilters): Promise<Notification[]>

// Mark notification as read
const markNotificationAsRead = async (notificationId: string, userId: string): Promise<void>

// Create system notification
const createNotification = async (notification: NotificationInput): Promise<void>
```

#### Utility Functions
```typescript
// Format dates consistently
const formatDate = (date: string): string

// Format numbers with localization
const formatNumber = (value: number): string

// Get base URL for environment
const baseURL = (): string

// Browser detection for optimizations
const isChrome = (): boolean
```

## 🔌 Real-time Integration

### Supabase Subscriptions
Real-time functionality is implemented using Supabase's real-time subscriptions:

```typescript
// Notification subscription example
const supabase = createClient();
const notificationChannel = supabase
  .channel('notifications-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'notifications',
      filter: `company_uuid=eq.${user.company_uuid}`
    },
    async (payload) => {
      // Handle real-time notification updates
      await refreshNotifications();
    }
  )
  .subscribe();
```

### Notification System
The notification system provides real-time updates across the application:

```typescript
// Notification types supported
type NotificationType = 'inventory' | 'delivery' | 'warehouse' | 'profile' | 'company';

// Notification actions
type NotificationAction = 'create' | 'update' | 'delete';

// Real-time notification handling
const handleNotification = (notification: Notification) => {
  const message = formatNotificationMessage(notification);
  addToast({
    title: getNotificationTitle(notification.type),
    description: message,
    color: getNotificationColor(notification.action),
    duration: 5000
  });
};
```

## 🤝 Contributing

### Development Workflow
1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**: Follow coding standards and conventions
4. **Test your changes**: Ensure all functionality works correctly
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Submit a pull request**: Include detailed description and screenshots

### Coding Standards
- **TypeScript**: Use proper types and interfaces, avoid `any`
- **Components**: Follow React best practices, use functional components
- **Naming**: Use descriptive, consistent naming (camelCase for variables, PascalCase for components)
- **Comments**: Document complex logic and API integrations
- **Testing**: Write tests for new features and bug fixes
- **Performance**: Consider performance implications of new features

### File Organization
- **Components**: Place reusable components in `/components`
- **Pages**: Use App Router structure in `/app`
- **Utilities**: Place helper functions in `/utils`
- **Hooks**: Custom hooks go in `/hooks`
- **Types**: Define TypeScript interfaces in relevant files

### Issue Reporting
When reporting issues, please include:
- **Environment details**: OS, browser, Node.js version, device type
- **Steps to reproduce**: Clear, numbered reproduction steps
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Screenshots**: Visual evidence if applicable
- **Console errors**: Any error messages from browser console
- **Network requests**: Failed API calls if relevant

### Feature Requests
For new features, please provide:
- **Use case**: Why this feature is needed
- **User story**: How users will interact with the feature
- **Technical considerations**: Any technical constraints or requirements
- **Mockups**: Visual designs if applicable

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔧 System Monitoring Solution

To prevent your Supabase free tier database from pausing due to inactivity, this project includes a comprehensive system monitoring solution with automated keepalive functionality.

### Features
- **Automated Database Keepalive**: Triggers every 10 minutes to prevent Supabase auto-pause
- **Real-time System Health**: Monitor both backend (Supabase) and frontend (Vercel) services
- **Comprehensive Dashboard**: Beautiful monitoring interface accessible via Settings → System Monitoring
- **Multiple Service Monitoring**: Track database, API, authentication, and real-time services
- **Performance Metrics**: Response times, uptime tracking, and health indicators
- **Free Tier Compatible**: Works within Vercel and Supabase free plan limits
- **Export Capabilities**: Download system status reports
- **Manual Testing**: Test individual services and endpoints

### Quick Access
Navigate to **Settings → System Monitoring** in your application to access the monitoring dashboard with:
- System status overview with operational percentage
- Individual service health cards
- Real-time keepalive monitoring
- Environment information
- Manual testing tools
- Export functionality

### Setup Instructions
See [`docs/KEEPALIVE_SETUP.md`](docs/KEEPALIVE_SETUP.md) for complete configuration instructions.

### Quick Setup
1. Deploy your app to Vercel (cron jobs auto-configured via `vercel.json`)
2. Run the keepalive SQL function in your Supabase SQL editor:
   ```sql
   -- See supabase/keepalive_function.sql for the complete function
   CREATE OR REPLACE FUNCTION keepalive_ping() RETURNS jsonb...
   ```
3. Optionally set `CRON_SECRET` environment variable for security
4. Access the monitoring dashboard via Settings → System Monitoring

The system will automatically keep your database active and provide comprehensive monitoring of your entire stack.

## 🆘 Support

### Documentation
- **README**: This comprehensive guide
- **Database Keepalive**: [`docs/KEEPALIVE_SETUP.md`](docs/KEEPALIVE_SETUP.md) - Database keepalive configuration
- **Code Comments**: Inline documentation throughout the codebase
- **Type Definitions**: TypeScript interfaces and types for all data structures
- **API Documentation**: Function signatures and usage examples

### Getting Help
For support and questions:
- **GitHub Issues**: Create an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for general questions
- **Documentation**: Check this README and code comments first
- **Community**: Join our community discussions and forums

### Common Issues

#### Authentication Issues
- **Solution**: Check Supabase configuration and environment variables
- **Debug**: Verify RLS policies and user permissions

#### PDF Generation Issues
- **Solution**: Ensure image URLs are accessible and properly formatted
- **Debug**: Check console for image conversion errors

#### Real-time Updates Not Working
- **Solution**: Verify Supabase subscription setup and network connectivity
- **Debug**: Check browser network tab for WebSocket connections

#### 3D Visualization Problems
- **Solution**: Check browser WebGL support and hardware acceleration
- **Debug**: Verify Three.js dependencies and canvas rendering

#### Performance Issues
- **Solution**: Check for memory leaks and optimize component re-renders
- **Debug**: Use React DevTools and browser performance profiling

### Troubleshooting Tips
1. **Clear browser cache** and cookies
2. **Check browser console** for error messages
3. **Verify environment variables** are correctly set
4. **Test in incognito mode** to isolate extension conflicts
5. **Update dependencies** to latest compatible versions

---

**Built with ❤️ using Next.js 15, Supabase, and modern web technologies**

*RoPIC System - Streamlining inventory management through intelligent automation*

## 📊 Dependencies

### Production Dependencies
- **@heroicons/react**: v2.2.0 - Icon library for UI components
- **@heroui/react**: v2.7.8 - UI component library (NextUI fork)
- **@react-pdf/renderer**: v4.3.0 - PDF generation for reports
- **@react-three/fiber**: v9.1.2 - React renderer for Three.js
- **@react-three/drei**: v10.0.6 - Useful helpers for React Three Fiber
- **@supabase/supabase-js**: v2.49.4 - Supabase client library
- **framer-motion**: v12.6.3 - Animation library
- **next**: v15.3.3 - React framework
- **react**: v19.1.0 - UI library
- **three**: v0.175.0 - 3D graphics library

### Development Dependencies
- **@iconify-icon/react**: v2.3.0 - Icon components
- **typescript**: v5 - Type checking
- **tailwindcss**: v3.4.17 - CSS framework
- **autoprefixer**: v10.4.21 - CSS vendor prefixing

---

*Last updated: June 2025*