const path = require('path');
const ort = require("onnxruntime-node");
const onnx = require("onnxjs");
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

function reshapePrototypes(data, dims) {
  const [n, c, h, w] = dims;
  if (n !== 1) throw new Error("Only batch size of 1 is supported for prototypes.");

  const reshaped = new Array(c);
  let idx = 0;

  for (let i = 0; i < c; i++) {
    reshaped[i] = new Array(h);
    for (let j = 0; j < h; j++) {
      reshaped[i][j] = new Array(w);
      for (let k = 0; k < w; k++) {
        reshaped[i][j][k] = data[idx++];
      }
    }
  }

  return {
    data: reshaped,
    shape: [c, h, w]
  };
}

// https://dev.to/andreygermanov/how-to-create-yolov8-based-object-detection-web-service-using-python-julia-nodejs-javascript-go-and-rust-4o8e
// This link explains how this works (the output tensor shapes are (1, 37, 21504), (1, 32, 256, 256), first is the actual prototype predictions, second are the prototype masks used to recreate the masks (its a form of compression))
async function process_output(output, prototypeMasks, img_width, img_height, iouThreshold = 0.7, confidenceThreshold = 0.25) {
  const numAnchors = 21504;
  const maskDim = output.length / numAnchors - 4; // assuming 4 box coords + 1 score + mask dims

  let preds = [];

  for (let index = 0; index < numAnchors; index++) {
    const prob = output[4 * numAnchors + index];
    if (prob < confidenceThreshold) continue;

    const xc = output[index];
    const yc = output[numAnchors + index];
    const w = output[2 * numAnchors + index];
    const h = output[3 * numAnchors + index];

    const x1 = (xc - w / 2) / 1024 * img_width;
    const y1 = (yc - h / 2) / 1024 * img_height;
    const x2 = (xc + w / 2) / 1024 * img_width;
    const y2 = (yc + h / 2) / 1024 * img_height;

    // Extract mask vector
    const maskVecStart = 5 * numAnchors + index;
    const maskVector = [];
    for (let j = 0; j < maskDim; j++) {
      maskVector.push(output[maskVecStart + j * numAnchors]);
    }

    preds.push([x1, y1, x2, y2, prob, 0, ...maskVector]); // 0 as dummy class ID
  }

  const kept = nms(preds, iouThreshold);

  // Filter out non-kept preds
  const filteredPreds = preds.filter(pred => kept.includes(pred));

  // Construct final result
  const imgShape = [1, 3, 1024, 1024];

  const rawResult = await constructResult(filteredPreds, { shape: imgShape }, prototypeMasks);

  // Convert bounding boxes to polygons (as [x1, y1, x2, y1, x2, y2, x1, y2])
  const boxPolygons = rawResult.boxes.map(([x1, y1, x2, y2]) => [
    x1, y1,
    x2, y1,
    x2, y2,
    x1, y2
  ]);

  // Convert masks to polygon coordinates
  const maskPolygons = rawResult.masks.map(mask => {
    const polys = maskToPolygons(mask);
    const largestPoly = polys.reduce((a, b) => (b.length > a.length ? b : a), []);
  
    // Scale the coordinates from 256x256 to original image size
    return largestPoly.map((val, idx) =>
      idx % 2 === 0 ? val * (img_width / 256) : val * (img_height / 256)
    );
  });

  const results = [];
  for (let i = 0; i < boxPolygons.length; i++) {
    results.push(boxPolygons[i])
    results.push(maskPolygons[i])
  }

  console.log(results)

  return results;
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

async function constructResult(pred, img, proto) {
  const predArr = pred; // assuming pred is already a JS array or Float32Array
  const imgShape = img.shape; // [batch, channels, height, width]

  // Separate bounding boxes, scores/classes, and mask vectors
  const boxes = predArr.map(row => row.slice(0, 4));
  const scoresAndClasses = predArr.map(row => row.slice(4, 6));
  const maskVectors = predArr.map(row => row.slice(6));

  // Process masks
  let masks = await processMask(proto, maskVectors, boxes, [imgShape[2], imgShape[3]], true);

  // Keep only masks that aren't empty
  const keptIndices = [];
  const updatedMasks = [];
  const updatedBoxes = [];

  for (let i = 0; i < masks.length; i++) {
    const sum = masks[i].flat().reduce((a, b) => a + b, 0);
    if (sum > 0) {
      keptIndices.push(i);
      updatedMasks.push(masks[i]);
      updatedBoxes.push([...boxes[i], ...scoresAndClasses[i]]);
    }
  }

  return {
    boxes: updatedBoxes,
    masks: updatedMasks,
  };
}

function maskToPolygons(mask) {
  const rows = mask.length;
  const cols = mask[0].length;

  const mat = cv.matFromArray(rows, cols, cv.CV_8UC1, mask.flat().map(v => v ? 255 : 0));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const polygons = [];
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const poly = [];
    for (let j = 0; j < contour.data32S.length; j += 2) {
      poly.push(contour.data32S[j], contour.data32S[j + 1]);
    }
    if (poly.length >= 6) polygons.push(poly); // Minimum 3 points
  }

  mat.delete();
  contours.delete();
  hierarchy.delete();

  return polygons;
}

async function processMask(protos, masksIn, bboxes, shape) {
  const [c, mh, mw] = protos.shape;
  const [ih, iw] = shape;

  const masks = [];

  for (let i = 0; i < masksIn.length; i++) {
    const maskVec = masksIn[i];
    const mask2D = [];

    for (let y = 0; y < mh; y++) {
      const row = [];
      for (let x = 0; x < mw; x++) {
        let val = 0;
        for (let k = 0; k < c; k++) {
          val += maskVec[k] * protos.data[k][y][x];
        }
        row.push(val);
      }
      mask2D.push(row);
    }

    const binaryMask = mask2D.map(row =>
      row.map(v => 1 / (1 + Math.exp(-v)) > 0.5 ? 1 : 0)
    );

    masks.push(binaryMask);
  }

  return masks;
}

if (!isMainThread && parentPort) {
  parentPort.on("message", async (message) => {
    const result = await detectSegments(message.buffer);
    parentPort.postMessage(result);
  });
}