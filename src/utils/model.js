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
  // Extract confidence, types, and bounding box data
  const confidences = data["value"].cpuData;
  const types = data["value.3"].cpuData; // Assuming types are in "value.3"
  const boxes = data["boxes.27"].cpuData; // Bounding box data from 'boxes.27'

  if (!confidences || !boxes || !types) {
    console.error("Missing bounding box, confidence, or type data");
    return [];
  }

  // Example of how data is structured; we assume that the boxes are in a 1D array (flat structure).
  const boxCount = boxes.length / 4; // Assuming each box has 4 elements: [x1, y1, x2, y2]

  // Loop through each bounding box
  const boundingBoxes = [];
  for (let i = 0; i < boxCount; i++) {
    const confidence = confidences[i];
    const type = types[i]; // Assuming types are indexed similarly to the bounding boxes
    const boxStart = i * 4;

    // Check if confidence is above threshold and the type is the class you're interested in (e.g., 1 for climbing holds)
    if (confidence >= 0.25) {
      const x1 = boxes[boxStart];
      const y1 = boxes[boxStart + 1];
      const x2 = boxes[boxStart + 2];
      const y2 = boxes[boxStart + 3];

      boundingBoxes.push({ x1, y1, x2, y2 });
    }
  }

  return boundingBoxes;
}

/**
 * Adjust bounding boxes to match original image size
 */
function adjustBoundingBoxesToOriginalSize(rawBoxes, originalWidth, originalHeight, paddedWidth, paddedHeight) {
  const scaleX = originalWidth / paddedWidth;
  const scaleY = originalHeight / paddedHeight;

  const xOffset = (800 - paddedWidth) / 2;
  const yOffset = (800 - paddedHeight) / 2;

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
