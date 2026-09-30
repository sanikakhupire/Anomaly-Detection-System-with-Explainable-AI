const adaptiveWeightService = require('../services/adaptiveWeight.service');

/**
 * Controller for Model & Detector Configurations and Contribution C6 Adaptive Weighting
 */
const getWeightsConfig = async (req, res) => {
  try {
    const datasetId = req.params.datasetId || req.query.datasetId || null;
    const config = await adaptiveWeightService.getActiveConfig(datasetId);

    return res.status(200).json({
      success: true,
      message: 'Detector weight configuration retrieved',
      data: config,
    });
  } catch (error) {
    console.error('Error fetching detector weight config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve detector weight configuration',
      error: error.message,
    });
  }
};

const tuneWeights = async (req, res) => {
  try {
    const datasetId = req.params.datasetId || req.body.datasetId || null;
    const { weights, learningRate, smoothingFactor } = req.body;

    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Weights object mapping detector names to numerical values is required',
        data: null,
      });
    }

    const config = await adaptiveWeightService.tuneWeightsManually(
      datasetId,
      weights,
      { learningRate, smoothingFactor },
      req.user
    );

    return res.status(200).json({
      success: true,
      message: 'Detector weights and parameters successfully tuned',
      data: config,
    });
  } catch (error) {
    console.error('Error tuning detector weights:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to tune detector weights',
      error: error.message,
    });
  }
};

const recalculateScores = async (req, res) => {
  try {
    const datasetId = req.params.datasetId || req.body.datasetId;
    if (!datasetId) {
      return res.status(400).json({
        success: false,
        message: 'datasetId is required for recalculating anomaly scores',
        data: null,
      });
    }

    const result = await adaptiveWeightService.recalculateDatasetScores(datasetId, req.user);

    return res.status(200).json({
      success: true,
      message: `Ensemble scores recalculated for ${result.updatedCount} anomalous records using active weights`,
      data: result,
    });
  } catch (error) {
    console.error('Error recalculating scores with weights:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to recalculate scores with active weights',
      error: error.message,
    });
  }
};

const resetWeights = async (req, res) => {
  try {
    const datasetId = req.params.datasetId || req.body.datasetId || null;
    const config = await adaptiveWeightService.resetToDefaults(datasetId, req.user);

    return res.status(200).json({
      success: true,
      message: 'Detector weights reset to initial baselines',
      data: config,
    });
  } catch (error) {
    console.error('Error resetting detector weights:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset detector weights',
      error: error.message,
    });
  }
};

module.exports = {
  getWeightsConfig,
  tuneWeights,
  recalculateScores,
  resetWeights,
};
