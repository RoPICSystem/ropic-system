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
 * Fetches available bulk units from the database or returns default ones
 */
export function getPackagingUnitOptions() {
  return [
    "roll", "box", "container", "drum", "pack", "sack",
    "carton", "set", "pallet", "bag", "crate"
  ];
}