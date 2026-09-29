const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const AnomalyRecord = require('../models/AnomalyRecord');
const Dataset = require('../models/Dataset');
const ProcessingJob = require('../models/ProcessingJob');
const PeerGroup = require('../models/PeerGroup');
const AuditLog = require('../models/AuditLog');
const mlService = require('../services/ml.service');

/**
 * Triggers anomaly detection pipeline on a dataset.
 * Runs detectors (Z-Score, Robust Z, Isolation Forest, Temporal) asynchronously.
 */
const detectAnomalies = async (req, res, next) => {
  try {
    const {
      datasetId,
      detectors = ['robust_z', 'isolation_forest', 'z_score', 'temporal'],
      contamination = 0.05,
      randomState = 42,
      peerGroupCol = null,
      dateCol = null,
      featureCols = null,
      maxRecords = null,
      fusionMethod = 'acat',
      fdrMethod = 'bh',
      targetFdr = 0.05,
      contaminationTrim = 0.02,
    } = req.body;

    if (!datasetId || !mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid datasetId is required',
        data: null,
        error: 'INVALID_DATASET_ID',
      });
    }

    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found',
        data: null,
        error: 'DATASET_NOT_FOUND',
      });
    }

    const filePath = path.resolve(dataset.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Underlying dataset file is missing from server storage',
        data: null,
        error: 'FILE_NOT_FOUND',
      });
    }

    // 1. Create a background ProcessingJob
    const job = await ProcessingJob.create({
      datasetId: dataset._id,
      type: 'ANOMALY_DETECTION',
      status: 'PROCESSING',
      progress: 10,
      step: 'Preparing dataset features and peer group references',
      createdBy: req.user._id,
      startedAt: new Date(),
    });

    // 2. Fetch existing peer group baselines if available
    let peerBaselines = null;
    let resolvedPeerGroupCol = peerGroupCol;
    let resolvedDateCol = dateCol;

    // Check schema mapping for default columns
    if (dataset.schemaMapping) {
      for (const [col, info] of dataset.schemaMapping.entries ? dataset.schemaMapping.entries() : Object.entries(dataset.schemaMapping)) {
        if (!resolvedPeerGroupCol && (info.canonicalType === 'district' || info.canonicalType === 'state')) {
          resolvedPeerGroupCol = col;
        }
        if (!resolvedDateCol && (info.canonicalType === 'date' || info.canonicalType === 'timestamp')) {
          resolvedDateCol = col;
        }
      }
    }

    const peerGroupDoc = await PeerGroup.findOne({ dataset: dataset._id }).lean();
    if (peerGroupDoc && peerGroupDoc.groups) {
      peerBaselines = {};
      resolvedPeerGroupCol = resolvedPeerGroupCol || peerGroupDoc.groupColumn;
      peerGroupDoc.groups.forEach((g) => {
        peerBaselines[g.groupId] = { baselines: g.baselines };
      });
    }

    // 3. Execute ML Service Detector Suite
    try {
      job.progress = 35;
      job.step = 'Executing statistical and machine-learning detectors';
      await job.save();

      const mlResult = await mlService.analyzeDataset({
        filePath,
        featureCols,
        peerGroupCol: resolvedPeerGroupCol,
        peerBaselines,
        dateCol: resolvedDateCol,
        detectors,
        contamination: parseFloat(contamination),
        randomState: parseInt(randomState, 10),
        maxRecords,
        fusionMethod,
        fdrMethod,
        targetFdr: parseFloat(targetFdr),
        contaminationTrim: parseFloat(contaminationTrim),
      });

      const { summary, records } = mlResult;

      job.progress = 75;
      job.step = 'Storing calibrated anomaly records into MongoDB';
      await job.save();

      // 4. Remove previous anomaly records for this dataset to maintain clean idempotent state
      await AnomalyRecord.deleteMany({ dataset: dataset._id });

      // 5. Batch insert records
      if (records && records.length > 0) {
        const docsToInsert = records.map((r) => ({
          dataset: dataset._id,
          recordIndex: r.record_index,
          recordData: r.record_data,
          detectorScores: r.detector_scores,
          detectorPValues: r.detector_pvalues || {},
          detectorFlags: r.detector_flags,
          combinedP: r.combined_p ?? 1.0,
          qValue: r.q_value ?? 1.0,
          combinedScore: r.combined_score ?? r.ensemble_score ?? 0.0,
          ensembleScore: r.ensemble_score ?? 0.0,
          atpi: r.atpi ?? 0.0,
          atpiBreakdown: r.atpi_breakdown || {},
          isAnomaly: r.is_anomaly,
          flags: r.flags || [],
          peerGroup: r.peer_group,
          peerContextFlag: Boolean(r.peer_context_flag),
          detectionMethods: r.detection_methods || [],
          status: 'NEW',
          reviewStatus: 'PENDING',
          triagePriority: r.triage_priority || (r.atpi >= 75 ? 'CRITICAL' : r.atpi >= 55 ? 'HIGH' : 'MEDIUM'),
        }));

        // Insert in batches of 5000 to prevent payload limits
        const batchSize = 5000;
        for (let i = 0; i < docsToInsert.length; i += batchSize) {
          const batch = docsToInsert.slice(i, i + batchSize);
          await AnomalyRecord.insertMany(batch, { ordered: false });
        }
      }

      // 6. Complete Job & Audit
      job.progress = 100;
      job.step = 'Anomaly detection completed successfully';
      job.status = 'COMPLETED';
      job.result = summary;
      job.completedAt = new Date();
      await job.save();

      await AuditLog.create({
        user: req.user._id,
        action: 'DETECT_ANOMALIES',
        entity: 'AnomalyRecord',
        entityId: dataset._id,
        metadata: {
          datasetId: dataset._id,
          totalRecords: summary.total_records,
          totalAnomalies: summary.total_anomalies,
          anomalyRate: summary.anomaly_rate,
          activeDetectors: summary.active_detectors,
        },
        ip: req.ip,
      });

      return res.status(200).json({
        success: true,
        message: `Detection complete. Scanned ${summary.total_records} records, identified ${summary.total_anomalies} potential anomalies.`,
        data: {
          jobId: job._id,
          summary,
        },
        error: null,
      });
    } catch (mlErr) {
      job.status = 'FAILED';
      job.error = mlErr.message;
      job.completedAt = new Date();
      await job.save();

      return res.status(500).json({
        success: false,
        message: mlErr.message || 'Anomaly detection execution failed',
        data: { jobId: job._id },
        error: 'DETECTION_FAILED',
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Server-side paginated, filtered, and sorted retrieval of anomalies.
 */
const getAnomalies = async (req, res, next) => {
  try {
    const {
      datasetId,
      detector,
      flag,
      status,
      reviewStatus,
      minScore,
      maxScore,
      maxQValue,
      minAtpi,
      peerContextOnly,
      priority,
      onlyAnomalies = 'true',
      search,
      sortBy = 'ensembleScore',
      sortOrder = 'desc',
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};

    if (datasetId && mongoose.Types.ObjectId.isValid(datasetId)) {
      query.dataset = datasetId;
    }

    if (onlyAnomalies === 'true') {
      query.isAnomaly = true;
    } else if (onlyAnomalies === 'false') {
      // return all records
    }

    if (detector) {
      // Filter records where the specific detector flagged an anomaly
      query[`detectorFlags.${detector}`] = true;
    }

    if (flag) {
      query.flags = flag;
    }

    if (status) {
      query.status = status;
    }

    if (reviewStatus) {
      query.reviewStatus = reviewStatus;
    }

    if (priority) {
      query.triagePriority = priority;
    }

    if (peerContextOnly === 'true') {
      query.peerContextFlag = true;
    }

    if (maxQValue !== undefined) {
      query.qValue = { $lte: parseFloat(maxQValue) };
    }

    if (minAtpi !== undefined) {
      query.atpi = { $gte: parseFloat(minAtpi) };
    }

    if (minScore !== undefined || maxScore !== undefined) {
      query.ensembleScore = {};
      if (minScore !== undefined) query.ensembleScore.$gte = parseFloat(minScore);
      if (maxScore !== undefined) query.ensembleScore.$lte = parseFloat(maxScore);
    }

    if (search) {
      const searchNum = parseInt(search, 10);
      if (!isNaN(searchNum)) {
        query.recordIndex = searchNum;
      } else {
        query.peerGroup = { $regex: search, $options: 'i' };
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortDir };

    const pValueBucketsPromise = query.dataset
      ? AnomalyRecord.aggregate([
          {
            $match: {
              dataset: new mongoose.Types.ObjectId(query.dataset),
              combinedP: { $exists: true, $ne: null },
            },
          },
          {
            $bucket: {
              groupBy: '$combinedP',
              boundaries: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001],
              default: 'other',
              output: {
                count: { $sum: 1 },
              },
            },
          },
        ])
      : Promise.resolve([]);

    const [anomalies, total, datasetCounts, pValueBuckets] = await Promise.all([
      AnomalyRecord.find(query)
        .populate('dataset', 'name category dataType originalFileName')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AnomalyRecord.countDocuments(query),
      AnomalyRecord.aggregate([
        { $match: query.dataset ? { dataset: new mongoose.Types.ObjectId(query.dataset) } : {} },
        {
          $group: {
            _id: null,
            totalScanned: { $sum: 1 },
            anomalyCount: { $sum: { $cond: ['$isAnomaly', 1, 0] } },
            significantFdrCount: { $sum: { $cond: [{ $lte: ['$qValue', 0.05] }, 1, 0] } },
            avgScore: { $avg: '$ensembleScore' },
            avgAtpi: { $avg: '$atpi' },
          },
        },
      ]),
      pValueBucketsPromise,
    ]);

    const summary = datasetCounts[0] || {
      totalScanned: 0,
      anomalyCount: 0,
      significantFdrCount: 0,
      avgScore: 0,
      avgAtpi: 0,
    };

    const binLabels = [
      '0.0-0.1',
      '0.1-0.2',
      '0.2-0.3',
      '0.3-0.4',
      '0.4-0.5',
      '0.5-0.6',
      '0.6-0.7',
      '0.7-0.8',
      '0.8-0.9',
      '0.9-1.0',
    ];
    const binMap = {};
    binLabels.forEach((label, idx) => {
      const boundaryStart = Number((idx * 0.1).toFixed(1));
      binMap[boundaryStart] = { bin: label, count: 0 };
    });
    (pValueBuckets || []).forEach((b) => {
      if (typeof b._id === 'number') {
        const key = Number(b._id.toFixed(1));
        if (binMap[key]) {
          binMap[key].count = b.count;
        }
      }
    });
    const pValueHistogram = binLabels.map((label, idx) => {
      const key = Number((idx * 0.1).toFixed(1));
      return binMap[key];
    });

    return res.status(200).json({
      success: true,
      message: 'Anomalies retrieved successfully',
      data: {
        anomalies,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
        summary: {
          totalScanned: summary.totalScanned,
          anomalyCount: summary.anomalyCount,
          significantFdrCount: summary.significantFdrCount || 0,
          avgScore: summary.avgScore ? Number(summary.avgScore.toFixed(4)) : 0,
          avgAtpi: summary.avgAtpi ? Number(summary.avgAtpi.toFixed(2)) : 0,
          pValueHistogram,
        },
      },
      error: null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single anomaly record details by ID.
 */
const getAnomalyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid anomaly record ID',
        data: null,
        error: 'INVALID_ID',
      });
    }

    const anomaly = await AnomalyRecord.findById(id)
      .populate('dataset', 'name category dataType originalFileName dataHash')
      .populate('notes.user', 'name email role')
      .lean();

    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly record not found',
        data: null,
        error: 'NOT_FOUND',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Anomaly record retrieved',
      data: anomaly,
      error: null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an anomaly's investigation/review status and add review notes.
 */
const updateAnomalyStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reviewStatus, note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid anomaly record ID',
        data: null,
        error: 'INVALID_ID',
      });
    }

    const anomaly = await AnomalyRecord.findById(id);
    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly record not found',
        data: null,
        error: 'NOT_FOUND',
      });
    }

    if (status) anomaly.status = status;
    if (reviewStatus) anomaly.reviewStatus = reviewStatus;
    if (note && note.trim()) {
      anomaly.notes.push({
        user: req.user._id,
        text: note.trim(),
        createdAt: new Date(),
      });
    }

    await anomaly.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'UPDATE_ANOMALY_STATUS',
      entity: 'AnomalyRecord',
      entityId: anomaly._id,
      metadata: { status, reviewStatus },
      ip: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Anomaly record updated successfully',
      data: anomaly,
      error: null,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  detectAnomalies,
  getAnomalies,
  getAnomalyById,
  updateAnomalyStatus,
};
