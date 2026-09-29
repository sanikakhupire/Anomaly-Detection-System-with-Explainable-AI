const mongoose = require('mongoose');

const columnProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    dtype: { type: String, required: true },
    missingCount: { type: Number, default: 0 },
    missingPercentage: { type: Number, default: 0 },
    uniqueCount: { type: Number, default: 0 },
    sampleValues: { type: [mongoose.Schema.Types.Mixed], default: [] },
    mean: { type: Number, default: null },
    std: { type: Number, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    median: { type: Number, default: null },
    q25: { type: Number, default: null },
    q75: { type: Number, default: null },
    numInvalid: { type: Number, default: 0 },
  },
  { _id: false }
);

const qualityIssueSchema = new mongoose.Schema(
  {
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'LOW' },
    column: { type: String, default: null },
    message: { type: String, required: true },
  },
  { _id: false }
);

const transformationLogEntrySchema = new mongoose.Schema(
  {
    level: { type: String, default: 'INFO' },
    message: { type: String, required: true },
  },
  { _id: false }
);

const dataQualityReportSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      unique: true,
      index: true,
    },
    rowCount: {
      type: Number,
      required: true,
    },
    columnCount: {
      type: Number,
      required: true,
    },
    columns: [columnProfileSchema],
    duplicateRowCount: {
      type: Number,
      default: 0,
    },
    duplicateRowPercentage: {
      type: Number,
      default: 0,
    },
    overallQualityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    issues: [qualityIssueSchema],
    transformationLog: [transformationLogEntrySchema],
    dataHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const DataQualityReport = mongoose.model('DataQualityReport', dataQualityReportSchema);

module.exports = DataQualityReport;
