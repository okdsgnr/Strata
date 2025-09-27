const { spawn } = require('child_process');

// Kill any existing node processes on port 4000
function killExistingServer() {
  return new Promise((resolve) => {
    const lsof = spawn('lsof', ['-ti:4000']);
    lsof.stdout.on('data', (data) => {
      const pid = data.toString().trim();
      if (pid) {
        console.log(`Killing existing server on port 4000 (PID: ${pid})`);
        spawn('kill', [pid]);
      }
    });
    lsof.on('close', resolve);
  });
}

// Start server and wait for it to be ready
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('\nStarting server...');
    const server = spawn('node', ['server.js'], {
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe'
    });

    let output = '';
    server.stdout.on('data', (data) => {
      const line = data.toString();
      output += line;
      process.stdout.write(line);
      if (line.includes('Backend listening on :4000')) {
        resolve(server);
      }
    });

    server.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    server.on('error', reject);
    server.on('exit', (code) => {
      if (code !== null) {
        reject(new Error(`Server exited with code ${code}\nOutput: ${output}`));
      }
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      reject(new Error('Server failed to start within 5 seconds'));
    }, 5000);
  });
}

module.exports = { killExistingServer, startServer };