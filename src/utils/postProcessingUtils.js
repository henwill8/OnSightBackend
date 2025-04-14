/**
 * Non-maximum suppression
 * @param {Array} boxes - Array of bounding boxes
 * @param {number} iouThreshold - IoU threshold
 * @returns {Array} Indices of kept boxes
 */
function nms(boxes, iouThreshold) {
  const scores = boxes.map(box => box[4]);
  const indices = Array.from(Array(boxes.length).keys())
    .sort((a, b) => scores[b] - scores[a]);
  
  const kept = [];
  
  while (indices.length > 0) {
    const current = indices[0];
    kept.push(current);
    
    indices.splice(0, 1); // Remove current index
    
    // Filter remaining indices
    for (let i = indices.length - 1; i >= 0; i--) {
      const idx = indices[i];
      if (iou(boxes[current], boxes[idx]) > iouThreshold) {
        indices.splice(i, 1);
      }
    }
  }
  
  return kept;
}

/**
 * Calculate IoU between two bounding boxes
 * @param {Array} box1 - First box [x1, y1, x2, y2, ...]
 * @param {Array} box2 - Second box [x1, y1, x2, y2, ...]
 * @returns {number} IoU value
 */
function iou(box1, box2) {
  const [x1, y1, x2, y2] = box1;
  const [x1b, y1b, x2b, y2b] = box2;

  const interX1 = Math.max(x1, x1b);
  const interY1 = Math.max(y1, y1b);
  const interX2 = Math.min(x2, x2b);
  const interY2 = Math.min(y2, y2b);

  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const box1Area = (x2 - x1) * (y2 - y1);
  const box2Area = (x2b - x1b) * (y2b - y1b);

  const unionArea = box1Area + box2Area - interArea;

  return interArea / unionArea;
}

module.exports = {
  nms,
  iou
}