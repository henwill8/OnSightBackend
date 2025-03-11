const sharp = require("sharp");
const ort = require("onnxruntime-node");

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

    // Resize while maintaining aspect ratio and padding
    const aspectRatio = originalWidth / originalHeight;
    let resizeWidth, resizeHeight;

    if (aspectRatio > 1) {
        // Landscape image
        resizeWidth = width;
        resizeHeight = Math.round(width / aspectRatio);
    } else {
        // Portrait or square image
        resizeWidth = Math.round(height * aspectRatio);
        resizeHeight = height;
    }

    // Resize the image and add padding to make it 800x800
    const image = await sharp(buffer)
        .resize(resizeWidth, resizeHeight)
        .extend({
            top: Math.floor((height - resizeHeight) / 2),
            bottom: Math.ceil((height - resizeHeight) / 2),
            left: Math.floor((width - resizeWidth) / 2),
            right: Math.ceil((width - resizeWidth) / 2),
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
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
        originalHeight,
        paddedWidth: resizeWidth,
        paddedHeight: resizeHeight
    };
}

module.exports = { preprocessImage };
