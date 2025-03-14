const express = require("express");
const cors = require("cors");
const predictRoute = require("./routes/predict");

const app = express();
app.use(cors());

// Routes
app.use("/predict", predictRoute);

app.get("/", (req, res) => {
    console.log("Server is running!");
    res.json({ status: "Server is running!" });
});

app.get("*", (req, res) => {
    res.redirect("/");
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`)

  const fs = require('fs');
  const path = '/app/storage/';

  fs.readdir(path, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    console.log('Files in /app/storage:', files);
  });
  fs.readdir(path+"models/", (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    console.log('Files in /app/storage/models:', files);
  });
});
