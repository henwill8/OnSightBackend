const express = require("express");
const { getJobStatus } = require("@/src/utils/jobQueue");

const router = express.Router();

router.get("/job-status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const jobStatus = getJobStatus(jobId);

  if (jobStatus) {
    res.json(jobStatus);
  } else {
    res.status(404).json({ error: "Job not found" });
  }
});

module.exports = router;