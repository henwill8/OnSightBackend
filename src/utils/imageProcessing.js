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
    const [batch, channels, height, width] = modelInputShape;

    console.log("Preprocessing the image");

    // Dynamically import file-type
    const { fileTypeFromBuffer } = await import("file-type");

    // Get MIME type using file-type library
    const { ext, mime } = await fileTypeFromBuffer(buffer);
    let processedBuffer = buffer;

    // If the MIME type is HEIC/HEIF, convert it to JPEG
    if (mime === "image/heic" || mime === "image/heif") {
        try {
            console.log("Detected HEIC/HEIF image. Converting to JPEG...");
            processedBuffer = await heicConvert({
                buffer,
                format: "JPEG",
                quality: 0.9,
            });
        } catch (error) {
            console.warn("HEIC conversion failed, proceeding with original buffer:", error);
        }
    } else {
        console.log("Mime type is not HEIC/HEIF, proceeding with original buffer");
    }

    // Auto-rotate image based on EXIF
    const rotatedBuffer = await sharp(processedBuffer).rotate().removeAlpha().toBuffer();
    const metadata = await sharp(rotatedBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // Resize while maintaining aspect ratio and padding to square
    const aspectRatio = originalWidth / originalHeight;
    let resizeWidth, resizeHeight;

    if (aspectRatio > 1) {
        resizeWidth = width;
        resizeHeight = Math.round(width / aspectRatio);
    } else {
        resizeWidth = Math.round(height * aspectRatio);
        resizeHeight = height;
    }

    const padTop = Math.floor((height - resizeHeight) / 2);
    const padBottom = Math.ceil((height - resizeHeight) / 2);
    const padLeft = Math.floor((width - resizeWidth) / 2);
    const padRight = Math.ceil((width - resizeWidth) / 2);

    // Resize and letterbox (pad) the image
    const image = await sharp(rotatedBuffer)
        .resize(resizeWidth, resizeHeight)
        .extend({
            top: padTop,
            bottom: padBottom,
            left: padLeft,
            right: padRight,
            background: { r: 114, g: 114, b: 114, alpha: 1 }  // Match FastSAM/Yolo padding
        })
        .toColorspace("srgb")
        .raw()
        .toBuffer();

    // Normalize to 0–1
    const floatArray = Float32Array.from(image).map(pixel => pixel / 255.0);

    const transposed = [];
    for (let c = 0; c < channels; c++) {
        for (let i = c; i < floatArray.length; i += channels) {
            transposed.push(floatArray[i]);
        }
    }

    console.log(batch, channels, height, width)

    return {
        tensor: new ort.Tensor("float32", new Float32Array(transposed), [batch, channels, height, width]),
        originalWidth,
        originalHeight,
        resizeWidth,
        resizeHeight,
        padTop,
        padLeft
    };
}

/**
 * Rescale FastSAM mask to original image dimensions.
 * 
 * @param {Float32Array | Uint8Array} mask - A single-channel mask of shape [H, W] or raw tensor data.
 * @param {number} modelSize - The size (height/width) of the square input (e.g., 1024).
 * @param {number} resizeWidth - Width after resizing but before padding.
 * @param {number} resizeHeight - Height after resizing but before padding.
 * @param {number} originalWidth - Width of the original image.
 * @param {number} originalHeight - Height of the original image.
 * @param {number} padLeft - Left padding in the preprocessed image.
 * @param {number} padTop - Top padding in the preprocessed image.
 * @returns {Promise<Buffer>} - A buffer containing the resized mask as a grayscale PNG.
 */
async function postprocessMask(
    mask,
    modelSize,
    resizeWidth,
    resizeHeight,
    originalWidth,
    originalHeight,
    padLeft,
    padTop
) {
    const maskWidth = Math.sqrt(mask.length);
    const maskHeight = maskWidth;

    // Convert mask to Uint8 grayscale buffer (thresholded or scaled 0–255)
    const maskBuffer = Uint8Array.from(mask, val => Math.round(val * 255));

    // Step 1: Create base grayscale image from mask
    let sharpMask = sharp(Buffer.from(maskBuffer), {
        raw: {
            width: maskWidth,
            height: maskHeight,
            channels: 1,
        },
    });

    // Step 2: Remove padding by cropping
    const cropLeft = Math.floor(padLeft * (maskWidth / modelSize));
    const cropTop = Math.floor(padTop * (maskHeight / modelSize));
    const cropRight = Math.floor((modelSize - padLeft - resizeWidth) * (maskWidth / modelSize));
    const cropBottom = Math.floor((modelSize - padTop - resizeHeight) * (maskHeight / modelSize));

    sharpMask = sharpMask.extract({
        left: cropLeft,
        top: cropTop,
        width: maskWidth - cropLeft - cropRight,
        height: maskHeight - cropTop - cropBottom,
    });

    // Step 3: Resize to original image dimensions
    sharpMask = sharpMask.resize(originalWidth, originalHeight, {
        kernel: sharp.kernel.nearest, // prevent interpolation artifacts
    });

    // Step 4: Output as a grayscale PNG buffer (can also return raw pixels if needed)
    return sharpMask.png().toBuffer();
}

module.exports = { preprocessImage, postprocessMask };
