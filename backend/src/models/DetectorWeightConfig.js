const mongoose = require('mongoose');

const weightHistorySchema = new mongoose.Schema(
  {
    iteration: { type: Number, required: true },
    weights: { type: Map, of: Number, required: true },
    lossByDetector: { type: Map, of: Number, default: {} },
    precisionByDetector: { type: Map, of: Number, default: {} },
    weightDriftL1: { type: Number, default: 0.0 },
    feedbackCount: { type: Number, default: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, default: 'HUMAN_FEEDBACK_UPDATE' }, // or 'MANUAL_TUNING', 'RESET'
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const detectorWeightConfigSchema = new mongoose.Schema(
  {
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      default: null, // null = Global System Default
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    weights: {
      type: Map,
      of: Number,
      default: {
        robust_z: 0.40,
        isolation_forest: 0.35,
        z_score: 0.15,
        temporal: 0.10,
      },
    },
    learningRate: {
      type: Number,
      default: 0.10,
      min: 0.01,
      max: 1.0,
    },
    smoothingFactor: {
      type: Number,
      default: 0.05,
      min: 0.0,
      max: 0.30,
    },
    totalFeedbackCount: {
      type: Number,
      default: 0,
    },
    detectorStats: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        robust_z: { truePositives: 0, falsePositives: 0, totalEvaluated: 0, precision: 1.0 },
        isolation_forest: { truePositives: 0, falsePositives: 0, totalEvaluated: 0, precision: 1.0 },
        z_score: { truePositives: 0, falsePositives: 0, totalEvaluated: 0, precision: 1.0 },
        temporal: { truePositives: 0, falsePositives: 0, totalEvaluated: 0, precision: 1.0 },
      },
    },
    history: [weightHistorySchema],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

detectorWeightConfigSchema.index({ dataset: 1, isActive: 1 });

const DetectorWeightConfig = mongoose.model('DetectorWeightConfig', detectorWeightConfigSchema);

module.exports = DetectorWeightConfig;
