const path = require('path');
const ort = require("onnxruntime-node");
const { parentPort } = require("worker_threads");
const { MODEL_VOLUME } = require('../../config');
const cv = require("@techstark/opencv-js");
const { prepareInput } = require('../utils/imageProcessor');
const { nms } = require('../utils/postProcessingUtils');
const { 
  reshapePrototypes,
  generateMaskFromCoefficients,
  cropMaskToBbox,
  filterMask,
  processMask
} = require('../utils/maskUtils');

require('dotenv').config();

// Model paths
const devModelPath = path.join(process.cwd(), './models/model.onnx');
const prodModelPath = path.join(MODEL_VOLUME, '/model.onnx');

// Constants
const MODEL_INPUT_SIZE = 1024;
const MASK_SIZE = 256;
const NUM_PREDICTIONS = 21504; // The number of preliminary detections made before NMS and filtering
const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.5;

// Load model once per worker lifetime
let session;

(async () => {
  const modelPath = process.env.NODE_ENV === "development" ? devModelPath : prodModelPath;
  session = await ort.InferenceSession.create(modelPath);

  console.log("ONNX model loaded in worker.");
})();

/**
 * Main function to detect segments in an image
 * @param {Buffer} buffer - Image buffer
 * @returns {Object} Object containing predictions and image size
 */
async function detectSegments(buffer) {
  try {
    await ensureOpenCVLoaded();

    const [input, imgWidth, imgHeight] = await prepareInput(buffer, MODEL_INPUT_SIZE);
    const output = await runModel(input);
    const prototypes = reshapePrototypes(output[1].data, output[1].dims); // 32 prototype masks are added together according to the prediction's mask weights

    const segments = await processOutput(output[0].data, prototypes, imgWidth, imgHeight);
    return { predictions: segments, imageSize: { width: imgWidth, height: imgHeight }}
  } catch (error) {
    console.error("Error running model:", error);
    throw error;
  }
}

/**
 * Run the ONNX model inference
 * @param {Array} input - Preprocessed input tensor
 * @returns {Array} Model output tensors
 */
async function runModel(input) {
  const inputTensor = new ort.Tensor(
    Float32Array.from(input),
    [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]
  );
  const inputName = session.inputNames[0];

  const outputs = await session.run({ [inputName]: inputTensor });
  return [outputs["output0"], outputs["output1"]];
}

/**
 * Process model outputs to generate segmentation masks
 * @param {Float32Array} output - Model output data
 * @param {Array} prototypeMasks - Prototype masks for reconstruction
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @returns {Array} Array of polygon points for each detected segment
 */
async function processOutput(
  output, 
  prototypeMasks, 
  imgWidth, 
  imgHeight
) {
  // Collect valid bounding boxes and their mask coefficients
  const boxes = [];
  const maskCoefficients = [];

  for (let index = 0; index < NUM_PREDICTIONS; index++) {
    const prob = output[NUM_PREDICTIONS * 4 + index];
    if (prob < CONFIDENCE_THRESHOLD) continue;

    // Extract box coordinates
    const xc = output[index];
    const yc = output[NUM_PREDICTIONS + index];
    const w = output[2 * NUM_PREDICTIONS + index];
    const h = output[3 * NUM_PREDICTIONS + index];

    // Convert to image coordinates
    const x1 = (xc - w / 2) / MODEL_INPUT_SIZE * imgWidth;
    const y1 = (yc - h / 2) / MODEL_INPUT_SIZE * imgHeight;
    const x2 = (xc + w / 2) / MODEL_INPUT_SIZE * imgWidth;
    const y2 = (yc + h / 2) / MODEL_INPUT_SIZE * imgHeight;

    // Extract mask coefficients
    const coeffs = [];
    for (let j = 5; j < 37; j++) {
      coeffs.push(output[j * NUM_PREDICTIONS + index]);
    }

    boxes.push([x1, y1, x2, y2, prob, index]);
    maskCoefficients.push(coeffs);
  }

  // Apply NMS
  const keptIndices = nms(boxes, IOU_THRESHOLD);
  
  // Process masks
  const results = [];
  
  for (const i of keptIndices) {
    const [x1, y1, x2, y2] = boxes[i];
    const coeffs = maskCoefficients[i];
    
    // Generate mask
    const mask = generateMaskFromCoefficients(coeffs, prototypeMasks, MASK_SIZE);
    const croppedMask = cropMaskToBbox(mask, [x1, y1, x2, y2], imgWidth, imgHeight, MASK_SIZE);
    
    // Process mask once and store all required data
    const processedMask = processMask(croppedMask, imgWidth, imgHeight, MASK_SIZE);
    
    // Skip invalid masks
    if (!processedMask) continue;
    
    // Check if mask passes area and aspect ratio filters
    if (!filterMask(processedMask, MASK_SIZE)) continue;
    
    // Add polygon points to results
    results.push(processedMask.polygon);
  }

  return results;
}

/**
 * Ensure OpenCV is loaded and ready
 * @returns {Promise} Promise that resolves when OpenCV is ready
 */
function ensureOpenCVLoaded() {
  return new Promise((resolve) => {
    if (cv && cv.Mat) {
      resolve();
    } else {
      // If using the browser version that has onRuntimeInitialized
      if (cv.onRuntimeInitialized) {
        cv.onRuntimeInitialized = () => resolve();
      } else {
        // For Node.js, we might need to wait a bit
        setTimeout(resolve, 500);
      }
    }
  });
}

// Handle messages from parent thread
parentPort.on("message", async ({ id, buffer }) => {
  try {
    if (!session) {
      return parentPort.postMessage({ error: "Model not loaded yet." });
    }

    const result = await detectSegments(buffer);
    parentPort.postMessage({ id, result });

  } catch (error) {
    console.error("Worker error:", error);
    parentPort.postMessage({ id, error: error.message });
  }
});