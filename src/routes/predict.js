const express = require("express");
const multer = require("multer");
const { preprocessImage } = require("../utils/imageProcessing");
const { runModel, extractRawBoundingBoxes, adjustBoundingBoxesToOriginalSize } = require("../utils/model");

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("image"), async (req, res) => {
    console.log("Prediction request received!");
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const { tensor, originalWidth, originalHeight, paddedWidth, paddedHeight } =
            await preprocessImage(req.file.buffer, [1, 3, 800, 800]);

        console.log("Image is " + originalWidth + "x" + originalHeight)

        const outputs = await runModel(tensor);
        
        const rawBoxes = extractRawBoundingBoxes(outputs);
        const boundingBoxes = adjustBoundingBoxesToOriginalSize(rawBoxes, originalWidth, originalHeight, paddedWidth, paddedHeight);
        
        res.json({ predictions: boundingBoxes, imageSize: { width: originalWidth, height: originalHeight }});
    } catch (error) {
        console.error("Prediction error:", error);
        res.status(500).json({ error: "Error processing image" });
    }
});

module.exports = router;
