const mongoose = require('mongoose');

const peerGroupSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    groupColumn: {
      type: String,
      required: true,
    },
    parentColumn: {
      type: String,
      default: null,
    },
    groupName: {
      type: String,
      required: true,
    },
    parentGroup: {
      type: String,
      default: null,
    },
    sampleCount: {
      type: Number,
      required: true,
    },
    shrinkageFactor: {
      type: Number,
      required: true,
    },
    isSmallGroup: {
      type: Boolean,
      default: false,
      index: true,
    },
    baselines: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

peerGroupSchema.index({ datasetId: 1, groupName: 1 }, { unique: true });

const PeerGroup = mongoose.model('PeerGroup', peerGroupSchema);

module.exports = PeerGroup;
