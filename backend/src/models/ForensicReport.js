const mongoose = require('mongoose');

const ForensicReportSchema = new mongoose.Schema(
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
    column: {
      type: String,
      required: true,
      trim: true,
    },
    analyzedRecords: {
      type: Number,
      default: 0,
    },
    overallConformity: {
      type: String,
      enum: [
        'CLOSE_CONFORMITY',
        'ACCEPTABLE',
        'SUSPICIOUS_DEVIATION',
        'NON_CONFORMING',
        'INCONCLUSIVE',
      ],
      default: 'ACCEPTABLE',
    },
    tests: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    nonConformityCount: {
      type: Number,
      default: 0,
    },
    recordPValues: {
      type: [Number],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

ForensicReportSchema.index({ dataset: 1, column: 1 });
ForensicReportSchema.index({ dataset: 1, createdAt: -1 });

module.exports = mongoose.model('ForensicReport', ForensicReportSchema);
