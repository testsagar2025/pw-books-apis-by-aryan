const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURATION
// ============================================

const BASE44_API_URL = 'https://api-master-flow.base44.app/api/apps/6a80493744aee87d01c632ed/entities/ApiEntry';
let apiData = {
  records: [],
  mainSwitch: { is_enabled: true },
  token: null,
  tokenName: '',
  tokenId: ''
};

// ============================================
// MIDDLEWARE
// ============================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// FETCH DATA FROM BASE44
// ============================================

async function fetchBase44Data() {
  try {
    const response = await axios.get(BASE44_API_URL, {
      params: {
        sort: '-created_date',
        limit: 500
      }
    });
    
    const records = response.data || [];
    
    // Find main switch
    const mainSwitch = records.find(r => r.type === 'main_switch');
    if (mainSwitch) {
      apiData.mainSwitch = mainSwitch;
    }
    
    // Find token records
    const tokenRecords = records.filter(r => r.type === 'api' && r.bearer_token);
    apiData.records = tokenRecords;
    
    if (tokenRecords.length > 0) {
      const activeToken = tokenRecords[0];
      apiData.token = activeToken.bearer_token;
      apiData.tokenName = activeToken.name || 'Default Token';
      apiData.tokenId = activeToken.id || '';
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
// ROUTES
// ============================================

// Dashboard
app.get('/', async (req, res) => {
  await fetchBase44Data();
  res.render('dashboard', {
    title: 'PW Books APIs by Aryan',
    api: apiData,
    tokenSet: !!apiData.token,
    timestamp: new Date().toISOString()
  });
});

// API Status
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

// Health
app.get('/api/health', async (req, res) => {
  await fetchBase44Data();
  res.json({
    status: 'OK',
    server: 'PW Books APIs by Aryan',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
  await fetchBase44Data();
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   📚 PW BOOKS APIs BY ARYAN        ║`);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║   🚀 Server: http://localhost:${PORT}    ║`);
  console.log(`║   🔑 Token: ${apiData.token ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`║   ⚡ Status: ${apiData.mainSwitch.is_enabled ? '🟢 ON' : '🔴 OFF'}`);
  console.log(`║   📊 Records: ${apiData.records.length}`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});