const express = require("express");
const { verifyAccessToken } = require('@/src/routes/auth');
const { generatePresignedUrl } = require('@/src/aws');

const router = express.Router();

router.get("/s3Assets/*", verifyAccessToken, async (req, res) => {
  try {
    const key = req.params[0];

    // Gets URL that the client can use (objects in the s3 bucket are private)
    const presignedUrl = await generatePresignedUrl(key);

    res.status(200).json({ url: presignedUrl });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).json({ error: "Failed to generate presigned URL" });
  }
});

module.exports = router;
