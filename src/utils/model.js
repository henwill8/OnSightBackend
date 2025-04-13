const path = require('path');
const ort = require("onnxruntime-node");
const sharp = require("sharp");
const cv = require("@techstark/opencv-js");
const { parentPort, workerData, isMainThread } = require("worker_threads");
const { MODEL_VOLUME } = require('../../config');

require('dotenv').config();

// File path to the object detection model
const devModelPath = path.join(process.cwd(), './models/model.onnx');
const prodModelPath = path.join(MODEL_VOLUME, '/model.onnx');

async function detectSegments(buffer) {
  try {
    const [input,img_width,img_height] = await prepare_input(buffer);
    const output = await run_model(input)
    const prototypes = reshapePrototypes(output[1].data, output[1].dims);

    return await process_output(output[0].data, prototypes, img_width, img_height);
  } catch (error) {
    console.error("Error running model:", error);
    throw error;
  }
}

async function prepare_input(buffer) {
  const img = sharp(buffer);
  const md = await img.metadata();
  const [img_width,img_height] = [md.width, md.height];
  const pixels = await img.removeAlpha()
      .resize({width:1024,height:1024,fit:'fill'})
      .raw()
      .toBuffer();

  const red = [], green = [], blue = [];
  for (let index=0; index<pixels.length; index+=3) {
      red.push(pixels[index]/255.0);
      green.push(pixels[index+1]/255.0);
      blue.push(pixels[index+2]/255.0);
  }

  const input = [...red, ...green, ...blue];
  return [input, img_width, img_height];
}

async function run_model(input) {
  const modelPath = process.env.NODE_ENV == "development" ? devModelPath : prodModelPath;
  const model = await ort.InferenceSession.create(modelPath);

  input = new ort.Tensor(Float32Array.from(input),[1, 3, 1024, 1024]);
  const inputName = model.inputNames[0];

  const outputs = await model.run({ [inputName]: input });
  return [outputs["output0"], outputs["output1"]];
}

// https://dev.to/andreygermanov/how-to-create-yolov8-based-object-detection-web-service-using-python-julia-nodejs-javascript-go-and-rust-4o8e
// This link explains how this works (the output tensor shapes are (1, 37, 21504), (1, 32, 256, 256), first is the actual prototype predictions, second are the prototype masks used to recreate the masks (its a form of compression))
async function process_output(output, prototypeMasks, img_width, img_height, iouThreshold = 0.7, confidenceThreshold = 0.25) {
  // First collect all valid bounding boxes
  let boxes = [];
  let maskCoefficients = [];

  for (let index = 0; index < 21504; index++) {
    const prob = output[21504 * 4 + index];
    if (prob < confidenceThreshold) continue;

    const xc = output[index];
    const yc = output[21504 + index];
    const w = output[2 * 21504 + index];
    const h = output[3 * 21504 + index];

    const x1 = (xc - w / 2) / 1024 * img_width;
    const y1 = (yc - h / 2) / 1024 * img_height;
    const x2 = (xc + w / 2) / 1024 * img_width;
    const y2 = (yc + h / 2) / 1024 * img_height;

    // Store the mask coefficients for this box
    const coeffs = [];
    for (let j = 5; j < 37; j++) {
      coeffs.push(output[j * 21504 + index]);
    }

    boxes.push([x1, y1, x2, y2, prob, index]);
    maskCoefficients.push(coeffs);
  }

  // Apply NMS
  const keptIndices = nms(boxes, iouThreshold);
  
  // Process only the kept boxes
  const results = [];
  for (const i of keptIndices) {
    const [x1, y1, x2, y2, prob, index] = boxes[i];
    const coeffs = maskCoefficients[i];
    
    // Generate mask using matrix multiplication (similar to masks_in @ protos)
    const mask = generateMaskFromCoefficients(coeffs, prototypeMasks);
    
    // Crop mask to bounding box
    const croppedMask = cropMaskToBbox(mask, [x1, y1, x2, y2], img_width, img_height);
    
    // Convert mask to polygon
    const polygon = maskToPolygon(croppedMask, img_width, img_height);
    
    results.push(polygon);
  }

  return results;
}

function generateMaskFromCoefficients(coeffs, prototypes) {
  // Matrix multiplication equivalent: coeffs @ prototypes
  const maskHeight = 256;
  const maskWidth = 256;
  const mask = new Array(maskHeight).fill(0).map(() => new Array(maskWidth).fill(0));
  
  for (let row = 0; row < maskHeight; row++) {
    for (let col = 0; col < maskWidth; col++) {
      let val = 0;
      for (let i = 0; i < coeffs.length; i++) {
        val += coeffs[i] * prototypes[i][row][col];
      }
      mask[row][col] = val;
    }
  }
  
  return mask;
}

function cropMaskToBbox(mask, bbox, img_width, img_height) {
  const [x1, y1, x2, y2] = bbox;
  const maskHeight = mask.length;
  const maskWidth = mask[0].length;
  
  // Scale bbox to mask dimensions
  const mask_x1 = Math.floor((x1 / img_width) * maskWidth);
  const mask_y1 = Math.floor((y1 / img_height) * maskHeight);
  const mask_x2 = Math.ceil((x2 / img_width) * maskWidth);
  const mask_y2 = Math.ceil((y2 / img_height) * maskHeight);
  
  // Create a copy of the mask
  const croppedMask = new Array(maskHeight).fill(0).map(() => new Array(maskWidth).fill(0));
  
  // Zero out values outside the bounding box
  for (let row = 0; row < maskHeight; row++) {
    for (let col = 0; col < maskWidth; col++) {
      if (row >= mask_y1 && row < mask_y2 && col >= mask_x1 && col < mask_x2) {
        croppedMask[row][col] = mask[row][col] > 0 ? 1 : 0; // Simple threshold at 0
      }
    }
  }
  
  return croppedMask;
}

function maskToPolygon(mask, img_width, img_height) {
  const maskHeight = mask.length;
  const maskWidth = mask[0].length;
  
  // Convert mask to OpenCV Mat format
  const binaryMask = new cv.Mat(maskHeight, maskWidth, cv.CV_8UC1);
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      binaryMask.ucharPtr(y, x)[0] = mask[y][x] > 0 ? 255 : 0;
    }
  }
  
  // Find contours
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binaryMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  // Get largest contour
  let maxArea = 0;
  let maxContour = null;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      maxContour = cnt;
    }
  }
  
  const polygon = [];
  if (maxContour) {
    // Convert contour points to image coordinates
    for (let i = 0; i < maxContour.data32S.length; i += 2) {
      const x = maxContour.data32S[i] / maskWidth * img_width;
      const y = maxContour.data32S[i + 1] / maskHeight * img_height;
      polygon.push(x, y);
    }
  }
  
  // Clean up
  binaryMask.delete();
  contours.delete();
  hierarchy.delete();
  maxContour?.delete?.();
  
  return polygon;
}

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

if (!isMainThread && parentPort) {
  parentPort.on("message", async (message) => {
    const result = await detectSegments(message.buffer);
    parentPort.postMessage(result);
  });
}