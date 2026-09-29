const mongoose = require('mongoose');

const connectDB = async (uri) => {
  const mongoURI = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/anomaly_detection';
  try {
    const conn = await mongoose.connect(mongoURI);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
    }
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

const closeDB = async () => {
  try {
    await mongoose.connection.close();
  } catch (error) {
    console.error(`[MongoDB] Close error: ${error.message}`);
  }
};

module.exports = {
  connectDB,
  closeDB,
};
