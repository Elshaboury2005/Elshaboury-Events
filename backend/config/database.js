const mysql = require('mysql2/promise');
const { projectEnvPath, backendEnvPath, rootEnvPath } = require('./env');

function describeDbConfig() {
  return `${process.env.DB_USER || 'root'}@${process.env.DB_HOST || 'localhost'}/${process.env.DB_NAME || 'event_registration_db'}`;
}

function printDatabaseHelp(err) {
  console.error('Database connection error:', err.message);
  console.log(`Tried MySQL connection: ${describeDbConfig()}`);

  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.log('MySQL rejected the credentials. Set DB_USER and DB_PASSWORD in one of these files:');
    console.log(`- ${projectEnvPath}`);
    console.log(`- ${backendEnvPath}`);
    console.log(`- ${rootEnvPath}`);
    console.log('"using password: NO" means DB_PASSWORD is missing or empty.');
    return;
  }

  console.log('Make sure MySQL is running and the database exists.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'event_registration_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.getConnection()
  .then((connection) => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(printDatabaseHelp);

module.exports = pool;
