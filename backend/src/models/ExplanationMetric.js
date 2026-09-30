const mongoose = require('mongoose');

const ExplanationMetricSchema = new mongoose.Schema(
  {
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProcessingJob',
      index: true,
    },
    meanDeletionAuc: {
      type: Number,
      default: 0,
    },
    meanInsertionAuc: {
      type: Number,
      default: 0,
    },
    meanJaccardStability: {
      type: Number,
      default: 0,
    },
    meanKendallTau: {
      type: Number,
      default: 0,
    },
    totalExplained: {
      type: Number,
      default: 0,
    },
    explanationCoverage: {
      type: Number,
      default: 1.0,
    },
    dataHash: {
      type: String,
      default: '',
    },
    configHash: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

ExplanationMetricSchema.index({ dataset: 1, createdAt: -1 });

module.exports = mongoose.model('ExplanationMetric', ExplanationMetricSchema);
