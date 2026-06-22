const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const backendDir = path.join(__dirname, '..');
const projectEnvPath = path.join(backendDir, 'project.env');
const backendEnvPath = path.join(backendDir, '.env');
const rootEnvPath = path.join(backendDir, '..', '.env');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath);
  let content;

  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    content = raw.toString('utf16be');
  } else if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    content = raw.toString('utf16le');
  } else {
    content = raw.toString('utf8');
  }

  const parsed = dotenv.parse(content);
  Object.keys(parsed).forEach((key) => {
    if (process.env[key] === undefined) {
      process.env[key] = parsed[key];
    }
  });
}

function loadEnv() {
  [projectEnvPath, backendEnvPath, rootEnvPath].forEach(loadEnvFile);
}

loadEnv();

module.exports = {
  loadEnv,
  projectEnvPath,
  backendEnvPath,
  rootEnvPath
};
