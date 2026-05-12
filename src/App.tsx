/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Activity, Play, Plus, Server, CheckCircle, XCircle, AlertTriangle, Settings, RefreshCw, Upload, FileJson, Download } from 'lucide-react';
import yaml from 'js-yaml';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

const DEFAULT_TARGETS = [
  { name: "GitHub", url: "https://github.com/", expect: "RAILWAY-FIVE" },
  { name: "GitHub Raw", url: "https://raw.githubusercontent.com/github/gitignore/main/Python.gitignore", expect: "DIRECT" },
  { name: "Steam 商店", url: "https://store.steampowered.com/favicon.ico", expect: "RAILWAY-FIVE" },
  { name: "Steam CDN", url: "https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe", expect: "DIRECT" },
  { name: "YouTube", url: "https://www.youtube.com/generate_204", expect: "Node-Select" }
];

const DEFAULT_PROXIES = [
  "RAILWAY-FIVE-AUTO",
  "sg-c055-tcp-41308",
  "backup-tramway"
];

function LatencyColor(ms: number) {
  if (ms < 0) return 'text-neutral-muted';
  if (ms < 260) return 'text-success font-black';
  if (ms < 450) return 'text-primary font-black';
  return 'text-danger font-black';
}

function LatencyBgColor(ms: number) {
  // Return the background color and text color class names combined
  if (ms < 0) return 'bg-white text-neutral-muted border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]';
  if (ms < 260) return 'bg-success text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]';
  if (ms < 450) return 'bg-primary text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]';
  return 'bg-danger text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]';
}

const API_ADDRESS = '/mihomo';

export default function App() {
  const [apiSecret, setApiSecret] = useState('');
  
  const [mihomoConfig, setMihomoConfig] = useState<any>(null);
  
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [proxies, setProxies] = useState(DEFAULT_PROXIES);
  
  const [targetResults, setTargetResults] = useState<any[]>([]);
  const [proxyResults, setProxyResults] = useState<any[]>([]);
  
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Connection check
  useEffect(() => {
    checkConnection();
  }, []);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (apiSecret) {
      headers.set('Authorization', `Bearer ${apiSecret}`);
    }
    return fetch(url, { ...options, headers });
  };

  const checkConnection = async () => {
    try {
      const res = await fetchWithAuth(`${API_ADDRESS}/configs`);
      if (res.ok) {
        const data = await res.json();
        setMihomoConfig(data);
      } else {
        setMihomoConfig(null);
      }
    } catch {
      setMihomoConfig(null);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = yaml.load(text) as any;
        
        // 1. Check if this is a Targets YAML
        if (parsed.targets && Array.isArray(parsed.targets)) {
           const validTargets = parsed.targets.filter((t: any) => t.name && t.url);
           if (validTargets.length > 0) {
              setTargets(validTargets.map((t: any) => ({
                 name: t.name,
                 url: t.url,
                 expect: t.expect || 'unknown'
              })));
              alert(`成功导入 ${validTargets.length} 个测速目标！`);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
           }
        }

        // 2. Otherwise assume it's a Mihomo Config
        if (parsed.proxies && Array.isArray(parsed.proxies)) {
           
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
                      delete newG.use;
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

              for (const key in doc) delete doc[key];
              Object.assign(doc, newDoc);
           };
           
           cleanMihomoConfig(parsed);

           const newProxies = parsed.proxies.map((p: any) => p.name);
           setProxies(newProxies);
           setProxyResults([]);

           const cleanedYaml = yaml.dump(parsed);

           // Upload config to backend to start Mihomo
           await fetch('/api/upload-yaml', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ yamlString: cleanedYaml })
           });

           // Re-check connection
           setTimeout(() => checkConnection(), 1500);
           
        } else {
           alert("YAML file does not contain a 'proxies' array.");
        }
      } catch (err) {
        console.error("YAML Parse Error:", err);
        alert("Failed to parse YAML file.");
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be uploaded again if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleStart = async () => {
    if (!mihomoConfig) {
      alert("⚠️ 后端 Mihomo 并未运行！请先拖拽上传一个 YAML 配置文件以启动沙盒代理节点。");
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setTargetResults([]);
    setProxyResults([]);
    
    // Test proxies latency (Parallel execution)
    const proxyPromises = proxies.map(async (p) => {
        try {
           const res = await fetchWithAuth(`${API_ADDRESS}/proxies/${encodeURIComponent(p)}/delay?url=http%3A%2F%2Fwww.gstatic.com%2Fgenerate_204&timeout=3000`);
           if (!res.ok) return { name: p, delay: -1 };
           const data = await res.json();
           return { name: p, delay: data.delay ?? -1 };
        } catch {
           return { name: p, delay: -1 };
        }
    });

    const newProxyResults = await Promise.all(proxyPromises);
    setProxyResults(newProxyResults);
    
    // Test rules and URLs directly
    const currentTargetResults: any[] = [];
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        
        let ruleBefore: any = null;
        let ruleAfter: any = null;
        let actualProxy = 'unknown';
        let statusCode = -1;
        let timeMs = -1;

        // 2. Perform the target request
        const targetUrl = new URL(target.url);
        targetUrl.searchParams.set('_t', Date.now().toString());

        try {
          const testRes = await fetch(`/api/test-target?url=${encodeURIComponent(targetUrl.toString())}`);
          const testData = await testRes.json();
          if (testData.ok) {
            statusCode = testData.status;
            timeMs = testData.timeMs;
            actualProxy = testData.matchedProxy || 'unknown';
          } else {
            statusCode = 0;
          }
        } catch(e: any) {
          console.error(`Target proxy failed for ${target.name}:`, e);
          statusCode = 0;
        }

        currentTargetResults.push({
          name: target.name,
          url: target.url,
          expect: target.expect,
          actual: actualProxy,
          status: statusCode,
          timeMs,
          ok: actualProxy === target.expect
        });
        
        setTargetResults([...currentTargetResults]);
        setProgress(((i + 1) / targets.length) * 100);
    }
    
    setIsRunning(false);
  };

  const okCount = targetResults.filter(r => r.ok).length;
  const avgTime = targetResults.length ? Math.floor(targetResults.reduce((a, b) => a + b.timeMs, 0) / targetResults.length) : 0;

  const handleExportJson = () => {
    const data = {
      timestamp: new Date().toISOString(),
      summary: {
         okCount,
         total: targets.length,
         avgTime
      },
      proxyResults,
      targetResults,
      mihomoConfig
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mihomo-audit-results-${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main 
      className="min-h-screen bg-primary flex flex-col items-center p-4 sm:p-12 font-sans relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-5xl space-y-6 bg-white border-[12px] border-black rounded-[2rem] p-6 md:p-12 shadow-2xl relative overflow-hidden">
          
          <header className="flex flex-col md:flex-row items-start md:items-center justify-between border-b-4 border-black pb-6 mb-6 gap-4">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-black text-primary">
                <Activity className="w-8 h-8" strokeWidth={3} />
              </div>
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tighter text-black uppercase italic">Mihomo Inspector</h1>
                <div className="flex items-center text-sm font-bold uppercase tracking-widest text-black mt-1 space-x-4">
                  <span className="flex items-center">
                    <Server className="w-4 h-4 mr-2" strokeWidth={3} />
                    内置沙盒
                  </span>
                  <span className="flex items-center border-l-2 border-black pl-4">
                    <span className={`w-3 h-3 mr-2 border-2 border-black ${mihomoConfig ? "bg-success" : "bg-danger"}`} />
                    {mihomoConfig ? `CONNECTED (${mihomoConfig.mode})` : 'DISCONNECTED'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center w-full md:w-auto gap-4">
               {targetResults.length > 0 && !isRunning && (
                  <Button 
                    onClick={handleExportJson} 
                    className="w-full md:w-auto uppercase font-black tracking-widest text-black bg-white hover:bg-gray-100 border-4 border-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] transition-all h-14 px-8 text-lg"
                  >
                   <Download className="w-5 h-5 mr-3" strokeWidth={3} />
                   EXPORT JSON
                  </Button>
               )}
               <Button 
                onClick={handleStart} 
                disabled={isRunning} 
                className="w-full md:w-auto uppercase font-black tracking-widest text-black bg-primary hover:bg-primary border-4 border-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] transition-all h-14 px-8 text-lg"
               >
                {isRunning ? <RefreshCw className="w-5 h-5 mr-3 animate-spin" strokeWidth={3} /> : <Play className="w-5 h-5 mr-3" strokeWidth={3} />}
                {isRunning ? 'TESTING...' : 'RUN TEST'}
              </Button>
            </div>
          </header>

          <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-4 border-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
                  <CardContent className="p-6 flex flex-col justify-center">
                    <p className="text-sm font-bold text-black uppercase tracking-[0.2em] mb-2">通过规则率</p>
                    <div className="text-5xl font-black tracking-tighter flex items-baseline">
                      <span className={okCount === targets.length && targetResults.length > 0 ? "text-success" : "text-black"}>
                        {targetResults.length ? `${okCount}/${targets.length}` : '-'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-4 border-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
                  <CardContent className="p-6 flex flex-col justify-center">
                    <p className="text-sm font-bold text-black uppercase tracking-[0.2em] mb-2">平均耗时</p>
                    <div className="text-5xl font-black tracking-tighter text-black">
                      {avgTime > 0 ? `${avgTime} MS` : '-'}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-4 border-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-primary">
                  <CardContent className="p-6 flex flex-col justify-center">
                    <p className="text-sm font-bold text-black uppercase tracking-[0.2em] mb-4">测试进度</p>
                    <div className="pt-0 border-2 border-black bg-white h-6 relative overflow-hidden flex items-center">
                        <div 
                          className="absolute left-0 top-0 bottom-0 bg-black transition-all duration-300"
                          style={{ width: `${progress}%` }} 
                        />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-4 border-black rounded-none shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-white overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between p-4 bg-black text-white border-b-4 border-black rounded-none m-0">
                  <CardTitle className="text-xl font-bold uppercase tracking-widest text-white m-0 leading-none">规则命中审计</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table className="w-full">
                      <TableHeader className="bg-primary border-b-4 border-black">
                        <TableRow className="border-none">
                          <TableHead className="w-[200px] text-black font-bold uppercase tracking-widest text-xs px-4 py-3">目标站点 / URL</TableHead>
                          <TableHead className="text-black font-bold uppercase tracking-widest text-xs px-4 py-3">期望分流</TableHead>
                          <TableHead className="text-black font-bold uppercase tracking-widest text-xs px-4 py-3">实际命中策略</TableHead>
                          <TableHead className="text-right text-black font-bold uppercase tracking-widest text-xs px-4 py-3">状态 / 耗时</TableHead>
                          <TableHead className="text-center w-[120px] text-black font-bold uppercase tracking-widest text-xs px-4 py-3">结果</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {targets.map((t, i) => {
                          const res = targetResults.find(r => r.url === t.url);
                          return (
                            <TableRow key={i} className="border-b-2 border-black last:border-b-0 hover:bg-neutral-100 transition-none">
                              <TableCell className="font-bold align-middle px-4 py-4">
                                <div className="text-black text-lg uppercase tracking-tight truncate max-w-[200px] block" title={t.url}>{t.name}</div>
                                <div className="text-xs text-black font-mono truncate max-w-[200px] mt-1 font-medium bg-primary inline-block px-1 border border-black">{t.url.replace('https://','')}</div>
                              </TableCell>
                              <TableCell className="align-middle px-4 py-4">
                                <div className="font-mono text-xs uppercase font-bold text-black border-2 border-black px-2 py-1 inline-block bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                  {t.expect}
                                </div>
                              </TableCell>
                              <TableCell className="align-middle px-4 py-4">
                                {res ? (
                                  <div className={`font-mono text-xs font-bold uppercase px-2 py-1 inline-block border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${res.actual === res.expect ? 'bg-success text-black' : 'bg-danger text-black'}`}>
                                    {res.actual || 'TIMEOUT/ERR'}
                                  </div>
                                ) : (
                                  <span className="text-xs font-black text-neutral-muted">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right align-middle px-4 py-4">
                                {res ? (
                                  <div className="flex flex-col items-end">
                                    <span className={`text-sm font-black uppercase tracking-widest ${res.status === 200 || res.status === 204 ? 'text-success' : 'text-danger'}`}>
                                      {res.status > 0 ? `HTTP ${res.status}` : 'FAILED'}
                                    </span>
                                    {res.timeMs > 0 && <span className={`text-sm font-mono mt-1 ${LatencyColor(res.timeMs)}`}>{res.timeMs} MS</span>}
                                  </div>
                                ) : (
                                  <span className="text-sm font-black text-neutral-muted">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center align-middle px-4 py-4">
                                {res ? (
                                  res.ok ? 
                                  <div className="w-8 h-8 rounded-full bg-success border-2 border-black flex items-center justify-center mx-auto shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                    <CheckCircle className="w-5 h-5 text-black" strokeWidth={3} /> 
                                  </div> : 
                                  <div className="w-8 h-8 rounded-full bg-danger border-2 border-black flex items-center justify-center mx-auto shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                    <AlertTriangle className="w-5 h-5 text-black" strokeWidth={3} />
                                  </div>
                                ) : (
                                  <span className="text-black font-black mx-auto block w-5 h-5">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="border-t-4 border-black pt-6 mt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <h3 className="text-2xl font-black text-black uppercase tracking-tight">关注节点连通性</h3>
                    <div className="font-bold text-xs uppercase tracking-widest bg-primary text-black border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      提供拖拽方式上传 YAML 测速目标
                    </div>
                  </div>
                  <div>
                    <input 
                      type="file" 
                      accept=".yml,.yaml" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()} 
                      className="bg-white text-black font-black uppercase tracking-widest border-2 border-black rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] transition-all px-4 py-2 h-auto"
                    >
                      <Upload className="w-5 h-5 mr-3" strokeWidth={3} />
                      导入测速节点 (YAML)
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-6">
                  {proxies.map(p => {
                    const res = proxyResults.find(pr => pr.name === p);
                    return (
                      <div key={p} className="flex flex-col bg-white border-4 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all group">
                        <div className="text-sm font-black text-black uppercase truncate pb-3 border-b-2 border-black mb-3" title={p}>{p}</div>
                        <div className="flex justify-between items-center mt-auto">
                           <span className="text-xs font-bold uppercase tracking-widest text-neutral-muted">LATENCY</span>
                           <div className={`font-mono text-sm font-bold px-2 py-0.5 ${res ? LatencyBgColor(res.delay) : "bg-white text-neutral-muted border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"}`}>
                            {res ? (res.delay > 0 ? `${res.delay} MS` : 'ERR') : '- MS'}
                           </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
          </div>
        </div>
      {/* Global Drag and Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/95 backdrop-blur-sm border-[12px] border-black m-4 transition-all duration-300 pointer-events-none">
          <div className="text-center p-16 bg-white border-8 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200">
            <div className="w-32 h-32 bg-black flex items-center justify-center mx-auto mb-8 shadow-[8px_8px_0px_0px_#FFD700]">
              <FileJson className="w-16 h-16 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-5xl font-black uppercase text-black mb-4 tracking-tighter">拖拽 YAML 文件到此</h2>
            <p className="text-black font-bold text-xl uppercase tracking-widest border-t-4 border-black pt-4 inline-block">支持 Mihomo 配置文件，或包含 targets 的目标配置</p>
          </div>
        </div>
      )}
    </main>
  );
}
