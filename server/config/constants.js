module.exports = {
  CCTV: {
    baseUrl: process.env.CCTV_BASE_URL || 'http://cctv.xxxxxx.xx:8090',
    login: process.env.CCTV_LOGIN || 'CCTV',
    password: process.env.CCTV_PASSWORD,
    cameras: {
      1: '/CCTV/RecSpace_360673CBB6824C65B7CB3A2F611A6110/CH001_50F36D36752750F36D36752750F30000/Regular',
      2: '/CCTV/RecSpace_360673CBB6824C65B7CB3A2F611A6110/CH002_50F36D36752750F36D36752750F30001/Regular',
      3: '/CCTV/RecSpace_360673CBB6824C65B7CB3A2F611A6110/CH003_50F36D36752750F36D36752750F30002/Regular',
      4: '/CCTV/RecSpace_360673CBB6824C65B7CB3A2F611A6110/CH004_50F36D36752750F36D36752750F30003/Regular',
      5: '/CCTV/RecSpace_360673CBB6824C65B7CB3A2F611A6110/CH005_50F36D36752750F36D36752750F30004/Regular',
      6: '/CCTV/RecSpace_360673CBB6824C65B7CB3A2F611A6110/CH006_50F36D36752750F36D36752750F30005/Regular'
    }
  },
  CACHE: {
    maxSizeBytes: 1 * 1024 * 1024 * 1024, // 1GB limit
    cleanupThresholdBytes: 0.8 * 1024 * 1024 * 1024, // Start cleanup at 800MB
    checkIntervalMs: 5 * 60 * 1000 // Check every 5 minutes
  },
  DB: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'actuauser',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'actinvent',
    connectionLimit: 10,
    connectTimeout: 60000
  }
};