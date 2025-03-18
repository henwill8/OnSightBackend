const path = require('path');

const storage_volume = "/app/storage/storage";

const STORAGE_PATH = process.env.NODE_ENV === 'development'
  ? './storage'  // Path for development
  : storage_volume;  // Default path for production on Railway

module.exports = {
  STORAGE_PATH,
};
