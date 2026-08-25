// ================================================
// Netlify Function — Express app ko serverless mein wrap karta hai
// ================================================
const serverless = require('serverless-http');
const app = require('../../server');
 
exports.handler = serverless(app);
