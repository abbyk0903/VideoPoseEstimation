const { exec } = require('child_process');

exec('taskkill /F /IM node.exe', (error, stdout, stderr) => {
  if (error) {
    console.log('Error killing node processes:', error.message);
  } else {
    console.log('Killed node processes');
    console.log(stdout);
  }
});
