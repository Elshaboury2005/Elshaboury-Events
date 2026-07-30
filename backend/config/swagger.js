const swaggerJsdoc = require('swagger-jsdoc');

const SERVER_LOCAL = process.env.SWAGGER_LOCAL_URL || 'http://localhost:5000';
const SERVER_PROD = process.env.SWAGGER_PROD_URL || '';

const servers = [{ url: SERVER_LOCAL, description: 'Local development server' }];
if (SERVER_PROD) {
  servers.push({ url: SERVER_PROD, description: 'Production server' });
}

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Elshaboury Events API',
      version: '1.0.0',
      description:
        'Full-featured event management platform API — handles auth, events, bookings, venues, wallet, workshops, notebooks, subscriptions, FAQs, and administration.',
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Standard user JWT — obtain via POST /api/Account/login',
        },
        workshopBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Workshop-scoped JWT — obtain via POST /api/workshop/login',
        },
        adminBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Admin JWT — obtain via POST /api/Admin/auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Human-readable error message' },
          },
        },
        SuccessWrapper: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', description: 'The actual response payload' },
          },
        },
      },
    },
  },
  apis: [
    './routes/*.js',
    './routes/admin/*.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
