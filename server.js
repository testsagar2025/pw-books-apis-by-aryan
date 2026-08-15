const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@base44/sdk');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const base44 = createClient({
  appId: process.env.BASE44_APP_ID || "6a80493744aee87d01c632ed",
  headers: {
    "api_key": process.env.BASE44_API_KEY || "a59ffe885a234413baaa0ff678844bc5"
  }
});

let apiSettings = { mainSwitch: { is_enabled: true }, apiRecords: [] };
let CURRENT_TOKEN = '';

async function loadBase44Data() {
  try {
    const response = await base44.entities.ApiEntry.list();
    const records = response.data || [];
    const mainSwitch = records.find(r => r.type === 'main_switch');
    if (mainSwitch) apiSettings.mainSwitch = mainSwitch;
    const apiRecords = records.filter(r => r.type === 'api' && r.bearer_token);
    apiSettings.apiRecords = apiRecords;
    if (apiRecords.length > 0) {
      CURRENT_TOKEN = apiRecords[0].bearer_token || '';
    }
    return apiSettings;
  } catch (error) {
    console.error('❌ Base44 load error:', error.message);
    return apiSettings;
  }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  await loadBase44Data();
  res.render('dashboard', {
    title: 'PW Books APIs by Aryan',
    apiSettings,
    token: { set: !!CURRENT_TOKEN, name: 'Default Token' },
    logs: [],
    callCount: 0,
    uptime: 0,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  await loadBase44Data();
  res.json({
    status: 'OK',
    server: 'PW Books APIs by Aryan',
    base44: { connected: true },
    api: {
      enabled: apiSettings.mainSwitch.is_enabled,
      tokenSet: !!CURRENT_TOKEN,
      records: apiSettings.apiRecords.length
    }
  });
});

app.listen(PORT, async () => {
  await loadBase44Data();
  console.log(`🚀 PW Books APIs by Aryan running on port ${PORT}`);
  console.log(`🔑 Token: ${CURRENT_TOKEN ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`⚡ Status: ${apiSettings.mainSwitch.is_enabled ? '🟢 ON' : '🔴 OFF'}`);
});