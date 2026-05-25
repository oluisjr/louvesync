const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Intercept console messages
  page.on('console', msg => {
    if(msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  
  // Wait for login screen and try to log in
  // Try to find a member in localStorage? No, we need to click a member on screen.
  // The login screen shows list of members. We click the first one and enter PIN '1234' (or just bypass).
  
  const html = await page.content();
  console.log('Got HTML, looking for login buttons...');
  
  const buttons = await page.$$('button');
  if(buttons.length > 0) {
     await buttons[0].click(); // click first user
     await page.waitForTimeout(500);
     
     // Type pin '0000'
     const pinInput = await page.$('input[type="password"], input');
     if(pinInput) {
        await pinInput.type('0000'); // Or we just do localStorage injection
     }
  }

  // A much easier way to bypass login is to set localStorage
  await page.evaluate(() => {
    localStorage.setItem('ls_profile', JSON.stringify({id: 'test', name: 'Test', role: 'Admin', is_admin: true}));
    localStorage.removeItem('ls_last_activity');
  });
  
  await page.reload({ waitUntil: 'networkidle0' });
  console.log('Logged in via localStorage. Waiting for App to render...');
  
  await page.waitForTimeout(2000);
  
  // Now we are in the app. Let's find a song to click.
  // The songs might be rendered if fetchSongs succeeds, or mocks.
  // Wait, mocks are not loaded if fetchSongs catches and sets MOCK_SONGS.
  
  const songElements = await page.$$('.sc, .bdg'); // Or something that has a song
  console.log('Found song elements:', songElements.length);
  
  if (songElements.length > 0) {
     console.log('Clicking a song...');
     await songElements[0].click();
     await page.waitForTimeout(2000);
     
     const bodyHtml = await page.evaluate(() => document.body.innerHTML);
     if (bodyHtml.includes('Ocorreu um erro ao renderizar esta tela.')) {
         console.log('CRASH CAUGHT BY ERROR BOUNDARY!');
         // The error message is inside <p>
         const errorText = await page.$eval('p', el => el.textContent);
         console.log('ERROR TEXT:', errorText);
     } else {
         console.log('No crash detected. App is running fine.');
     }
  } else {
     console.log('No songs found on screen. Try clicking Repertorio tab.');
     const tabs = await page.$$('button');
     // click Repertorio tab ...
  }

  await browser.close();
})();
