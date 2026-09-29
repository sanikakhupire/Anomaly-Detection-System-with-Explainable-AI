const fs = require('fs');
const readline = require('readline');

/**
 * Splits a single CSV line into tokens, respecting double-quoted strings.
 */
function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Reads a CSV file and returns headers and rows up to maxRows.
 */
async function readCsvFile(filePath, maxRows = 10000) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at path: ${filePath}`);
  }

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let headers = null;
  const rows = [];
  let rowIndex = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headers) {
      headers = parseCsvLine(line).map((h) => h.replace(/^["']|["']$/g, '').trim());
      continue;
    }

    const values = parseCsvLine(line);
    const rowObj = {};
    headers.forEach((h, idx) => {
      let val = values[idx];
      if (val !== undefined) {
        val = val.replace(/^["']|["']$/g, '').trim();
        // Auto convert numeric strings
        if (val !== '' && !isNaN(val)) {
          const num = Number(val);
          rowObj[h] = isFinite(num) ? num : val;
        } else {
          rowObj[h] = val;
        }
      } else {
        rowObj[h] = null;
      }
    });

    rowObj._recordIndex = rowIndex++;
    rows.push(rowObj);

    if (rows.length >= maxRows) break;
  }

  rl.close();
  fileStream.destroy();

  return { headers: headers || [], rows };
}

module.exports = {
  parseCsvLine,
  readCsvFile,
};
