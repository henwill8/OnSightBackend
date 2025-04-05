const fs = require('fs');
const path = require('path');
const ort = require("onnxruntime-node");
const { STORAGE_PATH } = require('@/config');

// File path to the model
let modelPath = path.join(process.cwd(), './models/model.onnx');

// Check file size before loading the model
function checkModelSize(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        console.log("Error checking file size: " + err);
        resolve(0);
      } else {
        const fileSizeInBytes = stats.size;
        console.log(`Model file size: ${fileSizeInBytes} bytes`);
        resolve(fileSizeInBytes);
      }
    });
  });
}

async function runModel(inputTensor) {
  try {
    const modelSize = await checkModelSize(modelPath);
    if (modelSize < 10000) {
      modelPath = STORAGE_PATH + '/models/model.onnx';
    }

    console.log("Attempting to create onnxruntime session at " + modelPath);
    
    // Log memory and resource usage before creating the session
    console.log("Creating session...");
    const session = await ort.InferenceSession.create(modelPath);

    const inputName = session.inputNames[0];

    const result = await session.run({ [inputName]: inputTensor });
    console.log("Model run successful.");
    return result;
  } catch (error) {
    console.error("Error running model:", error);
    throw error;
  }
}

/**
 * Extract raw bounding boxes from model output
 */
function extractRawBoundingBoxes(data) {
  const confidences = data["scores"].cpuData;
  const types = data["labels"].cpuData;
  const boxes = data["boxes"].cpuData;

  if (!confidences || !boxes) {
    console.error("Missing bounding box or confidence data");
    return [];
  }

  const confidenceKeys = Object.keys(confidences);

  // Extract raw boxes where confidence > 0.5 and type = 1 (climbing hold)
  return confidenceKeys
    .map((key) => {
      const confidence = confidences[key];
      const type = types[key];
      const boxStart = parseInt(key) * 4;

      if (confidence >= 0.4 && Number(type) == 1) {
        const x1 = boxes[boxStart];
        const y1 = boxes[boxStart + 1];
        const x2 = boxes[boxStart + 2];
        const y2 = boxes[boxStart + 3];

        return [ x1, y1, x2 - x1, y2 - y1 ];
      }
      return null;
    })
    .filter(box => box !== null);
}

/**
 * Adjust bounding boxes to match original image size
 */
function adjustBoundingBoxesToOriginalSize(rawBoxes, originalWidth, originalHeight, paddedWidth, paddedHeight) {
  const scaleX = originalWidth / paddedWidth;
  const scaleY = originalHeight / paddedHeight;

  const xOffset = (1280 - paddedWidth) / 2;
  const yOffset = (1280 - paddedHeight) / 2;

  return rawBoxes
    .map(({ x1, y1, x2, y2 }) => {
      const x = Math.max(0, (x1 - xOffset) * scaleX);
      const y = Math.max(0, (y1 - yOffset) * scaleY);
      const width = Math.min(originalWidth, (x2 - x1) * scaleX);
      const height = Math.min(originalHeight, (y2 - y1) * scaleY);

      if (width > 0 && height > 0) {
        return [x, y, width, height];
      }
      return null;
    })
    .filter(box => box !== null);
}

module.exports = { runModel, extractRawBoundingBoxes, adjustBoundingBoxesToOriginalSize };
