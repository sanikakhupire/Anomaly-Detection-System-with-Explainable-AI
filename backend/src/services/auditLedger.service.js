const AuditLog = require('../models/AuditLog');
const Dataset = require('../models/Dataset');
const AnomalyRecord = require('../models/AnomalyRecord');
const ValidationReport = require('../models/ValidationReport');
const ForensicReport = require('../models/ForensicReport');
const DetectorWeightConfig = require('../models/DetectorWeightConfig');

class AuditLedgerService {
  /**
   * Appends an action into the cryptographic hash chain
   */
  async logAction({ user, action, entity, entityId, metadata = {}, ip = null, userAgent = null }) {
    const entry = new AuditLog({
      user: user?._id || user || null,
      userRole: user?.role || 'SYSTEM',
      userEmail: user?.email || 'system@platform.local',
      action,
      entity,
      entityId: entityId ? entityId.toString() : null,
      metadata,
      ip,
      userAgent,
    });

    await entry.save();
    return entry;
  }

  /**
   * Verifies full cryptographic integrity of the hash chain (Contribution C8)
   */
  async verifyChain() {
    const blocks = await AuditLog.find().sort({ sequenceNumber: 1 }).lean();
    const verifiedAt = new Date().toISOString();

    if (blocks.length === 0) {
      return {
        isChainValid: true,
        totalBlocks: 0,
        verifiedBlocks: 0,
        tamperedBlocks: [],
        genesisHash: null,
        headHash: null,
        verifiedAt,
      };
    }

    let isChainValid = true;
    const tamperedBlocks = [];
    const genesis = blocks[0];

    // 1. Verify Genesis Block
    if (genesis.sequenceNumber !== 0) {
      isChainValid = false;
      tamperedBlocks.push({
        sequenceNumber: genesis.sequenceNumber,
        blockId: genesis._id.toString(),
        reason: 'Genesis block must have sequenceNumber = 0',
      });
    }

    if (genesis.previousHash !== AuditLog.GENESIS_PREVIOUS_HASH) {
      isChainValid = false;
      tamperedBlocks.push({
        sequenceNumber: genesis.sequenceNumber,
        blockId: genesis._id.toString(),
        reason: `Genesis block previousHash must be 64 zeros, found: ${genesis.previousHash}`,
      });
    }

    const recomputedGenesis = AuditLog.computeBlockHash({
      sequenceNumber: genesis.sequenceNumber,
      previousHash: genesis.previousHash,
      timestamp: genesis.createdAt,
      userId: genesis.user,
      action: genesis.action,
      entity: genesis.entity,
      entityId: genesis.entityId,
      metadata: genesis.metadata,
    });

    if (genesis.currentHash !== recomputedGenesis) {
      isChainValid = false;
      tamperedBlocks.push({
        sequenceNumber: genesis.sequenceNumber,
        blockId: genesis._id.toString(),
        expectedCurrentHash: recomputedGenesis,
        actualCurrentHash: genesis.currentHash,
        reason: 'Genesis currentHash does not match recomputed SHA-256 payload digest',
      });
    }

    // 2. Verify Subsequent Blocks
    for (let i = 1; i < blocks.length; i++) {
      const prevBlock = blocks[i - 1];
      const currBlock = blocks[i];

      // Sequence check
      if (currBlock.sequenceNumber !== prevBlock.sequenceNumber + 1) {
        isChainValid = false;
        tamperedBlocks.push({
          sequenceNumber: currBlock.sequenceNumber,
          blockId: currBlock._id.toString(),
          reason: `Broken sequence: expected ${prevBlock.sequenceNumber + 1}, found ${currBlock.sequenceNumber}`,
        });
      }

      // Link check: previousHash must match previous block's currentHash
      if (currBlock.previousHash !== prevBlock.currentHash) {
        isChainValid = false;
        tamperedBlocks.push({
          sequenceNumber: currBlock.sequenceNumber,
          blockId: currBlock._id.toString(),
          expectedPreviousHash: prevBlock.currentHash,
          actualPreviousHash: currBlock.previousHash,
          reason: 'Cryptographic link broken: previousHash does not match prior block currentHash',
        });
      }

      // CurrentHash integrity check: recompute from payload
      const recomputedHash = AuditLog.computeBlockHash({
        sequenceNumber: currBlock.sequenceNumber,
        previousHash: currBlock.previousHash,
        timestamp: currBlock.createdAt,
        userId: currBlock.user,
        action: currBlock.action,
        entity: currBlock.entity,
        entityId: currBlock.entityId,
        metadata: currBlock.metadata,
      });

      if (currBlock.currentHash !== recomputedHash) {
        isChainValid = false;
        tamperedBlocks.push({
          sequenceNumber: currBlock.sequenceNumber,
          blockId: currBlock._id.toString(),
          expectedCurrentHash: recomputedHash,
          actualCurrentHash: currBlock.currentHash,
          reason: 'Tampered block payload: currentHash does not match recomputed SHA-256 hash',
        });
      }
    }

    return {
      isChainValid,
      totalBlocks: blocks.length,
      verifiedBlocks: blocks.length - tamperedBlocks.length,
      tamperedBlocks,
      genesisHash: genesis.currentHash,
      headHash: blocks[blocks.length - 1].currentHash,
      verifiedAt,
    };
  }

  /**
   * Retrieves paginated audit ledger blocks
   */
  async getAuditBlocks({ page = 1, limit = 25, action, entity, userId }) {
    const query = {};
    if (action) query.action = action;
    if (entity) query.entity = entity;
    if (userId) query.user = userId;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [blocks, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ sequenceNumber: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('user', 'name email role')
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return {
      blocks,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Generates a comprehensive Decision-Support Audit Certificate for a dataset
   */
  async generateDatasetAuditCertificate(datasetId) {
    const dataset = await Dataset.findById(datasetId).populate('uploadedBy', 'name email role').lean();
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // 1. Anomalies summary
    const anomalies = await AnomalyRecord.find({ dataset: datasetId }).lean();
    const totalAnomalies = anomalies.filter((a) => a.isAnomaly).length;
    const validatedCount = anomalies.filter((a) => a.reviewStatus === 'VALIDATED').length;
    const falsePositiveCount = anomalies.filter((a) => a.reviewStatus === 'FALSE_POSITIVE').length;
    const pendingCount = anomalies.filter((a) => a.reviewStatus === 'PENDING').length;

    const criticalCount = anomalies.filter((a) => (a.atpi || 0) >= 75).length;
    const highCount = anomalies.filter((a) => (a.atpi || 0) >= 55 && (a.atpi || 0) < 75).length;
    const mediumCount = anomalies.filter((a) => (a.atpi || 0) >= 35 && (a.atpi || 0) < 55).length;
    const lowCount = anomalies.filter((a) => (a.atpi || 0) < 35).length;

    // 2. Multi-Agent Validation findings
    const validationReports = await ValidationReport.find({ dataset: datasetId }).lean();
    const confirmedAnomalies = validationReports.filter((r) => r.verdict === 'CONFIRMED_ANOMALY').length;
    const dataArtifacts = validationReports.filter((r) => r.verdict === 'DATA_QUALITY_ARTIFACT').length;
    const benignVariations = validationReports.filter((r) => r.verdict === 'BENIGN_EXTREME_VARIATION').length;

    const cvrSum = validationReports.reduce((acc, r) => acc + (r.claimVerificationRatio || 0), 0);
    const avgCvr = validationReports.length > 0 ? Number((cvrSum / validationReports.length).toFixed(3)) : 1.0;

    // 3. Forensics summary
    const forensicReport = await ForensicReport.findOne({ dataset: datasetId }).lean();
    const forensicTests = forensicReport ? forensicReport.tests || {} : {};

    // 4. Adaptive detector weights
    const weightConfig = await DetectorWeightConfig.findOne({ dataset: datasetId, isActive: true }).lean();
    const appliedWeights = weightConfig ? weightConfig.weights : { robust_z: 0.40, isolation_forest: 0.35, z_score: 0.15, temporal: 0.10 };

    // 5. Related audit trail entries
    const relatedLogs = await AuditLog.find({
      $or: [
        { entityId: datasetId.toString() },
        { 'metadata.datasetId': datasetId.toString() },
      ],
    })
      .sort({ sequenceNumber: 1 })
      .lean();

    // 6. Cryptographic Chain verification status
    const chainVerification = await this.verifyChain();

    return {
      certificateId: `CERT-${datasetId.toString().slice(-8).toUpperCase()}-${Date.now().toString().slice(-6)}`,
      generatedAt: new Date().toISOString(),
      dataset: {
        id: dataset._id,
        name: dataset.name,
        category: dataset.category || 'GENERIC',
        dataType: dataset.dataType || 'REAL',
        dataHash: dataset.dataHash,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        uploadedBy: dataset.uploadedBy ? dataset.uploadedBy.name : 'System',
        uploadedAt: dataset.createdAt,
      },
      calibrationAndTriage: {
        totalRecords: dataset.rowCount,
        totalAnomaliesDetected: totalAnomalies,
        atpiDistribution: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        },
      },
      multiAgentValidation: {
        totalEvaluated: validationReports.length,
        confirmedAnomalies,
        dataQualityArtifacts: dataArtifacts,
        benignExtremeVariations: benignVariations,
        averageClaimVerificationRatio: avgCvr,
      },
      humanReviewStatus: {
        validated: validatedCount,
        falsePositive: falsePositiveCount,
        pendingReview: pendingCount,
      },
      forensicConformance: {
        hasForensicReport: Boolean(forensicReport),
        overallConformity: forensicReport?.overallConformity || 'NOT_EVALUATED',
        tests: forensicTests,
      },
      adaptiveWeightsApplied: appliedWeights,
      cryptographicAuditChain: {
        isChainValid: chainVerification.isChainValid,
        totalBlocksInLedger: chainVerification.totalBlocks,
        datasetEventBlocksCount: relatedLogs.length,
        ledgerHeadHash: chainVerification.headHash,
        verifiedAt: chainVerification.verifiedAt,
      },
      complianceStatement:
        'This decision-support certificate is generated by the Intelligent Statistical Anomaly Detection Platform. Statistical departures denote mathematical pattern divergence against empirical peer baselines and do not constitute legal accusations of culpability or fraud.',
    };
  }
}

module.exports = new AuditLedgerService();
