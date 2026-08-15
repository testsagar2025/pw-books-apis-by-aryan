const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const BASE44_API_URL = 'https://api-master-flow.base44.app/api/apps/6a80493744aee87d01c632ed/entities/ApiEntry';
let apiData = { records: [], mainSwitch: { is_enabled: true }, token: null, tokenName: '', tokenId: '' };

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

async function fetchBase44Data() {
  try {
    const response = await axios.get(BASE44_API_URL, { params: { sort: '-created_date', limit: 500 } });
    const records = response.data || [];
    const mainSwitch = records.find(r => r.type === 'main_switch');
    if (mainSwitch) apiData.mainSwitch = mainSwitch;
    const tokenRecords = records.filter(r => r.type === 'api' && r.bearer_token);
    apiData.records = tokenRecords;
    if (tokenRecords.length > 0) {
      apiData.token = tokenRecords[0].bearer_token;
      apiData.tokenName = tokenRecords[0].name || 'Default Token';
      apiData.tokenId = tokenRecords[0].id || '';
    } else {
      apiData.token = null;
      apiData.tokenName = '';
      apiData.tokenId = '';
    }
    return apiData;
  } catch (error) {
    console.error('❌ Error fetching Base44 data:', error.message);
    return apiData;
  }
}

// ============================================
// DASHBOARD (PW Books Powered by Aryan)
// ============================================
app.get('/', async (req, res) => {
  await fetchBase44Data();
  res.render('dashboard', {
    title: 'PW Books APIs by Aryan',
    api: apiData,
    tokenSet: !!apiData.token,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// API ENDPOINTS
// ============================================

// Health
app.get('/api/health', async (req, res) => {
  await fetchBase44Data();
  res.json({
    status: 'OK',
    server: 'PW Books APIs by Aryan',
    timestamp: new Date().toISOString()
  });
});

// Status
app.get('/api/status', async (req, res) => {
  await fetchBase44Data();
  res.json({
    server: 'PW Books APIs by Aryan',
    status: 'operational',
    api: {
      enabled: apiData.mainSwitch.is_enabled,
      status: apiData.mainSwitch.is_enabled ? 'ON' : 'OFF'
    },
    token: {
      set: !!apiData.token,
      name: apiData.tokenName,
      id: apiData.tokenId
    },
    records: apiData.records.length
  });
});

// Token
app.get('/api/token', async (req, res) => {
  await fetchBase44Data();
  res.json({
    set: !!apiData.token,
    name: apiData.tokenName,
    id: apiData.tokenId,
    length: apiData.token ? apiData.token.length : 0,
    records: apiData.records
  });
});

// ============================================
// PW BOOKS PROXY - FIXED
// ============================================
app.all('/api/pwbooks/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const method = req.method;
    const data = req.body;
    const query = req.query;
    
    // Build full URL
    let fullEndpoint = endpoint;
    if (Object.keys(query).length > 0) {
      fullEndpoint += '?' + new URLSearchParams(query).toString();
    }
    
    const url = `https://api.penpencil.co/${fullEndpoint}`;
    
    const response = await axios({
      method,
      url,
      headers: {
        'Authorization': `Bearer ${apiData.token}`,
        'client-type': 'AI_NCERT'
      },
      data
    });
    
    res.json({
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      status: error.response?.status
    });
  }
});

// ============================================
// CONVENIENCE ENDPOINTS
// ============================================

app.get('/api/book/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    const url = `https://api.penpencil.co/engagement/ai-ncert/v1/books/${bookId}`;
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'Authorization': `Bearer ${apiData.token}`,
        'client-type': 'AI_NCERT'
      }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/book/:bookId/chapters', async (req, res) => {
  try {
    const { bookId } = req.params;
    const url = `https://api.penpencil.co/engagement/ai-ncert/v1/books/${bookId}/all-chapters`;
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'Authorization': `Bearer ${apiData.token}`,
        'client-type': 'AI_NCERT'
      }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/purchased-books', async (req, res) => {
  try {
    const { userId, paymentStatus = 'SUCCESS', page = 1, limit = 100 } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const url = `https://api.penpencil.co/engagement/ai-ncert/v1/books/all-purchased-books?userId=${userId}&paymentStatus=${paymentStatus}&page=${page}&limit=${limit}`;
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'Authorization': `Bearer ${apiData.token}`,
        'client-type': 'AI_NCERT'
      }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
  await fetchBase44Data();
  console.log(`🚀 PW Books APIs by Aryan running on port ${PORT}`);
  console.log(`🔑 Token: ${apiData.token ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`⚡ Status: ${apiData.mainSwitch.is_enabled ? '🟢 ON' : '🔴 OFF'}`);
});