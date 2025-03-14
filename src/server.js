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

const fs = require('fs');
const path = require('path');

const readDirectory = (dirPath) => {
  fs.readdir(dirPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }

    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      fs.stat(fullPath, (err, stats) => {
        if (err) {
          console.error('Error checking file stats:', err);
          return;
        }

        if (stats.isDirectory()) {
          console.log('Directory:', fullPath);
          readDirectory(fullPath); // Recursive call for directories
        } else {
          console.log('File:', fullPath);
        }
      });
    });
  });
};

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`)

  readDirectory('/app/storage')
});
