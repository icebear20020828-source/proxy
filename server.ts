import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import https from "https";
import { spawn } from "child_process";
import { createProxyMiddleware } from "http-proxy-middleware";
import yaml from "js-yaml";
import axios from "axios";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

const binDir = path.join(process.cwd(), 'bin');
const mihomoPath = path.join(binDir, 'mihomo');
let mihomoProcess: any = null;

async function downloadMihomo() {
  if (fs.existsSync(mihomoPath)) return;
  console.log('Downloading Mihomo...');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir);
  
  const url = 'https://github.com/MetaCubeX/mihomo/releases/download/v1.18.3/mihomo-linux-amd64-v1.18.3.gz';
  
  return new Promise<void>((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location!, (res2) => {
          const dest = fs.createWriteStream(mihomoPath);
          res2.pipe(zlib.createGunzip()).pipe(dest);
          dest.on('finish', () => {
            fs.chmodSync(mihomoPath, 0o755);
            resolve();
          });
        }).on('error', reject);
      } else {
        const dest = fs.createWriteStream(mihomoPath);
        res.pipe(zlib.createGunzip()).pipe(dest);
        dest.on('finish', () => {
          fs.chmodSync(mihomoPath, 0o755);
          resolve();
        });
      }
    }).on('error', reject);
  });
}

function startMihomo() {
  const doStart = () => {
    try {
      const { execSync } = require('child_process');
      const ps = execSync('ps -ef').toString();
      ps.split('\n').forEach((line: string) => {
        if (line.includes('mihomo') && !line.includes('node') && !line.includes('tsx')) {
          const pid = line.trim().split(/\s+/)[1];
          if (pid) {
            try { process.kill(parseInt(pid, 10), 'SIGKILL'); } catch(e) {}
          }
        }
      });
    } catch(e) {}

    if (!fs.existsSync('config.yaml')) {

      fs.writeFileSync('config.yaml', `
external-controller: 127.0.0.1:9090
external-controller-cors:
  allow-origins: ['*']
proxies: []
`);
    }

    try {
      const configTxt = fs.readFileSync('config.yaml', 'utf8');
      const doc = yaml.load(configTxt) as any || {};
      
      let changed = false;

      const cleanMihomoConfig = (doc: any) => {
        const newDoc: any = {
           'external-controller': '127.0.0.1:9090',
           'external-controller-cors': { 'allow-origins': ['*'] },
           'mixed-port': 7890,
           'mode': 'rule',
           'log-level': 'info',
           'allow-lan': true,
           'proxies': [],
           'proxy-groups': [],
           'rules': ['MATCH,DIRECT']
        };

        if (doc.proxies && Array.isArray(doc.proxies)) {
            newDoc.proxies = doc.proxies.filter((p: any) => p && p.type && p.type !== 'anytls');
        }

        if (doc['proxy-groups'] && Array.isArray(doc['proxy-groups'])) {
            const validNames = new Set(newDoc.proxies.map((p: any) => p.name));
            newDoc['proxy-groups'] = doc['proxy-groups'].map((g: any) => {
                const newG = { ...g };
                delete newG.use; // remove proxy-providers dependencies
                if (newG.proxies && Array.isArray(newG.proxies)) {
                    newG.proxies = newG.proxies.filter((name: string) => 
                        validNames.has(name) || 
                        ['DIRECT', 'REJECT', 'COMPATIBLE', 'PASS'].includes(name) ||
                        doc['proxy-groups'].some((pg: any) => pg.name === name)
                    );
                } else {
                    newG.proxies = ['DIRECT'];
                }
                return newG;
            });
        }

        if (doc.rules && Array.isArray(doc.rules)) {
            newDoc.rules = doc.rules.filter((rule: string) => {
                if (typeof rule !== 'string') return true;
                const parts = rule.split(',').map(s => s.trim());
                if (parts[0] === 'RULE-SET' || parts[0] === 'GEOIP' || parts[0] === 'GEOSITE') return false;
                return true;
            });
            if (!newDoc.rules.some((r: string) => typeof r === 'string' && r.startsWith('MATCH,'))) {
                newDoc.rules.push('MATCH,DIRECT');
            }
        }

        // Wipe the old doc and replace with strict sandbox config
        for (const key in doc) delete doc[key];
        Object.assign(doc, newDoc);
        return true;
      };

      changed = cleanMihomoConfig(doc);
      
      if (changed) {
        fs.writeFileSync('config.yaml', yaml.dump(doc));
      }
    } catch(e) {}

    console.log('Starting Mihomo...');
    mihomoProcess = spawn(mihomoPath, ['-d', '.', '-f', 'config.yaml'], { stdio: 'pipe' });
    
    if (mihomoProcess.stdout) {
      mihomoProcess.stdout.on('data', (data: any) => {
        process.stdout.write(data);
        const lines = data.toString().split('\n').filter((l: string) => l);
        lines.forEach((line: string) => {
           globalMihomoLogs.push(line);
           if (globalMihomoLogs.length > 500) globalMihomoLogs.shift();
        });
      });
    }
    if (mihomoProcess.stderr) {
      mihomoProcess.stderr.on('data', (data: any) => {
        process.stderr.write(data);
      });
    }

    if (!(global as any).cleanupAttached) {
       (global as any).cleanupAttached = true;
       const cleanup = () => {
         if (mihomoProcess) {
           try { mihomoProcess.kill('SIGKILL'); } catch(e) {}
         }
       };
       process.on('exit', cleanup);
       process.on('SIGINT', () => { cleanup(); process.exit(); });
       process.on('SIGTERM', () => { cleanup(); process.exit(); });
    }
  };

  if (mihomoProcess) {
    console.log('Killing old Mihomo process...');
    mihomoProcess.once('exit', doStart);
    mihomoProcess.kill('SIGTERM');
  } else {
    doStart();
  }
}

const globalMihomoLogs: string[] = [];

async function startServer() {
  await downloadMihomo();
  startMihomo();

  // JSON Body parser for API
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/test-target', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) return res.status(400).json({ error: 'url required' });

      let mixedPort = 7890;
      try {
        const configTxt = fs.readFileSync('config.yaml', 'utf8');
        const doc = yaml.load(configTxt) as any || {};
        if (doc['mixed-port']) mixedPort = doc['mixed-port'];
        else if (doc['port']) mixedPort = doc['port'];
      } catch(e) {}

      const proxyUrl = `http://127.0.0.1:${mixedPort}`;
      const httpAgent = new HttpProxyAgent(proxyUrl);
      const httpsAgent = new HttpsProxyAgent(proxyUrl);

      const targetHost = new URL(targetUrl).hostname;
      const initialLogCount = globalMihomoLogs.length;

      const startTime = Date.now();
      
      const axRes = await axios.get(targetUrl, {
        httpAgent,
        httpsAgent,
        proxy: false, // Turn off axios default proxy so it uses our agent
        timeout: 5000,
        validateStatus: () => true, // Allow any status code without throwing
        headers: { 'Connection': 'close' } // Ensure connection closes quickly to trigger proxy logging
      });

      const timeMs = Date.now() - startTime;
      
      // Wait a tiny bit for logs to flush
      await new Promise(r => setTimeout(r, 100));

      let matchedProxy = 'unknown';
      let matchedRule = 'unknown';
      for (let i = initialLogCount; i < globalMihomoLogs.length; i++) {
        const line = globalMihomoLogs[i];
        if (line.includes(`--> ${targetHost}`) && line.includes('match')) {
           const matchUsing = line.match(/using (.*)"/);
           if (matchUsing) { // e.g. using RAILWAY-FIVE
              matchedProxy = matchUsing[1].replace(/"/g, '').trim();
           }
           const matchRule = line.match(/match (.*) using/);
           if (matchRule) {
              matchedRule = matchRule[1].trim();
           }
        }
      }

      res.json({
        ok: true,
        status: axRes.status,
        timeMs,
        matchedProxy,
        matchedRule
      });
    } catch (e: any) {
      res.json({
        ok: false,
        status: 0,
        timeMs: -1,
        error: e.message
      });
    }
  });

  // Endpoint to upload config and restart mihomo
  app.post('/api/upload-yaml', (req, res) => {
    try {
      const { yamlString } = req.body;
      if (!yamlString) {
        return res.status(400).json({ error: 'No yaml payload' });
      }
      fs.writeFileSync('config.yaml', yamlString);
      
      const prevProcess = mihomoProcess;
      startMihomo();
      
      const checkReady = () => {
         // Wait for new process to be bound
         setTimeout(async () => {
            try {
               await axios.get('http://127.0.0.1:9090', { timeout: 1000 });
               res.json({ success: true });
            } catch(e: any) {
               if (e.code === 'ECONNREFUSED') {
                  checkReady(); // keep polling
               } else {
                  // Usually 400 or 401 or 404 from Mihomo is fine, it means HTTP server is up
                  res.json({ success: true });
               }
            }
         }, 500);
      };
      checkReady();

    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy requests that start with /mihomo to the actual Mihomo instance
  app.use('/mihomo', createProxyMiddleware({ 
    target: 'http://127.0.0.1:9090', 
    changeOrigin: true,
    pathRewrite: {
      '^/mihomo': '', // strip /mihomo from the URL
    },
    // Prevent the node server proxy from crashing if Mihomo isn't up
    on: {
       error: (err: any, req: any, res: any) => {
         if (res && !res.headersSent) {
           res.writeHead(502, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ error: err.message, status: 'mihomo_not_ready' }));
         }
       }
    }
  }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();