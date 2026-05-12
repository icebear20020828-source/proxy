import https from 'https';
import fs from 'fs';
import zlib from 'zlib';

const mihomoPath = 'mihomo';

const url = 'https://github.com/MetaCubeX/mihomo/releases/download/v1.18.3/mihomo-linux-amd64-v1.18.3.gz';

https.get(url, (res) => {
  if (res.statusCode === 301 || res.statusCode === 302) {
    https.get(res.headers.location!, (res2) => {
      const dest = fs.createWriteStream(mihomoPath);
      res2.pipe(zlib.createGunzip()).pipe(dest);
      dest.on('finish', () => {
        fs.chmodSync(mihomoPath, 0o755);
        console.log('done via redirect');
      });
    });
  } else {
    console.log('no redirect', res.statusCode);
  }
});
