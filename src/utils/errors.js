const constants = {
  HTTP_CODE_400_MESSAGE: "Bad Request",
  HTTP_CODE_400_CODE: 400,
  HTTP_CODE_401_MESSAGE: "Unauthorized",
  HTTP_CODE_401_CODE: 401,
  HTTP_CODE_403_MESSAGE: "Forbidden",
  HTTP_CODE_403_CODE: 403,
  HTTP_CODE_404_MESSAGE: "Not Found",
  HTTP_CODE_404_CODE: 404,
  HTTP_CODE_406_MESSAGE: "Not Acceptable",
  HTTP_CODE_406_CODE: 406,
  HTTP_CODE_422_MESSAGE: "Unprocessable Entity",
  HTTP_CODE_422_CODE: 422,
  HTTP_CODE_500_MESSAGE: "Internal Server Error",
  HTTP_CODE_500_CODE: 500,
  HTTP_CODE_429_MESSAGE: "Too Many Requests",
  HTTP_CODE_429_CODE: 429,
};

export default {
  INTERNAL_SERVER_ERROR: {
    message: constants.HTTP_CODE_500_MESSAGE,
    code: constants.HTTP_CODE_500_CODE,
  },
  BAD_REQUEST: {
    message: constants.HTTP_CODE_400_MESSAGE,
    code: constants.HTTP_CODE_400_CODE,
  },
  UNAUTHORIZED: {
    message: constants.HTTP_CODE_401_MESSAGE,
    code: constants.HTTP_CODE_401_CODE,
  },
  FORBIDDEN: {
    message: constants.HTTP_CODE_403_MESSAGE,
    code: constants.HTTP_CODE_403_CODE,
  },
  NOT_FOUND: {
    message: constants.HTTP_CODE_404_MESSAGE,
    code: constants.HTTP_CODE_404_CODE,
  },
  NOT_ACCEPTABLE: {
    message: constants.HTTP_CODE_406_MESSAGE,
    code: constants.HTTP_CODE_406_CODE,
  },
  UNPROCESSABLE_ENTITY: {
    message: constants.HTTP_CODE_422_MESSAGE,
    code: constants.HTTP_CODE_422_CODE,
  },
  TOO_MANY_REQUESTS: {
    message: constants.HTTP_CODE_429_MESSAGE,
    code: constants.HTTP_CODE_429_CODE,
  },
  ID_NOT_VALID: {
    message: constants.ID_NOT_VALID_MESSAGE,
    code: constants.HTTP_CODE_400_CODE,
  },
};
