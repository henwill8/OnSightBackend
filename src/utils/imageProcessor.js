const sharp = require("sharp");
const heicConvert = require("heic-convert");

/**
 * Prepare the input tensor from image buffer
 * @param {Buffer} buffer - Image buffer
 * @param {number} MODEL_INPUT_SIZE - Model input size
 * @returns {Promise<Array>} Array containing input tensor and original image dimensions
 */
async function prepareInput(buffer, MODEL_INPUT_SIZE) {
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
        quality: 1.0,
      });
    } catch (error) {
      console.warn("HEIC conversion failed, proceeding with original buffer:", error);
    }
  }

  const rotatedBuffer = await sharp(processedBuffer).rotate().toBuffer();
  const metadata = await sharp(rotatedBuffer).metadata();
  const [imgWidth, imgHeight] = [metadata.width, metadata.height];
  
  const img = sharp(rotatedBuffer);
  const pixels = await img
    .removeAlpha()
    .resize({width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, fit: 'fill'})
    .raw()
    .toBuffer();

  // Split channels and normalize
  const red = [], green = [], blue = [];
  for (let i = 0; i < pixels.length; i += 3) {
    red.push(pixels[i] / 255.0);
    green.push(pixels[i+1] / 255.0);
    blue.push(pixels[i+2] / 255.0);
  }

  const input = [...red, ...green, ...blue];
  return [input, imgWidth, imgHeight];
}

module.exports = {
  prepareInput
};