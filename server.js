// ============================================
// PW BOOKS APIs BY ARYAN
// Advanced API Server with Base44
// ============================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@base44/sdk');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// BASE44 CLIENT
// ============================================

const base44 = createClient({
  appId: process.env.BASE44_APP_ID || "6a80493744aee87d01c632ed",
  headers: {
    "api_key": process.env.BASE44_API_KEY || "a59ffe885a234413baaa0ff678844bc5"
  }
});

// ============================================
// CONFIGURATION
// ============================================

let apiSettings = {
  mainSwitch: { is_enabled: true, id: null },
  apiRecords: []
};

let CURRENT_TOKEN = '';
let TOKEN_NAME = '';
let TOKEN_ID = '';
const API_BASE = process.env.API_BASE_URL || 'https://api.penpencil.co';
const apiLogs = [];
let callCounter = 0;
let SERVER_START_TIME = Date.now();

// ============================================
// MIDDLEWARE
// ============================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// ============================================
// BASE44 DATA LOADER
// ============================================

async function loadBase44Data() {
  try {
    const response = await base44.entities.ApiEntry.list();
    const records = response.data || [];
    
    const mainSwitch = records.find(r => r.type === 'main_switch');
    if (mainSwitch) {
      apiSettings.mainSwitch = mainSwitch;
    }
    
    const apiRecords = records.filter(r => r.type === 'api' && r.bearer_token);
    apiSettings.apiRecords = apiRecords;
    
    // Auto-select first token
    if (apiRecords.length > 0) {
      const activeRecord = apiRecords[0];
      CURRENT_TOKEN = activeRecord.bearer_token || '';
      TOKEN_NAME = activeRecord.name || 'Default Token';
      TOKEN_ID = activeRecord.id || '';
    }
    
    return apiSettings;
  } catch (error) {
    console.error('❌ Base44 load error:', error.message);
    return apiSettings;
  }
}

// ============================================
// LOGGING
// ============================================

function logApiCall(apiName, requestData, responseData, status) {
  callCounter++;
  const logEntry = {
    id: callCounter,
    apiName: apiName,
    timestamp: new Date().toISOString(),
    status: status || 'pending',
    request: requestData,
    response: responseData || null
  };
  apiLogs.unshift(logEntry);
  if (apiLogs.length > 1000) apiLogs.pop();
  return logEntry;
}

// ============================================
// PW BOOKS API REQUEST
// ============================================

async function makePWBooksRequest(endpoint, method = 'GET', data = null, headers = {}) {
  if (!apiSettings.mainSwitch.is_enabled) {
    throw new Error('API is currently disabled by admin');
  }
  
  if (!CURRENT_TOKEN) {
    throw new Error('No Bearer token configured. Please add a token in Base44.');
  }

  const url = `${API_BASE}${endpoint}`;
  const config = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${CURRENT_TOKEN}`,
      'client-type': 'AI_NCERT',
      ...headers
    },
    data
  };

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Network Error: ${error.message}`);
  }
}

// ============================================
// ROUTES - PUBLIC
// ============================================

// Home - Dashboard
app.get('/', async (req, res) => {
  await loadBase44Data();
  res.render('dashboard', {
    title: 'PW Books APIs by Aryan',
    apiSettings,
    token: {
      set: !!CURRENT_TOKEN,
      name: TOKEN_NAME,
      id: TOKEN_ID,
      length: CURRENT_TOKEN ? CURRENT_TOKEN.length : 0
    },
    logs: apiLogs.slice(0, 30),
    callCount: callCounter,
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    timestamp: new Date().toISOString()
  });
});

// Documentation
app.get('/docs', async (req, res) => {
  await loadBase44Data();
  res.render('docs', {
    title: 'API Documentation - PW Books APIs by Aryan',
    apiSettings,
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found - PW Books APIs by Aryan',
    url: req.originalUrl
  });
});

// ============================================
// API ENDPOINTS
// ============================================

// Health
app.get('/api/health', async (req, res) => {
  await loadBase44Data();
  res.json({
    status: 'OK',
    server: 'PW Books APIs by Aryan',
    version: '2.0.0',
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    base44: { connected: true, appId: process.env.BASE44_APP_ID },
    api: {
      enabled: apiSettings.mainSwitch.is_enabled,
      tokenSet: !!CURRENT_TOKEN,
      tokenName: TOKEN_NAME,
      records: apiSettings.apiRecords.length
    },
    timestamp: new Date().toISOString()
  });
});

// Status
app.get('/api/status', async (req, res) => {
  await loadBase44Data();
  res.json({
    server: 'PW Books APIs by Aryan',
    version: '2.0.0',
    status: 'operational',
    api: {
      enabled: apiSettings.mainSwitch.is_enabled,
      status: apiSettings.mainSwitch.is_enabled ? 'ON' : 'OFF'
    },
    token: {
      set: !!CURRENT_TOKEN,
      name: TOKEN_NAME,
      length: CURRENT_TOKEN ? CURRENT_TOKEN.length : 0,
      id: TOKEN_ID
    },
    stats: {
      totalCalls: callCounter,
      logsCount: apiLogs.length,
      uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000)
    },
    endpoints: {
      dashboard: '/',
      docs: '/docs',
      health: '/api/health',
      status: '/api/status',
      switch: '/api/switch',
      token: '/api/token',
      logs: '/api/logs',
      purchased: '/api/purchased-books',
      book: '/api/book/{bookId}',
      chapters: '/api/book/{bookId}/chapters',
      proxy: '/api/pwbooks/*'
    },
    timestamp: new Date().toISOString()
  });
});

// Main Switch (from Base44)
app.get('/api/switch', async (req, res) => {
  await loadBase44Data();
  res.json({
    id: apiSettings.mainSwitch.id,
    is_enabled: apiSettings.mainSwitch.is_enabled,
    status: apiSettings.mainSwitch.is_enabled ? 'ON' : 'OFF',
    updated_date: apiSettings.mainSwitch.updated_date,
    created_date: apiSettings.mainSwitch.created_date
  });
});

app.post('/api/switch', async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be boolean' });
    }
    
    const records = await base44.entities.ApiEntry.list();
    const mainSwitch = records.data.find(r => r.type === 'main_switch');
    
    if (!mainSwitch) {
      return res.status(404).json({ error: 'Main switch not found in Base44' });
    }
    
    const updated = await base44.entities.ApiEntry.update(mainSwitch.id, {
      is_enabled: enabled
    });
    
    apiSettings.mainSwitch = updated.data;
    logApiCall('TOGGLE_SWITCH', { enabled }, { status: 'updated' }, 'success');
    
    res.json({
      success: true,
      id: updated.data.id,
      is_enabled: updated.data.is_enabled,
      status: updated.data.is_enabled ? 'ON' : 'OFF',
      updated_date: updated.data.updated_date
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Token Management (from Base44)
app.get('/api/token', async (req, res) => {
  await loadBase44Data();
  res.json({
    set: !!CURRENT_TOKEN,
    name: TOKEN_NAME,
    id: TOKEN_ID,
    length: CURRENT_TOKEN ? CURRENT_TOKEN.length : 0,
    records: apiSettings.apiRecords.map(r => ({
      id: r.id,
      name: r.name || 'Unnamed',
      created_date: r.created_date,
      updated_date: r.updated_date
    }))
  });
});

app.post('/api/token', async (req, res) => {
  try {
    const { token, name } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }
    
    const cleanToken = token.replace(/^Bearer\s+/i, '');
    const tokenName = name || 'Default Token';
    
    // Check if token already exists
    const records = await base44.entities.ApiEntry.list();
    const existing = records.data.find(r => r.type === 'api' && r.bearer_token === cleanToken);
    
    if (existing) {
      return res.status(400).json({ 
        error: 'Token already exists',
        id: existing.id,
        name: existing.name
      });
    }
    
    const newRecord = await base44.entities.ApiEntry.create({
      type: 'api',
      name: tokenName,
      bearer_token: cleanToken,
      is_enabled: true
    });
    
    await loadBase44Data();
    logApiCall('SET_TOKEN', { name: tokenName }, { status: 'created' }, 'success');
    
    res.json({
      success: true,
      id: newRecord.data.id,
      name: newRecord.data.name,
      created_date: newRecord.data.created_date
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/token/:id', async (req, res) => {
  try {
    const { token, name } = req.body;
    const updateData = {};
    if (token) updateData.bearer_token = token.replace(/^Bearer\s+/i, '');
    if (name) updateData.name = name;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const updated = await base44.entities.ApiEntry.update(req.params.id, updateData);
    await loadBase44Data();
    
    res.json({
      success: true,
      id: updated.data.id,
      updated_date: updated.data.updated_date
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/token/:id', async (req, res) => {
  try {
    await base44.entities.ApiEntry.delete(req.params.id);
    await loadBase44Data();
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const status = req.query.status;
  let filtered = apiLogs;
  if (status) {
    filtered = filtered.filter(l => l.status === status);
  }
  res.json({
    total: filtered.length,
    logs: filtered.slice(0, limit),
    timestamp: new Date().toISOString()
  });
});

app.delete('/api/logs', (req, res) => {
  const count = apiLogs.length;
  apiLogs.length = 0;
  callCounter = 0;
  res.json({ success: true, cleared: count });
});

// Purchased Books
app.get('/api/purchased-books', async (req, res) => {
  try {
    const { userId, paymentStatus = 'SUCCESS', page = 1, limit = 100 } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const endpoint = `/engagement/ai-ncert/v1/books/all-purchased-books?userId=${userId}&paymentStatus=${paymentStatus}&page=${page}&limit=${limit}`;
    const result = await makePWBooksRequest(endpoint);
    
    logApiCall('GET_PURCHASED_BOOKS', { userId }, result, 'success');
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logApiCall('GET_PURCHASED_BOOKS', req.query, { error: error.message }, 'error');
    res.status(error.message.includes('401') ? 401 : 500).json({
      success: false,
      error: error.message,
      code: error.message.includes('401') ? 'UNAUTHORIZED' : 'SERVER_ERROR'
    });
  }
});

// Book Details
app.get('/api/book/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    const endpoint = `/engagement/ai-ncert/v1/books/${bookId}`;
    const result = await makePWBooksRequest(endpoint);
    
    logApiCall(`GET_BOOK_${bookId}`, { bookId }, result, 'success');
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.message.includes('401') ? 401 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// Chapters
app.get('/api/book/:bookId/chapters', async (req, res) => {
  try {
    const { bookId } = req.params;
    const endpoint = `/engagement/ai-ncert/v1/books/${bookId}/all-chapters`;
    const result = await makePWBooksRequest(endpoint);
    
    logApiCall(`GET_CHAPTERS_${bookId}`, { bookId }, result, 'success');
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.message.includes('401') ? 401 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// Proxy
app.all('/api/pwbooks/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const method = req.method;
    const data = req.body;
    const query = req.query;
    
    let fullEndpoint = endpoint;
    if (Object.keys(query).length > 0) {
      fullEndpoint += '?' + new URLSearchParams(query).toString();
    }
    
    const log = logApiCall(`${method} ${endpoint}`, { query, body: data }, null, 'pending');
    const result = await makePWBooksRequest(fullEndpoint, method, data);
    log.status = 'success';
    log.response = result;
    
    res.json({
      success: true,
      data: result,
      logId: log.id
    });
  } catch (error) {
    logApiCall(`${req.method} ${req.params[0]}`, req.query, { error: error.message }, 'error');
    res.status(error.message.includes('401') ? 401 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
  await loadBase44Data();
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   📚 PW BOOKS APIs BY ARYAN        ║`);
  console.log(`║   Version: 2.0.0                    ║`);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║   🚀 Server: http://localhost:${PORT}    ║`);
  console.log(`║   🔑 Token: ${CURRENT_TOKEN ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`║   ⚡ Status: ${apiSettings.mainSwitch.is_enabled ? '🟢 ON' : '🔴 OFF'}`);
  console.log(`║   📊 Records: ${apiSettings.apiRecords.length}`);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║   📋 Dashboard: /                     ║`);
  console.log(`║   📖 Docs: /docs                      ║`);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║   🎯 API Base: /api                  ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});