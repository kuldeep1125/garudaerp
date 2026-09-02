#!/bin/bash
# Task 10 bundled E2E — i18n toggle, WhatsApp share, dark-mode re-check.
cd /home/z/my-project
bun run dev > /tmp/dev-final.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://localhost:3000/ && break; sleep 1; done
echo "server:$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)"

echo "== 0. ensure app + light + EN =="
agent-browser open http://localhost:3000/ > /dev/null 2>&1
sleep 3
agent-browser eval "document.querySelector('input[type=\"password\"]') ? 'login-form' : 'in-app'" 2>/dev/null
agent-browser eval "localStorage.setItem('bizhub-lang','en'); localStorage.setItem('theme','light'); 'reset'" > /dev/null 2>&1

echo "== 1. switch to Hindi via TopBar dropdown =="
LREF=$(agent-browser snapshot 2>/dev/null | grep -oE 'button "Language" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
echo "lang-btn:$LREF"
agent-browser click @$LREF > /dev/null 2>&1
sleep 0.8
HREF=$(agent-browser snapshot 2>/dev/null | grep -oE 'menuitemradio "हिन्दी" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
echo "hi-item:$HREF"
agent-browser click @$HREF > /dev/null 2>&1
sleep 1.2
agent-browser eval "document.body.innerText.includes('मैनपावर व्यवसाय') && document.body.innerText.includes('परिवहन व्यवसाय') ? 'sidebar-hi:OK' : 'sidebar-hi:FAIL'" 2>/dev/null
agent-browser eval "document.body.innerText.includes('खोजें') ? 'search-hi:OK' : 'search-hi:FAIL'" 2>/dev/null
agent-browser screenshot /tmp/g1-hindi-shell.png > /dev/null 2>&1

echo "== 2. dashboard titles in Hindi =="
DREF=$(agent-browser snapshot 2>/dev/null | grep -oE 'button "डैशबोर्ड" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
echo "dash-hi-ref:$DREF"
agent-browser click @$DREF > /dev/null 2>&1
sleep 3
agent-browser eval "document.body.innerText.includes('मासिक व्यावसायिक सारांश') ? 'summary-hi:OK' : 'summary-hi:FAIL'" 2>/dev/null
agent-browser eval "document.body.innerText.includes('14-दिन का प्रदर्शन') ? 'trend-hi:OK' : 'trend-hi:FAIL'" 2>/dev/null
agent-browser eval "document.querySelector('button[aria-label*=Print]')?.scrollIntoView({block:'center'})" > /dev/null 2>&1
sleep 0.5
agent-browser screenshot /tmp/g2-hindi-dashboard.png > /dev/null 2>&1

echo "== 3. dark mode + email dialog + WhatsApp =="
agent-browser eval "document.querySelectorAll('button[aria-label*=light],button[aria-label*=dark]')[0]?.click(); 'toggled'" > /dev/null 2>&1
sleep 1
agent-browser eval "document.documentElement.classList.contains('dark') ? 'dark:OK' : 'dark:FAIL'" 2>/dev/null
OREF=$(agent-browser snapshot 2>/dev/null | grep -oE 'button "मालिक" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
agent-browser click @$OREF > /dev/null 2>&1
sleep 2.5
agent-browser click 'button[aria-label="Actions for Saurabh"]' > /dev/null 2>&1
sleep 1.2
MREF=$(agent-browser snapshot 2>/dev/null | grep -oE '"Monthly summary email" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
agent-browser click @$MREF > /dev/null 2>&1
sleep 4.5
agent-browser eval "document.body.innerText.includes('WhatsApp') ? 'wa-btn:OK' : 'wa-btn:FAIL'" 2>/dev/null
agent-browser eval "document.querySelector('a[aria-label*=WhatsApp]')?.href.slice(0,40)" 2>/dev/null
agent-browser eval "document.querySelector('[role=dialog]')?.scrollIntoView({block:'start'})" > /dev/null 2>&1
sleep 0.4
agent-browser screenshot /tmp/g3-dark-dialog-wa.png > /dev/null 2>&1
agent-browser press Escape > /dev/null 2>&1

echo "== 4. employee panels dark =="
EREF=$(agent-browser snapshot 2>/dev/null | grep -oE 'button "कर्मचारी" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
agent-browser click @$EREF > /dev/null 2>&1
sleep 2.5
AREF=$(agent-browser snapshot 2>/dev/null | grep -oE 'cell "Amit Verma [^"]*" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'ref=[a-z0-9]+' | cut -d= -f2)
agent-browser click @$AREF > /dev/null 2>&1
sleep 3
agent-browser eval "Array.from(document.querySelectorAll('p')).find(p=>p.textContent==='Shift mix · 30 days')?.closest('div')?.scrollIntoView({block:'center'})" > /dev/null 2>&1
sleep 0.5
agent-browser screenshot /tmp/g4-dark-panels.png > /dev/null 2>&1

echo "== 5. restore light + EN =="
agent-browser eval "document.querySelectorAll('button[aria-label*=light],button[aria-label*=dark]')[0]?.click(); 'toggled'" > /dev/null 2>&1
agent-browser eval "localStorage.setItem('bizhub-lang','en'); 'lang-en'" > /dev/null 2>&1
agent-browser open http://localhost:3000/ > /dev/null 2>&1
sleep 2

echo "== 6. mobile 375 Hindi shell =="
agent-browser set viewport 375 812 > /dev/null 2>&1
agent-browser eval "localStorage.setItem('bizhub-lang','hi'); 'hi'" > /dev/null 2>&1
agent-browser open http://localhost:3000/ > /dev/null 2>&1
sleep 3.5
agent-browser screenshot /tmp/g5-mobile-hindi.png > /dev/null 2>&1
agent-browser set viewport 1280 800 > /dev/null 2>&1
agent-browser eval "localStorage.setItem('bizhub-lang','en'); 'en'" > /dev/null 2>&1

echo "== 7. console errors =="
agent-browser errors 2>&1 | head -6
echo "E2E-DONE"
