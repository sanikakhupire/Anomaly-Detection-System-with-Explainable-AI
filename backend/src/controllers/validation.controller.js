const AnomalyRecord = require('../models/AnomalyRecord');
const Dataset = require('../models/Dataset');
const ValidationReport = require('../models/ValidationReport');
const PeerGroup = require('../models/PeerGroup');
const ForensicReport = require('../models/ForensicReport');
const Explanation = require('../models/Explanation');
const AuditLog = require('../models/AuditLog');
const mlService = require('../services/ml.service');

/**
 * Helper: Converts Mongoose Maps to plain Objects
 */
const toPlainObject = (data) => {
  if (!data) return {};
  if (data instanceof Map) return Object.fromEntries(data);
  if (typeof data.toObject === 'function') return data.toObject();
  return data;
};

/**
 * Normalizes ML service response (snake_case -> camelCase) for Mongoose
 */
const normalizeReport = (mlReport, anomalyId, datasetId, recordIndex) => {
  const agentAssessments = (mlReport.agent_assessments || []).map((a) => ({
    agentName: a.agent_name,
    perspective: a.perspective,
    supportsAnomaly: Boolean(a.supports_anomaly),
    confidence: Number(a.confidence ?? 0.5),
    findings: a.findings || [],
    flags: a.flags || [],
    recommendedVerdict: a.recommended_verdict || 'INSUFFICIENT_EVIDENCE',
  }));

  const claims = (mlReport.claims || []).map((c) => ({
    claimId: c.claim_id,
    claimText: c.claim_text,
    feature: c.feature,
    status: c.status || 'VERIFIED',
    groundFact: c.ground_fact || '',
    citationSource: c.citation_source || '',
    numericalDeviation: c.numerical_deviation !== undefined ? Number(c.numerical_deviation) : null,
  }));

  return {
    anomaly: anomalyId,
    dataset: datasetId,
    recordIndex: recordIndex,
    domainType: mlReport.domain_type || 'GENERIC',
    evidenceBundle: mlReport.evidence_bundle || {},
    agentAssessments,
    claims,
    claimVerificationRatio: Number(mlReport.claim_verification_ratio ?? 0.0),
    verdict: mlReport.verdict || 'INSUFFICIENT_EVIDENCE',
    confidence: Number(mlReport.confidence ?? 0.5),
    recommendedAction: mlReport.recommended_action || 'ACCEPT_AS_STATISTICAL_OUTLIER',
    summary: mlReport.summary || '',
    ruleEngineType: mlReport.rule_engine_type || 'DETERMINISTIC_MULTI_AGENT',
    isLlmAugmented: Boolean(mlReport.is_llm_augmented),
  };
};

/**
 * Builds the evidence bundle payload from heterogeneous MongoDB collections
 */
const buildEvidenceBundlePayload = async (anomaly, dataset) => {
  const recordValues = toPlainObject(anomaly.recordData);
  const detectorScores = toPlainObject(anomaly.detectorScores);
  const detectorPValues = toPlainObject(anomaly.detectorPValues);
  const detectorFlags = toPlainObject(anomaly.detectorFlags);

  let peerGroupSize = 0;
  let peerMedians = {};
  let peerMads = {};
  let peerIqr = {};

  if (anomaly.peerGroup) {
    try {
      const peer = await PeerGroup.findOne({
        datasetId: anomaly.dataset._id || anomaly.dataset,
        groupName: anomaly.peerGroup,
      }).lean();

      if (peer) {
        peerGroupSize = peer.sampleCount || 0;
        if (peer.baselines) {
          for (const [feat, stats] of Object.entries(peer.baselines)) {
            if (stats.median !== undefined) peerMedians[feat] = Number(stats.median);
            if (stats.mad !== undefined) peerMads[feat] = Number(stats.mad);
            if (stats.q25 !== undefined && stats.q75 !== undefined) {
              peerIqr[feat] = [Number(stats.q25), Number(stats.q75)];
            }
          }
        }
      }
    } catch (err) {
      console.warn('Could not retrieve peer group for evidence bundle:', err.message);
    }
  }

  // Forensic context
  const forensicConformance = {};
  try {
    const forensic = await ForensicReport.findOne({
      dataset: anomaly.dataset._id || anomaly.dataset,
    }).lean();

    if (forensic && forensic.tests) {
      if (forensic.tests.benfordFirstDigit) {
        forensicConformance.benford_first_digit_p = forensic.tests.benfordFirstDigit.pValue;
      }
      if (forensic.tests.lastDigitUniformity) {
        forensicConformance.last_digit_uniformity_p = forensic.tests.lastDigitUniformity.pValue;
      }
      if (forensic.tests.digitHeaping) {
        forensicConformance.whipple_index = forensic.tests.digitHeaping.whippleIndex;
        forensicConformance.myers_index = forensic.tests.digitHeaping.myersIndex;
      }
    }
  } catch (err) {
    console.warn('Could not retrieve forensic context:', err.message);
  }

  // Explanation context (SHAP & Counterfactuals if available)
  let topFeatures = [];
  let counterfactualDistance = 0.0;
  let counterfactualAdjustmentsCount = 0;

  try {
    const expl = await Explanation.findOne({ anomaly: anomaly._id }).lean();
    if (expl) {
      topFeatures = expl.topFeatures || [];
      if (expl.counterfactual) {
        counterfactualDistance = expl.counterfactual.scoreReduction || 0.0;
        counterfactualAdjustmentsCount = expl.counterfactual.adjustedFeaturesCount || 0;
      }
    }
  } catch (err) {
    console.warn('Could not retrieve explanation context:', err.message);
  }

  // Fallback top features if not available from Explanation
  if (topFeatures.length === 0 && Object.keys(recordValues).length > 0) {
    topFeatures = Object.keys(recordValues)
      .slice(0, 4)
      .map((k) => ({
        feature: k,
        actual_value: recordValues[k],
        peer_median: peerMedians[k] || 0,
        contribution_pct: 25.0,
      }));
  }

  return {
    record_index: anomaly.recordIndex,
    domain_type: dataset.category || dataset.dataType || 'GENERIC',
    record_values: recordValues,
    peer_group: anomaly.peerGroup,
    peer_group_size: peerGroupSize,
    peer_medians: peerMedians,
    peer_mads: peerMads,
    peer_iqr: peerIqr,
    detector_scores: detectorScores,
    detector_p_values: detectorPValues,
    detector_flags: detectorFlags,
    combined_p_value: anomaly.combinedP ?? 1.0,
    q_value: anomaly.qValue ?? 1.0,
    ensemble_score: anomaly.ensembleScore ?? 0.0,
    atpi_score: anomaly.atpi ?? 0.0,
    top_features: topFeatures,
    counterfactual_distance: counterfactualDistance,
    counterfactual_adjustments_count: counterfactualAdjustmentsCount,
    forensic_conformance: forensicConformance,
  };
};

/**
 * Validates a single anomaly record (creates or returns existing ValidationReport)
 */
const validateAnomalyRecord = async (req, res) => {
  try {
    const { anomalyId } = req.params;
    const force = req.query.force === 'true';

    const anomaly = await AnomalyRecord.findById(anomalyId).populate('dataset');
    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly record not found',
        data: null,
      });
    }

    if (!force) {
      const existing = await ValidationReport.findOne({ anomaly: anomaly._id });
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Retrieved cached validation report',
          data: existing,
        });
      }
    }

    const payload = await buildEvidenceBundlePayload(anomaly, anomaly.dataset);
    const mlResponse = await mlService.validateAnomaly(payload);

    const reportData = normalizeReport(
      mlResponse,
      anomaly._id,
      anomaly.dataset._id,
      anomaly.recordIndex
    );

    const report = await ValidationReport.findOneAndUpdate(
      { anomaly: anomaly._id },
      { $set: reportData },
      { upsert: true, new: true }
    );

    // Update anomaly record with validation summary
    anomaly.validationVerdict = report.verdict;
    anomaly.validationConfidence = report.confidence;
    anomaly.claimVerificationRatio = report.claimVerificationRatio;
    anomaly.validationReport = report._id;
    await anomaly.save();

    // Audit log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'ANOMALY_VALIDATION_PERFORMED',
        entity: 'AnomalyRecord',
        entityId: anomaly._id.toString(),
        metadata: {
          verdict: report.verdict,
          confidence: report.confidence,
          claimVerificationRatio: report.claimVerificationRatio,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Multi-agent validation completed successfully',
      data: report,
    });
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform multi-agent validation',
      error: error.message,
    });
  }
};

/**
 * Gets the validation report for an anomaly record (lazy generation if not exists)
 */
const getValidationReport = async (req, res) => {
  try {
    const { anomalyId } = req.params;
    const existing = await ValidationReport.findOne({ anomaly: anomalyId });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Validation report retrieved',
        data: existing,
      });
    }

    // Lazy generation
    return validateAnomalyRecord(req, res);
  } catch (error) {
    console.error('Error fetching validation report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve validation report',
      error: error.message,
    });
  }
};

/**
 * Batch validates top unreviewed anomalies for a dataset
 */
const batchValidate = async (req, res) => {
  try {
    const { datasetId, topK = 10 } = req.body;
    if (!datasetId) {
      return res.status(400).json({
        success: false,
        message: 'datasetId is required',
        data: null,
      });
    }

    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found',
        data: null,
      });
    }

    // Find top K anomalies without validation reports
    const anomalies = await AnomalyRecord.find({
      dataset: datasetId,
      isAnomaly: true,
      validationVerdict: null,
    })
      .sort({ atpi: -1 })
      .limit(Number(topK));

    let successCount = 0;
    let failedCount = 0;

    for (const anom of anomalies) {
      try {
        const payload = await buildEvidenceBundlePayload(anom, dataset);
        const mlResponse = await mlService.validateAnomaly(payload);
        const reportData = normalizeReport(mlResponse, anom._id, datasetId, anom.recordIndex);

        const report = await ValidationReport.findOneAndUpdate(
          { anomaly: anom._id },
          { $set: reportData },
          { upsert: true, new: true }
        );

        anom.validationVerdict = report.verdict;
        anom.validationConfidence = report.confidence;
        anom.claimVerificationRatio = report.claimVerificationRatio;
        anom.validationReport = report._id;
        await anom.save();

        successCount++;
      } catch (err) {
        console.error(`Batch validation failed for record #${anom.recordIndex}:`, err.message);
        failedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Batch validation completed: ${successCount} validated, ${failedCount} failed`,
      data: {
        totalEvaluated: anomalies.length,
        successCount,
        failedCount,
      },
    });
  } catch (error) {
    console.error('Batch validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute batch validation',
      error: error.message,
    });
  }
};

/**
 * Submits human reviewer verdict and notes
 */
const submitHumanReview = async (req, res) => {
  try {
    const { anomalyId } = req.params;
    const { reviewStatus, status = 'RESOLVED', note } = req.body;

    if (!reviewStatus) {
      return res.status(400).json({
        success: false,
        message: 'reviewStatus is required',
        data: null,
      });
    }

    const anomaly = await AnomalyRecord.findById(anomalyId);
    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly record not found',
        data: null,
      });
    }

    anomaly.reviewStatus = reviewStatus;
    if (status) anomaly.status = status;

    if (note && note.trim()) {
      anomaly.notes.push({
        user: req.user?._id || null,
        text: note.trim(),
        createdAt: new Date(),
      });
    }

    await anomaly.save();

    // Update ValidationReport human review section if exists
    let report = await ValidationReport.findOne({ anomaly: anomaly._id });
    if (report) {
      report.humanReview = {
        reviewedBy: req.user?._id || null,
        reviewedAt: new Date(),
        humanVerdict: reviewStatus,
        notes: note || '',
      };
      await report.save();
    }

    // Audit log
    await AuditLog.create({
      user: req.user?._id || null,
      action: 'HUMAN_REVIEW_SUBMITTED',
      entity: 'AnomalyRecord',
      entityId: anomaly._id.toString(),
      metadata: {
        previousReviewStatus: anomaly.reviewStatus,
        newReviewStatus: reviewStatus,
        status: anomaly.status,
        note: note || '',
      },
    });

    // Contribution C6: Adaptively update detector weights on human feedback
    try {
      const adaptiveWeightService = require('../services/adaptiveWeight.service');
      await adaptiveWeightService.processFeedbackUpdate(anomaly, reviewStatus, req.user);
    } catch (wErr) {
      console.warn('Adaptive detector weighting update skipped:', wErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Human review verdict submitted successfully',
      data: {
        anomaly,
        validationReport: report,
      },
    });
  } catch (error) {
    console.error('Error submitting human review:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit human review',
      error: error.message,
    });
  }
};

/**
 * Gets paginated review queue ordered by ATPI with multi-factor filtering
 */
const getReviewQueue = async (req, res) => {
  try {
    const {
      datasetId,
      priority,
      status,
      reviewStatus,
      verdict,
      page = 1,
      limit = 20,
      sortBy = 'atpi',
      sortOrder = 'desc',
    } = req.query;

    const query = { isAnomaly: true };

    if (datasetId) query.dataset = datasetId;
    if (status) query.status = status;
    if (reviewStatus) query.reviewStatus = reviewStatus;
    if (verdict) query.validationVerdict = verdict;

    if (priority) {
      if (priority === 'CRITICAL') query.atpi = { $gte: 75 };
      else if (priority === 'HIGH') query.atpi = { $gte: 55, $lt: 75 };
      else if (priority === 'MEDIUM') query.atpi = { $gte: 35, $lt: 55 };
      else if (priority === 'LOW') query.atpi = { $lt: 35 };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortDir };

    const [anomalies, total] = await Promise.all([
      AnomalyRecord.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('dataset', 'name dataType')
        .populate('validationReport')
        .lean(),
      AnomalyRecord.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Review queue retrieved successfully',
      data: {
        anomalies,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching review queue:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve review queue',
      error: error.message,
    });
  }
};

module.exports = {
  validateAnomalyRecord,
  getValidationReport,
  batchValidate,
  submitHumanReview,
  getReviewQueue,
};
