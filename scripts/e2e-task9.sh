#!/bin/bash
# Task 9 E2E v2 — with UI login baked in.
cd /home/z/my-project
bun run dev > /tmp/dev-final.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://localhost:3000/ && break; sleep 1; done
echo "server:$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)"

echo "== 0. login if needed =="
agent-browser open http://localhost:3000/ > /dev/null 2>&1
sleep 3
if agent-browser eval "document.querySelector('input[type=\"password\"]') ? 'login-form' : 'already-in'" 2>/dev/null | grep -q "login-form"; then
  echo "logging in via UI…"
  agent-browser click 'input[autocomplete="username"], form input' > /dev/null 2>&1
  agent-browser type 'input[autocomplete="username"], form input' "amit" > /dev/null 2>&1
  agent-browser click 'input[type="password"]' > /dev/null 2>&1
  agent-browser type 'input[type="password"]' "owner123" > /dev/null 2>&1
  agent-browser click 'button[type="submit"]' > /dev/null 2>&1 || agent-browser press Enter > /dev/null 2>&1
  sleep 3.5
fi
agent-browser eval "document.querySelector('input[type=\"password\"]') ? 'auth:FAIL' : 'auth:OK'"

echo "== 1. owner email dialog =="
agent-browser open http://localhost:3000/owners > /dev/null 2>&1
sleep 2.5
agent-browser click 'button[aria-label="Actions for Yash"]' 2>&1 | tail -1
sleep 1.2
MREF=$(agent-browser snapshot 2>/dev/null | grep -oE '"Monthly summary email" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
echo "menu-item-ref:$MREF"
if [ -n "$MREF" ]; then agent-browser click @$MREF > /dev/null 2>&1; fi
sleep 3
agent-browser eval "document.body.innerText.includes('Key numbers') ? 'dialog:OK' : 'dialog:FAIL'"
agent-browser eval "document.body.innerText.includes('Mark as sent') ? 'send-btn:OK' : 'send-btn:FAIL'"
agent-browser screenshot /tmp/f2-email-dialog.png > /dev/null 2>&1

echo "== 2. mark as sent =="
SREF=$(agent-browser snapshot 2>/dev/null | grep -oE '"Mark as sent" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
echo "send-ref:$SREF"
if [ -n "$SREF" ]; then agent-browser click @$SREF > /dev/null 2>&1; sleep 2; fi
agent-browser screenshot /tmp/f2-email-sent.png > /dev/null 2>&1
agent-browser eval "document.body.innerText.includes('Key numbers') ? 'dialog-still-open' : 'dialog-closed'"

echo "== 3. dashboard print =="
agent-browser press Escape > /dev/null 2>&1
sleep 0.6
agent-browser open http://localhost:3000/ > /dev/null 2>&1
sleep 3.5
agent-browser eval "document.querySelector('button[aria-label*=Print]') ? 'print-btn:OK' : 'print-btn:FAIL'"
agent-browser eval "document.querySelector('button[aria-label*=Print]')?.scrollIntoView({block:'center'})" > /dev/null 2>&1
sleep 0.5
agent-browser screenshot /tmp/f2-summary.png > /dev/null 2>&1
agent-browser pdf /tmp/f2-summary-print.pdf > /dev/null 2>&1
ls -la /tmp/f2-summary-print.pdf 2>/dev/null | awk '{print "pdf-bytes:"$5}'

echo "== 4. employee detail panels =="
agent-browser open http://localhost:3000/employees > /dev/null 2>&1
sleep 2.5
AREF=$(agent-browser snapshot 2>/dev/null | grep -oE 'Amit Verma \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
echo "employee-ref:$AREF"
if [ -n "$AREF" ]; then agent-browser click @$AREF > /dev/null 2>&1; sleep 2.5; fi
agent-browser eval "document.body.innerText.includes('Shift mix') && document.body.innerText.includes('Busiest weekdays') && document.body.innerText.includes('Top properties') ? 'panels:OK' : 'panels:FAIL'"
agent-browser eval "Array.from(document.querySelectorAll('p')).find(p=>p.textContent==='Shift mix · 30 days')?.closest('div')?.scrollIntoView({block:'center'})" > /dev/null 2>&1
sleep 0.5
agent-browser screenshot /tmp/f2-employee-panels.png > /dev/null 2>&1

echo "== 5. mobile 375 =="
agent-browser viewport 375 812 > /dev/null 2>&1
sleep 0.8
agent-browser open http://localhost:3000/ > /dev/null 2>&1
sleep 3.5
agent-browser eval "document.querySelector('button[aria-label*=Print]')?.scrollIntoView({block:'center'})" > /dev/null 2>&1
sleep 0.5
agent-browser screenshot /tmp/f2-mobile-summary.png > /dev/null 2>&1
agent-browser eval "Array.from(document.querySelectorAll('p')).find(p=>p.textContent==='Shift mix · 30 days')?.scrollIntoView({block:'center'})" > /dev/null 2>&1
sleep 0.5
agent-browser screenshot /tmp/f2-mobile-panels.png > /dev/null 2>&1
agent-browser viewport 1280 800 > /dev/null 2>&1

echo "== 6. console errors =="
agent-browser errors 2>&1 | head -8
echo "E2E-DONE"
