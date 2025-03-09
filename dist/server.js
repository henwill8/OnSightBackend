"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const ort = __importStar(require("onnxruntime-node"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Multer configuration: Store image in memory
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
/**
 * Preprocess image into ONNX model format
 * @param buffer - Image buffer from multer
 * @param modelInputShape - Expected shape of the model [batch, channels, height, width]
 */
function preprocessImage(buffer, modelInputShape) {
    return __awaiter(this, void 0, void 0, function* () {
        const [batch, channels, height, width] = modelInputShape;
        // Resize, convert to RGB, normalize
        const image = yield (0, sharp_1.default)(buffer)
            .resize(width, height)
            .removeAlpha()
            .toColorspace("rgb")
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
    });
}
/**
 * Handle image prediction request
 */
app.post("/predict", upload.single("image"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        // Load ONNX model
        const session = yield ort.InferenceSession.create("model.onnx");
        // Preprocess image
        const inputTensor = yield preprocessImage(req.file.buffer, [1, 3, 224, 224]);
        // Run inference
        const outputs = yield session.run({ input: inputTensor });
        res.json({ prediction: outputs });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error processing image" });
    }
}));
app.listen(5000, () => console.log("Server running on port 5000"));
