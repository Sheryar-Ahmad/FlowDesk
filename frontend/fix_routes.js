const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');
c = c.replace('const AIAssistant = lazy', "const FocusTimer = lazy(() => import('./pages/timer/FocusTimer'))\nconst AIAssistant = lazy");
c = c.replace('path="/ai" element={<AIAssistant />} />', 'path="/timer" element={<FocusTimer />} />\n          <Route path="/ai" element={<AIAssistant />} />');
fs.writeFileSync('src/App.tsx', c);
console.log('Done!');
