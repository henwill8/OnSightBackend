const path = require('path');

const MODEL_VOLUME = "/app/models/storage";

// S3 path configurations
const S3_CONFIG = {
  // NOT FULL PATH, IN USE GYM ID IS ADDED IN FRONT
  routeImagesPath: '/routes/images',
  routeTemplatesPath: '/routes/templates',
  routeAnnotationsPath: '/routes/annotations'
};

module.exports = {
  MODEL_VOLUME,
  S3_CONFIG
};
