import React, { useState, useEffect, useRef } from 'react';
import { 
  Monitor, Search, Terminal, RefreshCw, Play, Pause,
  CheckCircle, AlertCircle, Clock, 
  ChevronLeft, Trash2, Folder, File as FileIcon, Download, Upload, 
  Lock, LogOut, Video, Settings, MousePointer2, Keyboard, User, Shield, Package
} from 'lucide-react';

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

const BACKEND_URL = '';
const WS_BASE_URL = getWebSocketUrl();

/* ─── Login ─────────────────────────────────────────────── */
function Login({ setToken }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        setToken(data.token);
      } else {
        setError(data.error || 'Неверные данные');
      }
    } catch (err) {
      setError('Нет связи с сервером');
    }
    setLoading(false);
  };

  return (
    <div style={{ 
      display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', 
      background: '#09090b',
    }}>
      <div style={{ width: '340px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)', marginBottom: '1.25rem' }}>
            <Shield size={24} color="#6366f1" />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#fafafa', letterSpacing: '-0.02em' }}>Control Hub</h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '0.4rem' }}>Войдите для продолжения</p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#ef4444', fontSize: '0.8rem', textAlign: 'center' }}>
              {error}
            </div>
          )}
          
          <input 
            type="text" 
            placeholder="Логин"
            className="input-field"
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
            autoFocus
          />
          <input 
            type="password" 
            placeholder="Пароль"
            className="input-field"
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '0.6rem', justifyContent: 'center', marginTop: '0.25rem', fontSize: '0.85rem' }} 
            disabled={loading}
          >
            {loading ? <RefreshCw className="spinner" size={16} /> : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────── */
function Dashboard({ token, setToken }) {
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [activeTab, setActiveTab] = useState('terminal');
  
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [consoleOutput, setConsoleOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentCmdId, setCurrentCmdId] = useState(null);

  const [currentPath, setCurrentPath] = useState('C:\\');
  const [files, setFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const [streamActive, setStreamActive] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [enableMouseControl, setEnableMouseControl] = useState(false);
  const [enableKeyboardControl, setEnableKeyboardControl] = useState(false);
  const [streamQuality, setStreamQuality] = useState('medium');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  
  const [buildHost, setBuildHost] = useState(window.location.host);
  const [buildToken, setBuildToken] = useState('secure-company-token-123');
  const [isBuilding, setIsBuilding] = useState(false);
  
  const currentCmdIdRef = useRef(null);
  const selectedAgentIdRef = useRef(null);
  const wsRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => { currentCmdIdRef.current = currentCmdId; }, [currentCmdId]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const onlineCount = agents.filter(a => a.online).length;

  const fetchApi = async (url, options = {}) => {
    const res = await fetch(`${BACKEND_URL}${url}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    if (res.status === 401 || res.status === 403) {
      handleLogout();
      throw new Error('Unauthorized');
    }
    return res;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken(null);
    if (wsRef.current) wsRef.current.close();
  };

  /* WebSocket */
  useEffect(() => {
    let reconnectTimeout;
    const connect = () => {
      setWsStatus('connecting');
      const ws = new WebSocket(`${WS_BASE_URL}?role=panel&token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => setWsStatus('connected');
      ws.binaryType = 'blob'; ws.onmessage = async (event) => { if (event.data instanceof Blob) { const blob = event.data; const typeBuf = await blob.slice(0, 1).arrayBuffer(); if (new Uint8Array(typeBuf)[0] === 0x01) { const agentId = await blob.slice(1, 37).text(); if (agentId === selectedAgentIdRef.current) { const jpegBlob = blob.slice(37); const bmp = await createImageBitmap(jpegBlob); const canvas = canvasRef.current; if (canvas) { canvas.width = bmp.width; canvas.height = bmp.height; canvas.getContext('2d').drawImage(bmp, 0, 0); } } } return; } try { handleWsMessage(JSON.parse(event.data)); } catch {} };
      ws.onclose = () => { setWsStatus('disconnected'); reconnectTimeout = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { clearTimeout(reconnectTimeout); if (wsRef.current) wsRef.current.close(); };
  }, [token]);

  const sendAgentDirect = (agentId, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'agent_direct', agentId, data }));
    }
  };

  const handleWsMessage = (message) => {
    switch (message.type) {
      case 'init':
        setAgents(message.data.agents);
        break;
      case 'agent_update':
        setAgents(prev => {
          const idx = prev.findIndex(a => a.id === message.data.id);
          if (idx !== -1) { const u = [...prev]; u[idx] = message.data; return u; }
          return [...prev, message.data];
        });
        break;
      case 'agent_deleted':
        setAgents(prev => prev.filter(a => a.id !== message.data.id));
        if (selectedAgentIdRef.current === message.data.id) setSelectedAgentId(null);
        break;
      case 'command_update': {
        const cmd = message.data;
        if (selectedAgentIdRef.current === cmd.agentId) {
          setCommandHistory(prev => {
            const idx = prev.findIndex(c => c.id === cmd.id);
            if (idx !== -1) { const u = [...prev]; u[idx] = cmd; return u; }
            return [cmd, ...prev];
          });
          const active = currentCmdIdRef.current;
          if (active === cmd.id || (!active && cmd.status !== 'running')) {
            if (cmd.id === active) { setIsExecuting(false); setCurrentCmdId(null); }
            let out = cmd.output || '';
            if (cmd.exitCode !== null && cmd.exitCode !== 0) out += `\n\n[exit code: ${cmd.exitCode}]`;
            setConsoleOutput(out);
            setSelectedHistoryItem(cmd);
          }
        }
        break;
      }
      case 'agent_direct_response': {
        const { agentId, data } = message;
        if (agentId !== selectedAgentIdRef.current) return;
        if (data.type === 'fs_list_res') {
          setFiles(data.data.list || []);
          setCurrentPath(data.data.path);
          setIsLoadingFiles(false);
          if (data.data.error) alert(data.data.error);
        } else if (data.type === 'fs_delete_res') {
          setIsLoadingFiles(false);
          if (data.data.error) alert(data.data.error);
          else loadDirectory(currentPath);
        } else if (data.type === 'fs_read_res') {
          if (data.data.error) alert(data.data.error);
          else {
            const blob = b64ToBlob(data.data.data);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = data.data.path.split('\\').pop() || data.data.path.split('/').pop();
            a.click(); URL.revokeObjectURL(url);
          }
        } else if (data.type === 'fs_write_res') {
          setIsLoadingFiles(false);
          if (data.data.error) alert(data.data.error);
          else loadDirectory(currentPath);
        } else if (data.type === 'stream_frame') {
          setCurrentFrame(`data:image/jpeg;base64,${data.data.image}`);
        }
        break;
      }
    }
  };

  /* Data loading */
  useEffect(() => {
    if (!selectedAgentId) { if (activeTab !== 'settings') setActiveTab('terminal'); return; }
    fetchApi(`/api/commands/${selectedAgentId}`)
      .then(r => r.json())
      .then(data => {
        setCommandHistory(data);
        if (data.length > 0) { setSelectedHistoryItem(data[0]); if (!isExecuting) setConsoleOutput(data[0].output || ''); }
        else { setSelectedHistoryItem(null); setConsoleOutput(''); }
      }).catch(() => {});
    setActiveTab('terminal');
    setStreamActive(false);
    sendAgentDirect(selectedAgentId, { type: 'stream_stop' });
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) return;
    if (activeTab === 'files') loadDirectory('C:\\');
    if (activeTab === 'screen') { setStreamActive(true); sendAgentDirect(selectedAgentId, { type: 'stream_start', data: qualityOptions[streamQuality] }); }
    else { setStreamActive(false); sendAgentDirect(selectedAgentId, { type: 'stream_stop' }); setCurrentFrame(null); }
  }, [activeTab]);

  const qualityOptions = {
    low: { fps: 15, width: 1280, quality: 50 },
    medium: { fps: 24, width: 1920, quality: 70 },
    high: { fps: 30, width: 0, quality: 85 }
  };

  const handleQualityChange = (e) => {
    const q = e.target.value;
    setStreamQuality(q);
    if (streamActive) {
      sendAgentDirect(selectedAgentId, { type: 'stream_config', data: qualityOptions[q] });
    }
  };

  const toggleStream = () => {
    if (streamActive) { setStreamActive(false); sendAgentDirect(selectedAgentId, { type: 'stream_stop' }); }
    else { setStreamActive(true); sendAgentDirect(selectedAgentId, { type: 'stream_start', data: qualityOptions[streamQuality] }); }
  };

  /* Terminal */
  const handleExec = async (cmd) => {
    if (!selectedAgentId || !cmd.trim() || !selectedAgent?.online) return;
    setIsExecuting(true);
    setConsoleOutput(''); setSelectedHistoryItem(null);
    try {
      const res = await fetchApi(`/api/agents/${selectedAgentId}/execute`, { method: 'POST', body: JSON.stringify({ command: cmd }) });
      const data = await res.json();
      if (res.ok) { setCurrentCmdId(data.id); setCommandHistory(prev => [data, ...prev]); setConsoleOutput('Ожидание ответа...'); }
      else { setIsExecuting(false); setConsoleOutput(`Ошибка: ${data.error}`); }
    } catch (err) { setIsExecuting(false); setConsoleOutput(`Ошибка: ${err.message}`); }
  };

  /* Files */
  const loadDirectory = (p) => { setIsLoadingFiles(true); sendAgentDirect(selectedAgentId, { type: 'fs_list', data: { path: p } }); };
  const goUp = () => { const p = currentPath.split(/\\|\//).filter(Boolean); if (p.length <= 1) return; p.pop(); loadDirectory(p.join('\\') + '\\'); };
  const openDir = (f) => { if (f.isDir) { const s = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\'; loadDirectory(`${currentPath}${s}${f.name}`); } };
  const delFile = (name) => { if (!confirm(`Удалить ${name}?`)) return; setIsLoadingFiles(true); const s = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\'; sendAgentDirect(selectedAgentId, { type: 'fs_delete', data: { path: `${currentPath}${s}${name}` } }); };
  const dlFile = (name) => { const s = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\'; sendAgentDirect(selectedAgentId, { type: 'fs_read', data: { path: `${currentPath}${s}${name}` } }); };
  const ulFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setIsLoadingFiles(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result.split(',')[1];
      const s = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\';
      sendAgentDirect(selectedAgentId, { type: 'fs_write', data: { path: `${currentPath}${s}${file.name}`, data: b64 } });
    };
    reader.readAsDataURL(file);
  };

  /* Remote Desktop */
  const handleMouse = (e, action) => {
    if (!streamActive || !enableMouseControl || !canvasRef.current || !selectedAgent?.online) return;
    const canvas = canvasRef.current, rect = canvas.getBoundingClientRect();
    const nw = canvas.width, nh = canvas.height;
    if (!nw || !nh) return;
    const scale = Math.min(rect.width / nw, rect.height / nh);
    const rw = nw * scale, rh = nh * scale;
    const ox = (rect.width - rw) / 2, oy = (rect.height - rh) / 2;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    if (cx < ox || cx > ox + rw || cy < oy || cy > oy + rh) return;
    const x = (cx - ox) / scale, y = (cy - oy) / scale;
    const px = x / nw, py = y / nh;
    let button = 'left';
    if (e.button === 1) button = 'middle';
    if (e.button === 2) button = 'right';
    if (action === 'down' && enableKeyboardControl) canvas.focus();
    sendAgentDirect(selectedAgentId, { type: 'input_mouse', data: { action, px, py, button } });
    e.preventDefault();
  };
  const handleKeyDown = (e) => { if (!streamActive || !enableKeyboardControl) return; sendAgentDirect(selectedAgentId, { type: 'input_key', data: { action: 'down', vk: e.keyCode } }); e.preventDefault(); };
  const handleKeyUp = (e) => { if (!streamActive || !enableKeyboardControl) return; sendAgentDirect(selectedAgentId, { type: 'input_key', data: { action: 'up', vk: e.keyCode } }); e.preventDefault(); };

  /* Password */
  const changePwd = async (e) => {
    e.preventDefault();
    try {
      const res = await fetchApi('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await res.json();
      if (res.ok) { setPwdMsg('✓ Пароль изменен'); setCurrentPassword(''); setNewPassword(''); }
      else setPwdMsg(`✗ ${data.error}`);
    } catch { setPwdMsg('✗ Ошибка сети'); }
  };

  /* Helpers */
  function b64ToBlob(b64) { const bs = atob(b64); const a = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) a[i] = bs.charCodeAt(i); return new Blob([a]); }
  const fmtBytes = (b) => { if (!b) return '0 B'; const k = 1024, s = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]; };

  const filtered = agents.filter(a => {
    const q = searchQuery.toLowerCase();
    return a.hostname?.toLowerCase().includes(q) || a.ip?.toLowerCase().includes(q);
  });

  /* ─── Render ─── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header className="app-header">
        <div className="logo-container" style={{ cursor: 'pointer' }} onClick={() => setSelectedAgentId(null)}>
          <Terminal className="logo-icon" size={20} />
          <span className="logo-text">Control Hub</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '0.5rem', background: 'var(--bg-elevated)', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>{onlineCount}/{agents.length}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className={`status-badge ${wsStatus === 'connected' ? 'online' : 'offline'}`}>
            <span className="pulse-dot"></span> {wsStatus === 'connected' ? 'подключен' : wsStatus === 'connecting' ? 'подключение...' : 'отключен'}
          </div>
          <button className="btn btn-ghost" onClick={() => { setSelectedAgentId(null); setActiveTab('settings'); }} title="Настройки">
            <Settings size={16} />
          </button>
          <button className="btn btn-ghost" onClick={handleLogout} title="Выход">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="dashboard-container">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-search">
            <div className="search-input-wrapper">
              <Search size={15} />
              <input type="text" placeholder="Поиск..." className="search-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>

          <div className="agent-list">
            {filtered.map(agent => (
              <div key={agent.id} className={`agent-item ${selectedAgentId === agent.id ? 'active' : ''}`} onClick={() => setSelectedAgentId(agent.id)}>
                <div className="agent-item-left">
                  <span className="agent-name">{agent.hostname}</span>
                  <span className="agent-ip">{agent.ip}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div className={`status-badge ${agent.online ? 'online' : 'offline'}`}>
                    <span className="pulse-dot"></span>{agent.online ? 'on' : 'off'}
                  </div>
                  {!agent.online && (
                    <button className="btn btn-ghost" style={{ padding: '0.2rem', color: 'var(--text-dim)' }} 
                      onClick={async (e) => { e.stopPropagation(); if(confirm('Удалить агента?')) await fetchApi(`/api/agents/${agent.id}`, { method: 'DELETE' }); }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                Нет агентов
              </div>
            )}
          </div>

          {agents.some(a => !a.online) && (
            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }} 
                onClick={async () => { if(confirm('Очистить все offline агенты?')) await fetchApi('/api/agents', { method: 'DELETE' }); }}>
                <Trash2 size={13} /> Очистить offline
              </button>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="workspace">
          {selectedAgent ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Agent Header */}
              <div style={{ padding: '1.25rem 1.5rem 0', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Monitor size={18} color="var(--accent)" /> {selectedAgent.hostname}
                    </h2>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span>{selectedAgent.ip}</span>
                      <span>{selectedAgent.os}</span>
                      <span>{selectedAgent.cpu}</span>
                      <span>{selectedAgent.ram}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className={`status-badge ${selectedAgent.online ? 'online' : 'offline'}`}>
                      <span className="pulse-dot"></span>{selectedAgent.online ? 'Online' : 'Offline'}
                    </div>
                    {selectedAgent.online && (
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          if (confirm('Внимание! Это немедленно завершит процесс агента на удаленном компьютере. Он больше не появится в сети до ручного перезапуска. Выключить?')) {
                            sendAgentDirect(selectedAgentId, { type: 'kill_agent' });
                          }
                        }}
                      >
                        <AlertCircle size={14} /> Выключить
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem' }}>
                  <button className={`tab-button ${activeTab === 'terminal' ? 'active' : ''}`} onClick={() => setActiveTab('terminal')}>
                    <Terminal size={15} /> Терминал
                  </button>
                  <button className={`tab-button ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
                    <Folder size={15} /> Файлы
                  </button>
                  <button className={`tab-button ${activeTab === 'screen' ? 'active' : ''}`} onClick={() => setActiveTab('screen')}>
                    <Video size={15} /> Экран
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
                
                {/* ── Terminal ── */}
                {activeTab === 'terminal' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem', height: '100%' }}>
                    <div className="card console-card" style={{ height: '100%' }}>
                      <div className="console-header">
                        <Terminal size={14} /> PowerShell
                        {isExecuting && <RefreshCw size={13} className="spinner" style={{ color: 'var(--accent)', marginLeft: 'auto' }} />}
                      </div>
                      <div className="console-body" style={{ flex: 1 }}>
                        <div className="console-output-container">{consoleOutput || <span style={{ color: 'var(--text-dim)' }}>Готов к выполнению команд</span>}</div>
                        <form onSubmit={(e) => { e.preventDefault(); handleExec(commandInput); setCommandInput(''); }} className="console-input-line">
                          <span className="console-prompt">PS&gt;</span>
                          <input type="text" className="console-input" value={commandInput} onChange={(e) => setCommandInput(e.target.value)} placeholder="Введите команду..." disabled={isExecuting || !selectedAgent.online} />
                          <button type="submit" className="btn btn-primary" style={{ padding: '0.35rem 0.75rem' }} disabled={isExecuting || !commandInput || !selectedAgent.online}>▶</button>
                        </form>
                      </div>
                    </div>
                    
                    <div className="card" style={{ padding: '0.75rem', overflowY: 'auto' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', padding: '0.25rem 0.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Clock size={12} /> История
                      </div>
                      {commandHistory.map(item => (
                        <div key={item.id} className="history-item" onClick={() => { setSelectedHistoryItem(item); setConsoleOutput(item.output || ''); }}>
                          <div className="history-item-left">
                            <span className="history-command" title={item.command}>{item.command}</span>
                            <span className="history-time">{new Date(item.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="history-status">
                            {item.status === 'completed' && <CheckCircle size={13} className="status-completed" />}
                            {item.status === 'failed' && <AlertCircle size={13} className="status-failed" />}
                            {item.status === 'running' && <RefreshCw size={13} className="status-running spinner" />}
                          </div>
                        </div>
                      ))}
                      {commandHistory.length === 0 && (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>Пусто</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Files ── */}
                {activeTab === 'files' && (
                  <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div className="toolbar">
                      <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem' }} onClick={goUp} disabled={isLoadingFiles || !selectedAgent.online}>
                        <ChevronLeft size={15} />
                      </button>
                      <input 
                        type="text" className="input-field" style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '0.45rem 0.6rem' }}
                        value={currentPath} onChange={(e) => setCurrentPath(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter') loadDirectory(currentPath) }}
                        disabled={isLoadingFiles || !selectedAgent.online}
                      />
                      <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem' }} onClick={() => loadDirectory(currentPath)} disabled={isLoadingFiles || !selectedAgent.online}>
                        <RefreshCw size={14} className={isLoadingFiles ? 'spinner' : ''} />
                      </button>
                      <div className="toolbar-divider"></div>
                      <input type="file" id="upload-file" style={{ display: 'none' }} onChange={ulFile} />
                      <label htmlFor="upload-file" className="btn btn-primary" style={{ cursor: 'pointer', padding: '0.35rem 0.7rem' }}>
                        <Upload size={14} /> Загрузить
                      </label>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Имя</th>
                            <th style={{ width: '100px' }}>Размер</th>
                            <th style={{ width: '160px' }}>Изменен</th>
                            <th style={{ width: '90px', textAlign: 'right' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {files.map((f, i) => (
                            <tr key={i} style={{ cursor: f.isDir ? 'pointer' : 'default' }} onDoubleClick={() => openDir(f)}>
                              <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {f.isDir ? <Folder size={15} color="var(--accent)" /> : <FileIcon size={15} color="var(--text-dim)" />}
                                <span>{f.name}</span>
                              </td>
                              <td style={{ color: 'var(--text-muted)' }}>{f.isDir ? '—' : fmtBytes(f.size)}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{f.modTime}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                                  {!f.isDir && (
                                    <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => dlFile(f.name)} title="Скачать">
                                      <Download size={14} />
                                    </button>
                                  )}
                                  <button className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); delFile(f.name); }} title="Удалить">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {files.length === 0 && !isLoadingFiles && (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Папка пуста</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Screen Stream ── */}
                {activeTab === 'screen' && (
                  <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="toolbar" style={{ gap: '0.5rem' }}>
                      <button className={`btn ${streamActive ? 'btn-danger' : 'btn-primary'}`} onClick={toggleStream} disabled={!selectedAgent.online} style={{ padding: '0.4rem 0.85rem' }}>
                        {streamActive ? <><Pause size={14} /> Стоп</> : <><Play size={14} /> Старт</>}
                      </button>
                      
                      <select 
                        value={streamQuality} 
                        onChange={handleQualityChange}
                        disabled={!selectedAgent.online}
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', outline: 'none' }}
                      >
                        <option value="low">Низкое (Быстро)</option>
                        <option value="medium">Среднее (Баланс)</option>
                        <option value="high">Высокое (Четко)</option>
                      </select>
                      
                      <div className="toolbar-divider"></div>
                      
                      <button className={`btn ${enableMouseControl ? 'btn-toggle-on' : 'btn-secondary'}`} onClick={() => setEnableMouseControl(!enableMouseControl)} disabled={!streamActive} style={{ padding: '0.4rem 0.7rem' }}>
                        <MousePointer2 size={14} /> Мышь
                      </button>

                      <button className={`btn ${enableKeyboardControl ? 'btn-toggle-on' : 'btn-secondary'}`} onClick={() => setEnableKeyboardControl(!enableKeyboardControl)} disabled={!streamActive} style={{ padding: '0.4rem 0.7rem' }}>
                        <Keyboard size={14} /> Клавиатура
                      </button>
                      
                      <button className="btn btn-secondary" onClick={() => canvasRef.current?.requestFullscreen()} disabled={!streamActive} style={{ padding: '0.4rem 0.7rem' }}>
                        <Monitor size={14} /> Полный экран
                      </button>

                      {(enableMouseControl || enableKeyboardControl) && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <AlertCircle size={13} /> Ввод транслируется
                        </span>
                      )}
                    </div>

                    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}>
                      {!selectedAgent.online && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                          Агент offline
                        </div>
                      )}
                      {streamActive ? (
                        <canvas 
                          ref={canvasRef} 
                          style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: enableMouseControl ? 'crosshair' : 'default' }}
                          onMouseMove={(e) => handleMouse(e, 'move')}
                          onMouseDown={(e) => handleMouse(e, 'down')}
                          onMouseUp={(e) => handleMouse(e, 'up')}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                          tabIndex={enableKeyboardControl ? 0 : -1}
                          onKeyDown={handleKeyDown}
                          onKeyUp={handleKeyUp}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-dim)' }}>
                          <Monitor size={32} style={{ opacity: 0.3 }} /><span style={{ fontSize: '0.85rem' }}>Нажмите Старт</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          ) : activeTab === 'settings' ? (
            /* ── Settings ── */
            <div style={{ padding: '2rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Настройки</h2>
              
              <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                  <Lock size={15} color="var(--accent)" /> Смена пароля
                </h3>
                <form onSubmit={changePwd} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: '320px' }}>
                  <input type="password" placeholder="Текущий пароль" className="input-field" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                  <input type="password" placeholder="Новый пароль" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                  <button type="submit" className="btn btn-primary" style={{ marginTop: '0.25rem' }}>Сохранить</button>
                  {pwdMsg && <div style={{ fontSize: '0.8rem', color: pwdMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{pwdMsg}</div>}
                </form>
              </div>

              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  <Package size={15} color="var(--accent)" /> Сборка Агента
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Укажите параметры подключения для собираемого агента. Сервер скомпилирует уникальный <code>agent.exe</code> с этими настройками.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: '320px', marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '-0.4rem' }}>IP/Домен панели управления</label>
                  <input type="text" className="input-field" value={buildHost} onChange={e => setBuildHost(e.target.value)} placeholder="IP/Домен сервера (напр. 192.168.1.5:8000)" />
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '-0.4rem' }}>Секретный токен для агентов</label>
                  <input type="text" className="input-field" value={buildToken} onChange={e => setBuildToken(e.target.value)} placeholder="Токен агента" />
                </div>
                <button className="btn btn-primary" onClick={async () => {
                  try {
                    setIsBuilding(true);
                    const res = await fetchApi(`/api/download/agent?host=${encodeURIComponent(buildHost)}&token=${encodeURIComponent(buildToken)}`);
                    if (!res.ok) { const d = await res.json(); alert(d.error); setIsBuilding(false); return; }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'agent.exe'; a.click(); URL.revokeObjectURL(url);
                    setIsBuilding(false);
                  } catch (err) { alert('Ошибка: ' + err.message); setIsBuilding(false); }
                }} disabled={isBuilding}>
                  {isBuilding ? <RefreshCw size={14} className="spinner" /> : <Download size={14} />} 
                  {isBuilding ? 'Сборка...' : 'Скачать agent.exe'}
                </button>
              </div>
            </div>

          ) : (
            /* ── Empty State ── */
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              <Monitor size={48} color="var(--text-dim)" style={{ opacity: 0.3 }} />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Панель управления</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Выберите компьютер из списка</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  if (!token) return <Login setToken={setToken} />;
  return <Dashboard token={token} setToken={setToken} />;
}

