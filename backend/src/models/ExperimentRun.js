const mongoose = require('mongoose');

const experimentRunSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Experiment name is required'],
      trim: true,
      index: true,
    },
    domain: {
      type: String,
      enum: ['MGNREGA', 'Census', 'Election', 'Generic', 'CENSUS', 'ELECTION'],
      default: 'MGNREGA',
      index: true,
    },
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      default: null,
      index: true,
    },
    dataType: {
      type: String,
      enum: ['REAL', 'SYNTHETIC/DEMO', 'BENCHMARK'],
      default: 'SYNTHETIC/DEMO',
      index: true,
    },
    seed: {
      type: Number,
      default: 42,
    },
    nRepetitions: {
      type: Number,
      default: 5,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    dataHash: {
      type: String,
      default: null,
    },
    configHash: {
      type: String,
      default: null,
    },
    modelVersion: {
      type: String,
      default: '1.0.0-C9-experiment-lab',
    },
    status: {
      type: String,
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
    errorMessage: {
      type: String,
      default: null,
    },
    totalRecords: {
      type: Number,
      default: 0,
    },
    groundTruthAnomalies: {
      type: Number,
      default: 0,
    },
    baselineSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ablationSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    significanceTests: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    latexTables: {
      benchmarkTable: { type: String, default: '' },
      ablationTable: { type: String, default: '' },
      significanceTable: { type: String, default: '' },
    },
    executionTimeMs: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

experimentRunSchema.index({ createdAt: -1 });
experimentRunSchema.index({ status: 1, createdAt: -1 });

const ExperimentRun = mongoose.model('ExperimentRun', experimentRunSchema);

module.exports = ExperimentRun;
