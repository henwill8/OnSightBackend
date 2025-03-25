const express = require("express");
const multer = require("multer");
const { verifyAccessToken } = require('@/src/routes/auth');
const { preprocessImage } = require("@/src/utils/imageProcessing");
const { runModel, extractRawBoundingBoxes, adjustBoundingBoxesToOriginalSize } = require("@/src/utils/model");
const { createJob, getJobStatus } = require("@/src/utils/jobQueue");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Function to handle the image processing and predictions
async function processImagePrediction(reqFileBuffer) {
  try {
    const { tensor, originalWidth, originalHeight, paddedWidth, paddedHeight } =
      await preprocessImage(reqFileBuffer, [1, 3, 800, 800]);

    console.log("Image is " + originalWidth + "x" + originalHeight);

    const outputs = await runModel(tensor);
    
    const rawBoxes = extractRawBoundingBoxes(outputs);
    const boundingBoxes = adjustBoundingBoxesToOriginalSize(rawBoxes, originalWidth, originalHeight, paddedWidth, paddedHeight);

    console.log("Made " + boundingBoxes.length + " predictions!");

    return { predictions: boundingBoxes, imageSize: { width: originalWidth, height: originalHeight }};
  } catch (error) {
    console.error("Prediction error:", error);
    throw new Error(error.message);
  }
}

router.post("/predict", verifyAccessToken, upload.single("image"), async (req, res) => {
  console.log("Prediction request received!");
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Create a job for image processing and prediction
    const jobId = createJob(() => processImagePrediction(req.file.buffer));

    console.log("response")
    // Respond to the user with the job ID to track progress
    res.json({ jobId });

  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({ error: "Error processing image" });
  }
});

module.exports = router;
