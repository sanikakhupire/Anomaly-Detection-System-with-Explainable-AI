const mongoose = require('mongoose');
const crypto = require('crypto');

const GENESIS_PREVIOUS_HASH = '0'.repeat(64);

/**
 * Computes deterministic SHA-256 block hash for Contribution C8
 */
function computeBlockHash({
  sequenceNumber,
  previousHash,
  timestamp,
  userId,
  action,
  entity,
  entityId,
  metadata,
}) {
  const sortedKeys = Object.keys(metadata || {}).sort();
  const canonicalMetadata = JSON.stringify(metadata || {}, sortedKeys);
  const isoTime = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();

  const payload = [
    sequenceNumber,
    previousHash,
    isoTime,
    userId ? userId.toString() : 'SYSTEM',
    action,
    entity,
    entityId ? entityId.toString() : '',
    canonicalMetadata,
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

const auditLogSchema = new mongoose.Schema(
  {
    sequenceNumber: {
      type: Number,
      index: true,
    },
    previousHash: {
      type: String,
      index: true,
      default: null,
    },
    currentHash: {
      type: String,
      index: true,
      default: null,
    },
    isGenesis: {
      type: Boolean,
      default: false,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    userRole: {
      type: String,
      default: 'SYSTEM',
    },
    userEmail: {
      type: String,
      default: 'system@platform.local',
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      index: true,
    },
    entity: {
      type: String,
      required: [true, 'Entity is required'],
      trim: true,
      index: true,
    },
    entityId: {
      type: String,
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Automatic hash-chaining pre-save hook
auditLogSchema.pre('save', async function (next) {
  if (this.currentHash && this.sequenceNumber !== undefined) {
    return next();
  }

  try {
    const AuditLogModel = this.constructor;
    const latest = await AuditLogModel.findOne().sort({ sequenceNumber: -1 });

    if (!latest) {
      // Genesis block creation
      this.sequenceNumber = 0;
      this.previousHash = GENESIS_PREVIOUS_HASH;
      this.isGenesis = true;
    } else {
      this.sequenceNumber = (latest.sequenceNumber || 0) + 1;
      this.previousHash = latest.currentHash || GENESIS_PREVIOUS_HASH;
    }

    if (!this.createdAt) {
      this.createdAt = new Date();
    }
    const timestamp = this.createdAt;
    this.currentHash = computeBlockHash({
      sequenceNumber: this.sequenceNumber,
      previousHash: this.previousHash,
      timestamp,
      userId: this.user,
      action: this.action,
      entity: this.entity,
      entityId: this.entityId,
      metadata: this.metadata,
    });

    next();
  } catch (err) {
    next(err);
  }
});

// Helpful compound indexes
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

auditLogSchema.statics.computeBlockHash = computeBlockHash;
auditLogSchema.statics.GENESIS_PREVIOUS_HASH = GENESIS_PREVIOUS_HASH;

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
