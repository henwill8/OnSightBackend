const fs = require('fs');
const path = require('path');
const ort = require("onnxruntime-node");

const axios = require("axios");

require('dotenv').config();

// Info to download the model file from the github repo using github lfs
const owner = 'henwill8';
const repo = 'OnSightBackend';
const filePath = 'models/model.onnx';
const token = process.env.GITHUB_TOKEN;

// File path to the model
const modelPath = path.join(process.cwd(), './models/model.onnx');

async function downloadModel() {
  try {
    // Check if the file already exists
    if (fs.existsSync(modelPath)) {
      console.log('Model file already exists at', modelPath);

      if(checkModelSize(modelPath) > 10000) {
        console.log("Model file is not big enough, replacing...");
      } else {
        // return; // Skip download if model exists and is big enough
      }
    }

    // Construct the URL to download the LFS file
    const url = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${filePath}`;

    // Fetch the LFS object metadata from GitHub's API
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    });

    // Get the download URL from the response
    const downloadUrl = response.data.download_url; // The actual LFS file URL

    // Download the LFS file with axios
    const fileResponse = await axios.get(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.raw',
      },
      responseType: 'stream', // Stream the file instead of loading it into memory
    });

    // Write the file to disk
    const writer = fs.createWriteStream(modelPath);

    // Pipe the response data (the LFS file) into a file
    fileResponse.data.pipe(writer);

    writer.on('finish', () => {
      console.log('File downloaded successfully');
    });

    writer.on('error', (err) => {
      console.error('Error downloading file', err);
    });
  } catch (error) {
    console.error('Error fetching LFS file', error);
  }
}

// Check file size before loading the model
function checkModelSize(filePath) {
  fs.stat(filePath, (err, stats) => {
    console.log("Checking file size at " + filePath)
    if (err) {
      console.log("Error checking file size: " + err);

      return 0;
    } else {
      const fileSizeInBytes = stats.size;
      console.log(`Model file size: ${fileSizeInBytes} bytes`);
      
      return fileSizeInBytes;
    }
  });
}

async function runModel(inputTensor) {
    try {
        await checkModelSize(modelPath);
        
        const session = await ort.InferenceSession.create(modelPath);
        const inputName = session.inputNames[0];
        return await session.run({ [inputName]: inputTensor });
    } catch (error) {
        console.error("Error running model:", error);
        throw error; // Re-throw to be handled by calling function
    }
}

/**
 * Extract raw bounding boxes from model output
 */
function extractRawBoundingBoxes(data) {
  const confidences = data["3054"].cpuData;
  const types = data["3055"].cpuData;
  const boxes = data["3076"].cpuData;

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

      if (confidence > 0.5 && Number(type) === 1) {
        const x1 = boxes[boxStart];
        const y1 = boxes[boxStart + 1];
        const x2 = boxes[boxStart + 2];
        const y2 = boxes[boxStart + 3];

        return { x1, y1, x2, y2 };
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

module.exports = { runModel, extractRawBoundingBoxes, adjustBoundingBoxesToOriginalSize, downloadModel };
