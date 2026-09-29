const ProcessingJob = require('../models/ProcessingJob');
const Dataset = require('../models/Dataset');
const DataQualityReport = require('../models/DataQualityReport');
const { requestProfiling } = require('./ml.service');

/**
 * Executes a profiling job asynchronously.
 * Orchestrates Python ML service calls, stores the DataQualityReport,
 * and maintains job progress states: QUEUED -> PROCESSING -> COMPLETED/FAILED.
 */
const runProfilingJob = async (jobId, datasetId, filePath, dataHash) => {
  try {
    // 1. Advance job state to PROCESSING
    await ProcessingJob.findByIdAndUpdate(jobId, {
      status: 'PROCESSING',
      progress: 25,
      step: 'Streaming dataset into ML profiler...',
      startedAt: new Date(),
    });

    await Dataset.findByIdAndUpdate(datasetId, {
      status: 'Processing',
    });

    // 2. Call FastAPI ML Profiling Service
    const profileData = await requestProfiling(filePath);

    // 3. Update job progress
    await ProcessingJob.findByIdAndUpdate(jobId, {
      progress: 75,
      step: 'Storing Data Quality Report and computing schema metadata...',
    });

    // 4. Save DataQualityReport to MongoDB
    await DataQualityReport.findOneAndUpdate(
      { datasetId },
      {
        datasetId,
        rowCount: profileData.rowCount,
        columnCount: profileData.columnCount,
        columns: profileData.columns,
        duplicateRowCount: profileData.duplicateRowCount,
        duplicateRowPercentage: profileData.duplicateRowPercentage,
        overallQualityScore: profileData.overallQualityScore,
        issues: profileData.issues,
        transformationLog: profileData.transformationLog,
        dataHash,
      },
      { upsert: true, new: true }
    );

    // 5. Update Dataset with computed metrics and mark Ready
    await Dataset.findByIdAndUpdate(datasetId, {
      status: 'Ready',
      rowCount: profileData.rowCount,
      columnCount: profileData.columnCount,
      qualityScore: profileData.overallQualityScore,
    });

    // 6. Complete Job
    await ProcessingJob.findByIdAndUpdate(jobId, {
      status: 'COMPLETED',
      progress: 100,
      step: 'Profiling analysis completed successfully.',
      completedAt: new Date(),
      result: {
        rowCount: profileData.rowCount,
        columnCount: profileData.columnCount,
        overallQualityScore: profileData.overallQualityScore,
        issueCount: profileData.issues.length,
      },
    });
  } catch (error) {
    console.error(`[Job Orchestrator Error] Job ${jobId} failed: ${error.message}`);

    await ProcessingJob.findByIdAndUpdate(jobId, {
      status: 'FAILED',
      progress: 100,
      step: 'Profiling process encountered an unrecoverable error.',
      error: {
        message: error.message,
      },
      completedAt: new Date(),
    });

    await Dataset.findByIdAndUpdate(datasetId, {
      status: 'Failed',
    });
  }
};

module.exports = {
  runProfilingJob,
};
