const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const DataFusion = require('../models/DataFusion');
const Dataset = require('../models/Dataset');
const AuditLog = require('../models/AuditLog');
const { readCsvFile } = require('../utils/csvHelper');

/**
 * Computes Source Trust Score for a dataset based on:
 * 1. Completeness: ratio of non-null cells across relevant columns
 * 2. Consistency: low variance / irregularity in reporting
 * 3. Recency: relative freshness based on dataset upload or metadata
 */
function computeSourceTrust(dataset, rows, columns) {
  if (!rows || rows.length === 0) {
    return { score: 50, completeness: 50, consistency: 50, recency: 50 };
  }

  // 1. Completeness
  let totalCells = 0;
  let filledCells = 0;
  rows.forEach((row) => {
    columns.forEach((col) => {
      totalCells++;
      const val = row[col];
      if (val !== null && val !== undefined && val !== '') {
        filledCells++;
      }
    });
  });
  const completeness = totalCells > 0 ? (filledCells / totalCells) * 100 : 80;

  // 2. Consistency (rate of finite numeric or valid string formatting)
  let validCount = 0;
  rows.forEach((row) => {
    let rowValid = true;
    columns.forEach((col) => {
      const val = row[col];
      if (typeof val === 'number' && (!isFinite(val) || isNaN(val))) {
        rowValid = false;
      }
    });
    if (rowValid) validCount++;
  });
  const consistency = (validCount / rows.length) * 100;

  // 3. Recency: Exponential decay based on days since dataset upload
  const ageDays = Math.max(0, (Date.now() - new Date(dataset.createdAt).getTime()) / (1000 * 3600 * 24));
  const recency = Math.max(40, 100 * Math.exp(-ageDays / 365));

  // Weighted composite Source Trust Score
  const score = 0.45 * completeness + 0.35 * consistency + 0.20 * recency;

  return {
    score: Math.min(100, Math.max(10, Math.round(score * 10) / 10)),
    completeness: Math.round(completeness * 10) / 10,
    consistency: Math.round(consistency * 10) / 10,
    recency: Math.round(recency * 10) / 10,
  };
}

/**
 * Executes cross-dataset data fusion and conflict detection.
 */
const runFusion = async (req, res, next) => {
  try {
    const {
      datasetAId,
      datasetBId,
      name,
      keyColumns = [],
      compareColumns = [],
      maxRecords = 10000,
      discrepancyThresholdPct = 5,
    } = req.body;

    if (!datasetAId || !datasetBId || datasetAId === datasetBId) {
      return res.status(400).json({
        success: false,
        message: 'Two distinct dataset IDs (datasetAId and datasetBId) are required.',
        data: null,
        error: 'INVALID_DATASETS',
      });
    }

    const [datasetA, datasetB] = await Promise.all([
      Dataset.findById(datasetAId),
      Dataset.findById(datasetBId),
    ]);

    if (!datasetA || !datasetB) {
      return res.status(404).json({
        success: false,
        message: 'One or both datasets could not be found.',
        data: null,
        error: 'DATASET_NOT_FOUND',
      });
    }

    const pathA = path.resolve(datasetA.filePath);
    const pathB = path.resolve(datasetB.filePath);

    if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
      return res.status(404).json({
        success: false,
        message: 'Underlying file for one or both datasets is missing from storage.',
        data: null,
        error: 'FILE_NOT_FOUND',
      });
    }

    // Read both CSV datasets
    const [dataA, dataB] = await Promise.all([
      readCsvFile(pathA, maxRecords),
      readCsvFile(pathB, maxRecords),
    ]);

    // Resolve key columns (use supplied keys or auto-detect based on schema hierarchy and common identifiers)
    let resolvedKeyCols = Array.isArray(keyColumns)
      ? keyColumns.filter(Boolean)
      : typeof keyColumns === 'string'
      ? keyColumns.split(',').map((k) => k.trim()).filter(Boolean)
      : [];

    if (resolvedKeyCols.length === 0) {
      const commonHeaders = dataA.headers.filter((h) => dataB.headers.includes(h));

      // 1. Try schema mapping hierarchy and temporal columns
      const hierarchyKeys = [];
      if (datasetA.schemaMapping) {
        const mappingA = datasetA.schemaMapping.entries
          ? Object.fromEntries(datasetA.schemaMapping.entries())
          : datasetA.schemaMapping;
        const sortedHierarchy = Object.entries(mappingA)
          .filter(([col, info]) => info && info.isHierarchy && commonHeaders.includes(col))
          .sort((a, b) => (a[1].hierarchyLevel || 99) - (b[1].hierarchyLevel || 99))
          .map(([col]) => col);

        hierarchyKeys.push(...sortedHierarchy);
        const dateCols = Object.entries(mappingA)
          .filter(([col, info]) => info && ['date', 'year', 'month', 'timestamp'].includes(info.canonicalRole) && commonHeaders.includes(col))
          .map(([col]) => col);
        hierarchyKeys.push(...dateCols);
      }

      if (hierarchyKeys.length > 0) {
        resolvedKeyCols = [...new Set(hierarchyKeys)];
      } else {
        // 2. Try known domain composite keys
        const candidateKeySets = [
          ['state', 'district', 'block', 'gram_panchayat', 'date'],
          ['district', 'block', 'gram_panchayat', 'date'],
          ['district', 'block', 'date'],
          ['district', 'block', 'year', 'month'],
          ['district', 'block'],
          ['pc_name', 'candidate'],
          ['ac_name', 'candidate'],
          ['state', 'district', 'sub_district'],
          ['state', 'district'],
          ['district'],
          ['record_id'],
          ['id'],
        ];

        for (const candidateSet of candidateKeySets) {
          if (candidateSet.every((col) => commonHeaders.includes(col))) {
            resolvedKeyCols = candidateSet;
            break;
          }
        }

        // 3. Fallback: first common categorical (non-numeric) headers
        if (resolvedKeyCols.length === 0 && dataA.rows.length > 0) {
          const sampleRow = dataA.rows[0];
          const stringCols = commonHeaders.filter((h) => typeof sampleRow[h] === 'string');
          if (stringCols.length > 0) {
            resolvedKeyCols = stringCols.slice(0, 3);
          }
        }
      }
    }

    if (resolvedKeyCols.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Could not auto-detect matching key columns. Please explicitly specify matching key columns (e.g., district, block).',
        data: null,
        error: 'KEY_COLUMNS_REQUIRED',
      });
    }

    // Resolve compare columns if omitted (use common numeric/feature columns)
    let activeCompareCols = Array.isArray(compareColumns)
      ? compareColumns.filter(Boolean)
      : typeof compareColumns === 'string'
      ? compareColumns.split(',').map((c) => c.trim()).filter(Boolean)
      : [];

    if (activeCompareCols.length === 0) {
      activeCompareCols = dataA.headers.filter(
        (h) => dataB.headers.includes(h) && !resolvedKeyCols.includes(h)
      );
    }

    // Compute Source Trust Scores
    const relevantCols = [...new Set([...resolvedKeyCols, ...activeCompareCols])];
    const sourceTrustA = computeSourceTrust(datasetA, dataA.rows, relevantCols);
    const sourceTrustB = computeSourceTrust(datasetB, dataB.rows, relevantCols);

    // Build index map for Dataset B
    const indexB = new Map();
    dataB.rows.forEach((rowB) => {
      const compositeKey = resolvedKeyCols
        .map((k) => String(rowB[k] ?? '').trim().toLowerCase())
        .join('::');
      if (compositeKey) {
        indexB.set(compositeKey, rowB);
      }
    });

    let totalMatched = 0;
    const conflicts = [];
    const thresholdPct = Number(req.body.discrepancyThresholdPct ?? req.body.thresholdPct ?? 5);
    const thresholdRatio = Math.max(0.001, thresholdPct / 100);

    // Match records and identify discrepancies
    dataA.rows.forEach((rowA) => {
      const compositeKey = resolvedKeyCols
        .map((k) => String(rowA[k] ?? '').trim().toLowerCase())
        .join('::');

      if (!compositeKey || !indexB.has(compositeKey)) return;

      totalMatched++;
      const rowB = indexB.get(compositeKey);

      activeCompareCols.forEach((col) => {
        const valA = rowA[col];
        const valB = rowB[col];

        if (valA === undefined && valB === undefined) return;

        let hasConflict = false;
        if (typeof valA === 'number' && typeof valB === 'number') {
          // Numeric conflict if relative discrepancy exceeds threshold or absolute difference > 0.01
          const maxVal = Math.max(Math.abs(valA), Math.abs(valB));
          if (maxVal > 0) {
            hasConflict = (Math.abs(valA - valB) / maxVal) > thresholdRatio;
          } else {
            hasConflict = Math.abs(valA - valB) > 0.01;
          }
        } else {
          // String conflict
          const sA = String(valA ?? '').trim().toLowerCase();
          const sB = String(valB ?? '').trim().toLowerCase();
          hasConflict = sA !== sB;
        }

        if (hasConflict) {
          conflicts.push({
            key: compositeKey,
            column: col,
            sourceA: {
              value: valA,
              recordIndex: rowA._recordIndex,
            },
            sourceB: {
              value: valB,
              recordIndex: rowB._recordIndex,
            },
            resolution: {
              status: 'PENDING',
              method: 'KEEP_BOTH_FLAGGED',
              resolvedValue: null,
            },
          });
        }
      });
    });

    const fusionDoc = await DataFusion.create({
      name: name || `Fusion: ${datasetA.name} & ${datasetB.name}`,
      datasetA: datasetA._id,
      datasetB: datasetB._id,
      keyColumns: resolvedKeyCols,
      compareColumns: activeCompareCols,
      totalMatched,
      totalConflicts: conflicts.length,
      status: conflicts.length === 0 ? 'RESOLVED' : 'PENDING_REVIEW',
      sourceTrustA,
      sourceTrustB,
      conflicts,
      createdBy: req.user._id,
      auditLog: [
        {
          action: 'CREATE_FUSION',
          user: req.user._id,
          timestamp: new Date(),
          details: {
            datasetA: datasetA.name,
            datasetB: datasetB.name,
            totalMatched,
            totalConflicts: conflicts.length,
          },
        },
      ],
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'RUN_DATA_FUSION',
      entity: 'DataFusion',
      entityId: fusionDoc._id,
      metadata: {
        fusionId: fusionDoc._id,
        matched: totalMatched,
        conflicts: conflicts.length,
      },
      ip: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: `Data fusion completed. Matched ${totalMatched} records with ${conflicts.length} field conflicts detected.`,
      data: {
        fusion: fusionDoc,
        fusionId: fusionDoc._id,
        conflictsCount: conflicts.length,
        sourceTrustA,
        sourceTrustB,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves all data fusions with pagination.
 */
const getFusions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [fusions, total] = await Promise.all([
      DataFusion.find()
        .populate('datasetA', 'name category dataType')
        .populate('datasetB', 'name category dataType')
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DataFusion.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Fusions retrieved successfully',
      data: {
        fusions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves a single data fusion by ID.
 */
const getFusionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid fusion ID is required',
        data: null,
        error: 'INVALID_ID',
      });
    }

    const fusion = await DataFusion.findById(id)
      .populate('datasetA', 'name category dataType originalFileName')
      .populate('datasetB', 'name category dataType originalFileName')
      .populate('createdBy', 'name email role')
      .populate('conflicts.resolution.resolvedBy', 'name email')
      .populate('auditLog.user', 'name email')
      .lean();

    if (!fusion) {
      return res.status(404).json({
        success: false,
        message: 'Data fusion record not found',
        data: null,
        error: 'NOT_FOUND',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Data fusion record retrieved successfully',
      data: { fusion },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Resolves one or more conflicts with user provenance.
 * Never silently overwrites values; stores original source values and audit log.
 */
const resolveConflict = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      conflictId,
      conflictIndex,
      method = 'KEEP_BOTH_FLAGGED',
      manualValue = null,
      resolvedValue = null,
      notes = '',
    } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid fusion ID is required',
        data: null,
        error: 'INVALID_ID',
      });
    }

    const fusion = await DataFusion.findById(id);
    if (!fusion) {
      return res.status(404).json({
        success: false,
        message: 'Data fusion record not found',
        data: null,
        error: 'NOT_FOUND',
      });
    }

    let targetConflict = null;
    if (conflictId && mongoose.Types.ObjectId.isValid(conflictId)) {
      targetConflict = fusion.conflicts.id(conflictId);
    }
    if (!targetConflict && conflictIndex !== undefined && fusion.conflicts[conflictIndex]) {
      targetConflict = fusion.conflicts[conflictIndex];
    }

    if (!targetConflict) {
      return res.status(404).json({
        success: false,
        message: 'Conflict item not found in fusion record',
        data: null,
        error: 'CONFLICT_NOT_FOUND',
      });
    }

    let resolvedVal = null;
    const valA = targetConflict.sourceA.value;
    const valB = targetConflict.sourceB.value;
    const wA = fusion.sourceTrustA.score || 50;
    const wB = fusion.sourceTrustB.score || 50;

    switch (method) {
      case 'MANUAL':
        resolvedVal = resolvedValue !== null ? resolvedValue : manualValue;
        break;
      case 'PREFER_A':
        resolvedVal = valA;
        break;
      case 'PREFER_B':
        resolvedVal = valB;
        break;
      case 'TRUST_WEIGHTED_MEAN':
        if (typeof valA === 'number' && typeof valB === 'number') {
          resolvedVal = Number(((valA * wA + valB * wB) / (wA + wB)).toFixed(4));
        } else {
          resolvedVal = wA >= wB ? valA : valB;
        }
        break;
      case 'KEEP_BOTH_FLAGGED':
      default:
        resolvedVal = null;
        break;
    }

    targetConflict.resolution.status = 'RESOLVED';
    targetConflict.resolution.method = method;
    targetConflict.resolution.resolvedValue = resolvedVal;
    targetConflict.resolution.resolvedBy = req.user._id;
    targetConflict.resolution.resolvedAt = new Date();
    targetConflict.resolution.notes = notes;

    // Calculate resolved count
    const resolvedCount = fusion.conflicts.filter((c) => c.resolution.status === 'RESOLVED').length;
    fusion.resolvedCount = resolvedCount;

    // Check if all conflicts are now resolved
    if (resolvedCount === fusion.conflicts.length) {
      fusion.status = 'RESOLVED';
    }

    fusion.auditLog.push({
      action: 'RESOLVE_CONFLICT',
      user: req.user._id,
      timestamp: new Date(),
      details: {
        conflictId,
        key: targetConflict.key,
        column: targetConflict.column,
        method,
        resolvedValue: resolvedVal,
        notes,
      },
    });

    await fusion.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'RESOLVE_FUSION_CONFLICT',
      entity: 'DataFusion',
      entityId: fusion._id,
      metadata: {
        conflictId,
        column: targetConflict.column,
        method,
        resolvedValue: resolvedVal,
      },
      ip: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `Conflict for column '${targetConflict.column}' resolved via '${method}'.`,
      data: {
        fusion,
        conflict: targetConflict,
        resolvedConflict: targetConflict,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Deletes a data fusion record.
 */
const deleteFusion = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid fusion ID is required',
        data: null,
        error: 'INVALID_ID',
      });
    }

    const deleted = await DataFusion.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Data fusion record not found',
        data: null,
        error: 'NOT_FOUND',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Data fusion record removed successfully',
      data: null,
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  runFusion,
  getFusions,
  getFusionById,
  resolveConflict,
  deleteFusion,
};
