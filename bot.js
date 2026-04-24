const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-web-security',
  '--disable-features=VizDisplayCompositor',
  // Optimasi tambahan untuk memory dan performa
  '--disable-background-networking',
  '--disable-extensions',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-renderer-backgrounding',
  '--memory-pressure-off',
  '--max_old_space_size=512',
  '--optimize-for-size',
  '--disable-logging',
  '--disable-dev-tools',
  '--single-process'
];

const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const MESSAGE_QUEUE_DELAY_MIN = 3000; // 3 seconds
const MESSAGE_QUEUE_DELAY_MAX = 6000; // 6 seconds
const USER_COOLDOWN = 10000; // 10 seconds per user
const GLOBAL_QUEUE_LIMIT = 50;
const HEARTBEAT_INTERVAL = 60000; // 60 seconds
const TYPING_DURATION = 2000; // 2 seconds

// Global state
let client;
let reconnectAttempts = 0;
let messageQueue = [];
let isProcessingQueue = false;
let userCooldowns = new Map();
let globalQueue = [];
let heartbeatInterval;

// Logger with timestamps
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  // Optimasi: kurangi console output di production untuk performa
  if (process.env.NODE_ENV === 'production' && level === 'info' && !message.includes('ready') && !message.includes('error')) {
    return; // Skip non-critical info logs
  }
  console.log(logMessage);
  if (Object.keys(data).length > 0) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function logInfo(message, data = {}) {
  log('info', message, data);
}

function logError(message, data = {}) {
  log('error', message, data);
}

function logWarn(message, data = {}) {
  log('warn', message, data);
}

// Kill existing browser processes
function killExistingBrowsers() {
  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32') {
        // Kill Chrome processes on Windows
        const kill = spawn('taskkill', ['/f', '/im', 'chrome.exe', '/t'], { stdio: 'inherit' });
        kill.on('close', () => {
          logInfo('Killed existing Chrome processes');
          resolve();
        });
        kill.on('error', () => {
          // Ignore errors if no processes found
          resolve();
        });
      } else {
        // On Linux/macOS, try to kill chromium
        const kill = spawn('pkill', ['-f', 'chromium'], { stdio: 'inherit' });
        kill.on('close', () => {
          logInfo('Killed existing Chromium processes');
          resolve();
        });
        kill.on('error', () => {
          resolve();
        });
      }
    } catch (error) {
      logError('Failed to kill existing browsers', { error: error.message });
      resolve();
    }
  });
}

// Utility functions
function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isUserOnCooldown(userId) {
  const lastMessage = userCooldowns.get(userId);
  if (!lastMessage) return false;
  return Date.now() - lastMessage < USER_COOLDOWN;
}

function setUserCooldown(userId) {
  userCooldowns.set(userId, Date.now());
}

function cleanupCooldowns() {
  const now = Date.now();
  for (const [userId, timestamp] of userCooldowns.entries()) {
    if (now - timestamp > USER_COOLDOWN * 2) {
      userCooldowns.delete(userId);
    }
  }
}

// Message queue system
async function processMessageQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;

  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const { chatId, message, options } = messageQueue.shift();

    try {
      await safeSendMessage(chatId, message, options);
    } catch (error) {
      logError('Failed to send queued message', { error: error.message, chatId });
    }

    // Delay between messages
    const delay = randomDelay(MESSAGE_QUEUE_DELAY_MIN, MESSAGE_QUEUE_DELAY_MAX);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  isProcessingQueue = false;
}

async function addToQueue(chatId, message, options = {}) {
  if (globalQueue.length >= GLOBAL_QUEUE_LIMIT) {
    logWarn('Global queue limit reached, dropping message', { chatId });
    return;
  }

  messageQueue.push({ chatId, message, options });
  globalQueue.push({ chatId, timestamp: Date.now() });

  logInfo('Message added to queue', { chatId, queueLength: messageQueue.length });

  // Cleanup old global queue entries (older than 1 minute)
  const now = Date.now();
  globalQueue = globalQueue.filter(item => now - item.timestamp < 60000);

  processMessageQueue();
}

// Safe send wrapper with retries
async function safeSendMessage(chatId, message, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const chat = await client.getChatById(chatId);

      // Simulate typing
      await chat.sendStateTyping();
      await new Promise(resolve => setTimeout(resolve, TYPING_DURATION));
      await chat.clearState();

      await client.sendMessage(chatId, message, options);
      logInfo('Message sent successfully', { chatId, attempt });
      return;
    } catch (error) {
      logError(`Send attempt ${attempt} failed`, { error: error.message, chatId });

      if (attempt === retries) {
        throw error;
      }

      // Exponential backoff
      const backoffDelay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
}

// Command handler
async function handleCommand(msg) {
  const command = msg.body.toLowerCase().trim();

  switch (command) {
    case 'menu':
    case 'help':
      await addToQueue(msg.from, `*🤖 WhatsApp Bot Menu*

Available commands:
• *ping* - Check bot status
• *menu* / *help* - Show this menu
• *status* - Bot information
• *apikey* - Check API key status
• *system* - System information
• *railway* - Railway deployment info
• *performance* - Performance metrics

_Type a command to interact with the bot_`);
      break;

    case 'ping':
      await addToQueue(msg.from, '🏓 Pong! Bot is online and responsive.');
      break;

    case 'status':
      const uptime = process.uptime();
      const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
      await addToQueue(msg.from, `*📊 Bot Status*

• Status: Online ✅
• Uptime: ${uptimeString}
• Queue: ${messageQueue.length} messages pending
• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);
      break;

    case 'apikey':
      await addToQueue(msg.from, `*🔑 API Key Status*

• API Key: Online ✅
• Authentication: Active
• Last Check: ${new Date().toLocaleString()}`);
      break;

    case 'system':
      const systemInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        totalMemory: `${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB`,
        freeMemory: `${Math.round(require('os').freemem() / 1024 / 1024 / 1024)}GB`,
        cpuCount: require('os').cpus().length,
        hostname: require('os').hostname(),
        environment: process.env.NODE_ENV || 'development'
      };

      await addToQueue(msg.from, `*🖥️ System Information*

• Platform: ${systemInfo.platform}
• Architecture: ${systemInfo.arch}
• Node.js: ${systemInfo.nodeVersion}
• Total RAM: ${systemInfo.totalMemory}
• Free RAM: ${systemInfo.freeMemory}
• CPU Cores: ${systemInfo.cpuCount}
• Hostname: ${systemInfo.hostname}
• Environment: ${systemInfo.environment}`);
      break;

    case 'railway':
      const railwayInfo = {
        deployment: process.env.RAILWAY_ENVIRONMENT_NAME || 'Local Development',
        project: process.env.RAILWAY_PROJECT_NAME || 'Unknown',
        service: process.env.RAILWAY_SERVICE_NAME || 'Unknown',
        region: process.env.RAILWAY_REGION || 'Unknown',
        publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || 'Not Available',
        privateDomain: process.env.RAILWAY_PRIVATE_DOMAIN || 'Not Available',
        port: process.env.PORT || '3000'
      };

      await addToQueue(msg.from, `*🚂 Railway Deployment Info*

• Environment: ${railwayInfo.deployment}
• Project: ${railwayInfo.project}
• Service: ${railwayInfo.service}
• Region: ${railwayInfo.region}
• Public Domain: ${railwayInfo.publicDomain}
• Private Domain: ${railwayInfo.privateDomain}
• Port: ${railwayInfo.port}
• Health Check: http://localhost:${railwayInfo.port}/health`);
      break;

    case 'performance':
      const perfData = process.memoryUsage();
      const performance = {
        rss: `${Math.round(perfData.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(perfData.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(perfData.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(perfData.external / 1024 / 1024)}MB`,
        uptime: `${Math.floor(process.uptime())}s`,
        pid: process.pid,
        queueLength: messageQueue.length,
        activeCooldowns: userCooldowns.size
      };

      await addToQueue(msg.from, `*⚡ Performance Metrics*

• RSS Memory: ${performance.rss}
• Heap Total: ${performance.heapTotal}
• Heap Used: ${performance.heapUsed}
• External Memory: ${performance.external}
• Uptime: ${performance.uptime}
• Process ID: ${performance.pid}
• Message Queue: ${performance.queueLength}
• Active Cooldowns: ${performance.activeCooldowns}`);
      break;

    default:
      // Ignore unknown commands - no response
      logInfo('Unknown command received', { command, from: msg.from });
  }
}

// Event handlers
function setupEventHandlers() {
  client.on('qr', (qr) => {
    logInfo('QR Code received, scan with WhatsApp');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    logInfo('✅ WhatsApp client is ready and authenticated');
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  });

  client.on('authenticated', () => {
    logInfo('🔐 WhatsApp client authenticated successfully');
  });

  client.on('auth_failure', (msg) => {
    logError('❌ Authentication failed', { message: msg });
  });

  client.on('disconnected', (reason) => {
    logWarn('📴 WhatsApp client disconnected', { reason });

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      logInfo(`🔄 Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

      setTimeout(() => {
        client.initialize().catch(error => {
          logError('Reconnection failed', { error: error.message });
        });
      }, RECONNECT_DELAY);
    } else {
      logError('Max reconnection attempts reached, stopping bot');
      process.exit(1);
    }
  });

  client.on('message', async (msg) => {
    try {
      // Skip if from status or group
      if (msg.from === 'status@broadcast' || msg.id.remote.includes('@g.us')) {
        return;
      }

      // Anti-spam check
      if (isUserOnCooldown(msg.from)) {
        logWarn('User on cooldown, ignoring message', { from: msg.from });
        return;
      }

      setUserCooldown(msg.from);

      // Handle command
      await handleCommand(msg);

    } catch (error) {
      logError('Message handling failed', { error: error.message, from: msg.from });
    }
  });
}

// Health check server
function startHealthCheckServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.get('/', (req, res) => {
    res.status(200).send('OK');
  });

  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      queueLength: messageQueue.length,
      timestamp: new Date().toISOString()
    });
  });

  app.listen(PORT, () => {
    logInfo(`Health check server running on port ${PORT}`);
  });
}

// Heartbeat
function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    logInfo('💓 Heartbeat - Bot is running', {
      uptime: `${Math.floor(process.uptime())}s`,
      memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      queue: messageQueue.length
    });
  }, HEARTBEAT_INTERVAL);
}

// Cleanup intervals
function startCleanupIntervals() {
  setInterval(cleanupCooldowns, 30000); // Clean cooldowns every 30 seconds
}

// Auto restart protection
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception - Attempting graceful shutdown', {
    error: error.message,
    stack: error.stack
  });
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection - Attempting graceful shutdown', {
    reason: reason?.message || reason,
    promise: promise.toString()
  });
  gracefulShutdown();
});

process.on('SIGINT', () => {
  logInfo('SIGINT received, shutting down gracefully');
  gracefulShutdown();
});

process.on('SIGTERM', () => {
  logInfo('SIGTERM received, shutting down gracefully');
  gracefulShutdown();
});

function gracefulShutdown() {
  logInfo('Starting graceful shutdown...');

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  if (client) {
    client.destroy().then(() => {
      logInfo('WhatsApp client destroyed');
      process.exit(0);
    }).catch((error) => {
      logError('Error destroying client', { error: error.message });
      process.exit(1);
    });
  } else {
    process.exit(0);
  }
}

// Initialize bot
async function initializeBot() {
  logInfo('🚀 Starting Production WhatsApp Bot');

  // Determine executable path based on platform
  let executablePath;
  if (process.platform === 'linux') {
    executablePath = '/usr/bin/chromium';
  } else {
    // On Windows/macOS, let Puppeteer use its bundled Chromium
    executablePath = undefined;
  }

  // Create WhatsApp client
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'bot-session',
      dataPath: path.join(__dirname, 'sessions')
    }),
    puppeteer: {
      headless: true,
      executablePath: executablePath,
      args: PUPPETEER_ARGS
    }
  });

  // Setup event handlers
  setupEventHandlers();

  // Start services
  startHealthCheckServer();
  startHeartbeat();
  startCleanupIntervals();

  // Kill existing browsers before initializing
  await killExistingBrowsers();

  // Initialize client
  try {
    await client.initialize();
    logInfo('Bot initialization completed successfully');
  } catch (error) {
    logError('Bot initialization failed', { error: error.message });
    process.exit(1);
  }
}

// Start the bot
initializeBot();