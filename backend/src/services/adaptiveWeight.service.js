const DetectorWeightConfig = require('../models/DetectorWeightConfig');
const AnomalyRecord = require('../models/AnomalyRecord');
const AuditLog = require('../models/AuditLog');
const mlService = require('./ml.service');

const toPlainObject = (data) => {
  if (!data) return {};
  if (data instanceof Map) return Object.fromEntries(data);
  if (typeof data.toObject === 'function') return data.toObject();
  return data;
};

const DEFAULT_WEIGHTS = {
  robust_z: 0.40,
  isolation_forest: 0.35,
  z_score: 0.15,
  temporal: 0.10,
};

class AdaptiveWeightService {
  /**
   * Retrieves or initializes the active DetectorWeightConfig for a dataset
   */
  async getActiveConfig(datasetId = null) {
    let config = null;

    if (datasetId) {
      config = await DetectorWeightConfig.findOne({ dataset: datasetId, isActive: true });
    }

    if (!config) {
      config = await DetectorWeightConfig.findOne({ dataset: null, isActive: true });
    }

    if (!config) {
      config = await DetectorWeightConfig.create({
        dataset: datasetId || null,
        weights: DEFAULT_WEIGHTS,
        learningRate: 0.10,
        smoothingFactor: 0.05,
        totalFeedbackCount: 0,
        version: 1,
        isActive: true,
        history: [
          {
            iteration: 0,
            weights: DEFAULT_WEIGHTS,
            lossByDetector: {},
            precisionByDetector: {},
            weightDriftL1: 0.0,
            feedbackCount: 0,
            reason: 'INITIAL_BASELINE',
            timestamp: new Date(),
          },
        ],
      });
    }

    return config;
  }

  /**
   * Triggers online adaptive weight update when human reviewer submits feedback (Contribution C6)
   */
  async processFeedbackUpdate(anomaly, humanVerdict, user = null) {
    if (!anomaly || !['VALIDATED', 'FALSE_POSITIVE'].includes(humanVerdict)) {
      return null;
    }

    try {
      const datasetId = anomaly.dataset?._id || anomaly.dataset;
      const config = await this.getActiveConfig(datasetId);

      const currentWeights = toPlainObject(config.weights);
      const scores = toPlainObject(anomaly.detectorScores);
      const flags = toPlainObject(anomaly.detectorFlags);

      const feedbackItem = {
        record_index: anomaly.recordIndex,
        human_verdict: humanVerdict,
        detector_scores: scores,
        detector_flags: flags,
      };

      // Call ML engine for Exponentiated Gradient update
      const updateResult = await mlService.updateDetectorWeights({
        current_weights: currentWeights,
        feedback_items: [feedbackItem],
        learning_rate: config.learningRate,
        smoothing_factor: config.smoothingFactor,
      });

      if (!updateResult || !updateResult.updated_weights) {
        return config;
      }

      // Update config document
      const newWeights = updateResult.updated_weights;
      const newIteration = (config.history.length || 0) + 1;

      config.weights = newWeights;
      config.totalFeedbackCount += 1;
      config.version += 1;

      // Update detector cumulative stats
      const stats = config.detectorStats || {};
      for (const [d, loss] of Object.entries(updateResult.loss_by_detector || {})) {
        if (!stats[d]) {
          stats[d] = { truePositives: 0, falsePositives: 0, totalEvaluated: 0, precision: 1.0 };
        }
        stats[d].totalEvaluated = (stats[d].totalEvaluated || 0) + 1;
        const fl = flags[d] || (scores[d] >= 0.5);

        if (humanVerdict === 'VALIDATED' && fl) {
          stats[d].truePositives = (stats[d].truePositives || 0) + 1;
        } else if (humanVerdict === 'FALSE_POSITIVE' && fl) {
          stats[d].falsePositives = (stats[d].falsePositives || 0) + 1;
        }

        const tot = (stats[d].truePositives || 0) + (stats[d].falsePositives || 0);
        stats[d].precision = tot > 0 ? Number(((stats[d].truePositives || 0) / tot).toFixed(3)) : 1.0;
      }
      config.detectorStats = stats;
      config.markModified('detectorStats');

      // Append to history
      config.history.push({
        iteration: newIteration,
        weights: newWeights,
        lossByDetector: updateResult.loss_by_detector || {},
        precisionByDetector: updateResult.precision_by_detector || {},
        weightDriftL1: updateResult.weight_drift_l1 || 0.0,
        feedbackCount: 1,
        updatedBy: user?._id || null,
        reason: 'HUMAN_FEEDBACK_UPDATE',
        timestamp: new Date(),
      });

      await config.save();

      // Log in audit trail
      if (user) {
        await AuditLog.create({
          user: user._id,
          action: 'ADAPTIVE_DETECTOR_WEIGHTS_UPDATED',
          entity: 'DetectorWeightConfig',
          entityId: config._id.toString(),
          metadata: {
            iteration: newIteration,
            weightDriftL1: updateResult.weight_drift_l1,
            newWeights,
            triggerAnomalyId: anomaly._id.toString(),
            verdict: humanVerdict,
          },
        });
      }

      return config;
    } catch (err) {
      console.error('Error processing adaptive weight feedback update:', err);
      return null;
    }
  }

  /**
   * Manual tuning of detector weights and hyper-parameters
   */
  async tuneWeightsManually(datasetId, newWeights, { learningRate, smoothingFactor } = {}, user = null) {
    const config = await this.getActiveConfig(datasetId);

    // Validate weights sum to ~1.0
    const values = Object.values(newWeights).map(Number);
    const sum = values.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.05) {
      throw new Error(`Detector weights must sum to 1.0 (received sum: ${sum.toFixed(3)})`);
    }

    // Minimum floor check
    for (const [d, w] of Object.entries(newWeights)) {
      if (w < 0.01) {
        throw new Error(`Detector '${d}' weight cannot be below the 0.01 floor`);
      }
    }

    const prevWeights = toPlainObject(config.weights);
    config.weights = newWeights;
    if (learningRate !== undefined) config.learningRate = Number(learningRate);
    if (smoothingFactor !== undefined) config.smoothingFactor = Number(smoothingFactor);
    config.version += 1;

    // L1 drift
    const drift = Object.keys(newWeights).reduce(
      (acc, k) => acc + Math.abs((newWeights[k] || 0) - (prevWeights[k] || 0)),
      0
    );

    config.history.push({
      iteration: (config.history.length || 0) + 1,
      weights: newWeights,
      lossByDetector: {},
      precisionByDetector: {},
      weightDriftL1: Number(drift.toFixed(4)),
      feedbackCount: 0,
      updatedBy: user?._id || null,
      reason: 'MANUAL_TUNING',
      timestamp: new Date(),
    });

    await config.save();

    if (user) {
      await AuditLog.create({
        user: user._id,
        action: 'DETECTOR_WEIGHTS_MANUALLY_TUNED',
        entity: 'DetectorWeightConfig',
        entityId: config._id.toString(),
        metadata: {
          previousWeights: prevWeights,
          newWeights,
          drift,
        },
      });
    }

    return config;
  }

  /**
   * Recalculates ensemble scores and ATPI for anomalies using the active weights
   */
  async recalculateDatasetScores(datasetId, user = null) {
    const config = await this.getActiveConfig(datasetId);
    const weights = toPlainObject(config.weights);

    const anomalies = await AnomalyRecord.find({ dataset: datasetId, isAnomaly: true });
    let updatedCount = 0;

    for (const anom of anomalies) {
      const scores = toPlainObject(anom.detectorScores);
      if (Object.keys(scores).length === 0) continue;

      let newEnsembleScore = 0.0;
      let activeWeightSum = 0.0;

      for (const [d, w] of Object.entries(weights)) {
        if (scores[d] !== undefined) {
          newEnsembleScore += w * Math.min(1.0, Math.max(0.0, scores[d]));
          activeWeightSum += w;
        }
      }

      if (activeWeightSum > 0) {
        newEnsembleScore = Number((newEnsembleScore / activeWeightSum).toFixed(4));
        anom.ensembleScore = newEnsembleScore;

        // Update ATPI effect size component if present
        if (anom.atpiBreakdown) {
          const breakdown = toPlainObject(anom.atpiBreakdown);
          breakdown.effect_size_score = newEnsembleScore;

          const wConf = 0.35;
          const wEff = 0.30;
          const wPeer = 0.15;
          const wPop = 0.15;
          const wStab = 0.05;

          const conf = breakdown.statistical_confidence || 0.5;
          const peer = anom.peerContextFlag ? 1.0 : 0.0;
          const pop = breakdown.population_impact_score || 0.5;
          const stab = breakdown.explanation_stability || 0.5;

          const newAtpi = (conf * wConf + newEnsembleScore * wEff + peer * wPeer + pop * wPop + stab * wStab) * 100.0;
          anom.atpi = Number(newAtpi.toFixed(2));
          anom.atpiBreakdown = breakdown;
          anom.markModified('atpiBreakdown');
        }

        await anom.save();
        updatedCount++;
      }
    }

    if (user) {
      await AuditLog.create({
        user: user._id,
        action: 'DATASET_SCORES_RECALCULATED_WITH_WEIGHTS',
        entity: 'Dataset',
        entityId: datasetId.toString(),
        metadata: {
          updatedRecordsCount: updatedCount,
          appliedWeights: weights,
        },
      });
    }

    return { updatedCount, appliedWeights: weights };
  }

  /**
   * Resets detector weights to baseline defaults
   */
  async resetToDefaults(datasetId, user = null) {
    const config = await this.getActiveConfig(datasetId);
    config.weights = DEFAULT_WEIGHTS;
    config.version += 1;

    config.history.push({
      iteration: (config.history.length || 0) + 1,
      weights: DEFAULT_WEIGHTS,
      lossByDetector: {},
      precisionByDetector: {},
      weightDriftL1: 0.0,
      feedbackCount: 0,
      updatedBy: user?._id || null,
      reason: 'RESET_TO_DEFAULTS',
      timestamp: new Date(),
    });

    await config.save();

    if (user) {
      await AuditLog.create({
        user: user._id,
        action: 'DETECTOR_WEIGHTS_RESET_TO_DEFAULTS',
        entity: 'DetectorWeightConfig',
        entityId: config._id.toString(),
      });
    }

    return config;
  }
}

module.exports = new AdaptiveWeightService();
