const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

require('dotenv').config();
require('module-alias/register');

const authRoutes = require("@/src/routes/auth"); // Import the auth functions
const predictRoutes = require("@/src/routes/predict");
const routesRoutes = require("@/src/routes/routes"); // Climbing routes route
const gymsRoutes = require("@/src/routes/gyms");

const app = express();
app.use(cors());
app.use(cookieParser()); // Add cookie-parser middleware
app.use(express.json()); // Middleware for parsing JSON request bodies

app.use('/auth', authRoutes);

app.use("/api", predictRoutes);
app.use("/api", routesRoutes);
app.use("/api", gymsRoutes);

// Route for getting the status of the server
app.get("/", (req, res) => {
  console.log("Server is running!");
  res.json({ status: "Server is running!" });
});

// Catch-all route for invalid routes
app.all("*", (req, res) => {
  console.log(`Invalid route accessed: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: "Invalid route accessed!"});
});

const listRoutes = (app) => {
  console.log("\nRegistered Routes:");
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Route registered directly on the app
      const routePath = middleware.route.path;
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      console.log(`${methods} - ${routePath}`);
    } else if (middleware.name === 'router') {
      // Routes registered using a router
      middleware.handle.stack.forEach((route) => {
        if (route.route) {
          const routePrefix = middleware.regexp.source.replace('^/', '');
          const routePath = `${routePrefix}${route.route.path}`;
          const methods = Object.keys(route.route.methods).join(', ').toUpperCase();
          console.log(`${methods} - ${routePath}`);
        }
      });
    }
  });
};

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);

  listRoutes(app)
});
