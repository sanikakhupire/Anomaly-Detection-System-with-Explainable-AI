const mongoose = require('mongoose');

const processingJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'DATASET_PROFILING',
        'FEATURE_ENGINEERING',
        'ANOMALY_DETECTION',
        'VALIDATION_PIPELINE',
        'FORENSIC_ANALYSIS',
        'DATA_FUSION',
        'EXPLANATION_GENERATION',
      ],
      default: 'DATASET_PROFILING',
      index: true,
    },
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'QUEUED',
      index: true,
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    step: {
      type: String,
      default: 'Queued in orchestrator',
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

processingJobSchema.index({ datasetId: 1, createdAt: -1 });

const ProcessingJob = mongoose.model('ProcessingJob', processingJobSchema);

module.exports = ProcessingJob;
