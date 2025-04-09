const path = require('path');
const ort = require("onnxruntime-node");
const { MODEL_VOLUME } = require('@/config');

require('dotenv').config();

// File path to the object detection model
const devModelPath = path.join(process.cwd(), './models/model.onnx');
const prodModelPath = path.join(MODEL_VOLUME, '/model.onnx');

async function runModel(inputTensor) {
  try {
    const modelPath = process.env.NODE_ENV == "development" ? devModelPath : prodModelPath;

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
