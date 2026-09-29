const Dataset = require('../models/Dataset');
const PeerGroup = require('../models/PeerGroup');
const { sendSuccess, sendError } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { buildPeerGroups } = require('../services/ml.service');

/**
 * Build peer groups and compute robust shrunk baselines
 * POST /api/peer-groups/build
 */
const buildPeerGroupsHandler = async (req, res, next) => {
  try {
    const {
      datasetId,
      groupColumn,
      parentColumn,
      featureColumns,
      shrinkageN0 = 15,
      minGroupSize = 5,
    } = req.body;

    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      return sendError(res, 404, `Dataset not found with ID: ${datasetId}`);
    }

    const mapping = dataset.schemaMapping || {};

    // Call ML Service to form peer groups and compute shrinkage
    const result = await buildPeerGroups({
      filePath: dataset.filePath,
      mapping,
      groupColumn,
      parentColumn,
      featureColumns,
      shrinkageN0,
      minGroupSize,
    });

    const { metadata, globalBaselines, peerGroups } = result;

    // Purge old peer groups for this dataset and bulk insert fresh groups
    await PeerGroup.deleteMany({ datasetId });

    const peerGroupDocs = peerGroups.map((pg) => ({
      datasetId,
      groupColumn: metadata.groupColumn,
      parentColumn: metadata.parentColumn,
      groupName: pg.groupName,
      parentGroup: pg.parentGroup,
      sampleCount: pg.sampleCount,
      shrinkageFactor: pg.shrinkageFactor,
      isSmallGroup: pg.isSmallGroup,
      baselines: pg.baselines,
    }));

    if (peerGroupDocs.length > 0) {
      await PeerGroup.insertMany(peerGroupDocs);
    }

    await logAudit({
      user: req.user._id,
      action: 'PEER_GROUPS_BUILT',
      entity: 'PeerGroup',
      entityId: datasetId,
      metadata: {
        totalGroups: metadata.totalGroups,
        smallGroupCount: metadata.smallGroupCount,
        groupColumn: metadata.groupColumn,
      },
      req,
    });

    return sendSuccess(res, 200, 'Peer groups and shrunk baselines generated successfully', {
      metadata,
      globalBaselines,
      peerGroups,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all peer groups and baselines for a dataset
 * GET /api/peer-groups/:datasetId
 */
const getPeerGroupsByDataset = async (req, res, next) => {
  try {
    const { datasetId } = req.params;

    const peerGroups = await PeerGroup.find({ datasetId }).sort({ sampleCount: -1 }).lean();

    return sendSuccess(res, 200, 'Peer groups retrieved successfully', {
      datasetId,
      totalGroups: peerGroups.length,
      smallGroupCount: peerGroups.filter((g) => g.isSmallGroup).length,
      peerGroups,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  buildPeerGroupsHandler,
  getPeerGroupsByDataset,
};
