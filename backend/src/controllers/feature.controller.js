const Dataset = require('../models/Dataset');
const FeatureSet = require('../models/FeatureSet');
const { sendSuccess, sendError } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { inferSchemaMapping, runFeatureEngineering } = require('../services/ml.service');

/**
 * Get confirmed or suggested semantic schema mapping for a dataset
 * GET /api/datasets/:id/schema-mapping
 */
const getSchemaMapping = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dataset = await Dataset.findById(id);

    if (!dataset) {
      return sendError(res, 404, `Dataset not found with ID: ${id}`);
    }

    // If mapping was already confirmed by user, return it directly
    if (dataset.isSchemaConfirmed && dataset.schemaMapping) {
      return sendSuccess(res, 200, 'Confirmed schema mapping retrieved', {
        mapping: dataset.schemaMapping,
        isConfirmed: true,
      });
    }

    // Otherwise infer mapping from ML service
    const suggestedMapping = await inferSchemaMapping(dataset.filePath);

    return sendSuccess(res, 200, 'Inferred schema mapping suggestions generated', {
      mapping: dataset.schemaMapping || suggestedMapping,
      suggestedMapping,
      isConfirmed: Boolean(dataset.isSchemaConfirmed),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm or update semantic schema mapping
 * PUT /api/datasets/:id/schema-mapping
 */
const updateSchemaMapping = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mapping } = req.body;

    if (!mapping || typeof mapping !== 'object') {
      return sendError(res, 400, 'Valid schema mapping dictionary is required');
    }

    const dataset = await Dataset.findByIdAndUpdate(
      id,
      {
        schemaMapping: mapping,
        isSchemaConfirmed: true,
      },
      { new: true }
    );

    if (!dataset) {
      return sendError(res, 404, `Dataset not found with ID: ${id}`);
    }

    await logAudit({
      user: req.user._id,
      action: 'SCHEMA_MAPPING_CONFIRMED',
      entity: 'Dataset',
      entityId: id,
      metadata: { mappingKeys: Object.keys(mapping) },
      req,
    });

    return sendSuccess(res, 200, 'Schema mapping confirmed successfully', {
      mapping: dataset.schemaMapping,
      isConfirmed: dataset.isSchemaConfirmed,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Run feature template extraction plugins
 * POST /api/features/run
 */
const runFeatures = async (req, res, next) => {
  try {
    const { datasetId } = req.body;

    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      return sendError(res, 404, `Dataset not found with ID: ${datasetId}`);
    }

    const mapping = dataset.schemaMapping;
    if (!mapping) {
      return sendError(res, 400, 'Dataset requires confirmed schema mapping before generating features.');
    }

    // Call ML service to execute registered feature templates
    const result = await runFeatureEngineering(dataset.filePath, mapping);

    // Save FeatureSet in database
    const featureSet = await FeatureSet.findOneAndUpdate(
      { datasetId },
      {
        datasetId,
        features: result.features,
        featureCount: result.generatedCount,
        generatedBy: req.user._id,
      },
      { upsert: true, new: true }
    );

    await logAudit({
      user: req.user._id,
      action: 'FEATURES_GENERATED',
      entity: 'FeatureSet',
      entityId: featureSet._id,
      metadata: {
        datasetId,
        featureCount: result.generatedCount,
        featureNames: result.features.map((f) => f.name),
      },
      req,
    });

    return sendSuccess(res, 200, 'Feature engineering templates executed successfully', {
      featureSet,
      features: result.features,
      generatedCount: result.generatedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get generated features for a dataset
 * GET /api/features/:datasetId
 */
const getFeaturesByDataset = async (req, res, next) => {
  try {
    const { datasetId } = req.params;
    const featureSet = await FeatureSet.findOne({ datasetId }).lean();

    return sendSuccess(res, 200, 'Feature set retrieved', {
      featureSet: featureSet || null,
      features: featureSet?.features || [],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSchemaMapping,
  updateSchemaMapping,
  runFeatures,
  getFeaturesByDataset,
};
