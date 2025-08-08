/* eslint-disable no-unused-vars */
const validator = require('@app-core/validator');
const httpRequest = require('@app-core/http-request');
const { appLogger, TimeLogger } = require('@app-core/logger');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');

const parseSpec = validator.parse(`root{
    reqline is a required string
}`);

const VALID_KEYWORDS = ['HTTP', 'URL', 'QUERY', 'HEADERS', 'BODY'];

function parseReqlineString(reqlineStr) {
  // Ensure trimmed
  if (reqlineStr.trim() !== reqlineStr) {
    throwAppError('Invalid format: Input must be trimmed', ERROR_CODE.BADREQUEST);
  }

  const segments = reqlineStr.split('|').map((part) => part.trim());
  const firstTokens = segments.map((s) => s.split(' ')[0]);

  // First and second segment checks
  if (segments.length < 2) {
    throwAppError('Missing required HTTP and URL segments', ERROR_CODE.BADREQUEST);
  }
  if (segments[0].split(' ')[0].toUpperCase() !== 'HTTP') {
    throwAppError('First segment must start with HTTP', ERROR_CODE.BADREQUEST);
  }
  if (segments[1].split(' ')[0].toUpperCase() !== 'URL') {
    throwAppError('Second segment must start with URL', ERROR_CODE.BADREQUEST);
  }

  const hasDuplicateFirstToken = firstTokens.some(
    (token, idx) => firstTokens.indexOf(token) !== idx
  );

  if (hasDuplicateFirstToken) {
    throwAppError('Duplicate segment type detected', ERROR_CODE.BADREQUEST);
  }

  const parsed = {
    method: '',
    url: '',
    headers: {},
    query: {},
    body: {},
  };

  segments.forEach((segment) => {
    const spaceIndex = segment.indexOf(' ');
    if (spaceIndex === -1) {
      throwAppError(`Invalid segment format: '${segment}'`, ERROR_CODE.BADREQUEST);
    }

    const keyword = segment.substring(0, spaceIndex).trim();
    const value = segment.substring(spaceIndex + 1).trim();

    // Keyword uppercase check
    if (keyword !== keyword.toUpperCase()) {
      throwAppError(`Keyword must be uppercase: '${keyword}'`, ERROR_CODE.BADREQUEST);
    }

    // Validate allowed keywords
    if (!VALID_KEYWORDS.includes(keyword)) {
      throwAppError(`Unknown keyword: '${keyword}'`, ERROR_CODE.BADREQUEST);
    }

    switch (keyword) {
      case 'HTTP':
        if (!['GET', 'POST'].includes(value)) {
          throwAppError(`Invalid HTTP method: '${value}'`, ERROR_CODE.BADREQUEST);
        }
        parsed.method = value;
        break;
      case 'URL':
        // Basic URL validation without regex for Node.js 8 compatibility
        if (
          !(value.startsWith('http://') || value.startsWith('https://')) ||
          value.length <= 'http://'.length
        ) {
          throwAppError(`Invalid URL format: '${value}'`, ERROR_CODE.BADREQUEST);
        }
        parsed.url = value;
        break;
      case 'HEADERS':
      case 'QUERY':
      case 'BODY':
        try {
          parsed[keyword.toLowerCase()] = JSON.parse(value);
        } catch {
          throwAppError(`Invalid JSON for ${keyword}`, ERROR_CODE.BADREQUEST);
        }
        break;
      default:
        throwAppError(`Unhandled keyword: '${keyword}'`, ERROR_CODE.BADREQUEST);
    }
  });

  return parsed;
}

async function parseReqline(serviceData) {
  const timeLogger = new TimeLogger('REQ-PROXY-DURATION');
  const data = validator.validate(serviceData, parseSpec);
  const reqlineStr = data.reqline;

  try {
    // Parse
    const parsed = parseReqlineString(reqlineStr);

    // Build URL
    const queryStr = Object.keys(parsed.query).length
      ? Object.entries(parsed.query)
          .map(([k, v]) => `${k}=${v}`)
          .join('&')
      : '';
    const fullUrl = `${parsed.url}${queryStr ? `?${queryStr}` : ''}`;

    // Make HTTP request
    let res;
    if (parsed.method === 'POST') {
      res = await httpRequest.post(fullUrl, parsed.body, { headers: parsed.headers });
    } else {
      res = await httpRequest.get(fullUrl, { headers: parsed.headers });
    }

    // Request object
    const request = {
      query: parsed.query,
      body: parsed.body,
      headers: parsed.headers,
      full_url: fullUrl,
    };

    // Timing info
    const durationInfo = timeLogger.getLogData()['REQ-PROXY-DURATION'];

    // Response object
    const response = {
      http_status: res.status,
      duration: Math.floor(durationInfo.duration),
      request_start_timestamp: Math.floor(durationInfo.startTime),
      request_stop_timestamp: Math.floor(durationInfo.endTime),
      response_data: res.data,
    };

    return { request, response };
  } catch (error) {
    appLogger.error(error);
    if (error.code) throw error;
    console.error('Error processing reqline statement:', error);
    throwAppError('Error processing reqline statement', ERROR_CODE.BADREQUEST);
  }
}

module.exports = parseReqline;
