const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Explanation = require('../models/Explanation');
const ExplanationMetric = require('../models/ExplanationMetric');
const AnomalyRecord = require('../models/AnomalyRecord');
const Dataset = require('../models/Dataset');
const PeerGroup = require('../models/PeerGroup');
const AuditLog = require('../models/AuditLog');
const mlService = require('../services/ml.service');

/**
 * Normalizes ML explanation output from Python snake_case to Mongoose camelCase.
 */
function normalizeExplanation(mlResult) {
  const topFeatures = (mlResult.top_features || mlResult.topFeatures || []).map((f) => ({
    feature: f.feature,
    actualValue: f.actualValue !== undefined ? f.actualValue : (f.actual_value !== undefined ? f.actual_value : 0),
    expectedValue: f.expectedValue !== undefined ? f.expectedValue : (f.expected_value !== undefined ? f.expected_value : 0),
    direction: f.direction || 'ANOMALOUS_ELEVATION',
    shapValue: f.shapValue !== undefined ? f.shapValue : (f.shap_value || 0),
    diffiScore: f.diffiScore !== undefined ? f.diffiScore : (f.diffi_score || 0),
    perturbationScore: f.perturbationScore !== undefined ? f.perturbationScore : (f.perturbation_score || 0),
    contributionPct: f.contributionPct !== undefined ? f.contributionPct : (f.contribution_pct || 0),
  }));

  const counterfactuals = (mlResult.counterfactuals || []).map((c) => ({
    feature: c.feature,
    originalValue: c.originalValue !== undefined ? c.originalValue : (c.original_value !== undefined ? c.original_value : 0),
    counterfactualValue: c.counterfactualValue !== undefined ? c.counterfactualValue : (c.counterfactual_value !== undefined ? c.counterfactual_value : 0),
    delta: c.delta !== undefined ? c.delta : 0,
    peerMedian: c.peerMedian !== undefined ? c.peerMedian : (c.peer_median !== undefined ? c.peer_median : 0),
    peerIqr: c.peerIqr || c.peer_iqr || [0, 0],
    direction: c.direction || 'MAINTAIN',
    plausibility: c.plausibility !== undefined ? c.plausibility : true,
  }));

  const faith = mlResult.faithfulness || {};
  const faithfulness = {
    deletionAuc: faith.deletionAuc !== undefined ? faith.deletionAuc : (faith.deletion_auc || 0),
    insertionAuc: faith.insertionAuc !== undefined ? faith.insertionAuc : (faith.insertion_auc || 0),
    comprehensiveness: faith.comprehensiveness !== undefined ? faith.comprehensiveness : 0,
    sufficiency: faith.sufficiency !== undefined ? faith.sufficiency : 0,
    deletionCurve: faith.deletionCurve || faith.deletion_curve || [],
    insertionCurve: faith.insertionCurve || faith.insertion_curve || [],
  };

  const stab = mlResult.stability || {};
  const stability = {
    jaccardStability: stab.jaccardStability !== undefined ? stab.jaccardStability : (stab.jaccard_stability || 0),
    kendallTau: stab.kendallTau !== undefined ? stab.kendallTau : (stab.kendall_tau || 0),
    topKFeatures: stab.topKFeatures || stab.top_k_features || [],
    explanationCoverage: stab.explanationCoverage !== undefined ? stab.explanationCoverage : (stab.explanation_coverage || 1.0),
  };

  return {
    topFeatures,
    shapValues: mlResult.shap_values || mlResult.shapValues || {},
    diffiScores: mlResult.diffi_scores || mlResult.diffiScores || {},
    perturbationScores: mlResult.perturbation_scores || mlResult.perturbationScores || {},
    plainLanguageSummary: mlResult.plain_language_summary || mlResult.plainLanguageSummary || '',
    counterfactuals,
    faithfulness,
    stability,
    stabilityScore: mlResult.stability_score !== undefined ? mlResult.stability_score : (mlResult.stabilityScore !== undefined ? mlResult.stabilityScore : 0.5),
  };
}

/**
 * Retrieves or lazily computes explainability for a specific anomaly.
 */
const getExplanationByAnomalyId = async (req, res, next) => {
  try {
    const { anomalyId } = req.params;

    if (!anomalyId || !mongoose.Types.ObjectId.isValid(anomalyId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid anomalyId is required',
        data: null,
        error: 'INVALID_ID',
      });
    }

    // 1. Check if explanation is already cached in MongoDB
    const existing = await Explanation.findOne({ anomalyRecord: anomalyId }).lean();
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Cached explanation retrieved successfully',
        data: { explanation: existing },
        error: null,
      });
    }

    // 2. Not cached: Retrieve AnomalyRecord and Dataset for lazy generation
    const record = await AnomalyRecord.findById(anomalyId).populate('dataset');
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly record not found',
        data: null,
        error: 'ANOMALY_NOT_FOUND',
      });
    }

    const dataset = record.dataset;
    if (!dataset || !dataset.filePath || !fs.existsSync(path.resolve(dataset.filePath))) {
      return res.status(404).json({
        success: false,
        message: 'Dataset source file not accessible on disk',
        data: null,
        error: 'FILE_NOT_FOUND',
      });
    }

    // Identify feature columns from record_data (support Mongoose Map and POJO)
    const rawRecordData = record.recordData;
    const recordData =
      rawRecordData instanceof Map
        ? Object.fromEntries(rawRecordData)
        : rawRecordData || {};

    const featureCols = Object.keys(recordData).filter((k) => {
      const v = recordData[k];
      return typeof v === 'number' || (!isNaN(Number(v)) && v !== null && v !== '');
    });

    if (featureCols.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No numeric features available in record to explain',
        data: null,
        error: 'NO_NUMERIC_FEATURES',
      });
    }

    // Fetch peer baselines if available
    let peerBaselines = null;
    if (record.peerGroup) {
      const pg = await PeerGroup.findOne({
        dataset: dataset._id,
        groupKey: record.peerGroup,
      }).lean();
      if (pg && pg.baselines) {
        peerBaselines = pg.baselines;
      }
    }

    // 3. Call ML service for lazy SHAP, DIFFI, and Counterfactuals
    const mlResult = await mlService.explainAnomaly({
      filePath: path.resolve(dataset.filePath),
      recordIndex: record.recordIndex,
      recordData,
      featureCols,
      peerBaselines,
      dataHash: dataset.dataHash || 'default_data',
      configHash: record.configHash || 'default_config',
      topK: 4,
    });

    // 4. Save Explanation in MongoDB
    const normalized = normalizeExplanation(mlResult);
    const explanation = await Explanation.create({
      anomalyRecord: record._id,
      dataset: dataset._id,
      recordIndex: record.recordIndex,
      topFeatures: normalized.topFeatures,
      shapValues: normalized.shapValues,
      diffiScores: normalized.diffiScores,
      perturbationScores: normalized.perturbationScores,
      plainLanguageSummary: normalized.plainLanguageSummary,
      counterfactuals: normalized.counterfactuals,
      faithfulness: normalized.faithfulness,
      stability: normalized.stability,
      stabilityScore: normalized.stabilityScore,
      dataHash: dataset.dataHash,
      configHash: record.configHash,
    });

    // 5. Refine ATPI score in AnomalyRecord with actual stability score
    if (normalized.stabilityScore !== undefined) {
      if (record.atpiBreakdown instanceof Map) {
        record.atpiBreakdown.set('explanationStability', normalized.stabilityScore);
      } else {
        record.atpiBreakdown = record.atpiBreakdown || {};
        record.atpiBreakdown.explanationStability = normalized.stabilityScore;
      }
      record.markModified('atpiBreakdown');

      // Formula refinement: ATPI incorporates 5% weight on stability
      const refinedAtpi = Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (0.95 * record.atpi + 0.05 * (normalized.stabilityScore * 100)) * 10
          ) / 10
        )
      );
      record.atpi = refinedAtpi;
      await record.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Explanation generated and cached successfully',
      data: { explanation },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves aggregate faithfulness and stability metrics for a dataset.
 */
const getDatasetExplanationMetrics = async (req, res, next) => {
  try {
    const { datasetId } = req.params;

    if (!datasetId || !mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid datasetId is required',
        data: null,
        error: 'INVALID_ID',
      });
    }

    const latestMetric = await ExplanationMetric.findOne({ dataset: datasetId })
      .sort({ createdAt: -1 })
      .lean();

    if (latestMetric) {
      return res.status(200).json({
        success: true,
        message: 'Explanation metrics retrieved successfully',
        data: { metrics: latestMetric },
        error: null,
      });
    }

    // Compute dynamically from stored explanations if run metric not yet saved
    const explanations = await Explanation.find({ dataset: datasetId }).lean();
    if (explanations.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No explanations generated yet for this dataset',
        data: {
          metrics: {
            meanDeletionAuc: 0,
            meanInsertionAuc: 0,
            meanJaccardStability: 0,
            meanKendallTau: 0,
            totalExplained: 0,
            explanationCoverage: 0,
          },
        },
        error: null,
      });
    }

    const delAucs = explanations.map((e) => e.faithfulness?.deletionAuc || 0);
    const insAucs = explanations.map((e) => e.faithfulness?.insertionAuc || 0);
    const jaccards = explanations.map((e) => e.stability?.jaccardStability || 0);
    const taus = explanations.map((e) => e.stability?.kendallTau || 0);

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const dynamicMetric = {
      meanDeletionAuc: Math.round(avg(delAucs) * 1000) / 1000,
      meanInsertionAuc: Math.round(avg(insAucs) * 1000) / 1000,
      meanJaccardStability: Math.round(avg(jaccards) * 1000) / 1000,
      meanKendallTau: Math.round(avg(taus) * 1000) / 1000,
      totalExplained: explanations.length,
      explanationCoverage: 1.0,
    };

    return res.status(200).json({
      success: true,
      message: 'Explanation metrics computed from cached records',
      data: { metrics: dynamicMetric },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Triggers batch explanation generation for top-ranked anomalies of a dataset.
 */
const generateBatchExplanations = async (req, res, next) => {
  try {
    const { datasetId, topK = 10 } = req.body;

    if (!datasetId || !mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid datasetId is required',
        data: null,
        error: 'INVALID_ID',
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
        message: 'Dataset file not found on disk',
        data: null,
        error: 'FILE_NOT_FOUND',
      });
    }

    // Retrieve top-ranked anomalies
    const anomalies = await AnomalyRecord.find({ dataset: datasetId })
      .sort({ atpi: -1 })
      .limit(Number(topK))
      .lean();

    if (anomalies.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No anomaly records found for this dataset',
        data: null,
        error: 'NO_ANOMALIES_FOUND',
      });
    }

    // Extract numeric feature columns
    const sampleRecordRaw = anomalies[0].recordData;
    const sampleRecord =
      sampleRecordRaw instanceof Map
        ? Object.fromEntries(sampleRecordRaw)
        : sampleRecordRaw || {};

    const featureCols = Object.keys(sampleRecord).filter((k) => {
      const v = sampleRecord[k];
      return typeof v === 'number' || (!isNaN(Number(v)) && v !== null && v !== '');
    });

    const mlBatch = await mlService.explainBatchAnomalies({
      filePath,
      anomalies: anomalies.map((a) => {
        const raw = a.recordData;
        const dataObj = raw instanceof Map ? Object.fromEntries(raw) : raw || {};
        return {
          record_index: a.recordIndex,
          record_data: dataObj,
        };
      }),
      featureCols,
      dataHash: dataset.dataHash,
      configHash: 'batch_explain_v1',
      topK: 4,
    });

    const savedExplanations = [];
    for (const exp of mlBatch.explanations || []) {
      const matchingAnomaly = anomalies.find((a) => a.recordIndex === exp.record_index);
      if (!matchingAnomaly) continue;

      const normExp = normalizeExplanation(exp);
      const saved = await Explanation.findOneAndUpdate(
        { anomalyRecord: matchingAnomaly._id },
        {
          anomalyRecord: matchingAnomaly._id,
          dataset: dataset._id,
          recordIndex: exp.record_index,
          topFeatures: normExp.topFeatures,
          shapValues: normExp.shapValues,
          diffiScores: normExp.diffiScores,
          perturbationScores: normExp.perturbationScores,
          plainLanguageSummary: normExp.plainLanguageSummary,
          counterfactuals: normExp.counterfactuals,
          faithfulness: normExp.faithfulness,
          stability: normExp.stability,
          stabilityScore: normExp.stabilityScore,
          dataHash: dataset.dataHash,
          configHash: 'batch_explain_v1',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      savedExplanations.push(saved);
    }

    // Save batch metric run
    const metricDoc = await ExplanationMetric.create({
      dataset: dataset._id,
      meanDeletionAuc: mlBatch.metrics?.mean_deletion_auc || 0,
      meanInsertionAuc: mlBatch.metrics?.mean_insertion_auc || 0,
      meanJaccardStability: mlBatch.metrics?.mean_jaccard_stability || 0,
      meanKendallTau: mlBatch.metrics?.mean_kendall_tau || 0,
      totalExplained: mlBatch.metrics?.total_explained || savedExplanations.length,
      explanationCoverage: mlBatch.metrics?.explanation_coverage || 1.0,
      dataHash: dataset.dataHash,
      configHash: 'batch_explain_v1',
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'GENERATE_EXPLANATIONS',
      entity: 'Explanation',
      entityId: dataset._id,
      metadata: {
        totalExplained: savedExplanations.length,
        meanDeletionAuc: metricDoc.meanDeletionAuc,
        meanStability: metricDoc.meanJaccardStability,
      },
      ip: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `Generated and cached explanations for ${savedExplanations.length} anomalies.`,
      data: {
        explanations: savedExplanations,
        metrics: metricDoc,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getExplanationByAnomalyId,
  getDatasetExplanationMetrics,
  generateBatchExplanations,
};
