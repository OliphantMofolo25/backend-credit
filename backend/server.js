require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const authRoutes = require('./routes/authRoutes');
const loanRoutes = require('./routes/loanRoutes');
const paymentRoutes = require('./routes/paymentRoutes'); // Import payment routes

// Initialize Express app
const app = express();
const server = http.createServer(app);

// --- ✅ FIXED CORS CONFIGURATION ---
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://loaning-app-ebon.vercel.app/' // ← Replace with actual frontend deployment URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ✅ DATABASE CONNECTION ---
const connectWithRetry = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    console.log('Retrying connection in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

// MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// --- ✅ ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api', paymentRoutes);

// --- ✅ HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const status = dbState === 1 ? 'OK' : 'DB not connected';
  res.status(dbState === 1 ? 200 : 503).json({
    status,
    dbState,
    timestamp: new Date().toISOString()
  });
});

// --- ✅ 404 HANDLER ---
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Resource not found'
  });
});

// --- ✅ ERROR HANDLING ---
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal server error'
  });
});

// --- ✅ SERVER CONFIGURATION ---
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// --- ✅ GRACEFUL SHUTDOWN ---
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// --- ✅ ALTERNATE PORT HANDLING ---
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Trying alternative port...`);
    const alternativePort = parseInt(PORT) + 1;
    server.listen(alternativePort, HOST, () => {
      console.log(`Server running on port ${alternativePort}`);
    });
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});
