import puppeteer from 'puppeteer';
import fs from 'fs';
const openBrowser = false;
const closeBrowser = true;
const email = 'yonah.goldberg@icloud.com';
const password = 'Whirlp00l';
const stravaLogin = async (newPage) => {
    await newPage.goto('https://strava.com/login');
    await Promise.all([
        newPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 }),
        newPage.click('a[class="btn btn-block fb-button"]'),
    ]);
    await newPage.type('#email', email, { delay: 100 });
    await newPage.type('#pass', password, { delay: 100 });
    await Promise.all([
        newPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 }),
        newPage.click('#loginbutton'),
    ]);
};
const uploadRuns = async (page, runs) => {
    for (let i = 148; i < runs.length; i++) {
        const run = runs[i];
        await page.waitForSelector('a[href="/upload/manual"]'),
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 }),
                page.$eval('a[href="/upload/manual"]', (a) => a.click()),
            ]);
        if (run.distance === 0 || run.distance === null) {
            await page.type('#activity_distance', '0.01');
        }
        else {
            await page.type('#activity_distance', run.distance.toString());
        }
        await page.$eval('#distance-unit-dd div[class="selection"]', (elem, run) => elem.innerText = run.distanceUnit.toString().toLowerCase(), run);
        if (run.timeHours !== undefined) {
            await page.$eval('#activity_elapsed_time_hours', (elem, run) => elem.value = run.timeHours.toString(), run);
        }
        if (run.timeMinutes !== undefined) {
            await page.$eval('#activity_elapsed_time_minutes', (elem, run) => elem.value = run.timeMinutes.toString(), run);
        }
        if (run.timeSeconds !== undefined) {
            await page.$eval('#activity_elapsed_time_seconds', (elem, run) => elem.value = run.timeSeconds.toString(), run);
        }
        await page.$eval('#activity_start_date', (elem, month, day, year) => {
            elem.value = `${month}/${day}/${year}`;
        }, run.date.getMonth() + 1, run.date.getDate(), run.date.getFullYear());
        if (run.comments !== undefined) {
            await page.$eval('input[name="activity[description]"]', (elem, run) => elem.value = run.comments, run);
        }
        await page.type('#activity_name', 'Running2win Import');
        await page.$eval('#activity_name', (elem) => elem.value = 'Running2win Import');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 }),
            page.click('input[value="Create"]'),
        ]);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 }),
            page.goto('https://strava.com/dashboard'),
        ]);
        console.log(`Uploaded run ${i + 1}/${runs.length}`);
    }
};
const webscrape = async () => {
    const data = fs.readFileSync('webscrape-r2w.json');
    const runs = JSON.parse(data.toString()).map((run) => {
        let copy = run;
        copy.date = new Date(run.date);
        return copy;
    });
    const browser = await puppeteer.launch({ headless: !openBrowser });
    const page = await browser.newPage();
    await stravaLogin(page);
    await uploadRuns(page, runs);
    if (closeBrowser) {
        await browser.close();
    }
};
await webscrape();
