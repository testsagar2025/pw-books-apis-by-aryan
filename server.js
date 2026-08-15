const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const session = require('express-session'); // ← ADD THIS

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
app.use(express.urlencoded({ extended: true })); // ← ADD THIS for form data

// ============================================
// SESSION MIDDLEWARE (REQUIRED for docs auth)
// ============================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// ============================================
// DOCS AUTHORIZATION MIDDLEWARE (MUST BE BEFORE /docs route)
// ============================================
app.use('/docs', (req, res, next) => {
    // Skip middleware for these paths
    if (req.path === '/verify' || req.path === '/logout') {
        return next();
    }
    
    // Check if user is authorized for /docs
    if (req.path === '/docs' && !req.session?.docsAuthorized) {
        return res.render('docs-auth', {
            title: 'Access Required - PW Books APIs by Aryan',
            error: null,
            timestamp: new Date().toISOString()
        });
    }
    next();
});

// ============================================
// FETCH BASE44 DATA
// ============================================
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
// DASHBOARD
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
app.get('/api/health', async (req, res) => {
    await fetchBase44Data();
    res.json({ status: 'OK', server: 'PW Books APIs by Aryan', timestamp: new Date().toISOString() });
});

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
// PW BOOKS PROXY
// ============================================
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
// DOCS ROUTES (Password Protected)
// ============================================

// Main docs page
app.get('/docs', async (req, res) => {
    await fetchBase44Data();
    
    // Check if API is active
    if (!apiData.mainSwitch.is_enabled) {
        return res.status(503).render('inactive', {
            title: 'API Inactive - PW Books APIs by Aryan',
            api: apiData
        });
    }
    
    res.render('docs', {
        title: 'API Documentation - PW Books APIs by Aryan',
        api: apiData,
        tokenSet: !!apiData.token,
        timestamp: new Date().toISOString()
    });
});

// Docs password verification
app.post('/docs/verify', async (req, res) => {
    const { password } = req.body;
    const DOCS_PASSWORD = '123@123';
    
    if (password === DOCS_PASSWORD) {
        req.session.docsAuthorized = true;
        return res.redirect('/docs');
    }
    
    res.render('docs-auth', {
        title: 'Access Denied - PW Books APIs by Aryan',
        error: 'Invalid password. Please try again.',
        timestamp: new Date().toISOString()
    });
});

// Docs logout
app.get('/docs/logout', (req, res) => {
    req.session.docsAuthorized = false;
    res.redirect('/docs');
});

// ============================================
// 404 - Page Not Found (Catch-all - MUST BE LAST)
// ============================================
app.use((req, res) => {
    res.status(404).render('404', {
        title: '404 - Page Not Found',
        url: req.originalUrl
    });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
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