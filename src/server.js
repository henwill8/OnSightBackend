const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

require('dotenv').config();

const { registerUser, loginUser, refreshUserToken, verifyToken } = require("./routes/auth"); // Import the auth functions
const predictRoute = require("./routes/predict");

const app = express();
app.use(cors());
app.use(cookieParser()); // Add cookie-parser middleware
app.use(express.json()); // Middleware for parsing JSON request bodies

app.post('/register', registerUser);

app.post('/login', loginUser);

app.post('/refresh', refreshUserToken);

app.post('/verify-token', verifyToken)

app.use("/predict", predictRoute);

// Route for getting the status of the server
app.get("/", (req, res) => {
    console.log("Server is running!");
    res.json({ status: "Server is running!" });
});

// Catch-all route for invalid routes
app.get("*", (req, res) => {
    res.redirect("/");
});

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
