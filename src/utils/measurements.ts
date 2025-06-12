/**
 * Fetches available units from the database or returns default ones
 */
export function getMeasurementUnitOptions() {
  return [
    "length", "mass", "volume", "area", "count",
  ];
}

/**
 * Fetches available units from the database or returns default ones
 */
export function getUnitOptions(measurementUnit?: string) {
  switch (measurementUnit?.toLowerCase()) {
    case 'length':
      return ["m", "cm", "mm", "km", "ft", "in", "yd", "mi"];
    case 'mass':
      return ["kg", "g", "mg", "tonne", "lb", "oz"];
    case 'volume':
      return ["l", "ml", "m3", "cm3", "ft3", "in3"];
    case 'area':
      return ["m2", "cm2", "mm2", "km2", "ft2", "in2"];
    case 'count':
      return ["pcs", "items", "units", "dozen", "gross"];
    default:
      return [
        "kg", "g", "mg", "tonne", "lb", "oz",
        "l", "ml", "m3", "cm3", "ft3", "in3",
        "m", "cm", "mm", "km", "ft", "in", "yd", "mi",
        "m2", "cm2", "mm2", "km2", "ft2", "in2",
        "pcs", "items", "units", "dozen", "gross"
      ];
  }
}

/**
 * Returns the full name of a unit abbreviation
 */
export function getUnitFullName(unit: string, titleCase: boolean = true): string {
  const unitMap: Record<string, string> = {
    // Length
    m: "meter",
    cm: "centimeter",
    mm: "millimeter",
    km: "kilometer",
    ft: "foot",
    in: "inch",
    yd: "yard",
    mi: "mile",
    // Mass
    kg: "kilogram",
    g: "gram",
    mg: "milligram",
    tonne: "tonne",
    lb: "pound",
    oz: "ounce",
    // Volume
    l: "liter",
    ml: "milliliter",
    m3: "cubic meter",
    cm3: "cubic centimeter",
    ft3: "cubic foot",
    in3: "cubic inch",
    // Area
    m2: "square meter",
    cm2: "square centimeter",
    mm2: "square millimeter",
    km2: "square kilometer",
    ft2: "square foot",
    in2: "square inch",
    // Count
    pcs: "pieces",
    items: "items",
    units: "units",
    dozen: "dozen",
    gross: "gross"
  };

  if (titleCase) 
    return unitMap[unit.toLowerCase()]?.replace(/\b\w/g, char => char.toUpperCase()) || unit;
  else
    return unitMap[unit.toLowerCase()] || unit;
}

/**
 * Get default standard unit for a measurement type
 */
export function getDefaultStandardUnit(measurementUnit: string): string {
  switch (measurementUnit?.toLowerCase()) {
    case 'length':
      return "m";
    case 'mass':
      return "kg";
    case 'volume':
      return "l";
    case 'area':
      return "m2";
    case 'count':
      return "pcs";
    default:
      return "pcs";
  }
}

/**
 * Convert units using the conversion factors
 */
export function convertUnit(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;
  
  const conversionFactor = getUnitConversionFactor(fromUnit, toUnit);
  return value * conversionFactor;
}

/**
 * Get unit conversion factor between two units
 */
export function getUnitConversionFactor(fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return 1;
  
  // Mass conversions (to kg as base)
  const massConversions: Record<string, Record<string, number>> = {
    'kg': { 'g': 1000, 'mg': 1000000, 'tonne': 0.001, 'lb': 2.20462, 'oz': 35.274 },
    'g': { 'kg': 0.001, 'mg': 1000, 'tonne': 0.000001, 'lb': 0.00220462, 'oz': 0.035274 },
    'mg': { 'kg': 0.000001, 'g': 0.001, 'tonne': 0.000000001, 'lb': 0.00000220462, 'oz': 0.000035274 },
    'tonne': { 'kg': 1000, 'g': 1000000, 'mg': 1000000000, 'lb': 2204.62, 'oz': 35274 },
    'lb': { 'kg': 0.453592, 'g': 453.592, 'mg': 453592, 'tonne': 0.000453592, 'oz': 16 },
    'oz': { 'kg': 0.0283495, 'g': 28.3495, 'mg': 28349.5, 'tonne': 0.0000283495, 'lb': 0.0625 }
  };
  
  // Length conversions (to m as base)
  const lengthConversions: Record<string, Record<string, number>> = {
    'm': { 'cm': 100, 'mm': 1000, 'km': 0.001, 'ft': 3.28084, 'in': 39.3701, 'yd': 1.09361, 'mi': 0.000621371 },
    'cm': { 'm': 0.01, 'mm': 10, 'km': 0.00001, 'ft': 0.0328084, 'in': 0.393701, 'yd': 0.0109361, 'mi': 0.00000621371 },
    'mm': { 'm': 0.001, 'cm': 0.1, 'km': 0.000001, 'ft': 0.00328084, 'in': 0.0393701, 'yd': 0.00109361, 'mi': 0.000000621371 },
    'km': { 'm': 1000, 'cm': 100000, 'mm': 1000000, 'ft': 3280.84, 'in': 39370.1, 'yd': 1093.61, 'mi': 0.621371 },
    'ft': { 'm': 0.3048, 'cm': 30.48, 'mm': 304.8, 'km': 0.0003048, 'in': 12, 'yd': 0.333333, 'mi': 0.000189394 },
    'in': { 'm': 0.0254, 'cm': 2.54, 'mm': 25.4, 'km': 0.0000254, 'ft': 0.0833333, 'yd': 0.0277778, 'mi': 0.0000157828 },
    'yd': { 'm': 0.9144, 'cm': 91.44, 'mm': 914.4, 'km': 0.0009144, 'ft': 3, 'in': 36, 'mi': 0.000568182 },
    'mi': { 'm': 1609.34, 'cm': 160934, 'mm': 1609340, 'km': 1.60934, 'ft': 5280, 'in': 63360, 'yd': 1760 }
  };
  
  // Volume conversions (to l as base)
  const volumeConversions: Record<string, Record<string, number>> = {
    'l': { 'ml': 1000, 'm3': 0.001, 'cm3': 1000, 'ft3': 0.0353147, 'in3': 61.0237 },
    'ml': { 'l': 0.001, 'm3': 0.000001, 'cm3': 1, 'ft3': 0.0000353147, 'in3': 0.0610237 },
    'm3': { 'l': 1000, 'ml': 1000000, 'cm3': 1000000, 'ft3': 35.3147, 'in3': 61023.7 },
    'cm3': { 'l': 0.001, 'ml': 1, 'm3': 0.000001, 'ft3': 0.0000353147, 'in3': 0.0610237 },
    'ft3': { 'l': 28.3168, 'ml': 28316.8, 'm3': 0.0283168, 'cm3': 28316.8, 'in3': 1728 },
    'in3': { 'l': 0.0163871, 'ml': 16.3871, 'm3': 0.0000163871, 'cm3': 16.3871, 'ft3': 0.000578704 }
  };
  
  // Area conversions (to m2 as base)
  const areaConversions: Record<string, Record<string, number>> = {
    'm2': { 'cm2': 10000, 'mm2': 1000000, 'km2': 0.000001, 'ft2': 10.7639, 'in2': 1550 },
    'cm2': { 'm2': 0.0001, 'mm2': 100, 'km2': 0.0000000001, 'ft2': 0.00107639, 'in2': 0.155 },
    'mm2': { 'm2': 0.000001, 'cm2': 0.01, 'km2': 0.000000000001, 'ft2': 0.0000107639, 'in2': 0.00155 },
    'km2': { 'm2': 1000000, 'cm2': 10000000000, 'mm2': 1000000000000, 'ft2': 10763900, 'in2': 1550003100 },
    'ft2': { 'm2': 0.092903, 'cm2': 929.03, 'mm2': 92903, 'km2': 0.000000092903, 'in2': 144 },
    'in2': { 'm2': 0.00064516, 'cm2': 6.4516, 'mm2': 645.16, 'km2': 0.00000000064516, 'ft2': 0.00694444 }
  };
  
  // Count conversions (to pcs as base)
  const countConversions: Record<string, Record<string, number>> = {
    'pcs': { 'items': 1, 'units': 1, 'dozen': 0.0833333, 'gross': 0.00694444 },
    'items': { 'pcs': 1, 'units': 1, 'dozen': 0.0833333, 'gross': 0.00694444 },
    'units': { 'pcs': 1, 'items': 1, 'dozen': 0.0833333, 'gross': 0.00694444 },
    'dozen': { 'pcs': 12, 'items': 12, 'units': 12, 'gross': 0.0833333 },
    'gross': { 'pcs': 144, 'items': 144, 'units': 144, 'dozen': 12 }
  };
  
  // Try to find conversion
  for (const conversionTable of [massConversions, lengthConversions, volumeConversions, areaConversions, countConversions]) {
    if (conversionTable[fromUnit] && conversionTable[fromUnit][toUnit]) {
      return conversionTable[fromUnit][toUnit];
    }
  }
  
  return 1; // Default case, no conversion
}

/**
 * Fetches available bulk units from the database or returns default ones
 */
export function getPackagingUnitOptions() {
  return [
    "roll", "box", "container", "drum", "pack", "sack",
    "carton", "set", "pallet", "bag", "crate"
  ];
}


/**
 * Convert a value and unit to the standard unit, displaying it with proper formatting
 */
export function formatUnitWithConversion(
  value: number, 
  fromUnit: string, 
  standardUnit: string,
  showOriginal: boolean = true
): string {
  if (!fromUnit || !standardUnit || !value) {
    return `${formatNumber(value || 0)} ${fromUnit || 'units'}`;
  }

  const convertedValue = convertUnit(value, fromUnit, standardUnit);
  
  if (fromUnit === standardUnit || !showOriginal) {
    return `${formatNumber(convertedValue)} ${standardUnit}`;
  }
  
  return `${formatNumber(value)} ${fromUnit} (${formatNumber(convertedValue)} ${standardUnit})`;
}

/**
 * Calculate total value in standard units from an array of items
 */
export function calculateTotalInStandardUnit(
  items: Array<{ unit_value?: number; unit?: string }>,
  standardUnit: string
): number {
  return items.reduce((total, item) => {
    if (item.unit && item.unit_value && standardUnit) {
      return total + convertUnit(item.unit_value, item.unit, standardUnit);
    }
    return total;
  }, 0);
}

/**
 * Get conversion factor for database use
 */
export function getDatabaseConversionFactor(fromUnit: string, toUnit: string): number {
  return getUnitConversionFactor(fromUnit, toUnit);
}

/**
 * Validate if two units can be converted between each other
 */
export function canConvertUnits(fromUnit: string, toUnit: string): boolean {
  if (fromUnit === toUnit) return true;
  
  const conversionFactor = getUnitConversionFactor(fromUnit, toUnit);
  return conversionFactor !== 1 || fromUnit === toUnit;
}

/**
 * Get measurement type from unit
 */
export function getMeasurementTypeFromUnit(unit: string): string {
  const massUnits = ["kg", "g", "mg", "tonne", "lb", "oz"];
  const lengthUnits = ["m", "cm", "mm", "km", "ft", "in", "yd", "mi"];
  const volumeUnits = ["l", "ml", "m3", "cm3", "ft3", "in3"];
  const areaUnits = ["m2", "cm2", "mm2", "km2", "ft2", "in2"];
  const countUnits = ["pcs", "items", "units", "dozen", "gross"];
  
  if (massUnits.includes(unit.toLowerCase())) return "mass";
  if (lengthUnits.includes(unit.toLowerCase())) return "length";
  if (volumeUnits.includes(unit.toLowerCase())) return "volume";
  if (areaUnits.includes(unit.toLowerCase())) return "area";
  if (countUnits.includes(unit.toLowerCase())) return "count";
  
  return "count"; // default
}

// Helper function for formatting numbers
function formatNumber(value: number): string {
  if (value === 0) return "0";
  if (value < 0.01) return value.toExponential(2);
  if (value < 1) return value.toFixed(3).replace(/\.?0+$/, '');
  if (value < 100) return value.toFixed(2).replace(/\.?0+$/, '');
  if (value < 1000) return value.toFixed(1).replace(/\.?0+$/, '');
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}
