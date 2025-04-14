const express = require("express");
const multer = require("multer");
const { verifyAccessToken } = require('@/src/routes/auth');
const { createJob, getJobStatus } = require("@/src/utils/jobQueue");
const path = require('path');
const { Worker } = require('worker_threads');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Function to handle the image processing and predictions
async function processImagePrediction(reqFileBuffer) {
  // Create a separate worker for the model so that it doesnt block the server from processing new requests
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve(__dirname, "../utils/modelWorker.js"));

    worker.postMessage({ buffer: reqFileBuffer });

    worker.on("message", (result) => {
      console.log(`Created ${result.predictions.length} segments`)

      resolve(result);
      worker.terminate();
    });

    worker.on("error", (error) => {
      reject(error);
      worker.terminate();
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

router.post("/predict", verifyAccessToken, upload.single("image"), async (req, res) => {
  console.log("Prediction request received!");
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Create a job for image processing and prediction
    const jobId = createJob(() => processImagePrediction(req.file.buffer));

    // Respond to the user with the job ID to track progress
    res.json({ jobId });

  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({ error: "Error processing image" });
  }
});

module.exports = router;
