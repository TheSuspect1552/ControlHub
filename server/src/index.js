const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { initDB, getDB } = require('./db');

const PORT = process.env.PORT || 8000;
const AGENT_TOKEN = process.env.AGENT_TOKEN || 'secure-company-token-123';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-prod';

const app = express();
app.use(cors());
// Increase JSON payload size limit for base64 file transfers and screenshots
app.use(express.json({ limit: '50mb' }));

// Map of active connections: agentId -> WebSocket
const activeAgents = new Map();
// Set of active panel WebSocket connections
const activePanels = new Set();

// --- Auth Middleware for REST ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// --- WebSocket Routing & Auth ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const role = url.searchParams.get('role');
  const token = url.searchParams.get('token');

  if (role === 'agent') {
    if (token !== AGENT_TOKEN) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.role = 'agent';
      wss.emit('connection', ws, request);
    });
  } else if (role === 'panel') {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.role = 'panel';
        ws.user = user;
        wss.emit('connection', ws, request);
      });
    });
  } else {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
  }
});

// --- Broadcast Helpers ---
function broadcastToPanels(message) {
  const data = JSON.stringify(message);
  for (const panelWs of activePanels) {
    if (panelWs.readyState === WebSocket.OPEN) {
      panelWs.send(data);
    }
  }
}

// --- WebSocket Handlers ---
wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  if (ws.role === 'agent') {
    const agentId = url.searchParams.get('agentId');
    if (!agentId) return ws.close(4000, 'Missing agentId');

    ws.agentId = agentId;
    activeAgents.set(agentId, ws);
    console.log(`Agent connected: ${agentId}`);

      ws.on('message', async (messageData, isBinary) => {
        try {
          // In ws@8+, messageData is always a Buffer.
          // If the first byte is 0x01, it's a binary stream frame from our agent.
          if (Buffer.isBuffer(messageData) && messageData.length > 1 && messageData[0] === 0x01) {
            // Construct a new buffer for panels: [1 byte Type][36 bytes AgentID][JPEG Data]
            const agentIdBuf = Buffer.alloc(36);
            agentIdBuf.write(agentId, 0, 36, 'utf8');
            const outBuffer = Buffer.concat([Buffer.from([0x01]), agentIdBuf, messageData.subarray(1)]);
            activePanels.forEach(p => {
              if (p.readyState === 1 /* OPEN */) {
                p.send(outBuffer);
              }
            });
            return;
          }

          const messageStr = messageData.toString();
          const message = JSON.parse(messageStr);
          handleAgentMessage(agentId, message, ws);
        } catch (err) {
          console.error(`Invalid message from agent ${agentId}:`, err);
        }
      });

    ws.on('close', async () => {
      activeAgents.delete(agentId);
      console.log(`Agent disconnected: ${agentId}`);
      
      const db = getDB();
      await db.run('UPDATE agents SET lastSeen = ? WHERE id = ?', [new Date().toISOString(), agentId]);
      const agent = await db.get('SELECT * FROM agents WHERE id = ?', [agentId]);
      if (agent) {
        agent.online = false;
        broadcastToPanels({ type: 'agent_update', data: agent });
      }
    });

  } else if (ws.role === 'panel') {
    activePanels.add(ws);
    console.log(`Panel client connected (${ws.user.username})`);

    // Handle incoming messages from panel (direct remote control/files)
    ws.on('message', (messageStr) => {
      try {
        const msg = JSON.parse(messageStr);
        if (msg.type === 'agent_direct') {
          const agentWs = activeAgents.get(msg.agentId);
          if (agentWs && agentWs.readyState === WebSocket.OPEN) {
            agentWs.send(JSON.stringify(msg.data));
          }
        }
      } catch (err) {
        console.error('Error handling panel WS message:', err);
      }
    });

    ws.on('close', () => {
      activePanels.delete(ws);
      console.log('Panel client disconnected');
    });

    // Send initial status dump
    getDB().all('SELECT * FROM agents').then(agents => {
      const agentsList = agents.map(a => ({
        ...a,
        online: activeAgents.has(a.id)
      }));
      ws.send(JSON.stringify({ type: 'init', data: { agents: agentsList } }));
    });
  }
});

async function handleAgentMessage(agentId, message, ws) {
  const db = getDB();
  
  // Relay stream frames or direct responses instantly to panels without DB write overhead
  if (message.type === 'stream_frame' || message.type.startsWith('fs_')) {
    broadcastToPanels({ type: 'agent_direct_response', agentId, data: message });
    return;
  }

  switch (message.type) {
    case 'register': {
      const { hostname, ip, os, cpu, ram } = message.data;
      const lastSeen = new Date().toISOString();
      
      await db.run(`
        INSERT INTO agents (id, hostname, ip, os, cpu, ram, lastSeen)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          hostname=excluded.hostname, ip=excluded.ip, os=excluded.os, 
          cpu=excluded.cpu, ram=excluded.ram, lastSeen=excluded.lastSeen
      `, [agentId, hostname, ip, os, cpu, ram, lastSeen]);
      
      const agentData = await db.get('SELECT * FROM agents WHERE id = ?', [agentId]);
      agentData.online = true;
      
      console.log(`Agent registered/updated: ${hostname} (${ip})`);
      broadcastToPanels({ type: 'agent_update', data: agentData });
      break;
    }
    
    case 'result': {
      const { commandId, success, output, exitCode } = message.data;
      await db.run(`
        UPDATE commands 
        SET status = ?, output = ?, exitCode = ?, executedAt = ?
        WHERE id = ?
      `, [success ? 'completed' : 'failed', output, exitCode, new Date().toISOString(), commandId]);
      
      const cmd = await db.get('SELECT * FROM commands WHERE id = ?', [commandId]);
      if (cmd) {
        broadcastToPanels({ type: 'command_update', data: cmd });
      }
      break;
    }
  }
}

// --- REST API ROUTES ---

// AUTHENTICATION
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = getDB();
  const user = await db.get('SELECT * FROM admins WHERE username = ?', [username]);
  
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// AGENTS MANAGEMENT
app.get('/api/agents', authenticateToken, async (req, res) => {
  const db = getDB();
  const agents = await db.all('SELECT * FROM agents');
  const list = agents.map(a => ({ ...a, online: activeAgents.has(a.id) }));
  res.json(list);
});

app.delete('/api/agents/:id', authenticateToken, async (req, res) => {
  const agentId = req.params.id;
  if (activeAgents.has(agentId)) {
    return res.status(400).json({ error: 'Cannot delete an online agent' });
  }

  const db = getDB();
  await db.run('DELETE FROM agents WHERE id = ?', [agentId]);
  await db.run('DELETE FROM commands WHERE agentId = ?', [agentId]);
  
  broadcastToPanels({ type: 'agent_deleted', data: { id: agentId } });
  res.json({ success: true });
});

app.delete('/api/agents', authenticateToken, async (req, res) => {
  const db = getDB();
  const agents = await db.all('SELECT id FROM agents');
  let deletedCount = 0;
  
  for (const { id } of agents) {
    if (!activeAgents.has(id)) {
      await db.run('DELETE FROM agents WHERE id = ?', [id]);
      await db.run('DELETE FROM commands WHERE agentId = ?', [id]);
      broadcastToPanels({ type: 'agent_deleted', data: { id } });
      deletedCount++;
    }
  }
  
  res.json({ success: true, deletedCount });
});

// COMMANDS
app.post('/api/agents/:id/execute', authenticateToken, async (req, res) => {
  const agentId = req.params.id;
  const { command } = req.body;

  if (!command) return res.status(400).json({ error: 'Command is required' });

  const agentWs = activeAgents.get(agentId);
  const isOnline = !!agentWs;

  const newCommand = {
    id: uuidv4(),
    agentId,
    command,
    status: isOnline ? 'running' : 'pending',
    output: '',
    exitCode: null,
    createdAt: new Date().toISOString(),
    executedAt: null
  };

  const db = getDB();
  await db.run(`
    INSERT INTO commands (id, agentId, command, status, output, exitCode, createdAt, executedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [newCommand.id, newCommand.agentId, newCommand.command, newCommand.status, newCommand.output, newCommand.exitCode, newCommand.createdAt, newCommand.executedAt]);

  if (isOnline) {
    agentWs.send(JSON.stringify({
      type: 'execute',
      data: { commandId: newCommand.id, command: command }
    }));
    res.json(newCommand);
  } else {
    res.status(400).json({ error: 'Agent is offline. Command queued but not executed.' });
  }
});

app.get('/api/commands/:agentId', authenticateToken, async (req, res) => {
  const agentId = req.params.agentId;
  const db = getDB();
  const agentCmds = await db.all('SELECT * FROM commands WHERE agentId = ? ORDER BY createdAt DESC LIMIT 50', [agentId]);
  res.json(agentCmds);
});

// CHANGE PASSWORD
app.post('/api/auth/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new password are required' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const db = getDB();
  const user = await db.get('SELECT * FROM admins WHERE id = ?', [req.user.id]);
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await db.run('UPDATE admins SET password = ? WHERE id = ?', [hash, user.id]);
  res.json({ success: true });
});

// DOWNLOAD AGENT BINARY
app.get('/api/download/agent', authenticateToken, (req, res) => {
  const { host, token } = req.query;
  const targetHost = host || 'localhost:8000';
  const targetToken = token || process.env.AGENT_TOKEN || 'secure-company-token-123';
  
  const exec = require('child_process').exec;
  const fs = require('fs');
  const os = require('os');
  const { v4: uuidv4 } = require('uuid');
  const agentDir = path.join(__dirname, '../../agent');
  
  const tempExe = path.join(os.tmpdir(), `agent_${uuidv4()}.exe`);

  const cmd = `go build -ldflags "-s -w -H=windowsgui -X main.ServerHost=${targetHost} -X main.Token=${targetToken}" -o "${tempExe}" .`;
  
  exec(cmd, { cwd: agentDir }, (error, stdout, stderr) => {
    if (error) {
      console.error('Build error:', stderr);
      return res.status(500).json({ error: 'Compilation failed', details: stderr });
    }
    
    if (fs.existsSync(tempExe)) {
      res.download(tempExe, 'agent.exe', (err) => {
        // Cleanup after download
        if (fs.existsSync(tempExe)) fs.unlinkSync(tempExe);
      });
    } else {
      res.status(500).json({ error: 'Compiled binary not found after build' });
    }
  });
});

// STATIC FILES FOR WEB PANEL
app.use(express.static(path.join(__dirname, '../../web/dist')));

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../web/dist/index.html'));
});

// --- INIT & START ---
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Enterprise Control Hub Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
