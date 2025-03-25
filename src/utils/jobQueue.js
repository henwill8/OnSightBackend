const { v4: uuidv4 } = require('uuid');

// Jobs are used so that the client can keep track of a process and not timeout if the process is long-running

const jobQueue = {};

function createJob(processFn) {
  // Generate a unique job ID
  const jobId = uuidv4();
  console.log(`Creating job with ID: ${jobId}`);
  
  jobQueue[jobId] = { status: "pending", result: null };
  console.log(`Job ${jobId} status set to "pending"`);

  // Execute the provided process function
  processFn()
    .then((result) => {
      jobQueue[jobId] = { status: "done", result };
      console.log(`Job ${jobId} completed successfully`);
    })
    .catch((error) => {
      jobQueue[jobId] = { status: "error", result: null, error: error.message };
      console.error(`Job ${jobId} failed with error: ${error.message}`);
    });

  // Return the job ID so that the caller can track its status
  return jobId;
}

function getJobStatus(jobId) {
  const jobStatus = jobQueue[jobId] || null;
  console.log(`Fetching status for job ${jobId}:`, jobStatus.status);
  return jobStatus;
}

module.exports = { createJob, getJobStatus }
