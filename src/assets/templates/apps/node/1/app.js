const express = require('express');

// Create an instance of Express
const app = express();

// Define a route for the root URL
app.get('/', (req, res) => {
  res.send('Hello, Docker! 🐳');
});

// Define the port to listen on
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});