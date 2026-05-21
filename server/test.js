const {exec} = require('child_process'); 
exec('go build -ldflags "-s -w -H=windowsgui -X main.ServerHost=localhost:8000 -X main.Token=secure-company-token-123" -o agent.exe .', {cwd: 'c:/Users/gus31/source/repos/Project10/agent'}, (err, stdout, stderr) => { 
  console.log('Err:', err); 
  console.log('Stderr:', stderr); 
});
