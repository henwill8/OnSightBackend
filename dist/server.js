"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// // Multer configuration: Store image in memory
// const upload = multer({ storage: multer.memoryStorage() });
// /**
//  * Preprocess image into ONNX model format
//  * @param buffer - Image buffer from multer
//  * @param modelInputShape - Expected shape of the model [batch, channels, height, width]
//  */
// async function preprocessImage(buffer: Buffer, modelInputShape: number[]): Promise<ort.Tensor> {
//     const [batch, channels, height, width] = modelInputShape;
//     // Resize, convert to RGB, normalize
//     const image = await sharp(buffer)
//         .resize(width, height)
//         .removeAlpha()
//         .toColorspace("rgb")
//         .raw()
//         .toBuffer();
//     let floatArray = Float32Array.from(image).map(pixel => pixel / 255.0);
//     // Convert to NCHW format
//     let transposed: number[] = [];
//     for (let c = 0; c < channels; c++) {
//         for (let i = c; i < floatArray.length; i += channels) {
//             transposed.push(floatArray[i]);
//         }
//     }
//     return new ort.Tensor("float32", new Float32Array(transposed), [batch, channels, height, width]);
// }
// /**
//  * Handle image prediction request
//  */
// app.post("/predict", upload.single("image"), async (req: Request, res: Response): Promise<any> => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({ error: "No file uploaded" });
//         }
//         // Load ONNX model
//         const session = await ort.InferenceSession.create("model.onnx");
//         // Preprocess image
//         const inputTensor = await preprocessImage(req.file.buffer, [1, 3, 224, 224]);
//         // Run inference
//         const outputs = await session.run({ input: inputTensor });
//         res.json({ prediction: outputs });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: "Error processing image" });
//     }
// });
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
