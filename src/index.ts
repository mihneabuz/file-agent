import express from 'express';
import bodyParser from 'body-parser';
import readline from 'readline';
import fs from 'fs';
import { exit } from 'process';
import http from 'http'

const config = JSON.parse(fs.readFileSync('./config.json').toString());
console.log(config);

async function main() {
  const server = express();
  server.use(bodyParser.json());

  ////////////////////////////////// ROUTES ///////////////////////////////////
  server.get('/running', (_, res) => {
    res.send('Server is running!');
  });

  server.get('/files', (req, res) => {
    const path = req.body.path;

    if (path != '' && !path) {
      res.send("Bad req");
      return;
    }

    const fullPath = config.root + (path ? ('/' + path) : '');
    const files = fs.readdirSync(fullPath, { withFileTypes: true });

    const processed = files.map((dirent) => {
      let type: "file" | "dir" | "other";

      if (dirent.isFile())
        type = "file";
      else if (dirent.isDirectory())
        type = "dir";
      else
        type = "other";

      return { "name": dirent.name, "type": type}
    })

    console.log(processed);
    res.send(processed);
    return;
  })
  server.listen(config.port, () => {
    console.log(`Server started on port ${config.port}`);
  })

  server.post('/files/create', (req: any, res: any) => {
    const name = req.body.path;
    const type = req.body.type;

    if (!name || !type) {
      res.send("Bad request");
      return;
    }
  });

  ////////////////////////////////// CONNECT ///////////////////////////////////
  const body = {
    'ip': require("ip").address(),
    'port': config.port,
    'root': config.root
  }

  const connect = http.request({
    hostname: config.serverAddress,
    port: config.serverPort,
    method: 'POST',
    path: '/agent/connect',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  connect.on('error', err => {
    console.warn(err);
  })

  connect.write(JSON.stringify(body));
  connect.end();
}

main().catch((reason) => {
  console.error(reason);
})

const input = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

input.question(`Press enter to exit\n`, _ => {
  const disconnect = http.request({
    hostname: config.serverAddress,
    port: config.serverPort,
    method: 'POST',
    path: '/agent/disconnect',
    headers: {
      'Content-Type': 'application/json'
    }
  }, () => {
    input.close();
    exit(0);
  });

  disconnect.on('error', err => {
    console.warn(err);
  })

  const body = {
    'ip': require("ip").address(),
    'port': config.port,
  }

  disconnect.write(JSON.stringify(body));
  disconnect.end();
})
