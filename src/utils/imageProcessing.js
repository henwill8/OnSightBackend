// Importing necessary libraries
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const heicConvert = require("heic-convert");

/**
 * Preprocess image into ONNX model format
 * @param buffer - Image buffer from multer
 * @param modelInputShape - Expected shape of the model [batch, channels, height, width]
 */
async function preprocessImage(buffer, modelInputShape) {
    const [batch, channels] = modelInputShape;

    console.log("Preprocessing the image");

    // Dynamically import file-type
    const { fileTypeFromBuffer } = await import("file-type");

    // Get MIME type using file-type library
    const { ext, mime } = await fileTypeFromBuffer(buffer);
    let processedBuffer = buffer;

    // If the MIME type is HEIC/HEIF, we convert it to JPEG
    if (mime === "image/heic" || mime === "image/heif") {
        try {
            console.log("Detected HEIC/HEIF image. Converting to JPEG...");
            processedBuffer = await heicConvert({
                buffer,
                format: "JPEG",
                quality: 1,
            });
        } catch (error) {
            console.warn("HEIC conversion failed, proceeding with original buffer:", error);
        }
    } else {
        console.log("Mime type is not HEIC/HEIF, proceeding with original buffer");
    }

    // Get original image dimensions
    const rotatedBuffer = await sharp(processedBuffer).rotate().toBuffer();
    const metadata = await sharp(rotatedBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    // Resize the image and add padding
    const image = await sharp(rotatedBuffer)
        .removeAlpha()
        .toColorspace("srgb")
        .raw()
        .toBuffer();

    // Convert the image to a float array
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
        imageWidth: width,
        imageHeight: height
    };
}

module.exports = { preprocessImage };
