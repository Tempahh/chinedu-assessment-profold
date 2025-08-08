const { createHandler } = require('@app-core/server');
const { ERROR_CODE } = require('@app-core/errors');
const reqlineParseService = require('../services/reqline-service');

module.exports = createHandler({
  path: '/',
  method: 'post',
  async handler(requestContext, helpers) {
    try {
      const requestBody = requestContext.body;
      requestBody.requestMeta = requestContext.properties;

      const parsedResponse = await reqlineParseService(requestBody);
      return {
        status: helpers.HTTP_200_OK,
        data: parsedResponse,
      };
    } catch (err) {
      // Handle application errors with proper HTTP 400 response
      if (err.code === ERROR_CODE.BADREQUEST || err.code === ERROR_CODE.VALIDATION) {
        return {
          status: helpers.HTTP_400_BAD_REQUEST,
          data: {
            error: true,
            message: err.message,
          },
        };
      }

      // Re-throw other errors to be handled by the framework
      throw err;
    }
  },
});
