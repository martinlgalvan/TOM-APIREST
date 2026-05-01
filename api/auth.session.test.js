import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

describe('auth session helpers', () => {
  let mongod;
  let directClient;
  let db;
  let AuthSession;
  let RefreshTokenService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.ACCESS_EXPIRES = '1h';
    process.env.REFRESH_EXPIRES = '30d';
    process.env.NODE_ENV = 'production';
    process.env.REFRESH_COOKIE_SAMESITE = 'lax';

    AuthSession = await import('./lib/authSession.js');
    RefreshTokenService = await import('../services/refreshTokens.services.js');

    directClient = new MongoClient(process.env.MONGODB_URI);
    await directClient.connect();
    db = directClient.db('TOM');
  });

  afterAll(async () => {
    if (RefreshTokenService?.closeRefreshTokensServiceConnectionForTests) {
      await RefreshTokenService.closeRefreshTokensServiceConnectionForTests();
    }
    if (directClient) await directClient.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await db.collection('RefreshTokens').deleteMany({});
  });

  test('issueSession persists refresh token and sets same-origin cookie options', async () => {
    const user = { _id: new ObjectId(), role: 'common' };
    const cookies = [];
    const res = {
      cookie(name, value, options) {
        cookies.push({ name, value, options });
      },
    };

    const { accessToken, refreshToken, refreshExp } = await AuthSession.issueSession(res, user);

    expect(typeof accessToken).toBe('string');
    expect(typeof refreshToken).toBe('string');
    expect(refreshExp).toBeInstanceOf(Date);
    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe('refresh_token');
    expect(cookies[0].value).toBe(refreshToken);
    expect(cookies[0].options.httpOnly).toBe(true);
    expect(cookies[0].options.sameSite).toBe('lax');
    expect(cookies[0].options.secure).toBe(true);
    expect(cookies[0].options.path).toBe('/api');

    const saved = await db.collection('RefreshTokens').find({}).toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0].user_id.toString()).toBe(user._id.toString());
    expect(saved[0].revoked_at).toBeNull();
  });

  test('sanitizeUser strips password fields from user payloads', () => {
    const sanitized = AuthSession.sanitizeUser({
      _id: new ObjectId(),
      email: 'user@test.com',
      password: 'secret',
      payment_info: {
        security: {
          password: 'nested-secret',
          pin: '1234',
        },
      },
    });

    expect(sanitized.password).toBeUndefined();
    expect(sanitized.payment_info.security.password).toBeUndefined();
    expect(sanitized.payment_info.security.pin).toBe('1234');
  });
});
