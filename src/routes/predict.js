const express = require("express");
const multer = require("multer");
const { verifyAccessToken } = require('@/src/routes/auth');
const { createJob } = require("@/src/utils/jobQueue");
const path = require('path');
const { Worker } = require('worker_threads');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Configuration for worker pool
const MAX_WORKERS = 4;  // Max number of workers in the pool
const workerPool = [];
const pendingResponses = new Map();
const jobQueue = [];

// Worker pool management
function getWorker() {
  for (let worker of workerPool) {
    if (!worker.busy) {
      worker.busy = true;
      return worker;
    }
  }

  if (workerPool.length < MAX_WORKERS) {
    const worker = new Worker(path.resolve(__dirname, "../utils/modelWorker.js"));
    workerPool.push(worker);
    worker.busy = true;

    // Add listeners for this new worker
    addWorkerListeners(worker);
    return worker;
  }

  return null;
}

function releaseWorker(worker) {
  worker.busy = false;

  // If there are pending jobs, process the next one
  if (jobQueue.length > 0) {
    const nextJob = jobQueue.shift();
    processJob(nextJob);
  }
}

function addWorkerListeners(worker) {
  worker.on("message", ({ id, result, error }) => {
    const { resolve, reject } = pendingResponses.get(id) || {};
    if (!resolve) return;

    if (error) reject(error);
    resolve(result);

    pendingResponses.delete(id);
    releaseWorker(worker);
  });

  worker.on("error", (error) => {
    console.error("Worker error:", error);
  });

  worker.on("exit", (code) => {
    console.error(`Worker exited with code ${code}`);
  });
}

// Function to send work to an available worker
function processImagePrediction(reqFileBuffer) {
  const id = uuidv4();

  return new Promise((resolve, reject) => {
    const worker = getWorker();

    if (!worker) {
      // No available workers, queue the job
      jobQueue.push({ id, buffer: reqFileBuffer, resolve, reject });
      return;
    }

    // If worker is available, process the job
    pendingResponses.set(id, { resolve, reject });
    worker.postMessage({ id, buffer: reqFileBuffer });
  });
}

function processJob(job) {
  const worker = getWorker();
  if (!worker) return; // No available workers
  
  const { id, buffer, resolve, reject } = job;
  pendingResponses.set(id, { resolve, reject });
  worker.postMessage({ id, buffer });
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
