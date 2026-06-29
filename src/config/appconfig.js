import "./env.js";

export const config = {
  app: {
    port: process.env.DEV_APP_PORT || 3000,
    appName: process.env.APP_NAME || "node_app",
    env: process.env.NODE_ENV || "development",
    base_url: process.env.SERVER_BASE_URL,
    successURL: "https://creator.pubbli.com/dashboard/",
  },
  frontend_url: process.env.FRONTEND_URI || "http://localhost:5173",
  db: {
    mongodb_uri: process.env.MONGODB_URI,
    name: process.env.DB_NAME || "test_db",
    logging: true,
  },
  auth: {
    jwt_secret: process.env.JWT_SECRET,
    jwt_expiresin: process.env.JWT_EXPIRES_IN || "30d",
    saltRounds: parseInt(process.env.SALT_ROUND, 10) || 10,
    active_roles: ["user", "influencer", "advertiser", "superadmin"],
  },
  instagram: {
    app_id: process.env.INSTAGRAM_APP_ID,
    app_secret: process.env.INSTAGRAM_APP_SECRET,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    // frontend_success_redirect: process.env.FRONTEND_SUCCESS_REDIRECT,
  },
  tiktok: {
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
  },
  google: {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    api_key: process.env.GOOGLE_API_KEY,
  },
  api: {
    base_path: process.env.API_BASE_PATH || "/api/v1",
  },
  s3: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    bucketName: process.env.AWS_BUCKET_NAME,
  },
  stripe: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    successURL: process.env.FRONTEND_STRIPE_PAYMENT_SUCCESS_URL,
    cancelURL: process.env.FRONTEND_STRIPE_PAYMENT_SUCCESS_URL,
    webhook_secret: process.env.STRIPE_WEBHOOK_EVENT || null,
  },
  loops: {
    api_key: process.env.LOOPS_API_KEY,
  },
  rapid: {
    apiKey: process.env.RAPID_API_KEY,
    tiktokHost: process.env.RAPID_TIKTOK_HOST,
    instagramHost: process.env.RAPID_INSTA_HOST,
    instagramPremiumHost: process.env.RAPID_INSTA_PREMIUM_HOST,
  },
};

export default config;
