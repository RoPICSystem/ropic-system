
// Convert column to Excel style (AA = 0, AB = 1, etc.)
export const parseColumn = (column: number | null) => {
  if (column === null || column === undefined) return null;

  const firstChar = String.fromCharCode(65 + Math.floor(column / 26));
  const secondChar = String.fromCharCode(65 + (column % 26));
  const colStr = column !== undefined && column !== null ?
    firstChar + secondChar :
    null;
  return colStr;
}

export const formatCode = (location: any | any) => {
  // Format the location code
  const { floor, group, row, column, depth = 0 } = location;
  const colStr = parseColumn(column);

  // Format with leading zeros: floor (2 digits), row (2 digits), depth (2 digits), group (2 digits)
  const floorStr = floor !== undefined && floor !== null ?
    floor.toString().padStart(2, '0') : "00";
  const rowStr = row !== undefined && row !== null ?
    row.toString().padStart(2, '0') : "??";
  const groupStr = group !== undefined && group !== null ?
    group.toString().padStart(2, '0') : "??";
  const depthStr = depth !== undefined && depth !== null ?
    depth.toString().padStart(2, '0') : "??";

  return `F${floorStr}${colStr}${rowStr}D${depthStr}C${groupStr}`;
}