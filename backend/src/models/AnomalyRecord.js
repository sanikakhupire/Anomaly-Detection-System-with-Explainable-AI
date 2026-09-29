const mongoose = require('mongoose');

const anomalyRecordSchema = new mongoose.Schema(
  {
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    recordIndex: {
      type: Number,
      required: true,
      index: true,
    },
    recordData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    detectorScores: {
      type: Map,
      of: Number,
      default: {},
    },
    detectorPValues: {
      type: Map,
      of: Number,
      default: {},
    },
    detectorFlags: {
      type: Map,
      of: Boolean,
      default: {},
    },
    combinedP: {
      type: Number,
      default: 1.0,
      index: true,
    },
    qValue: {
      type: Number,
      default: 1.0,
      index: true,
    },
    combinedScore: {
      type: Number,
      default: 0.0,
    },
    ensembleScore: {
      type: Number,
      required: true,
      default: 0.0,
      index: true,
    },
    atpi: {
      type: Number,
      default: 0.0,
      index: true,
    },
    atpiBreakdown: {
      type: Map,
      of: Number,
      default: {},
    },
    detectionMethods: {
      type: [String],
      default: [],
    },
    peerContextFlag: {
      type: Boolean,
      default: false,
      index: true,
    },
    isAnomaly: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    flags: {
      type: [String],
      default: [],
      index: true,
    },
    peerGroup: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['NEW', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'],
      default: 'NEW',
      index: true,
    },
    reviewStatus: {
      type: String,
      enum: ['PENDING', 'VALIDATED', 'FALSE_POSITIVE', 'INCONCLUSIVE'],
      default: 'PENDING',
      index: true,
    },
    triagePriority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true,
    },
    notes: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          text: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for fast server-side query filtering and sorting
anomalyRecordSchema.index({ dataset: 1, isAnomaly: 1, ensembleScore: -1 });
anomalyRecordSchema.index({ dataset: 1, recordIndex: 1 }, { unique: true });
anomalyRecordSchema.index({ dataset: 1, qValue: 1 });
anomalyRecordSchema.index({ dataset: 1, atpi: -1 });
anomalyRecordSchema.index({ dataset: 1, status: 1 });
anomalyRecordSchema.index({ dataset: 1, reviewStatus: 1 });

const AnomalyRecord = mongoose.model('AnomalyRecord', anomalyRecordSchema);

module.exports = AnomalyRecord;
