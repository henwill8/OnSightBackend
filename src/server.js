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

    return new ort.Tensor("float32", new Float32Array(transposed), [batch, channels, height, width]);
}

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
        
        // // Check if inputInfo exists and log it to inspect the structure
        // console.log("Input names: ", session.inputNames);
        // console.log("Input Info: ", session.inputInfo);
        
        // const inputInfo = session.inputInfo[inputName]; // Access metadata by input name
        
        // // Ensure inputInfo contains the shape property
        // if (!inputInfo || !inputInfo.shape) {
        //     return res.status(400).json({ error: "Model input shape not found" });
        // }
        
        // // Extract input shape from metadata
        // const inputShape = inputInfo.shape; // [batch, channels, height, width]
        // console.log("Input shape: ", inputShape);
        
        // Preprocess image
        const inputTensor = await preprocessImage(req.file.buffer, [1, 3, 800, 800]);
        
        function serializeBigInt(obj) {
            if (typeof obj === 'bigint') {
                return obj.toString(); // Convert BigInt to string
            } else if (typeof obj === 'object' && obj !== null) {
                // Recursively handle object properties
                const newObj = Array.isArray(obj) ? [] : {};
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        newObj[key] = serializeBigInt(obj[key]);
                    }
                }
                return newObj;
            }
            return obj;
        }
        
        const outputs = await session.run({ [inputName]: inputTensor });
        
        // Serialize outputs to replace BigInt with string
        const serializedOutputs = serializeBigInt(outputs);
        
        console.log("Prediction (JSON):", JSON.stringify(serializedOutputs, null, 2));
        res.json({ prediction: serializedOutputs });
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
