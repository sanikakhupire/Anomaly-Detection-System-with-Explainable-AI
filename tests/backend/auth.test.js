const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/anomaly_detection_test_db';

describe('Auth & RBAC Endpoints', () => {
  let adminToken;
  let analystToken;
  let reviewerToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_key_12345';
    await connectDB(TEST_DB_URI);
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await AuditLog.deleteMany({});

    // Seed test users: Admin, Analyst, Reviewer
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Test Admin',
      email: 'admin_test@example.com',
      password: 'Password123',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;

    const analystRes = await request(app).post('/api/auth/register').send({
      name: 'Test Analyst',
      email: 'analyst_test@example.com',
      password: 'Password123',
      role: 'ANALYST',
    });
    analystToken = analystRes.body.data.token;

    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'Test Reviewer',
      email: 'reviewer_test@example.com',
      password: 'Password123',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully and return token and user without passwordHash', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'New Registered User',
        email: 'newuser@example.com',
        password: 'SecurePassword123',
        role: 'ANALYST',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.email).toBe('newuser@example.com');
      expect(res.body.data.user.role).toBe('ANALYST');
      expect(res.body.data.user.passwordHash).toBeUndefined();

      // Check audit log
      const audit = await AuditLog.findOne({ action: 'USER_REGISTERED' });
      expect(audit).toBeTruthy();
    });

    it('should reject registration if email is already taken', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Duplicate Admin',
        email: 'admin_test@example.com',
        password: 'Password123',
        role: 'ADMIN',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject registration if password is less than 6 characters', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Short Password User',
        email: 'shortpass@example.com',
        password: '123',
        role: 'ANALYST',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toHaveProperty('details');
    });

    it('should reject registration if email format is invalid', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Invalid Email User',
        email: 'not-an-email',
        password: 'Password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate user with valid credentials and return JWT', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'admin_test@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('admin_test@example.com');
      expect(res.body.data).toHaveProperty('token');

      // Check audit log
      const audit = await AuditLog.findOne({ action: 'USER_LOGIN' });
      expect(audit).toBeTruthy();
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'admin_test@example.com',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid email or password/i);

      // Check audit log for failed login
      const audit = await AuditLog.findOne({ action: 'LOGIN_FAILED' });
      expect(audit).toBeTruthy();
    });

    it('should reject login for non-existent email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return profile for authenticated user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('admin_test@example.com');
      expect(res.body.data.user.role).toBe('ADMIN');
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 when Authorization token is invalid', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Role-based Authorization (RBAC)', () => {
    it('should allow ADMIN to access /api/auth/admin-only', async () => {
      const res = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject ANALYST from accessing /api/auth/admin-only with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/lacks permission/i);
    });

    it('should reject REVIEWER from accessing /api/auth/admin-only with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow ANALYST to access /api/auth/analyst-only', async () => {
      const res = await request(app)
        .get('/api/auth/analyst-only')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject REVIEWER from accessing /api/auth/analyst-only with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/auth/analyst-only')
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should successfully log out and record audit log', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const audit = await AuditLog.findOne({ action: 'USER_LOGOUT' });
      expect(audit).toBeTruthy();
    });
  });
});
