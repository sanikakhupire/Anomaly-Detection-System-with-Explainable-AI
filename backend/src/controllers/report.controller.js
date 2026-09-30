const auditLedgerService = require('../services/auditLedger.service');
const AnomalyRecord = require('../models/AnomalyRecord');
const Dataset = require('../models/Dataset');

/**
 * Controller for Tamper-Evident Audit Ledger and Compliance Certificates (Contribution C8)
 */
const getAuditChainBlocks = async (req, res) => {
  try {
    const { page = 1, limit = 25, action, entity, user } = req.query;
    const data = await auditLedgerService.getAuditBlocks({
      page,
      limit,
      action,
      entity,
      userId: user,
    });

    return res.status(200).json({
      success: true,
      message: 'Audit ledger blocks retrieved',
      data,
    });
  } catch (error) {
    console.error('Error fetching audit blocks:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit blocks',
      error: error.message,
    });
  }
};

const verifyAuditChain = async (req, res) => {
  try {
    const verification = await auditLedgerService.verifyChain();

    return res.status(200).json({
      success: true,
      message: verification.isChainValid
        ? 'Cryptographic hash-chain verified: 100% integrity intact'
        : 'Tampering detected in cryptographic audit chain',
      data: verification,
    });
  } catch (error) {
    console.error('Error verifying audit chain:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify audit chain integrity',
      error: error.message,
    });
  }
};

const getDatasetCertificate = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const certificate = await auditLedgerService.generateDatasetAuditCertificate(datasetId);

    return res.status(200).json({
      success: true,
      message: 'Decision-support audit certificate generated successfully',
      data: certificate,
    });
  } catch (error) {
    console.error('Error generating audit certificate:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate audit certificate',
      error: error.message,
    });
  }
};

const exportCertificateJson = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const certificate = await auditLedgerService.generateDatasetAuditCertificate(datasetId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit_certificate_${datasetId}_${Date.now()}.json"`
    );
    return res.status(200).send(JSON.stringify(certificate, null, 2));
  } catch (error) {
    console.error('Error exporting certificate JSON:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export audit certificate JSON',
      error: error.message,
    });
  }
};

const exportAnomaliesCsv = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      return res.status(404).json({ success: false, message: 'Dataset not found', data: null });
    }

    const anomalies = await AnomalyRecord.find({ dataset: datasetId, isAnomaly: true })
      .sort({ atpi: -1 })
      .lean();

    const headers = [
      'RecordIndex',
      'DatasetName',
      'DataType',
      'ATPI',
      'Priority',
      'FDR_QValue',
      'ACAT_PValue',
      'EnsembleScore',
      'PeerGroup',
      'MultiAgentVerdict',
      'ClaimVerificationRatio',
      'ReviewStatus',
      'Status',
      'NotesCount',
    ];

    const rows = anomalies.map((a) => {
      const qVal = a.qValue !== undefined && a.qValue !== null ? a.qValue.toFixed(4) : '';
      const pVal = a.combinedP !== undefined && a.combinedP !== null ? a.combinedP.toFixed(4) : '';
      const atpi = (a.atpi || 0).toFixed(1);
      const cvr = a.claimVerificationRatio !== null && a.claimVerificationRatio !== undefined
        ? `${(a.claimVerificationRatio * 100).toFixed(0)}%`
        : '';
      const priority =
        a.priority ||
        (a.atpi >= 75 ? 'CRITICAL' : a.atpi >= 55 ? 'HIGH' : a.atpi >= 35 ? 'MEDIUM' : 'LOW');

      return [
        a.recordIndex,
        `"${dataset.name.replace(/"/g, '""')}"`,
        dataset.dataType || 'REAL',
        atpi,
        priority,
        qVal,
        pVal,
        (a.ensembleScore || 0).toFixed(3),
        `"${(a.peerGroup || '').replace(/"/g, '""')}"`,
        a.validationVerdict || 'PENDING',
        cvr,
        a.reviewStatus || 'PENDING',
        a.status || 'NEW',
        (a.notes || []).length,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="anomalies_audit_${datasetId}_${Date.now()}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error exporting anomalies CSV:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export anomalies CSV',
      error: error.message,
    });
  }
};

module.exports = {
  getAuditChainBlocks,
  verifyAuditChain,
  getDatasetCertificate,
  exportCertificateJson,
  exportAnomaliesCsv,
};
