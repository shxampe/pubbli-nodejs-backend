import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let envFile;

console.log('Current NODE_ENV:', process.env.NODE_ENV);

switch (process.env.NODE_ENV) {
  case 'development':
    envFile = '.env.dev';
    break;
  case 'staging':
    envFile = '.env.stage';
    break;
  default:
    envFile = '.env.stage';
    break;
}

// Load environment-specific .env file
dotenvConfig({ path: path.resolve(__dirname, '../../', envFile) });

// Also load the default .env file if it exists (for shared configurations)
dotenvConfig({ path: path.resolve(__dirname, '../../.env') });

export const getEnvFile = () => envFile; 