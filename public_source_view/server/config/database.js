const mysql = require('mysql2/promise');
const { DB } = require('./constants');

// Validate required environment variables
const requiredEnvVars = ['DB_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required database environment variables:', missingVars.join(', '));
  console.error('💡 Please check your .env file');
  process.exit(1);
}

const pool = mysql.createPool({
  host: DB.host,
  user: DB.user,
  password: DB.password,
  database: DB.database,
  connectionLimit: DB.connectionLimit,
  connectTimeout: DB.connectTimeout
});

// Immediately try to get a connection to verify the pool is working
pool.getConnection()
  .then(conn => {
    console.log(`🗄️ Database pool created for ${DB.database}@${DB.host}`);
    conn.release();
  })
  .catch(err => {
    console.error('❌ Failed to create database pool:', err);
    process.exit(1);
  });

module.exports = pool;