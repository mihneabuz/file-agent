import express from 'express';
import bodyParser from 'body-parser';
import readline from 'readline';
import fs from 'fs';
import { exit } from 'process';
import http from 'http';
const fuzzyFinder = require('fuzzy-finder');

const config = JSON.parse(fs.readFileSync('./config.json').toString());
console.log(config);

async function main() {
  const server = express();
  server.use(bodyParser.json());

  ////////////////////////////////// ROUTES ///////////////////////////////////
  server.get('/running', (_, res) => {
    res.send('Server is running!');
  });

  server.post('/files', (req, res) => {
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

  server.post('/files/create', (req, res) => {
    const name = req.body.path;
    const type = req.body.type;

    if (!name || !type) {
      res.send("Bad request");
      return;
    }

    const fullPath = config.root + '/' + name;
    
    let error = null;
    if (type == "dir") {
      fs.mkdir(fullPath, err => {
        error = err; 
      });
    } else if (type == "file") {
      const content = req.body.content;
      const handle = fs.openSync(fullPath, 'w');

      if (content) {
        fs.writeFile(handle, content, err => {
          error = err; 
        });
      }

      fs.closeSync(handle);
    } else {
      res.send("Bad file type ");
      return;
    }

    if (error == null) {
      res.send("Done!");
      return;
    }
  });

  server.post('/files/delete', (req, res) =>{
    const name = req.body.path;
   
    if (!name) {
      res.send("Bad request");
      return;
    }

    const fullPath = config.root + '/' + name;

    fs.rm(fullPath, { recursive: true, force: true }, () => {
    });

    res.send("Done!")
    return;
  });

  server.post('/files/search', (req, res) => {
    const pattern = req.body.pattern;

    if (!pattern) {
      res.send("Bad request");
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

var walk = function(dir: string) {
    var results: string[] = [];
    var list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        var stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            /* Recurse into a subdirectory */
            results = results.concat(walk(file));
        } else { 
            /* Is a file */
            results.push(file);
        }
    });
    return results;
}
