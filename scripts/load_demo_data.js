#!/usr/bin/env node
/**
 * Script to load synthetic demo datasets into the system through the normal upload path.
 *
 * Can execute in two modes:
 * 1. HTTP mode: If the backend server is running on http://localhost:5000 (or BACKEND_URL).
 * 2. In-Process mode: Directly loads via Express app and Mongoose DB using the normal upload route.
 *
 * Ensures all three datasets (Census, MGNREGA, Election) are ingested and marked as 'SYNTHETIC/DEMO'.
 */

const path = require('path');
// Enable resolving dependencies from backend/node_modules
module.paths.push(path.resolve(__dirname, '../backend/node_modules'));

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const fs = require('fs');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../backend/src/app');
const User = require('../backend/src/models/User');
const Dataset = require('../backend/src/models/Dataset');
const { connectDB } = require('../backend/src/config/db');

const demoConfigs = [
  {
    name: 'Census Demographic Synthetic Benchmark',
    description: 'Synthetic multi-decade Census demographic dataset with ground truth injected point, contextual, collective, temporal, digit, and conflict anomalies.',
    category: 'Census',
    dataType: 'SYNTHETIC/DEMO',
    fileName: 'census_demo.csv',
    labelsFileName: 'census_demo_labels.json',
  },
  {
    name: 'MGNREGA Rural Employment Synthetic Benchmark',
    description: 'Synthetic monthly MGNREGA rural labor demand & wage disbursement dataset with ground truth anomalies for peer group and temporal testing.',
    category: 'MGNREGA',
    dataType: 'SYNTHETIC/DEMO',
    fileName: 'mgnrega_demo.csv',
    labelsFileName: 'mgnrega_demo_labels.json',
  },
  {
    name: 'Election Constituency Synthetic Benchmark',
    description: 'Synthetic polling station voting dataset across multiple election cycles with ballot-stuffing, Benford violations, and logical conflict ground truth anomalies.',
    category: 'Election',
    dataType: 'SYNTHETIC/DEMO',
    fileName: 'election_demo.csv',
    labelsFileName: 'election_demo_labels.json',
  },
];

async function getAdminToken() {
  // Ensure default admin exists
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@anomalydetection.internal';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword@123';

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    const passwordHash = await User.hashPassword(adminPassword);
    admin = await User.create({
      name: 'System Administrator',
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
    });
  }

  // Generate token via login endpoint
  const res = await request(app).post('/api/auth/login').send({
    email: adminEmail,
    password: adminPassword,
  });

  if (!res.body.success || !res.body.data?.token) {
    throw new Error(`Failed to obtain admin token: ${res.body.message}`);
  }

  return res.body.data.token;
}

async function loadDemoDatasets() {
  console.log('====================================================');
  console.log('Loading Demo Datasets via Normal Upload Pipeline');
  console.log('====================================================');

  await connectDB();
  const token = await getAdminToken();
  const demoDir = path.resolve(__dirname, '../data/demo');

  for (const config of demoConfigs) {
    const filePath = path.join(demoDir, config.fileName);
    const labelsPath = path.join(demoDir, config.labelsFileName);

    if (!fs.existsSync(filePath)) {
      console.error(`[Error] File not found: ${filePath}. Run synthetic.py first.`);
      continue;
    }

    // Check if already uploaded
    const existing = await Dataset.findOne({
      name: config.name,
      dataType: 'SYNTHETIC/DEMO',
    });

    if (existing) {
      console.log(`[Info] Dataset "${config.name}" already exists (ID: ${existing._id}). Skipping upload.`);
      continue;
    }

    console.log(`\n[Uploading] ${config.name} (${config.fileName})...`);

    // Upload via normal Multer upload endpoint
    const uploadRes = await request(app)
      .post('/api/datasets/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('name', config.name)
      .field('description', config.description)
      .field('category', config.category)
      .field('dataType', config.dataType)
      .attach('file', filePath);

    if (uploadRes.status === 201 || uploadRes.body.success) {
      const datasetId = uploadRes.body.data.dataset._id;
      console.log(`[Success] Uploaded ${config.name}!`);
      console.log(`          Dataset ID: ${datasetId}`);
      console.log(`          Classification: ${uploadRes.body.data.dataset.dataType}`);
      console.log(`          SHA-256 Hash: ${uploadRes.body.data.dataset.dataHash}`);

      // Count ground truth anomalies if label file exists
      if (fs.existsSync(labelsPath)) {
        try {
          const labelsData = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
          const anomCount = labelsData.filter((l) => l.is_anomaly).length;
          console.log(`          Ground-Truth Annotations: ${labelsData.length} records (${anomCount} anomalies)`);
        } catch (e) {
          // ignore
        }
      }
    } else {
      console.error(`[Failed] Could not upload ${config.name}:`, uploadRes.body);
    }
  }

  console.log('\n====================================================');
  console.log('Demo datasets loaded successfully into MongoDB.');
  console.log('====================================================');
  await mongoose.connection.close();
  process.exit(0);
}

if (require.main === module) {
  loadDemoDatasets().catch((err) => {
    console.error('Fatal error loading demo datasets:', err);
    process.exit(1);
  });
}

module.exports = { loadDemoDatasets };
