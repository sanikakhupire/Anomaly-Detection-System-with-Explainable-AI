const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const ForensicReport = require('../models/ForensicReport');
const Dataset = require('../models/Dataset');
const ProcessingJob = require('../models/ProcessingJob');
const AuditLog = require('../models/AuditLog');
const mlService = require('../services/ml.service');

/**
 * Triggers forensic analysis battery on dataset columns.
 */
const runForensics = async (req, res, next) => {
  try {
    const { datasetId, columns = null, testNames = null } = req.body;

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
        message: 'Dataset file not found on disk',
        data: null,
        error: 'FILE_NOT_FOUND',
      });
    }

    const job = await ProcessingJob.create({
      type: 'FORENSIC_ANALYSIS',
      datasetId: dataset._id,
      status: 'PROCESSING',
      startedAt: new Date(),
    });

    try {
      const mlData = await mlService.analyzeForensics({
        filePath,
        columns,
        testNames,
      });

      const resultsByColumn = mlData.results_by_column || {};
      const savedReports = [];

      for (const [colName, colResult] of Object.entries(resultsByColumn)) {
        const report = await ForensicReport.findOneAndUpdate(
          { dataset: dataset._id, column: colName },
          {
            dataset: dataset._id,
            job: job._id,
            column: colName,
            analyzedRecords: colResult.valid_numeric_records || colResult.total_records || 0,
            overallConformity: colResult.overall_conformity || 'ACCEPTABLE',
            tests: colResult.tests || {},
            nonConformityCount: colResult.non_conformity_count || 0,
            recordPValues: colResult.record_pvalues || [],
            metadata: {
              columnsAnalyzed: mlData.columns_analyzed,
              totalTestsRun: mlData.total_tests_run,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        savedReports.push(report);
      }

      job.status = 'COMPLETED';
      job.progress = 100;
      job.completedAt = new Date();
      await job.save();

      await AuditLog.create({
        user: req.user._id,
        action: 'RUN_FORENSICS',
        entity: 'ForensicReport',
        entityId: dataset._id,
        metadata: {
          datasetId: dataset._id,
          columnsAnalyzed: mlData.columns_analyzed,
          totalTestsRun: mlData.total_tests_run,
          overallAssessment: mlData.overall_assessment,
        },
        ip: req.ip,
      });

      return res.status(200).json({
        success: true,
        message: `Forensic battery executed across ${savedReports.length} columns.`,
        data: {
          jobId: job._id,
          reports: savedReports,
          summary: {
            columnsAnalyzed: mlData.columns_analyzed,
            totalTestsRun: mlData.total_tests_run,
            suspiciousColumns: mlData.suspicious_columns,
            overallAssessment: mlData.overall_assessment,
          },
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
        message: mlErr.message || 'Forensic analysis execution failed',
        data: { jobId: job._id },
        error: 'FORENSIC_ANALYSIS_FAILED',
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves all forensic reports for a dataset.
 */
const getForensicsByDataset = async (req, res, next) => {
  try {
    const { datasetId } = req.params;

    if (!datasetId || !mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid datasetId is required',
        data: null,
        error: 'INVALID_DATASET_ID',
      });
    }

    const reports = await ForensicReport.find({ dataset: datasetId })
      .populate('dataset', 'name category dataType originalFileName')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Forensic reports retrieved successfully',
      data: { reports },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves a single forensic report by ID.
 */
const getForensicReportById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid report ID is required',
        data: null,
        error: 'INVALID_ID',
      });
    }

    const report = await ForensicReport.findById(id)
      .populate('dataset', 'name category dataType originalFileName')
      .lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Forensic report not found',
        data: null,
        error: 'NOT_FOUND',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Forensic report retrieved successfully',
      data: { report },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  runForensics,
  getForensicsByDataset,
  getForensicReportById,
};
