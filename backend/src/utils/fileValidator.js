const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

/**
 * Calculates SHA-256 hash of a file on disk
 */
const calculateFileHash = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
};

/**
 * Parses and validates CSV headers for:
 * 1. Missing or blank column names
 * 2. Duplicate column names
 */
const validateCsvHeader = async (filePath) => {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let firstLine = null;
  for await (const line of rl) {
    if (line.trim().length > 0) {
      firstLine = line;
      break;
    }
  }
  rl.close();
  fileStream.destroy();

  if (!firstLine) {
    return {
      isValid: false,
      error: 'File is empty or contains no readable header line',
    };
  }

  // Parse CSV header columns taking quotes into account
  const columns = parseCsvHeaderLine(firstLine);

  if (columns.length === 0) {
    return {
      isValid: false,
      error: 'No valid column headers detected in the file',
    };
  }

  // Check for missing/empty column headers
  const emptyColIndices = [];
  columns.forEach((col, idx) => {
    if (!col || col.trim().length === 0 || col.trim().toLowerCase().startsWith('unnamed:')) {
      emptyColIndices.push(idx + 1);
    }
  });

  if (emptyColIndices.length > 0) {
    return {
      isValid: false,
      error: `Missing or empty column header at column position(s): ${emptyColIndices.join(', ')}`,
      code: 'MISSING_HEADERS',
    };
  }

  // Check for duplicate column names (case-insensitive check)
  const seen = new Set();
  const duplicates = new Set();
  columns.forEach((col) => {
    const normalized = col.trim().toLowerCase();
    if (seen.has(normalized)) {
      duplicates.add(col.trim());
    }
    seen.add(normalized);
  });

  if (duplicates.size > 0) {
    return {
      isValid: false,
      error: `Duplicate column header(s) detected: ${Array.from(duplicates).join(', ')}`,
      code: 'DUPLICATE_COLUMNS',
    };
  }

  return {
    isValid: true,
    columns: columns.map((c) => c.trim()),
  };
};

/**
 * Helper to split CSV header respecting quotes
 */
const parseCsvHeaderLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
};

module.exports = {
  calculateFileHash,
  validateCsvHeader,
};
