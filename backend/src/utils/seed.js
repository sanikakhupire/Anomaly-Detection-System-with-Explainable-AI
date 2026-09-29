require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const { connectDB } = require('../config/db');

const seedUsers = [
  {
    name: 'Lead System Administrator',
    email: 'admin@anomalydetection.internal',
    password: 'AdminPassword@123',
    role: 'ADMIN',
  },
  {
    name: 'Data Analyst User',
    email: 'analyst@anomalydetection.internal',
    password: 'AnalystPassword@123',
    role: 'ANALYST',
  },
  {
    name: 'Human Reviewer User',
    email: 'reviewer@anomalydetection.internal',
    password: 'ReviewerPassword@123',
    role: 'REVIEWER',
  },
];

const seedDatabase = async () => {
  try {
    await connectDB();
    console.log('[Seed] Seeding default platform users...');

    for (const userData of seedUsers) {
      const existing = await User.findOne({ email: userData.email.toLowerCase() });
      if (existing) {
        console.log(`[Seed] User ${userData.email} already exists (${existing.role}). Skipping.`);
      } else {
        const passwordHash = await User.hashPassword(userData.password);
        const user = await User.create({
          name: userData.name,
          email: userData.email.toLowerCase(),
          passwordHash,
          role: userData.role,
        });
        console.log(`[Seed] Created ${user.role} user: ${user.email} (Password: ${userData.password})`);
      }
    }

    console.log('[Seed] Database seeding completed successfully.');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`[Seed Error] Seeding failed: ${error.message}`);
    process.exit(1);
  }
};

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
