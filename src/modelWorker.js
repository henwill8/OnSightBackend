const path = require('path');
const ort = require("onnxruntime-node");
const sharp = require("sharp");
const cv = require("@techstark/opencv-js");
const { parentPort, isMainThread } = require("worker_threads");
const { MODEL_VOLUME } = require('../config');

require('dotenv').config();

// Model paths
const devModelPath = path.join(process.cwd(), './models/model.onnx');
const prodModelPath = path.join(MODEL_VOLUME, '/model.onnx');

// Constants
const MODEL_INPUT_SIZE = 1024;
const MASK_SIZE = 256;
const NUM_PREDICTIONS = 21504; // The number of preliminary detections made before NMS and filtering
const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.7;

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
 * @returns {Array} Array of polygon points for each detected segment
 */
async function detectSegments(buffer) {
  try {
    await ensureOpenCVLoaded();

    const [input, imgWidth, imgHeight] = await prepareInput(buffer);
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
 * Prepare the input tensor from image buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {Array} Array containing input tensor and original image dimensions
 */
async function prepareInput(buffer) {
  const { fileTypeFromBuffer } = await import("file-type");

  // Get MIME type using file-type library
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  let processedBuffer = buffer;

  // If the MIME type is HEIC/HEIF, we convert it to JPEG
  if (mime === "image/heic" || mime === "image/heif") {
    try {
      console.log("Detected HEIC/HEIF image. Converting to JPEG...");
      processedBuffer = await heicConvert({
        buffer,
        format: "JPEG",
        quality: 1.0,
      });
    } catch (error) {
      console.warn("HEIC conversion failed, proceeding with original buffer:", error);
    }
  }

  const rotatedBuffer = await sharp(processedBuffer).rotate().toBuffer();
  const metadata = await sharp(rotatedBuffer).metadata();
  const [imgWidth, imgHeight] = [metadata.width, metadata.height];
  
  const pixels = await img
    .removeAlpha()
    .resize({width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, fit: 'fill'})
    .raw()
    .toBuffer();

  // Split channels and normalize
  const red = [], green = [], blue = [];
  for (let i = 0; i < pixels.length; i += 3) {
    red.push(pixels[i] / 255.0);
    green.push(pixels[i+1] / 255.0);
    blue.push(pixels[i+2] / 255.0);
  }

  const input = [...red, ...green, ...blue];
  return [input, imgWidth, imgHeight];
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
 * @param {number} iouThreshold - IoU threshold for NMS
 * @param {number} confidenceThreshold - Confidence threshold for predictions
 * @returns {Array} Array of polygon points for each detected segment
 */
async function processOutput(
  output, 
  prototypeMasks, 
  imgWidth, 
  imgHeight, 
  iouThreshold = IOU_THRESHOLD, 
  confidenceThreshold = CONFIDENCE_THRESHOLD
) {
  // Collect valid bounding boxes and their mask coefficients
  const boxes = [];
  const maskCoefficients = [];

  for (let index = 0; index < NUM_PREDICTIONS; index++) {
    const prob = output[NUM_PREDICTIONS * 4 + index];
    if (prob < confidenceThreshold) continue;

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
  const keptIndices = nms(boxes, iouThreshold);
  
  // Process masks
  const results = [];
  
  for (const i of keptIndices) {
    const [x1, y1, x2, y2] = boxes[i];
    const coeffs = maskCoefficients[i];
    
    // Generate mask
    const mask = generateMaskFromCoefficients(coeffs, prototypeMasks);
    const croppedMask = cropMaskToBbox(mask, [x1, y1, x2, y2], imgWidth, imgHeight);
    
    // Process mask once and store all required data
    const processedMask = processMask(croppedMask, imgWidth, imgHeight);
    
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
 * Process a mask to extract contours and metadata
 * @param {Array} mask - Binary mask
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @param {number} [radius=1] - Radius for smoothing contour
 * @param {number} [expansionRatio=0.005] - Expansion ratio relative to image size (0.01 = 1%)
 * @returns {Object|null} Object containing mask data or null if invalid
 */
function processMask(mask, imgWidth, imgHeight, radius = 1, expansionRatio = 0.005) {
  const binaryMask = new cv.Mat(MASK_SIZE, MASK_SIZE, cv.CV_8UC1);
  for (let y = 0; y < MASK_SIZE; y++) {
    for (let x = 0; x < MASK_SIZE; x++) {
      binaryMask.ucharPtr(y, x)[0] = mask[y][x] > 0 ? 255 : 0;
    }
  }

  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  const smoothed = new cv.Mat();
  cv.morphologyEx(binaryMask, smoothed, cv.MORPH_OPEN, kernel);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(smoothed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() === 0) {
    binaryMask.delete(); smoothed.delete(); contours.delete(); hierarchy.delete();
    return null;
  }

  let maxArea = 0;
  let maxContourIndex = -1;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      maxContourIndex = i;
    }
  }

  if (maxContourIndex === -1) {
    binaryMask.delete(); smoothed.delete(); contours.delete(); hierarchy.delete();
    return null;
  }

  const maxContour = contours.get(maxContourIndex);

  const rect = cv.minAreaRect(maxContour);
  const { width, height } = rect.size;

  const rawPoints = [];
  const scaleX = imgWidth / MASK_SIZE;
  const scaleY = imgHeight / MASK_SIZE;

  for (let i = 0; i < maxContour.total(); i++) {
    const point = maxContour.intPtr(i);
    rawPoints.push({
      x: point[0] * scaleX,
      y: point[1] * scaleY
    });
  }

  const smoothedPoints = smoothContour(rawPoints);

  const centroid = rawPoints.reduce(
    (acc, pt) => ({
      x: acc.x + pt.x / smoothedPoints.length,
      y: acc.y + pt.y / smoothedPoints.length
    }),
    { x: 0, y: 0 }
  );

  const diag = Math.sqrt(imgWidth ** 2 + imgHeight ** 2);
  const pixelExpansion = diag * expansionRatio;

  const expandedPolygon = smoothedPoints.flatMap(pt => {
    const dx = pt.x - centroid.x;
    const dy = pt.y - centroid.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normX = dist > 0 ? dx / dist : 0;
    const normY = dist > 0 ? dy / dist : 0;

    return [
      pt.x + normX * pixelExpansion,
      pt.y + normY * pixelExpansion
    ];
  });

  let maskArea = 0;
  for (let y = 0; y < MASK_SIZE; y++) {
    for (let x = 0; x < MASK_SIZE; x++) {
      if (mask[y][x] > 0) {
        maskArea++;
      }
    }
  }

  const result = {
    polygon: expandedPolygon,
    area: maxArea,
    maskArea,
    aspectRatio: (width && height) ? Math.max(width / height, height / width) : 0,
    width,
    height
  };

  binaryMask.delete();
  smoothed.delete();
  contours.delete();
  hierarchy.delete();
  maxContour.delete();

  return result;
}

function smoothContour(points, radius = 2, sigma = 0.75) {
  const smoothed = [];
  const len = points.length;

  // Create Gaussian weights
  const weights = [];
  let weightSum = 0;
  for (let j = -radius; j <= radius; j++) {
    const w = Math.exp(-0.5 * (j / sigma) ** 2); // Gaussian kernel
    weights.push(w);
    weightSum += w;
  }

  for (let i = 0; i < len; i++) {
    let sumX = 0;
    let sumY = 0;

    for (let j = -radius; j <= radius; j++) {
      let idx = (i + j) % len; // Wrap around for closed contour

      while (idx < 0) idx += len;

      const weight = weights[j + radius];
      if (!points[idx]) {
        console.error(`Invalid point at index ${idx}:`, points[idx]);
        continue;
      }

      sumX += points[idx].x * weight;
      sumY += points[idx].y * weight;
    }

    smoothed.push({
      x: sumX / weightSum,
      y: sumY / weightSum,
    });
  }

  return smoothed;
}

/**
 * Filter mask based on area and aspect ratio criteria
 * @param {Object} processedMask - Processed mask data
 * @param {number} maskSize - Size of the mask
 * @param {number} maxAreaRatio - Maximum area ratio
 * @param {number} maxAspectRatio - Maximum aspect ratio
 * @param {number} minAreaRatio - Minimum area ratio
 * @returns {boolean} True if mask passes filters
 */
function filterMask(
  processedMask,
  maskSize,
  maxAreaRatio = 0.03,
  maxAspectRatio = 2.0,
  minAreaRatio = 0.01
) {
  const totalPixels = maskSize * maskSize;
  
  // Check if area is too large
  if (processedMask.maskArea / totalPixels > maxAreaRatio) {
    return false;
  }
  
  // Check if dimensions are valid
  if (processedMask.width === 0 || processedMask.height === 0) {
    return false;
  }
  
  // Apply aspect ratio filter if area is above minimum threshold
  if (processedMask.maskArea / totalPixels > minAreaRatio && 
      processedMask.aspectRatio > maxAspectRatio) {
    return false;
  }
  
  return true;
}

/**
 * Generate mask from coefficients and prototype masks
 * @param {Array} coeffs - Mask coefficients
 * @param {Array} prototypes - Prototype masks
 * @returns {Array} Generated mask
 */
function generateMaskFromCoefficients(coeffs, prototypes) {
  const mask = new Array(MASK_SIZE).fill(0).map(() => new Array(MASK_SIZE).fill(0));
  
  // Matrix multiplication equivalent
  for (let row = 0; row < MASK_SIZE; row++) {
    for (let col = 0; col < MASK_SIZE; col++) {
      let val = 0;
      for (let i = 0; i < coeffs.length; i++) {
        val += coeffs[i] * prototypes[i][row][col];
      }
      mask[row][col] = val;
    }
  }
  
  return mask;
}

/**
 * Crop mask to bounding box
 * @param {Array} mask - Input mask
 * @param {Array} bbox - Bounding box [x1, y1, x2, y2]
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @returns {Array} Cropped mask
 */
function cropMaskToBbox(mask, bbox, imgWidth, imgHeight) {
  const [x1, y1, x2, y2] = bbox;
  
  // Scale bbox to mask dimensions
  const maskX1 = Math.floor((x1 / imgWidth) * MASK_SIZE);
  const maskY1 = Math.floor((y1 / imgHeight) * MASK_SIZE);
  const maskX2 = Math.ceil((x2 / imgWidth) * MASK_SIZE);
  const maskY2 = Math.ceil((y2 / imgHeight) * MASK_SIZE);
  
  // Create a copy of the mask
  const croppedMask = new Array(MASK_SIZE).fill(0).map(() => new Array(MASK_SIZE).fill(0));
  
  // Zero out values outside the bounding box
  for (let row = 0; row < MASK_SIZE; row++) {
    for (let col = 0; col < MASK_SIZE; col++) {
      if (row >= maskY1 && row < maskY2 && col >= maskX1 && col < maskX2) {
        croppedMask[row][col] = mask[row][col] > 0 ? 1 : 0; // Threshold at 0
      }
    }
  }
  
  return croppedMask;
}

/**
 * Non-maximum suppression
 * @param {Array} boxes - Array of bounding boxes
 * @param {number} iouThreshold - IoU threshold
 * @returns {Array} Indices of kept boxes
 */
function nms(boxes, iouThreshold) {
  const scores = boxes.map(box => box[4]);
  const indices = Array.from(Array(boxes.length).keys())
    .sort((a, b) => scores[b] - scores[a]);
  
  const kept = [];
  
  while (indices.length > 0) {
    const current = indices[0];
    kept.push(current);
    
    indices.splice(0, 1); // Remove current index
    
    // Filter remaining indices
    for (let i = indices.length - 1; i >= 0; i--) {
      const idx = indices[i];
      if (iou(boxes[current], boxes[idx]) > iouThreshold) {
        indices.splice(i, 1);
      }
    }
  }
  
  return kept;
}

/**
 * Calculate IoU between two bounding boxes
 * @param {Array} box1 - First box [x1, y1, x2, y2, ...]
 * @param {Array} box2 - Second box [x1, y1, x2, y2, ...]
 * @returns {number} IoU value
 */
function iou(box1, box2) {
  const [x1, y1, x2, y2] = box1;
  const [x1b, y1b, x2b, y2b] = box2;

  const interX1 = Math.max(x1, x1b);
  const interY1 = Math.max(y1, y1b);
  const interX2 = Math.min(x2, x2b);
  const interY2 = Math.min(y2, y2b);

  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const box1Area = (x2 - x1) * (y2 - y1);
  const box2Area = (x2b - x1b) * (y2b - y1b);

  const unionArea = box1Area + box2Area - interArea;

  return interArea / unionArea;
}

/**
 * Reshape prototypes from flat array to 3D array
 * @param {Float32Array} protoData - Flat prototype data
 * @param {Array} dims - Dimensions [n, c, h, w]
 * @returns {Array} Reshaped prototypes
 */
function reshapePrototypes(protoData, [n, c, h, w]) {
  const result = [];
  for (let i = 0; i < c; i++) {
    const channel = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const index = i * h * w + y * w + x; // Skip batch dim
        row.push(protoData[index]);
      }
      channel.push(row);
    }
    result.push(channel);
  }
  return result; // shape: [32][256][256]
}

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

parentPort.on("message", async ({ id, buffer }) => {
  try {
    if (!session) {
      return parentPort.postMessage({ error: "Model not loaded yet." });
    }

    const result = await detectSegments(buffer);
    console.log("got result")
    parentPort.postMessage({ id, result });

  } catch (error) {
    console.error("Worker error:", error);
    parentPort.postMessage({ id, error: error.message });
  }
});