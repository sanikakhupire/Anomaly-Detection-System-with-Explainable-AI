require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`[Backend] Server listening on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    const shutdown = async (signal) => {
      console.log(`[Backend] Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log('[Backend] HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error(`[Backend] Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
