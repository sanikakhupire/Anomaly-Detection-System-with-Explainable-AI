const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    claimId: { type: String, required: true },
    claimText: { type: String, required: true },
    feature: { type: String },
    status: {
      type: String,
      enum: ['VERIFIED', 'CONTRADICTED', 'UNSUPPORTABLE'],
      required: true,
    },
    groundFact: { type: String, required: true },
    citationSource: { type: String, required: true },
    numericalDeviation: { type: Number },
  },
  { _id: false }
);

const agentAssessmentSchema = new mongoose.Schema(
  {
    agentName: { type: String, required: true },
    perspective: { type: String, required: true },
    supportsAnomaly: { type: Boolean, required: true },
    confidence: { type: Number, required: true, min: 0.0, max: 1.0 },
    findings: [{ type: String }],
    flags: [{ type: String }],
    recommendedVerdict: {
      type: String,
      enum: [
        'CONFIRMED_ANOMALY',
        'DATA_QUALITY_ARTIFACT',
        'BENIGN_EXTREME_VARIATION',
        'INSUFFICIENT_EVIDENCE',
      ],
      required: true,
    },
  },
  { _id: false }
);

const validationReportSchema = new mongoose.Schema(
  {
    anomaly: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnomalyRecord',
      required: true,
      unique: true,
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
    domainType: {
      type: String,
      default: 'GENERIC',
    },
    evidenceBundle: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    agentAssessments: [agentAssessmentSchema],
    claims: [claimSchema],
    claimVerificationRatio: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    verdict: {
      type: String,
      enum: [
        'CONFIRMED_ANOMALY',
        'DATA_QUALITY_ARTIFACT',
        'BENIGN_EXTREME_VARIATION',
        'INSUFFICIENT_EVIDENCE',
      ],
      required: true,
      index: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    recommendedAction: {
      type: String,
      enum: [
        'ESCALATE_FOR_AUDIT',
        'ACCEPT_AS_STATISTICAL_OUTLIER',
        'MARK_FALSE_POSITIVE',
        'REQUEST_DATA_CORRECTION',
      ],
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    ruleEngineType: {
      type: String,
      default: 'DETERMINISTIC_MULTI_AGENT',
    },
    isLlmAugmented: {
      type: Boolean,
      default: false,
    },
    humanReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      humanVerdict: {
        type: String,
        enum: ['VALIDATED', 'FALSE_POSITIVE', 'INCONCLUSIVE', 'PENDING'],
        default: 'PENDING',
      },
      notes: { type: String },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

validationReportSchema.index({ dataset: 1, verdict: 1 });
validationReportSchema.index({ dataset: 1, claimVerificationRatio: -1 });

const ValidationReport = mongoose.model('ValidationReport', validationReportSchema);

module.exports = ValidationReport;
