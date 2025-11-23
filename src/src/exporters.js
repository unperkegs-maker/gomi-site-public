function sanitizeCell(value) {
  return String(value ?? '')
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, ' / ')
    .trim();
}

function stringifyCategories(item) {
  const categories = item.categories || [];
  return categories.join('|');
}

function stringifyInstructions(item) {
  const instructions = item.instructions || [];
  return instructions.join(' / ');
}

export function itemsToTSV(items) {
  const headers = ['prefecture', 'municipality', 'item_name', 'categories', 'instructions'];
  const rows = items.map((item) => [
    sanitizeCell(item.prefecture),
    sanitizeCell(item.municipality_name || item.municipality),
    sanitizeCell(item.item_name),
    sanitizeCell(stringifyCategories(item)),
    sanitizeCell(stringifyInstructions(item)),
  ]);
  return [headers.join('\t'), ...rows.map((row) => row.join('\t'))].join('\n');
}
