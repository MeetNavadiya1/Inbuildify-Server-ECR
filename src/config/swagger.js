import { REQUEST_SOURCE } from "../config/constants.js";

// Default example values for Swagger
function getDefaultExample(type) {
  switch (type) {
  case "boolean":
    return true;
  case "number":
  case "integer":
    return 1;
  case "string":
    return "string";
  case "array":
    return [];
  case "object":
    return {};
  default:
    return "";
  }
}

// Convert Joi schema to Swagger query parameters
function joiToSwagger(joiSchema) {
  if (!joiSchema || !joiSchema.describe) {
    return [];
  }
  const swaggerParams = [];
  const desc = joiSchema.describe();

  for (const key in desc.keys) {
    const k = desc.keys[key];
    const type = k.type === "date" ? "string" : k.type;
    let format;

    // Detect UUID
    if (type === "string" && k.rules?.some((r) => r.name === "uuid")) {
      format = "uuid";
    } else if (type === "date") {
      format = "date-time";
    }

    const isRequired = k.flags?.presence === "required" || false;

    let example;
    if (format === "uuid") {
      example = null; // let user input
    } else {
      example = k.flags?.default ?? k.examples?.[0] ?? getDefaultExample(type);
    }

    swaggerParams.push({
      name: key,
      in: "query",
      required: isRequired,
      schema: { type, format, example },
    });
  }

  return swaggerParams;
}

// Helper to convert snake_case to camelCase
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

// Convert Joi schema to Swagger request body schema
function joiToSwaggerBody(joiSchema, isFormData = false) {
  if (!joiSchema || !joiSchema.describe) {
    return { type: "object", example: {} };
  }

  const properties = {};
  const required = [];
  const example = {};
  const desc = joiSchema.describe();

  if (!desc.keys) {
    return { type: "object", example: {} };
  }

  for (const key in desc.keys) {
    const k = desc.keys[key];
    let type = k.type === "date" ? "string" : k.type;
    if (type === "number") {
      type = "integer";
    }
    let format;

    // Detect UUID
    if (type === "string" && k.rules?.some((r) => r.name === "uuid")) {
      format = "uuid";
    } else if (type === "date") {
      format = "date-time";
    }

    const isRequired = k.flags?.presence === "required" || false;
    const propKey = isFormData ? toCamelCase(key) : key;
    if (isRequired) {
      required.push(propKey);
    }

    let propExample;
    if (format === "uuid") {
      propExample = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    } else {
      propExample = k.flags?.default ?? k.examples?.[0] ?? getDefaultExample(type);
    }

    properties[propKey] = { type };
    if (format) {
      properties[propKey].format = format;
    }

    // For multipart/form-data, non-string types (like boolean/integer) can crash swagger-ui
    // when building FormData, so we force them to string type in the Swagger spec.
    if (isFormData && type !== "string" && type !== "array") {
      properties[propKey].type = "string";
      if (propExample !== undefined && propExample !== null) {
        propExample = String(propExample);
      }
    }

    if (type === "array" && k.items && k.items.length > 0) {
      let itemType = k.items[0].type === "date" ? "string" : k.items[0].type;
      if (itemType === "number") {
        itemType = "integer";
      }
      properties[propKey].items = { type: itemType };

      let itemFormat;
      if (itemType === "string" && k.items[0].rules?.some((r) => r.name === "uuid")) {
        itemFormat = "uuid";
      } else if (itemType === "date" || k.items[0].type === "date") {
        itemFormat = "date-time";
      }
      if (itemFormat) {
        properties[propKey].items.format = itemFormat;
      }

      if (propExample === undefined || (Array.isArray(propExample) && propExample.length === 0)) {
        propExample = itemFormat === "uuid"
          ? ["3fa85f64-5717-4562-b3fc-2c963f66afa6"]
          : [getDefaultExample(itemType)];
      }
    }

    properties[propKey].example = propExample;
    example[propKey] = propExample;
  }

  const schema = { type: "object", properties, example };
  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

// Deduplicate parameters by name
function dedupeParameters(params) {
  const map = {};
  params.forEach((p) => {
    if (!map[p.name]) {
      map[p.name] = p;
    }
  });
  return Object.values(map);
}

// Extract all routes from Express app
function extractRoutes(app) {
  const routes = [];

  if (!app._router || !app._router.stack) {
    return routes;
  }

  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: middleware.route.methods,
        stack: middleware.route.stack,
      });
    } else if (middleware.name === "router" && middleware.handle.stack) {
      const basePath = middleware.regexp
        .toString()
        .replace("/^", "")
        .replace("\\/?(?=\\/|$)/i", "")
        .replace(/\\\//g, "/");

      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: basePath + handler.route.path,
            methods: handler.route.methods,
            stack: handler.route.stack,
          });
        }
      });
    }
  });

  return routes;
}

// Generate full Swagger spec
function generateSwaggerSpec(app) {
  const routes = extractRoutes(app);
  const paths = {};

  routes.forEach((route) => {
    Object.keys(route.methods).forEach((method) => {
      const lowerMethod = method.toLowerCase();

      // Convert :param → {param} for Swagger
      const swaggerPath = route.path.replace(/:(\w+)/g, "{$1}");
      if (!paths[swaggerPath]) {
        paths[swaggerPath] = {};
      }

      const pathParts = route.path.split("/").filter(Boolean);
      const tagName = pathParts.length ? pathParts[0] : "General";

      const routeConfig = {
        tags: [tagName.charAt(0).toUpperCase() + tagName.slice(1)],
        summary: `${method.toUpperCase()} ${route.path}`,
        parameters: [],
        responses: { 200: { description: "Success" } },
      };

      // Add path parameters automatically
      const pathParams = (route.path.match(/:\w+/g) || []).map((p) => {
        const name = p.slice(1);

        // Detect UUID from Joi schema if it exists
        let format;
        const joiMiddleware = route.stack?.find((m) => m.handle?.joiSchema);
        if (joiMiddleware && joiMiddleware.handle.joiSchema.describe().keys[name]) {
          const keySchema = joiMiddleware.handle.joiSchema.describe().keys[name];
          if (keySchema.type === "string" && keySchema.rules?.some((r) => r.name === "uuid")) {
            format = "uuid";
          }
        }

        return {
          name,
          in: "path",
          required: true,
          schema: {
            type: "string",
            format,
            example: null,
          },
          description: `Path parameter ${name}`,
        };
      });

      routeConfig.parameters.push(...pathParams);

      // Detect Joi middleware for query/body/form-data & Multer file uploads
      let joiSchema = null;
      let joiSource = null;
      let fileFields = [];

      route.stack?.forEach((m) => {
        if (m.handle?.joiSchema) {
          joiSchema = m.handle.joiSchema;
          joiSource = m.handle.source;
        }
        if (m.handle?.fileFields) {
          fileFields = fileFields.concat(m.handle.fileFields);
        }
      });

      if (joiSchema && joiSource === REQUEST_SOURCE.QUERY) {
        const joiParams = joiToSwagger(joiSchema);
        routeConfig.parameters.push(...joiParams);
      }

      const isFormData = joiSource === REQUEST_SOURCE.FORM_DATA;
      const hasFiles = fileFields.length > 0;

      if ((joiSchema && joiSource === REQUEST_SOURCE.BODY) || isFormData || hasFiles) {
        const schemaProps = isFormData || (joiSchema && joiSource === REQUEST_SOURCE.BODY)
          ? joiToSwaggerBody(joiSchema, isFormData)
          : { type: "object", properties: {} };

        if (hasFiles) {
          if (!schemaProps.properties) {
            schemaProps.properties = {};
          }
          fileFields.forEach((field) => {
            if (field === "any") {
              // Can't cleanly represent "any" in swagger 3.0 easily without a specific field name
              schemaProps.properties.file = { type: "string", format: "binary" };
              if (schemaProps.example) {
                delete schemaProps.example.file;
              }
            } else if (field.maxCount === 1 || field.maxCount === undefined && !field.maxCount) {
              schemaProps.properties[field.name] = { type: "string", format: "binary" };
              if (schemaProps.example) {
                delete schemaProps.example[field.name];
              }
            } else {
              schemaProps.properties[field.name] = {
                type: "array",
                items: { type: "string", format: "binary" },
              };
              if (schemaProps.example) {
                delete schemaProps.example[field.name];
              }
            }
          });
        }

        const contentType = (isFormData || hasFiles) ? "multipart/form-data" : "application/json";

        // Swagger UI file uploads get confused if there is an `example` block containing values.
        // For multipart/form-data, we simply remove the root example property.
        if (contentType === "multipart/form-data" && schemaProps.example) {
          delete schemaProps.example;
        }

        routeConfig.requestBody = {
          required: true,
          content: { [contentType]: { schema: schemaProps } },
        };
      }

      // Fallback requestBody for POST/PUT/PATCH/DELETE if no Joi and no files
      if (["post", "put", "patch", "delete"].includes(lowerMethod) && !routeConfig.requestBody) {
        routeConfig.requestBody = {
          required: false,
          content: { "application/json": { schema: { type: "object", example: {} } } },
        };
      }

      // Deduplicate parameters
      routeConfig.parameters = dedupeParameters(routeConfig.parameters);

      paths[swaggerPath][lowerMethod] = routeConfig;
    });
  });

  return {
    openapi: "3.0.0",
    info: { title: "CRM API", version: "1.0.0" },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "Bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}

export default generateSwaggerSpec;
