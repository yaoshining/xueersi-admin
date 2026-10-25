import https from 'node:https';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
const origin = new URL(process.env.NAS_ORIGIN);
const request = https.get(
  {
    hostname: '127.0.0.1',
    port: Number(process.env.PORT || 3000),
    path: '/api/v1/health',
    headers: { Host: origin.host },
    ca: readFileSync('/run/secrets/ca.crt'),
    checkServerIdentity: (_host, cert) =>
      tls.checkServerIdentity(origin.hostname, cert),
    timeout: 5000,
  },
  (response) => {
    response.resume();
    process.exitCode = response.statusCode === 200 ? 0 : 1;
  },
);
request.on('timeout', () => request.destroy());
request.on('error', () => {
  process.exitCode = 1;
});
