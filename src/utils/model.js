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
function process_output(output, prototypeMasks, img_width, img_height, iouThreshold = 0.7, confidenceThreshold = 0.25) {
  let boxes = [];

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

    boxes.push([x1, y1, x2, y2, prob, index]);
  }

  // Apply NMS
  const kept = nms(boxes, iouThreshold); // use a version that returns indices

  // Generate masks and extract polygons
  let result = boxes.map(([x1, y1, x2, y2, prob, index]) => {
    const maskVector = [];
    for (let j = 5; j < 37; j++) {
      maskVector.push(output[j * 21504 + index]);
    }
    const mask = generateMaskFromVector(maskVector, prototypeMasks); // returns [256][256] mask

    // Threshold the mask
    const binaryMask = new cv.Mat(256, 256, cv.CV_8UC1);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        binaryMask.ucharPtr(y, x)[0] = mask[y][x] > 0.5 ? 1 : 0;
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
      for (let i = 0; i < maxContour.data32S.length; i += 2) {
        const x = maxContour.data32S[i] / 256 * img_width;
        const y = maxContour.data32S[i + 1] / 256 * img_height;
        polygon.push(x, y);
      }
    }

    // Clean up
    binaryMask.delete();
    contours.delete();
    hierarchy.delete();
    maxContour?.delete?.();

    return polygon;
  });

  for (const [x1, y1, x2, y2] of kept) {
    const polygon = [
      x1, y1, // top-left
      x2, y1, // top-right
      x2, y2, // bottom-right
      x1, y2  // bottom-left
    ];
    result.push(polygon);
  }

  return result;
}

/**
 * Generates a mask from the mask vector by combining it with the prototype masks.
 */
function generateMaskFromVector(maskVector, prototypes) {
  const maskHeight = 256;
  const maskWidth = 256;

  // Create an empty mask
  let mask = new Array(maskHeight).fill(0).map(() => new Array(maskWidth).fill(0));

  // Weighted sum of prototype masks
  for (let i = 0; i < prototypes.length; i++) {
    for (let row = 0; row < maskHeight; row++) {
      for (let col = 0; col < maskWidth; col++) {
        mask[row][col] += prototypes[i][row][col] * maskVector[i];
      }
    }
  }

  // Apply sigmoid activation and threshold to make binary mask
  const threshold = 0.5;  // Threshold for binary classification
  for (let row = 0; row < maskHeight; row++) {
    for (let col = 0; col < maskWidth; col++) {
      const val = mask[row][col];
      const sigmoidVal = 1 / (1 + Math.exp(-val)); // Sigmoid activation
      mask[row][col] = sigmoidVal;
    }
  }

  return mask;
}

function nms(boxes, iouThreshold) {
  boxes = boxes.sort((box1, box2) => box2[4] - box1[4]); // Sort by probability
  const result = [];

  while (boxes.length > 0) {
    const currentBox = boxes[0];
    result.push(currentBox); // Add the highest probability box to the result
    boxes = boxes.slice(1);  // Remove the selected box

    // Filter out boxes with high IoU overlap with the current box
    boxes = boxes.filter(box => iou(currentBox, box) < iouThreshold);
  }

  return result;
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