const mongoose = require('mongoose');

const featureDefinitionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    domain: { type: String, required: true },
    formula: { type: String, required: true },
    sourceColumns: { type: [String], default: [] },
    dtype: { type: String, default: 'numeric' },
    mean: { type: Number, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    std: { type: Number, default: null },
    median: { type: Number, default: null },
    nonNullCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const featureSetSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      unique: true,
      index: true,
    },
    features: [featureDefinitionSchema],
    featureCount: {
      type: Number,
      default: 0,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const FeatureSet = mongoose.model('FeatureSet', featureSetSchema);

module.exports = FeatureSet;
