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
function extractCoordinates(data) {
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
        const x_min = boxes[boxStart];
        const y_min = boxes[boxStart + 1];
        const x_max = boxes[boxStart + 2];
        const y_max = boxes[boxStart + 3];

        // Convert to polygon format (x1, y1, x2, y2, x3, y3...) for better compatibility with object segmentation models
        return [
          x_min, y_min,
          x_max, y_min,
          x_max, y_max,
          x_min, y_max
        ];
      }
      return null;
    })
    .filter(box => box !== null);
}

module.exports = { runModel, extractCoordinates };
