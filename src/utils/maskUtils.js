const cv = require("@techstark/opencv-js");

/**
 * Reshape prototypes from flat array to 3D array
 * @param {Float32Array} protoData - Flat prototype data
 * @param {Array} dims - Dimensions [n, c, h, w]
 * @returns {Array} Reshaped prototypes
 */
function reshapePrototypes(protoData, [n, c, h, w]) {
  const result = [];
  for (let i = 0; i < c; i++) {
    const channel = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const index = i * h * w + y * w + x; // Skip batch dim
        row.push(protoData[index]);
      }
      channel.push(row);
    }
    result.push(channel);
  }
  return result; // shape: [32][256][256]
}

/**
 * Generate mask from coefficients and prototype masks
 * @param {Array} coeffs - Mask coefficients
 * @param {Array} prototypes - Prototype masks
 * @param {number} MASK_SIZE - Size of the mask
 * @returns {Array} Generated mask
 */
function generateMaskFromCoefficients(coeffs, prototypes, MASK_SIZE) {
  const mask = new Array(MASK_SIZE).fill(0).map(() => new Array(MASK_SIZE).fill(0));
  
  // Matrix multiplication equivalent
  for (let row = 0; row < MASK_SIZE; row++) {
    for (let col = 0; col < MASK_SIZE; col++) {
      let val = 0;
      for (let i = 0; i < coeffs.length; i++) {
        val += coeffs[i] * prototypes[i][row][col];
      }
      mask[row][col] = val;
    }
  }
  
  return mask;
}

/**
 * Crop mask to bounding box
 * @param {Array} mask - Input mask
 * @param {Array} bbox - Bounding box [x1, y1, x2, y2]
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @param {number} MASK_SIZE - Size of the mask
 * @returns {Array} Cropped mask
 */
function cropMaskToBbox(mask, bbox, imgWidth, imgHeight, MASK_SIZE) {
  const [x1, y1, x2, y2] = bbox;
  
  // Scale bbox to mask dimensions
  const maskX1 = Math.floor((x1 / imgWidth) * MASK_SIZE);
  const maskY1 = Math.floor((y1 / imgHeight) * MASK_SIZE);
  const maskX2 = Math.ceil((x2 / imgWidth) * MASK_SIZE);
  const maskY2 = Math.ceil((y2 / imgHeight) * MASK_SIZE);
  
  // Create a copy of the mask
  const croppedMask = new Array(MASK_SIZE).fill(0).map(() => new Array(MASK_SIZE).fill(0));
  
  // Zero out values outside the bounding box
  for (let row = 0; row < MASK_SIZE; row++) {
    for (let col = 0; col < MASK_SIZE; col++) {
      if (row >= maskY1 && row < maskY2 && col >= maskX1 && col < maskX2) {
        croppedMask[row][col] = mask[row][col] > 0 ? 1 : 0; // Threshold at 0
      }
    }
  }
  
  return croppedMask;
}

/**
 * Filter mask based on area and aspect ratio criteria
 * @param {Object} processedMask - Processed mask data
 * @param {number} maskSize - Size of the mask
 * @param {number} maxAreaRatio - Maximum area ratio
 * @param {number} maxAspectRatio - Maximum aspect ratio
 * @param {number} minAreaRatio - Minimum area ratio
 * @returns {boolean} True if mask passes filters
 */
function filterMask(
  processedMask,
  maskSize,
  maxAreaRatio = 0.03,
  maxAspectRatio = 2.0,
  minAreaRatio = 0.01
) {
  const totalPixels = maskSize * maskSize;
  
  // Check if area is too large
  if (processedMask.maskArea / totalPixels > maxAreaRatio) {
    return false;
  }
  
  // Check if dimensions are valid
  if (processedMask.width === 0 || processedMask.height === 0) {
    return false;
  }
  
  // Apply aspect ratio filter if area is above minimum threshold
  if (processedMask.maskArea / totalPixels > minAreaRatio && 
      processedMask.aspectRatio > maxAspectRatio) {
    return false;
  }
  
  return true;
}

/**
 * Process a mask to extract contours and metadata
 * @param {Array} mask - Binary mask
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @param {number} MASK_SIZE - Size of the mask
 * @param {number} [radius=1] - Radius for smoothing contour
 * @param {number} [expansionRatio=0.005] - Expansion ratio relative to image size (0.01 = 1%)
 * @returns {Object|null} Object containing mask data or null if invalid
 */
function processMask(mask, imgWidth, imgHeight, MASK_SIZE, radius = 1, expansionRatio = 0.005) {
  const binaryMask = new cv.Mat(MASK_SIZE, MASK_SIZE, cv.CV_8UC1);
  for (let y = 0; y < MASK_SIZE; y++) {
    for (let x = 0; x < MASK_SIZE; x++) {
      binaryMask.ucharPtr(y, x)[0] = mask[y][x] > 0 ? 255 : 0;
    }
  }

  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  const smoothed = new cv.Mat();
  cv.morphologyEx(binaryMask, smoothed, cv.MORPH_OPEN, kernel);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(smoothed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() === 0) {
    binaryMask.delete(); smoothed.delete(); contours.delete(); hierarchy.delete();
    return null;
  }

  let maxArea = 0;
  let maxContourIndex = -1;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      maxContourIndex = i;
    }
  }

  if (maxContourIndex === -1) {
    binaryMask.delete(); smoothed.delete(); contours.delete(); hierarchy.delete();
    return null;
  }

  const maxContour = contours.get(maxContourIndex);

  const rect = cv.minAreaRect(maxContour);
  const { width, height } = rect.size;

  const rawPoints = [];
  const scaleX = imgWidth / MASK_SIZE;
  const scaleY = imgHeight / MASK_SIZE;

  for (let i = 0; i < maxContour.total(); i++) {
    const point = maxContour.intPtr(i);
    rawPoints.push({
      x: point[0] * scaleX,
      y: point[1] * scaleY
    });
  }

  const smoothedPoints = smoothContour(rawPoints);

  const centroid = rawPoints.reduce(
    (acc, pt) => ({
      x: acc.x + pt.x / smoothedPoints.length,
      y: acc.y + pt.y / smoothedPoints.length
    }),
    { x: 0, y: 0 }
  );

  const diag = Math.sqrt(imgWidth ** 2 + imgHeight ** 2);
  const pixelExpansion = diag * expansionRatio;

  const expandedPolygon = smoothedPoints.flatMap(pt => {
    const dx = pt.x - centroid.x;
    const dy = pt.y - centroid.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normX = dist > 0 ? dx / dist : 0;
    const normY = dist > 0 ? dy / dist : 0;

    return [
      pt.x + normX * pixelExpansion,
      pt.y + normY * pixelExpansion
    ];
  });

  let maskArea = 0;
  for (let y = 0; y < MASK_SIZE; y++) {
    for (let x = 0; x < MASK_SIZE; x++) {
      if (mask[y][x] > 0) {
        maskArea++;
      }
    }
  }

  const result = {
    polygon: expandedPolygon,
    area: maxArea,
    maskArea,
    aspectRatio: (width && height) ? Math.max(width / height, height / width) : 0,
    width,
    height
  };

  binaryMask.delete();
  smoothed.delete();
  contours.delete();
  hierarchy.delete();
  maxContour.delete();

  return result;
}

function smoothContour(points, radius = 2, sigma = 0.75) {
  const smoothed = [];
  const len = points.length;

  // Create Gaussian weights
  const weights = [];
  let weightSum = 0;
  for (let j = -radius; j <= radius; j++) {
    const w = Math.exp(-0.5 * (j / sigma) ** 2); // Gaussian kernel
    weights.push(w);
    weightSum += w;
  }

  for (let i = 0; i < len; i++) {
    let sumX = 0;
    let sumY = 0;

    for (let j = -radius; j <= radius; j++) {
      let idx = (i + j) % len; // Wrap around for closed contour

      while (idx < 0) idx += len;

      const weight = weights[j + radius];
      if (!points[idx]) {
        console.error(`Invalid point at index ${idx}:`, points[idx]);
        continue;
      }

      sumX += points[idx].x * weight;
      sumY += points[idx].y * weight;
    }

    smoothed.push({
      x: sumX / weightSum,
      y: sumY / weightSum,
    });
  }

  return smoothed;
}

module.exports = {
  reshapePrototypes,
  generateMaskFromCoefficients,
  cropMaskToBbox,
  filterMask,
  processMask,
  smoothContour
};