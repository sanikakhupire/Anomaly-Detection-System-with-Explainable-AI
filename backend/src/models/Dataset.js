const mongoose = require('mongoose');

const datasetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Dataset name is required'],
      trim: true,
      maxlength: [150, 'Dataset name cannot exceed 150 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['Census', 'MGNREGA', 'Election', 'Other'],
        message: '{VALUE} is not a valid dataset category',
      },
      default: 'Other',
      index: true,
    },
    dataType: {
      type: String,
      required: [true, 'Data type classification is required'],
      enum: {
        values: ['REAL', 'SYNTHETIC/DEMO', 'BENCHMARK'],
        message: '{VALUE} is not a valid data classification',
      },
      default: 'REAL',
      index: true,
    },
    filePath: {
      type: String,
      required: [true, 'File path is required'],
    },
    fileName: {
      type: String,
      required: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    fileType: {
      type: String,
      enum: ['csv', 'xlsx', 'xls'],
      required: true,
    },
    dataHash: {
      type: String,
      required: [true, 'SHA-256 data hash is required for reproducibility'],
      index: true,
    },
    status: {
      type: String,
      enum: ['Uploaded', 'Validating', 'Processing', 'Ready', 'Failed'],
      default: 'Uploaded',
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rowCount: {
      type: Number,
      default: 0,
    },
    columnCount: {
      type: Number,
      default: 0,
    },
    qualityScore: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

datasetSchema.index({ name: 'text', description: 'text' });
datasetSchema.index({ createdAt: -1 });

const Dataset = mongoose.model('Dataset', datasetSchema);

module.exports = Dataset;
