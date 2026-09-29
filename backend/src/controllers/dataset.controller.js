const fs = require('fs');
const path = require('path');
const Dataset = require('../models/Dataset');
const ProcessingJob = require('../models/ProcessingJob');
const DataQualityReport = require('../models/DataQualityReport');
const { sendSuccess, sendError } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { calculateFileHash, validateCsvHeader } = require('../utils/fileValidator');
const { runProfilingJob } = require('../services/job.service');

/**
 * Upload dataset file and initiate profiling job
 * POST /api/datasets/upload
 */
const uploadDataset = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'No dataset file provided in request', {
        code: 'FILE_MISSING',
      });
    }

    const { path: filePath, originalname, size, filename } = req.file;
    const fileExt = path.extname(originalname).toLowerCase().replace('.', '');

    // 1. Check for empty file (0 bytes)
    if (size === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return sendError(res, 400, 'The uploaded file is empty (0 bytes).', {
        code: 'EMPTY_FILE',
      });
    }

    // 2. CSV Header Validation (missing headers, duplicate columns)
    if (fileExt === 'csv') {
      const headerValidation = await validateCsvHeader(filePath);
      if (!headerValidation.isValid) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return sendError(res, 400, `Dataset validation error: ${headerValidation.error}`, {
          code: headerValidation.code || 'INVALID_CSV_HEADER',
        });
      }
    }

    // 3. Compute SHA-256 data hash
    const dataHash = await calculateFileHash(filePath);

    // 4. Extract metadata fields from form body
    const name = req.body.name?.trim() || originalname.replace(/\.[^/.]+$/, '');
    const description = req.body.description?.trim() || '';
    const category = ['Census', 'MGNREGA', 'Election', 'Other'].includes(req.body.category)
      ? req.body.category
      : 'Other';
    const dataType = ['REAL', 'SYNTHETIC/DEMO', 'BENCHMARK'].includes(req.body.dataType)
      ? req.body.dataType
      : 'REAL';

    // 5. Create Dataset document in database
    const newDataset = await Dataset.create({
      name,
      description,
      category,
      dataType,
      filePath,
      fileName: filename,
      originalFileName: originalname,
      fileSize: size,
      fileType: fileExt,
      dataHash,
      status: 'Uploaded',
      uploadedBy: req.user._id,
    });

    // 6. Create ProcessingJob entry
    const newJob = await ProcessingJob.create({
      type: 'DATASET_PROFILING',
      datasetId: newDataset._id,
      status: 'QUEUED',
      progress: 0,
      step: 'File safely uploaded. Job queued for ML profiling.',
      createdBy: req.user._id,
    });

    // 7. Audit log
    await logAudit({
      user: req.user._id,
      action: 'DATASET_UPLOAD',
      entity: 'Dataset',
      entityId: newDataset._id,
      metadata: {
        name: newDataset.name,
        category: newDataset.category,
        dataType: newDataset.dataType,
        fileSize: newDataset.fileSize,
        dataHash,
        jobId: newJob._id,
      },
      req,
    });

    // 8. Fire asynchronous background profiling job (non-blocking)
    runProfilingJob(newJob._id, newDataset._id, filePath, dataHash).catch((err) => {
      console.error(`[Background Job Failure] ${err.message}`);
    });

    return sendSuccess(
      res,
      201,
      'Dataset uploaded successfully. Data profiling job initiated.',
      {
        dataset: newDataset,
        job: newJob,
      }
    );
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // Ignore cleanup error
      }
    }
    next(error);
  }
};

/**
 * List datasets with server-side pagination, search, category filter, and sorting
 * GET /api/datasets
 */
const getDatasets = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const { search, category, status, dataType, sortBy, sortOrder } = req.query;

    const query = {};

    // Filter by category
    if (category && category !== 'ALL') {
      query.category = category;
    }

    // Filter by status
    if (status && status !== 'ALL') {
      query.status = status;
    }

    // Filter by data classification
    if (dataType && dataType !== 'ALL') {
      query.dataType = dataType;
    }

    // Search query on name and description
    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    // Sorting
    const sortField = ['createdAt', 'name', 'fileSize', 'rowCount', 'qualityScore'].includes(sortBy)
      ? sortBy
      : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortDirection };

    const [datasets, total] = await Promise.all([
      Dataset.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name email role')
        .lean(),
      Dataset.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 200, 'Datasets retrieved successfully', {
      datasets,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed dataset profile and quality report
 * GET /api/datasets/:id
 */
const getDatasetById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const dataset = await Dataset.findById(id).populate('uploadedBy', 'name email role');
    if (!dataset) {
      return sendError(res, 404, `Dataset not found with ID: ${id}`, {
        code: 'DATASET_NOT_FOUND',
      });
    }

    const [qualityReport, recentJobs] = await Promise.all([
      DataQualityReport.findOne({ datasetId: id }).lean(),
      ProcessingJob.find({ datasetId: id }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return sendSuccess(res, 200, 'Dataset details retrieved', {
      dataset,
      qualityReport,
      recentJobs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete dataset and its associated reports and jobs
 * DELETE /api/datasets/:id
 */
const deleteDataset = async (req, res, next) => {
  try {
    const { id } = req.params;

    const dataset = await Dataset.findById(id);
    if (!dataset) {
      return sendError(res, 404, `Dataset not found with ID: ${id}`, {
        code: 'DATASET_NOT_FOUND',
      });
    }

    // Delete underlying file on disk
    if (dataset.filePath && fs.existsSync(dataset.filePath)) {
      try {
        fs.unlinkSync(dataset.filePath);
      } catch (err) {
        console.warn(`[File Deletion Warning] Could not remove ${dataset.filePath}: ${err.message}`);
      }
    }

    // Clean up database records
    await Promise.all([
      DataQualityReport.deleteMany({ datasetId: id }),
      ProcessingJob.deleteMany({ datasetId: id }),
      Dataset.findByIdAndDelete(id),
    ]);

    // Audit log
    await logAudit({
      user: req.user._id,
      action: 'DATASET_DELETED',
      entity: 'Dataset',
      entityId: id,
      metadata: {
        name: dataset.name,
        dataHash: dataset.dataHash,
        category: dataset.category,
      },
      req,
    });

    return sendSuccess(res, 200, 'Dataset and associated reports deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

/**
 * Get processing job status by ID
 * GET /api/jobs/:id
 */
const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await ProcessingJob.findById(id);
    if (!job) {
      return sendError(res, 404, `Processing job not found with ID: ${id}`, {
        code: 'JOB_NOT_FOUND',
      });
    }

    return sendSuccess(res, 200, 'Job status retrieved', { job });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadDataset,
  getDatasets,
  getDatasetById,
  deleteDataset,
  getJobById,
};
