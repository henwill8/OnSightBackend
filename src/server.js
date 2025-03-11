const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const cors = require("cors");

const app = express();
app.use(cors());

// Multer configuration: Store image in memory
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Preprocess image into ONNX model format
 * @param buffer - Image buffer from multer
 * @param modelInputShape - Expected shape of the model [batch, channels, height, width]
 */
async function preprocessImage(buffer, modelInputShape) {
    const [batch, channels, height, width] = modelInputShape;

    // Get original image dimensions
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // Resize, convert to RGB, normalize
    const image = await sharp(buffer)
        .resize(width, height)
        .removeAlpha()
        .toColorspace("srgb")
        .raw()
        .toBuffer();

    let floatArray = Float32Array.from(image).map(pixel => pixel / 255.0);

    // Convert to NCHW format
    let transposed = [];
    for (let c = 0; c < channels; c++) {
        for (let i = c; i < floatArray.length; i += channels) {
            transposed.push(floatArray[i]);
        }
    }

    return { 
        tensor: new ort.Tensor("float32", new Float32Array(transposed), [batch, channels, height, width]),
        originalWidth,
        originalHeight
    };
}

const extractBoundingBoxes = (data, originalHeight, originalWidth) => {
    const confidences = data["3054"].cpuData;
    const types = data["3055"].cpuData;
    const boxes = data["3076"].cpuData;

    if (!confidences || !boxes) {
        console.error("Missing bounding box or confidence data");
        return [];
    }

    const confidenceKeys = Object.keys(confidences);

    const scaledBoundingBoxes = confidenceKeys.map((key) => {
        const confidence = confidences[key];
        const type = types[key];
        const boxStart = parseInt(key) * 4;
    
        if (confidence > 0.5 && Number(type) == 1) { // type 1 is climbing hold, type 2 is volume
            // Extract the bounding box coordinates
            const x = boxes[boxStart];
            const y = boxes[boxStart + 1];
            const w = boxes[boxStart + 2] - boxes[boxStart];
            const h = boxes[boxStart + 3] - boxes[boxStart + 1];

            const scaleX = originalWidth / 800;
            const scaleY = originalHeight / 800;
    
            console.log(x * scaleX)

            return [
                x * scaleX, // x
                y * scaleY, // y
                w * scaleX, // width
                h * scaleY  // height
            ];
        }
        return null;
    }).filter((box) => box !== null);

    return scaledBoundingBoxes;
};

/**
 * Handle image prediction request
 */
app.post("/predict", upload.single("image"), async (req, res) => {
    console.log("Received predict request!");
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        
        // Load ONNX model
        const session = await ort.InferenceSession.create("./models/model.onnx");
        
        // Get the input name (assuming there's only one input)
        const inputName = session.inputNames[0];
        
        // Preprocess image
        const { tensor: inputTensor, originalWidth, originalHeight } = await preprocessImage(req.file.buffer, [1, 3, 800, 800]);
        
        console.log("Incoming image size: " + originalWidth + "x" + originalHeight);

        const outputs = await session.run({ [inputName]: inputTensor });
        
        // Get predicted bounding boxes and scale them back to original size
        let boundingBoxes = extractBoundingBoxes(outputs, originalWidth, originalHeight);
        console.log(boundingBoxes)
        console.log("Prediction (JSON):", JSON.stringify(boundingBoxes, null, 2));
        res.json({ prediction: boundingBoxes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error processing image" });
    }
});

app.get("/", (req, res) => {
    res.json({ cats: "meow" });
});

// Catch-all route for any undefined GET requests and redirect to root
app.get("*", (req, res) => {
    res.redirect("/");
});

// Use environment variable PORT or fallback to 5000
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
