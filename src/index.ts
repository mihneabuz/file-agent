import express from 'express';
import bodyParser from 'body-parser';
import readline from 'readline';
import fs from 'fs';
import { exit } from 'process';
import http from 'http';
import psList from 'ps-list';
import fuzzyFinder from 'fuzzy-finder';
import { base64decode } from 'nodejs-base64';

const config = JSON.parse(fs.readFileSync('./config.json').toString());
config.address = config.address ? config.address : require("ip").address();
console.log(config);

async function main() {
  const server = express();
  server.use(bodyParser.json());

  // CHECK IF BACKEND
  server.use((req, res, next) => {
    if (req.socket.remoteAddress !== config.serverAddress && req.socket.remoteAddress !== config.address) {
      res.send("leave...");
      return;
    }
    next();
  });

  ////////////////////////////////// ROUTES ///////////////////////////////////
  server.get('/running', (_, res) => {
    res.send('Server is running!');
  });

      ////  LIST  ////
  server.post('/files', (req, res) => {
    const path = req.body.path;

    if (path != '' && !path) {
      res.send(resultBad("bad request"));
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

    res.send(processed);
    return;
  })

      ////  CONTENT  ////
  server.post('/files/content', (req, res) => {
    const path = req.body.path;
     
    if (path != '' && !path) {
      res.send(resultBad("bad request"));
      return;
    }

    const fullPath = config.root + (path ? ('/' + path) : '');
    const content = fs.readFileSync(fullPath);

    res.send(content);
    return;
  });

      ////  CREATE  ////
  server.post('/files/create', (req, res) => {
    const name = req.body.path;
    const type = req.body.type;

    if (!name || !type) {
        res.send(resultBad("bad request"));
        return;
    }

    const fullPath = config.root + '/' + name;
    
    if (type == "dir") {
      let err = null;
      try {
        fs.mkdirSync(fullPath);
      } catch (error) {
        err = error;
      }

      if (err !== null) {
        res.send(resultBad("dir already exists"));
        return;
      }

    } else if (type == "file") {
      const content = req.body.content;
      const handle = fs.openSync(fullPath, 'w');

      if (content) {
        fs.writeFileSync(handle, content);
        fs.closeSync(handle);
      } else {
        fs.closeSync(handle);
      }

    } else {
      res.send(resultBad("bad request: bad file type"));
      return;
    }

    res.send(resultGood);
    return;
  });

      ////  DELETE  ////
  server.post('/files/delete', (req, res) =>{
    const name = req.body.path;
   
    if (!name) {
      res.send(resultBad("bad request"));
      return;
    }

    const fullPath = config.root + '/' + name;
    fs.rmSync(fullPath, { recursive: true, force: true });

    res.send(resultGood);
    return;
  });

      ////  SEARCH  ////
  server.post('/files/search', (req, res) => {
    const pattern = req.body.pattern;

    if (!pattern) {
      res.send(resultBad("bad request"));
      return;
    }

    const files = walk(config.root)
      .filter((file) => file.startsWith(config.root))
      .map((file) => file.substring(config.root.length + 1));

    const matched = fuzzyFinder(pattern, files);
    res.send(matched.map((match: any) => {
      return {
        name: match.match,
        type: "file"
      }
    }));
    return;
  })

      ////  UPLOAD  ////
  server.post('/files/upload', (req, res) => {
    const path = req.body.path;
    const base64file = req.body.base64file;
   
    if (!path || !base64file) {
      res.send(resultBad("bad request"));
      return;
    }

    const fullPath = config.root + (path ? ('/' + path) : '');
    const handle = fs.openSync(fullPath, 'w');

    if (handle) {
      const content = base64decode(base64file);
      fs.writeFileSync(handle, content);
      res.send(resultGood);
    } else {
      res.send(resultBad("cannot create file"));
    }
    return;
    
  });

      ////  DOWNLOAD  ////
  server.post('/files/download', (req, res) => {
    const path = req.body.path;
   
    if (!path) {
      res.send(resultBad("bad request"));
      return;
    }

    const fullPath = config.root + (path ? ('/' + path) : '');
    const content = fs.readFileSync(fullPath);

    if (content) {
      const base64file = content.toString('base64');
      res.send(base64file);
    } else {
      res.send(resultBad("empty file"));
    }
    return;

  });

      ////  PROCS  ////
  server.post('/procs', async (req, res) => {
    const orderBy = req.body.orderBy;
    const count = req.body.count ? req.body.count : 50;
    const procs = (await psList()).map((proc) => {
      return {
        'name': proc.cmd !== undefined ? proc.cmd.slice(0, 36) + (proc.cmd.length > 36 ? "..." : "") : "(null)",
        'pid': proc.pid,
        'cpu': proc.cpu,
        'mem': proc.memory
      };
    });

    if (orderBy === 'cpu') {
      res.send(procs.sort((a: any, b: any) => b.cpu - a.cpu).slice(0, count));
    } else if (orderBy === 'mem') {
      res.send(procs.sort((a: any, b: any) => b.mem - a.mem).slice(0, count));
    } else {
      res.send(procs.slice(0, count));
    }
    return;
  });

  server.listen(config.port, config.address, () => {
    console.log(`Server started on port ${config.port}`);
  })


  ////////////////////////////////// CONNECT ///////////////////////////////////
  const body: any = {
    'ip': config.address,
    'port': config.port,
    'root': config.root,
    'name': config.name,
  }

  if (config.accessToken) {
    body.token = config.accessToken;
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
    'ip': config.address,
    'port': config.port,
  }

  disconnect.write(JSON.stringify(body));
  disconnect.end();
})

var walk = function(dir: string) {
    var results: string[] = [];
    var list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        var stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            results.push(file);
        }
    });
    return results;
}

setInterval(() => {
  const disconnect = http.request({
    hostname: config.serverAddress,
    port: config.serverPort,
    method: 'POST',
    path: '/agent/heartbeat',
    headers: {
      'Content-Type': 'application/json'
    }
  }, () => {
    console.log("heartbeat");
  });

  disconnect.on('error', err => {
    console.warn(err);
  })

  const body = {
    'ip': config.address,
    'port': config.port,
  }

  disconnect.write(JSON.stringify(body));
  disconnect.end();
}, 10000);

const resultGood = {
  success: true,
  message: "OK"
};

const resultBad = (message: string) => {
  return {
    success: false,
    message: message
  }
};
