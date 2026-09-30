const mongoose = require('mongoose');

const ExplanationSchema = new mongoose.Schema(
  {
    anomalyRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnomalyRecord',
      required: true,
      index: true,
    },
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
    topFeatures: [
      {
        feature: { type: String, required: true },
        actualValue: { type: Number, required: true },
        expectedValue: { type: Number, required: true },
        direction: { type: String, required: true },
        shapValue: { type: Number, default: 0 },
        diffiScore: { type: Number, default: 0 },
        perturbationScore: { type: Number, default: 0 },
        contributionPct: { type: Number, default: 0 },
      },
    ],
    shapValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    diffiScores: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    perturbationScores: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    plainLanguageSummary: {
      type: String,
      required: true,
      trim: true,
    },
    counterfactuals: [
      {
        feature: { type: String, required: true },
        originalValue: { type: Number, required: true },
        counterfactualValue: { type: Number, required: true },
        delta: { type: Number, required: true },
        peerMedian: { type: Number, required: true },
        peerIqr: { type: [Number], default: [0, 0] },
        direction: { type: String, default: 'MAINTAIN' },
        plausibility: { type: Boolean, default: true },
      },
    ],
    faithfulness: {
      deletionAuc: { type: Number, default: 0 },
      insertionAuc: { type: Number, default: 0 },
      comprehensiveness: { type: Number, default: 0 },
      sufficiency: { type: Number, default: 0 },
      deletionCurve: { type: [Number], default: [] },
      insertionCurve: { type: [Number], default: [] },
    },
    stability: {
      jaccardStability: { type: Number, default: 0 },
      kendallTau: { type: Number, default: 0 },
      topKFeatures: { type: [String], default: [] },
      explanationCoverage: { type: Number, default: 1.0 },
    },
    stabilityScore: {
      type: Number,
      default: 0.5,
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

ExplanationSchema.index({ dataset: 1, recordIndex: 1 });
ExplanationSchema.index({ dataHash: 1, configHash: 1, recordIndex: 1 });

module.exports = mongoose.model('Explanation', ExplanationSchema);
