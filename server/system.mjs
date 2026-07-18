// Indicadores reais de sistema (Fase 4): CPU e RAM via módulo os do Node.
import os from "node:os";

let lastCpus = os.cpus();
let lastCpuPct = 0;

setInterval(() => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (let i = 0; i < cpus.length; i++) {
    const prev = lastCpus[i].times;
    const cur = cpus[i].times;
    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const curTotal = cur.user + cur.nice + cur.sys + cur.idle + cur.irq;
    total += curTotal - prevTotal;
    idle += cur.idle - prev.idle;
  }
  if (total > 0) lastCpuPct = Math.round((1 - idle / total) * 100);
  lastCpus = cpus;
}, 2000).unref();

export function systemStats() {
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  return {
    cpu: lastCpuPct,
    ram: Math.round((usedMem / totalMem) * 100),
    uptimeSeconds: Math.round(process.uptime()),
  };
}
