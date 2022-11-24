import puppeteer, { Page } from 'puppeteer';
import fs from 'fs';

const openBrowser = false;
const closeBrowser = true;
const username = "";
const password = "";

enum Distance {
    Miles, Meters, Yards, Kilometers,
}

interface Run {
    distanceUnit: Distance,
    distance: number,
    timeHours?: number,
    timeMinutes?: number,
    timeSeconds?: number,
    paceHours?: number,
    paceMinutes?: number,
    paceSeconds?: number,
    comments?: string,
    date: Date,
}

function zip<T1, T2, T3>(a: T1[], b: T2[], c: T3[]) { 
    return a.map((k, i) => [k, b[i], c[i]]);
}

const r2wLogin = async (newPage: Page) => {
    await newPage.goto('https://running2win.com');
    await newPage.screenshot({path: 'evidence/home.jpg', type: 'jpeg', fullPage: true});
    await newPage.waitForSelector('a[data-target="#loginPopover"]');
    await newPage.click('a[data-target="#loginPopover"]');
    await newPage.screenshot({path: 'evidence/login.jpg', type: 'jpeg', fullPage: true});
    await newPage.waitForTimeout(2000);
    await newPage.waitForSelector('input[name="txtUsername"]');
    await newPage.type('input[name="txtUsername"]', username, {delay: 100});
    await newPage.waitForSelector('input[name="txtPassword"]');
    await newPage.type('input[name="txtPassword"]', password, {delay:100});
    await newPage.click('input[name="btnLogin"]');
    await newPage.waitForSelector('.logout-button');
    await newPage.screenshot({path: 'evidence/logged-in.jpg', type: 'jpeg', fullPage: true})
};

const navigateToLog = async (page: Page) => {
    await page.click('a[class="dropdown-toggle"]');
    await page.click('a[href="/community/view-member-running-log.asp"]');
    await page.screenshot({path: 'evidence/log.jpg', type: 'jpeg', fullPage: true})
};

const parseRuns = (distanceText: string[], comments: string[], dates: string[]) => {
    const runs: Run[] = [];
    zip(distanceText, comments, dates).forEach(([text, comment, date]) => {
        const dateParts = date.split(' ')[1].split('/');
        const year = parseInt(dateParts[2]);
        const month = parseInt(dateParts[0]);
        const day = parseInt(dateParts[1]);
        const runDate = new Date(year, month - 1, day);
        
        const parts = text.split(' ');
        let distanceUnit: Distance;

        if (parts[1] === 'Miles') {
            distanceUnit = Distance.Miles;
        }
        else if (parts[1] === 'Kilometers') {
            distanceUnit = Distance.Kilometers;
        }
        else if (parts[1] === 'Yards') {
            distanceUnit = Distance.Yards;
        } 
        else {
            distanceUnit = Distance.Meters;
        }

        const distance = parseInt(parts[0]);
        const run: Run = {
            distanceUnit: distanceUnit,
            distance: distance,
            date: runDate,
        };

        if (parts.length > 2) {
            const time = parts[3];
            const timeParts = time.split(':');
            if (timeParts.length === 1) {
                run.timeSeconds = parseInt(timeParts[0]);
                run.timeMinutes = 0;
                run.timeHours = 0;
            }
            else if (timeParts.length === 2) {
                run.timeSeconds = parseInt(timeParts[1]);
                run.timeMinutes = parseInt(timeParts[0]);
                run.timeHours = 0;
            }
            else {
                run.timeHours = parseInt(timeParts[0]); 
                run.timeMinutes = parseInt(timeParts[1]); 
                run.timeSeconds = parseInt(timeParts[2]); 
            }

            const pace = parts[4].substring(1);
            const paceParts = pace.split(':');
            if (paceParts.length === 1) {
                run.paceSeconds = parseInt(paceParts[0]);
                run.paceMinutes = 0;
                run.paceHours = 0;
            }
            else if (paceParts.length === 2) {
                run.paceSeconds = parseInt(paceParts[1]);
                run.paceMinutes = parseInt(paceParts[0]);
                run.paceHours = 0;
            }
            else {
                run.paceHours = parseInt(paceParts[0]); 
                run.paceMinutes = parseInt(paceParts[1]); 
                run.paceSeconds = parseInt(paceParts[2]); 
            }
        }

        if (comment != '') {
            run.comments = comment;
        }

        runs.push(run);
    });
    return runs;
};

const scrapeLogs = async (page: Page) => {
    const runs: Run[] = [];
    page.exposeFunction('parseRuns', parseRuns);

    const numYears = await page.evaluate(() => {
        return document.querySelectorAll('select[name="dboYears"] option').length;
    }); 

    for (let year = 0; year < numYears; year++) {
        await page.waitForSelector('select[name="dboYears"] option');
        const option = await page.evaluate((year) => {
            return (document.querySelectorAll('select[name="dboYears"] option')[year] as HTMLOptionElement).value;
        }, year);
        await page.waitForSelector('#dboYears');
        await page.select('#dboYears', option);

        for (let month = 1; month < 13; month++) {
            await page.waitForSelector('select[name="dboMonths"] option');
            const option = await page.evaluate((month) => {
                return (document.querySelectorAll('select[name="dboMonths"] option')[month] as HTMLOptionElement).value;
            }, month);
            await page.waitForSelector('#dboMonths');
            await page.select('#dboMonths', option);
            await page.waitForSelector('input[name="btnViewMonth"]');
            
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0' }),
                page.click('input[name="btnViewMonth"]'),
            ]);


            const monthRuns = await page.evaluate(() => {
                const distanceText: string[] = [];
                const comments: string[] = [];
                const dates: string[] = [];

                document.querySelectorAll('table[class="encapsule"] tbody tr td table tbody tr td strong span').forEach((span) => {
                    distanceText.push((span as HTMLSpanElement).innerText);
                });

                document.querySelectorAll('table[class="encapsule"] tbody tr td table tbody tr td[colspan="2"]').forEach((td) => {
                    const text = (td as HTMLDataElement).innerText;
                    if (!(text === '--' || text === '- none -')) {
                        comments.push((td as HTMLDataElement).innerText);
                    }
                })

                document.querySelectorAll('table[class="encapsule"] tbody tr td table tbody tr td a').forEach((date) => {
                    const text = (date as HTMLAnchorElement).innerText;
                    if (text.includes('/')) {
                        dates.push(text);
                    }
                });

                return parseRuns(distanceText, comments, dates);
            });

            runs.push(...monthRuns);
        }
    }

    return runs;
}

const webscrape = async () => {
    const browser = await puppeteer.launch({headless: !openBrowser});
    const page = await browser.newPage();
    await r2wLogin(page);
    await navigateToLog(page);
    const runs = await scrapeLogs(page);
    const data = JSON.stringify(runs);

    fs.writeFile('result.json', data, (err) => {
        if (err) {
            throw err;
        }
    });

    if (closeBrowser) {
        await browser.close();
    }
};

await webscrape();
