const mongoose = require('mongoose');

const DataFusionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    datasetA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    datasetB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    keyColumns: {
      type: [String],
      required: true,
      default: [],
    },
    compareColumns: {
      type: [String],
      required: true,
      default: [],
    },
    totalMatched: {
      type: Number,
      default: 0,
    },
    totalConflicts: {
      type: Number,
      default: 0,
    },
    resolvedCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'RESOLVED', 'FAILED'],
      default: 'PENDING_REVIEW',
    },
    sourceTrustA: {
      score: { type: Number, default: 0 },
      completeness: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      recency: { type: Number, default: 0 },
    },
    sourceTrustB: {
      score: { type: Number, default: 0 },
      completeness: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      recency: { type: Number, default: 0 },
    },
    conflicts: [
      {
        key: { type: String, required: true },
        column: { type: String, required: true },
        sourceA: {
          value: { type: mongoose.Schema.Types.Mixed },
          recordIndex: { type: Number },
        },
        sourceB: {
          value: { type: mongoose.Schema.Types.Mixed },
          recordIndex: { type: Number },
        },
        resolution: {
          status: {
            type: String,
            enum: ['PENDING', 'RESOLVED'],
            default: 'PENDING',
          },
          method: {
            type: String,
            enum: ['MANUAL', 'PREFER_A', 'PREFER_B', 'TRUST_WEIGHTED_MEAN', 'KEEP_BOTH_FLAGGED'],
            default: 'KEEP_BOTH_FLAGGED',
          },
          resolvedValue: { type: mongoose.Schema.Types.Mixed, default: null },
          resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          resolvedAt: { type: Date },
          notes: { type: String, trim: true },
        },
      },
    ],
    auditLog: [
      {
        action: { type: String, required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
        details: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

DataFusionSchema.index({ datasetA: 1, datasetB: 1 });
DataFusionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DataFusion', DataFusionSchema);
